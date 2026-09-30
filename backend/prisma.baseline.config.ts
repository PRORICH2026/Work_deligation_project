import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Explicit target: never fall back to the existing local DATABASE_URL.
// This is the canonical migration history for fresh databases and future changes.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/baseline-migrations",
  },
  datasource: {
    url: env("MIGRATION_DATABASE_URL"),
    ...(process.env.MIGRATION_SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.MIGRATION_SHADOW_DATABASE_URL }
      : {}),
  },
});
