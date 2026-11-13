# Permissions and privacy

| Resource | Local operator | Another browser/profile | Static HTTP server |
| --- | --- | --- | --- |
| Current raw recording | View and explicitly download | No application sharing | No recording API |
| Saved summary on this origin | View, download, confirmed delete | Not synchronized | Not served from localStorage |
| Selected CSV/JSON | Read after user selection | No automatic access | File contents are not posted |
| Serial device | Browser permission and compatible device required | Separate browser permission | No device access |
| Source repository | GitHub collaborator access, separately managed | Invitation required | Not exposed by the production app |

There is no authentication system, role-based access or row-level-security database. Any person who can use the same unlocked OS account and browser profile may access its local results. Application-level encryption is not implemented. Use an appropriate private profile and download/store research data according to the team's consent process.

The production server binds only to 127.0.0.1, serves built application files and accepts GET/HEAD only. It does not provide uploads, record deletion or remote training endpoints. Browser serial permissions are requested only through an explicit connection action.

Do not record names, identifiers or participant videos in this application. Raw EMG and exported results stay out of Git. Clearing browser data can remove summaries; a local-storage save is not a permanent backup.
