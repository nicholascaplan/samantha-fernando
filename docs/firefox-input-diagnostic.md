# Temporary Firefox input diagnostic

Based on82b208d, with unchanged website source and generated assets. This branch is for evidence collection, not merge or release. The Firefox job runs only the diagnostic comparison; it does not replace the full PR39 gate.

Eight cases preserve the existing menu reachability assertions at100% and200% text, with the existing30second timeout and no retries. Compare live versus blocked media providers, and default Firefox speech error notices versus suppressed notices. Suppression is a diagnostic variable, not a permanent runner remedy. Click event, stored consent, banner and menu state, console errors and full traces are retained. Other browser jobs remain ordinary checks.

PR39 remains unchanged and blocked until the failed menu gate is explained and a reviewed remedy passes the full checks.
