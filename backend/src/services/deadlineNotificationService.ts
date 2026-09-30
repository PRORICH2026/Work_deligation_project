import { db } from "../config/db.js";

import {
  createNotification,
  type NotificationType,
} from "./notificationService.js";

interface DeadlineTask {
  id: number;

  title: string;

  status: string;

  currentTargetDate:
    | string
    | Date;

  createdById: number;

  createdByRole: string;
}

interface ManagementUser {
  id: number;
}

interface ExistingNotification {
  id: number;
}

/* ============================================
   MANAGEMENT ROLES

   These users receive deadline notifications
   for every delegation.
============================================ */

const managementRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
];

/* ============================================
   DATE KEY

   Returns:
   YYYY-MM-DD
============================================ */

function getDateKey(
  value:
    | string
    | Date
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
}

/* ============================================
   CHECK IF USER ALREADY RECEIVED
   THIS NOTIFICATION TODAY

   Prevents duplicate notifications when
   the scheduler runs multiple times.
============================================ */

async function alreadySentToday(
  userId: number,
  taskId: number,
  type: NotificationType
) {
  const [rows] =
    await db.query(
      `
      SELECT
        id

      FROM Notification

      WHERE
        userId = ?

        AND taskId = ?

        AND type = ?

        AND DATE(createdAt) =
            CURDATE()

      LIMIT 1
      `,
      [
        userId,
        taskId,
        type,
      ]
    );

  return (
    (
      rows as
        ExistingNotification[]
    ).length >
    0
  );
}

/* ============================================
   CREATE DEADLINE NOTIFICATION
============================================ */

async function sendDeadlineNotification(
  userId: number,
  task: DeadlineTask,
  type: NotificationType
) {
  const duplicate =
    await alreadySentToday(
      userId,
      task.id,
      type
    );

  if (duplicate) {
    return;
  }

  if (
    type ===
    "DUE_TODAY"
  ) {
    await createNotification({
      userId,

      taskId:
        task.id,

      type:
        "DUE_TODAY",

      title:
        `Delegation #${task.id} Due Today`,

      message:
        `"${task.title}" is due today.`,
    });

    return;
  }

  if (
    type ===
    "OVERDUE"
  ) {
    await createNotification({
      userId,

      taskId:
        task.id,

      type:
        "OVERDUE",

      title:
        `Delegation #${task.id} Overdue`,

      message:
        `"${task.title}" has passed its target date and is still open.`,
    });
  }
}

/* ============================================
   DEADLINE CHECK

   RULES:

   EMPLOYEE
   → Only receives deadline notification
     for a delegation created by themselves.

   ADMIN / MD / HR / EA
   → Receive deadline notifications for
     every open delegation.

   COMPLETED / CANCELLED
   → Never generate deadline notifications.
============================================ */

export async function checkDeadlineNotifications() {
  try {
    const today =
      getDateKey(
        new Date()
      );

    if (!today) {
      return;
    }

    /* ========================================
       ACTIVE MANAGEMENT USERS
    ======================================== */

    const [managementRows] =
      await db.query(
        `
        SELECT
          id

        FROM \`User\`

        WHERE
          role IN (
            'ADMIN',
            'MD',
            'HR',
            'EA'
          )

          AND isActive = 1
        `
      );

    const managementUsers =
      managementRows as
        ManagementUser[];

    /* ========================================
       OPEN DELEGATIONS WITH TARGET DATE
    ======================================== */

    const [taskRows] =
      await db.query(
        `
        SELECT

          t.id,

          t.title,

          t.status,

          t.currentTargetDate,

          t.createdById,

          creator.role
            AS createdByRole

        FROM Task t

        INNER JOIN \`User\`
          creator
            ON creator.id =
               t.createdById

        WHERE
          t.currentTargetDate
            IS NOT NULL

          AND t.status
            NOT IN (
              'COMPLETED',
              'CANCELLED'
            )
        `
      );

    const tasks =
      taskRows as
        DeadlineTask[];

    /* ========================================
       PROCESS EACH DELEGATION
    ======================================== */

    for (
      const task
      of tasks
    ) {
      try {
        const targetDate =
          getDateKey(
            task.currentTargetDate
          );

        if (
          !targetDate
        ) {
          continue;
        }

        let notificationType:
          | NotificationType
          | null =
          null;

        if (
          targetDate ===
          today
        ) {
          notificationType =
            "DUE_TODAY";

        } else if (
          targetDate <
          today
        ) {
          notificationType =
            "OVERDUE";
        }

        /*
          Future target date
          = no notification.
        */

        if (
          !notificationType
        ) {
          continue;
        }

        /* ====================================
           BUILD RECIPIENT LIST
        ==================================== */

        const recipientIds =
          new Set<number>();

        /*
          MANAGEMENT:
          receives every delegation.
        */

        managementUsers.forEach(
          (
            managementUser
          ) => {
            recipientIds.add(
              Number(
                managementUser.id
              )
            );
          }
        );

        /*
          EMPLOYEE CREATOR:
          receives only their own delegation.

          If delegation was created by
          management, no extra employee
          notification is added.
        */

        if (
          task.createdByRole ===
          "EMPLOYEE"
        ) {
          recipientIds.add(
            Number(
              task.createdById
            )
          );
        }

        /* ====================================
           SEND
        ==================================== */

        for (
          const userId
          of recipientIds
        ) {
          try {
            await sendDeadlineNotification(
              userId,
              task,
              notificationType
            );

          } catch (
            notificationError
          ) {

            /*
              One notification failure
              must never stop the rest.
            */

            console.error(
              `DEADLINE NOTIFICATION ERROR - Task ${task.id}, User ${userId}:`,
              notificationError
            );
          }
        }

      } catch (
        taskError
      ) {

        console.error(
          `DEADLINE CHECK ERROR - Task ${task.id}:`,
          taskError
        );
      }
    }

    console.log(
      `Deadline notification check completed at ${new Date().toLocaleString()}`
    );

  } catch (error) {

    /*
      Scheduler failure must never
      crash the application.
    */

    console.error(
      "DEADLINE NOTIFICATION CHECK ERROR:",
      error
    );
  }
}

/* ============================================
   START SCHEDULER

   Runs every 15 minutes.

   Duplicate prevention means the same
   DUE TODAY / OVERDUE alert will only
   be created once per user, task, type,
   and calendar day.
============================================ */

export function startDeadlineNotificationScheduler() {
  /*
    First check immediately when
    the backend starts.
  */

  checkDeadlineNotifications();

  const fifteenMinutes =
    15 *
    60 *
    1000;

  setInterval(
    () => {
      checkDeadlineNotifications();
    },
    fifteenMinutes
  );

  console.log(
    "Deadline notification scheduler started"
  );
}