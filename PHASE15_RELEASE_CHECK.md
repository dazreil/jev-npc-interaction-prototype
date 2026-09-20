# Phase 15 release check

Date: 20 September 2026

## Automated gate

```text
npm run evaluate:phase15  PASS
57 tests passed
Dialogue lint passed: 12 actions, 204 authored fragments, 13 template entries, 7 branches, 220 possible rendered lines.
Phase 15 release audit passed: 14 portrait assets present, 111 KiB of lazy reaction art, 3 immediate preloads.
```

The audit confirms that all portrait references resolve, reactions stay below the release budget, speech and reactions are not preloaded, the credits and diagnostics dialogs exist, reduced-motion stops the player-avatar animation, and the deployment/server files are present.

## Browser smoke checks

| Browser | Result | Evidence |
| --- | --- | --- |
| Safari 26.0.1 | Pass | `http://localhost:5173` booted to Ready; Mock transmission completed; player silhouette, Credits, and focus restoration verified. |
| Chrome 153.0.8010.48 | Pass | `http://localhost:5173` booted to Ready; Mock transmission completed; Credits and Developer telemetry opened and closed; Arthur state and action remained visible. |
| Firefox | Not run | Firefox is not installed on the verification machine. |
| Edge | Not run | Edge is not installed on the verification machine. |

The unrun browsers are still part of the release target. The implementation uses the browser-standard paths already covered by unit tests and keeps Web Speech and timed-caption fallbacks for media failures. A final public release should repeat the smoke matrix in current Firefox and Edge builds.
