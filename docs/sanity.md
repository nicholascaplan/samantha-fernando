# Sanity Operations

Operational guide for the Sanity CMS that manages site content. Settled design decisions are in `docs/project-brief.md`; the content itself is in `docs/content.md`. Never record tokens or secrets here.

## Key Locations

| What | Where |
|---|---|
| Sanity Studio (editing) | https://samantha-fernando.sanity.studio |
| Sanity Manage (project settings) | https://www.sanity.io/manage/project/9a66iw1t |
| API settings and webhooks | https://www.sanity.io/manage/project/9a66iw1t/api |
| Members and roles | https://www.sanity.io/manage/project/9a66iw1t/members |
| Project ID and dataset | `9a66iw1t`, `production` (public identifiers) |
| Studio source | `studio/` in this repository |
| Studio hostname | `samantha-fernando` (app ID is pinned in `studio/sanity.cli.ts`) |

Studio is where content is edited. Manage is where the project is administered: members, webhooks, API tokens, CORS and plan. Webhooks are not in the Studio.

## How Publishing Works

1. An editor changes a document in the Studio and clicks **Publish**. Biography is active; catalogue publishing requires the activation steps below.
2. The Sanity webhook `Trigger site deploy` sends a `repository_dispatch` event (`sanity-content-published`) to GitHub.
3. The Pages workflow (`.github/workflows/pages.yml`) runs the tests, builds the site with `npm run build:content` and deploys it.
4. The change is live in about two minutes.

Only published content is used. Drafts never affect the site. The build reads the published perspective directly from the API, without CDN caching. If Sanity is unreachable or content is incomplete, the build warns and ships the corresponding committed fallback in `index.html`. Biography and the complete Works & Media snapshot fall back independently.

The build resolves content before generating the page set: Biography goes to `/biography/`, and the same catalogue snapshot supplies `/works/` HTML, composition structured data and playback configuration on every page. No Studio/schema/webhook changes are required for these routes. `npm run build:test` deliberately skips Sanity for deterministic local tests; use `npm run build:content` to verify a published edit and serve `_site/`, not the repository root.

The Pages workflow also rebuilds and deploys daily at **8am UK time** (`Europe/London`, automatically following GMT/BST), independently of the publish webhook. The schedule becomes active once `.github/workflows/pages.yml` is on `main`. GitHub Actions may delay or drop scheduled runs under high load, so 8am is the requested start time, not a guaranteed live-update time. GitHub disables schedules in public repositories after 60 days without repository activity; re-enable the workflow in Actions if this happens.

## Editing Content (Editors)

- Sign in at the Studio URL and open **Biography Page**.
- Use bold for ensemble and organisation names and italic for work titles. Follow the copy conventions in `docs/content.md`: British English, no em dashes, no Oxford commas. The Studio blocks em dashes, requires image alt text and requires four-digit milestone years; it cannot check spelling or commas.
- There is no live preview. Publish, wait about two minutes, then check the live page. Sanity keeps document history, so earlier versions can be restored from the document's history menu.
- The hosted Studio exposes Biography and the Works & Media schemas. The initial 48-document catalogue import and website deployment are complete. The Works & Media webhook filter was updated and its Settings-document trigger was verified on 7 October 2026. Catalogue edits can now trigger rebuilds. Other sections move over one at a time (see `docs/next-steps.md`).

### Works & Media Editing (After Activation)

- Open **Works & Media**, then **Works**, **Recordings (Listen)**, **Films (Watch)** or **Settings & Default Recording**.
- A Work holds composition metadata. A Recording or Film optionally references a Work, so changing a composition title does not disconnect its media. Publish the Work before attaching and publishing media.
- Recording/publication year and track duration are separate from composition year and duration. Leave optional unknown values blank rather than inventing them. Tracks from a song cycle reference the cycle, not new standalone Work documents.
- Paste a full public Spotify track, SoundCloud track or YouTube video URL. Private SoundCloud access-token links, short share links, playlists and artist/album pages are not supported. The dataset is public, so never paste private access tokens into it. No audio/video upload is needed. Spotify actions say **Preview**; SoundCloud actions say **Listen**.
- **Media-action order within the Work** controls button order across its recordings and films. Lower numbers come first; use distinct numbers when ordering matters. Catalogue views remain newest first, then alphabetical.
- In Settings, select a published **Default header recording** from either audio provider. With no default selected, the header Listen control opens the catalogue. Stop restores the default selection. Optional Recording **Soundbar label** overrides its title.
- Remove a default selection and any Work references before deleting referenced documents. Unpublishing removes a document from the next successful build; drafts remain private. An unpublished related Work no longer supplies a category or a Work action, but its published media remains available.
- An intentionally empty published list stays empty. Invalid published content or a network error uses the entire committed catalogue fallback, including its structured data. Check the build warning if a publication appears not to take effect.

