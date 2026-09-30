import { Router } from "express";

import { db } from "../config/db.js";

import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

import {
  createNotification,
} from "../services/notificationService.js";

const router = Router();

router.use(requireAuth);

/* ============================================
   GET CURRENT USER NOTIFICATIONS

   Examples:
   /api/notifications
   /api/notifications?limit=20
   /api/notifications?unreadOnly=true
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

      const requestedLimit =
        Number(
          req.query.limit ||
          30
        );

      const limit =
        Number.isInteger(
          requestedLimit
        )
          ? Math.min(
              Math.max(
                requestedLimit,
                1
              ),
              100
            )
          : 30;

      const unreadOnly =
        String(
          req.query.unreadOnly ||
          ""
        ).toLowerCase() ===
        "true";

      let unreadCondition =
        "";

      if (unreadOnly) {
        unreadCondition =
          "AND n.isRead = 0";
      }

      const [rows] =
        await db.query(
          `
          SELECT

            n.id,

            n.userId,
            n.taskId,

            n.type,

            n.title,
            n.message,

            n.isRead,
            n.readAt,

            n.createdAt,
            n.updatedAt,

            t.title
              AS taskTitle,

            t.status
              AS taskStatus

          FROM Notification n

          LEFT JOIN Task t
            ON t.id =
               n.taskId

          WHERE
            n.userId = ?

            ${unreadCondition}

          ORDER BY
            n.createdAt DESC,
            n.id DESC

          LIMIT ${limit}
          `,
          [
            user.userId,
          ]
        );

      return res.json({
        success: true,

        data: rows,
      });

    } catch (error) {

      console.error(
        "GET NOTIFICATIONS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load notifications",
        });
    }
  }
);

/* ============================================
   UNREAD COUNT
============================================ */

router.get(
  "/unread-count",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      const [rows] =
        await db.query(
          `
          SELECT
            COUNT(*) AS unreadCount

          FROM Notification

          WHERE
            userId = ?

            AND isRead = 0
          `,
          [
            user.userId,
          ]
        );

      const row =
        (rows as any[])[0];

      return res.json({
        success: true,

        unreadCount:
          Number(
            row?.unreadCount ||
            0
          ),
      });

    } catch (error) {

      console.error(
        "UNREAD COUNT ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load unread notification count",
        });
    }
  }
);

/* ============================================
   CLEAR ALL UNREAD NOTIFICATIONS
   FOR ONE DELEGATION

   IMPORTANT:
   Only the logged-in user's notifications
   are changed.
============================================ */

router.patch(
  "/task/:taskId/read",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      const taskId =
        Number(
          req.params.taskId
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

      const [result]: any =
        await db.query(
          `
          UPDATE Notification

          SET
            isRead = 1,

            readAt =
              CASE
                WHEN readAt IS NULL
                THEN NOW()
                ELSE readAt
              END,

            updatedAt = NOW()

          WHERE
            userId = ?

            AND taskId = ?

            AND isRead = 0
          `,
          [
            user.userId,
            taskId,
          ]
        );

      return res.json({
        success: true,

        message:
          "Delegation notifications cleared",

        cleared:
          Number(
            result?.affectedRows ||
            0
          ),
      });

    } catch (error) {

      console.error(
        "CLEAR TASK NOTIFICATIONS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to clear delegation notifications",
        });
    }
  }
);

/* ============================================
   MARK ONE AS READ
============================================ */

router.patch(
  "/:id/read",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      const notificationId =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(
          notificationId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            message:
              "Invalid notification ID",
          });
      }

      const [rows] =
        await db.query(
          `
          SELECT
            id,
            userId,
            isRead

          FROM Notification

          WHERE
            id = ?

          LIMIT 1
          `,
          [
            notificationId,
          ]
        );

      const notification =
        (rows as any[])[0];

      if (!notification) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Notification not found",
          });
      }

      if (
        Number(
          notification.userId
        ) !==
        Number(
          user.userId
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You cannot access this notification",
          });
      }

      if (
        notification.isRead
      ) {
        return res.json({
          success: true,

          message:
            "Notification already read",
        });
      }

      await db.query(
        `
        UPDATE Notification

        SET
          isRead = 1,

          readAt = NOW(),

          updatedAt = NOW()

        WHERE
          id = ?
          AND userId = ?
        `,
        [
          notificationId,
          user.userId,
        ]
      );

      return res.json({
        success: true,

        message:
          "Notification marked as read",
      });

    } catch (error) {

      console.error(
        "MARK NOTIFICATION READ ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to update notification",
        });
    }
  }
);

/* ============================================
   CLEAR ALL CURRENT USER NOTIFICATIONS

   We keep the database history.
   "Clear" means mark all unread as read,
   so they disappear from the bell popup.
============================================ */

router.patch(
  "/read-all",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      const [result]: any =
        await db.query(
          `
          UPDATE Notification

          SET
            isRead = 1,

            readAt =
              CASE
                WHEN readAt IS NULL
                THEN NOW()
                ELSE readAt
              END,

            updatedAt = NOW()

          WHERE
            userId = ?

            AND isRead = 0
          `,
          [
            user.userId,
          ]
        );

      return res.json({
        success: true,

        message:
          "Notifications cleared",

        cleared:
          Number(
            result?.affectedRows ||
            0
          ),
      });

    } catch (error) {

      console.error(
        "CLEAR ALL NOTIFICATIONS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to clear notifications",
        });
    }
  }
);

/* ============================================
   TEMPORARY SELF-TEST ENDPOINT
============================================ */

router.post(
  "/test",
  (_req, res, next) => {
    if (process.env.NODE_ENV !== "development") {
      return res.sendStatus(404);
    }
    next();
  },
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const user =
        req.user!;

      const notificationId =
        await createNotification({
          userId:
            user.userId,

          taskId:
            null,

          type:
            "SYSTEM",

          title:
            "Notification Test",

          message:
            "Your notification system is working correctly.",
        });

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Test notification created",

          notificationId,
        });

    } catch (error) {

      console.error(
        "TEST NOTIFICATION ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to create test notification",
        });
    }
  }
);

export default router;
