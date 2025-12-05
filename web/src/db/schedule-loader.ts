/**
 * Database helpers to load scheduling data from D1 and save results
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  Student,
  Teacher,
  Course,
  Room,
  Section,
  Period,
  ScheduleConfig,
  SchoolId,
  StudentId,
  TeacherId,
  CourseId,
  RoomId,
  ScheduleId,
  UserId,
} from '../shared/types.js';
import type { ScheduleInput, ScheduleResult } from '../scheduler/index.js';

/**
 * Load all scheduling data for a school from D1
 */
export async function loadScheduleInput(
  db: D1Database,
  schoolId: SchoolId
): Promise<ScheduleInput> {
  // Load school config
  const schoolResult = await db.prepare(
    'SELECT config_json FROM schools WHERE id = ?'
  ).bind(schoolId).first<{ config_json: string }>();

  if (!schoolResult) {
    throw new Error('School not found');
  }

  const config: ScheduleConfig = JSON.parse(schoolResult.config_json);

  // Load students with their required courses and elective preferences
  const studentsResult = await db.prepare(`
    SELECT
      s.id, s.external_id, s.name, s.grade
    FROM students s
    WHERE s.school_id = ?
    ORDER BY s.grade, s.name
  `).bind(schoolId).all<{
    id: StudentId;
    external_id: string | null;
    name: string;
    grade: number;
  }>();

  const students: Student[] = [];
  for (const row of studentsResult.results) {
    // Load required courses
    const requiredResult = await db.prepare(
      'SELECT course_id FROM student_required_courses WHERE student_id = ?'
    ).bind(row.id).all<{ course_id: CourseId }>();

    // Load elective preferences (ordered)
    const electivesResult = await db.prepare(
      'SELECT course_id FROM student_elective_preferences WHERE student_id = ? ORDER BY preference_order'
    ).bind(row.id).all<{ course_id: CourseId }>();

    students.push({
      id: row.id,
      externalId: row.external_id || undefined,
      name: row.name,
      grade: row.grade,
      requiredCourses: requiredResult.results.map(r => r.course_id),
      electivePreferences: electivesResult.results.map(r => r.course_id),
    });
  }

  // Load teachers with subjects and unavailable periods
  const teachersResult = await db.prepare(`
    SELECT
      t.id, t.external_id, t.name, t.max_sections
    FROM teachers t
    WHERE t.school_id = ?
    ORDER BY t.name
  `).bind(schoolId).all<{
    id: TeacherId;
    external_id: string | null;
    name: string;
    max_sections: number;
  }>();

  const teachers: Teacher[] = [];
  for (const row of teachersResult.results) {
    // Load subjects
    const subjectsResult = await db.prepare(
      'SELECT course_id FROM teacher_subjects WHERE teacher_id = ?'
    ).bind(row.id).all<{ course_id: CourseId }>();

    // Load unavailable periods
    const unavailableResult = await db.prepare(
      'SELECT day, slot FROM teacher_unavailable WHERE teacher_id = ?'
    ).bind(row.id).all<{ day: number; slot: number }>();

    teachers.push({
      id: row.id,
      externalId: row.external_id || undefined,
      name: row.name,
      subjects: subjectsResult.results.map(r => r.course_id),
      maxSections: row.max_sections,
      unavailable: unavailableResult.results.map(r => ({ day: r.day, slot: r.slot })),
    });
  }

  // Load courses with grade restrictions and required features
  const coursesResult = await db.prepare(`
    SELECT
      c.id, c.external_id, c.name, c.max_students,
      c.periods_per_week, c.num_sections
    FROM courses c
    WHERE c.school_id = ?
    ORDER BY c.name
  `).bind(schoolId).all<{
    id: CourseId;
    external_id: string | null;
    name: string;
    max_students: number;
    periods_per_week: number;
    num_sections: number;
  }>();

  const courses: Course[] = [];
  for (const row of coursesResult.results) {
    // Load grade restrictions
    const gradesResult = await db.prepare(
      'SELECT grade FROM course_grade_restrictions WHERE course_id = ?'
    ).bind(row.id).all<{ grade: number }>();

    // Load required features
    const featuresResult = await db.prepare(
      'SELECT feature FROM course_required_features WHERE course_id = ?'
    ).bind(row.id).all<{ feature: string }>();

    courses.push({
      id: row.id,
      externalId: row.external_id || undefined,
      name: row.name,
      maxStudents: row.max_students,
      periodsPerWeek: row.periods_per_week,
      gradeRestrictions: gradesResult.results.length > 0
        ? gradesResult.results.map(r => r.grade)
        : undefined,
      requiredFeatures: featuresResult.results.map(r => r.feature),
      sections: row.num_sections,
    });
  }

  // Load rooms with features and unavailable periods
  const roomsResult = await db.prepare(`
    SELECT
      r.id, r.external_id, r.name, r.capacity
    FROM rooms r
    WHERE r.school_id = ?
    ORDER BY r.name
  `).bind(schoolId).all<{
    id: RoomId;
    external_id: string | null;
    name: string;
    capacity: number;
  }>();

  const rooms: Room[] = [];
  for (const row of roomsResult.results) {
    // Load features
    const featuresResult = await db.prepare(
      'SELECT feature FROM room_features WHERE room_id = ?'
    ).bind(row.id).all<{ feature: string }>();

    // Load unavailable periods
    const unavailableResult = await db.prepare(
      'SELECT day, slot FROM room_unavailable WHERE room_id = ?'
    ).bind(row.id).all<{ day: number; slot: number }>();

    rooms.push({
      id: row.id,
      externalId: row.external_id || undefined,
      name: row.name,
      capacity: row.capacity,
      features: featuresResult.results.map(r => r.feature),
      unavailable: unavailableResult.results.map(r => ({ day: r.day, slot: r.slot })),
    });
  }

  return {
    students,
    teachers,
    courses,
    rooms,
    config,
  };
}

