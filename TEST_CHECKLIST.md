# Daily Planner App - Test Checklist

## Core Navigation & Layout

- [ ] App loads successfully at localhost (port shown in terminal)
- [ ] Header displays current date
- [ ] Yesterday/Today/Tomorrow navigation buttons work
- [ ] Refresh button reloads data
- [ ] Settings icon navigates to settings page
- [ ] Three-column layout renders correctly (Asana sidebar, Timeline, Task templates)

## Asana Tasks Sidebar

### Task Display
- [ ] Asana tasks load and display in sidebar
- [ ] Task count shows correctly (e.g., "109 tasks")
- [ ] Each task shows title, due date, and integration name
- [ ] Tasks with overdue dates show in red
- [ ] Tasks due today show in orange
- [ ] Clicking a task opens task detail popup

### Task Detail Popup
- [ ] Shows task title
- [ ] Shows Type badge (if present)
- [ ] Shows Notes/description
- [ ] Shows Start date and Due date
- [ ] Shows Created date
- [ ] Shows Integration name
- [ ] Shows Projects list
- [ ] "Mark Complete" button works
- [ ] "Reopen Task" button works (for completed tasks)
- [ ] Add comment field submits comments to Asana
- [ ] "Open in Asana" link opens correct Asana task

### Task Filtering
- [ ] Filter button shows filter panel
- [ ] Filter by Integration works (OM, DBC, etc.)
- [ ] Filter by Project works
- [ ] Filter by Type works (custom field values)
- [ ] Filter by Due date (All, Overdue, Today, This week, No date)
- [ ] Filter by Start date works
- [ ] AND/OR filter logic toggle works
- [ ] Clear all filters button clears filters
- [ ] Filters persist after page refresh (localStorage)

### Task Sorting
- [ ] Sort button shows sort options
- [ ] Sort by Due date works (asc/desc)
- [ ] Sort by Start date works
- [ ] Sort by Created date works
- [ ] Sort by Title works
- [ ] Sort by Type works
- [ ] Sort direction toggles when clicking same field

### Create New Task
- [ ] Plus (+) button opens create task modal
- [ ] Workspace selector shows (when multiple integrations)
- [ ] Task name field is required
- [ ] Notes field accepts text
- [ ] Due date picker works
- [ ] Project selector shows available projects
- [ ] Cancel button closes modal
- [ ] Create Task button creates task in Asana
- [ ] New task appears in task list after creation

## Calendar Timeline

### Event Display
- [ ] Events render at correct times
- [ ] Events show correct colors by source
- [ ] 15-minute events display readable text
- [ ] 30-minute events display correctly
- [ ] 1-hour+ events display correctly
- [ ] Events show title and time range
- [ ] Overlapping events display side-by-side

### Event Interactions
- [ ] Clicking event shows details/highlights linked task
- [ ] Dragging event changes time
- [ ] Resizing event changes duration
- [ ] Delete button (x) shows confirmation modal
- [ ] Delete confirmation removes event

### Drag & Drop (Scheduling)
- [ ] Drag Asana task from sidebar to calendar
- [ ] Task creates event at drop location
- [ ] Syncs to Google Calendar (if connected)
- [ ] Shows calendar selection modal (if multiple calendars)
- [ ] Dragging event back to sidebar unschedules it

### Time Slot Interaction
- [ ] Click-drag on empty time slot opens task creation modal
- [ ] Created task shows on calendar at selected time
- [ ] Task syncs to Google Calendar (if connected)

## Task Templates Sidebar

### Template Management
- [ ] "Create Template" button works
- [ ] New template form shows fields
- [ ] Template saves successfully
- [ ] Templates display in sidebar
- [ ] Template shows name and type

### Template Usage
- [ ] Drag template to calendar creates new task
- [ ] Task created with template defaults
- [ ] Syncs to Google Calendar (if connected)

## All-Day Events
- [ ] All-day events appear in right sidebar
- [ ] All-day events not shown in main timeline
- [ ] All-day events display correctly

## Google Calendar Integration

### Sync Status
- [ ] Integration status shows connected calendars
- [ ] Events from Google Calendar display on timeline
- [ ] Google events show correct colors

### Event Management
- [ ] Moving Google event updates in Google Calendar
- [ ] Resizing Google event updates duration in Google
- [ ] Deleting Google event removes from Google Calendar

### Multi-Calendar Support
- [ ] Multiple Google calendars can be connected
- [ ] Calendar selection modal appears when needed
- [ ] Events go to correct selected calendar

## Asana Integration

### Multiple Workspaces
- [ ] Multiple Asana workspaces can be connected
- [ ] Tasks from all workspaces appear in sidebar
- [ ] Integration name shows per task

### Task Actions
- [ ] Complete task updates in Asana
- [ ] Add comment posts to Asana
- [ ] Task status reflects Asana state

## Settings Page

- [ ] Settings page loads at /settings
- [ ] Google Calendar integrations display
- [ ] Can add new Google integration
- [ ] Can enable/disable integrations
- [ ] Can delete integrations
- [ ] Asana integrations display
- [ ] Can add new Asana integration
- [ ] OAuth flow completes successfully

## Data Persistence

- [ ] Filter settings persist in localStorage
- [ ] Scheduled Asana tasks persist in localStorage
- [ ] Task templates persist in localStorage
- [ ] Integration settings persist server-side

## Responsive Design

- [ ] Sidebar widths are appropriate
- [ ] Calendar timeline is scrollable
- [ ] Modals center correctly
- [ ] Touch interactions work (if applicable)

## Error Handling

- [ ] Shows error message when API fails
- [ ] Gracefully handles missing integrations
- [ ] Shows loading states during data fetch
- [ ] Toast notifications for success/error actions

## Performance

- [ ] Initial page load is reasonable (<3s)
- [ ] Filtering is responsive
- [ ] Drag and drop is smooth
- [ ] No visible lag when scrolling
