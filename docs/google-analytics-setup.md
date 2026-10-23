# Google Analytics Setup

This guide records the Google Analytics 4 (GA4) setup for Samantha Fernando's website.

## Current Implementation

- Property: the existing GA4 property for Samantha Fernando's website.
- Measurement ID: `G-N74SECKP5X`.
- Site integration: the shared runtime generated from `index.html` loads the GA4 tag dynamically only after a visitor accepts analytics cookies. Initial and enhanced-navigation page views are sent explicitly with the current page title and URL; automatic initial page views are disabled with `send_page_view: false`. Local mobile-preview iframes do not load GA4.
- Visitor controls: the initial banner provides Accept and Reject options. The footer's Cookie preferences control lets visitors reopen the notice and revise the choice. Rejecting analytics disables future GA collection for the page and clears this site's GA cookies.
- The Measurement ID is public by design because it is used in the rendered website. It is not a secret or an API credential.

## 1. Create A GA4 Property

1. Sign in at [Google Analytics](https://analytics.google.com/) with the account that should own the website analytics.
2. Select **Admin**.
3. Create or select an account for Samantha Fernando.
4. In the **Property** column, select **Create property**.
5. Name it `Samantha Fernando Website`, set the reporting time zone and currency, then complete the setup.

## 2. Create A Web Data Stream

1. In the property, open **Data streams** and select **Web**.
2. Enter `https://www.samanthafernando.com/` as the website URL.
3. Name the stream `Samantha Fernando` and create it.
4. Copy the Measurement ID. It has the form `G-XXXXXXXXXX`.

## 3. Implement Analytics With Consent

Do not load Google Analytics until a visitor has explicitly accepted analytics cookies. The implementation must:

- Show an accessible cookie banner with clear **Accept analytics** and **Reject** choices.
- Persist the visitor's choice locally.
- Load or enable the GA4 tag only after acceptance.
- Offer an always-available way to change the choice, such as a footer privacy link.
- Include a privacy-policy section explaining the use and purpose of Google Analytics and the consent mechanism.

The standard GA4 tag, with `G-XXXXXXXXXX` replaced by the real Measurement ID, is:

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    dataLayer.push(arguments);
  }
  gtag("js", new Date());
  gtag("config", "G-XXXXXXXXXX");
</script>
```

For this static site, the Measurement ID is intentionally public in the shared runtime. Do not put it in local environment files. The implementation uses a dynamically created script so consent controls when the tag loads; the generic snippet above is not a replacement for that implementation.

### Required Data-Stream Setting For Enhanced Navigation

In GA4 **Admin → Data streams → Web stream → Enhanced measurement → Page views → Advanced settings**, turn off **Page changes based on browser history events**. The site's router already sends explicit page views, so automatic history measurement would count navigations twice. `send_page_view: false` alone does not disable history-event measurement. This setting must be checked by someone with sufficient GA4 access; it is not managed by the repository or verified by mocked browser tests.

Google Consent Mode may support the configuration but does not replace the banner, visitor choice, or privacy policy.

## 4. Start With Standard Reporting

Initially enable standard GA4 page-view measurement only. It provides broad traffic sources, page views, device categories and geography. Consider custom events only when they are agreed, such as:

- SoundCloud or Spotify playback starts.
- YouTube modal opens or video plays.
- Outbound social, ticketing or email links.
- Contact-form submissions.

Avoid sending personally identifiable information to GA4.

## 5. Test Before Deployment

1. Build the site with `npm run build:test`, then serve `_site/` with `npm run serve`.
2. Open the site and reject analytics. In browser developer tools, verify that no GA requests occur.
3. Change the choice to accept analytics and verify GA requests then occur.
4. In Google Analytics, open **Reports > Realtime** and confirm a test visit and subsequent page changes appear once each, with the correct URLs/titles. Initial data can take several minutes. Confirm the history-measurement setting above before release.
5. Run the repository's browser tests with `npm test`.

## 6. Publish

1. Commit the `index.html`, consent UI, privacy-policy and relevant test changes.
2. Push to `main` when ready. The existing GitHub Pages workflow deploys from that branch.
3. Check the deployed site and GA4 Realtime reporting again.

Before deployment, confirm the Google Analytics account is administered by Samantha or another durable site owner. The current account access does not grant the maintainer an Administrator role.
