const { test, expect } = require('@playwright/test');

// A controllable SoundCloud widget API: READY/PLAY are fired explicitly by
// each test so pending-playback timing stays deterministic.
async function mockSoundCloud(page, { position = 0 } = {}) {
  await page.addInitScript(position => {
    window.__soundCloudCalls = [];
    const Widget = element => {
      const handlers = {};
      const player = {
        bind: (event, handler) => { handlers[event] = handler; },
        getDuration: callback => callback(60_000),
        // Tests can hold the position response by setting
        // window.__deferPositions; resolve it via __deferredPositions.
        getPosition: callback => {
          if (window.__deferPositions) {
            (window.__deferredPositions ??= {})[element.id] = callback;
            return;
          }
          callback(position);
        },
        pause: () => {
          window.__soundCloudCalls.push(['pause', element.id]);
          handlers.PAUSE?.();
        },
        play: () => {
          window.__soundCloudCalls.push(['play', element.id]);
        },
        seekTo: position => window.__soundCloudCalls.push(['seekTo', element.id, position]),
      };
      window.__soundCloudPlayers ??= {};
      window.__soundCloudPlayers[element.id] = { handlers, player };
      return player;
    };
    Widget.Events = { READY: 'READY', PLAY: 'PLAY', PAUSE: 'PAUSE', FINISH: 'FINISH', ERROR: 'ERROR' };
    window.SC = { Widget };
    localStorage.setItem('analyticsConsent', 'rejected');
  }, position);
  await page.route('https://w.soundcloud.com/player/api.js', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.route('https://w.soundcloud.com/player/?**', route =>
    route.fulfill({ contentType: 'text/html', body: '' }),
  );
}

// Install the fake clock already paused at a fixed offset from the seed.
// pauseAt(new Date()) races the browser-side clock: install seeds from the
// Node clock, the running clock can pass a Node-sampled target before pauseAt
// arrives, and pauseAt refuses to move backwards ("Cannot fast-forward to the
// past"). A 30s pause margin absorbs any realistic round-trip while a browser
// stuck longer still fails the test.
async function installPausedClock(page) {
  const start = new Date();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 30_000));
}

const lookUpCard = page => page.locator('#worksContainer [data-track="look-up"]');
const fireWidgetEvent = (page, event) =>
  page.evaluate(evt => window.__soundCloudPlayers.soundcloudPlayerLookUp.handlers[evt]?.(), event);

// Serve /listen/ with the SoundCloud recording as the configured default.
// Throws when the catalogue output does not contain the expected marker, so
// a build change fails the test instead of silently skipping the scenario.
async function serveSoundCloudDefault(page) {
  await page.route('**/listen/', async route => {
    const response = await route.fetch();
    const original = await response.text();
    const body = original.replace(
      '"defaultRecording":"spotify-3YV79qjiJLOgYjjEzTsVEy"',
      '"defaultRecording":"soundcloud-look-up"',
    );
    if (body === original) throw new Error('defaultRecording marker not found in /listen/ output');
    await route.fulfill({ response, body });
  });
}