/**
 * Save a generated schedule to D1
 */
export async function saveSchedule(
  db: D1Database,
  schoolId: SchoolId,
  userId: UserId,
  name: string,
  result: ScheduleResult
): Promise<ScheduleId> {
  const scheduleId = crypto.randomUUID();

  // Insert schedule record
  await db.prepare(`
    INSERT INTO schedules (
      id, school_id, name, status, score,
      algorithm_version, solve_time_ms, metadata_json,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    scheduleId,
    schoolId,
    name,
    result.metadata.score,
    result.metadata.algorithmVersion,
    result.metadata.solveTimeMs,
    JSON.stringify(result.metadata),
    userId
  ).run();

  // Insert sections
  for (const section of result.sections) {
    const sectionId = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO schedule_sections (
        id, schedule_id, course_id, teacher_id, room_id, capacity
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      sectionId,
      scheduleId,
      section.courseId,
      section.teacherId || null,
      section.roomId || null,
      section.capacity
    ).run();

    // Insert periods
    for (const period of section.periods) {
      await db.prepare(`
        INSERT INTO section_periods (section_id, day, slot)
        VALUES (?, ?, ?)
      `).bind(sectionId, period.day, period.slot).run();
    }

    // Insert enrollments
    for (const studentId of section.enrolledStudents) {
      await db.prepare(`
        INSERT INTO section_enrollments (section_id, student_id)
        VALUES (?, ?)
      `).bind(sectionId, studentId).run();
    }
  }

  // Insert unassigned students
  for (const unassigned of result.unassignedStudents) {
    await db.prepare(`
      INSERT INTO schedule_unassigned (schedule_id, student_id, course_id, reason)
      VALUES (?, ?, ?, ?)
    `).bind(
      scheduleId,
      unassigned.studentId,
      unassigned.courseId,
      unassigned.reason
    ).run();
  }

  return scheduleId;
}

/**
 * Load a schedule from D1 by ID
 */
export async function loadSchedule(
  db: D1Database,
  scheduleId: ScheduleId
): Promise<ScheduleResult | null> {
  // Load schedule metadata
  const scheduleResult = await db.prepare(`
    SELECT
      id, school_id, name, status, score,
      algorithm_version, solve_time_ms, metadata_json,
      created_by, created_at
    FROM schedules
    WHERE id = ?
  `).bind(scheduleId).first<{
    id: ScheduleId;
    school_id: SchoolId;
    name: string;
    status: string;
    score: number;
    algorithm_version: string;
    solve_time_ms: number;
    metadata_json: string;
    created_by: UserId;
    created_at: string;
  }>();

  if (!scheduleResult) {
    return null;
  }

  // Load sections
  const sectionsResult = await db.prepare(`
    SELECT id, course_id, teacher_id, room_id, capacity
    FROM schedule_sections
    WHERE schedule_id = ?
  `).bind(scheduleId).all<{
    id: string;
    course_id: CourseId;
    teacher_id: TeacherId | null;
    room_id: RoomId | null;
    capacity: number;
  }>();

  const sections: Section[] = [];
  for (const row of sectionsResult.results) {
    // Load periods
    const periodsResult = await db.prepare(`
      SELECT day, slot
      FROM section_periods
      WHERE section_id = ?
    `).bind(row.id).all<{ day: number; slot: number }>();

    // Load enrollments
    const enrollmentsResult = await db.prepare(`
      SELECT student_id
      FROM section_enrollments
      WHERE section_id = ?
    `).bind(row.id).all<{ student_id: StudentId }>();

    sections.push({
      id: row.id,
      courseId: row.course_id,
      teacherId: row.teacher_id || undefined,
      roomId: row.room_id || undefined,
      periods: periodsResult.results.map(p => ({ day: p.day, slot: p.slot })),
      enrolledStudents: enrollmentsResult.results.map(e => e.student_id),
      capacity: row.capacity,
    });
  }

  // Load unassigned students
  const unassignedResult = await db.prepare(`
    SELECT student_id, course_id, reason
    FROM schedule_unassigned
    WHERE schedule_id = ?
  `).bind(scheduleId).all<{
    student_id: StudentId;
    course_id: CourseId;
    reason: string;
  }>();

  const unassignedStudents = unassignedResult.results.map(r => ({
    studentId: r.student_id,
    courseId: r.course_id,
    reason: r.reason,
  }));

  const metadata = JSON.parse(scheduleResult.metadata_json);

  return {
    sections,
    unassignedStudents,
    metadata,
  };
}
