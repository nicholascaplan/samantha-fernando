# Should `index.html` Be Split?

## Current Decision

Generate separate static pages for substantial sections, using one shared source template rather than duplicated hand-maintained documents. The approved constraints are in [project-brief.md](project-brief.md); build and local-server commands are in [README.md](../README.md).

## Rationale

- Individual pages need search visibility, social previews and directly loadable URLs.
- Each page ships only its primary section, not the entire site's inactive tabs.

## Trade-Off

Full document navigation interrupts audio. Ordinary page links are therefore progressively enhanced to retain the media shell, while direct loads and fallback navigation remain functional. Shared templates avoid duplicated navigation, theme and player code.

## Deferred

Individual composition pages require a content review before adding routes. Listen and Watch remain filters within Works & Media, not standalone search pages.
