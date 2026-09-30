// Destructive operations are limited to this one disposable database name.
// The application database is inspected using a read-only connection only.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env'), quiet: true });
const protectedDatabase = 'delegation_management';
const disposableDatabase = 'delegation_management_migration_test';
const baselineConfig = 'prisma.baseline.config.ts';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function migrationFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    .map(name => ({ name, file: path.join(directory, name, 'migration.sql') }));
}

function inspectSql(directory) {
  const created = new Set();
  const mismatches = [];
  const operations = [];
  for (const { name, file } of migrationFiles(directory)) {
    const sql = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    for (const match of sql.matchAll(/\b(CREATE TABLE|ALTER TABLE|DROP TABLE|REFERENCES)\s+`([^`]+)`/g)) {
      const [, operation, table] = match;
      operations.push({ migration: name, operation, table });
      if (operation === 'CREATE TABLE') created.add(table);
      else if (!created.has(table)) {
        const canonical = [...created].find(candidate => candidate.toLowerCase() === table.toLowerCase());
        mismatches.push({ migration: name, operation, table, canonical: canonical || null });
      }
      if (operation === 'DROP TABLE') {
        const canonical = [...created].find(candidate => candidate.toLowerCase() === table.toLowerCase());
        created.delete(canonical);
      }
    }
  }
  return { operations, mismatches, finalTables: [...created].sort() };
}

function cli(args, targetUrl) {
  // Even the legacy config receives ONLY the disposable URL. Never inherit
  // the protected runtime or shadow URL into a migration subprocess.
  const childEnv = { ...process.env, DATABASE_URL: targetUrl, MIGRATION_DATABASE_URL: targetUrl, DOTENV_CONFIG_QUIET: 'true' };
  delete childEnv.SHADOW_DATABASE_URL;
  delete childEnv.MIGRATION_SHADOW_DATABASE_URL;
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), ...args], {
    cwd: root, env: childEnv, encoding: 'utf8', timeout: 120000,
  });
  let output = (result.stdout || '') + (result.stderr || '');
  // Never print a datasource URL or password, including in CLI errors.
  for (const urlText of [process.env.DATABASE_URL, targetUrl]) {
    if (!urlText) continue;
    output = output.replaceAll(urlText, '[REDACTED_DATABASE_URL]');
    const password = new URL(urlText).password;
    for (const secret of [password, decodeURIComponent(password)]) {
      if (secret) output = output.replaceAll(secret, '[REDACTED]');
    }
  }
  output = output.replace(/mysql:\/\/[^\s"']+/g, '[REDACTED_DATABASE_URL]');
  console.log(output.trim());
  if (result.error || result.status !== 0) throw new Error(`Prisma ${args.slice(0, 2).join(' ')} failed (exit ${result.status})`);
}

async function schemaSnapshot(connection, database) {
  const [columns] = await connection.query(`SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION,
    COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA, CHARACTER_SET_NAME, COLLATION_NAME
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME <> '_prisma_migrations'
    ORDER BY TABLE_NAME, ORDINAL_POSITION`, [database]);
  const [indexes] = await connection.query(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX,
    COLUMN_NAME, SUB_PART, INDEX_TYPE FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME <> '_prisma_migrations'
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, [database]);
  const [foreignKeys] = await connection.query(`SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME,
    UPDATE_RULE, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = ? ORDER BY TABLE_NAME, CONSTRAINT_NAME`, [database]);
  const [keyColumns] = await connection.query(`SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
    ORDINAL_POSITION, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME <> '_prisma_migrations'
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`, [database]);
  return { columns, indexes, foreignKeys, keyColumns };
}

async function protectedSnapshot(connection) {
  const [tables] = await connection.query(`SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [protectedDatabase]);
  const counts = {};
  for (const { TABLE_NAME: name } of tables) {
    assert.match(name, /^[a-zA-Z_][a-zA-Z0-9_]*$/);
    const [rows] = await connection.query(`SELECT COUNT(*) AS rowCount FROM \`${name}\``);
    counts[name] = rows[0].rowCount;
  }
  const [history] = await connection.query('SELECT * FROM _prisma_migrations ORDER BY migration_name, id');
  return hash(JSON.stringify({ counts, history, schema: await schemaSnapshot(connection, protectedDatabase) }));
}

