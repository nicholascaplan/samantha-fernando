# Design decisions

## Phone display headings

Proposal for review: use one smaller phone display-heading treatment across Featured, Works, Listen, Watch, Writing, Contact and Privacy. Keep uppercase Cinzel and reduce the size and tracking together so current words fit narrow columns when visitors enlarge text. Text sizing remains relative to the visitor's root size; tablet and desktop are unchanged.

The shared `main :is(h1, h2).font-display` hook intentionally covers future display headings inside main content too. It excludes navigation, footer labels, performance headings and inner card titles. New display headings need the same narrow-column and enlarged-text checks. Do not remove emergency wrapping globally to force words onto one line.

This proposal is separate from the performance-heading proposal. The Writing essay card has a distinct narrow-column word-wrap issue that this rule does not fix.
