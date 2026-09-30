const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// No connection to the real database or use of real credentials.
process.env.DATABASE_URL = 'mysql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET = 'test-only-secret-not-for-deployment';
process.env.NODE_ENV = 'production';

const express = require('express');
const cookieParser = require('cookie-parser');
const { db } = require('../dist/src/config/db.js');
const { createToken } = require('../dist/src/lib/auth.js');
const tasks = require('../dist/src/routes/tasks.js').default;
const notifications = require('../dist/src/routes/notifications.js').default;
const auth = require('../dist/src/routes/auth.js').default;

let server, base, currentTask, writes, transactionEvents, failHistory, conflict;
function reset(status = 'NEW') {
  currentTask = { id: 1, title: 'Test delegation', createdById: 12, status,
    assignedEmployeeId: status === 'NEW' ? null : 4,
    responsibility: status === 'NEW' ? 'EA' : 'EMPLOYEE' };
  writes = [];
  transactionEvents = [];
  failHistory = false;
  conflict = false;
}
db.query = async (sql, params) => {
  if (sql.includes('FROM Task t')) return [[currentTask]];
  if (sql.includes('SELECT id') && sql.includes('role IN')) return [[{ id: 10 }, { id: 11 }]];
  if (sql.includes('INSERT INTO Notification')) {
    writes.push({ sql, params });
    return [{ insertId: 1 }];
  }
  throw new Error('Unexpected database query in test');
};
db.getConnection = async () => ({
  beginTransaction: async () => transactionEvents.push('begin'),
  commit: async () => transactionEvents.push('commit'),
  rollback: async () => transactionEvents.push('rollback'),
  release: () => transactionEvents.push('release'),
  query: async (sql, params) => {
    if (failHistory && sql.includes('TaskStatusHistory')) throw new Error('Simulated history failure');
    writes.push({ sql, params });
    return [{ affectedRows: conflict ? 0 : 1 }];
  },
});

before(async () => {
  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/tasks', tasks);
  app.use('/api/notifications', notifications);
  app.use('/api/auth', auth);
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.end();
});

function request(path, role, body, method = 'PATCH') {
  const headers = { 'Content-Type': 'application/json' };
  if (role) headers.Cookie = `delegation_token=${createToken({ userId: 10, email: 'test@example.invalid', role })}`;
  return fetch(base + path, { method, headers, body: JSON.stringify(body) });
}

test('all management roles can cancel each open state with atomic history and correct audience', async () => {
  for (const role of ['ADMIN', 'MD', 'HR', 'EA']) {
    for (const status of ['NEW', 'IN_PROGRESS', 'ON_HOLD', 'DELAYED']) {
      reset(status);
      const response = await request('/api/tasks/1/status', role, { status: 'CANCELLED', cancellationReason: '  No longer needed  ' });
      assert.equal(response.status, 200);
      assert.deepEqual(transactionEvents, ['begin', 'commit', 'release']);
      assert.match(writes[0].sql, /cancelledAt = NOW\(\)/);
      assert.doesNotMatch(writes[0].sql, /originalTargetDate/);
      const history = writes.find(write => write.sql.includes('TaskStatusHistory'));
      assert.deepEqual(history.params, [1, status, 10, 'No longer needed']);
      const audience = writes.filter(write => write.sql.includes('INSERT INTO Notification')).map(write => write.params[0]).sort();
      assert.deepEqual(audience, [10, 11, 12]);
    }
  }
});

test('non-management roles cannot cancel, assign, or update', async () => {
  for (const role of ['EMPLOYEE', 'DEPARTMENT_HOD', 'PROCESS', 'SC_TEAM']) {
    reset();
    for (const action of ['status', 'assign']) {
      const response = await request(`/api/tasks/1/${action}`, role, { status: 'CANCELLED', cancellationReason: 'Reason' });
      assert.equal(response.status, 403);
    }
    assert.equal(writes.length, 0);
  }
});