async function main() {
  const source = new URL(process.env.DATABASE_URL);
  assert.equal(source.protocol, 'mysql:');
  assert.equal(decodeURIComponent(source.pathname.slice(1)), protectedDatabase, 'Expected the protected local database');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(source.hostname), 'Disposable verification is local-only');
  assert.notEqual(protectedDatabase, disposableDatabase);
  const target = new URL(source);
  target.pathname = '/' + disposableDatabase;
  assert.equal(decodeURIComponent(target.pathname.slice(1)), disposableDatabase);
  const adminUrl = new URL(source);
  adminUrl.pathname = '/';

  const legacyDirectory = path.join(root, 'prisma/migrations');
  const originalFiles = migrationFiles(legacyDirectory).map(({ name, file }) => ({ name, checksum: hash(fs.readFileSync(file)) }));
  const legacy = inspectSql(legacyDirectory);
  const baseline = inspectSql(path.join(root, 'prisma/baseline-migrations'));
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  assert.doesNotMatch(schema, /@@?map\s*\(/, 'Review table mapping before using this verifier');
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(match => match[1]).sort();
  assert.deepEqual(baseline.mismatches, [], 'Canonical history has inconsistent table/reference casing');
  assert.deepEqual(baseline.finalTables, models);
  console.log('Historical casing inventory:', JSON.stringify(legacy.mismatches));
  console.log('Canonical SQL table/reference casing: PASS');

  let readonly, admin, testConnection, before;
  try {
    readonly = await mysql.createConnection(source.toString());
    await readonly.query('SET SESSION TRANSACTION READ ONLY');
    before = await protectedSnapshot(readonly);
    const [settings] = await readonly.query('SELECT @@lower_case_table_names AS lowerCaseTableNames, VERSION() AS version');
    const [applied] = await readonly.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name');
    for (const file of originalFiles) {
      const row = applied.find(item => item.migration_name === file.name && item.finished_at && !item.rolled_back_at);
      assert.ok(row, `Missing applied migration ${file.name}`);
      assert.equal(row.checksum, file.checksum, `Checksum mismatch: ${file.name}`);
    }
    console.log('Local applied history and all five checksums: PASS');
    console.log('Local MySQL settings:', JSON.stringify(settings[0]));

    admin = await mysql.createConnection(adminUrl.toString());
    async function recreateDisposable() {
      if (testConnection) { await testConnection.end(); testConnection = undefined; }
      // Literal, allowlisted names only. Never derive DDL identifiers from env.
      await admin.query('DROP DATABASE IF EXISTS `delegation_management_migration_test`');
      await admin.query('CREATE DATABASE `delegation_management_migration_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    }

    // On Windows this also establishes that the baseline preserves every
    // column, index and foreign key from the complete historical sequence.
    await recreateDisposable();
    console.log('Replaying original history in disposable database only');
    cli(['migrate', 'deploy', '--config', 'prisma7.config.ts'], target.toString());
    testConnection = await mysql.createConnection(target.toString());
    const legacySchema = await schemaSnapshot(testConnection, disposableDatabase);

    // Rehearse baseline adoption without touching the protected database.
    // A fixture row proves that resolve/deploy retain existing application data.
    await testConnection.query("INSERT INTO Department (name, updatedAt) VALUES ('Migration verification fixture', NOW())");
    const [oldHistory] = await testConnection.query('SELECT * FROM _prisma_migrations ORDER BY migration_name');
    cli(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code', '--config', baselineConfig], target.toString());
    cli(['migrate', 'resolve', '--applied', '0_current_schema', '--config', baselineConfig], target.toString());
    cli(['migrate', 'status', '--config', baselineConfig], target.toString());
    assert.deepEqual(await schemaSnapshot(testConnection, disposableDatabase), legacySchema);
    const [retainedHistory] = await testConnection.query("SELECT * FROM _prisma_migrations WHERE migration_name <> '0_current_schema' ORDER BY migration_name");
    assert.deepEqual(retainedHistory, oldHistory, 'Baseline adoption changed legacy migration records');

    // Isolated, ignored fixtures: never append a probe to real migration history.
    const cache = path.join(root, 'node_modules/.cache');
    fs.mkdirSync(cache, { recursive: true });
    const fixture = fs.mkdtempSync(path.join(cache, 'migration-workflow-'));
    const fixtureMigrations = path.join(fixture, 'migrations');
    fs.cpSync(path.join(root, 'prisma/baseline-migrations'), fixtureMigrations, { recursive: true });
    const fixtureSchema = path.join(fixture, 'schema.prisma');
    fs.writeFileSync(fixtureSchema, schema.replace('model Department {', 'model Department {\n  migrationVerificationProbe String?'));
    const futureDirectory = path.join(fixtureMigrations, '99999999999999_verification_only');
    fs.mkdirSync(futureDirectory);
    const fixtureConfig = path.join(fixture, 'prisma.config.ts');
    fs.writeFileSync(fixtureConfig, 'import { defineConfig, env } from "prisma/config";\nexport default defineConfig({ schema: "schema.prisma", migrations: { path: "migrations" }, datasource: { url: env("MIGRATION_DATABASE_URL") } });\n');
    cli(['migrate', 'diff', '--from-schema', 'prisma/schema.prisma', '--to-schema', fixtureSchema, '--script', '--output', path.join(futureDirectory, 'migration.sql'), '--config', baselineConfig], target.toString());
    async function verifyFutureMigration() {
      cli(['migrate', 'deploy', '--config', fixtureConfig], target.toString());
      cli(['migrate', 'status', '--config', fixtureConfig], target.toString());
      cli(['migrate', 'diff', '--from-config-datasource', '--to-schema', fixtureSchema, '--exit-code', '--config', fixtureConfig], target.toString());
    }
    await verifyFutureMigration();
    const [fixtureRows] = await testConnection.query("SELECT name, migrationVerificationProbe FROM Department WHERE name = 'Migration verification fixture'");
    assert.equal(fixtureRows.length, 1);
    assert.equal(fixtureRows[0].migrationVerificationProbe, null);
    const upgradedLegacySchema = await schemaSnapshot(testConnection, disposableDatabase);
    console.log('Existing-history baseline adoption and future migration, retaining fixture data and old history: PASS');

    await recreateDisposable();
    await verifyFutureMigration();
    testConnection = await mysql.createConnection(target.toString());
    assert.deepEqual(await schemaSnapshot(testConnection, disposableDatabase), upgradedLegacySchema);
    console.log('Same future migration on fresh database produces identical schema: PASS');

    await recreateDisposable();
    console.log('Replaying canonical baseline from an empty disposable database');
    cli(['migrate', 'deploy', '--config', baselineConfig], target.toString());
    cli(['migrate', 'status', '--config', baselineConfig], target.toString());
    cli(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code', '--config', baselineConfig], target.toString());
    testConnection = await mysql.createConnection(target.toString());
    assert.deepEqual(await schemaSnapshot(testConnection, disposableDatabase), legacySchema, 'Baseline differs from historical final schema');
    const [tables] = await testConnection.query('SHOW TABLES');
    const tableNames = tables.map(row => Object.values(row)[0]).sort();
    const expected = [...models, '_prisma_migrations'].map(name => settings[0].lowerCaseTableNames === 1 ? name.toLowerCase() : name).sort();
    assert.deepEqual(tableNames, expected);
    console.log('Final disposable tables:', JSON.stringify(tableNames));
    console.log('Baseline vs full historical schema, including foreign keys/indexes: PASS');
    console.log('Fresh empty-database migration replay: PASS');
    if (settings[0].lowerCaseTableNames !== 0) console.log('WARNING: Live replay was case-insensitive; exact-case SQL validation passed, but Linux replay was not exercised.');
  } finally {
    if (readonly && before) {
      assert.equal(await protectedSnapshot(readonly), before, 'Protected database snapshot changed during verification');
      for (const { name, checksum } of originalFiles) assert.equal(hash(fs.readFileSync(path.join(legacyDirectory, name, 'migration.sql'))), checksum);
      console.log('Real database schema, row counts and migration history unchanged: PASS');
      console.log('Historical migration bytes unchanged: PASS');
    }
    await Promise.all([readonly, admin, testConnection].filter(Boolean).map(connection => connection.end()));
  }
}

main().catch(error => {
  // Database messages can contain credential details. Print codes only.
  console.error('Migration verification failed:', error.code || error.name);
  if (error.name === 'AssertionError') console.error('Assertion:', error.message.split('\n')[0]);
  process.exitCode = 1;
});
