# Data and permission flows

| Flow | Preconditions and checks | State change | Failure behavior |
| --- | --- | --- | --- |
| Start simulation | Explicit click, confirm before replacing recorded data | Local synthetic samples and provenance are created | Cancellation keeps current data |
| Connect serial | Secure localhost/HTTPS, supported Chrome API, user selects a permitted port | Local stream is opened and validated packet by packet | Unsupported/cancelled/invalid input is shown, not fabricated |
| Start a protocol step | Clean known-quality data, reference if needed, no conflicting step, full-step capacity | Timed reference/collection/session begins on the sample clock | State is not cleared if capacity/reference checks fail |
| Pause / hide / lose data | User action, visibility event or continuity/freshness check | Scoring stops; affected scored trial is invalid | Missing time never earns target coverage |
| Save progress/results | Completed trials or explicit end; schema checked, at most 50 unique summaries | Atomic localStorage write on this browser origin | No eviction; warning and file download remain available |
| Open saved/imported results | Saved schema or supported session JSON, bounded arrays, finite metrics and consistent conditions | Read-only result selected; optional local summary import | No old scoring resumes; rejected input leaves live data intact |
| Delete a result | Explicit item selection and confirmation | Only that local summary is removed | Failed storage operation is reported |
| Import raw CSV | User selects file, size/sample/metadata checks, replacement confirmation | Inspection-only replay with declared original provenance | Invalid/mixed metadata rejects before replacing current data |
| Replay controls | A parsed local file is loaded | Pause freezes cursor; restart resets processor to file start | No live training or new prompt labels are allowed |
| Export | User clicks one format; active scoring/collection ended | Browser downloads one file | A click is not treated as proof that the OS permanently saved it |

No step sends a recording to a backend or another group member. The application has no user roles or resource-access API; the browser profile is the local trust boundary. Private data does not belong in the shared GitHub repository.

Opening a local recording explicitly places its contents in browser memory. Automatic storage keeps completed trial summaries only, not original waveform arrays, feature windows or participant identifiers. Downloads are the portable backup. Imported source/ADC claims are displayed as file metadata, not independently authenticated information.
