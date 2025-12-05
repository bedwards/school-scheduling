import { Hono } from 'hono';
import type { Env } from '../worker';

export const courseRoutes = new Hono<{ Bindings: Env }>();

courseRoutes.get('/', async (c) => {
  const schoolId = c.req.param('schoolId');
  const courses = await c.env.DB.prepare(`
    SELECT id, external_id, name, max_students, num_sections FROM courses WHERE school_id = ? ORDER BY name
  `).bind(schoolId).all();
  return c.json({ success: true, data: courses.results });
});
