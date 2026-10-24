# Hosting And Recovery

## Production

- Repository: https://github.com/nicholascaplan/samantha-fernando
- Canonical domain: https://www.samanthafernando.com/
- Hosting: GitHub Pages, deployed from `main` by `.github/workflows/pages.yml`.
- DNS provider: Namecheap.
- Content publishing, webhook settings and scheduling limitations: [Sanity operations](sanity.md).

The site is live. No Squarespace cutover steps remain to perform.

## Deployment

Pushes to `main`, Sanity publish webhooks, manual dispatch and the daily schedule run the Pages workflow. It runs unit and browser tests against deterministic generated pages, builds the stylesheet, renders published Sanity content and tests that production artifact with `playwright.built.config.js` before uploading `_site/`. A failed test or artifact audit prevents deployment.

To rebuild the current `main` without a code change:

```sh
gh workflow run pages.yml --repo nicholascaplan/samantha-fernando --ref main
gh run list --repo nicholascaplan/samantha-fernando --workflow pages.yml --limit 5
gh run watch <run-id> --repo nicholascaplan/samantha-fernando --exit-status
```

Confirm both the test and deploy jobs succeed. Check the content-build logs for fallback warnings if a Sanity edit is missing. Builds use current published content, not drafts; fallback behaviour is documented in [Sanity operations](sanity.md).

The published artifact contains root `index.html`, the exact generated page directories in `scripts/lib/pages.mjs`, `CNAME`, `robots.txt`, `sitemap.xml` and public `assets/`. `scripts/lib/public-output.mjs` rejects unexpected files, symlinks and stale routes rather than publishing them. Never add documentation, Studio files, tests, package files, repository metadata, source templates or maintainer notes. If a removed route causes an audit failure locally, inspect and remove only that obsolete generated file before rebuilding; CI starts from a clean checkout.

## Domain And DNS Precautions

GitHub repository **Settings → Pages** should retain the custom domain `www.samanthafernando.com`. Check the DNS and HTTPS status there when diagnosing domain or certificate problems. Keep HTTPS enforcement enabled once a valid certificate is provisioned.

The expected GitHub Pages DNS configuration is:

| Host | Type | Target |
|---|---|---|
| `www` | CNAME | `nicholascaplan.github.io` |
| `@` | A | `185.199.108.153` |
| `@` | A | `185.199.109.153` |
| `@` | A | `185.199.110.153` |
| `@` | A | `185.199.111.153` |

These are the intended records, not a live DNS audit. Compare the actual records with GitHub's current [custom-domain guidance](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) before changing them. A repository rename does not change the account-level `www` CNAME target.

Before any DNS change, export or screenshot the existing records. Change only the relevant website records. Leave MX and email-related TXT records, including SPF, DKIM and DMARC, unchanged. DNS changes are not a remedy for a broken code or content deployment.

## Verification

After a deployment or hosting change, check in a browser:

- `https://www.samanthafernando.com/` loads without a certificate warning.
- `https://samanthafernando.com/` redirects to the canonical `www` URL.
- Works filters, SoundCloud/Spotify controls, YouTube modals, theme control and desktop/mobile navigation work.
- Direct loads and refreshes at `/biography/`, `/works/`, `/writing/` and `/contact/` return their own content and metadata. Writing includes the complete essay directly. Unknown paths return 404. Old root hash bookmarks are intentionally unsupported.
- Audio continues through ordinary enhanced page navigation; full reloads or opening another tab create independent players. Check real provider playback rather than the soundbar alone.
- The sitemap lists the canonical page URLs. Submit it in Search Console if owner access is available and monitor indexing after launch.
- The enquiry form works; confirm delivery when testing submission, without including sensitive information.

After DNS changes, also verify normal inbound and outbound email. Restore the saved mail records if they were accidentally changed.

BoxedCode cannot fetch the public website because its sandbox blocks outbound access to that domain. A successful Actions run verifies deployment, not live-site propagation; check the public site outside BoxedCode.

## Recovery

### Failed Workflow Or Transient Build Problem

A failed test or build normally leaves the previously deployed site in place. Inspect the failed job before retrying. For a transient failure, rerun the failed jobs or manually dispatch the workflow above. Do not alter DNS or disable HTTPS.

### Regressed Website Code

1. Identify the regression and a known-good commit from successful Pages runs and Git history.
2. Create a fix branch from the latest `origin/main` in a clean checkout or worktree. Revert the offending commit(s), or make a targeted fix; do not reset or force-push shared history. Merge commits require an explicitly chosen mainline.
3. Run the relevant automated tests. Rebuild CSS with `npm run build:css` if Tailwind utility classes or stylesheet sources change.
4. Review and merge the recovery change to `main` through the repository's normal review/check requirements, then confirm the Pages workflow succeeds and perform the browser checks above.

Reverting code does not recreate an exact historical site: every build reads current published Sanity content, and the committed fallback is used only when live content cannot be rendered.

### Incorrect Published Content

Restore the intended document version in Sanity Studio and publish it. Confirm the webhook triggers a successful Pages run; if needed, dispatch the workflow manually. See [Sanity operations](sanity.md) for webhook troubleshooting. Do not reseed or overwrite the dataset to undo an editorial mistake.
