# EMG Garden setup

EMG Garden 1.0.0 is an English local software release for an EMG biofeedback research prototype. Real device and clinical validation remain pending.

1. Connect a compatible raw EMG device, or select **Try simulation**.
2. Select **Set my reference**. Relax for 15 seconds, then follow three comfortable five-second contractions with rests between them.
3. Select **Start training**. Gently contract to put the water in the target band, hold steadily, then relax.
4. Use **Rest** to pause and **End session** to stop.
5. Open **Setup & research tools** to inspect signal quality, fit the optional classifier or download local data. Download **session JSON** and **raw CSV** separately after stopping or finishing the step. JSON keeps completed results from all rounds on the same source.

Completed trials are saved as per-round summaries on this browser only. Open **Saved results** in research tools to view, download or delete them. An interrupted round reopens read-only, not as ongoing scoring. Use **Open results JSON** for a portable result file. Browser storage is not a permanent backup.

Raw waveforms stay in memory until downloaded. Export before refreshing or closing. Changing signal sources replaces the raw recording after confirmation. The bounded buffer holds 20 minutes of samples and each step checks available capacity.

**Replay raw CSV** opens recordings for inspection. Pause, continue or replay from the start. New CSV preserves source/ADC/notch metadata. Legacy CSV remains unknown and cannot verify clipping. Replay never creates new training scores.

Synthetic data is labelled. It is not real muscle activity. Comfortable reference percentages are not grip strength or %MVC. The prototype has not been clinically validated.

Without an EMG sensor, moving your hand does not produce measured data. Automatic and manual simulation demonstrate software only. Classifier accuracy on simulated data is not a real-person result.

The full source package contains README.md, CONTRIBUTING.md, AGENTS.md and STATUS.md for team development.
