import { Hono } from 'hono';
import type { Env } from '../worker';

export const scheduleRoutes = new Hono<{ Bindings: Env }>();

scheduleRoutes.get('/', async (c) => {
  const schoolId = c.req.param('schoolId');
  const schedules = await c.env.DB.prepare(`
    SELECT id, name, status, score, created_at FROM schedules WHERE school_id = ? ORDER BY created_at DESC
  `).bind(schoolId).all();
  return c.json({ success: true, data: schedules.results });
});

scheduleRoutes.post('/generate', async (c) => {
  return c.json({ success: true, message: 'Schedule generation coming soon' });
});
