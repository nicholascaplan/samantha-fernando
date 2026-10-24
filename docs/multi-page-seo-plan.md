# Multi-Page SEO Migration Plan

Status: implementation approved, with legacy bookmark support explicitly excluded. The sections below describe the migration requirements, not an outstanding-work checklist. Current architecture is recorded in [project-brief.md](project-brief.md), commands and behaviour in [README.md](../README.md), and remaining release verification in [next-steps.md](next-steps.md). Deployment still requires separate explicit approval.

## Goal

Give substantial sections their own indexable HTML pages, titles and descriptions while preserving the current design, Sanity publishing, catalogue behaviour and continuous audio during normal in-site navigation. Do not introduce a visual redesign, hosting migration or browser-time CMS dependency.

Separate pages create clearer search landing pages; they do not guarantee improved rankings.

## Approved URL Structure

| URL | Purpose | Initial scope |
|---|---|---|
| `/` | Existing quote-led homepage and Spotlight Works | First release |
| `/biography/` | Full biography | First release |
| `/works/` | Works & Media catalogue | First release |
| `/listen/` | Recording catalogue, Listen view preselected | Added 24 October 2026 |
| `/watch/` | Film catalogue, Watch view preselected | Added 24 October 2026 |
| `/writing/` | Writing introduction and complete existing essay, portrait and video | First release |
| `/contact/` | Enquiry form | First release |
| `/works/<work-slug>/` | Individual composition detail | Later, after content review |

- Keep Works, Listen and Watch as navigation entry points into the same catalogue. Use `/works/`, `/listen/` and `/watch/`; Listen and Watch are standalone indexable pages rendered from the shared catalogue template with their view preselected, each with its own title, description and social metadata.
- Do not put search results or preview modes in the sitemap. The retired `/works/#listen` and `/works/#watch` fragment views redirect to the new pages.
- Use lowercase, stable, hyphenated slugs and trailing-slash page URLs. Do not silently change a published slug when a title changes.
- With only one essay, preserve the complete reading experience directly at `/writing/`; do not introduce a summary-only overview or an extra detail route.

## 1. Confirm Scope And Capture The Baseline

- Approve the URL map. Listen and Watch were promoted from catalogue filters to standalone pages on 24 October 2026 after the first release.
- Preserve continuous playback through enhanced navigation; normal full-page loads may reset playback. Do not attempt autoplay or playback restoration after a reload.
- Record existing routes, desktop/mobile navigation, score-request links, modal behaviour, theme, analytics consent and iframe-preview behaviour as migration acceptance cases.
- Capture the current automated-test result and representative light/dark desktop/mobile screenshots. Record any existing cross-browser blockers separately from migration regressions.
- If Search Console is available, record current indexed URLs and landing-page performance for comparison after launch; access is not a prerequisite for implementation.

Exit: route contract and behavioural acceptance cases agreed before replacing the single-page architecture.

## 2. Establish A Shared Static Build

- Introduce a small static template layer with a shared document shell, head metadata, navigation, footer and persistent media controls. Prefer extending the existing Node build; do not add a large client framework solely for routing.
- Separate page bodies from shared CSS and JavaScript. Organise browser code into shell/media behaviour and page-specific initialisers with explicit cleanup.
- Extend `scripts/build-content.mjs` to render each route as a real directory containing `index.html`, so direct requests work on GitHub Pages without SPA rewrites.
- Retain build-time Sanity rendering and the existing independent Biography/catalogue fallbacks. Extract the committed fallback content into explicit source inputs as needed; do not leave duplicate editable copies in old and new templates.
- Fetch and validate content before rendering the route set. Use one catalogue snapshot for HTML, playback configuration and structured data; never fetch Sanity in the browser.
- Move asset references to paths that work at every route depth, including downloaded CMS portraits, thumbnails, icons, fonts and scripts.
- Update Tailwind's content paths to include templates and shared renderers; rebuild `assets/tailwind.min.css` after utility-class changes.
- Produce a clean staging output from an explicit public-file allowlist and verify that repeated builds do not retain removed routes.

Exit: all proposed pages can be served directly from generated output, with no dependency on client-side routing.

## 3. Make Page Content Crawlable And Distinct

- Render each page's primary text, headings and internal links into the initial HTML. A page must not contain the entire site with inactive sections hidden.
- Render the initial Works catalogue as real HTML rather than relying on the retired browser-only renderer; changing the URL alone would not address that dependency.
- Enhance the initial catalogue with existing filters, search, media actions and modals without duplicating its content or changing its default ordering.
- Keep essential content and ordinary navigation usable with JavaScript disabled. Media widgets, filters and the enhanced contact submission may still require JavaScript; provide appropriate fallback links or explanations.
- Generate a unique title, description, canonical URL and social metadata for each page. Keep Samantha's identity consistent across routes.
- Adapt the existing structured data to the pages it describes, with stable identifiers and composition references. Do not promise rich results or add unsupported third-party recording metadata.
- Generate `sitemap.xml` from the public canonical route registry. Retain the canonical domain and appropriate `robots.txt`; do not invent last-modified dates on every build.
- Keep useful contextual links: homepage to key sections and catalogue score enquiries to Contact. Writing contains the full essay directly.

Exit: inspecting a direct HTML response reveals the correct page content and metadata without running JavaScript.

