# Calendar App

## Deployment

This app runs in production via a launchd service.

**After pushing changes**, always rebuild and restart the service:

```bash
npm run build && launchctl stop com.davebuckley.calendar && launchctl start com.davebuckley.calendar
```

This applies whenever code is pushed to the remote, including after `/commit` with push.
