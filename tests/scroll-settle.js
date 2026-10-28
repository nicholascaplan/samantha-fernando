// Waits until an element stops moving: its viewport position must stay
// unchanged for one continuous quiet window. Enhanced navigation
// smooth-scrolls to hash anchors (CSS scroll-smooth), and WebKit animates
// that scroll in bursts with brief pauses (~90ms seen in CI traces), so the
// window must exceed those pauses; 500ms covers them with margin and still
// returns as soon as the scroll is actually done. A scroll that never
// settles fails the test by timeout rather than passing early.
async function waitForScrollSettle(page, selector, quietMs = 500) {
  await page.waitForFunction(([sel, quiet]) => new Promise(resolve => {
    const el = document.querySelector(sel);
    if (!el) return resolve(false);
    let lastTop = el.getBoundingClientRect().top;
    let lastMove = performance.now();
    const check = () => {
      const top = el.getBoundingClientRect().top;
      const now = performance.now();
      if (top !== lastTop) {
        lastTop = top;
        lastMove = now;
      }
      if (now - lastMove >= quiet) return resolve(true);
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), [selector, quietMs]);
}

module.exports = { waitForScrollSettle };
