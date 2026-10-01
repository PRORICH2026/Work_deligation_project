import { Router } from "express";

import { db } from "../config/db.js";

import {
  createNotification,
  type NotificationType,
} from "../services/notificationService.js";

import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

/* ============================================
   ROLES
============================================ */

const managementRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
];

const delegationCreatorRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
  "EMPLOYEE",
  "DEPARTMENT_HOD",
  "PROCESS",
  "SC_TEAM",
];

function isManagementRole(
  role: string
) {
  return managementRoles.includes(
    role
  );
}

/* ============================================
   NOTIFICATION HELPERS

   Notification errors must never cancel a
   delegation action that already succeeded.
============================================ */

async function safeCreateNotification(
  input: {
    userId: number;
    taskId?: number | null;
    type: NotificationType;
    title: string;
    message: string;
  }
) {
  try {
    await createNotification(
      input
    );
  } catch (error) {
    console.error(
      "NOTIFICATION CREATE ERROR:",
      error
    );
  }
}

async function safeNotifyUsers(
  userIds: Array<
    number | null | undefined
  >,
  notification: {
    taskId: number;
    type: NotificationType;
    title: string;
    message: string;
  }
) {
  const uniqueUserIds =
    Array.from(
      new Set(
        userIds
          .map((id) =>
            Number(id)
          )
          .filter((id) =>
            Number.isInteger(id) &&
            id > 0
          )
      )
    );

  await Promise.all(
    uniqueUserIds.map(
      (userId) =>
        safeCreateNotification({
          userId,
          taskId:
            notification.taskId,
          type:
            notification.type,
          title:
            notification.title,
          message:
            notification.message,
        })
    )
  );
}


/* ============================================
   DELEGATION NOTIFICATION AUDIENCE

   RULE:
   - ADMIN / MD / HR / EA receive every
     delegation notification.
   - EMPLOYEE receives notifications only for
     delegations they personally created.
   - Being assigned to another person's
     delegation does not give an employee
     that delegation's notifications.
============================================ */

async function safeNotifyDelegationAudience(
  createdById: number,
  notification: {
    taskId: number;
    type: NotificationType;
    title: string;
    message: string;
  }
) {
  try {
    const [managementRows] =
      await db.query(
        `
        SELECT id

        FROM \`User\`

        WHERE
          isActive = 1

          AND role IN
          (
            'ADMIN',
            'MD',
            'HR',
            'EA'
          )
        `
      );

    const managementUserIds =
      (managementRows as any[])
        .map(
          (row) =>
            Number(row.id)
        );

    await safeNotifyUsers(
      [
        Number(createdById),
        ...managementUserIds,
      ],
      notification
    );

  } catch (error) {

    console.error(
      "DELEGATION NOTIFICATION AUDIENCE ERROR:",
      error
    );
  }
}

/* ============================================
   DATE HELPERS
============================================ */

