import { Router } from "express";

import { db } from "../config/db.js";

import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const managementRoles = [
  "ADMIN",
  "MD",
  "HR",
  "EA",
];

router.get(
  "/",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user = req.user!;

      const managementView =
        managementRoles.includes(
          user.role
        );

      let taskWhere = "";

      const taskParams: any[] = [];

      if (!managementView) {
        taskWhere = `
          WHERE
            t.createdById = ?
            OR emp.userId = ?
        `;

        taskParams.push(
          user.userId,
          user.userId
        );
      }

      /* =========================================
         DELEGATION COUNTS
      ========================================= */

      const [taskCountRows] =
        await db.query(
          `
          SELECT
            COUNT(*) AS totalCount,

            SUM(
              t.status = 'NEW'
            ) AS newCount,

            SUM(
              t.status = 'IN_PROGRESS'
            ) AS inProgressCount,

            SUM(
              t.status = 'ON_HOLD'
            ) AS onHoldCount,

            SUM(
              t.status = 'DELAYED'
            ) AS delayedCount,

            SUM(
              t.status = 'COMPLETED'
            ) AS completedCount

          FROM Task t

          LEFT JOIN Employee emp
            ON emp.id =
               t.assignedEmployeeId

          ${taskWhere}
          `,
          taskParams
        );

      const taskCount =
        (taskCountRows as any[])[0];

      /* =========================================
         DELEGATION HISTORY
      ========================================= */

      const [recentTasks] =
        await db.query(
          `
          SELECT
            t.id,
            t.title,
            t.priority,
            t.status,
            t.responsibility,
            t.startDate,
            t.originalTargetDate,
            t.currentTargetDate,
            t.createdAt,
            t.updatedAt,

            d.name AS departmentName,

            creator.name AS createdByName,

            ea.name AS assignedEaName,

            emp.fullName AS assignedEmployeeName

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

          ${taskWhere}

          ORDER BY
            t.updatedAt DESC

          LIMIT 50
          `,
          taskParams
        );

      return res.json({
        success: true,

        taskCounts: {
          total:
            Number(
              taskCount?.totalCount || 0
            ),

          new:
            Number(
              taskCount?.newCount || 0
            ),

          inProgress:
            Number(
              taskCount?.inProgressCount || 0
            ),

          onHold:
            Number(
              taskCount?.onHoldCount || 0
            ),

          delayed:
            Number(
              taskCount?.delayedCount || 0
            ),

          completed:
            Number(
              taskCount?.completedCount || 0
            ),
        },

        recentTasks,
      });

    } catch (error) {

      console.error(
        "DASHBOARD ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load delegation dashboard",
        });
    }
  }
);

export default router;