test('defers SoundCloud requests until playback is requested', async ({ page }) => {
  const soundCloudRequests = [];
  await page.route('https://w.soundcloud.com/**', route => {
    soundCloudRequests.push(route.request().url());
    return route.abort();
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(soundCloudRequests).toEqual([]);

  await page.getByRole('link', { name: 'Listen', exact: true }).first().click();
  await expect(lookUpCard(page)).toBeVisible();
  expect(soundCloudRequests).toEqual([]);

  await lookUpCard(page).click();
  await expect.poll(() => soundCloudRequests.length).toBeGreaterThan(0);
});

test('shows loading feedback with the piece name as soon as playback is requested', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  // One-step reveal: the loading feedback is part of the pending
  // presentation, and the piece name stays visible underneath it.
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await expect(page.locator('#soundbarLoading')).toHaveText('Loading audio…');
  await expect(page.locator('#soundbarProgress')).toBeHidden();
  await expect(page.locator('#soundbarTimes')).toBeHidden();
  await expect(page.locator('#soundbarTitle')).toBeVisible();
  await expect(page.locator('#soundbarTitle')).toHaveText('Look Up');

  await fireWidgetEvent(page, 'READY');
  await expect.poll(() => page.evaluate(() => window.__soundCloudCalls)).toContainEqual([
    'play',
    'soundcloudPlayerLookUp',
  ]);
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarTitle')).toBeVisible();
});

test('a promptly started playback still clears the loading feedback', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  // Pause the soundbar animations before the click so the reveal cannot
  // finish in real time before the checkpoint seeks its timeline.
  const pauseStyle = await page.addStyleTag({
    content: '#soundbar, #soundbar * { animation-play-state: paused !important; }',
  });
  await lookUpCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  // Pin the soundbar animation timeline at 250ms, inside the 0.3s reveal
  // grace: the loading message must still be unrevealed. Stepping to 450ms
  // must reveal it, proving the assertions observe the intended timeline.
  const checkpoint = async (time) => page.evaluate((t) => {
    for (const a of document.getElementById('soundbar').getAnimations({ subtree: true })) {
      a.pause();
      a.currentTime = t;
    }
    return getComputedStyle(document.getElementById('soundbarLoading')).visibility;
  }, time);
  expect(await checkpoint(250)).toBe('hidden');
  expect(await checkpoint(450)).toBe('visible');
  await pauseStyle.evaluate((node) => node.remove());
  await page.evaluate(() => {
    for (const a of document.getElementById('soundbar').getAnimations({ subtree: true })) a.play();
  });

  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarLoading')).toBeHidden();

  await page.clock.runFor(2000);
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarTitle')).toBeVisible();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('surfaces the unavailable message when playback never starts', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();

  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();
  await expect(page.locator('#audioAvailabilityMessage')).toHaveText(
    'This recording is not currently available to embed from SoundCloud.',
  );
  await expect(page.locator('#soundbarLoading')).toBeHidden();
});

test('cancelling pending playback from the soundbar clears the loading state', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  // A cancelled request must not start playing later or trip the watchdog,
  // and a late PLAY event for the cancelled request must be ignored.
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await page.clock.runFor(16000);
  expect(await page.evaluate(() => window.__soundCloudCalls)).toEqual([['pause', 'soundcloudPlayerLookUp']]);
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('reselecting a pending track cancels the playback request', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await lookUpCard(page).click();
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  await fireWidgetEvent(page, 'READY');
  await page.clock.runFor(16000);
  expect(await page.evaluate(() => window.__soundCloudCalls)).toEqual([['pause', 'soundcloudPlayerLookUp']]);
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('reselecting a cancelled track starts playback and a stale PLAY is ignored', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  // Cancel, then a late PLAY for the cancelled request must be ignored.
  await lookUpCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();

  // Reselecting the same track is a new request: it plays and its PLAY applies.
  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => window.__soundCloudCalls)).toContainEqual([
    'play',
    'soundcloudPlayerLookUp',
  ]);
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('selecting Spotify cancels a pending SoundCloud request', async ({ page }) => {
  await mockSoundCloud(page);
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    window.__spotifyHandlers = {};
    window.__spotifyIFrameApi = {
      createController: (_container, _options, callback) => callback({
        loadUri: uri => window.__spotifyCalls.push(['loadUri', uri]),
        seek: position => window.__spotifyCalls.push(['seek', position]),
        play: () => window.__spotifyCalls.push(['play']),
        pause: () => window.__spotifyCalls.push(['pause']),
        addListener: (event, handler) => {
          window.__spotifyHandlers[event] = handler;
        },
      }),
    };
  });
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.onSpotifyIframeApiReady(window.__spotifyIFrameApi);',
    }),
  );
  await installPausedClock(page);
  await page.goto('/listen/');

  // Start a SoundCloud request (players still initialising), then switch to Spotify.
  await lookUpCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  await page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]').click();
  await expect(page.locator('#soundbarTitle')).toHaveText('Balconies');
  await expect(page.locator('#soundbarPerformer')).toHaveText('Olivia de Prato');

  // The Spotify player confirms its request, so its own startup watchdog stays quiet.
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__spotifyHandlers.playback_update)))
    .toBe(true);
  await page.evaluate(() =>
    window.__spotifyHandlers.playback_update({
      data: { isPaused: false, isBuffering: false, position: 0, duration: 30000 },
    }),
  );
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  // The SoundCloud players finish initialising: READY must not start playback,
  // and the hang watchdog must not fire under Spotify playback.
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp)))
    .toBe(true);
  await fireWidgetEvent(page, 'READY');
  // Pausing the SoundCloud players on the provider switch is expected; the
  // cancelled request must not start or seek playback.
  const soundCloudCalls = await page.evaluate(() => window.__soundCloudCalls);
  expect(soundCloudCalls.filter(([name]) => name !== 'pause')).toEqual([]);

  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
  await expect(page.locator('#soundbarTitle')).toHaveText('Balconies');
  await expect(page.locator('#soundbarPerformer')).toHaveText('Olivia de Prato');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('reselecting a cancelled Spotify track shows loading feedback for the new request', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  // The Spotify API script never resolves: requests stay in the pre-API
  // pending window for the whole test.
  await page.route('https://open.spotify.com/embed/iframe-api/v1', () => new Promise(() => {}));
  await installPausedClock(page);
  await page.goto('/listen/');

  const card = page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]');
  await card.click();
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  // Cancel, then select the same track again: feedback belongs to the new request.
  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await card.click();
  await expect(page.locator('#soundbarLoading')).toBeVisible();
});

