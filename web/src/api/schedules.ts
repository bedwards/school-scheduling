import { Hono } from 'hono';
import type { Env } from '../worker';
import type { GenerateScheduleRequest } from '../shared/types.js';
import { generateSchedule } from '../scheduler/index.js';
import { loadScheduleInput, saveSchedule } from '../db/schedule-loader.js';

export const scheduleRoutes = new Hono<{ Bindings: Env }>();

// List all schedules for a school
scheduleRoutes.get('/', async (c) => {
  const schoolId = c.req.param('schoolId');
  const schedules = await c.env.DB.prepare(`
    SELECT id, name, status, score, created_at FROM schedules WHERE school_id = ? ORDER BY created_at DESC
  `).bind(schoolId).all();
  return c.json({ success: true, data: schedules.results });
});

// Get a specific schedule with full details
scheduleRoutes.get('/:scheduleId', async (c) => {
  const scheduleId = c.req.param('scheduleId');
  const schoolId = c.req.param('schoolId');

  // Verify schedule belongs to this school
  const scheduleResult = await c.env.DB.prepare(`
    SELECT
      s.id, s.name, s.status, s.score,
      s.algorithm_version, s.solve_time_ms, s.metadata_json,
      s.created_at
    FROM schedules s
    WHERE s.id = ? AND s.school_id = ?
  `).bind(scheduleId, schoolId).first();

  if (!scheduleResult) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } }, 404);
  }

  // Load sections
  const sectionsResult = await c.env.DB.prepare(`
    SELECT id, course_id, teacher_id, room_id, capacity
    FROM schedule_sections
    WHERE schedule_id = ?
  `).bind(scheduleId).all();

  const sections = [];
  for (const section of sectionsResult.results) {
    // Load periods
    const periodsResult = await c.env.DB.prepare(`
      SELECT day, slot FROM section_periods WHERE section_id = ?
    `).bind(section.id).all();

    // Load enrollments
    const enrollmentsResult = await c.env.DB.prepare(`
      SELECT student_id FROM section_enrollments WHERE section_id = ?
    `).bind(section.id).all();

    sections.push({
      id: section.id,
      courseId: section.course_id,
      teacherId: section.teacher_id,
      roomId: section.room_id,
      periods: periodsResult.results,
      enrolledStudents: enrollmentsResult.results.map((e: { student_id: string }) => e.student_id),
      capacity: section.capacity,
    });
  }

  // Load unassigned students
  const unassignedResult = await c.env.DB.prepare(`
    SELECT student_id, course_id, reason
    FROM schedule_unassigned
    WHERE schedule_id = ?
  `).bind(scheduleId).all();

  return c.json({
    success: true,
    data: {
      ...scheduleResult,
      sections,
      unassignedStudents: unassignedResult.results,
      metadata: JSON.parse((scheduleResult as { metadata_json: string }).metadata_json),
    }
  });
});

// Generate a new schedule
scheduleRoutes.post('/generate', async (c) => {
  const schoolId = c.req.param('schoolId');
  const userId = c.get('userId') as string;

  try {
    const body = await c.req.json() as GenerateScheduleRequest;
    const { name, options = {} } = body;

    if (!name || typeof name !== 'string') {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Schedule name is required' }
      }, 400);
    }

    // Load scheduling data from database
    const input = await loadScheduleInput(c.env.DB, schoolId);

    // Validate we have enough data
    if (input.students.length === 0) {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'No students found for this school' }
      }, 400);
    }

    if (input.courses.length === 0) {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'No courses found for this school' }
      }, 400);
    }

    if (input.teachers.length === 0) {
      return c.json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'No teachers found for this school' }
      }, 400);
    }

    // Generate schedule using greedy algorithm
    const result = generateSchedule(input, {
      maxOptimizationIterations: options.maxIterations || 500,
    });

    // Save to database
    const scheduleId = await saveSchedule(c.env.DB, schoolId, userId, name, result);

    return c.json({
      success: true,
      data: {
        id: scheduleId,
        name,
        score: result.metadata.score,
        solveTimeMs: result.metadata.solveTimeMs,
        stats: {
          totalSections: result.sections.length,
          totalEnrollments: result.sections.reduce((sum, s) => sum + s.enrolledStudents.length, 0),
          unassignedCount: result.unassignedStudents.length,
          sectionsWithoutRoom: result.sections.filter(s => !s.roomId).length,
          sectionsWithoutTeacher: result.sections.filter(s => !s.teacherId).length,
        }
      }
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Schedule generation error:', errorMsg);
    return c.json({
      success: false,
      error: { code: 'GENERATION_FAILED', message: errorMsg }
    }, 500);
  }
});
