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

test('shows a loading message only when playback stays pending beyond half a second', async ({ page }) => {
  await mockSpotify(page);
  await installPausedClock(page);
  await page.goto('/listen/');

  await balconiesCard(page).click();
  await expect(page.locator('#soundbar')).toBeVisible();
  await expect(page.locator('#soundbarLoading')).toBeHidden();

  await page.clock.runFor(400);
  await expect(page.locator('#soundbarLoading')).toBeHidden();

  await page.clock.runFor(200);
  await expect(page.locator('#soundbarLoading')).toBeVisible();
  await expect(page.locator('#soundbarLoading')).toHaveText('Loading audio…');

  await fireSpotifyUpdate(page, { isPaused: false, isBuffering: false, position: 0, duration: 30000 });
  await expect(page.locator('#soundbarLoading')).toBeHidden();
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
  expect(await page.evaluate(() => window.__spotifyCalls)).toEqual([
    ['loadUri', 'spotify:track:2wNL47uCuwDpbOqCIpbSTS'],
    ['seek', 0],
    ['play'],
    ['pause'],
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
