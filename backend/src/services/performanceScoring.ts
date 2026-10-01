export type Result = 'ON TIME' | 'DELAYED' | 'NOT DUE' | 'UNKNOWN';
export type SlaTask = {
  id: number; departmentId: number; assignedEmployeeId: number | null; assignedEaId: number | null;
  status: string; createdMs: number | null; assignmentMs: number | null; historyAssignmentMs: number | null;
  completedMs: number | null; targetDate: string | null;
};
export type Person = { id: number; kind: 'EMPLOYEE' | 'EA'; name: string; departmentId: number | null; departmentName: string | null };
export type Filters = { departmentId?: number | undefined; type: 'ALL' | 'EMPLOYEE' | 'EA'; fromDate?: string | undefined; toDate?: string | undefined; search: string };
const DAY = 86400000;
export function indiaMidnight(day: string): number {
  return Date.parse(`${day}T00:00:00.000+05:30`);
}
export function targetEndOfDay(day: string | null): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const midnight = indiaMidnight(day);
  if (!Number.isFinite(midnight) || new Date(midnight + 330 * 60000).toISOString().slice(0, 10) !== day) return null;
  return midnight + DAY - 1;
}
export function percentage(onTime: number, eligible: number) {
  return eligible ? Math.round(onTime / eligible * 1000) / 10 : null;
}
export function classifyTask(t: SlaTask, now: number) {
  if (t.status === 'CANCELLED') return null;
  const valid = (n: number | null): n is number => n !== null && Number.isFinite(n) && n <= now;
  const created = valid(t.createdMs) ? t.createdMs : null;
  const assignmentDeadline = created === null ? null : created + 2 * 3600000;
  const candidates = [
    { time: t.assignmentMs, source: 'eaFirstActionAt' },
    { time: t.historyAssignmentMs, source: 'NEW -> IN_PROGRESS history' },
  ];
  const actual = t.assignedEmployeeId === null || created === null ? undefined
    : candidates.find(c => valid(c.time) && c.time >= created);
  let assignment: Result = 'UNKNOWN';
  if (assignmentDeadline !== null) {
    if (actual) assignment = actual.time! <= assignmentDeadline ? 'ON TIME' : 'DELAYED';
    else if (t.assignedEmployeeId === null) assignment = now > assignmentDeadline ? 'DELAYED' : 'NOT DUE';
  }
  const deadline = targetEndOfDay(t.targetDate);
  let outcome: Result = 'UNKNOWN';
  if (deadline !== null) {
    if (t.status === 'COMPLETED') {
      if (valid(t.completedMs) && created !== null && t.completedMs >= created) outcome = t.completedMs <= deadline ? 'ON TIME' : 'DELAYED';
    } else outcome = now > deadline ? 'DELAYED' : 'NOT DUE';
  }
  return { id: t.id, assignment, outcome, assignmentDeadline, actualAssignment: actual?.time ?? null,
    assignmentSource: actual?.source ?? null, targetDate: t.targetDate, deadline, completedAt: t.completedMs,
    overdue: t.status !== 'COMPLETED' && outcome === 'DELAYED' };
}
function emptyCounts() { return { eligible: 0, onTime: 0, delayed: 0, notDue: 0, unknown: 0, overdue: 0 }; }
function count(c: ReturnType<typeof emptyCounts>, result: Result, overdue = false) {
  if (result === 'ON TIME') { c.onTime++; c.eligible++; }
  else if (result === 'DELAYED') { c.delayed++; c.eligible++; }
  else if (result === 'NOT DUE') c.notDue++;
  else c.unknown++;
  if (overdue) c.overdue++;
}
export function buildPerformance(tasks: SlaTask[], persons: Person[], filters: Filters, now: number) {
  const search = filters.search.toLocaleLowerCase();
  const selected = persons.filter(p => (filters.type === 'ALL' || p.kind === filters.type)
    && p.name.toLocaleLowerCase().includes(search)
    && (p.kind === 'EA' || !filters.departmentId || p.departmentId === filters.departmentId));
  const people = selected.map(p => ({ ...p, assigned: 0, assignment: emptyCounts(), outcome: emptyCounts(),
    eligible: 0, onTime: 0, delayed: 0, score: null as number | null,
    details: [] as NonNullable<ReturnType<typeof classifyTask>>[] }));
  const byEmployee = new Map(people.filter(p => p.kind === 'EMPLOYEE').map(p => [p.id, p]));
  const byEa = new Map(people.filter(p => p.kind === 'EA').map(p => [p.id, p]));
  const eaIds = new Set(persons.filter(p => p.kind === 'EA').map(p => p.id));
  const summary = { totalPeople: people.length, totalDelegations: 0, onTime: 0, delayed: 0, unattributed: 0 };
  for (const t of tasks) {
    if (t.status === 'CANCELLED') continue;
    // Guard cohort rules here too, so controlled fixtures exercise the same behavior.
    if ((filters.fromDate && (t.createdMs === null || t.createdMs < indiaMidnight(filters.fromDate)))
      || (filters.toDate && (t.createdMs === null || t.createdMs >= indiaMidnight(filters.toDate) + DAY))) continue;
    const employee = t.assignedEmployeeId === null ? undefined : byEmployee.get(t.assignedEmployeeId);
    const ea = (!filters.departmentId || t.departmentId === filters.departmentId) && t.assignedEaId !== null ? byEa.get(t.assignedEaId) : undefined;
    if ((!filters.departmentId || t.departmentId === filters.departmentId) && (t.assignedEaId === null || !eaIds.has(t.assignedEaId))) summary.unattributed++;
    if (!employee && !ea) continue;
    const details = classifyTask(t, now)!;
    for (const person of [employee, ea]) {
      if (!person) continue;
      person.assigned++; person.details.push(details);
      count(person.outcome, details.outcome, details.overdue);
      if (person.kind === 'EA') count(person.assignment, details.assignment);
    }
    summary.totalDelegations++;
    // A shared outcome is counted once, even if both employee and EA are displayed.
    for (const result of ea ? [details.assignment, details.outcome] : [details.outcome]) {
      if (result === 'ON TIME') summary.onTime++;
      if (result === 'DELAYED') summary.delayed++;
    }
  }
  for (const p of people) {
    p.eligible = p.outcome.eligible + p.assignment.eligible;
    p.onTime = p.outcome.onTime + p.assignment.onTime;
    p.delayed = p.outcome.delayed + p.assignment.delayed;
    p.score = percentage(p.onTime, p.eligible);
  }
  return { people, summary, asOf: new Date(now).toISOString(), timezone: 'Asia/Kolkata' };
}
