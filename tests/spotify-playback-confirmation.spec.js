const { test, expect } = require('@playwright/test');

// A controllable Spotify IFrame API: playback_update events are fired
// explicitly by each test so playback state stays deterministic.
async function mockSpotify(page) {
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    window.__spotifyHandlers = {};
    window.__spotifyIFrameApi = {
      createController: (_container, _options, callback) => {
        const controller = {
          loadUri: uri => window.__spotifyCalls.push(['loadUri', uri]),
          seek: position => window.__spotifyCalls.push(['seek', position]),
          play: () => window.__spotifyCalls.push(['play']),
          pause: () => window.__spotifyCalls.push(['pause']),
          destroy: () => window.__spotifyCalls.push(['destroy']),
          addListener: (event, handler) => {
            window.__spotifyHandlers[event] = handler;
          },
        };
        callback(controller);
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
}

// Same paused-clock pattern as tests/soundcloud-deferred-playback.spec.js:
// install seeds from the Node clock and pauseAt lands 30s ahead so the
// browser-side clock cannot pass the target before it is paused.
async function installPausedClock(page) {
  const start = new Date();
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 30_000));
}

const balconiesCard = page => page.locator('#worksContainer [data-spotify-track="2wNL47uCuwDpbOqCIpbSTS"]');
// Firing waits for the API script and controller callback to have run, so a
// test never fires into a page whose listener is not registered yet.
const fireSpotifyUpdate = async (page, data) => {
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__spotifyHandlers.playback_update)))
    .toBe(true);
  await page.evaluate(update => window.__spotifyHandlers.playback_update({ data: update }), data);
};

test('keeps the soundbar position at zero until the player reports playback', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  // A pending request reads as cancellable, never as playing.
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await expect(page.locator('#soundbarPauseIcon')).toHaveClass(/fa-play/);
  await expect(page.locator('#soundStatusIcon')).toHaveClass(/fa-play/);
  await expect(page.locator('#waveContainer')).toHaveClass(/paused/);

  // No wall-clock timer may stand in for real playback: without any
  // playback_update event the position stays exactly where it started.
  await page.waitForTimeout(1200);
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:00');
  await expect(page.locator('#soundbarDurationTime')).toHaveText('0:30');
});

test('drives the soundbar position and duration from playback_update events', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 5000, duration: 413000 });

  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '5000');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuemax', '413000');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuetext', '0:05 of 6:53');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:05');
  await expect(page.locator('#soundbarDurationTime')).toHaveText('6:53');

  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 6500, duration: 413000 });
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '6500');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:06');
});

test('mirrors a real pause and resumes from the reported position', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 5000, duration: 30000 });
  await fireSpotifyUpdate(page, { isPaused: true, isBuffering: false, position: 5234, duration: 30000 });

  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '5234');

  await page.locator('#soundbarPauseBtn').click();
  await expect.poll(() => page.evaluate(() => window.__spotifyCalls)).toContainEqual(['play']);
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 5234, duration: 30000 });
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('treats a real pause at the end as finished and replays from the start', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 29500, duration: 30000 });
  await fireSpotifyUpdate(page, { isPaused: true, isBuffering: false, position: 30000, duration: 30000 });

  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '30000');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuetext', '0:30 of 0:30');

  // Reselecting the finished track starts it over instead of resuming the end.
  await balconiesCard(page).click();
  const calls = await page.evaluate(() => window.__spotifyCalls);
  expect(calls.filter(call => call[0] === 'loadUri')).toHaveLength(2);
  expect(calls.filter(call => call[0] === 'seek')).toEqual([
    ['seek', 0],
    ['seek', 0],
  ]);
  expect(calls.filter(call => call[0] === 'play')).toHaveLength(2);
});