test('a request waiting on the controller callback stays pending and cancellable', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyCreateCalls = 0;
    // The API arrives, but createController never calls its callback: the
    // request spends the whole test in the controller-creation window.
    window.__spotifyIFrameApi = {
      createController: () => { window.__spotifyCreateCalls += 1; },
    };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.onSpotifyIframeApiReady(window.__spotifyIFrameApi);',
    }),
  );
  await page.route('https://w.soundcloud.com/**', route => route.abort());
  await installPausedClock(page);
  await page.goto('/listen/');

  await page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]').click();
  await expect.poll(() => page.evaluate(() => window.__spotifyCreateCalls)).toBe(1);
  // Still pending: loading feedback and the piece name stay visible, and
  // the button still offers to cancel the request.
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await expect(page.locator('#soundbarTitle')).toHaveText('Balconies');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  // Cancelling ends the request instead of requesting the track again.
  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect.poll(() => page.evaluate(() => window.__spotifyCreateCalls)).toBe(1);
});

test('a stale controller callback cannot replace the live controller', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyPending = [];
    // createController holds its callback until the test resolves it.
    window.__spotifyIFrameApi = {
      createController: (_container, _options, callback) => {
        const controller = {
          calls: [],
          destroyed: false,
          loadUri: uri => controller.calls.push(['loadUri', uri]),
          seek: position => controller.calls.push(['seek', position]),
          play: () => controller.calls.push(['play']),
          pause: () => controller.calls.push(['pause']),
          destroy: () => { controller.destroyed = true; },
        };
        window.__spotifyPending.push({ controller, callback });
      },
    };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.onSpotifyIframeApiReady(window.__spotifyIFrameApi);',
    }),
  );
  await page.route('https://w.soundcloud.com/**', route => route.abort());
  await installPausedClock(page);
  await page.goto('/listen/');

  const card = page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]');
  await card.click();
  await expect.poll(() => page.evaluate(() => window.__spotifyPending.length)).toBe(1);
  // Cancel, then reselect: a second controller creation starts while the
  // first callback is still held.
  await page.locator('#soundbarPauseBtn').click();
  await card.click();
  await expect.poll(() => page.evaluate(() => window.__spotifyPending.length)).toBe(2);

  // The live callback lands first, the stale one late.
  await page.evaluate(() => {
    const live = window.__spotifyPending[1];
    live.callback(live.controller);
  });
  // The request is live on the new controller and stays pending: playback
  // is confirmed only by a playback_update event, never by the callback.
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await page.evaluate(() => {
    const stale = window.__spotifyPending[0];
    stale.callback(stale.controller);
  });

  // The stale controller is destroyed, never stored: commands and state
  // keep belonging to the live controller.
  const state = await page.evaluate(() => ({
    staleDestroyed: window.__spotifyPending[0].controller.destroyed,
    staleCalls: window.__spotifyPending[0].controller.calls,
    liveCalls: window.__spotifyPending[1].controller.calls,
  }));
  expect(state.staleDestroyed).toBe(true);
  expect(state.staleCalls).toEqual([]);
  expect(state.liveCalls).toEqual([
    ['loadUri', 'spotify:track:2wNL47uCuwDpbOqCIpbSTS'],
    ['seek', 0],
    ['play'],
  ]);
  // A click while the request is pending cancels it: the live controller is
  // torn down outright (destroyed, never paused), and the bar goes idle.
  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  const after = await page.evaluate(() => ({
    destroyed: window.__spotifyPending[1].controller.destroyed,
    calls: window.__spotifyPending[1].controller.calls,
  }));
  expect(after.destroyed).toBe(true);
  expect(after.calls[after.calls.length - 1]).toEqual(['play']);
});

