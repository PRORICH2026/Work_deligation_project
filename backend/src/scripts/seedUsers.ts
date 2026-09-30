import bcrypt from "bcryptjs";
import { db } from "../config/db.js";

const users = [
  {
    name: "Local Admin",
    email: "admin@local.test",
    password: "Admin12345",
    role: "ADMIN",
  },
  {
    name: "Local MD",
    email: "md@local.test",
    password: "Md123456",
    role: "MD",
  },
  {
    name: "Local EA",
    email: "ea@local.test",
    password: "Ea123456",
    role: "EA",
  },
  {
  name: "Local Employee",
  email: "employee@local.test",
  password: "Employee12345",
  role: "EMPLOYEE",
},

];

async function seedUsers() {
  try {
    for (const user of users) {
      const passwordHash = await bcrypt.hash(user.password, 12);

      await db.query(
        `
        INSERT INTO \`User\`
        (
          name,
          email,
          passwordHash,
          role,
          isActive,
          createdAt,
          updatedAt
        )
        VALUES (?, ?, ?, ?, true, NOW(3), NOW(3))

        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          passwordHash = VALUES(passwordHash),
          role = VALUES(role),
          isActive = true,
          updatedAt = NOW(3)
        `,
        [
          user.name,
          user.email,
          passwordHash,
          user.role,
        ]
      );
    }

    console.log("✅ Local users created successfully");

    const [rows] = await db.query(`
      SELECT id, name, email, role, isActive
      FROM \`User\`
      ORDER BY id
    `);

    console.table(rows);
  } catch (error) {
    console.error("❌ User seed failed:", error);
  } finally {
    await db.end();
  }
}

seedUsers();