## 4. Preserve Playback With Progressive Navigation

- Use ordinary `<a href>` links for page navigation. Opening in a new tab, copying links and navigating without JavaScript must work normally.
- Enhance eligible same-origin page clicks by fetching the destination HTML and replacing only the page-content region. Keep the shell, audio controllers and provider iframes alive outside that region.
- Replace the current hash-tab router with route-aware navigation. Update title, description, canonical/social metadata, structured data and active-navigation state alongside page content.
- Initialise the destination's controls once and dispose of departed-page listeners, observers and transient UI. Close modals safely before replacing their triggers.
- Implement browser back/forward restoration, deliberate-navigation scroll/focus handling, accessible navigation announcements and mobile-menu dismissal. Preserve normal fragment scrolling for essay anchors.
- Keep modified clicks, downloads, external links, form submissions and same-page interactions outside interception. On navigation-fetch failure, fall back to normal page navigation.
- Preserve selected media, provider mutual exclusion and soundbar state across enhanced page changes. Do not initialise duplicate provider widgets.
- Update the mobile-preview iframe to load and synchronise real page URLs while retaining recursion prevention and theme behaviour.
- Ensure consented analytics records one page view per completed navigation, without duplicates; do not load analytics or send events when consent is absent or rejected.

Exit: normal in-site page changes preserve playing audio, while direct loads and failed enhancement remain functional.

## 5. Safe Hosting Behaviour

- Do not add redirects or compatibility handlers for old root fragments; existing-bookmark support for them was explicitly removed from scope. The retired `/works/#listen` and `/works/#watch` fragment views redirect to `/listen/` and `/watch/`.
- Keep the root homepage as the canonical root. Unknown paths must return a genuine not-found response rather than displaying the homepage with a successful status.
- Update internal links, structured-data URLs and the sitemap together. Do not change DNS or the custom domain for this migration.
- Maintain the explicit publication allowlist for the enumerated page directories, required hosting/SEO files and public assets; reject unexpected or stale output rather than silently broadening the artifact.
- Continue excluding Markdown, source templates, tests, Studio, package/workflow files and repository metadata from the artifact.

Exit: valid nested pages load directly and unknown routes do not become soft 404s.

## 6. Test The Built Site And Update Documentation

- Unit-test route generation, page metadata, static catalogue output, fallback rendering, HTML escaping, sitemap contents and the artifact allowlist.
- Add a deterministic build mode using committed fallbacks or fixtures so CI does not require live Sanity. Also exercise the production build path with mocked successful and failed CMS responses.
- Change the Playwright server to serve generated output, not the repository root. Adapt catalogue fixtures to the new build without losing provider-mocking coverage.
- Test every route through direct load, refresh, ordinary links, modified clicks and back/forward. Verify nested assets and a genuine missing-page response.
- Add JavaScript-disabled checks for primary page content, links and the initial Works catalogue; keep media tests against mocked providers.
- Retain light/dark, responsive, enlarged-text, keyboard, modal, contact, consent, mobile-preview and accessibility coverage. Verify page changes do not leak duplicate handlers or reset audio.
- Add metadata assertions for both direct loads and enhanced navigation, including one consented analytics page view per navigation.
- Run `npm run build:css`, `npm run test:unit`, `npm test` and `npm run test:all`; distinguish test failures from browser-launch/environment blockers.
- Make `.github/workflows/pages.yml` test the generated multi-page artifact before deployment, not only the source fallback. Keep live-content validation in the production build.
- Update `README.md`, `docs/project-brief.md`, `docs/test-strategy.md`, `docs/hosting.md` and affected Sanity guidance to describe the implemented architecture. Update `docs/content.md` for the content split and new page metadata, without duplicating its inventory here.
- Reconcile existing preview and CMS follow-ups in `docs/next-steps.md` with the implemented architecture; do not leave instructions referring to retired source regions or hash-only routes.

Exit: generated-site checks pass, remaining verification limits are documented and operational instructions match the implementation.

## 7. Launch Only With Explicit Approval

- Review changed files and generated public output for secrets, personal data and accidental maintainer content before committing or pushing.
- Obtain explicit approval to push/deploy. Planning or implementation approval alone is not deployment approval.
- Verify the GitHub Pages Actions workflow succeeds. Check direct nested URLs, metadata, forms and real provider playback outside BoxedCode; the sandbox cannot fetch the published domain.
- Submit the updated sitemap in Search Console if owner access is available, and request indexing for the main new pages. Monitor indexing, missing URLs and landing-page performance over subsequent weeks; do not judge the outcome from immediate rankings.
- Follow [hosting recovery](hosting.md#recovery) if a regression requires a recovery deployment. Do not reset shared history or change DNS as a rollback mechanism.

## Later: Individual Work Pages

Review composition content before adding routes. Publish only pages with useful work-specific information such as instrumentation, duration, programme notes, commission/premiere details, available recordings and a score-enquiry link. Do not generate thin duplicates merely to increase the page count.

If approved, add stable work slugs, dedicated templates, contextual catalogue links, page-specific metadata/structured data and sitemap entries. Keep the existing Work/Recording/Film references; the Listen and Watch pages remain views of the shared catalogue, not separate content sets. Handle future slug changes deliberately; true HTTP redirects would require a hosting capability beyond plain GitHub Pages.

