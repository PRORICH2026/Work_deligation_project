import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleRoutes, canAccessPath } from '../src/routes/access.ts';

const expected = {
  ADMIN: ['/tasks', '/management/delegations', '/employee-management', '/new-delegation'],
  HR: ['/tasks', '/management/delegations', '/employee-management', '/new-delegation'],
  EA: ['/tasks', '/management/delegations', '/employee-management', '/new-delegation'],
  MD: ['/tasks', '/management/delegations', '/performance', '/new-delegation'],
  EMPLOYEE: ['/tasks', '/new-delegation'],
  DEPARTMENT_HOD: ['/tasks', '/new-delegation'],
  PROCESS: ['/tasks', '/new-delegation'],
  SC_TEAM: ['/tasks', '/new-delegation'],
};

for (const [role, paths] of Object.entries(expected)) {
  test(`${role} has exactly the requested navigation and direct-route permissions`, () => {
    assert.deepEqual(moduleRoutes.filter(route => canAccessPath(role, route.path)).map(route => route.path), paths);
    for (const route of moduleRoutes) assert.equal(canAccessPath(role, route.path), paths.includes(route.path));
  });
}
test('unauthenticated and unknown roles cannot enter restricted modules', () => {
  for (const route of moduleRoutes) assert.equal(canAccessPath(null, route.path), false);
  for (const path of ['/performance', '/employee-management', '/management/delegations', '/unknown']) {
    assert.equal(canAccessPath('UNKNOWN', path), false);
  }
});
