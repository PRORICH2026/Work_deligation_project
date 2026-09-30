import { Router } from "express";
import { db } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const departmentId = req.query.departmentId;

    let sql = `
      SELECT
        e.id,
        e.employeeCode,
        e.fullName,
        e.officialEmail,
        e.departmentId,
        d.name AS departmentName
      FROM Employee e
      LEFT JOIN Department d
        ON d.id = e.departmentId
      WHERE e.isActive = true
    `;

    const params: any[] = [];

    if (departmentId) {
      sql += ` AND e.departmentId = ? `;
      params.push(Number(departmentId));
    }

    sql += ` ORDER BY e.fullName `;

    const [rows] = await db.query(sql, params);

    return res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("GET EMPLOYEES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load employees",
    });
  }
});

export default router;