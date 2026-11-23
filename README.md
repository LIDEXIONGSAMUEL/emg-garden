# EMG Garden

Local software for a single-channel forearm EMG biofeedback research prototype. English interface. Uses React, TypeScript and Vite. Live training uses a compatible raw EMG device.

## Current status

Version 1.0.1 implements the device-independent workflow, saved result summaries, self-describing recordings and inspection-only replay. See STATUS.md for the checks actually completed and remaining physical-device validation. A software release is not a validated medical device or evidence of clinical benefit.

Saved files retain their declared source, including historical simulation recordings. No camera is required.

## Repository

This is Samuel Li's personal copy of the BME 42129 group project. The original collaboration repository and its contributor history are provided by [usoony515/emg-garden](https://github.com/usoony515/emg-garden).

Clone this copy from an account with access:

```sh
git clone https://github.com/LIDEXIONGSAMUEL/emg-garden.git
cd emg-garden
```

For shared group changes, use a branch and pull request in the group repository. See [CONTRIBUTING.md](CONTRIBUTING.md).

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

## Train with real EMG

Choose **Connect EMG** and select the Uno serial port. When the signal is ready, choose **Set my reference**. Rest for five seconds, then hold one comfortable contraction for five seconds.

For the full research protocol, choose **Full reference (70 seconds)** under **Setup & research tools**. It uses 15 seconds of rest and three comfortable five-second contractions with 20-second breaks. Session exports identify the reference protocol.

A successful reference is saved on this browser as soon as calibration finishes. After reopening, connect the same EMG device and select **Use saved reference** when the signal is ready. Reuse is available with matching acquisition and filter settings. Select **Set my reference** or **Recalibrate** if the electrode placement or sensor changed. The browser saves the calibration values and acquisition notes locally.

After calibration, try a gentle squeeze to preview the water. The activity percentage is relative to your comfortable reference and can exceed 100%. The preview does not record a training score.

**Start training** runs a 30-second familiarization followed by six baseline trials, eighteen practice trials and six final trials. Each trial has five seconds of contraction and five seconds of relaxation. Before and after targets are identical. Pause or stop at any time.

The active cue now uses a consistent hand drawing. Open hand means relax or ease; a gently closed hand means squeeze or hold. The short English title is also the optional spoken cue. During a training rest, **Hand relaxed** and a check appear only after clean activity has stayed below the existing rest threshold for 300 ms. The confirmation disappears on renewed activity, pause or loss of fresh signal. This feedback does not change scoring and is not shown during held-out classifier examples or replay.

A signal stall or invalid input pauses training. After a recoverable stall, wait for a fresh, clean window and choose **Continue**. If the port closes, end the interrupted session and reconnect.

## Saved results and replay

Completed trials are saved automatically as a small result summary on the current browser/profile/origin. Open **Setup & research tools**, then **Saved results** and **View**. A running round saved before interruption is marked interrupted and reopens read-only, not as resumable scoring. Each round keeps its own calibration and a snapshot of the model report available when that round started. Missing historical reports remain unknown. The store holds up to 50 summaries and will not silently erase an old one. **Delete** removes only the confirmed item; later rounds do not restore it.

Use **Download saved result** for a portable backup. **Open results JSON** reads supported session exports or a saved-result file without replacing the live signal. Raw waveforms are not automatically stored. Clearing browser data, changing profiles or using a different local port can make saved summaries unavailable.

**Replay raw CSV** validates the file before replacing the signal. Use **Pause replay**, **Continue replay** and **Replay again**. Playback never creates new task scores or prompted labels. New files preserve declared source, ADC and notch settings. Legacy files keep unknown metadata and do not receive guessed clipping checks. File metadata is not independently authenticated.

## Real device input

Use Chrome on localhost or HTTPS. **Connect EMG** uses 250000 baud for the Uno sketch. Compatible 230400 baud devices can connect through **Setup & research tools → Connect device**. Both accept newline-delimited JSON packets of raw waveform samples:

```json
{"sampleRate":2000,"adcMax":1023,"referenceV":5,"startIndex":0,"samples":[307,309,305]}
```

`startIndex` is the sequence number of the first ADC sample in that packet. The next packet must start after the last sample. Samples are integer ADC counts. The default Uno firmware sends `"mode":"adc_counts"` with `"referenceV":null` for relative training. If a measured reference is configured, the packet includes its voltage and the browser can report the module output in volts.

### Arduino Uno acquisition firmware

[`firmware/EmgGardenUno/EmgGardenUno.ino`](firmware/EmgGardenUno/EmgGardenUno.ino) targets a **16 MHz ATmega328P Uno**, samples A0 at a timer-scheduled nominal 2 kHz, and sends the JSON protocol at **250000 baud**. **Setup & research tools → Connect board** opens diagnostics for the existing 115200 baud two-column firmware. Its live and saved views report counts near the assumed 10-bit ADC limits.

Leave `EMG_ADC_REFERENCE_MV` unset for relative training in ADC counts. A measured AVcc reference in millivolts can be configured when voltage measurements are needed. The activity score uses the same comfortable-reference normalization in either unit. Confirm the sensor's electrical compatibility and verify the signal quality before wearer testing. Overruns appear as jumps in sample index.

For a transport-only bench check, build with `-DEMG_BENCH_CAPTURE=1`. It labels the timed ADC packets `bench_counts`. On Windows, run `pwsh -File scripts/check-uno-serial.ps1 -Port COM3` to measure packet rate, sequence discontinuities and ADC rail counts. The checker also reads the default training packets.

