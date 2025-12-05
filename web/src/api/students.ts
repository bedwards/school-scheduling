import { Hono } from 'hono';
import type { Env } from '../worker';

export const studentRoutes = new Hono<{ Bindings: Env }>();

studentRoutes.get('/', async (c) => {
  const schoolId = c.req.param('schoolId');
  const students = await c.env.DB.prepare(`
    SELECT id, external_id, name, grade FROM students WHERE school_id = ? ORDER BY grade, name
  `).bind(schoolId).all();
  return c.json({ success: true, data: students.results });
});
