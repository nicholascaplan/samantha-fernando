# Samantha Fernando Website

Static single-page portfolio for composer Samantha Fernando. Biography, works, recordings, writing and contact information use in-page routes in `index.html`.

## Technical Overview

- Plain HTML, CSS, and JavaScript in `index.html`.
- Compiled Tailwind CSS in `assets/tailwind.min.css`; Font Awesome and Google Fonts loaded from CDNs.
- SoundCloud Widget API for verified SoundCloud recordings.
- Spotify track playback through the Spotify IFrame API.
- A unified Works & Media catalogue. The committed fallback contains 23 works, thirteen recordings and eleven films; Sanity can add or remove entries.
- YouTube videos open in an in-page modal from thumbnail cards.
- GitHub Pages deployment from the `main` branch.

## Content (Sanity)

Biography and the Works & Media catalogue have Sanity schemas (`studio/`, project `9a66iw1t`) and build-time integration. Biography is editable at <https://samantha-fernando.sanity.studio>. Catalogue schemas and the initial content are in Sanity; wait until the website deployment and publish-webhook update are complete before editing the catalogue. Published content is baked into the static site, never fetched from Sanity in the browser.

```bash
npm run build:content        # writes the publishable site to _site/ using live Sanity content
cd studio && npm run dev     # run the Studio locally
cd studio && npm run deploy  # publish the hosted Studio after schema changes
```

If Sanity is unavailable or incomplete, `build:content` keeps the committed section fallback in `index.html`. Biography and Works & Media fall back independently. `studio/scripts/seed-biography.ts` recreates Biography; `studio/scripts/seed-catalogue.ts` imports the catalogue without overwriting existing editor changes. See `docs/sanity.md` before running either import.

## Run Locally

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>. Serve the site over HTTP rather than opening it with `file://`.

## Tests

Install dependencies and Chromium once with `npm install` and `npx playwright install chromium`, then run `npm test`. The test starts the local HTTP server automatically. Use `npm run test:all` for the full browser matrix.

PR checks run unit tests and all four Playwright projects (Chromium, Firefox, WebKit and mobile Chromium). Install all desktop browser engines locally with `npx playwright install chromium firefox webkit` to run the full matrix. See [the test strategy](docs/test-strategy.md#pull-requests) for the required merge checks and branch-protection setup.

## Deployment

- Hosting, DNS precautions, deployment verification and recovery: [hosting guide](docs/hosting.md).
- Production domain: <https://www.samanthafernando.com/>
- The Pages workflow runs on pushes to `main`, Sanity publish webhooks, manual dispatch and daily at 8am UK time (`Europe/London`, following GMT/BST). See `docs/sanity.md` for scheduling limitations.
