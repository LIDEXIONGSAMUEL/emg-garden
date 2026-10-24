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
