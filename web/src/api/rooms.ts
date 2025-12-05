import { Hono } from 'hono';
import type { Env } from '../worker';

export const roomRoutes = new Hono<{ Bindings: Env }>();

roomRoutes.get('/', async (c) => {
  const schoolId = c.req.param('schoolId');
  const rooms = await c.env.DB.prepare(`
    SELECT id, external_id, name, capacity FROM rooms WHERE school_id = ? ORDER BY name
  `).bind(schoolId).all();
  return c.json({ success: true, data: rooms.results });
});