test('cancellation rejects missing, blank, and non-string reasons', async () => {
  for (const reason of [undefined, '', '   ', 1, {}]) {
    reset();
    const response = await request('/api/tasks/1/status', 'ADMIN', { status: 'CANCELLED', cancellationReason: reason });
    assert.equal(response.status, 400);
    assert.equal(writes.length, 0);
  }
});

test('closed tasks remain locked and NEW still requires assignment for other updates', async () => {
  for (const state of ['COMPLETED', 'CANCELLED']) {
    reset(state);
    assert.equal((await request('/api/tasks/1/status', 'ADMIN', { status: 'CANCELLED', cancellationReason: 'Reason' })).status, 400);
    assert.equal(writes.length, 0);
  }
  reset();
  assert.equal((await request('/api/tasks/1/status', 'ADMIN', { status: 'IN_PROGRESS' })).status, 400);
  assert.equal(writes.length, 0);
});

test('conflicting cancellation rolls back without notifications', async () => {
  reset();
  conflict = true;
  assert.equal((await request('/api/tasks/1/status', 'ADMIN', { status: 'CANCELLED', cancellationReason: 'Reason' })).status, 409);
  assert.deepEqual(transactionEvents, ['begin', 'rollback', 'release']);
  assert.equal(writes.length, 1);
});

test('history failure rolls back cancellation and sends no notifications', async () => {
  reset();
  failHistory = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await request('/api/tasks/1/status', 'ADMIN', { status: 'CANCELLED', cancellationReason: 'Reason' })).status, 500);
  } finally { console.error = originalError; }
  assert.deepEqual(transactionEvents, ['begin', 'rollback', 'release']);
  assert.equal(writes.length, 1);
});

test('authentication and production notification-test protection remain enforced', async () => {
  reset();
  assert.equal((await request('/api/tasks/1/status', null, { status: 'CANCELLED' })).status, 401);
  assert.equal((await request('/api/notifications/test', 'ADMIN', {}, 'POST')).status, 404);
  assert.equal(writes.length, 0);
});

test('production logout clears the cross-site secure session cookie', async () => {
  const response = await request('/api/auth/logout', 'ADMIN', {}, 'POST');
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=None/);
  assert.match(cookie, /Path=\//);
});

test('compiled backend starts, exposes health and enforces configured CORS and write origins', async () => {
  process.env.PORT = '0';
  process.env.FRONTEND_URL = 'https://frontend.example.invalid';
  const scheduler = require('../dist/src/services/deadlineNotificationService.js');
  const originalScheduler = scheduler.startDeadlineNotificationScheduler;
  const originalListen = express.application.listen;
  let listener, schedulerStarted = false;
  scheduler.startDeadlineNotificationScheduler = () => { schedulerStarted = true; };
  express.application.listen = function (...args) {
    listener = originalListen.apply(this, args);
    return listener;
  };
  try {
    require('../dist/src/index.js');
    await new Promise(resolve => listener.once('listening', resolve));
    const url = `http://127.0.0.1:${listener.address().port}`;
    assert.equal(schedulerStarted, true);
    for (const origin of ['http://localhost:5173', process.env.FRONTEND_URL]) {
      const health = await fetch(url + '/api/health', { headers: { Origin: origin } });
      assert.equal(health.status, 200);
      assert.equal((await health.json()).status, 'OK');
      assert.equal(health.headers.get('access-control-allow-origin'), origin);
      assert.equal(health.headers.get('access-control-allow-credentials'), 'true');
    }
    const blocked = await fetch(url + '/api/auth/logout', {
      method: 'POST', headers: { Origin: 'https://untrusted.example.invalid' },
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  } finally {
    express.application.listen = originalListen;
    scheduler.startDeadlineNotificationScheduler = originalScheduler;
    if (listener) await new Promise(resolve => listener.close(resolve));
  }
});
