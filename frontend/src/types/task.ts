export interface Task {
  id: number;

  title: string;
  description?: string;

  priority: string;
  status: string;
  responsibility: string;

  departmentId: number;
  departmentName: string;

  createdById: number;
  createdByName: string;
  createdByEmail?: string;

  assignedEaId?: number;
  assignedEaName?: string;
  assignedEaEmail?: string;

  assignedEmployeeId?: number;
  assignedEmployeeName?: string;
  assignedEmployeeEmail?: string;
  assignedEmployeeUserId?: number;

  startDate?: string;

  originalTargetDate?: string;
  currentTargetDate?: string;

  eaFirstActionAt?: string;

  eaLateResponse?:
    | boolean
    | number;

  delayCount: number;

  targetDateUpdateCount: number;

  completedAt?: string;

  cancelledAt?: string;

  createdAt: string;

  updatedAt?: string;
}