### Catalogue Activation (Maintainers, Approval Required)

The Studio deployment, initial import, website deployment and webhook update are complete. Keep the Biography-only webhook filter during import to avoid a deploy for every created document if repeating the initial seed process.

1. Run unit/browser tests and Studio type/schema checks. **Completed 7 October 2026:** unit tests, TypeScript check, schema validation and Studio build passed. The Playwright suite could not launch Chromium because macOS denied Chromium Mach-port registration in BoxedCode; generated-site browser review was done with the available desktop browser tool. Studio schemas were deployed with `npm run deploy`; Sanity reported `Deployed 1/1 schemas` and `Success!` at the hosted Studio URL.
2. From `studio/`, run `npx sanity exec scripts/seed-catalogue.ts --with-user-token`. **Completed 7 October 2026:** 48 documents created (23 Works, thirteen Recordings, eleven Films and Settings); existing content was left unchanged. Sanity generated ordinary document IDs; source keys make reruns skip existing content.
3. Run `npm run build:content` from the repository root and confirm **Works & Media rendered from Sanity**, not a fallback warning. **Completed 7 October 2026:** build rendered Biography and Works & Media from Sanity. A local HTTP review confirmed 23 Works, thirteen Recordings, eleven Films, the selected default Recording, all views and the YouTube modal.
4. Deploy the website code and verify GitHub Pages Actions. **Completed 7 October 2026:** commit `d0888f6` deployed successfully in workflow run `37676994880` (test and deploy jobs passed). Live-site propagation was not independently checked because the published GitHub Pages URL is blocked from BoxedCode. The configured webhook filter is:

   ```groq
   _type in ["biographyPage", "worksMediaSettings", "work", "recording", "film"] && !(_id in path("drafts.**"))
   ```

   Keep Create, Update and Delete enabled and Drafts off. Type-based filtering covers new ordinary documents with generated IDs as well as unpublish/delete events.
5. **Completed 7 October 2026:** verified that updating the published `worksMediaSettings` document dispatched repository_dispatch event `sanity-content-published`; Pages workflow runs `37682942324` and `37683304284` passed. A temporary non-rendered marker was added and removed, leaving no visitor-visible content change. Still verify a real Recording add/edit/unpublish and both default-recording providers during normal content operations. Confirm the live result outside BoxedCode; sandbox access to the public website is restricted.

Keep Create, Update and Delete triggers enabled and Drafts off. The dispatch verification confirms the published Settings document matched the configured webhook and GitHub accepted the event.

## Members And Roles

- Manage members at the Members link above. Invite people by email; they can sign in with Google, GitHub or email.
- Give editors the **Editor** role. It allows editing and publishing content but not changing members, webhooks or the dataset. Reserve **Administrator** for site maintainers.
- Samantha was invited as an Editor on 7 October 2026.

## Publish Webhook

Configured under **API**, then **Webhooks** in Sanity Manage.

The webhook URL uses the renamed repository endpoint below. After any repository rename, update this URL in Manage rather than relying on redirects for the POST request. Leave the Authorization header unchanged and verify a new `repository_dispatch` workflow run after a test publication.

| Field | Value |
|---|---|
| Name | `Trigger site deploy` |
| URL | `https://api.github.com/repos/nicholascaplan/samantha-fernando/dispatches` |
| Dataset | `production` |
| Trigger on | Create, Update, Delete |
| Filter | `_type in ["performance", "biographyPage", "worksMediaSettings", "work", "recording", "film"] && !(_id in path("drafts.**"))` |
| Projection | `{"event_type": "sanity-content-published"}` |
| Method | `POST` |
| Headers | `Authorization` set to `Bearer <token>` (word `Bearer`, one space, no colon) and `Accept: application/vnd.github+json` |
| Drafts | Off |

The table reflects the live filter verified on 27 October 2026. Keep all existing types when adding a new content type.

### GitHub Token

The header uses a GitHub fine-grained personal access token. It is stored only in the webhook's headers in Sanity Manage; never put it in the repository, docs, logs or chat.

- Repository access: only `nicholascaplan/samantha-fernando`.
- Permissions: **Contents: Read and write** (required for `repository_dispatch`) and the mandatory read-only **Metadata**.
- **Expiry: 90 days.** The current token was created on 7 October 2026 and expires on or about **5 January 2027**. Check the exact date in GitHub under Settings, Developer settings, Personal access tokens, Fine-grained tokens.
- **Renew before it expires.** An expired token fails silently for editors: publishing still works in Sanity but the site is not rebuilt.

To renew: create a new token with the same repository and permissions, edit the webhook's `Authorization` header to `Bearer <new token>`, publish a small test edit and confirm a `204` in the webhook's attempts log and a new "Deploy GitHub Pages" run. Then delete the old token and update the expiry date in this document.

### Troubleshooting

Open the webhook in Manage and check **Attempts**.