test('shows loading feedback with the piece name as soon as playback is requested', async ({ page }) => {
  await mockSpotify(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  // One-step reveal: the loading feedback is part of the pending
  // presentation, and the piece name stays visible underneath it.
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await expect(page.locator('#soundbarLoading')).toHaveText('Loading audio…');
  await expect(page.locator('#soundbarLabel')).toBeVisible();
  await expect(page.locator('#soundbarLabel')).toHaveText(/Balconies/);

  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 0, duration: 30000 });
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarLabel')).toBeVisible();
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('surfaces the unavailable message when playback never starts', async ({ page }) => {
  await mockSpotify(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();

  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();
  await expect(page.locator('#audioAvailabilityMessage')).toContainText(
    'Spotify could not start playback in the embedded player.',
  );
  await expect(page.locator('#audioAvailabilityMessage a')).toHaveText('Play on Spotify');
  await expect(page.locator('#audioAvailabilityMessage a')).toHaveAttribute(
    'href',
    'https://open.spotify.com/track/2wNL47uCuwDpbOqCIpbSTS',
  );
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  // The failure is surfaced where the visitor is: fixed above the soundbar,
  // never a notice scrolled out of view in the catalogue flow.
  await expect(page.locator('#audioAvailabilityMessage')).toHaveCSS('position', 'fixed');
});

test('a Spotify API that becomes ready after the failure notice cannot start playback', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    window.__spotifyIFrameApi = {
      createController: (_container, _options, callback) => callback({
        loadUri: uri => window.__spotifyCalls.push(['loadUri', uri]),
        seek: position => window.__spotifyCalls.push(['seek', position]),
        play: () => window.__spotifyCalls.push(['play']),
        pause: () => window.__spotifyCalls.push(['pause']),
        addListener: () => {},
      }),
    };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  // The API script hangs past the watchdog timeout.
  await page.route('https://open.spotify.com/embed/iframe-api/v1', () => new Promise(() => {}));
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();

  // The API arrives late: the failed request must stay failed, not revive.
  await page.evaluate(() => window.onSpotifyIframeApiReady(window.__spotifyIFrameApi));
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  expect(await page.evaluate(() => window.__spotifyCalls)).toEqual([]);
});

test('a retry after a stalled controller request is cancellable and watchdogged', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    // createController never invokes its callback: every request waits forever.
    window.__spotifyIFrameApi = { createController: () => {} };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__spotifyApiReadyCalled = true; window.onSpotifyIframeApiReady(window.__spotifyIFrameApi);',
    }),
  );
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__spotifyApiReadyCalled))).toBe(true);
  // The first request times out waiting on a controller callback that never comes.
  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();

  // Retry with the API ready but no controller: the new request must still
  // present as pending - cancellable immediately, showing the loading
  // feedback, and guarded by its own watchdog - not silent.
  await balconiesCard(page).click();
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeVisible();
});

test('reselecting a track waiting on the controller callback cancels the request', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    // createController never invokes its callback: every request waits forever.
    window.__spotifyIFrameApi = { createController: () => {} };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.__spotifyApiReadyCalled = true; window.onSpotifyIframeApiReady(window.__spotifyIFrameApi);',
    }),
  );
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.__spotifyApiReadyCalled))).toBe(true);
  // The API-ready dispatch must not cancel the queued request: it stays pending.
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // A direct reselection in the controller-callback window cancels the request:
  // no failure notice, no loading, and the request leaves the pending state.
  await balconiesCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('cancelling pending playback from the soundbar clears the loading state', async ({ page }) => {
  await mockSpotify(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  // A cancelled request must not trip the watchdog, and a late
  // playback_update for the cancelled request must be ignored.
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 1000, duration: 30000 });
  await page.clock.runFor(16000);
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '0');
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
  // Cancellation destroys the controller outright: no pause, and the log
  // shows the teardown instead.
  expect(await page.evaluate(() => window.__spotifyCalls)).toEqual([
    ['loadUri', 'spotify:track:2wNL47uCuwDpbOqCIpbSTS'],
    ['seek', 0],
    ['play'],
    ['destroy'],
  ]);
});

test('cancelling pending playback before the Spotify API loads keeps it cancelled', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyCalls = [];
    window.__spotifyIFrameApi = {
      createController: (_container, _options, callback) => {
        callback({
          loadUri: uri => window.__spotifyCalls.push(['loadUri', uri]),
          seek: position => window.__spotifyCalls.push(['seek', position]),
          play: () => window.__spotifyCalls.push(['play']),
          pause: () => window.__spotifyCalls.push(['pause']),
          addListener: () => {},
        });
      },
    };
    localStorage.setItem('analyticsConsent', 'rejected');
  });
  // The API script arrives but never initialises until the test fires it.
  await page.route('https://open.spotify.com/embed/iframe-api/v1', route =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.route('https://w.soundcloud.com/**', route => route.abort());
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  await page.locator('#soundbarPauseBtn').click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  // The API arriving late must not start the cancelled request.
  await page.evaluate(() => window.onSpotifyIframeApiReady(window.__spotifyIFrameApi));
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__spotifyCalls)).toEqual([]);
});

