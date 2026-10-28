// Waits until an element stops moving: its viewport position must stay
// unchanged for one continuous quiet window. Enhanced navigation
// smooth-scrolls to hash anchors (CSS scroll-smooth), and WebKit animates
// that scroll in bursts with brief pauses (~90ms seen in CI traces), so the
// window must exceed those pauses; 500ms covers them with margin and still
// returns as soon as the scroll is actually done. A scroll that never
// settles fails the test by timeout rather than passing early.
// Playwright's waitForFunction stops polling when the predicate returns any
// truthy value - and a Promise object is truthy - without re-checking the
// value it resolves to. So the predicate must return false synchronously
// until the anchor exists; only then does it return the settle Promise,
// whose resolution Playwright awaits before returning.
async function waitForScrollSettle(page, selector, quietMs = 500) {
  await page.waitForFunction(([sel, quiet]) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    return new Promise(resolve => {
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
    });
  }, [selector, quietMs]);
}

module.exports = { waitForScrollSettle };
