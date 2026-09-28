import express from "express";

import cors from "cors";

import dotenv from "dotenv";

import cookieParser from "cookie-parser";

import notificationsRouter from "./routes/notifications.js";

import {
  db,
} from "./lib/db.js";

import authRouter from "./routes/auth.js";

import taskRouter from "./routes/tasks.js";

import userRouter from "./routes/users.js";

import employeeRouter from "./routes/employees.js";

import dashboardRouter from "./routes/dashboard.js";

import departmentsRouter from "./routes/departments.js";

import {
  startDeadlineNotificationScheduler,
} from "./services/deadlineNotificationService.js";

dotenv.config();

const app =
  express();

const PORT =
  process.env.PORT ||
  5000;

/* ==========================================
   MIDDLEWARE
========================================== */

app.use(
  cors({
    origin:
      "http://localhost:5173",

    credentials:
      true,
  })
);

app.use(
  cookieParser()
);

app.use(
  express.json()
);

/* ==========================================
   API ROUTES
========================================== */

app.use(
  "/api/auth",
  authRouter
);

app.use(
  "/api/tasks",
  taskRouter
);

app.use(
  "/api/users",
  userRouter
);

app.use(
  "/api/employees",
  employeeRouter
);

app.use(
  "/api/dashboard",
  dashboardRouter
);

app.use(
  "/api/departments",
  departmentsRouter
);

app.use(
  "/api/notifications",
  notificationsRouter
);

/* ==========================================
   ROOT
========================================== */

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      success:
        true,

      message:
        "Prorich Delegation Management API is running",
    });
  }
);

/* ==========================================
   HEALTH
========================================== */

app.get(
  "/api/health",
  (
    req,
    res
  ) => {
    res.json({
      success:
        true,

      status:
        "OK",

      application:
        "Prorich Delegation Management",

      timestamp:
        new Date()
          .toISOString(),
    });
  }
);

/* ==========================================
   DATABASE HEALTH
========================================== */

app.get(
  "/api/db-health",
  async (
    req,
    res
  ) => {
    try {
      const [rows] =
        await db.query(
          `
          SELECT
            COUNT(*) AS departmentCount

          FROM Department
          `
        );

      const result =
        rows as
          Array<{
            departmentCount:
              number;
          }>;

      return res.json({
        success:
          true,

        database:
          "CONNECTED",

        departmentCount:
          result[0]
            ?.departmentCount ??
          0,
      });

    } catch (error) {

      console.error(
        "DATABASE ERROR:",
        error
      );

      return res
        .status(500)
        .json({
          success:
            false,

          database:
            "ERROR",
        });
    }
  }
);

/* ==========================================
   START SERVER
========================================== */

app.listen(
  PORT,
  () => {
    console.log(
      `Server running on http://localhost:${PORT}`
    );

    /*
      Start automatic deadline
      notification monitoring.
    */

    startDeadlineNotificationScheduler();
  }
);