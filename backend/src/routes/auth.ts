import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { db } from "../config/db.js";
import { createToken, verifyToken } from "../lib/auth.js";

const router = Router();

const cookieOptions = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? "none" as const : "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/login", async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email and password",
      });
    }

    const email = validation.data.email.trim().toLowerCase();
    const password = validation.data.password;

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        passwordHash,
        role,
        isActive
      FROM \`User\`
      WHERE email = ?
      LIMIT 1
      `,
      [email]
    );

    const users = rows as any[];

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const user = users[0];

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is inactive. Please contact administration.",
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie("delegation_token", token, {
      ...cookieOptions,
      maxAge: 8 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to login",
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.delegation_token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const payload = verifyToken(token);

    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        email,
        role,
        isActive
      FROM \`User\`
      WHERE id = ?
      LIMIT 1
      `,
      [payload.userId]
    );

    const users = rows as any[];

    if (users.length === 0 || !users[0].isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      user: users[0],
    });
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired login",
    });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("delegation_token", cookieOptions);

  return res.json({
    success: true,
    message: "Logged out successfully",
  });
});

export default router;