function normaliseDate(
  value: string,
  endOfDay = false
) {
  if (
    !value ||
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  const dateOnlyPattern =
    /^\d{4}-\d{2}-\d{2}$/;

  if (
    dateOnlyPattern.test(
      trimmed
    )
  ) {
    return `${trimmed} ${
      endOfDay
        ? "23:59:59"
        : "00:00:00"
    }`;
  }

  const parsed =
    new Date(trimmed);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed;
}

function getDateKey(
  value: any
) {
  if (!value) {
    return "";
  }

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
   GET TASKS
============================================ */

router.get(
  "/",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      let whereClause = "";

      const params: any[] =
        [];

      /*
        MANAGEMENT:
        SEE EVERYTHING

        EMPLOYEE:
        OWN CREATED +
        OWN ASSIGNED
      */

      if (
        !isManagementRole(
          user.role
        )
      ) {
        whereClause = `
          WHERE
            t.createdById = ?
            OR emp.userId = ?
        `;

        params.push(
          user.userId,
          user.userId
        );
      }

      const [rows] =
        await db.query(
          `
          SELECT

            t.id,
            t.title,
            t.description,

            t.priority,
            t.status,
            t.responsibility,

            t.departmentId,
            d.name
              AS departmentName,

            t.createdById,
            creator.name
              AS createdByName,
            creator.email
              AS createdByEmail,

            t.assignedEaId,
            ea.name
              AS assignedEaName,
            ea.email
              AS assignedEaEmail,

            t.assignedEmployeeId,

            emp.fullName
              AS assignedEmployeeName,

            emp.officialEmail
              AS assignedEmployeeEmail,

            emp.userId
              AS assignedEmployeeUserId,

            t.startDate,

            t.originalTargetDate,
            t.currentTargetDate,

            t.eaFirstActionAt,
            t.eaLateResponse,

            t.delayCount,
            t.targetDateUpdateCount,

            t.completedAt,
            t.cancelledAt,

            t.createdAt,
            t.updatedAt

          FROM Task t

          INNER JOIN Department d
            ON d.id =
               t.departmentId

          INNER JOIN \`User\` creator
            ON creator.id =
               t.createdById

          LEFT JOIN \`User\` ea
            ON ea.id =
               t.assignedEaId

          LEFT JOIN Employee emp
            ON emp.id =
               t.assignedEmployeeId

          ${whereClause}

          ORDER BY
            t.createdAt DESC
          `,
          params
        );

      return res.json({
        success: true,
        data: rows,
      });

    } catch (error) {

      console.error(
        "GET TASKS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load delegations",
        });
    }
  }
);

/* ============================================
   GET TASK DETAILS
============================================ */

router.get(
  "/:id/details",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      const taskId =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(
          taskId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid delegation ID",
          });
      }

      const [taskRows] =
        await db.query(
          `
          SELECT

            t.id,
            t.title,
            t.description,

            t.priority,
            t.status,
            t.responsibility,

            t.departmentId,

            d.name
              AS departmentName,

            t.createdById,

            creator.name
              AS createdByName,

            creator.email
              AS createdByEmail,

            t.assignedEaId,

            ea.name
              AS assignedEaName,

            ea.email
              AS assignedEaEmail,

            t.assignedEmployeeId,

            emp.fullName
              AS assignedEmployeeName,

            emp.officialEmail
              AS assignedEmployeeEmail,

            emp.userId
              AS assignedEmployeeUserId,

            t.startDate,

            t.originalTargetDate,
            t.currentTargetDate,

            t.eaFirstActionAt,
            t.eaLateResponse,

            t.delayCount,
            t.targetDateUpdateCount,

            t.completedAt,
            t.cancelledAt,

            t.createdAt,
            t.updatedAt

          FROM Task t

          INNER JOIN Department d
            ON d.id =
               t.departmentId

          INNER JOIN \`User\` creator
            ON creator.id =
               t.createdById

          LEFT JOIN \`User\` ea
            ON ea.id =
               t.assignedEaId

          LEFT JOIN Employee emp
            ON emp.id =
               t.assignedEmployeeId

          WHERE
            t.id = ?

          LIMIT 1
          `,
          [taskId]
        );

      const task =
        (taskRows as any[])[0];

      if (!task) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Delegation not found",
          });
      }

      /* EMPLOYEE ACCESS */

      if (
        !isManagementRole(
          user.role
        )
      ) {
        const isCreator =
          Number(
            task.createdById
          ) ===
          Number(
            user.userId
          );

        const isAssigned =
          Number(
            task.assignedEmployeeUserId
          ) ===
          Number(
            user.userId
          );

        if (
          !isCreator &&
          !isAssigned
        ) {
          return res
            .status(403)
            .json({
              success: false,

              message:
                "You do not have access to this delegation",
            });
        }
      }

      /* STATUS HISTORY */

      const [historyRows] =
        await db.query(
          `
          SELECT

            h.id,
            h.fromStatus,
            h.toStatus,
            h.note,

            h.changedById,

            u.name
              AS changedByName,

            u.email
              AS changedByEmail,

            u.role
              AS changedByRole,

            h.createdAt

          FROM TaskStatusHistory h

          INNER JOIN \`User\` u
            ON u.id =
               h.changedById

          WHERE
            h.taskId = ?

          ORDER BY
            h.createdAt DESC,
            h.id DESC
          `,
          [taskId]
        );

      /* TARGET REVISION HISTORY */

      const [delayRows] =
        await db.query(
          `
          SELECT

            td.id,
            td.delayNumber,

            td.oldTargetDate,
            td.newTargetDate,

            td.reason,

            td.createdById,

            u.name
              AS createdByName,

            u.role
              AS createdByRole,

            td.createdAt

          FROM TaskDelay td

          INNER JOIN \`User\` u
            ON u.id =
               td.createdById

          WHERE
            td.taskId = ?

          ORDER BY
            td.delayNumber DESC,
            td.createdAt DESC
          `,
          [taskId]
        );

      return res.json({
        success: true,

        data: {
          task,

          statusHistory:
            historyRows,

          delays:
            delayRows,
        },
      });

    } catch (error) {

      console.error(
        "TASK DETAILS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load delegation details",
        });
    }
  }
);

