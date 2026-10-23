# Development status

Date: 2026-10-23

## Evidence available

- 17 unit tests passed in the original workspace before this collaboration handoff.
- TypeScript and the Vite production build passed.
- The local development server was started on port 5174.

## Remaining before a tested release

- Complete real-browser checks for reference calibration, full training, pause/resume, source changes, file replay and downloads.
- Review and improve the single-click multiple-file download behavior if blocked by browser settings.
- Add and verify a matching acquisition-board firmware example after the team's hardware is known.
- Verify real ADC reference voltage, sample rate, timing, electrical compatibility, clipping and disconnection behavior.
- Collect real labelled EMG trials. Evaluate held-out complete trials; do not use synthetic accuracy as real-model evidence.
- Check usability with the intended users. No clinical benefit has been established.

This handoff is a development starter. The private repository is https://github.com/usoony515/emg-garden. Its visibility and owner access were verified through GitHub's signed-in webpage. The separate development connector still returns HTTP 404; webpage access and connector access are not interchangeable. Group members need repository invitations before cloning. Collaborator access and hosted deployment have not been verified.
