import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";

dotenv.config({ quiet: true });

// Deliberately public credentials for these local-only test accounts.
const password = "Test@2026!";
const accounts = [
  { email: "admin.test@prorich.local", name: "Test Admin", role: "ADMIN", code: null },
  { email: "hr.test@prorich.local", name: "Test HR", role: "HR", code: null },
  { email: "ea.test@prorich.local", name: "Test EA", role: "EA", code: null },
  { email: "md.test@prorich.local", name: "Test MD", role: "MD", code: null },
  { email: "employee.test@prorich.local", name: "Test Employee", role: "EMPLOYEE", code: "TEST-EMP-GENERAL" },
  { email: "employee1.test@prorich.local", name: "Test Employee One", role: "EMPLOYEE", code: "TEST-EMP-001" },
  { email: "employee2.test@prorich.local", name: "Test Employee Two", role: "EMPLOYEE", code: "TEST-EMP-002" },
];

function assertLocalTarget() {
  if (process.env.NODE_ENV?.toLowerCase() === "production") {
    throw new Error("Test user seed cannot run in production.");
  }
  if (Object.keys(process.env).some(key => key.startsWith("RAILWAY_") && process.env[key])) {
    throw new Error("Test user seed cannot run in a Railway environment.");
  }
  const url = new URL(process.env.DATABASE_URL || "");
  if (url.protocol !== "mysql:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      decodeURIComponent(url.pathname.slice(1)) !== "delegation_management" ||
      url.search || url.hash) {
    throw new Error("Test seed requires the local delegation_management database without connection overrides.");
  }
}

async function main() {
  // Validate before importing the shared pool or opening any connection.
  assertLocalTarget();
  const { db } = await import("../config/db.js");
  try {
    const connection = await db.getConnection();
    try {
      const [target] = await connection.query<RowDataPacket[]>("SELECT DATABASE() AS databaseName");
      if (target[0]?.databaseName !== "delegation_management") throw new Error("Unexpected database target.");
      await connection.beginTransaction();
      const [departments] = await connection.query<RowDataPacket[]>(
        "SELECT id, name FROM Department WHERE isActive = 1 ORDER BY id"
      );
      const first = departments.find(row => /sales/i.test(row.name)) || departments[0];
      if (!first) throw new Error("No existing active department. No accounts were changed.");
      const second = departments.find(row => /logistics/i.test(row.name) && row.id !== first.id)
        || departments.find(row => row.id !== first.id) || first;
      const general = departments[0]!;
      const summary = [];

      for (const account of accounts) {
        const department = account.code === "TEST-EMP-001" ? first
          : account.code === "TEST-EMP-002" ? second : general;
        const departmentId = account.code ? department.id : null;
        const [existingUsers] = await connection.query<RowDataPacket[]>(
          "SELECT id FROM `User` WHERE email = ? FOR UPDATE", [account.email]
        );
        const passwordHash = await bcrypt.hash(password, 12);
        await connection.query(
          `INSERT INTO \`User\` (name, email, passwordHash, role, isActive, departmentId, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 1, ?, NOW(3), NOW(3))
           ON DUPLICATE KEY UPDATE name = VALUES(name), passwordHash = VALUES(passwordHash),
             role = VALUES(role), isActive = 1, departmentId = VALUES(departmentId), updatedAt = NOW(3)`,
          [account.name, account.email, passwordHash, account.role, departmentId]
        );
        const [users] = await connection.query<RowDataPacket[]>(
          "SELECT id, role, isActive, passwordHash FROM `User` WHERE email = ?", [account.email]
        );
        const user = users[0]!;
        if (user.role !== account.role || !user.isActive || !await bcrypt.compare(password, user.passwordHash)) {
          throw new Error("User verification failed. Changes will be rolled back.");
        }
        if (account.code) {
          const [employees] = await connection.query<RowDataPacket[]>(
            "SELECT id, employeeCode, officialEmail, userId FROM Employee WHERE employeeCode = ? OR officialEmail = ? OR userId = ? FOR UPDATE",
            [account.code, account.email, user.id]
          );
          if (employees.length > 1) throw new Error("Conflicting test employee identities; refusing to merge records.");
          const employee = employees[0];
          if (employee && ((employee.userId && employee.userId !== user.id) ||
              (employee.officialEmail && employee.officialEmail.toLowerCase() !== account.email) ||
              (employee.employeeCode && employee.employeeCode !== account.code))) {
            throw new Error("Test employee identifier belongs to another record; refusing to overwrite it.");
          }
          if (employee) {
            await connection.query(
              "UPDATE Employee SET employeeCode = ?, fullName = ?, officialEmail = ?, userId = ?, departmentId = ?, isActive = 1, updatedAt = NOW(3) WHERE id = ?",
              [account.code, account.name, account.email, user.id, department.id, employee.id]
            );
          } else {
            await connection.query(
              "INSERT INTO Employee (employeeCode, fullName, officialEmail, userId, departmentId, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, NOW(3), NOW(3))",
              [account.code, account.name, account.email, user.id, department.id]
            );
          }
          const [linked] = await connection.query<RowDataPacket[]>(
            "SELECT id FROM Employee WHERE employeeCode = ? AND officialEmail = ? AND userId = ? AND departmentId = ? AND isActive = 1",
            [account.code, account.email, user.id, department.id]
          );
          if (linked.length !== 1) throw new Error("Employee linkage verification failed.");
        }
        summary.push({ email: account.email, role: account.role, action: existingUsers.length ? "updated" : "created",
          active: true, employeeCode: account.code, department: account.code ? department.name : "None required",
          linkage: account.code ? "PASS" : "Not required", passwordHashVerified: true });
      }
      await connection.commit();
      console.table(summary);
      console.log("Local test accounts verified. Password: Test@2026!");
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } finally {
    await db.end();
  }
}

main().catch(error => {
  // Never log raw driver errors, connection strings, hashes or SQL parameters.
  console.error("Local test seed failed:", error instanceof Error && !("code" in error) && !(error instanceof TypeError)
    ? error.message : "Database/configuration error; check local settings and permissions.");
  process.exitCode = 1;
});
