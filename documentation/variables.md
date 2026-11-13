# Configuration

| Name or value | Used by | Scope / source | Risk or boundary |
| --- | --- | --- | --- |
| PORT, default 5174 | Production static server | Node process environment | Integer 1–65535; host remains 127.0.0.1 |
| emg-garden.saved-results.v1 | Results store | Browser localStorage | Up to 50 per-round summaries, no silent eviction |
| 2000 Hz / 400 samples / 100-sample hop | Processing and replay | Fixed code / exported configuration | Models and files must match these settings |
| 20–450 Hz / optional 50 Hz notch | Processor | Fixed filter setup and recorded notch metadata | Unknown legacy notch is shown as unknown; replay applies no notch |
| ADC reference / adcMax | Conversion and quality | Validated serial packets or CSV metadata | Unknown values cannot verify clipping |
| 2,400,000 samples / 240 MB CSV | Recording and file input | Fixed bounded limits | Long files require browser memory; never unbounded buffering |
| 20 MB result JSON | Result import | File size and parser checks | Large incompatible files reject without replacing current data |
| Comfortable B, R, rest threshold | Water and results | Per-reference calibration | Not MVC, grip force or a health score |

There are no API keys, client-side secrets, tokens or paid-service credentials in this application. No environment file is required. The build bundles local code and system-font styling; hardware is not needed to run simulation. Optional speech cues depend on browser/OS speech support.

## Before delivery

- Run npm ci when installing from the lockfile, then npm test and npm run build.
- Confirm the running application/version/build identity, not only an occupied port.
- Keep the normal launcher at port 5174 for the same browser-storage origin. A separate test port has separate saved results.
- Review source/data provenance and keep private exports outside the source package.
- Do not mark real-device or clinical checks complete from simulation results.
