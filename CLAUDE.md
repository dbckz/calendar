# Personal Portal (repo: `dbckz/calendar`)

Formerly "the calendar app". It is now a personal portal with life-area
sections — Work (the original tabs), Exercise, Music — plus a cross-cutting
Goals section. Served at `portal.localhost`; `calendar.localhost` remains as an
alias.

The launchd label (`com.davebuckley.calendar`), the data directory
(`~/.claude/data/calendar/`) and the GitHub repo name are deliberately
unchanged, so the commands below and the stored data are unaffected.

## Mobile parity

The `/mobile` view (`src/app/mobile/`) must be kept in step with the desktop:
when a feature is added or changed, add the mobile equivalent as part of the
same piece of work.

**Mobile is read-only by default.** Surface and view the data there; creating,
editing, deleting and wizard flows belong on the desktop. Reuse shared modules
rather than duplicating logic.

**Exception: exercise logging is read/write on mobile.** Sessions are logged
standing in a gym, so the phone is the primary surface for it — starting a
session, ticking exercises off, correcting weights and adding notes all write
from `/mobile`. Those writes save per-action and optimistically, because the
connection is unreliable and a lost session is unrecoverable. Anything else
stays read-only unless Dave says otherwise.

## Deployment

This app runs in production via a launchd service.

**After pushing changes**, always rebuild and restart the service:

```bash
npm run build && launchctl stop com.davebuckley.calendar && launchctl start com.davebuckley.calendar
```

This applies whenever code is pushed to the remote, including after `/commit` with push.
