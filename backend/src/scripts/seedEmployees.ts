import { db } from "../config/db.js";

async function seedEmployees() {
  try {
    const [departmentRows] = await db.query(`
      SELECT id
      FROM Department
      WHERE isActive = true
      ORDER BY id
      LIMIT 1
    `);

    const departments = departmentRows as any[];

    if (departments.length === 0) {
      throw new Error("No department found. Seed departments first.");
    }

    const departmentId = departments[0].id;

    const [userRows] = await db.query(`
      SELECT id, email
      FROM \`User\`
      WHERE email = 'employee@local.test'
      LIMIT 1
    `);

    const users = userRows as any[];

    if (users.length === 0) {
      throw new Error("Local Employee user not found.");
    }

    const userId = users[0].id;

    await db.query(
      `
      INSERT INTO Employee
      (
        employeeCode,
        fullName,
        officialEmail,
        isActive,
        departmentId,
        userId,
        createdAt,
        updatedAt
      )
      VALUES
      (
        'EMP-TEST-001',
        'Local Employee',
        'employee@local.test',
        true,
        ?,
        ?,
        NOW(3),
        NOW(3)
      )
      ON DUPLICATE KEY UPDATE
        fullName = VALUES(fullName),
        departmentId = VALUES(departmentId),
        userId = VALUES(userId),
        isActive = true,
        updatedAt = NOW(3)
      `,
      [departmentId, userId]
    );

    console.log("✅ Employee seeded successfully");

    const [rows] = await db.query(`
      SELECT
        id,
        employeeCode,
        fullName,
        officialEmail,
        departmentId,
        userId
      FROM Employee
    `);

    console.table(rows);
  } catch (error) {
    console.error("❌ Employee seed failed:", error);
  } finally {
    await db.end();
  }
}

seedEmployees();