/* ============================================
   CREATE DELEGATION
============================================ */

router.post(
  "/",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      if (
        !delegationCreatorRoles.includes(
          user.role
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot create delegations",
          });
      }

      const {
        title,
        description,
        priority,
        departmentId,
        assignedEaId,
      } =
        req.body;

      if (
        !title?.trim() ||
        !description?.trim() ||
        !priority ||
        !departmentId ||
        !assignedEaId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Task title, description, department, priority and EA are required",
          });
      }

      if (
        ![
          "HIGH",
          "MEDIUM",
          "LOW",
        ].includes(
          priority
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid priority",
          });
      }

      /* DEPARTMENT */

      const [departmentRows] =
        await db.query(
          `
          SELECT id

          FROM Department

          WHERE
            id = ?
            AND isActive = 1

          LIMIT 1
          `,
          [
            Number(
              departmentId
            ),
          ]
        );

      if (
        (departmentRows as any[])
          .length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid department",
          });
      }

      /* EA */

      const [eaRows] =
        await db.query(
          `
          SELECT
            id,
            name

          FROM \`User\`

          WHERE
            id = ?
            AND role = 'EA'
            AND isActive = 1

          LIMIT 1
          `,
          [
            Number(
              assignedEaId
            ),
          ]
        );

      if (
        (eaRows as any[])
          .length === 0
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Selected EA is invalid",
          });
      }

      /* CREATE */

      const [result]: any =
        await db.query(
          `
          INSERT INTO Task
          (
            title,
            description,
            priority,

            status,
            responsibility,

            departmentId,
            createdById,
            assignedEaId,

            delayCount,
            targetDateUpdateCount,

            createdAt,
            updatedAt
          )

          VALUES
          (
            ?,
            ?,
            ?,

            'NEW',
            'EA',

            ?,
            ?,
            ?,

            0,
            0,

            NOW(),
            NOW()
          )
          `,
          [
            title.trim(),

            description.trim(),

            priority,

            Number(
              departmentId
            ),

            user.userId,

            Number(
              assignedEaId
            ),
          ]
        );

      const taskId =
        result.insertId;

      await db.query(
        `
        INSERT INTO TaskStatusHistory
        (
          taskId,
          fromStatus,
          toStatus,

          changedById,
          note,

          createdAt
        )

        VALUES
        (
          ?,
          NULL,
          'NEW',

          ?,
          ?,

          NOW()
        )
        `,
        [
          taskId,

          user.userId,

          "Delegation created",
        ]
      );

      /* NOTIFY:
         - ALL MANAGEMENT
         - EMPLOYEE CREATOR ONLY
      */

      const selectedEa =
        (eaRows as any[])[0];

      await safeNotifyDelegationAudience(
        Number(
          user.userId
        ),
        {
          taskId,

          type:
            "DELEGATION_CREATED",

          title:
            `Delegation #${taskId} Created`,

          message:
            `A new delegation "${title.trim()}" has been created and assigned to ${selectedEa.name}.`,
        }
      );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Delegation created successfully",

          taskId,
        });

    } catch (error) {

      console.error(
        "CREATE TASK ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to create delegation",
        });
    }
  }
);