test('surfaces the unavailable message when the SoundCloud script fails to load', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  await page.route('https://w.soundcloud.com/player/api.js', route => route.abort());

  await page.goto('/listen/');
  await lookUpCard(page).click();

  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();
  await expect(page.locator('#audioAvailabilityMessage')).toHaveText(
    'This recording is not currently available to embed from SoundCloud.',
  );
  await expect(page.locator('#soundbarLoading')).toBeHidden();
});

// Real widget-API semantics: api.js installs the page's message listener, and
// a READY posted by a player iframe before that listener exists is dropped.
// The mock api.js therefore arrives with the (delayed) api.js response and
// reproduces both SDK paths: dispatch to a registered wrapper, and the
// early-source list for iframes that reported ready before being wrapped.
async function mockSoundCloudBridgeTiming(page, { apiDelayMs = 0 } = {}) {
  await page.addInitScript(() => localStorage.setItem('analyticsConsent', 'rejected'));
  await page.route('https://w.soundcloud.com/player/api.js', async route => {
    if (apiDelayMs) await new Promise(resolve => setTimeout(resolve, apiDelayMs));
    await route.fulfill({ contentType: 'application/javascript', body: `
      window.__soundCloudCalls = [];
      (() => {
        const widgets = [];
        const earlySources = [];
        window.addEventListener('message', event => {
          let data;
          try { data = JSON.parse(event.data); } catch { return; }
          if (data.method !== 'ready') return;
          const widget = widgets.find(entry => entry.element.contentWindow === event.source);
          if (widget) {
            widget.ready = true;
            setTimeout(() => widget.handlers.READY?.(), 1);
          } else {
            earlySources.push(event.source);
          }
        });
        const Widget = element => {
          const widget = { element, handlers: {}, ready: earlySources.includes(element.contentWindow) };
          widgets.push(widget);
          return {
            bind: (event, handler) => {
              if (event === 'READY' && widget.ready) setTimeout(handler, 1);
              else widget.handlers[event] = handler;
            },
            play: () => { window.__soundCloudCalls.push(['play', element.id]); widget.handlers.PLAY?.(); },
            pause: () => { window.__soundCloudCalls.push(['pause', element.id]); widget.handlers.PAUSE?.(); },
            seekTo: position => window.__soundCloudCalls.push(['seekTo', element.id, position]),
            getDuration: callback => callback(60_000),
            getPosition: callback => callback(0),
          };
        };
        Widget.Events = { READY: 'READY', PLAY: 'PLAY', PAUSE: 'PAUSE', FINISH: 'FINISH', ERROR: 'ERROR' };
        window.SC = { Widget };
      })();
    ` });
  });
  await page.route('https://w.soundcloud.com/player/?**', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<script>parent.postMessage(JSON.stringify({ method: "ready" }), "*")</' + 'script>',
    }),
  );
}

