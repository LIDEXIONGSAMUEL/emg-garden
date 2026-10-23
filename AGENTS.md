# EMG Garden development rules

Read README.md, CONTRIBUTING.md and STATUS.md before making changes.

## Product scope

Build an English, simple EMG biofeedback prototype for comfortable forearm contraction, steady holding and relaxation. This is not a dementia treatment, EEG system or clinical strength measurement. Keep the primary interface small and symbol-supported. Put technical details in research tools.

## Engineering constraints

- Work in your own branch. Never overwrite another contributor's work or force-push the shared main branch.
- State which user-visible problem your change solves. Make surgical changes; avoid unrelated refactors and dependencies.
- Preserve the distinction between simulation, replay and real serial acquisition in the UI and exports.
- Do not fabricate samples during gaps, count missing time as successful control, or silently change evaluation targets.
- Calibrate against a comfortable reference, not MVC. Preserve unclipped activity in analysis. Never label it grip force.
- Fit preprocessing statistics only on training examples. Split complete trials, not overlapping windows. Participant-independent claims require participant-independent data.
- Water is controlled by normalized RMS. kNN labels are separate. Confidence is not an activity amplitude.
- Keep participant videos, raw EMG, identifiers and credentials out of the repository. Do not upload data or deploy a shared release without the owner's request.

## Verification

For processing, timing or scoring changes, add a regression case and confirm the relevant failure before changing the implementation. Run `npm test` and `npm run build`. Describe browser and physical-device checks separately. Passing synthetic tests does not prove real-device performance or clinical benefit.

When opening a pull request, include the problem, the change, commands actually run, results, and what remains unverified. Update STATUS.md only with evidence.
