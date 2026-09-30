import { db } from "../config/db.js";

export type NotificationType =
  | "DELEGATION_CREATED"
  | "DELEGATION_ASSIGNED"
  | "STATUS_CHANGED"
  | "TARGET_REVISED"
  | "COMPLETED"
  | "DUE_TODAY"
  | "OVERDUE"
  | "SYSTEM";

interface CreateNotificationInput {
  userId: number;

  taskId?: number | null;

  type: NotificationType;

  title: string;

  message: string;
}

/* ============================================
   CREATE NOTIFICATION
============================================ */

export async function createNotification(
  input: CreateNotificationInput
) {
  const {
    userId,
    taskId = null,
    type,
    title,
    message,
  } = input;

  if (
    !userId ||
    !type ||
    !title.trim() ||
    !message.trim()
  ) {
    throw new Error(
      "Invalid notification data"
    );
  }

  const [result]: any =
    await db.query(
      `
      INSERT INTO Notification
      (
        userId,
        taskId,
        type,
        title,
        message,
        isRead,
        readAt,
        createdAt,
        updatedAt
      )

      VALUES
      (
        ?,
        ?,
        ?,
        ?,
        ?,
        0,
        NULL,
        NOW(),
        NOW()
      )
      `,
      [
        userId,

        taskId,

        type,

        title.trim(),

        message.trim(),
      ]
    );

  return result.insertId;
}