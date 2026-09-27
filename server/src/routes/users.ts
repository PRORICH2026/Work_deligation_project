import { Router } from "express";

import { db } from "../lib/db.js";

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

/* ============================================
   GET USERS

   OLD DELEGATION RULE:

   ?role=EA
   is available to every logged-in user
   because employees can create delegations.

   Full user list remains management-only.
============================================ */

router.get(
  "/",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const currentUser =
        req.user!;

      const requestedRole =
        String(
          req.query.role ||
          ""
        )
          .trim()
          .toUpperCase();

      /* ======================================
         EA LOOKUP

         ALL AUTHENTICATED USERS
         CAN USE THIS.
      ====================================== */

      if (
        requestedRole ===
        "EA"
      ) {
        const [rows] =
          await db.query(
            `
            SELECT

              id,
              name,
              email,
              role,
              isActive,
              departmentId

            FROM \`User\`

            WHERE
              role = 'EA'

              AND isActive = 1

            ORDER BY
              name ASC
            `
          );

        return res.json({
          success: true,
          data: rows,
        });
      }

      /* ======================================
         FULL USER DIRECTORY

         MANAGEMENT ONLY
      ====================================== */

      if (
        !managementRoles.includes(
          currentUser.role
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,

            message:
              "You do not have permission to view users",
          });
      }

      const [rows] =
        await db.query(
          `
          SELECT

            u.id,
            u.name,
            u.email,
            u.role,
            u.isActive,
            u.departmentId,

            d.name
              AS departmentName,

            u.createdAt,
            u.updatedAt

          FROM \`User\` u

          LEFT JOIN Department d
            ON d.id =
               u.departmentId

          ORDER BY
            u.isActive DESC,
            u.name ASC
          `
        );

      return res.json({
        success: true,
        data: rows,
      });

    } catch (error) {

      console.error(
        "GET USERS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,

          message:
            "Unable to load users",
        });
    }
  }
);

export default router;