# Workflow System Brainstorm

## Vision
Create an AI-powered workflow system using calendar.localhost as the command center. The goal is to have a roughly complete view of what's on my plate, with structured sprint rituals and intelligent task management.

## Core Requirements

### Complete View
- calendar.localhost becomes the single source of truth
- All work visible and organized
- Handles planned work well (adhoc items will always come up)

### Sprint Rituals (Weekly Basis)
- **Backlog Grooming**: Review, reschedule, define tasks properly
- **Sprint Planning**: Allocate work types to weekly capacity
- **Retrospective**: What worked, what didn't, process improvements

### Intelligent Task Management
- Well-defined task templates
- Different task types with approach strategies
- AI delegation flags (what AI can do vs what I need to do personally)
- Autonomous scheduling mechanisms

## Task Taxonomy & Templates

### Task Types & Weekly Targets
```
Writing (2-3 blocks/week): Blog posts, reports, analysis
Batch (1-2 sessions/week): Emails, admin, expense reports  
Meetings (organic): 1-2-1s, calls, conferences
Research (1 block/week): Policy analysis, background reading
Creative (1 block/week): Strategy, ideation, planning
Admin (daily micro-doses): Quick responses, filing, booking
```

### Well-Defined Task Template
```
Title: [Verb] [Object] [Context]
Type: Writing/Batch/Meeting/Research/Creative/Admin
Effort: 15min/30min/1hr/2hr/half-day/full-day
AI-Delegable: Yes/No/Partial [with specific boundaries]
Dependencies: [Links to other tasks/projects]
Context: [Why this matters, what success looks like]
Deadline Type: Hard/Soft/Aspirational
Energy Level: High/Medium/Low
Best Time: Morning/Afternoon/Evening/Late night
```

## Sprint Rituals

### Weekly Backlog Grooming (Sundays 6pm?)
- Review overdue tasks → reschedule or kill
- Break down large tasks into actionable pieces
- Apply task template to undefined work
- Tag AI-delegable portions
- Estimate effort levels

### Weekly Planning (Mondays 9am?)
- Allocate task types to weekly capacity
- Schedule deep work blocks (mornings + late nights)
- Batch similar work types
- Reserve buffer time for adhoc items
- Set weekly success metrics

### Weekly Retrospective (Fridays 5pm?)
- What got done vs planned
- Which task estimates were wrong
- What interrupted the plan (and why)
- Energy pattern observations
- Process improvements for next week

## Autonomous Scheduling Rules

### Time Block Preferences
- **Deep work**: 7-10am OR 10pm-1am (preference for mornings and late nights)
- **Batch work**: 2-4pm (post-lunch energy dip)
- **Meetings**: 10am-12pm OR 2-5pm
- **Creative**: Friday mornings (week's perspective)
- **Buffer**: 30min between contexts, 1hr before travel

### Auto-Scheduling Logic
- High-energy tasks → morning deep work slots
- AI-delegable tasks → queue for autonomous execution
- Related tasks → batch together when possible
- Hard deadlines → work backwards from due date
- Soft deadlines → fit around hard commitments

## calendar.localhost as Command Center

### Views Needed
- **Sprint board**: Backlog → In Progress → Done
- **Weekly capacity**: Task types vs targets
- **Energy mapping**: Task types vs time slots
- **AI delegation queue**: Ready for autonomous work
- **Dependency graph**: What's blocking what

### Smart Features
- Template application when creating tasks
- Effort estimation suggestions based on history
- Auto-scheduling based on preferences
- Conflict detection (over-allocated weeks)
- Success tracking (planned vs actual)

## Open Questions

1. **Sprint length** - weekly feels right, but maybe bi-weekly for bigger projects?
2. **AI delegation boundaries** - what level of autonomy are you comfortable with?
3. **Integration depth** - should this pull from Asana or replace it entirely?
4. **Measurement** - what metrics matter most for retrospectives?

## Next Steps

- Define task template structure in detail
- Design sprint ritual workflows
- Build calendar.localhost extensions for sprint views
- Create AI delegation framework
- Implement autonomous scheduling logic

---

*Captured from brainstorming session on 2026-03-30*