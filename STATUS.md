# Team software release 1.0.1

Date: 2026-11-13. This release combines the previously tested local stable features and guided feedback with a classifier display fix. Repository publication is verified separately through the resulting main-branch commit.

## Current release checks

- Fixed a mismatch between the majority class and the newest frame's confidence. Classification now requires the current prediction to agree with the three-frame majority and have a kNN vote fraction of at least 0.60. Uncertain windows export null label/confidence. RMS water control and trial scoring are unchanged.
- Two new regression tests failed on the old implementation and passed with the fix. They cover class changes, low-confidence predictions, recovery and exported windows, using the actual predictor.
- Fresh checks on package version 1.0.1 passed 94 application tests, 6 HTTP server tests and the TypeScript/Vite production build. Independent review found no blocking issue in the confidence fix.
- The same-day Chrome check completed reference calibration, training, pause/resume and a manually ended 19-trial synthetic session. The interrupted trial was correctly invalid. Its saved summary reopened after refresh. The complete 30-trial flow was covered by automated tests, not a new full browser or human trial.
- Hardware firmware/protocol compatibility, real-device acquisition, real-EMG accuracy and intended-user validation remain pending. Model results can be exported, but reopening a result does not restore a fitted classifier.
- Package version is 1.0.1. Export schema remains emg-garden-1.0.0; no file-format change is introduced.

## Earlier verification record

# Local stable software 1.0.0

Date: 2026-10-24. Device-independent software verification record. Repository publication is tracked by GitHub commits and pull requests, separately from these local checks.

## Verified software

- Fresh `npm test` passed 71 Vitest application tests and 6 Node HTTP server tests. `npm run build` passed TypeScript checking and produced the production bundle.
- Automated tests cover the complete 30-trial protocol, familiarization pause/resume, invalidation of interrupted scored trials, whole-window classifier collection, train/test separation, recording metadata, 20-minute capacity limits, source preservation and replay isolation.
- Results tests cover save/reopen, multiple rounds and reference conditions, malformed files, impossible timing/metric combinations, a full or unavailable store, deletion followed by later saves, and independent historical model reports.
- Target Mac Chrome against the production bundle completed reference calibration, all 18 labelled classifier trials and a 30-trial session. The downloaded session JSON independently confirmed complete state, 30 results and 29 valid trials. Trial 1 was correctly invalidated by a pause during that scored trial; the other 29 were valid. This browser run does not stand in for the separate automated familiarization-pause check.
- The synthetic classifier collection produced 1,026 windows. The six held-out trials produced 342 test windows, with 114 on each diagonal of the confusion matrix. This is synthetic separability, not evidence of real EMG accuracy. Held-out feedback hiding is covered by the React regression test.
- Chrome refresh retained the 30-trial summary. It reopened read-only, without resuming scoring. Opening the downloaded session JSON preserved its simulation label and did not replace the separate replay recording.
- Chrome replay checks passed import, pause with a fixed position, continue, finish and restart from the beginning. Invalid CSV and invalid results JSON left the current recording and visible results intact. Legacy CSV showed unknown source/ADC/notch and unverified quality rather than guessed clipping checks.
- The downloaded replay JSON retained declared simulation provenance, 5 V reference, 1023 ADC range and notch enabled. Processor tests independently verify metadata round trips reproduce features.
- The long browser run reached the 20-minute bound only after all 30 trials had completed. Completed results and download controls remained available. Capacity preflight and active-limit interruption are separately covered by automated tests.
- `zsh -n` accepted the Mac launcher. Running the launcher through zsh built and started the production server. Its HTTP identity, occupied-port checks and static-file safety are tested. Finder double-click and a fresh Mac installation have not been independently tested.
- A fresh independent code review found three Important result-recording defects. All three were reproduced with failing tests, fixed, retested and approved on follow-up. No remaining Important code-review findings were reported.

## What this release includes

English symbol-supported training, continuous RMS visual feedback, comfortable-reference calibration, optional local kNN fitting, a fixed before/practice/after protocol, pause/stop recovery, result summaries stored in the current browser, portable JSON, self-describing raw CSV, inspection-only replay and a localhost production launcher.

Local storage retains up to 50 summaries. It does not silently evict old results and does not automatically save raw waveforms. Download raw CSV before refreshing or changing the signal source. Imported metadata is declared information, not authenticated measurement evidence. Results from different calibrations are not combined.

## Still requires equipment or independent evaluation

- Compatible acquisition board and firmware, electrode placement, electrical safety, actual 2000 Hz sampling/timing, ADC reference/range, clipping, serial disconnection and reconnection.
- Real labelled EMG, held-out performance across recordings, electrode placements and people. No real-data classifier has been trained or validated in this hardware-free release.
- Supervised usability and comfort evaluation with intended older users. No cognitive, rehabilitation or diagnostic benefit has been established.
- Finder double-click behavior and dependency installation on another Mac.

## Shared version

The private repository is https://github.com/usoony515/emg-garden. The verification above was completed on the local 1.0.0 release before repository synchronization. Check the latest merged pull request and package version to identify the shared source available to collaborators. Each contributor must pull the update and rebuild locally. Updating repository source does not deploy a website, update another person's checkout automatically, or change the older camera system. No participant recordings, raw EMG or source PDFs belong in the repository.

## Guided-feedback local update, later on 2026-10-24

- Added a consistent static hand illustration for relax, squeeze, hold and ease. Optional speech uses the same existing short English title. During running training rest, the hand/check confirms the existing sustained 300 ms relaxation observation. It clears on the first renewed active frame, pause, missing clean signal or next phase. Held-out examples and inspection replay do not receive this confirmation. Scoring, targets, durations and recording schema are unchanged.
- Added optional eight-second synthetic unsteady-effort, effort-drift and 500 ms sample-gap checks in the existing research controls. Normal simulation remains sample-for-sample identical. Checks and cancellation are recorded as events. Calibration and classifier collection cannot overlap a check. A gap pauses training and requires a new processed window before explicit Continue; stopping a check clears its status without resetting sample indices.
- Fresh full verification passed 92 Vitest application tests and 6 actual HTTP server tests. TypeScript/production build and launcher shell syntax passed. Independent spec and quality reviews approved after regression fixes for renewed-activity confirmation, post-gap readiness and cancelled-check cleanup.
- Target Mac Chrome on a separate production test origin completed the reference procedure and all 30 synthetic trials. The visible table showed 6/6 before, 18/18 practice and 6/6 after valid trials. The new Hand relaxed check was observed and captured. A further synthetic gap during a new session displayed Take a break and disabled Continue during recovery. These remain synthetic workflow checks, not measured muscle performance.
- Screenshot evidence is saved in the parent workspace at output/emg-guided-feedback-2026-10-24.png, outside shared source. No real-device or older-user test has been performed. This update is local; GitHub main and the older camera website are not claimed updated.
