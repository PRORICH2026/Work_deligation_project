export type SlaCounts = { eligible: number; onTime: number; delayed: number; notDue: number; unknown: number; overdue: number };
export type SlaDetail = {
  id: number; assignment: string; outcome: string; assignmentDeadline: number | null; actualAssignment: number | null;
  assignmentSource: string | null; targetDate: string | null; deadline: number | null; completedAt: number | null; overdue: boolean;
};
export type PerformancePerson = {
  id: number; kind: 'EMPLOYEE' | 'EA'; name: string; departmentId: number | null; departmentName: string | null;
  assigned: number; assignment: SlaCounts; outcome: SlaCounts; eligible: number; onTime: number; delayed: number;
  score: number | null; details: SlaDetail[];
};
export type PerformanceData = {
  people: PerformancePerson[]; departments: { id: number; name: string }[];
  summary: { totalPeople: number; totalDelegations: number; onTime: number; delayed: number; unattributed: number };
  asOf: string; timezone: string;
};
