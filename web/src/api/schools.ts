/**
 * Schools API Routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../worker';
import { auditLog } from './middleware';
import type { School, ScheduleConfig } from '../shared/types';

export const schoolRoutes = new Hono<{ Bindings: Env }>();

// Validation schemas
const createSchoolSchema = z.object({
  name: z.string().min(1).max(200),
  config: z.object({
    periodsPerDay: z.number().int().min(1).max(12).default(8),
    daysPerWeek: z.number().int().min(1).max(7).default(5),
    lunchPeriods: z.array(z.number().int()).optional(),
  }).optional(),
});

const updateSchoolSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.object({
    periodsPerDay: z.number().int().min(1).max(12).optional(),
    daysPerWeek: z.number().int().min(1).max(7).optional(),
    lunchPeriods: z.array(z.number().int()).optional(),
  }).optional(),
});

// ============================================================================
// GET /api/schools - List user's schools
// ============================================================================

schoolRoutes.get('/', async (c) => {
  try {
    const userId = c.get('userId');

    const schools = await c.env.DB.prepare(`
      SELECT s.id, s.name, s.config_json, s.created_at, s.updated_at, sa.access_level
      FROM schools s
      JOIN school_access sa ON s.id = sa.school_id
      WHERE sa.user_id = ?
      ORDER BY s.updated_at DESC
    `).bind(userId).all<{
      id: string;
      name: string;
      config_json: string;
      created_at: string;
      updated_at: string;
      access_level: string;
    }>();

    const result = schools.results.map((s) => ({
      id: s.id,
      name: s.name,
      config: JSON.parse(s.config_json) as ScheduleConfig,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      accessLevel: s.access_level,
    }));

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('List schools error:', error);
    return c.json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to list schools' },
    }, 500);
  }
});

// ============================================================================
// POST /api/schools - Create new school
// ============================================================================

schoolRoutes.post('/', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json();
    const result = createSchoolSchema.safeParse(body);

    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: result.error.flatten(),
        },
      }, 400);
    }

    const { name, config } = result.data;
    const schoolId = crypto.randomUUID();

    const defaultConfig: ScheduleConfig = {
      periodsPerDay: 8,
      daysPerWeek: 5,
      ...config,
    };

    // Create school
    await c.env.DB.prepare(`
      INSERT INTO schools (id, name, created_by, config_json)
      VALUES (?, ?, ?, ?)
    `).bind(schoolId, name, userId, JSON.stringify(defaultConfig)).run();

    // Grant admin access to creator
    await c.env.DB.prepare(`
      INSERT INTO school_access (school_id, user_id, access_level, granted_by)
      VALUES (?, ?, 'admin', ?)
    `).bind(schoolId, userId, userId).run();

    // Audit log
    await auditLog(
      c.env.DB,
      userId,
      'create',
      'school',
      schoolId,
      { name },
      c.req.header('CF-Connecting-IP') || null
    );

    const school: School = {
      id: schoolId,
      name,
      config: defaultConfig,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return c.json({
      success: true,
      data: school,
    }, 201);
  } catch (error) {
    console.error('Create school error:', error);
    return c.json({
      success: false,
      error: { code: 'CREATE_FAILED', message: 'Failed to create school' },
    }, 500);
  }
});

// ============================================================================
// GET /api/schools/:id - Get school details
// ============================================================================

schoolRoutes.get('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const schoolId = c.req.param('id');

    const school = await c.env.DB.prepare(`
      SELECT s.id, s.name, s.config_json, s.created_at, s.updated_at, sa.access_level
      FROM schools s
      JOIN school_access sa ON s.id = sa.school_id
      WHERE s.id = ? AND sa.user_id = ?
    `).bind(schoolId, userId).first<{
      id: string;
      name: string;
      config_json: string;
      created_at: string;
      updated_at: string;
      access_level: string;
    }>();

    if (!school) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'School not found' },
      }, 404);
    }

    // Get counts
    const counts = await c.env.DB.batch([
      c.env.DB.prepare('SELECT COUNT(*) as count FROM students WHERE school_id = ?').bind(schoolId),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM teachers WHERE school_id = ?').bind(schoolId),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM courses WHERE school_id = ?').bind(schoolId),
      c.env.DB.prepare('SELECT COUNT(*) as count FROM rooms WHERE school_id = ?').bind(schoolId),
      c.env.DB.prepare("SELECT COUNT(*) as count FROM schedules WHERE school_id = ? AND status = 'active'").bind(schoolId),
    ]);

    return c.json({
      success: true,
      data: {
        id: school.id,
        name: school.name,
        config: JSON.parse(school.config_json) as ScheduleConfig,
        createdAt: school.created_at,
        updatedAt: school.updated_at,
        accessLevel: school.access_level,
        stats: {
          students: (counts[0].results[0] as { count: number }).count,
          teachers: (counts[1].results[0] as { count: number }).count,
          courses: (counts[2].results[0] as { count: number }).count,
          rooms: (counts[3].results[0] as { count: number }).count,
          activeSchedules: (counts[4].results[0] as { count: number }).count,
        },
      },
    });
  } catch (error) {
    console.error('Get school error:', error);
    return c.json({
      success: false,
      error: { code: 'FETCH_FAILED', message: 'Failed to get school' },
    }, 500);
  }
});

// ============================================================================
// PUT /api/schools/:id - Update school
// ============================================================================

schoolRoutes.put('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const schoolId = c.req.param('id');
    const body = await c.req.json();

    // Check admin access
    const access = await c.env.DB.prepare(`
      SELECT access_level FROM school_access
      WHERE school_id = ? AND user_id = ?
    `).bind(schoolId, userId).first<{ access_level: string }>();

    if (!access || access.access_level !== 'admin') {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }, 403);
    }

    const result = updateSchoolSchema.safeParse(body);
    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: result.error.flatten(),
        },
      }, 400);
    }

    const { name, config } = result.data;

    // Build update query
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }

    if (config !== undefined) {
      // Merge with existing config
      const existing = await c.env.DB.prepare(
        'SELECT config_json FROM schools WHERE id = ?'
      ).bind(schoolId).first<{ config_json: string }>();

      const existingConfig = existing ? JSON.parse(existing.config_json) : {};
      const newConfig = { ...existingConfig, ...config };

      updates.push('config_json = ?');
      values.push(JSON.stringify(newConfig));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(schoolId);

      await c.env.DB.prepare(`
        UPDATE schools SET ${updates.join(', ')} WHERE id = ?
      `).bind(...values).run();
    }

    // Audit log
    await auditLog(
      c.env.DB,
      userId,
      'update',
      'school',
      schoolId,
      { name, config },
      c.req.header('CF-Connecting-IP') || null
    );

    return c.json({
      success: true,
      data: { message: 'School updated' },
    });
  } catch (error) {
    console.error('Update school error:', error);
    return c.json({
      success: false,
      error: { code: 'UPDATE_FAILED', message: 'Failed to update school' },
    }, 500);
  }
});

// ============================================================================
// DELETE /api/schools/:id - Delete school
// ============================================================================

schoolRoutes.delete('/:id', async (c) => {
  try {
    const userId = c.get('userId');
    const schoolId = c.req.param('id');

    // Check admin access
    const access = await c.env.DB.prepare(`
      SELECT access_level FROM school_access
      WHERE school_id = ? AND user_id = ?
    `).bind(schoolId, userId).first<{ access_level: string }>();

    if (!access || access.access_level !== 'admin') {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      }, 403);
    }

    // Delete school (cascades to all related data)
    await c.env.DB.prepare('DELETE FROM schools WHERE id = ?').bind(schoolId).run();

    // Audit log
    await auditLog(
      c.env.DB,
      userId,
      'delete',
      'school',
      schoolId,
      {},
      c.req.header('CF-Connecting-IP') || null
    );

    return c.json({
      success: true,
      data: { message: 'School deleted' },
    });
  } catch (error) {
    console.error('Delete school error:', error);
    return c.json({
      success: false,
      error: { code: 'DELETE_FAILED', message: 'Failed to delete school' },
    }, 500);
  }
});