| Result | Meaning |
|---|---|
| `204` | GitHub accepted the dispatch. A "Deploy GitHub Pages" run should start within seconds. |
| `401` "Requires authentication" | The `Authorization` header is missing or lacks the `Bearer ` prefix. |
| `401` "Bad credentials" | The token is wrong or has expired. Renew it. |
| `403` or `404` | The token lacks Contents write access, is not scoped to `samantha-fernando`, or the URL is wrong. |
| `422` | The projection is not `{"event_type": "sanity-content-published"}`. |
| No attempt | The trigger or filter did not match, or the edit was only a draft. |

If the webhook cannot be fixed immediately, deploy manually with `gh workflow run "Deploy GitHub Pages"`; the build reads published content.

## Studio Development

All commands run from `studio/`.

```bash
npm run dev      # local Studio at http://localhost:3333
npm run deploy   # publish schema changes to the hosted Studio (needs `npx sanity login`)
npx sanity schema validate
npx tsc --noEmit
```

- Schema changes must be deployed with `npm run deploy` before editors see them. The hosted Studio auto-updates the Sanity version.
- Biography is a singleton with the fixed document ID `biographyPage`. Follow the same pattern for new singletons: fixed ID, hidden from generic lists and no duplicate, delete or unpublish actions (see `studio/structure.ts` and `studio/sanity.config.ts`).
- `studio/scripts/seed-biography.ts` recreates the Biography document from the original copy: `npx sanity exec scripts/seed-biography.ts --with-user-token`. It overwrites the published document, so use it only to restore or reseed.
- `studio/scripts/seed-catalogue.ts` is non-overwriting; follow Catalogue Activation above. Keep import source keys and legacy playback keys hidden/read-only in Studio.
- `npx sanity build --no-auto-updates` checks the local Studio bundle without fetching the hosted auto-update module. This does not alter hosted Studio configuration. The normal auto-update build needs network access to `sanity-cdn.com`.
- Document history and the dataset live in Sanity, not in this repository.

## Sandbox Note For Maintainers

When working inside BoxedCode, the sandbox allowlist in `~/.nwb/box/box.json` must include `api.sanity.io`, `9a66iw1t.api.sanity.io`, `9a66iw1t.apicdn.sanity.io` and `cdn.sanity.io` for the build and Studio commands to reach Sanity. Hosted auto-update Studio builds also need `sanity-cdn.com`; the local-only check can use `--no-auto-updates` instead.


## Performances

The performance implementation adds a **Performances** document list in Studio. Each record holds a title, display date label, sorting start date, optional final date, description and optional HTTPS event link. Only published documents reach the public website. For a month-only range such as May/June 2027, use 1 May and 30 June for sorting/grouping and retain "May/June 2027" as the display label; these are grouping bounds, not claimed performance dates. Exact dates need only a start date. Keep supplied qualifiers and unknown details blank.

Production builds query Performance documents independently of Biography and the catalogue. Invalid/unavailable content uses `content/performances.json` as a complete fallback; an intentionally empty published list stays empty. Tests use the committed records at a fixed fixture date. The daily rebuild classifies dates in Europe/London; no page timer is used.

### Activation steps

These steps require an authenticated maintainer and are not completed merely by merging website code:

1. Deploy the updated Studio/schema with `npm run deploy` from `studio/`.
2. Run `npx sanity exec scripts/seed-performances.ts --with-user-token` from `studio/`. It adds missing imported records and never overwrites an existing record or draft with the same source key.
3. Verify the published records in Studio and run the normal production build. It must report `Performances rendered from Sanity`, with the supplied upcoming and past entries present.
4. In Manage, inspect the current **Trigger site deploy** webhook. Add `performance` to its existing type filter while preserving its other types, dataset, destination and headers. Do not replace or expose its credential. The operational notes above contain conflicting historic filter examples, so inspect the live filter rather than copying either.
5. Verify a real performance publication triggers the existing repository dispatch and, after an approved website merge/deploy, check the public output. Editor verification and publication-to-site verification are separate checks. Do not report that publication reaches the site until the latter is verified.

### Activation record - 27 October 2026

- Updated existing hosted Studio and schema deployed.
- Non-overwriting import created 14 published Performance documents (3 upcoming, 11 past at activation).
- Normal production build confirmed Performances rendered from Sanity.
- Existing enabled production webhook filter now includes performance, with other types, destination, projection and headers preserved; saved state reloaded and checked.
- Hosted exact-date (Fretwork) and month-range (Marian Consort) forms were visually checked with the expected fields and values. Initial loading delays resolved without package, account or CORS changes. No draft or publication was created for this check.
- Publication-to-dispatch verification is deliberately deferred until website merge/deploy is authorized. No test edit was published merely to trigger current main.
- After the website deployment, replace this pending publication check with its verified outcome and deployment reference.
