# EMG Garden setup

EMG Garden 1.0.1 is an English local software release for an EMG biofeedback research prototype. Real device and clinical validation remain pending.

1. Open the local site directly in Chrome. Select **Connect EMG** and choose your Uno serial port. This uses the 2 kHz acquisition sketch at 250000 baud. For the original two-column firmware, use **Setup & research tools → Connect board**.
2. When the signal is ready, select **Set my reference**. Relax for five seconds, then squeeze comfortably for five seconds. The 70-second reference used in the research protocol is available under **Setup & research tools**.
3. Select **Start training**. Follow the light or firmer squeeze cue, hold when the pot glows, then relax. **Flower watered!** marks a steady hold.
4. Use **Rest** to pause and **End session** to stop.
5. Open **Setup & research tools** to inspect signal quality, review individual labelled trials, retake excluded trials, fit the classifier or download local data. Download **session JSON** and **raw CSV** separately after stopping or finishing the step. The pair shares a frozen recording ID. JSON keeps completed results from all rounds on the same source.

Live processing uses a 20–450 Hz band-pass and narrow notches at 50 Hz and 100 Hz by default. Change the mains filter setting in research tools before connecting. The default Uno sketch uses ADC counts for relative training. The raw CSV preserves those counts and the exports record the filter setting.

Successful calibration is saved on this browser. After reopening, connect the same device and select **Use saved reference** if the sensor and electrode placement are the same. For a different placement, run calibration again.

Completed trials are saved as per-round summaries on this browser only. Open **Saved results** in research tools to view, download or delete them. An interrupted round reopens read-only, not as ongoing scoring. Use **Open results JSON** for a portable result file. Browser storage is not a permanent backup.

On localhost, **Playtest monitor** automatically saves live serial samples and events to the project's local `recordings/playtests/` folder. Check the saved sample count to confirm progress. Use both download buttons for a paired CSV and JSON backup. The live buffer holds up to 20 minutes of samples.

**Replay raw CSV** opens recordings for inspection. Pause, continue or replay from the start. New CSV preserves source/ADC/notch metadata. Legacy CSV remains unknown and cannot verify clipping. Replay never creates new training scores.

Synthetic data is labelled. It is not real muscle activity. Comfortable reference percentages are not grip strength or %MVC. The prototype has not been clinically validated.

The full source package contains README.md, CONTRIBUTING.md, AGENTS.md and STATUS.md for team development.
