/**
 * School Scheduling Algorithm
 *
 * Primary: Integer Linear Programming (ILP) using HiGHS solver
 * Fallback: Greedy assignment with local search optimization
 *
 * Multi-phase approach:
 * 1. Section Creation: Create sections for each course with teachers assigned
 * 2. Time Slot Assignment: Assign periods to sections avoiding conflicts
 * 3. Room Assignment: Assign rooms to sections based on features and capacity
 * 4. Student Assignment: ILP optimization (or greedy fallback)
 * 5. Post-processing: Fill in any gaps with greedy assignment
 */

import type {
  ScheduleInput,
  Schedule,
  Section,
  Period,
  Course,
  Teacher,
  Room,
  UnassignedStudent,
  ProgressCallback,
  ProgressReport,
  SectionId,
  StudentId,
  CourseId,
  TeacherId,
  RoomId,
} from '../types/index.js';
import { solveScheduleILP } from './ilp-solver.js';

export interface SchedulerOptions {
  maxOptimizationIterations?: number;
  useILP?: boolean; // Default true
  onProgress?: ProgressCallback;
}

export async function generateSchedule(
  input: ScheduleInput,
  options: SchedulerOptions = {}
): Promise<Schedule> {
  const {
    maxOptimizationIterations = 1000,
    useILP = true,
    onProgress
  } = options;

  const report = (phase: ProgressReport['phase'], percent: number, operation: string, stats?: ProgressReport['stats']) => {
    onProgress?.({ phase, percentComplete: percent, currentOperation: operation, stats });
  };

  report('initializing', 0, 'Validating input data');

  // Build lookup maps for efficiency
  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const teacherMap = new Map(input.teachers.map(t => [t.id, t]));
  const roomMap = new Map(input.rooms.map(r => [r.id, r]));

  report('initializing', 5, 'Creating sections');

  // Phase 1: Create sections with teachers
  const sections = createSections(input.courses, input.teachers);

  report('assigning', 10, 'Assigning time slots to sections');

  // Phase 2: Assign time slots to sections
  assignTimeSlots(sections, input.teachers, input.config, teacherMap);

  report('assigning', 20, 'Assigning rooms to sections');

  // Phase 3: Assign rooms to sections
  assignRooms(sections, input.rooms, courseMap, input.config);

  report('assigning', 30, 'Assigning students to sections');

  // Phase 4: Assign students using ILP or greedy
  const unassigned: UnassignedStudent[] = [];
  let algorithmUsed = 'greedy';
  let ilpObjective = 0;

  if (useILP) {
    try {
      report('optimizing', 35, 'Building ILP model with HiGHS solver...');

      const ilpResult = await solveScheduleILP(sections, input, (progress) => {
        // Scale ILP progress to 35-85%
        const scaledPercent = 35 + (progress.percentComplete / 100) * 50;
        report(progress.phase, scaledPercent, progress.currentOperation, progress.stats);
      });

      if (ilpResult.success) {
        algorithmUsed = 'ilp-highs';
        ilpObjective = ilpResult.objectiveValue;

        report('optimizing', 85, `ILP solved (${ilpResult.status}), applying assignments...`);

        // Apply ILP assignments to sections
        applyILPAssignments(sections, ilpResult.assignments, input.students, courseMap, unassigned);

        report('optimizing', 90, `ILP complete: objective=${ilpResult.objectiveValue.toFixed(1)}, time=${ilpResult.solveTimeMs}ms`);
      } else {
        report('optimizing', 85, `ILP failed (${ilpResult.status}), falling back to greedy...`);
        // Fall through to greedy
        await runGreedyAssignment(sections, input, courseMap, unassigned, report);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      report('optimizing', 85, `ILP error: ${errorMsg}, falling back to greedy...`);
      // Fall through to greedy
      await runGreedyAssignment(sections, input, courseMap, unassigned, report);
    }
  } else {
    await runGreedyAssignment(sections, input, courseMap, unassigned, report);
  }

  report('validating', 95, 'Finalizing schedule');

  const schedule: Schedule = {
    sections,
    unassignedStudents: unassigned,
    metadata: {
      generatedAt: new Date().toISOString(),
      algorithmVersion: '2.0.0-ilp',
      iterations: algorithmUsed === 'ilp-highs' ? 1 : maxOptimizationIterations,
      score: calculateScore(sections, input),
      constraintsSatisfied: 0,
      constraintsTotal: input.constraints.length + input.preferences.length,
      warnings: algorithmUsed === 'greedy' ? ['Used greedy fallback instead of ILP'] : [],
    },
  };

  // Add algorithm info to metadata
  (schedule.metadata as Record<string, unknown>).algorithm = algorithmUsed;
  if (ilpObjective > 0) {
    (schedule.metadata as Record<string, unknown>).ilpObjective = ilpObjective;
  }

  report('complete', 100, 'Schedule generation complete', {
    studentsAssigned: input.students.length - unassigned.length,
    sectionsCreated: sections.length,
  });

  return schedule;
}

function applyILPAssignments(
  sections: Section[],
  assignments: Map<StudentId, SectionId[]>,
  students: { id: StudentId; requiredCourses: CourseId[] }[],
  courseMap: Map<CourseId, Course>,
  unassigned: UnassignedStudent[]
): void {
  // Build section lookup
  const sectionMap = new Map(sections.map(s => [s.id, s]));

  for (const student of students) {
    const studentSections = assignments.get(student.id) || [];

    for (const sectionId of studentSections) {
      const section = sectionMap.get(sectionId);
      if (section && !section.enrolledStudents.includes(student.id)) {
        section.enrolledStudents.push(student.id);
      }
    }

    // Check for missing required courses
    const assignedCourses = new Set(studentSections.map(sid => {
      const sec = sectionMap.get(sid);
      return sec?.courseId;
    }));

    for (const courseId of student.requiredCourses) {
      const course = courseMap.get(courseId);
      // Skip grade-restricted courses the student can't take
      if (course?.gradeRestrictions) {
        const studentObj = students.find(s => s.id === student.id) as { grade?: number };
        if (studentObj?.grade && !course.gradeRestrictions.includes(studentObj.grade)) {
          continue;
        }
      }

      if (!assignedCourses.has(courseId)) {
        unassigned.push({
          studentId: student.id,
          courseId,
          reason: 'ILP could not find feasible assignment (conflict or capacity)',
        });
      }
    }
  }
}

async function runGreedyAssignment(
  sections: Section[],
  input: ScheduleInput,
  courseMap: Map<CourseId, Course>,
  unassigned: UnassignedStudent[],
  report: (phase: ProgressReport['phase'], percent: number, operation: string, stats?: ProgressReport['stats']) => void
): Promise<void> {
  // Track student schedules for conflict detection
  const studentSchedules = new Map<StudentId, Set<string>>();
  for (const student of input.students) {
    studentSchedules.set(student.id, new Set());
  }

  // First pass: required courses
  let studentsAssigned = 0;
  for (const student of input.students) {
    for (const courseId of student.requiredCourses) {
      const course = courseMap.get(courseId);
      if (!course) {
        unassigned.push({ studentId: student.id, courseId, reason: 'Course not found' });
        continue;
      }

      if (course.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue; // Skip silently - grade doesn't match
      }

      const assigned = assignStudentToSection(
        student.id,
        courseId,
        sections,
        studentSchedules,
        courseMap
      );

      if (!assigned) {
        unassigned.push({
          studentId: student.id,
          courseId,
          reason: 'No available section (conflict or capacity)'
        });
      }
    }
    studentsAssigned++;
    if (studentsAssigned % 10 === 0) {
      report('assigning', 50 + (studentsAssigned / input.students.length) * 20,
        `Greedy: ${studentsAssigned}/${input.students.length} students`,
        { studentsAssigned });
    }
  }

  report('assigning', 75, 'Assigning electives (greedy)');

  // Second pass: electives
  for (const student of input.students) {
    for (const courseId of student.electivePreferences) {
      const course = courseMap.get(courseId);
      if (!course) continue;

      if (course.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue;
      }

      assignStudentToSection(
        student.id,
        courseId,
        sections,
        studentSchedules,
        courseMap
      );
    }
  }

  report('optimizing', 80, 'Running local search optimization');

  // Optimization
  optimizeSections(sections, studentSchedules, courseMap, 500);
}

function createSections(
  courses: Course[],
  teachers: Teacher[]
): Section[] {
  const sections: Section[] = [];
  const teacherSectionCount = new Map<TeacherId, number>();

  for (const course of courses) {
    const qualifiedTeachers = teachers.filter(t =>
      t.subjects.includes(course.id) &&
      (teacherSectionCount.get(t.id) || 0) < t.maxSections
    );

    for (let i = 0; i < course.sections; i++) {
      const teacher = qualifiedTeachers[i % qualifiedTeachers.length];

      const section: Section = {
        id: `${course.id}-${i + 1}`,
        courseId: course.id,
        teacherId: teacher?.id,
        periods: [],
        enrolledStudents: [],
        capacity: course.maxStudents,
      };

      sections.push(section);

      if (teacher) {
        teacherSectionCount.set(teacher.id, (teacherSectionCount.get(teacher.id) || 0) + 1);
      }
    }
  }

  return sections;
}

function assignTimeSlots(
  sections: Section[],
  teachers: Teacher[],
  config: ScheduleInput['config'],
  teacherMap: Map<TeacherId, Teacher>
): void {
  const teacherSchedules = new Map<TeacherId, Set<string>>();
  for (const teacher of teachers) {
    const unavailable = new Set<string>();
    for (const period of teacher.unavailable || []) {
      unavailable.add(`${period.day}-${period.slot}`);
    }
    teacherSchedules.set(teacher.id, unavailable);
  }

  const sectionsByCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  for (const [, courseSections] of sectionsByCourse) {
    for (let sectionIdx = 0; sectionIdx < courseSections.length; sectionIdx++) {
      const section = courseSections[sectionIdx];
      const teacherId = section.teacherId;
      const teacherSchedule = teacherId ? teacherSchedules.get(teacherId) : null;

      for (let day = 0; day < config.daysPerWeek; day++) {
        for (let attempt = 0; attempt < config.periodsPerDay; attempt++) {
          const slot = (sectionIdx + attempt) % config.periodsPerDay;
          const key = `${day}-${slot}`;

          if (teacherSchedule && teacherSchedule.has(key)) {
            continue;
          }

          section.periods.push({ day, slot });

          if (teacherSchedule) {
            teacherSchedule.add(key);
          }
          break;
        }
      }
    }
  }
}

function assignRooms(
  sections: Section[],
  rooms: Room[],
  courseMap: Map<CourseId, Course>,
  config: ScheduleInput['config']
): void {
  const roomSchedules = new Map<RoomId, Set<string>>();
  for (const room of rooms) {
    const unavailable = new Set<string>();
    for (const period of room.unavailable || []) {
      unavailable.add(`${period.day}-${period.slot}`);
    }
    roomSchedules.set(room.id, unavailable);
  }

  for (const section of sections) {
    const course = courseMap.get(section.courseId);
    const requiredFeatures = course?.requiredFeatures || [];

    const suitableRooms = rooms.filter(r => {
      if (r.capacity < section.capacity) return false;
      return requiredFeatures.every(f => r.features.includes(f));
    });

    suitableRooms.sort((a, b) => a.capacity - b.capacity);

    for (const room of suitableRooms) {
      const schedule = roomSchedules.get(room.id)!;
      const canUse = section.periods.every(p => !schedule.has(`${p.day}-${p.slot}`));

      if (canUse) {
        section.roomId = room.id;
        for (const period of section.periods) {
          schedule.add(`${period.day}-${period.slot}`);
        }
        break;
      }
    }
  }
}

function assignStudentToSection(
  studentId: StudentId,
  courseId: CourseId,
  sections: Section[],
  studentSchedules: Map<StudentId, Set<string>>,
  courseMap: Map<CourseId, Course>
): boolean {
  const studentSchedule = studentSchedules.get(studentId)!;
  const courseSections = sections.filter(s => s.courseId === courseId);

  courseSections.sort((a, b) => a.enrolledStudents.length - b.enrolledStudents.length);

  for (const section of courseSections) {
    if (section.enrolledStudents.length >= section.capacity) {
      continue;
    }

    const hasConflict = section.periods.some(p =>
      studentSchedule.has(`${p.day}-${p.slot}`)
    );

    if (hasConflict) {
      continue;
    }

    section.enrolledStudents.push(studentId);
    for (const period of section.periods) {
      studentSchedule.add(`${period.day}-${period.slot}`);
    }
    return true;
  }

  return false;
}

function optimizeSections(
  sections: Section[],
  studentSchedules: Map<StudentId, Set<string>>,
  courseMap: Map<CourseId, Course>,
  maxIterations: number
): void {
  const sectionsByCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    let improved = false;

    for (const [, courseSections] of sectionsByCourse) {
      if (courseSections.length < 2) continue;

      courseSections.sort((a, b) => a.enrolledStudents.length - b.enrolledStudents.length);
      const smallest = courseSections[0];
      const largest = courseSections[courseSections.length - 1];

      const diff = largest.enrolledStudents.length - smallest.enrolledStudents.length;
      if (diff <= 1) continue;

      for (const studentId of largest.enrolledStudents) {
        const studentSchedule = studentSchedules.get(studentId)!;

        for (const period of largest.periods) {
          studentSchedule.delete(`${period.day}-${period.slot}`);
        }

        const hasConflict = smallest.periods.some(p =>
          studentSchedule.has(`${p.day}-${p.slot}`)
        );

        if (!hasConflict && smallest.enrolledStudents.length < smallest.capacity) {
          largest.enrolledStudents = largest.enrolledStudents.filter(id => id !== studentId);
          smallest.enrolledStudents.push(studentId);
          for (const period of smallest.periods) {
            studentSchedule.add(`${period.day}-${period.slot}`);
          }
          improved = true;
          break;
        } else {
          for (const period of largest.periods) {
            studentSchedule.add(`${period.day}-${period.slot}`);
          }
        }
      }
    }

    if (!improved) break;
  }
}

function calculateScore(sections: Section[], input: ScheduleInput): number {
  let score = 100;

  const emptySections = sections.filter(s => s.enrolledStudents.length === 0);
  score -= emptySections.length * 5;

  const sectionsByCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  for (const [, courseSections] of sectionsByCourse) {
    if (courseSections.length < 2) continue;
    const sizes = courseSections.map(s => s.enrolledStudents.length);
    const variance = Math.max(...sizes) - Math.min(...sizes);
    score -= variance * 0.5;
  }

  const noRoom = sections.filter(s => !s.roomId);
  score -= noRoom.length * 10;

  const noTeacher = sections.filter(s => !s.teacherId);
  score -= noTeacher.length * 10;

  return Math.max(0, Math.min(100, score));
}
