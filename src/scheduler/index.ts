/**
 * School Scheduling Algorithm
 *
 * Uses a multi-phase approach:
 * 1. Section Creation: Create sections for each course with teachers assigned
 * 2. Time Slot Assignment: Assign periods to sections avoiding conflicts
 * 3. Room Assignment: Assign rooms to sections based on features and capacity
 * 4. Student Assignment: Assign students to sections (required courses first, then electives)
 * 5. Optimization: Local search to improve soft constraint satisfaction
 *
 * Time Complexity: O(S * C * P) where S=students, C=courses, P=periods
 * Space Complexity: O(S * C) for conflict tracking
 */

import type {
  ScheduleInput,
  Schedule,
  Section,
  Period,
  Course,
  Teacher,
  Room,
  Student,
  UnassignedStudent,
  ProgressCallback,
  ProgressReport,
  SectionId,
  StudentId,
  CourseId,
  TeacherId,
  RoomId,
} from '../types/index.js';

export interface SchedulerOptions {
  maxOptimizationIterations?: number;
  onProgress?: ProgressCallback;
}

export async function generateSchedule(
  input: ScheduleInput,
  options: SchedulerOptions = {}
): Promise<Schedule> {
  const { maxOptimizationIterations = 1000, onProgress } = options;

  const report = (phase: ProgressReport['phase'], percent: number, operation: string, stats?: ProgressReport['stats']) => {
    onProgress?.({ phase, percentComplete: percent, currentOperation: operation, stats });
  };

  report('initializing', 0, 'Validating input data');

  // Build lookup maps for efficiency
  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const teacherMap = new Map(input.teachers.map(t => [t.id, t]));
  const roomMap = new Map(input.rooms.map(r => [r.id, r]));
  const studentMap = new Map(input.students.map(s => [s.id, s]));

  report('initializing', 10, 'Creating sections');

  // Phase 1: Create sections with teachers
  const sections = createSections(input.courses, input.teachers, courseMap);

  report('assigning', 20, 'Assigning time slots to sections');

  // Phase 2: Assign time slots to sections
  assignTimeSlots(sections, input.teachers, input.config, teacherMap);

  report('assigning', 40, 'Assigning rooms to sections');

  // Phase 3: Assign rooms to sections
  assignRooms(sections, input.rooms, courseMap, input.config);

  report('assigning', 50, 'Assigning students to required courses');

  // Phase 4: Assign students to sections
  const unassigned: UnassignedStudent[] = [];

  // Track student schedules for conflict detection
  const studentSchedules = new Map<StudentId, Set<string>>(); // studentId -> Set of "day-slot"
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

      // Check grade restriction
      if (course.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        unassigned.push({
          studentId: student.id,
          courseId,
          reason: `Grade ${student.grade} not allowed for this course`
        });
        continue;
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
        `Assigned ${studentsAssigned}/${input.students.length} students to required courses`,
        { studentsAssigned });
    }
  }

  report('assigning', 75, 'Assigning students to electives');

  // Second pass: electives (in preference order)
  for (const student of input.students) {
    for (const courseId of student.electivePreferences) {
      const course = courseMap.get(courseId);
      if (!course) continue;

      // Check grade restriction
      if (course.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue;
      }

      // Try to assign (silently skip if not possible)
      assignStudentToSection(
        student.id,
        courseId,
        sections,
        studentSchedules,
        courseMap
      );
    }
  }

  report('optimizing', 80, 'Running optimization');

  // Phase 5: Optimization (balance section sizes)
  optimizeSections(sections, studentSchedules, courseMap, maxOptimizationIterations, (iter) => {
    if (iter % 100 === 0) {
      report('optimizing', 80 + (iter / maxOptimizationIterations) * 15,
        `Optimization iteration ${iter}/${maxOptimizationIterations}`);
    }
  });

  report('validating', 95, 'Finalizing schedule');

  const schedule: Schedule = {
    sections,
    unassignedStudents: unassigned,
    metadata: {
      generatedAt: new Date().toISOString(),
      algorithmVersion: '1.0.0',
      iterations: maxOptimizationIterations,
      score: calculateScore(sections, input),
      constraintsSatisfied: 0, // Will be filled by validator
      constraintsTotal: input.constraints.length + input.preferences.length,
      warnings: [],
    },
  };

  report('complete', 100, 'Schedule generation complete', {
    studentsAssigned: input.students.length,
    sectionsCreated: sections.length,
  });

  return schedule;
}

