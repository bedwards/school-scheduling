/**
 * School Scheduling Algorithm for Cloudflare Workers
 *
 * Greedy assignment with local search optimization
 * (ILP solver excluded - too heavy for Workers)
 *
 * Multi-phase approach:
 * 1. Section Creation: Create sections for each course with teachers assigned
 * 2. Time Slot Assignment: Assign periods to sections avoiding conflicts
 * 3. Room Assignment: Assign rooms to sections based on features and capacity
 * 4. Student Assignment: Greedy assignment prioritizing required courses
 * 5. Post-processing: Local search optimization to balance section sizes
 */

import type {
  Student,
  Teacher,
  Course,
  Room,
  Section,
  Period,
  ScheduleConfig,
  UnassignedStudent,
  ScheduleMetadata,
  StudentId,
  CourseId,
  TeacherId,
  RoomId,
} from '../shared/types.js';

export interface ScheduleInput {
  students: Student[];
  teachers: Teacher[];
  courses: Course[];
  rooms: Room[];
  config: ScheduleConfig;
}

export interface ScheduleResult {
  sections: Section[];
  unassignedStudents: UnassignedStudent[];
  metadata: ScheduleMetadata;
}

export interface SchedulerOptions {
  maxOptimizationIterations?: number;
  onProgress?: (progress: ProgressReport) => void;
}

export interface ProgressReport {
  phase: 'initializing' | 'assigning' | 'optimizing' | 'complete';
  percentComplete: number;
  currentOperation: string;
  stats?: {
    studentsAssigned?: number;
    sectionsCreated?: number;
  };
}

/**
 * Generate a school schedule using greedy algorithm
 */
export function generateSchedule(
  input: ScheduleInput,
  options: SchedulerOptions = {}
): ScheduleResult {
  const {
    maxOptimizationIterations = 500,
    onProgress
  } = options;

  const report = (phase: ProgressReport['phase'], percent: number, operation: string, stats?: ProgressReport['stats']) => {
    onProgress?.({ phase, percentComplete: percent, currentOperation: operation, stats });
  };

  const startTime = Date.now();

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
  assignTimeSlots(sections, input.teachers, input.config, teacherMap, courseMap);

  report('assigning', 20, 'Assigning rooms to sections');

  // Phase 3: Assign rooms to sections
  assignRooms(sections, input.rooms, courseMap, input.config);

  report('assigning', 30, 'Assigning students to sections');

  // Phase 4: Assign students using greedy algorithm
  const unassigned: UnassignedStudent[] = [];
  runGreedyAssignment(sections, input, courseMap, unassigned, report);

  report('optimizing', 80, 'Running local search optimization');

  // Phase 5: Optimize section balance
  const studentSchedules = buildStudentSchedules(sections, input.students);
  optimizeSections(sections, studentSchedules, courseMap, maxOptimizationIterations);

  const solveTimeMs = Date.now() - startTime;

  report('complete', 100, 'Schedule generation complete', {
    studentsAssigned: input.students.length - unassigned.length,
    sectionsCreated: sections.length,
  });

  const metadata: ScheduleMetadata = {
    generatedAt: new Date().toISOString(),
    algorithmVersion: '1.0.0-greedy-workers',
    score: calculateScore(sections, input),
    solveTimeMs,
    constraintsSatisfied: 0,
    constraintsTotal: 0,
  };

  return {
    sections,
    unassignedStudents: unassigned,
    metadata,
  };
}

/**
 * Phase 1: Create sections with teacher assignments
 */
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

/**
 * Phase 2: Assign time slots to sections
 * - Spreads sections across all periods
 * - Avoids teacher conflicts
 * - Grade-aware scheduling to prevent same-grade courses at same time
 */