test('reselecting a pending track cancels the playback request', async ({ page }) => {
  await mockSpotify(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await page.clock.runFor(600);
  await expect(page.locator('#soundbarLoading')).toBeVisible();

  await balconiesCard(page).click();
  await expect(page.locator('#soundbarLoading')).toBeHidden();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  await page.clock.runFor(16000);
  await expect(page.locator('#audioAvailabilityMessage')).toBeHidden();
});

test('resuming the same paused track continues from where it paused', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 5000, duration: 30000 });
  await balconiesCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Resume playback');

  await balconiesCard(page).click();
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 5000, duration: 30000 });
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
  await expect(page.locator('#soundbarProgress')).toHaveAttribute('aria-valuenow', '5000');

  expect(await page.evaluate(() => window.__spotifyCalls)).toEqual([
    ['loadUri', 'spotify:track:2wNL47uCuwDpbOqCIpbSTS'],
    ['seek', 0],
    ['play'],
    ['pause'],
    ['play'],
  ]);
});

test('stays pending while the player reports buffering, confirms on actual playback', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // An unpaused but buffering report is not playback: the request stays
  // pending and cancellable, and the watchdog keeps running.
  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: true, position: 0, duration: 413000 });
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:00');

  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 0, duration: 413000 });
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('ignores playback events that report a different track', async ({ page }) => {
  await mockSpotify(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // A late event from a previously loaded track must not confirm or move
  // the current track's bar.
  await fireSpotifyUpdate(page, { playingURI: 'spotify:track:3YV79qjiJLOgYjjEzTsVEy', isPaused: false, isBuffering: false, position: 9000, duration: 30000 });
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:00');

  await fireSpotifyUpdate(page, { playingURI: 'spotify:track:2wNL47uCuwDpbOqCIpbSTS', isPaused: false, isBuffering: false, position: 1000, duration: 413000 });
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:01');
});

test('a cancelled request destroys its controller and its late events cannot confirm the re-armed one', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyControllers = [];
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
          addListener: (event, handler) => { controller.handler = handler; },
        };
        window.__spotifyControllers.push(controller);
        callback(controller);
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
  await expect.poll(() => page.evaluate(() => window.__spotifyControllers.length)).toBe(1);
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // Cancel, then reselect the same track: the cancelled controller is
  // destroyed and the new request gets a fresh controller.
  await page.locator('#soundbarPauseBtn').click();
  await card.click();
  await expect.poll(() => page.evaluate(() => window.__spotifyControllers.length)).toBe(2);
  const tornDown = await page.evaluate(() => window.__spotifyControllers[0].destroyed);
  expect(tornDown).toBe(true);
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');

  // Even if an already-queued event from the cancelled controller still
  // runs, it cannot touch the new request's state.
  await page.evaluate(() => window.__spotifyControllers[0].handler?.({
    data: { playingURI: 'spotify:track:2wNL47uCuwDpbOqCIpbSTS', isPaused: false, isBuffering: false, position: 5000, duration: 413000 },
  }));
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await expect(page.locator('#soundbarElapsedTime')).toHaveText('0:00');

  // The new controller's own report confirms the request normally.
  await page.evaluate(() => window.__spotifyControllers[1].handler?.({
    data: { playingURI: 'spotify:track:2wNL47uCuwDpbOqCIpbSTS', isPaused: false, isBuffering: false, position: 1000, duration: 413000 },
  }));
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Pause playback');
});

test('a stale controller callback cannot replace the live controller', async ({ page }) => {
  await page.addInitScript(() => {
    window.__spotifyPending = [];
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
          addListener: (event, handler) => { controller.handler = handler; },
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
  await expect(page.locator('#soundbarPauseBtn')).toHaveAttribute('aria-label', 'Cancel playback request');
  await page.evaluate(() => {
    const stale = window.__spotifyPending[0];
    stale.callback(stale.controller);
  });

  // The stale controller is destroyed, never stored, never listened to.
  const state = await page.evaluate(() => ({
    staleDestroyed: window.__spotifyPending[0].controller.destroyed,
    staleCalls: window.__spotifyPending[0].controller.calls,
    staleHandler: Boolean(window.__spotifyPending[0].controller.handler),
    liveCalls: window.__spotifyPending[1].controller.calls,
  }));
  expect(state.staleDestroyed).toBe(true);
  expect(state.staleCalls).toEqual([]);
  expect(state.staleHandler).toBe(false);
  expect(state.liveCalls).toEqual([
    ['loadUri', 'spotify:track:2wNL47uCuwDpbOqCIpbSTS'],
    ['seek', 0],
    ['play'],
  ]);
});
