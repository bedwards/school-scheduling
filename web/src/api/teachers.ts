import { Hono } from 'hono';
import type { Env } from '../worker';

export const teacherRoutes = new Hono<{ Bindings: Env }>();

teacherRoutes.get('/', async (c) => {
  const schoolId = c.req.param('schoolId');
  const teachers = await c.env.DB.prepare(`
    SELECT id, external_id, name, max_sections FROM teachers WHERE school_id = ? ORDER BY name
  `).bind(schoolId).all();
  return c.json({ success: true, data: teachers.results });
});