/* ============================================
   ASSIGN EMPLOYEE
============================================ */

router.patch(
  "/:id/assign",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      if (
        !isManagementRole(
          user.role
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot assign delegations",
          });
      }

      const taskId =
        Number(
          req.params.id
        );

      const {
        assignedEmployeeId,
        startDate,
        targetDate,
        assignmentRemarks,
      } =
        req.body;

      if (
        !Number.isInteger(
          taskId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid delegation ID",
          });
      }

      if (
        !assignedEmployeeId ||
        !startDate ||
        !targetDate
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Employee, start date and target date are required",
          });
      }

      const normalisedStart =
        normaliseDate(
          startDate,
          false
        );

      const normalisedTarget =
        normaliseDate(
          targetDate,
          true
        );

      if (
        !normalisedStart ||
        !normalisedTarget
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid start or target date",
          });
      }

      const startKey =
        String(
          startDate
        ).slice(
          0,
          10
        );

      const targetKey =
        String(
          targetDate
        ).slice(
          0,
          10
        );

      if (
        targetKey <
        startKey
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Target date cannot be before start date",
          });
      }

      /* GET TASK */

      const [taskRows] =
        await db.query(
          `
          SELECT

            id,
            title,
            createdById,
            status,
            responsibility,

            assignedEmployeeId,

            departmentId,
            createdAt

          FROM Task

          WHERE
            id = ?

          LIMIT 1
          `,
          [taskId]
        );

      const task =
        (taskRows as any[])[0];

      if (!task) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Delegation not found",
          });
      }

      /*
        STRICT ASSIGNMENT RULE:

        Only NEW delegations
        can be assigned.
      */

      if (
        task.status !==
        "NEW"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Only NEW delegations can be assigned",
          });
      }

      if (
        task.responsibility !==
        "EA"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "This delegation is not waiting for assignment",
          });
      }

      if (
        task.assignedEmployeeId
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "This delegation is already assigned",
          });
      }

      /* EMPLOYEE */

      const [employeeRows] =
        await db.query(
          `
          SELECT

            id,
            fullName,
            departmentId,
            userId

          FROM Employee

          WHERE
            id = ?
            AND isActive = 1

          LIMIT 1
          `,
          [
            Number(
              assignedEmployeeId
            ),
          ]
        );

      const employee =
        (employeeRows as any[])[0];

      if (!employee) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Selected employee is invalid",
          });
      }

      if (
        Number(
          employee.departmentId
        ) !==
        Number(
          task.departmentId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Employee must belong to the same department",
          });
      }

      /* EA RESPONSE */

      const now =
        new Date();

      const createdAt =
        new Date(
          task.createdAt
        );

      const elapsed =
        now.getTime() -
        createdAt.getTime();

      const twoHours =
        2 *
        60 *
        60 *
        1000;

      const eaLateResponse =
        elapsed >
        twoHours
          ? 1
          : 0;

      /* UPDATE */

      await db.query(
        `
        UPDATE Task

        SET
          assignedEmployeeId = ?,

          startDate = ?,

          originalTargetDate = ?,

          currentTargetDate = ?,

          responsibility =
            'EMPLOYEE',

          status =
            'IN_PROGRESS',

          eaFirstActionAt =
            NOW(),

          eaLateResponse = ?,

          updatedAt =
            NOW()

        WHERE
          id = ?
        `,
        [
          Number(
            assignedEmployeeId
          ),

          normalisedStart,

          normalisedTarget,

          normalisedTarget,

          eaLateResponse,

          taskId,
        ]
      );

      let historyNote =
        `Assigned to ${employee.fullName}`;

      if (
        assignmentRemarks &&
        String(
          assignmentRemarks
        ).trim()
      ) {
        historyNote +=
          ` | Remarks: ${String(
            assignmentRemarks
          ).trim()}`;
      }

      await db.query(
        `
        INSERT INTO TaskStatusHistory
        (
          taskId,

          fromStatus,
          toStatus,

          changedById,

          note,

          createdAt
        )

        VALUES
        (
          ?,

          'NEW',
          'IN_PROGRESS',

          ?,

          ?,

          NOW()
        )
        `,
        [
          taskId,

          user.userId,

          historyNote,
        ]
      );

      /* NOTIFY:
         - ALL MANAGEMENT
         - EMPLOYEE WHO CREATED THIS DELEGATION
      */

      await safeNotifyDelegationAudience(
        Number(
          task.createdById
        ),
        {
          taskId,

          type:
            "DELEGATION_ASSIGNED",

          title:
            `Delegation #${taskId} Assigned`,

          message:
            `The delegation "${task.title}" has been assigned to ${employee.fullName}. Target date: ${targetKey}.`,
        }
      );

      return res.json({
        success: true,

        message:
          "Delegation assigned successfully",
      });

    } catch (error) {

      console.error(
        "ASSIGN TASK ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to assign delegation",
        });
    }
  }
);

