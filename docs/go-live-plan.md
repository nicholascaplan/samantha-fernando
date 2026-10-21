# GitHub Pages Go-Live Plan

Use this plan for the scheduled move of `www.samanthafernando.com` from Squarespace to GitHub Pages. The live domain must remain on Squarespace until the approved cutover window.

## Scope

- Target canonical URL: `https://www.samanthafernando.com/`
- Hosting: GitHub Pages, repository `nicholascaplan/samantha-fernando`, `main` branch
- DNS provider: Namecheap
- Existing site: Squarespace
- Email address and its MX, SPF, DKIM and DMARC records are out of scope. Do not change or remove them.

## Before The Cutover

Complete these checks one or more business days before the cutover window. Do not add a `CNAME` file or change Namecheap web records yet.

1. Confirm `main` contains the intended site and that the GitHub Actions Pages workflow has passed.
2. Manually test the GitHub Pages staging URL in desktop and mobile browsers. Check primary navigation, contact form, theme control, SoundCloud and Spotify playback and YouTube modals.
3. In Namecheap, export or screenshot every existing Advanced DNS record. Record the current Squarespace A and `www` CNAME values separately for rollback.
4. Confirm existing MX records and email-related TXT records, including SPF, DKIM and DMARC, are present. They must be retained unchanged throughout the cutover.
5. Lower only the TTL on the existing website records, not email records, to 5 minutes if Namecheap permits. Do this at least 24 hours before the cutover.
6. Confirm that a GitHub account with repository administration access and a Namecheap account with DNS access will be available during the cutover.
7. Agree the cutover window and a rollback decision time. Allow up to 24 hours for DNS and certificate propagation, even though updates commonly complete sooner.

## Cutover Changes

Perform these steps in order during the approved window.

1. Update the production-domain references together in `index.html`, `robots.txt`, `sitemap.xml`, `docs/content.md` and `tests/site-load.spec.js`:
   - Canonical, Open Graph, Twitter and JSON-LD URLs: `https://www.samanthafernando.com/` (including the `/assets/sam-1-1200.webp` social image URL).
   - Sitemap URL in `robots.txt`: `https://www.samanthafernando.com/sitemap.xml`.
   - URL in `sitemap.xml`: `https://www.samanthafernando.com/`.
   - Playwright production-host mapping: `www.samanthafernando.com` to `127.0.0.1`.
2. Run `npm run build:css` and `npm test`; do not proceed if either fails.
3. Add a root `CNAME` file containing exactly `www.samanthafernando.com` followed by a newline.
4. Update `.github/workflows/pages.yml` so the "Prepare public site" step copies `CNAME` into `_site`. The deployment artifact currently excludes root files other than `robots.txt` and `sitemap.xml`; without this change, the file would not reach GitHub Pages.
5. Commit and push the SEO, `CNAME` and workflow changes to `main`. Wait for the GitHub Actions Pages workflow to pass and deploy.
6. In GitHub repository Settings, open Pages and set the custom domain to `www.samanthafernando.com` if it has not been detected from the deployed `CNAME` file. Do not enable HTTPS enforcement until GitHub reports that its certificate is provisioned.
7. In Namecheap Advanced DNS, replace only the Squarespace website records:
   - Remove Squarespace apex (`@`) A records.
   - Add apex (`@`) A records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`.
   - Remove the old Squarespace `www` CNAME or verification CNAME only when it conflicts with the new record.
   - Add `www` as a CNAME to `nicholascaplan.github.io`.
8. Do not edit MX records or TXT records used for mail, SPF, DKIM or DMARC.
9. Leave Squarespace's domain connection in place during propagation. Disconnect it only after the GitHub Pages site is working on both production hostnames, or leave it connected if Squarespace allows the domain to remain configured without controlling DNS. Disconnecting first provides no benefit and can create avoidable downtime.

## Verification

Verify from a browser and an independent DNS checker after the records begin resolving.

1. Confirm `https://www.samanthafernando.com/` loads the GitHub Pages site without a certificate warning.
2. Confirm `https://samanthafernando.com/` resolves and redirects to the canonical `https://www.samanthafernando.com/` URL.
3. In GitHub Pages settings, confirm the custom domain is `www.samanthafernando.com` and enable "Enforce HTTPS" only after the option is available.
4. Confirm the page source contains the production canonical URL, social image URL and JSON-LD identifiers.
5. Confirm `https://www.samanthafernando.com/robots.txt` names the production sitemap and `https://www.samanthafernando.com/sitemap.xml` contains the production URL.
6. Submit one contact-form test and confirm it is delivered. Do not include personal or sensitive content in the test.
7. Test the core visitor flows: works filters, recordings, video modal, theme toggle, desktop/mobile navigation and contact form.
8. Confirm normal inbound and outbound email still works. If email fails, restore the recorded mail DNS values immediately and investigate separately from the web cutover.
9. Validate the deployed page URL with the [Schema Markup Validator](https://validator.schema.org/). Resolve syntax or vocabulary errors in the `Person`, `ItemList` and `MusicComposition` JSON-LD only; do not add irrelevant schema types to produce a richer result.
10. Run the deployed page URL through [Google's Rich Results Test](https://search.google.com/test/rich-results). A result stating that no rich-result type was detected is expected for the current `Person` and `MusicComposition` markup; investigate only page-fetch or structured-data errors.

## Rollback

Roll back if the production site fails to load reliably, the certificate cannot be issued within the agreed window or critical visitor flows fail.

1. In Namecheap, restore the saved Squarespace apex A records and `www` CNAME record.
2. Leave all MX and email-related TXT records unchanged.
3. Wait for the reduced TTL to propagate, then confirm both `www` and apex return to Squarespace.
4. In GitHub Pages settings, remove the custom domain or leave it until the issue is diagnosed. Removing it is optional for restoring visitor traffic because DNS controls the public routing.
5. Record the observed failure, the time of rollback and the DNS state before scheduling a new cutover.

## Notes

- The site is deployed through GitHub Actions, not Jekyll, so a `.nojekyll` file is unnecessary.
- Adding the `CNAME` file before DNS is changed does not alter Namecheap DNS, Squarespace or email. It is deferred here to avoid custom-domain redirects making the GitHub Pages staging URL less convenient before the cutover.
- GitHub Pages deployment artifacts must remain limited to public website files. Documentation and tests are not published.