test('still plays when the SoundCloud API arrives after the player iframes would have booted', async ({ page }) => {
  await mockSoundCloudBridgeTiming(page, { apiDelayMs: 800 });
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(
    () => page.evaluate(() => window.__soundCloudCalls),
    { timeout: 10_000 },
  ).toContainEqual(['play', 'soundcloudPlayerLookUp']);
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('pauses the player when the watchdog expires after play was requested', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  // The player reports ready and play() is issued, but the PLAY event never
  // arrives before the watchdog: marking the track unavailable must also stop
  // the audio, or the soundbar says stopped while the visitor hears playback.
  await fireWidgetEvent(page, 'READY');
  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();
  const calls = await page.evaluate(() => window.__soundCloudCalls);
  const playIndex = calls.findIndex(([command]) => command === 'play');
  const pauseIndex = calls.findIndex(([command]) => command === 'pause');
  expect(playIndex).toBeGreaterThanOrEqual(0);
  expect(pauseIndex).toBeGreaterThan(playIndex);

  // A PLAY event that only arrives after the watchdog stays ignored.
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
});

test('does not report a script failure for a request the visitor already cancelled', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('analyticsConsent', 'rejected'));
  // Hold the script request until the visitor has cancelled, so the failure
  // lands after the cancellation instead of racing it.
  let releaseScriptFailure;
  const scriptFailureReleased = new Promise(resolve => { releaseScriptFailure = resolve; });
  await page.route('https://w.soundcloud.com/player/api.js', async route => {
    await scriptFailureReleased;
    return route.abort();
  });
  const scriptFailed = page.waitForEvent('requestfailed', request =>
    request.url() === 'https://w.soundcloud.com/player/api.js'
  );

  await page.goto('/listen/');
  await lookUpCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  // A pending request reads as cancellable, never as playing.
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  await lookUpCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  // Assert only once the failure has passed through the app's own handling.
  // The listener is attached and acknowledged before the request is released,
  // so the error event cannot fire before it. The app's own error listener
  // was registered when the element was created, so it runs first, and two
  // macrotasks later its rejection handler has run too.
  await page.evaluate(() => {
    const script = document.querySelector('script[src*="w.soundcloud.com/player/api.js"]');
    window.__scriptFailureHandled = new Promise(resolve => {
      script.addEventListener('error', () => setTimeout(() => setTimeout(resolve, 0), 0));
    });
  });
  releaseScriptFailure();
  await scriptFailed;
  await page.evaluate(() => window.__scriptFailureHandled);
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('the soundbar does not move when the loading message appears or clears', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  const requested = await page.locator('#soundbar').boundingBox();

  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  const loading = await page.locator('#soundbar').boundingBox();

  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  const playing = await page.locator('#soundbar').boundingBox();

  expect(loading).toEqual(requested);
  expect(playing).toEqual(requested);
});

test('a Spotify request waiting on the player API shows and honours cancellation', async ({ page }) => {
  await mockSoundCloud(page);
  // The Spotify API script never calls back: the request stays in the
  // pre-API pending window.
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await installPausedClock(page);
  await page.goto('/listen/');

  // Switch from a pending SoundCloud request to a Spotify track: the pending
  // label now belongs to the Spotify request and must mean cancellation.
  await lookUpCard(page).click();
  await page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]').click();
  await expect(page.locator('#soundbarTitle')).toHaveText('Balconies');
  await expect(page.locator('#soundbarPerformer')).toHaveText('Olivia de Prato');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // The pending request shows loading feedback, not only the label.
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('switching to SoundCloud ends a playing Spotify controller and its events', async ({ page }) => {
  await mockSoundCloud(page);
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    window.__spotifyHandlers = {};
    window.__spotifyIFrameApi = {
      createController: (_container, _options, callback) => callback({
        loadUri: uri => window.__spotifyCalls.push(['loadUri', uri]),
        seek: position => window.__spotifyCalls.push(['seek', position]),
        play: () => window.__spotifyCalls.push(['play']),
        pause: () => window.__spotifyCalls.push(['pause']),
        destroy: () => window.__spotifyCalls.push(['destroy']),
        addListener: (event, handler) => {
          window.__spotifyHandlers[event] = handler;
        },
      }),
    };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.onSpotifyIframeApiReady(window.__spotifyIFrameApi);',
    }),
  );
  await page.goto('/listen/');

  await page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]').click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__spotifyHandlers.playback_update)))
    .toBe(true);
  await page.evaluate(() =>
    window.__spotifyHandlers.playback_update({
      data: { playingURI: 'spotify:track:2wNL47uCuwDpbOqCIpbSTS', isPaused: false, isBuffering: false, position: 1000, duration: 30000 },
    }),
  );
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  // Switching to SoundCloud replaces the Spotify request: its controller is
  // torn down, not merely paused.
  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => window.__spotifyCalls)).toContainEqual(['destroy']);
  await expect(page.locator('#soundbarTitle')).toHaveText('Look Up');

  // A start the Spotify embed had already queued cannot touch the SoundCloud bar.
  const callsAtSwitch = await page.evaluate(() => window.__spotifyCalls.length);
  await page.evaluate(() =>
    window.__spotifyHandlers.playback_update({
      data: { playingURI: 'spotify:track:2wNL47uCuwDpbOqCIpbSTS', isPaused: false, isBuffering: false, position: 2000, duration: 30000 },
    }),
  );
  await expect(page.locator('#soundbarTitle')).toHaveText('Look Up');
  expect(await page.evaluate(() => window.__spotifyCalls.length)).toBe(callsAtSwitch);
});

