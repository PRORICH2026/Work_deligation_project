import { db } from "../config/db.js";

const departments = [
  "IT Department",
  "Sales Expert Department",
  "Sales Coordinator Department",
  "CRM Department",
  "Purchase Department",
  "Accounts Department",
  "Admin & HR Department",
  "Process Coordinator Department",
  "Export Department",
];

async function seedDepartments() {
  try {
    for (const department of departments) {
      await db.query(
        `
        INSERT INTO Department
          (name, isActive, createdAt, updatedAt)
        VALUES
          (?, true, NOW(3), NOW(3))
        ON DUPLICATE KEY UPDATE
          name = VALUES(name)
        `,
        [department]
      );
    }

    console.log("✅ Departments seeded successfully");

    const [rows] = await db.query(
      "SELECT id, name, isActive FROM Department ORDER BY name"
    );

    console.table(rows);
  } catch (error) {
    console.error("❌ Seed failed:", error);
  } finally {
    await db.end();
  }
}

seedDepartments();