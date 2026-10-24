const http = require('http');
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// These tests recreate a slow page load with a real HTTP server. It sends the
// contact page up to the form, holds the rest of the document (including the
// scripts that make the form work) and releases it on demand. Formspree is
// always mocked, so no test submission leaves the browser.

const siteRoot = path.join(__dirname, '..', '_site');
const upstream = { host: '127.0.0.1', port: 8010 };
const splitMarker = '<script src="/assets/catalogue-renderer.js">';
const FORMSPREE = 'https://formspree.io/f/mlgqqjen';

let server;
let baseUrl;
let release;
let heldAssets;

test.beforeAll(async () => {
  const contactHtml = fs.readFileSync(path.join(siteRoot, 'contact', 'index.html'), 'utf8');
  const splitAt = contactHtml.indexOf(splitMarker);
  expect(splitAt).toBeGreaterThan(contactHtml.indexOf('id="contactForm"'));
  const first = contactHtml.slice(0, splitAt);
  const rest = contactHtml.slice(splitAt);

  server = http.createServer((req, res) => {
    if (req.url.split('?')[0] === '/contact/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.write(first);
      release = () => res.end(rest);
      return;
    }
    if (heldAssets && req.url.startsWith('/assets/site.js')) {
      res.writeHead(503);
      res.end();
      return;
    }
    const proxied = http.request({ ...upstream, path: req.url, method: req.method, headers: req.headers }, upstreamRes => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    });
    proxied.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(proxied);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test.beforeEach(() => {
  release = undefined;
  heldAssets = false;
});

async function openContactBeforeScriptsLoad(page) {
  await page.goto(`${baseUrl}/contact/`, { waitUntil: 'commit' });
  await expect(page.locator('#contactForm')).toBeVisible();
  expect(await page.evaluate(() => typeof window.handleContactSubmit)).toBe('undefined');
}

async function fillForm(page) {
  await page.locator('#contactName').fill('Test Visitor');
  await page.locator('#contactEmail').fill('test@example.com');
  await page.locator('#contactMessage').fill('Test inquiry');
}

function mockFormspree(page, status) {
  const requests = [];
  page.on('request', request => {
    if (request.url().startsWith('https://formspree.io/')) requests.push(request.url());
  });
  return page.route('https://formspree.io/**', route =>
    route.fulfill({ status, contentType: 'application/json', body: '{}' })
  ).then(() => requests);
}

test('holds a contact submission made before the page scripts load, then sends it once', async ({ page }) => {
  const requests = await mockFormspree(page, 200);
  await openContactBeforeScriptsLoad(page);
  await fillForm(page);

  await page.getByRole('button', { name: 'Send Inquiry Message' }).click();
  // A second submit while waiting (Enter in a field) must not queue a duplicate.
  await page.locator('#contactName').press('Enter');

  await expect(page.locator('#contactSubmit')).toBeDisabled();
  await expect(page).toHaveURL(`${baseUrl}/contact/`);
  expect(requests).toHaveLength(0);
  await expect(page.locator('#contactName')).toHaveValue('Test Visitor');

  release();

  await expect(page.locator('#contactToast')).toBeVisible();
  await expect(page.locator('#contactToast')).toContainText('Message sent successfully');
  await expect(page.locator('#contactSubmit')).toBeEnabled();
  await expect(page).toHaveURL(`${baseUrl}/contact/`);
  expect(requests).toEqual([FORMSPREE]);
});

test('keeps what the visitor typed when a held submission is rejected', async ({ page }) => {
  const requests = await mockFormspree(page, 422);
  await openContactBeforeScriptsLoad(page);
  await fillForm(page);

  await page.getByRole('button', { name: 'Send Inquiry Message' }).click();
  await expect(page.locator('#contactSubmit')).toBeDisabled();
  release();

  await expect(page.locator('#contactError')).toBeVisible();
  await expect(page.locator('#contactError')).toContainText('Unable to send your message');
  await expect(page.locator('#contactName')).toHaveValue('Test Visitor');
  await expect(page.locator('#contactEmail')).toHaveValue('test@example.com');
  await expect(page.locator('#contactMessage')).toHaveValue('Test inquiry');
  await expect(page).toHaveURL(`${baseUrl}/contact/`);
  expect(requests).toEqual([FORMSPREE]);
});

test('shows the existing error, not an off-site POST, if the page scripts never load', async ({ page }) => {
  heldAssets = true;
  await page.clock.install();
  const requests = await mockFormspree(page, 200);
  await openContactBeforeScriptsLoad(page);
  await fillForm(page);
  release();
  await page.waitForLoadState('load');

  await page.getByRole('button', { name: 'Send Inquiry Message' }).click();
  await expect(page.locator('#contactSubmit')).toBeDisabled();

  await page.clock.fastForward(15_000);
  await expect(page.locator('#contactError')).toBeVisible();
  await expect(page.locator('#contactSubmit')).toBeEnabled();
  await expect(page.locator('#contactName')).toHaveValue('Test Visitor');
  await expect(page.locator('#contactMessage')).toHaveValue('Test inquiry');
  await expect(page).toHaveURL(`${baseUrl}/contact/`);
  expect(requests).toHaveLength(0);
});
