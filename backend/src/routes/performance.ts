import { Router } from 'express';
import { z } from 'zod';
import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { buildPerformance, type Person, type SlaTask } from '../services/performanceScoring.js';
const router = Router();
router.use(requireAuth);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= '1000-01-01' && v <= '9999-12-30';
});
export const performanceFilters = z.object({
  departmentId: z.coerce.number().int().positive().max(2147483647).optional(),
  type: z.enum(['ALL', 'EMPLOYEE', 'EA']).default('ALL'),
  fromDate: date.optional(), toDate: date.optional(), search: z.string().trim().max(191).default(''),
}).strict().refine(v => !v.fromDate || !v.toDate || v.fromDate <= v.toDate, 'From Date must not follow To Date');

router.get('/', async (req: AuthRequest, res) => {
  if (req.user?.role !== 'MD') return res.status(403).json({ success: false, message: 'Performance access is restricted to MD' });
  const parsed = performanceFilters.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid performance filters or date range' });
  try {
    const [users] = await db.query<RowDataPacket[]>('SELECT role, isActive FROM `User` WHERE id = ?', [req.user.userId]);
    if (!users[0]?.isActive || users[0].role !== 'MD') return res.status(403).json({ success: false, message: 'Performance access is restricted to MD' });
    const f = parsed.data;
    const conditions = ["t.status <> 'CANCELLED'"];
    const params: (number | string)[] = [];
    // Existing DATETIME data is India wall time. Convert explicitly, never through
    // the Node/browser/database session timezone. Preserve indexable date bounds.
    if (f.fromDate) { conditions.push('t.createdAt >= ?'); params.push(f.fromDate); }
    if (f.toDate) { conditions.push('t.createdAt < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(f.toDate); }
    if (f.departmentId) {
      conditions.push('(t.departmentId = ? OR e.departmentId = ?)');
      params.push(f.departmentId, f.departmentId);
    }
    const [rows] = await db.query<RowDataPacket[]>(`
      SELECT t.id, t.departmentId, t.assignedEmployeeId, t.assignedEaId, t.status,
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 05:30:00', t.createdAt) / 1000 AS createdMs,
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 05:30:00', t.eaFirstActionAt) / 1000 AS assignmentMs,
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 05:30:00', h.assignedAt) / 1000 AS historyAssignmentMs,
        TIMESTAMPDIFF(MICROSECOND, '1970-01-01 05:30:00', t.completedAt) / 1000 AS completedMs,
        DATE_FORMAT(t.currentTargetDate, '%Y-%m-%d') AS targetDate
      FROM Task t LEFT JOIN Employee e ON e.id = t.assignedEmployeeId
      LEFT JOIN (
        SELECT taskId, MIN(createdAt) AS assignedAt FROM TaskStatusHistory
        WHERE fromStatus = 'NEW' AND toStatus = 'IN_PROGRESS' GROUP BY taskId
      ) h ON h.taskId = t.id
      WHERE ${conditions.join(' AND ')} ORDER BY t.id`, params);
    const [persons] = await db.query<RowDataPacket[]>(`
      SELECT 'EMPLOYEE' AS kind, e.id, e.fullName AS name, e.departmentId, d.name AS departmentName
      FROM Employee e LEFT JOIN Department d ON d.id = e.departmentId
      UNION ALL
      SELECT 'EA', u.id, u.name, u.departmentId, d.name FROM \`User\` u
      LEFT JOIN Department d ON d.id = u.departmentId
      WHERE u.role = 'EA' OR EXISTS (SELECT 1 FROM Task t WHERE t.assignedEaId = u.id)
      ORDER BY kind, name, id`);
    const numberOrNull = (v: unknown) => v === null || v === undefined ? null : Number(v);
    const tasks: SlaTask[] = rows.map(r => ({ id: r.id, departmentId: r.departmentId, assignedEmployeeId: r.assignedEmployeeId,
      assignedEaId: r.assignedEaId, status: r.status, targetDate: r.targetDate,
      createdMs: numberOrNull(r.createdMs), assignmentMs: numberOrNull(r.assignmentMs),
      historyAssignmentMs: numberOrNull(r.historyAssignmentMs), completedMs: numberOrNull(r.completedMs) }));
    const data = buildPerformance(tasks, persons as Person[], f, Date.now());
    const [departments] = await db.query('SELECT id, name FROM Department ORDER BY name');
    return res.json({ success: true, data: { ...data, departments } });
  } catch {
    return res.status(500).json({ success: false, message: 'Unable to load performance' });
  }
});
export default router;
