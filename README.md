# EMG Garden

Shared development starter for a single-channel forearm EMG biofeedback prototype. English interface. Uses React, TypeScript and Vite.

## Current status

The code runs locally. Signal processing, comfortable-reference calibration, a timed watering protocol, kNN classification, CSV replay and local exports are implemented. The unit suite and production build passed on the original development Mac. Browser end-to-end checks and physical EMG-device validation are still pending. This is a development starter, not a clinically validated product.

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

## Run on Mac or Windows

Install Node.js 22 LTS or a compatible newer version. From this project folder:

```sh
npm ci
npm test
npm run dev
```

Open `http://127.0.0.1:5174/` in Chrome. That address is local to the computer running the command; it is not a shared website.

To produce a static build:

```sh
npm run build
npm run preview
```

## Demonstrate without hardware

Choose **Try simulation**, then **Set my reference**. The reference procedure includes 15 seconds of rest and three comfortable five-second demonstrations, separated by 20-second rests. By default, synthetic effort follows the cues automatically. Disable automatic following in **Setup & research tools** to control the simulated effort with a slider.

After calibration, **Start training** runs a 30-second familiarization followed by six baseline trials, eighteen practice trials and six final trials. Each trial has five seconds of contraction and five seconds of relaxation. Before and after targets are identical. Pause or stop at any time.

## Real device input

Use Chrome on localhost or HTTPS and click **Connect EMG**. The device must provide raw waveform samples, not an envelope or on/off value. The software expects 230400 baud, newline-delimited JSON packets:

```json
{"sampleRate":2000,"adcMax":1023,"referenceV":5,"startIndex":0,"samples":[307,309,305]}
```

`startIndex` is the sequence number of the first ADC sample in that packet. The next packet must start after the last sample. `referenceV` is the ADC reference in volts, not the EMG module's DC offset. Samples must be integers in the ADC range. Do not connect a sensor until its electrical compatibility and sampling firmware have been checked. Hardware-specific firmware is not yet included or verified.

The initial processing configuration is 2000 Hz, causal 20–450 Hz filtering, optional 50 Hz notch, 400-sample windows and 100-sample steps. Filter state persists across packets; gaps cause a restart and pause active training. Measurements are module-output volts. They are not calibrated muscle-input microvolts.

## Classifier

Calibration is not classifier training. In research tools, **Collect 18 labelled trials** records six trials per prompted state. Review whether the actual signal matches those prompts before fitting the classifier. The first four whole trials per state train the model; the last two test it. Overlapping windows never cross that split. Scaling is computed from training data only.

Water uses continuous normalized RMS. Classifier confidence does not control water strength. Held-out accuracy on one recording does not establish generalization to another person or another electrode placement.

## Data and privacy

Raw CSV and session JSON can be downloaded locally. Nothing uploads automatically. The current UI downloads both when **Download data** is clicked; the browser may ask to allow multiple downloads. Raw CSV can be replayed for inspection, but new prompts cannot label prerecorded movements.

Recordings are currently in memory. Export before refreshing or changing sources. No private recordings, participant data, credentials or source PDFs belong in Git. `.gitignore` excludes common recording locations and formats.

## Files

- `src/signal.ts`: raw input, filtering, features and calibration formula.
- `src/session.ts`: calibration, example collection and fixed training protocol.
- `src/model.ts`: whole-trial split, standardized kNN and evaluation.
- `src/engine.ts`: processing integration, recording and simulation.
- `src/serial.ts`: Chrome serial transport.
- `src/App.tsx`, `src/style.css`: interface and local downloads.

See `CONTRIBUTING.md` for the team workflow and `STATUS.md` for remaining checks.
