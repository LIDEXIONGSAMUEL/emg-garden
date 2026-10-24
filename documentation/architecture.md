# Architecture

EMG Garden is a local browser application for comfortable forearm-control biofeedback research. The device-independent release provides synthetic demonstration, waveform inspection, a fixed protocol, optional kNN testing and saved results. It does not establish treatment effectiveness or validate an acquisition device.

| Part | Responsibility |
| --- | --- |
| React / App.tsx | English instructions, gardening feedback, replay controls, result review |
| signal.ts | 2 kHz input validation, continuous filters, 200 ms features, CSV metadata |
| session.ts | Reference, 18 classifier trials and fixed 6/18/6 training |
| model.ts | Training-only scaling, k=5, whole-trial split and held-out window evaluation |
| engine.ts | Sample clock, condition references, events, recording limits and integration |
| records.ts | Validated per-round summaries and atomic browser-local storage |
| scripts/serve.mjs | GET/HEAD-only production static server on 127.0.0.1 |

Water uses normalized RMS, not classifier confidence. Frame time is the sample-interval endpoint used by scoring. centerTime is the midpoint of that complete window interval. Trial ranges and sample indices allow review against raw recording. Interrupted trials remain invalid even when subsequent data resumes.

There is no login, remote database, server-side session or role token. The server receives ordinary asset requests, not physiological recordings. File input crosses from a user-selected local file into a validated browser data structure. Browser storage belongs to the local origin and profile, not to a patient account. Source labels in imported files are declarations, not cryptographically verified measurements.

## Known boundaries

- Real serial-device timing, electrical compatibility and electrode placement remain unverified.
- The raw buffer has a 20-minute sample budget; full-step capacity is checked before starting. Long pauses can still exhaust it; completed results remain available.
- Only result summaries persist automatically. Browser/profile/port changes or clearing browser data can make them unavailable. Raw waveform backup requires an explicit CSV download.
- Legacy CSV has unknown ADC/source/notch metadata. Replay is inspection-only and never receives new task labels or scores.
- Summary import supports the documented 0.1.0, 0.1.1 and 1.0.0 schemas. It rejects incompatible conditions rather than silently rescaling them.
- There is no participant-independent or clinical validation. Synthetic classifier results are software checks only.

No scheduled work, email, public indexable routes or embedded tool-using AI agents exist, so cron.md, emails.md, seo.md and automation.md are not applicable. The local kNN model cannot call tools or modify files.

## Related documents

- [Data and permission flows](flows.md)
- [Permissions and privacy](permissions.md)
- [Configuration](variables.md)
- [Test evidence and remaining gaps](tests.md)
- [User guide](../README.md)
- [Current release status](../STATUS.md)
