# Performance SLA scoring

The active implementation uses only planned time versus actual time. Weighted scores, point bands, subjective labels and revision penalties have been removed. Scores are percentages, calculated on the backend and never stored.

## Assignment source and EA responsibility

Primary actual assignment timestamp: Task.eaFirstActionAt. The existing assignment endpoint writes it with assignedEmployeeId in the same UPDATE. Fallback: earliest TaskStatusHistory transition NEW -> IN_PROGRESS. startDate is not used. A candidate before creation or after the evaluation time is invalid; a valid fallback can be used. An assigned task with no reliable timestamp is Unknown rather than an invented result.

The checkpoint belongs to Task.assignedEaId, even when another authorized manager performed the assignment. Missing EA associations are never guessed. The response reports the unattributed delegation count for the selected date/department cohort. Historical users referenced by assignedEaId remain represented even if their current role changed.

Assignment deadline = createdAt + exactly 7,200,000 milliseconds. Actual assignment <= deadline is ON TIME; later is DELAYED. Still unassigned after the deadline is DELAYED. Before or exactly at the deadline, still unassigned is NOT DUE. This is elapsed time, including nights/weekends.

## Employee and EA outcome checkpoint

Use the calendar date of currentTargetDate. Deadline = that date at 23:59:59.999 India time. completedAt <= deadline is ON TIME; completedAt > deadline is DELAYED. Completed work becomes eligible immediately, including early completion. Incomplete work is NOT DUE through the deadline and DELAYED / OVERDUE after it.

CANCELLED is excluded entirely. An unassigned task never contributes to employee scoring. ON_HOLD and DELAYED application statuses do not independently impose a performance penalty. Only the latest approved target is used. No extra revision penalty is applied.

Missing targets, missing completion timestamps on completed work, and invalid evidence are Unknown and excluded from the denominator. Unknown counts are visible beside the score and in details. A zero denominator displays N/A, never a fabricated zero percent.

## Formulas

Employee Score = on-time eligible assigned tasks / all eligible assigned tasks * 100.

EA Score = (on-time assignment checkpoints + on-time outcome checkpoints) / (eligible assignment checkpoints + eligible outcome checkpoints) * 100.

Round once to one decimal. Example employee: 8/10 = 80.0%. Example EA: (9+7)/(10+8) = 88.9%. Each EA delegation has up to two eligible checkpoints. Not-due and Unknown checkpoints are excluded independently.

## Timezone and reporting period

Existing MySQL columns are DATETIME(3), with no timezone metadata. Local inspection found India wall-clock storage and a current database offset of +330 minutes. The existing task creation/assignment/completion routes use database NOW(). Target dates are written as local calendar dates, not UTC instants.

Performance reads those established India-wall-time event values using TIMESTAMPDIFF(MICROSECOND, '1970-01-01 05:30:00', value)/1000. This explicitly converts stored India time to epoch milliseconds, independent of Node, browser, or database session timezone and without installed MySQL timezone tables. The target calendar date is read with DATE_FORMAT and is never converted through browser UTC parsing. Target EOD is next India midnight minus one millisecond. The browser formats audit timestamps with timeZone: Asia/Kolkata.

Both tables filter population by Task.createdAt, with an inclusive India-calendar From/To range. SQL uses parameterized >= from midnight and < day after to midnight bounds; completedAt does not determine period membership. Outcomes are evaluated at the API's current asOf instant, not at the end of the selected reporting period.

Deployment prerequisite: database NOW()/CURRENT_TIMESTAMP writes must continue to use India time, and existing imported DATETIME data must retain its India convention. Configure/verify production database sessions accordingly before deployment. Setting only the Node TZ variable does not set MySQL session time_zone. This feature does not change global or application database timezone configuration, rewrite historical timestamps, or infer mixed-zone data.

## API, filters and UI

GET /api/performance retains authentication and MD-only signed/current-active-account checks. Other roles receive 403, missing authentication 401. Frontend RequireModule independently redirects unauthorized users to /tasks. Navigation remains unchanged.

Validated query filters: departmentId, fromDate, toDate, search and optional type ALL/EMPLOYEE/EA. Real department rows populate the dropdown, including historical inactive departments. Employees are filtered by membership; EA metrics use the delegation department. Search matches person names literally, not SQL wildcard patterns.

Four bulk queries cover authorization, relevant tasks with grouped assignment history, people and departments. Calculation is linear in the selected task/person population, with no per-task or per-person SQL queries. Audit details return only delegation IDs, deadline/actual timestamps, sources and classifications, not descriptions, credentials or password hashes. For substantially larger datasets, add pagination to the audit rows before extending the reporting load.

Employee columns: Employee, Department, Total Assigned, Eligible Tasks, On Time, Delayed, Not Due, Score, Action.

EA columns: EA, Delegations, Assignment Eligible, Assignment On Time, Assignment Delayed, Outcome Eligible, Outcome On Time, Outcome Delayed, Not Due, Score, Action. EA Not Due counts assignment plus outcome checkpoints. View Details separates both responsibility counts and shows the exact numerator/denominator calculation and underlying delegation IDs.

Summary cards: People, Delegations, On Time, Delayed. Delegations are unique across displayed people. On Time/Delayed count unique represented checkpoints; the same outcome shown for employee and EA counts once. Summary checkpoint totals can exceed delegation count.

## Employee Management layout

The existing fix is retained: centered 1276px card within All Delegations' 1320px sizing philosophy (22px side gutters), automatic margins, mobile gutters, all six columns and horizontal scrolling inside the table wrapper. Task Management uses 1400px in index.css; no Tasks.css exists. Employee create/reset/activation/filter functionality was not altered by the SLA replacement.

## Verification, 2026-10-01

- Frontend build PASS; backend build PASS (client generation only, no migration).
- 37 backend tests PASS: 20 current Performance tests plus 17 existing Employee Management/production-readiness tests. Nine frontend role tests PASS.
- Controlled in-memory fixtures cover exact 2 hours, +1 second, unassigned before/after SLA, exact target EOD, +1 millisecond, open overdue, future not due, cancelled exclusion, Unknown/zero eligibility, primary/fallback assignment, actor-independent attribution, employee 80% and EA 88.9% math, department and India date boundaries, filters and all-role access. No fixture rows were inserted into the database.
- Node timezone checks PASS under UTC, Asia/Kolkata and America/Los_Angeles.
- Guarded local API verification PASS across nine departments and 56 person/cohort comparisons, using an independent raw wall-time calculation. Read-only session timezone checks at UTC and India produced identical results. No database row writes.
- Headless Chrome PASS at 1440px and 390px: page centering, table scrolling, live employee/EA tables, percentage details, employee search/add/reset dialogs, Performance direct-route restrictions and Employee Management ADMIN/HR/EA allow with MD/EMPLOYEE deny.
- The scripts start isolated local APIs without the notification scheduler. Existing startup regression exercises compiled backend health/CORS with the scheduler stubbed to avoid database writes.
- Schema, both migration histories and Prisma configs are byte-identical to HEAD. No migration is required or run.

Use `npm run build` then `npm test` in backend, and `npm run build` / `npm test` in frontend. Additional local checks: backend `node scripts/verify-performance.cjs` and `node scripts/verify-performance-browser.cjs` (installed Chrome and existing local test accounts required).
