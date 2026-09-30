export interface StatusHistory {
  id: number;

  fromStatus?: string;
  toStatus: string;

  note?: string;

  changedById: number;
  changedByName: string;
  changedByEmail?: string;
  changedByRole: string;

  createdAt: string;
}

export interface DelayHistory {
  id: number;

  delayNumber: number;

  oldTargetDate?: string;
  newTargetDate: string;

  reason: string;

  createdById: number;
  createdByName: string;
  createdByRole: string;

  createdAt: string;
}