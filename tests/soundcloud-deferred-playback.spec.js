const { test, expect } = require('@playwright/test');

// A controllable SoundCloud widget API: READY/PLAY are fired explicitly by
// each test so pending-playback timing stays deterministic.
async function mockSoundCloud(page) {
  await page.addInitScript(() => {
    window.__soundCloudCalls = [];
    const Widget = element => {
      const handlers = {};
      const player = {
        bind: (event, handler) => { handlers[event] = handler; },
        getDuration: callback => callback(60_000),
        getPosition: callback => callback(0),
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
  });
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
  await expect(page.locator('#soundbarLabel')).toBeVisible();
  await expect(page.locator('#soundbarLabel')).toHaveText(/Look Up/);

  await fireWidgetEvent(page, 'READY');
  await expect.poll(() => page.evaluate(() => window.__soundCloudCalls)).toContainEqual([
    'play',
    'soundcloudPlayerLookUp',
  ]);
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarLabel')).toBeVisible();
});

test('a promptly started playback still clears the loading feedback', async ({ page }) => {
  await mockSoundCloud(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await lookUpCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await page.clock.runFor(400);
  await fireWidgetEvent(page, 'READY');
  await fireWidgetEvent(page, 'PLAY');
  await expect(page.locator('#soundbarLoading')).toBeHidden();

  await page.clock.runFor(2000);
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarLabel')).toBeVisible();
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
  await expect(page.locator('#soundbarLabel')).toHaveText('Balconies · Olivia de Prato');

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
  await expect(page.locator('#soundbarLabel')).toHaveText('Balconies · Olivia de Prato');
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
  await expect(page.locator('#soundbarLabel')).toHaveText(/Balconies/);
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
  await page.locator('#soundbarPauseBtn').click();
  const liveCallsAfter = await page.evaluate(() => window.__spotifyPending[1].controller.calls);
  expect(liveCallsAfter[liveCallsAfter.length - 1]).toEqual(['pause']);
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
  await expect(page.locator('#soundbarLabel')).toHaveText('Balconies · Olivia de Prato');
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // The pending request shows loading feedback, not only the label.
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});