/* ============================================
   UPDATE STATUS
============================================ */

router.patch(
  "/:id/status",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      /* MANAGEMENT ONLY */

      if (
        !isManagementRole(
          user.role
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "Employees cannot update delegation status",
          });
      }

      const taskId =
        Number(
          req.params.id
        );

      const {
        status,
        note,
        delayReason,
        newTargetDate,
        cancellationReason,
      } =
        req.body;

      if (
        !Number.isInteger(
          taskId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid delegation ID",
          });
      }

      const allowedStatuses = [
        "IN_PROGRESS",
        "ON_HOLD",
        "DELAYED",
        "COMPLETED",
        "CANCELLED",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid status",
          });
      }

      /* GET CURRENT TASK */

      const [taskRows] =
        await db.query(
          `
          SELECT

            t.id,
            t.title,
            t.createdById,

            t.status,
            t.responsibility,

            t.assignedEmployeeId,

            emp.userId
              AS assignedEmployeeUserId,

            t.currentTargetDate,

            t.delayCount,
            t.targetDateUpdateCount,

            t.completedAt,
            t.cancelledAt

          FROM Task t

          LEFT JOIN Employee emp
            ON emp.id =
               t.assignedEmployeeId

          WHERE
            t.id = ?

          LIMIT 1
          `,
          [taskId]
        );

      const task =
        (taskRows as any[])[0];

      if (!task) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Delegation not found",
          });
      }

      /* ========================================
         CLOSED TASK
      ======================================== */

      if (
        task.status ===
          "COMPLETED" ||
        task.status ===
          "CANCELLED"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Closed delegation cannot be updated",
          });
      }

      if (status === "CANCELLED") {
        if (typeof cancellationReason !== "string" || !cancellationReason.trim()) {
          return res.status(400).json({
            success: false,
            message: "Cancellation reason is required",
          });
        }

        if (!["NEW", "IN_PROGRESS", "ON_HOLD", "DELAYED"].includes(task.status)) {
          return res.status(400).json({ success: false, message: "Delegation cannot be cancelled" });
        }

        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          const [result] = await connection.query<import("mysql2").ResultSetHeader>(
            `UPDATE Task SET status = 'CANCELLED', cancelledAt = NOW(), updatedAt = NOW()
             WHERE id = ? AND status = ?`,
            [taskId, task.status]
          );
          if (result.affectedRows !== 1) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: "Delegation changed; refresh and try again" });
          }
          await connection.query(
            `INSERT INTO TaskStatusHistory
             (taskId, fromStatus, toStatus, changedById, note, createdAt)
             VALUES (?, ?, 'CANCELLED', ?, ?, NOW())`,
            [taskId, task.status, user.userId, cancellationReason.trim()]
          );
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }

        await safeNotifyDelegationAudience(Number(task.createdById), {
          taskId,
          type: "STATUS_CHANGED",
          title: `Delegation #${taskId} Cancelled`,
          message: `The delegation "${task.title}" was cancelled. Reason: ${cancellationReason.trim()}`,
        });
        return res.json({ success: true, message: "Delegation cancelled successfully" });
      }

      /* ========================================
         NEW TASK CANNOT USE STATUS UPDATE

         IT MUST FIRST BE ASSIGNED
      ======================================== */

      if (
        task.status ===
        "NEW"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "NEW delegation must be assigned before it can be updated",
          });
      }

      /* ========================================
         EMPLOYEE MUST EXIST
      ======================================== */

      if (
        !task.assignedEmployeeId ||
        task.responsibility !==
          "EMPLOYEE"
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Delegation must be assigned to an employee before status can be updated",
          });
      }

      /* ========================================
         VALID CURRENT STATES
      ======================================== */

      const updateableStatuses = [
        "IN_PROGRESS",
        "ON_HOLD",
        "DELAYED",
      ];

      if (
        !updateableStatuses.includes(
          task.status
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Current delegation status cannot be updated",
          });
      }

      /* ========================================
         PENDING / ON HOLD
      ======================================== */

      if (
        status ===
        "ON_HOLD"
      ) {
        if (
          !note ||
          !String(
            note
          ).trim()
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Pending reason is required",
            });
        }

        await db.query(
          `
          UPDATE Task

          SET
            status = 'ON_HOLD',

            updatedAt = NOW()

          WHERE
            id = ?
          `,
          [taskId]
        );

        await db.query(
          `
          INSERT INTO TaskStatusHistory
          (
            taskId,

            fromStatus,
            toStatus,

            changedById,

            note,

            createdAt
          )

          VALUES
          (
            ?,
            ?,
            'ON_HOLD',
            ?,
            ?,
            NOW()
          )
          `,
          [
            taskId,

            task.status,

            user.userId,

            String(
              note
            ).trim(),
          ]
        );

        await safeNotifyDelegationAudience(
          Number(
            task.createdById
          ),
          {
            taskId,
            type:
              "STATUS_CHANGED",
            title:
              `Delegation #${taskId} Pending`,
            message:
              `The delegation "${task.title}" was moved to Pending. Reason: ${String(
                note
              ).trim()}`,
          }
        );

        return res.json({
          success: true,

          message:
            "Delegation moved to pending successfully",
        });
      }

      /* ========================================
         DELAY
      ======================================== */

      if (
        status ===
        "DELAYED"
      ) {
        if (
          !delayReason ||
          !String(
            delayReason
          ).trim()
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Delay reason is required",
            });
        }

        if (
          !newTargetDate
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Revised target date is required",
            });
        }

        if (
          Number(
            task.targetDateUpdateCount ||
            0
          ) >= 3
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Maximum 3 target revisions are allowed",
            });
        }

        const newTarget =
          normaliseDate(
            newTargetDate,
            true
          );

        if (!newTarget) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Invalid revised target date",
            });
        }

        const currentTargetKey =
          getDateKey(
            task.currentTargetDate
          );

        const newTargetKey =
          String(
            newTargetDate
          ).slice(
            0,
            10
          );

        if (
          currentTargetKey &&
          newTargetKey <=
            currentTargetKey
        ) {
          return res
            .status(400)
            .json({
              success: false,

              message:
                "Revised target date must be later than current target date",
            });
        }

        const newDelayCount =
          Number(
            task.delayCount ||
            0
          ) + 1;

        const newRevisionCount =
          Number(
            task.targetDateUpdateCount ||
            0
          ) + 1;

        /* REVISION HISTORY */

        await db.query(
          `
          INSERT INTO TaskDelay
          (
            taskId,

            oldTargetDate,
            newTargetDate,

            reason,
            delayNumber,

            createdById,

            createdAt
          )

          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            NOW()
          )
          `,
          [
            taskId,

            task.currentTargetDate,

            newTarget,

            String(
              delayReason
            ).trim(),

            newDelayCount,

            user.userId,
          ]
        );

        /* TASK */

        await db.query(
          `
          UPDATE Task

          SET
            status = 'DELAYED',

            currentTargetDate = ?,

            delayCount = ?,

            targetDateUpdateCount = ?,

            updatedAt = NOW()

          WHERE
            id = ?
          `,
          [
            newTarget,

            newDelayCount,

            newRevisionCount,

            taskId,
          ]
        );

        /* STATUS HISTORY */

        await db.query(
          `
          INSERT INTO TaskStatusHistory
          (
            taskId,

            fromStatus,
            toStatus,

            changedById,

            note,

            createdAt
          )

          VALUES
          (
            ?,
            ?,
            'DELAYED',
            ?,
            ?,
            NOW()
          )
          `,
          [
            taskId,

            task.status,

            user.userId,

            String(
              delayReason
            ).trim(),
          ]
        );

        await safeNotifyDelegationAudience(
          Number(
            task.createdById
          ),
          {
            taskId,
            type:
              "TARGET_REVISED",
            title:
              `Delegation #${taskId} Target Revised`,
            message:
              `The target date for "${task.title}" was revised to ${newTargetKey}. Reason: ${String(
                delayReason
              ).trim()}`,
          }
        );

        return res.json({
          success: true,

          message:
            "Delegation delayed and target revised successfully",
        });
      }

      /* ========================================
         COMPLETE
      ======================================== */

      if (
        status ===
        "COMPLETED"
      ) {
        await db.query(
          `
          UPDATE Task

          SET
            status =
              'COMPLETED',

            completedAt =
              NOW(),

            updatedAt =
              NOW()

          WHERE
            id = ?
          `,
          [taskId]
        );

        await db.query(
          `
          INSERT INTO TaskStatusHistory
          (
            taskId,

            fromStatus,
            toStatus,

            changedById,

            note,

            createdAt
          )

          VALUES
          (
            ?,
            ?,
            'COMPLETED',
            ?,
            ?,
            NOW()
          )
          `,
          [
            taskId,

            task.status,

            user.userId,

            note &&
            String(
              note
            ).trim()
              ? String(
                  note
                ).trim()
              : "Delegation completed",
          ]
        );

        await safeNotifyDelegationAudience(
          Number(
            task.createdById
          ),
          {
            taskId,
            type:
              "COMPLETED",
            title:
              `Delegation #${taskId} Completed`,
            message:
              `The delegation "${task.title}" has been completed.`,
          }
        );

        return res.json({
          success: true,

          message:
            "Delegation completed successfully",
        });
      }

      /* ========================================
         IN PROGRESS / RESUME
      ======================================== */

      if (
        status ===
        "IN_PROGRESS"
      ) {
        await db.query(
          `
          UPDATE Task

          SET
            status =
              'IN_PROGRESS',

            updatedAt =
              NOW()

          WHERE
            id = ?
          `,
          [taskId]
        );

        let progressNote =
          "";

        if (
          note &&
          String(
            note
          ).trim()
        ) {
          progressNote =
            String(
              note
            ).trim();

        } else if (
          task.status ===
          "ON_HOLD"
        ) {
          progressNote =
            "Delegation resumed from pending";

        } else if (
          task.status ===
          "DELAYED"
        ) {
          progressNote =
            "Delegation resumed after delay";

        } else {
          progressNote =
            "Progress updated";
        }

        await db.query(
          `
          INSERT INTO TaskStatusHistory
          (
            taskId,

            fromStatus,
            toStatus,

            changedById,

            note,

            createdAt
          )

          VALUES
          (
            ?,
            ?,
            'IN_PROGRESS',
            ?,
            ?,
            NOW()
          )
          `,
          [
            taskId,

            task.status,

            user.userId,

            progressNote,
          ]
        );

        await safeNotifyDelegationAudience(
          Number(
            task.createdById
          ),
          {
            taskId,
            type:
              "STATUS_CHANGED",
            title:
              `Delegation #${taskId} In Progress`,
            message:
              `The delegation "${task.title}" is In Progress. ${progressNote}`,
          }
        );

        return res.json({
          success: true,

          message:
            "Delegation progress updated successfully",
        });
      }

      return res
        .status(400)
        .json({
          success: false,

          message:
            "Unsupported delegation update",
        });

    } catch (error) {

      console.error(
        "UPDATE TASK ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to update delegation",
        });
    }
  }
);

export default router;
