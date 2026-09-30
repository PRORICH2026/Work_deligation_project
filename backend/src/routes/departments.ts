import { Router } from "express";

import { db } from "../config/db.js";

import {
  requireAuth,
  type AuthRequest,
} from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

/* ============================================
   PERMISSIONS
============================================ */

const departmentManagementRoles = [
  "ADMIN",
  "HR",
];

function canManageDepartments(
  role: string
) {
  return departmentManagementRoles.includes(
    role
  );
}

/* ============================================
   GET DEPARTMENTS

   Available to every authenticated user
   because New Delegation also needs this list.
============================================ */

router.get(
  "/",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const includeInactive =
        String(
          req.query.includeInactive ||
            ""
        ).toLowerCase() ===
        "true";

      /*
        Only ADMIN / HR can request
        inactive departments.
      */

      const canSeeInactive =
        canManageDepartments(
          req.user!.role
        );

      let whereClause =
        "WHERE d.isActive = 1";

      if (
        includeInactive &&
        canSeeInactive
      ) {
        whereClause = "";
      }

      const [rows] =
        await db.query(
          `
          SELECT

            d.id,
            d.name,
            d.isActive,

            d.createdAt,
            d.updatedAt,

            COUNT(
              DISTINCT e.id
            ) AS employeeCount,

            COUNT(
              DISTINCT u.id
            ) AS userCount

          FROM Department d

          LEFT JOIN Employee e
            ON e.departmentId =
               d.id

          LEFT JOIN \`User\` u
            ON u.departmentId =
               d.id

          ${whereClause}

          GROUP BY
            d.id,
            d.name,
            d.isActive,
            d.createdAt,
            d.updatedAt

          ORDER BY
            d.isActive DESC,
            d.name ASC
          `
        );

      return res.json({
        success: true,
        data: rows,
      });

    } catch (error) {

      console.error(
        "GET DEPARTMENTS ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Unable to load departments",
        });
    }
  }
);

/* ============================================
   CREATE DEPARTMENT

   ADMIN / HR
============================================ */

router.post(
  "/",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const currentUser =
        req.user!;

      if (
        !canManageDepartments(
          currentUser.role
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "You do not have permission to create departments",
          });
      }

      const {
        name,
      } = req.body;

      const departmentName =
        String(
          name || ""
        ).trim();

      if (!departmentName) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Department name is required",
          });
      }

      /* DUPLICATE CHECK */

      const [existingRows] =
        await db.query(
          `
          SELECT
            id,
            name,
            isActive

          FROM Department

          WHERE
            LOWER(name) =
            LOWER(?)

          LIMIT 1
          `,
          [
            departmentName,
          ]
        );

      const existing =
        (existingRows as any[])[0];

      if (existing) {
        return res
          .status(409)
          .json({
            success: false,

            message:
              existing.isActive
                ? "Department already exists"
                : "This department already exists but is inactive. Please reactivate it instead.",
          });
      }

      /* CREATE */

      const [result]: any =
        await db.query(
          `
          INSERT INTO Department
          (
            name,
            isActive,
            createdAt,
            updatedAt
          )

          VALUES
          (
            ?,
            1,
            NOW(),
            NOW()
          )
          `,
          [
            departmentName,
          ]
        );

      return res
        .status(201)
        .json({
          success: true,

          message:
            "Department created successfully",

          departmentId:
            result.insertId,
        });

    } catch (error) {

      console.error(
        "CREATE DEPARTMENT ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Unable to create department",
        });
    }
  }
);

/* ============================================
   UPDATE DEPARTMENT

   ADMIN / HR
============================================ */

router.patch(
  "/:id",
  async (
    req: AuthRequest,
    res
  ) => {
    try {
      const currentUser =
        req.user!;

      if (
        !canManageDepartments(
          currentUser.role
        )
      ) {
        return res
          .status(403)
          .json({
            success: false,
            message:
              "You do not have permission to update departments",
          });
      }

      const departmentId =
        Number(
          req.params.id
        );

      if (
        !Number.isInteger(
          departmentId
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Invalid department ID",
          });
      }

      const {
        name,
        isActive,
      } = req.body;

      /* CURRENT DEPARTMENT */

      const [currentRows] =
        await db.query(
          `
          SELECT
            id,
            name,
            isActive

          FROM Department

          WHERE
            id = ?

          LIMIT 1
          `,
          [
            departmentId,
          ]
        );

      const department =
        (currentRows as any[])[0];

      if (!department) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Department not found",
          });
      }

      const finalName =
        name !== undefined
          ? String(
              name
            ).trim()
          : department.name;

      if (!finalName) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Department name cannot be blank",
          });
      }

      /* DUPLICATE NAME */

      const [duplicateRows] =
        await db.query(
          `
          SELECT id

          FROM Department

          WHERE
            LOWER(name) =
            LOWER(?)

            AND id <> ?

          LIMIT 1
          `,
          [
            finalName,
            departmentId,
          ]
        );

      if (
        (duplicateRows as any[])
          .length > 0
      ) {
        return res
          .status(409)
          .json({
            success: false,
            message:
              "Another department already uses this name",
          });
      }

      const finalIsActive =
        isActive === undefined
          ? department.isActive
          : isActive
            ? 1
            : 0;

      /*
        IMPORTANT:

        We do not delete a department.

        Deactivation keeps old delegation
        history linked correctly.
      */

      await db.query(
        `
        UPDATE Department

        SET
          name = ?,
          isActive = ?,
          updatedAt = NOW()

        WHERE
          id = ?
        `,
        [
          finalName,
          finalIsActive,
          departmentId,
        ]
      );

      return res.json({
        success: true,
        message:
          finalIsActive
            ? "Department updated successfully"
            : "Department deactivated successfully",
      });

    } catch (error) {

      console.error(
        "UPDATE DEPARTMENT ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success: false,
          message:
            "Unable to update department",
        });
    }
  }
);

export default router;