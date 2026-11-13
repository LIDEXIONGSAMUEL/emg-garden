# EMG Garden

Local software for a single-channel forearm EMG biofeedback research prototype. English interface. Uses React, TypeScript and Vite. Real EMG hardware is not required for the explicitly labelled simulation.

## Current status

Version 1.0.1 implements the device-independent workflow, saved result summaries, self-describing recordings and inspection-only replay. See STATUS.md for the checks actually completed and remaining physical-device validation. A software release is not a validated medical device or evidence of clinical benefit.

The simulation generates synthetic raw waveforms. It is visibly labelled and must never be reported as a person's EMG or training outcome. No camera is required.

## Open in your own Codex

1. Ask the owner for access to [the shared repository](https://github.com/usoony515/emg-garden), then accept the GitHub invitation. Having the link alone does not grant private-repository access.
2. Clone that repository to your own computer. Open the cloned folder as a project in Codex. Do not copy another person's Codex chat or credentials.
3. Ask Codex to read `AGENTS.md`, `CONTRIBUTING.md` and `STATUS.md` first.
4. Create a separate branch for your change, run checks and open a pull request. The shared repository, rather than any chat, is the shared source of truth.

```sh
git clone https://github.com/usoony515/emg-garden.git
cd emg-garden
```

GitHub authentication is required for this private repository. A downloaded source ZIP can also be opened as a local Codex project, but separate ZIP copies do not synchronize with each other.

## Run locally on Mac

Install Node.js 22 LTS or a compatible newer version. From this project folder:

```sh
npm ci
npm test
npm run build
npm start
```

Open `http://127.0.0.1:5174/` in Chrome. That address is local to the computer running the command; it is not a shared website.

**Start EMG Garden.command** installs dependencies if missing, builds the production application and starts it. A GitHub browser upload may not retain its executable bit. On a fresh checkout, run `chmod +x "Start EMG Garden.command"` once before double-clicking, or run `zsh "Start EMG Garden.command"`. The first setup requires an internet connection; an installed, built copy can run without downloading a model or contacting a service. Keep its Terminal window open. If macOS asks for permission, review the script before allowing it. The command-line instructions above remain available.

For code development:

```sh
npm run dev
```

Do not run development and production servers on the same port. The production server checks application/version/build identity if a port is occupied; it refuses an unrelated or older build. Close only your own old server before restarting. `PORT=5185 npm start` provides a separate local test instance, but its browser storage is separate from port 5174.

## Demonstrate without hardware

Choose **Try simulation**, then **Set my reference**. The reference procedure includes 15 seconds of rest and three comfortable five-second demonstrations, separated by 20-second rests. By default, synthetic effort follows the cues automatically. Disable automatic following in **Setup & research tools** to control the simulated effort with a slider.

After calibration, **Start training** runs a 30-second familiarization followed by six baseline trials, eighteen practice trials and six final trials. Each trial has five seconds of contraction and five seconds of relaxation. Before and after targets are identical. Pause or stop at any time.

Without a sensor, following the instructions with your hand does not produce a measurement. Automatic simulation is only a software demonstration; the manual slider also generates synthetic signal. Real muscle-control practice requires a compatible EMG device.

The active cue now uses a consistent hand drawing. Open hand means relax or ease; a gently closed hand means squeeze or hold. The short English title is also the optional spoken cue. During a training rest, **Hand relaxed** and a check appear only after clean activity has stayed below the existing rest threshold for 300 ms. The confirmation disappears on renewed activity, pause or loss of fresh signal. This feedback does not change scoring and is not shown during held-out classifier examples or replay.

In **Setup & research tools**, **Simulation controls** provides optional eight-second **Synthetic check** scenarios. **Unsteady effort** and **Effort drift** deliberately move generated activity away from the target, then recover. **Sample gap** omits 500 ms of samples and pauses active training. **Continue** stays disabled until a new processed window is available; it never resumes automatically. Reference calibration and labelled collection cannot overlap a check. Stopping the signal cancels the active check. Session JSON records its start and end or cancellation. These checks test software behavior, not actual electrode noise, a person's control or model accuracy. Normal automatic and manual simulation remain available.

## Saved results and replay

Completed trials are saved automatically as a small result summary on the current browser/profile/origin. Open **Setup & research tools**, then **Saved results** and **View**. A running round saved before interruption is marked interrupted and reopens read-only, not as resumable scoring. Each round keeps its own calibration and a snapshot of the model report available when that round started. Missing historical reports remain unknown. The store holds up to 50 summaries and will not silently erase an old one. **Delete** removes only the confirmed item; later rounds do not restore it.

Use **Download saved result** for a portable backup. **Open results JSON** reads supported session exports or a saved-result file without replacing the live signal. Raw waveforms are not automatically stored. Clearing browser data, changing profiles or using a different local port can make saved summaries unavailable.

**Replay raw CSV** validates the file before replacing the signal. Use **Pause replay**, **Continue replay** and **Replay again**. Playback never creates new task scores or prompted labels. New files preserve declared source, ADC and notch settings. Legacy files keep unknown metadata and do not receive guessed clipping checks. File metadata is not independently authenticated.

## Real device input

Use Chrome on localhost or HTTPS and click **Connect EMG**. The device must provide raw waveform samples, not an envelope or on/off value. The software expects 230400 baud, newline-delimited JSON packets:

```json
{"sampleRate":2000,"adcMax":1023,"referenceV":5,"startIndex":0,"samples":[307,309,305]}
```

`startIndex` is the sequence number of the first ADC sample in that packet. The next packet must start after the last sample. `referenceV` is the ADC reference in volts, not the EMG module's DC offset. Samples must be integers in the ADC range. Do not connect a sensor until its electrical compatibility and sampling firmware have been checked. Hardware-specific firmware is not yet included or verified.

The initial processing configuration is 2000 Hz, causal 20–450 Hz filtering, optional 50 Hz notch, 400-sample windows and 100-sample steps. Filter state persists across packets; gaps cause a restart and pause active training. Measurements are module-output volts. They are not calibrated muscle-input microvolts.

## Classifier

Calibration is not classifier training. In research tools, **Collect 18 labelled trials** records six trials per prompted state. Review whether the actual signal matches those prompts before fitting the classifier. If the labels cannot be confirmed, repeat the collection rather than fitting. The first four whole trials per state train the model; the last two test it, with effort feedback hidden. Complete feature windows stay inside the retained one-to-four-second portion. Overlapping windows never cross the split. Scaling is computed from training data only.

Water uses continuous normalized RMS. Classifier confidence does not control water strength. The confusion matrix and accuracy count feature windows from six held-out complete trials. Held-out accuracy on one recording does not establish generalization to another person or another electrode placement. Synthetic results cannot validate a real-data classifier. A label is displayed only when the current prediction agrees with the majority of the last three frames and its kNN vote fraction is at least 0.60. Otherwise the display and exported window remain uncertain. The vote fraction is not a calibrated probability.

## Data and privacy

Raw CSV and session JSON can be downloaded locally. Nothing uploads automatically. Use **Download session JSON** and **Download raw CSV** separately; each click requests one file. Stop or finish the active step before downloading. Session JSON includes all rounds started on the current signal source, with each round's reference and completed results. The top-level `results` field contains only the latest round. Starting another round does not erase earlier rounds from `sessions`.

New CSV adds `origin_source,reference_v,adc_max,notch_50hz` to the existing `sample_index,voltage_v,sample_rate` columns. Values must be consistent across rows. Legacy three-column CSV remains inspection-only with unknown original source/ADC/notch. Unknown ADC settings produce unverified quality instead of a guessed clipping result. Unknown notch is stated, and replay applies no notch.

Raw recordings are in memory, limited to 20 minutes of signal per source including idle and paused time. Each step checks that its full duration will fit before starting. At the limit the signal stops, completed results stay available and the active session pauses. End the session, download both files and start a new source. Export raw data before refreshing or changing sources. No private recordings, participant data, credentials or source PDFs belong in Git. `.gitignore` excludes common recording locations and formats.

Window `time` is the endpoint used by live scoring; `centerTime` is the complete window interval midpoint. New trial results include contraction, hold, relaxation and end times. Paused trials are invalid, so their scheduled hold ranges must not be treated as valid measurements. Named phase/reward events and condition references support review against original samples.

## Files

- `src/signal.ts`: raw input, filtering, features and calibration formula.
- `src/session.ts`: calibration, example collection and fixed training protocol.
- `src/model.ts`: whole-trial split, standardized kNN and evaluation.
- `src/engine.ts`: processing integration, recording and simulation.
- `src/serial.ts`: Chrome serial transport.
- `src/App.tsx`, `src/style.css`: interface and local downloads.
- `src/records.ts`: validated per-round results and browser-local storage.
- `scripts/serve.mjs`: localhost-only production static server.

See `CONTRIBUTING.md` for team workflow, `STATUS.md` for evidence, and `documentation/architecture.md` for the data, privacy and test map. The team uses the `main` branch for shared releases. After an update, preserve any uncommitted work, pull `main`, run `npm ci` and `npm run build`, then restart the local server. The EMG application is separate from the older camera website. Version 1.0.1 keeps the `emg-garden-1.0.0` export schema because the file format is unchanged.