function createSections(
  courses: Course[],
  teachers: Teacher[],
  courseMap: Map<CourseId, Course>
): Section[] {
  const sections: Section[] = [];
  const teacherSectionCount = new Map<TeacherId, number>();

  for (const course of courses) {
    // Find qualified teachers
    const qualifiedTeachers = teachers.filter(t =>
      t.subjects.includes(course.id) &&
      (teacherSectionCount.get(t.id) || 0) < t.maxSections
    );

    for (let i = 0; i < course.sections; i++) {
      // Round-robin teacher assignment among qualified teachers
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
  // Track teacher schedules
  const teacherSchedules = new Map<TeacherId, Set<string>>();
  for (const teacher of teachers) {
    const unavailable = new Set<string>();
    for (const period of teacher.unavailable || []) {
      unavailable.add(`${period.day}-${period.slot}`);
    }
    teacherSchedules.set(teacher.id, unavailable);
  }

  // Group sections by course for same-course different-time assignment
  const sectionsByCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  // Assign one period per day for each section (for periodsPerWeek = 5)
  for (const [courseId, courseSections] of sectionsByCourse) {
    for (let sectionIdx = 0; sectionIdx < courseSections.length; sectionIdx++) {
      const section = courseSections[sectionIdx];
      const teacherId = section.teacherId;
      const teacherSchedule = teacherId ? teacherSchedules.get(teacherId) : null;

      // Try to find 5 different periods (one per day) that work
      for (let day = 0; day < config.daysPerWeek; day++) {
        // Start offset by section index to spread sections across periods
        for (let attempt = 0; attempt < config.periodsPerDay; attempt++) {
          const slot = (sectionIdx + attempt) % config.periodsPerDay;
          const key = `${day}-${slot}`;

          // Check if teacher is available
          if (teacherSchedule && teacherSchedule.has(key)) {
            continue;
          }

          // Assign this period
          section.periods.push({ day, slot });

          // Mark teacher as busy
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
  // Track room schedules
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

    // Find suitable rooms
    const suitableRooms = rooms.filter(r => {
      // Check capacity
      if (r.capacity < section.capacity) return false;
      // Check features
      return requiredFeatures.every(f => r.features.includes(f));
    });

    // Sort by capacity (prefer smaller suitable rooms)
    suitableRooms.sort((a, b) => a.capacity - b.capacity);

    // Try to find a room available for all section periods
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

  // Find sections for this course
  const courseSections = sections.filter(s => s.courseId === courseId);

  // Sort by enrollment to balance class sizes
  courseSections.sort((a, b) => a.enrolledStudents.length - b.enrolledStudents.length);

  for (const section of courseSections) {
    // Check capacity
    if (section.enrolledStudents.length >= section.capacity) {
      continue;
    }

    // Check for time conflicts
    const hasConflict = section.periods.some(p =>
      studentSchedule.has(`${p.day}-${p.slot}`)
    );

    if (hasConflict) {
      continue;
    }

    // Assign student
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
  maxIterations: number,
  onIteration?: (iter: number) => void
): void {
  // Group sections by course
  const sectionsByCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(section);
    sectionsByCourse.set(section.courseId, list);
  }

  // Try to balance section sizes within each course
  for (let iter = 0; iter < maxIterations; iter++) {
    onIteration?.(iter);
    let improved = false;

    for (const [courseId, courseSections] of sectionsByCourse) {
      if (courseSections.length < 2) continue;

      // Find most and least enrolled sections
      courseSections.sort((a, b) => a.enrolledStudents.length - b.enrolledStudents.length);
      const smallest = courseSections[0];
      const largest = courseSections[courseSections.length - 1];

      const diff = largest.enrolledStudents.length - smallest.enrolledStudents.length;
      if (diff <= 1) continue; // Already balanced

      // Try to move a student from largest to smallest
      for (const studentId of largest.enrolledStudents) {
        const studentSchedule = studentSchedules.get(studentId)!;

        // Remove student's periods from the largest section temporarily
        for (const period of largest.periods) {
          studentSchedule.delete(`${period.day}-${period.slot}`);
        }

        // Check if student can move to smallest section
        const hasConflict = smallest.periods.some(p =>
          studentSchedule.has(`${p.day}-${p.slot}`)
        );

        if (!hasConflict && smallest.enrolledStudents.length < smallest.capacity) {
          // Move the student
          largest.enrolledStudents = largest.enrolledStudents.filter(id => id !== studentId);
          smallest.enrolledStudents.push(studentId);
          for (const period of smallest.periods) {
            studentSchedule.add(`${period.day}-${period.slot}`);
          }
          improved = true;
          break;
        } else {
          // Restore the student's schedule
          for (const period of largest.periods) {
            studentSchedule.add(`${period.day}-${period.slot}`);
          }
        }
      }
    }

    if (!improved) break; // No more improvements possible
  }
}

function calculateScore(sections: Section[], input: ScheduleInput): number {
  let score = 100;

  // Deduct for empty sections
  const emptySections = sections.filter(s => s.enrolledStudents.length === 0);
  score -= emptySections.length * 5;

  // Deduct for unbalanced sections
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

  // Reward for sections without rooms (penalty)
  const noRoom = sections.filter(s => !s.roomId);
  score -= noRoom.length * 10;

  // Reward for sections without teachers (penalty)
  const noTeacher = sections.filter(s => !s.teacherId);
  score -= noTeacher.length * 10;

  return Math.max(0, Math.min(100, score));
}
