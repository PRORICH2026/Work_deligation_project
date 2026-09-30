This repository preserves the applied local migration history and introduces a separate canonical baseline for fresh databases. The application schema and runtime database configuration are unchanged.

| Purpose | Prisma config | Migration directory | Target variable |
| --- | --- | --- | --- |
| Existing local database history and client generation | `prisma7.config.ts` | `prisma/migrations` | `DATABASE_URL` |
| Fresh production/development databases and all future migrations | `prisma.baseline.config.ts` | `prisma/baseline-migrations` | `MIGRATION_DATABASE_URL` |

The five original migration files are frozen, byte-for-byte. Both problematic migrations were already applied locally and their checksums match `_prisma_migrations`. Editing them would invalidate that history. Do not append future migrations to the legacy directory or maintain two parallel evolving histories.

The canonical `0_current_schema` baseline was generated with Prisma 7:

```text
prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma/baseline-migrations/0_current_schema/migration.sql --config prisma7.config.ts
```

It creates Department, User, Employee, Task, TaskStatusHistory, TaskDelay and Notification with the current indexes, enums and foreign keys. All table references use exact matching case. There are no @map or @@map overrides. The old Escalation create/drop sequence remains in legacy history only; Escalation is not part of the baseline or current schema. No historical migrations contain additional triggers, views or data transformations that must be carried into the baseline.

For a fresh database, set `MIGRATION_DATABASE_URL` securely to that explicitly selected database, then run from `backend`:

```text
npm run migrate:deploy
npm run migrate:status
```

`migrate:deploy` runs `prisma migrate deploy --config prisma.baseline.config.ts`. This config refuses to load without `MIGRATION_DATABASE_URL`; it never falls back to the existing local runtime URL. For a deployed application, the runtime `DATABASE_URL` and migration target must ultimately refer to the same production database. Do not put a connection URL on the command line, in version control or in logs.

Do not deploy the baseline over the existing `delegation_management` database without first adopting the baseline. No `migrate resolve`, history edits, reset, data changes or baseline registration have been performed there. The following adoption workflow was rehearsed successfully ONLY in the disposable database initialized with all five legacy migrations:

1. Back up the existing database and verify its schema equals the baseline state, using read-only schema diff. Preserve all old migration files and database history records.
2. With explicit authorization to update that existing database's migration metadata, target it securely via `MIGRATION_DATABASE_URL` and run `prisma migrate resolve --applied 0_current_schema --config prisma.baseline.config.ts` once. This registers the baseline without replaying CREATE TABLE statements. Do not manually edit `_prisma_migrations`.
3. Run `npm run migrate:status`, then apply future canonical migrations using `npm run migrate:deploy`. New production databases apply the baseline normally and then receive those same future files.

This is a future, separately authorized operation for the real database, not an operation completed by this review. Never replay baseline DDL over populated tables or delete migration records. When adoption occurs after future schema changes, compare against the original baseline schema state, not a newer schema that already includes unapplied changes.

For future migration authoring, use a separate development database initialized through the canonical baseline. Use `npm run migrate:dev -- --name <change>` there (explicitly selects `prisma.baseline.config.ts`), supplying a separate `MIGRATION_SHADOW_DATABASE_URL` when required. Never use the protected local or production database as a shadow database. Generated files go under `prisma/baseline-migrations`; never regenerate/edit an already-applied baseline. All npm migration commands select this one canonical history. The legacy directory is frozen, not a second development stream. Existing databases retain their old records after adoption and receive migrations with deploy; use the clean canonical development database to author changes so legacy-history checks in migrate dev cannot prompt a reset. Client generation still reads the single shared `prisma/schema.prisma`.

Local replay verification:

```text
npm run migrate:verify
```

This command is intentionally destructive ONLY to `delegation_management_migration_test` on the local server. It validates the source database name and loopback host and checks applied checksums read-only. It replays all original migrations, inserts one disposable Department fixture, registers the baseline through Prisma resolve, and applies an isolated future migration adding a nullable probe column. It checks the fixture and old migration records survive. It then initializes the same disposable database from empty using the identical baseline and future migration files and verifies both schemas match. Finally, it recreates that same database and applies ONLY the actual canonical baseline, leaving no probe column, fixture row or temporary migration record. Temporary future SQL/config/schema files live only in ignored `node_modules/.cache`.

It compares columns, indexes, foreign keys and key columns, runs Prisma schema diff and checks that the real database's schema, row counts and migration records remain unchanged. It never starts the application. The final disposable database is retained for inspection.

The local database account needs CREATE/DROP and schema DDL privileges on the disposable database. If it lacks those permissions, an administrator can create the disposable database and grant privileges to the existing account on that database only. Example template (replace the account placeholders privately; do not change the real application's database):

```sql
CREATE DATABASE IF NOT EXISTS `delegation_management_migration_test`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON `delegation_management_migration_test`.*
  TO '<existing user>'@'<existing host>';
```

Verification now passes after the disposable database permissions were granted. Fresh baseline replay, status and Prisma schema diff all pass. Existing-history adoption and the same future migration on fresh/existing-history databases pass, with preserved fixture data and old history. Final physical tables are `_prisma_migrations`, `department`, `employee`, `notification`, `task`, `taskdelay`, `taskstatushistory`, `user`; Escalation is absent. Local MySQL stores these lowercase because `lower_case_table_names=1`. Exact SQL identifier case checks pass, but Linux case-sensitive replay was not exercised: Docker is unavailable and WSL is not installed.

The approach uses Prisma's documented [baseline generation](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining) and [migration squashing](https://docs.prisma.io/docs/orm/v7/prisma-migrate/workflows/squashing-migrations) concepts, retaining the old directory solely to avoid changing the protected database's existing history.