test('returning to a SoundCloud track that another selection displaced starts it from the beginning', async ({ page }) => {
  await mockSoundCloud(page);
  await page.goto('/listen/');

  const illuminationsCard = page.locator('#worksContainer [data-track="illuminations"]');
  const fireFor = (playerId, event) =>
    page.evaluate(([id, evt]) => window.__soundCloudPlayers[id].handlers[evt]?.(), [playerId, event]);

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  await fireFor('soundcloudPlayerLookUp', 'READY');
  await fireFor('soundcloudPlayerLookUp', 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  await illuminationsCard.click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerIlluminations))).toBe(true);
  await fireFor('soundcloudPlayerIlluminations', 'READY');
  await fireFor('soundcloudPlayerIlluminations', 'PLAY');
  await expect(page.locator('#soundbarTitle')).toHaveText('4 Illuminations');
  await expect(page.locator('#soundbarPerformer')).toHaveText('Xasax Saxophone Quartet at Royaumont Abbey');

  await lookUpCard(page).click();
  await expect(page.locator('#soundbarTitle')).toHaveText('Look Up');
  await expect(page.locator('#soundbarPerformer')).toHaveText('4 voices, viola da gamba and electronics');
  const calls = await page.evaluate(() => window.__soundCloudCalls);
  // Every selection, including the returning one, starts from the beginning.
  expect(calls.filter(([name]) => name === 'seekTo')).toEqual([
    ['seekTo', 'soundcloudPlayerLookUp', 0],
    ['seekTo', 'soundcloudPlayerIlluminations', 0],
    ['seekTo', 'soundcloudPlayerLookUp', 0],
  ]);
  expect(calls.filter(([name]) => name === 'play')).toEqual([
    ['play', 'soundcloudPlayerLookUp'],
    ['play', 'soundcloudPlayerIlluminations'],
    ['play', 'soundcloudPlayerLookUp'],
  ]);
});

