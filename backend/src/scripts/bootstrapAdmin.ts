import bcrypt from "bcryptjs";
import { db } from "../config/db.js";

async function bootstrapAdmin() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required."
    );
  }

  if (password.length < 10) {
    throw new Error("Bootstrap admin password must be at least 10 characters.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

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
    VALUES (?, ?, ?, 'ADMIN', true, NOW(3), NOW(3))

    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      passwordHash = VALUES(passwordHash),
      role = 'ADMIN',
      isActive = true,
      updatedAt = NOW(3)
    `,
    [name, email, passwordHash]
  );

  console.log("Production ADMIN account created/updated successfully.");
  console.log(`Admin email: ${email}`);

  await db.end();
}

bootstrapAdmin().catch(async (error) => {
  console.error("Failed to create production ADMIN:", error);
  await db.end();
  process.exit(1);
});