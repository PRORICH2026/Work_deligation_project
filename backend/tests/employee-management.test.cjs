const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'employee-tests-only';
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { db } = require('../dist/src/config/db.js');
const { createToken } = require('../dist/src/lib/auth.js');
const router = require('../dist/src/routes/employees.js').default;
let server, base, writes, events, duplicate = false;
db.query = async () => [[{ role: 'ADMIN', isActive: 1 }]];
db.getConnection = async () => ({
  beginTransaction: async () => events.push('begin'), commit: async () => events.push('commit'),
  rollback: async () => events.push('rollback'), release: () => events.push('release'),
  query: async (sql, params) => {
    if (sql.startsWith('SELECT id FROM Department')) return [[{ id: 1 }]];
    if (sql.startsWith('SELECT e.')) return [[{ id: 1, userId: 2, role: 'EMPLOYEE' }]];
    writes.push({ sql, params });
    if (duplicate && sql.startsWith('INSERT INTO Employee')) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    return [{ insertId: 2 }];
  },
});
before(async () => {
  const app = express(); app.use(express.json(), cookieParser()); app.use('/employees', router);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/employees/management`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
function request(role, method = 'GET', path = '', body) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: `delegation_token=${createToken({ userId: 1, email: 'test@example.com', role })}` }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const data = { employeeCode: 'CODE', fullName: 'Test', email: 'test@example.com', departmentId: 1, password: 'example-password', confirmPassword: 'example-password', isActive: true, role: 'ADMIN' };
test('all forbidden roles receive 403 on every management endpoint', async () => {
  for (const role of ['MD', 'EMPLOYEE', 'DEPARTMENT_HOD', 'PROCESS', 'SC_TEAM']) {
    for (const [method, path] of [['GET',''], ['POST',''], ['PATCH','/1/password'], ['PATCH','/1/status']]) assert.equal((await request(role, method, path, method === 'GET' ? undefined : {})).status, 403);
  }
});
test('ADMIN, HR and EA can access management', async () => {
  for (const role of ['ADMIN', 'HR', 'EA']) assert.equal((await request(role)).status, 200);
});
test('creation fixes role to EMPLOYEE and hashes password', async () => {
  writes = []; events = [];
  const response = await request('ADMIN', 'POST', '', data);
  assert.equal(response.status, 201);
  assert.match(writes[0].sql, /'EMPLOYEE'/);
  assert.equal(await bcrypt.compare(data.password, writes[0].params[2]), true);
  assert.deepEqual(events, ['begin', 'commit', 'release']);
  assert.equal(JSON.stringify(await response.json()).includes('password'), false);
});
test('duplicate employee rolls back linked user creation', async () => {
  writes = []; events = []; duplicate = true;
  assert.equal((await request('ADMIN', 'POST', '', data)).status, 409);
  assert.deepEqual(events, ['begin', 'rollback', 'release']); duplicate = false;
});
test('invalid and mismatched passwords rejected before writes', async () => {
  writes = []; events = [];
  for (const body of [{ ...data, confirmPassword: 'different' }, { ...data, password: 'tiny' }, { ...data, employeeCode: ' ' }]) assert.equal((await request('ADMIN', 'POST', '', body)).status, 400);
  assert.equal(writes.length, 0);
});
test('status updates both records transactionally without deleting history', async () => {
  writes = []; events = [];
  assert.equal((await request('EA', 'PATCH', '/1/status', { isActive: false })).status, 200);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(w => w.sql.startsWith('UPDATE') && w.params[0] === false));
  assert.deepEqual(events, ['begin', 'commit', 'release']);
});
test('password reset hashes new password and returns exact success message', async () => {
  writes = []; events = [];
  const response = await request('HR', 'PATCH', '/1/password', { password: data.password, confirmPassword: data.password });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, 'Password updated successfully.');
  assert.equal(await bcrypt.compare(data.password, writes[0].params[0]), true);
});