test('a request that confirms quickly never shows the loading message', async ({ page }) => {
  await mockSoundCloud(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  // Confirm within the 0.3s grace window: the message stays hidden and the
  // progress rows are never displaced.
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarProgress')).toBeVisible();
});

test('a request still pending after the grace window shows the loading message without moving the title', async ({ page }) => {
  await mockSoundCloud(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  // READY alone does not confirm playback: the request stays pending, and
  // after the grace window the message appears with the title in place and
  // the progress rows displaced.
  await fireWidgetEvent(page, 'READY');
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await expect(page.locator('#soundbarTitle')).toHaveText('Look Up');
  await expect(page.locator('#soundbarProgress')).toBeHidden();
  // A later confirmation clears the message and restores the rows.
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarProgress')).toBeVisible();
});

test('a SoundCloud pause snaps the fill to the last player report before the position answer arrives', async ({ page }) => {
  await mockSoundCloud(page, { position: 5000 });
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  // The progress timer lands a real report at 5s of 60s, then the fill
  // glides ahead of it on the wall clock. Stay clear of the timer's 500ms
  // poll boundaries: a poll landing exactly on the clock edge would
  // re-anchor the sample and make this assertion timing-fragile.
  await page.clock.runFor(500);
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:05');
  await page.clock.runFor(400);
  const widthPercent = () => page.locator('#soundbarProgressFill').evaluate(el => parseFloat(el.style.width));
  await expect.poll(widthPercent).toBeGreaterThan(8.5);

  // The pause must snap the fill back to the 5s report in the same turn,
  // even while the fresh position answer is still outstanding.
  await page.evaluate(() => { window.__deferPositions = true; });
  const pausedWidths = await page.evaluate(() => {
    window.__soundCloudPlayers.soundcloudPlayerLookUp.handlers.PAUSE?.();
    const fill = document.getElementById('soundbarProgressFill');
    // Force layout in the same turn: the snap must be what renders, not a
    // 0.2s transition sliding back from the glide position.
    const rendered = fill.getBoundingClientRect().width / fill.parentElement.getBoundingClientRect().width * 100;
    return { style: parseFloat(fill.style.width), rendered };
  });
  expect(pausedWidths.style).toBeCloseTo((5000 / 60000) * 100, 1);
  expect(pausedWidths.rendered).toBeCloseTo((5000 / 60000) * 100, 1);

  // The fresh position applies when the answer finally arrives.
  await page.evaluate(() => window.__deferredPositions.soundcloudPlayerLookUp?.(4800));
  await expect.poll(widthPercent).toBeCloseTo((4800 / 60000) * 100, 1);
});

test('reselecting the paused recording resumes where it paused', async ({ page }) => {
  await mockSoundCloud(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  // Pause from the card, then select the same recording again.
  await lookUpCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  const callsAtPause = await page.evaluate(() => window.__soundCloudCalls.length);
  await lookUpCard(page).click();

  // The same selection resumes: play with no seek back to the beginning.
  const resumed = await page.evaluate(from => window.__soundCloudCalls.slice(from), callsAtPause);
  expect(resumed).toEqual([['play', 'soundcloudPlayerLookUp']]);
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('reselecting a SoundCloud default after stop starts it from the beginning', async ({ page }) => {
  await mockSoundCloud(page);
  // Serve the catalogue with a SoundCloud recording as the configured
  // default: after Stop the bar returns to that recording, so it stays the
  // current track for the next selection.
  await serveSoundCloudDefault(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  const callsFromPlay = await page.evaluate(() => window.__soundCloudCalls.length);
  await page.locator('#soundbarStopBtn').click();
  await lookUpCard(page).click();

  const calls = await page.evaluate(from => window.__soundCloudCalls
    .slice(from)
    .filter(([name, element]) => element === 'soundcloudPlayerLookUp' && (name === 'pause' || name === 'seekTo' || name === 'play')), callsFromPlay);
  // Stop discards the position: the widget is rewound before the reselection
  // plays it, so nothing can resume where the stopped playback paused.
  expect(calls).toEqual([
    ['pause', 'soundcloudPlayerLookUp'],
    ['seekTo', 'soundcloudPlayerLookUp', 0],
    ['play', 'soundcloudPlayerLookUp'],
  ]);
});

test('stopping a recording that displaced a SoundCloud default rewinds the default too', async ({ page }) => {
  await mockSoundCloud(page);
  await serveSoundCloudDefault(page);
  await page.goto('/listen/');

  const faultlineCard = page.locator('#worksContainer [data-track="faultline"]');
  const fireOn = (page, widget, event) =>
    page.evaluate(([widget, evt]) => window.__soundCloudPlayers[widget].handlers[evt]?.(), [widget, event]);

  // The default plays, then another recording displaces it mid-position.
  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  await fireOn(page, 'soundcloudPlayerLookUp', 'READY');
  await fireOn(page, 'soundcloudPlayerLookUp', 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  await faultlineCard.click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerFaultline))).toBe(true);
  await fireOn(page, 'soundcloudPlayerFaultline', 'READY');
  await fireOn(page, 'soundcloudPlayerFaultline', 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  // Stop: the bar returns to the default. Reselecting it must start it
  // from the beginning, not where its displacement paused it.
  // Sample before the stop: Stop itself performs the rewind, so the
  // reselection's play must follow a seekTo(0) logged during the stop.
  const callsBeforeStop = await page.evaluate(() => window.__soundCloudCalls.length);
  await page.locator('#soundbarStopBtn').click();
  await lookUpCard(page).click();

  const calls = await page.evaluate(from => window.__soundCloudCalls
    .slice(from)
    .filter(([name, element]) => element === 'soundcloudPlayerLookUp' && (name === 'seekTo' || name === 'play')), callsBeforeStop);
  expect(calls).toEqual([
    ['seekTo', 'soundcloudPlayerLookUp', 0],
    ['play', 'soundcloudPlayerLookUp'],
  ]);
});

test('reselecting after stop starts the recording from the beginning', async ({ page }) => {
  await mockSoundCloud(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__soundCloudPlayers?.soundcloudPlayerLookUp))).toBe(true);
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');

  await page.locator('#soundbarStopBtn').click();
  const callsAtStop = await page.evaluate(() => window.__soundCloudCalls.length);
  await lookUpCard(page).click();

  const calls = await page.evaluate(from => window.__soundCloudCalls
    .slice(from)
    .filter(([name]) => name === 'seekTo' || name === 'play'), callsAtStop);
  expect(calls).toEqual([
    ['seekTo', 'soundcloudPlayerLookUp', 0],
    ['play', 'soundcloudPlayerLookUp'],
  ]);
});
