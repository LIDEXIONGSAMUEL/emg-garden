# Test map

## Existing automated coverage

| Use case and rule | Expected behavior, including failure | Evidence | Status |
| --- | --- | --- | --- |
| Signal processing | Offset removal, state across packets, gaps reset, clipping/unknown quality distinguished | src/signal.test.ts | Existing |
| Recording format | Provenance and 5 V ADC configuration round trip; malformed/mixed metadata rejects; legacy unknowns preserved | src/signal.test.ts | Existing |
| Bounds and time | Safe indices, window midpoint, exact sample bound accepted and excess rejected | src/signal.test.ts | Existing |
| Fixed protocol | 30 trials, unchanged pre/post conditions, full hold segment, pause/gap invalidity | src/session.test.ts, src/engine.test.ts | Existing |
| Classifier collection | Whole windows omit transitions; only last two trials/class held out | src/session.test.ts | Existing |
| Classification display | Current prediction must agree with the temporal majority and meet 0.60; class changes/low confidence export null pairs | src/engine.test.ts | Added in 1.0.1 |
| Model evaluation | Whole-trial split, training-only statistics, invalid labels rejected | src/model.test.ts | Existing |
| Traceability/capacity | Named events, timing ranges, condition reference; insufficient capacity preserves state | src/engine.test.ts | Existing |
| Saved results | Upsert/reload, independent rounds, legacy import, invalid/large files, full/blocked store and isolated delete | src/records.test.ts | Existing |
| User interface | Full simulation, refresh/read-only result review, separate downloads, guarded source changes, replay controls, hidden held-out feedback, failed-save download | src/App.test.tsx | Existing |
| Guided cues and relaxation | Consistent SVG hand cues, matching optional speech, current sustained rest only, first renewed activity immediately clears check | src/App.test.tsx, src/session.test.ts | Added |
| Synthetic stress checks | Unchanged normal waveform; deterministic eight-second disturbance, recovery, exact omitted indices, no paused scoring | src/simulation.test.ts | Added |
| Check integration | Logged start/end/cancel, reference/collection exclusion, post-gap warm-up disables Continue, explicit resume, stop clears countdown | src/App.test.tsx | Added |
| Production server | Static MIME/HEAD, path and symlink safety, wrong methods, matching and wrong occupied ports, absent builds | scripts/serve.test.mjs | Existing |

npm test runs the full application suite and actual Node HTTP fixture tests. npm run build checks TypeScript and produces the static bundle. The shared repository does not yet enforce these as remote merge gates; contributors must run them and include evidence before review.

The 2026-10-24 release check passed 71 application tests and 6 server tests. Final-review regressions also prevent a deleted earlier round returning on a later save, a later fitted model rewriting earlier model evidence, and contradictory imported timings/metrics. Historical session exports without per-round model evidence retain a null report rather than borrowing the newest report.

The later guided-feedback update on the same date passed 92 application tests and 6 server tests. This adds 21 regression cases without changing the protocol or recording schema. Independent review reproduced and verified the fixes for first-frame relaxation removal, post-gap processed-window readiness and cancelled-check cleanup. See STATUS.md for separate browser evidence.

## Guarded browser checks

Use target Mac Chrome against the production build. Record actual results in STATUS.md, not inferred from this checklist.

- Full synthetic reference, familiarization pause/resume and 30-trial completion.
- 18 example trials, held-out feedback hidden, operator review and kNN fitting.
- Reopen saved results after refresh without restarting scoring.
- Import valid/invalid recordings; verify replay pause, restart, end and source/config retention.
- Confirm local file downloads, save warnings and result deletion in disposable synthetic fixtures only.
- Check readable layout, keyboard access and clear unsupported-device behavior.

## Remaining independent validation

| Gap | Type | Why it remains separate |
| --- | --- | --- |
| Acquisition board, rate, electrical compatibility, clipping and disconnection | Guarded real-hardware test | No compatible EMG device is available |
| Real labelled data and held-out performance across recordings/people | Research evaluation | Synthetic separability cannot prove generalization |
| Intended older-user comprehension, comfort and safety | Supervised usability review | Developer/browser checks do not replace target-user testing |
| Rehabilitation or cognitive benefit | Appropriate clinical study | No such outcome is established by this release |

These gaps do not turn synthetic results into real measurements. They remain explicit limitations of the device-independent software release.

The 2026-11-13 version 1.0.1 check passed 94 application tests, 6 server tests and the production build. Two new tests reproduced the confidence mismatch before the fix and passed afterward. See STATUS.md for browser and real-device validation boundaries.
