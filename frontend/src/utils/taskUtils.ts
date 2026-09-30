import type {
  Task,
} from "../types/task";

export type DueStatusKey =
  | "ON_TIME"
  | "DUE_TODAY"
  | "OVERDUE"
  | "NONE";

export interface DueStatusResult {
  key: DueStatusKey;
  label: string;
  className: string;
}

/* ==========================================
   DATE ONLY
========================================== */

export function formatDateOnly(
  value?: string
) {
  if (!value) {
    return "-";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "-";
  }

  return date.toLocaleDateString();
}

/* ==========================================
   DUE STATUS

   Uses latest/current target date.
========================================== */

export function getDueStatus(
  task: Task
): DueStatusResult {
  if (
    task.status === "COMPLETED" ||
    task.status === "CANCELLED" ||
    !task.currentTargetDate
  ) {
    return {
      key: "NONE",
      label: "-",
      className: "",
    };
  }

  const target =
    new Date(
      task.currentTargetDate
    );

  if (
    Number.isNaN(
      target.getTime()
    )
  ) {
    return {
      key: "NONE",
      label: "-",
      className: "",
    };
  }

  const today =
    new Date();

  const todayKey =
    today.getFullYear() *
      10000 +
    (today.getMonth() + 1) *
      100 +
    today.getDate();

  const targetKey =
    target.getFullYear() *
      10000 +
    (target.getMonth() + 1) *
      100 +
    target.getDate();

  if (
    targetKey <
    todayKey
  ) {
    return {
      key: "OVERDUE",
      label: "OVERDUE",
      className:
        "due-overdue",
    };
  }

  if (
    targetKey ===
    todayKey
  ) {
    return {
      key: "DUE_TODAY",
      label: "DUE TODAY",
      className:
        "due-today",
    };
  }

  return {
    key: "ON_TIME",
    label: "ON TIME",
    className:
      "due-on-time",
  };
}