For an end-to-end Windows bench check, run `pwsh -File scripts/test-uno-bench.ps1` to compile the counts-only image. Once all electrodes are physically disconnected from the wearer and the device remains on USB, run `pwsh -File scripts/test-uno-bench.ps1 -Port COM3 -ElectrodesDetached`. It verifies a readback backup before any write, checks 20 seconds of packet delivery, and verifies restoration of the original application even if capture fails. The local JSON reports transport separately from rail counts. This check uses a nominal 2 kHz rate, a ±2% receive-rate tolerance and at least 90% capture coverage. It does not measure the ADC reference voltage.

Live EMG defaults to 2,000 Hz, causal 20–450 Hz filtering, narrow 50 Hz and 100 Hz notches, 400-sample windows and 100-sample steps. Change the mains filter setting in **Setup & research tools** before connecting. The connection uses one fixed filter configuration. Saved references require the same filter settings. Older recordings without 100 Hz notch metadata replay with their original filter. A sample-index gap resets the filter state and pauses active training. The signal view labels amplitudes as ADC counts or module-output volts.

## Classifier

Calibration is not classifier training. In research tools, **Collect 18 labelled trials** records six trials per prompted state. Use **Review labelled trials** to check the cue, median RMS, and retained raw waveform of each trial. An excluded trial can be retaken in its original split. Fitting is available once all 18 trials are accepted. The first four whole trials per state train the model; the last two test it, with effort feedback hidden. Complete feature windows stay inside the retained one-to-four-second portion. Overlapping windows never cross the split. Scaling is computed from training data only.

Water uses continuous normalized RMS. Classifier confidence does not control water strength. The confusion matrix and accuracy count feature windows from six held-out complete trials. Held-out accuracy on one recording does not establish generalization to another person or another electrode placement. Synthetic results cannot validate a real-data classifier. A label is displayed only when the current prediction agrees with the majority of the last three frames and its kNN vote fraction is at least 0.60. Otherwise the display and exported window remain uncertain. The vote fraction is not a calibrated probability.

## Data and privacy

Raw CSV and session JSON can be downloaded locally. Nothing uploads automatically. Use **Download session JSON** and **Download raw CSV** separately; each click requests one file. Stop or finish the active step before downloading. Session JSON includes all rounds started on the current signal source, with each round's reference and completed results. The top-level `results` field contains only the latest round. Starting another round does not erase earlier rounds from `sessions`.

CSV preserves source, ADC configuration and notch settings. Serial recordings include the original `adc_count`. When the voltage reference is unknown, the CSV carries only the counts and the paired JSON labels the amplitude unit `adc_counts`. The two download buttons export one frozen snapshot with a shared ID, even while packets continue arriving. The ID is stored in the first CSV row and in session JSON. Clicking the same download button again starts a fresh snapshot. Legacy three-column CSV remains inspection-only with unknown original source, ADC and notch settings.

Run `npm run audit:recording -- path/to/raw.csv path/to/session.json` to check a paired export offline. It recomputes feature windows, calibrated activity, live classifier decisions and held-out model results, and gives the sample-index ranges for trial holds. The result carries the recording's source, including simulation. Raw files and results remain local.

For a live serial source, **Acquisition notes** records the device, sensor and electrode placement with the next calibration's condition in the session JSON. Raw recordings are in memory, limited to 20 minutes of signal per source including idle and paused time. Each step checks that its full duration will fit before starting. At the limit the signal stops, completed results stay available and the active session pauses. End the session, download both files and start a new source. Export raw data before refreshing or changing sources. No private recordings, participant data, credentials or source PDFs belong in Git. `.gitignore` excludes common recording locations and formats.

To render one trial as a PNG, select its session round and global trial number. Python with Matplotlib is needed only for this plot.

```sh
npm run --silent audit:recording -- recording-raw.csv recording-session.json --trial 1:1 > audited-trial.json
python scripts/plot-audited-trial.py audited-trial.json trial.png
```

The plot uses the verified pair and shows the raw signal, scoring interval, target band and normalized RMS. The raw axis uses ADC counts when present and module-output voltage otherwise. Its source and trial validity are visible. Keep the intermediate audit JSON with the source data because it includes raw samples.

Window `time` is the endpoint used by live scoring; `centerTime` is the complete window interval midpoint. New trial results include contraction, hold, relaxation and end times. Paused trials are invalid, so their scheduled hold ranges must not be treated as valid measurements. Named phase/reward events and condition references support review against original samples.

## Files

- `src/signal.ts`: raw input, filtering, features and calibration formula.
- `src/session.ts`: calibration, example collection and fixed training protocol.
- `src/model.ts`: whole-trial split, standardized kNN and evaluation.
- `src/engine.ts`: processing integration and recording.
- `src/serial.ts`: Chrome serial transport.
- `src/App.tsx`, `src/style.css`: interface and local downloads.
- `src/records.ts`: validated per-round results and browser-local storage.
- `scripts/serve.mjs`: localhost-only production static server.

See `CONTRIBUTING.md` for team workflow, `STATUS.md` for evidence, and `documentation/architecture.md` for the data, privacy and test map. The team uses the `main` branch for shared releases. After an update, preserve any uncommitted work, pull `main`, run `npm ci` and `npm run build`, then restart the local server. The EMG application is separate from the older camera website. Version 1.0.1 keeps the `emg-garden-1.0.0` export schema because the file format is unchanged.
