import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "../config/db.js";
import type { AuthRequest } from "../middleware/auth.js";

const router = Router();
const roles = ["ADMIN", "HR", "EA"];

// Mounted after requireAuth. Check current account state, not only JWT claims.
router.use(async (req: AuthRequest, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "Employee Management access is forbidden" });
  }
  try {
    const [users] = await db.query<RowDataPacket[]>(
      "SELECT role, isActive FROM `User` WHERE id = ?", [req.user.userId]
    );
    if (!users[0]?.isActive || !roles.includes(users[0].role)) {
      return res.status(403).json({ success: false, message: "Employee Management access is forbidden" });
    }
    next();
  } catch {
    return res.status(500).json({ success: false, message: "Unable to verify employee management access" });
  }
});

const passwordFields = z.object({
  password: z.string().min(6, "Password must contain at least 6 characters")
    .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 bytes"),
  confirmPassword: z.string().min(1, "Confirm password is required"),
});
const createSchema = passwordFields.extend({
  employeeCode: z.string().trim().min(1).max(191),
  fullName: z.string().trim().min(1).max(191),
  departmentId: z.number().int().positive(),
  email: z.string().trim().toLowerCase().email().max(191),
  isActive: z.boolean(),
}).refine(value => value.password === value.confirmPassword, "Passwords must match");
const resetSchema = passwordFields.refine(value => value.password === value.confirmPassword, "Passwords must match");

function failure(res: Response, error: unknown) {
  if ((error as { code?: string })?.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ success: false, message: "Employee code or login ID already exists" });
  }
  // Driver errors can include SQL values; do not log request passwords/hashes.
  return res.status(500).json({ success: false, message: "Unable to save employee changes" });
}

router.get("/", async (req, res) => {
  const filters = z.object({
    search: z.string().max(191).optional(),
    departmentId: z.coerce.number().int().positive().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  }).safeParse(req.query);
  if (!filters.success) return res.status(400).json({ success: false, message: "Invalid employee filters" });
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filters.data.search?.trim()) {
      const search = `%${filters.data.search.trim().replace(/[=%_]/g, "=$&")}%`;
      conditions.push("(e.employeeCode LIKE ? ESCAPE '=' OR e.fullName LIKE ? ESCAPE '=' OR u.email LIKE ? ESCAPE '=')");
      params.push(search, search, search);
    }
    if (filters.data.departmentId) {
      conditions.push("e.departmentId = ?");
      params.push(filters.data.departmentId);
    }
    const active = "(e.isActive = 1 AND COALESCE(u.isActive, e.isActive) = 1)";
    if (filters.data.status) conditions.push(filters.data.status === "ACTIVE" ? active : `NOT ${active}`);
    const [rows] = await db.query(
      `SELECT e.id, e.employeeCode, e.fullName, e.departmentId, d.name AS departmentName,
        e.userId, u.email AS loginEmail, ${active} AS isActive
       FROM Employee e LEFT JOIN Department d ON d.id = e.departmentId
       LEFT JOIN \`User\` u ON u.id = e.userId
       ${conditions.length ? "WHERE " + conditions.join(" AND ") : ""}
       ORDER BY e.fullName, e.id`, params
    );
    return res.json({ success: true, data: rows });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load employees" });
  }
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "Invalid employee details" });
  const data = parsed.data;
  let connection;
  try {
    const passwordHash = await bcrypt.hash(data.password, 12);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [departments] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM Department WHERE id = ? AND isActive = 1 FOR UPDATE", [data.departmentId]
    );
    if (!departments.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Select an active department" });
    }
    const [user] = await connection.query<ResultSetHeader>(
      `INSERT INTO \`User\` (name, email, passwordHash, role, isActive, departmentId, createdAt, updatedAt)
       VALUES (?, ?, ?, 'EMPLOYEE', ?, ?, NOW(3), NOW(3))`,
      [data.fullName, data.email, passwordHash, data.isActive, data.departmentId]
    );
    const [employee] = await connection.query<ResultSetHeader>(
      `INSERT INTO Employee (employeeCode, fullName, officialEmail, userId, departmentId, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [data.employeeCode, data.fullName, data.email, user.insertId, data.departmentId, data.isActive]
    );
    await connection.commit();
    return res.status(201).json({ success: true, message: "Employee created successfully", employeeId: employee.insertId });
  } catch (error) {
    if (connection) await connection.rollback();
    return failure(res, error);
  } finally { connection?.release(); }
});

router.patch("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid employee or status" });
  }
  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT e.id, e.userId, u.role FROM Employee e LEFT JOIN `User` u ON u.id = e.userId WHERE e.id = ? FOR UPDATE", [id]
    );
    const employee = rows[0];
    if (!employee || !employee.userId || employee.role !== "EMPLOYEE") {
      await connection.rollback();
      return res.status(employee ? 409 : 404).json({ success: false, message: employee ? "Employee requires a linked EMPLOYEE login" : "Employee not found" });
    }
    await connection.query("UPDATE Employee SET isActive = ?, updatedAt = NOW(3) WHERE id = ?", [parsed.data.isActive, id]);
    await connection.query("UPDATE `User` SET isActive = ?, updatedAt = NOW(3) WHERE id = ?", [parsed.data.isActive, employee.userId]);
    await connection.commit();
    return res.json({ success: true, message: parsed.data.isActive ? "Employee activated successfully" : "Employee deactivated successfully" });
  } catch (error) {
    if (connection) await connection.rollback();
    return failure(res, error);
  } finally { connection?.release(); }
});

router.patch("/:id/password", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = resetSchema.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) {
    return res.status(400).json({ success: false, message: parsed.success ? "Invalid employee" : parsed.error.issues[0]?.message || "Invalid password" });
  }
  let connection;
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT e.userId, u.role FROM Employee e LEFT JOIN `User` u ON u.id = e.userId WHERE e.id = ? FOR UPDATE", [id]
    );
    const employee = rows[0];
    if (!employee || !employee.userId || employee.role !== "EMPLOYEE") {
      await connection.rollback();
      return res.status(employee ? 409 : 404).json({ success: false, message: employee ? "Employee requires a linked EMPLOYEE login" : "Employee not found" });
    }
    await connection.query("UPDATE `User` SET passwordHash = ?, updatedAt = NOW(3) WHERE id = ?", [passwordHash, employee.userId]);
    await connection.commit();
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    if (connection) await connection.rollback();
    return failure(res, error);
  } finally { connection?.release(); }
});

export default router;