function assignTimeSlots(
  sections: Section[],
  teachers: Teacher[],
  config: ScheduleConfig,
  teacherMap: Map<TeacherId, Teacher>,
  courseMap: Map<CourseId, Course>
): void {
  const teacherSchedules = new Map<TeacherId, Set<string>>();
  for (const teacher of teachers) {
    const unavailable = new Set<string>();
    for (const period of teacher.unavailable || []) {
      unavailable.add(`${period.day}-${period.slot}`);
    }
    teacherSchedules.set(teacher.id, unavailable);
  }

  // Track how many sections use each time slot (for load balancing)
  const slotUsage = new Map<number, number>();
  for (let slot = 0; slot < config.periodsPerDay; slot++) {
    slotUsage.set(slot, 0);
  }

  // Track which slots are used by courses with specific grade restrictions
  // Key: grade number, Value: Map of slot -> course count at that slot
  const gradeSlotUsage = new Map<number, Map<number, number>>();

  // Group sections by course for spreading
  const sectionsByCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  // Assign sections, spreading same-course sections across DIFFERENT time slots
  // Also avoid putting courses for the same grade at the same time slot
  for (const [courseId, courseSections] of sectionsByCourse) {
    const course = courseMap.get(courseId);
    const grades = course?.gradeRestrictions || [];

    // Track which slots this course has used (sections of same course should differ)
    const courseUsedSlots = new Set<number>();

    for (let sectionIdx = 0; sectionIdx < courseSections.length; sectionIdx++) {
      const section = courseSections[sectionIdx];
      const teacherId = section.teacherId;
      const teacherSchedule = teacherId ? teacherSchedules.get(teacherId) : null;

      // Find the least-used slot that this course hasn't used yet (if possible)
      const availableSlots: { slot: number; usage: number }[] = [];
      for (let slot = 0; slot < config.periodsPerDay; slot++) {
        // Check if teacher is available for this slot on ALL days
        const teacherAvailable = !teacherSchedule ||
          ![...Array(config.daysPerWeek).keys()].some(day =>
            teacherSchedule.has(`${day}-${slot}`)
          );

        if (teacherAvailable) {
          let penalty = slotUsage.get(slot)!;

          // Penalize reusing same slot for same course
          if (courseUsedSlots.has(slot)) {
            penalty += 1000;
          }

          // Penalize slots already used by other courses for the same grade
          // This prevents Gov and Eng12 from both being at slot 3
          for (const grade of grades) {
            const gradeSlots = gradeSlotUsage.get(grade);
            if (gradeSlots) {
              const gradeUsage = gradeSlots.get(slot) || 0;
              penalty += gradeUsage * 500; // Heavy penalty for same-grade conflicts
            }
          }

          availableSlots.push({ slot, usage: penalty });
        }
      }

      // Sort by usage (prefer less-used slots)
      availableSlots.sort((a, b) => a.usage - b.usage);

      const chosenSlot = availableSlots[0]?.slot ?? 0;
      courseUsedSlots.add(chosenSlot);
      slotUsage.set(chosenSlot, (slotUsage.get(chosenSlot) || 0) + 1);

      // Track grade-slot usage
      for (const grade of grades) {
        if (!gradeSlotUsage.has(grade)) {
          gradeSlotUsage.set(grade, new Map());
        }
        const gradeSlots = gradeSlotUsage.get(grade)!;
        gradeSlots.set(chosenSlot, (gradeSlots.get(chosenSlot) || 0) + 1);
      }

      // Assign this section to the chosen slot for all days
      for (let day = 0; day < config.daysPerWeek; day++) {
        const key = `${day}-${chosenSlot}`;
        section.periods.push({ day, slot: chosenSlot });
        if (teacherSchedule) {
          teacherSchedule.add(key);
        }
      }
    }
  }
}

/**
 * Phase 3: Assign rooms to sections
 */
function assignRooms(
  sections: Section[],
  rooms: Room[],
  courseMap: Map<CourseId, Course>,
  config: ScheduleConfig
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

/**
 * Phase 4: Greedy student assignment
 */
function runGreedyAssignment(
  sections: Section[],
  input: ScheduleInput,
  courseMap: Map<CourseId, Course>,
  unassigned: UnassignedStudent[],
  report: (phase: ProgressReport['phase'], percent: number, operation: string, stats?: ProgressReport['stats']) => void
): void {
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
      report('assigning', 30 + (studentsAssigned / input.students.length) * 45,
        `Assigning: ${studentsAssigned}/${input.students.length} students`,
        { studentsAssigned });
    }
  }

  report('assigning', 75, 'Assigning electives');

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
}

/**
 * Assign a single student to a section for a course
 */
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

/**
 * Build student schedule map from sections
 */
function buildStudentSchedules(
  sections: Section[],
  students: Student[]
): Map<StudentId, Set<string>> {
  const studentSchedules = new Map<StudentId, Set<string>>();

  for (const student of students) {
    studentSchedules.set(student.id, new Set());
  }

  for (const section of sections) {
    for (const studentId of section.enrolledStudents) {
      const schedule = studentSchedules.get(studentId);
      if (schedule) {
        for (const period of section.periods) {
          schedule.add(`${period.day}-${period.slot}`);
        }
      }
    }
  }

  return studentSchedules;
}

/**
 * Phase 5: Local search optimization to balance section sizes
 */
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

/**
 * Calculate schedule quality score (0-100)
 */
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
