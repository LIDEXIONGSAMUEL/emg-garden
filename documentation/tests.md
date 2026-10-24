# Test map

## Existing automated coverage

| Use case and rule | Expected behavior, including failure | Evidence | Status |
| --- | --- | --- | --- |
| Signal processing | Offset removal, state across packets, gaps reset, clipping/unknown quality distinguished | src/signal.test.ts | Existing |
| Recording format | Provenance and 5 V ADC configuration round trip; malformed/mixed metadata rejects; legacy unknowns preserved | src/signal.test.ts | Existing |
| Bounds and time | Safe indices, window midpoint, exact sample bound accepted and excess rejected | src/signal.test.ts | Existing |
| Fixed protocol | 30 trials, unchanged pre/post conditions, full hold segment, pause/gap invalidity | src/session.test.ts, src/engine.test.ts | Existing |
| Classifier collection | Whole windows omit transitions; only last two trials/class held out | src/session.test.ts | Existing |
| Model evaluation | Whole-trial split, training-only statistics, invalid labels rejected | src/model.test.ts | Existing |
| Traceability/capacity | Named events, timing ranges, condition reference; insufficient capacity preserves state | src/engine.test.ts | Existing |
| Saved results | Upsert/reload, independent rounds, legacy import, invalid/large files, full/blocked store and isolated delete | src/records.test.ts | Existing |
| User interface | Full simulation, refresh/read-only result review, separate downloads, guarded source changes, replay controls, hidden held-out feedback, failed-save download | src/App.test.tsx | Existing |
| Production server | Static MIME/HEAD, path and symlink safety, wrong methods, matching and wrong occupied ports, absent builds | scripts/serve.test.mjs | Existing |

npm test runs the full application suite and actual Node HTTP fixture tests. npm run build checks TypeScript and produces the static bundle. The shared repository does not yet enforce these as remote merge gates; contributors must run them and include evidence before review.

The 2026-10-24 release check passed 71 application tests and 6 server tests. Final-review regressions also prevent a deleted earlier round returning on a later save, a later fitted model rewriting earlier model evidence, and contradictory imported timings/metrics. Historical session exports without per-round model evidence retain a null report rather than borrowing the newest report.

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
