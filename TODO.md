- Future week-planning additions (parked 2026-07-21, waiting for bandwidth — most fit the existing rituals/quota machinery).
  Still parked (these three are surfaced as a reminder box on the Plan-my-week wizard's tasks step):
  - Daily walk ritual, 45m–1h, paired with podcast listening (break-type, like exercise)
  - Weekly time dedicated to progressing consulting (DBC) work
  - Dedicated weekly slots for AI-built side projects
  - (Implemented as rituals: daily Kindle notes, weekly backlog grooming, weekly retrospective)
- Retrospective → planning feedback loop: surface quota-adjustment suggestions from retro data (e.g. repeatedly missing a category quota suggests lowering it, or protecting the slot).
- Plan-my-week wizard: scheduling time for L&D.
- Plan-my-week wizard: scheduling time for reading.
- Schedule a "new bookies" slot each week
- Calibrated quota suggestions in the plan wizard: show per-category historical completion rates (from weeklyStats) next to quotas and suggest evidence-based quotas — parked until a few weeks of accurate data exist (2026-07-25)
- Estimate-vs-actual per task: record blocked duration vs actual outcome (finished/started/untouched from reviews) per task type so the planner can size blocks from evidence — parked until more data (2026-07-25)

## Follow-ups from the life-areas / goals build (2026-08-04)

Sections, the Exercise and Music areas, monthly & quarterly goals, the
reflection/planning sessions, all six tracking mechanisms and the full rename
are implemented. What's left:

- Music section: define what it should actually contain beyond goals. It is a
  goals-only shell until those specifics land.
- Goal evidence sources: only Asana *projects* are pickable in the goal editor.
  Asana tags are supported by the backend (`asana-tag`) but have no picker, and
  the calendar-category field is free text rather than a list of the categories
  actually in use.
- Mobile: Goals and Exercise are on the phone view as read-only tabs. The Music
  section and the reflection/planning sessions are desktop-only by design —
  worth revisiting only if a read-only music view earns its place.
- Exercise: the training log and the calendar plan are imported, per-exercise
  logging works from the phone, and session targets use double progression. The
  spreadsheet is retired — the app is the system of record now. Still open:
  - Timed calendar events ("🏋️ Gym", "🏃 Track @Southwark Park") are ignored by
    the sync; only the all-day plan is read. They would give real session
    durations, which are currently blank for imported sessions.
  - Exercise-name equivalences live in an ALIASES map in
    `src/lib/exercise-progression.ts`. There is deliberately no rule that
    strips equipment words — equipment is usually the distinction (dumbbell vs
    cable, bar vs cable pulldown). Add confirmed equivalences one line at a
    time. Currently: Paloff press ± "with cable", Treadmill = Treadmill run,
    Rear delt machine = Reverse pec deck machine.
  - The target recommender assumes a note's absence means "no reason to move",
    so it holds. Logging an effort rating explicitly (rather than only in prose)
    would make it decisive more often.
- Projects tab (Work → Projects) scans `working_dir/github/dbckz` only. The
  `openmined/` and `openclaw/` trees are excluded deliberately — day-job work
  with its own tracking. Revisit if that turns out to be the wrong call.
- Projects is desktop-only. The mobile shell already carries five tabs, and a
  read-only repo list is weak justification for a sixth; the parity rule in
  CLAUDE.md is deliberately not applied here.
- Reflection sessions have no reminder — nothing prompts a month-end reflection
  the way the weekly review is prompted. The "due" badge on the button is the
  only signal.
