/**
 * Schedule Validator
 *
 * Validates generated schedules against all hard and soft constraints.
 * Returns a detailed report of violations and overall score.
 */

import type {
  Schedule,
  ScheduleInput,
  ValidationResult,
  ConstraintViolation,
  Section,
  Period,
  StudentId,
  TeacherId,
  RoomId,
  CourseId,
} from '../types/index.js';

export function validateSchedule(
  schedule: Schedule,
  input: ScheduleInput
): ValidationResult {
  const hardViolations: ConstraintViolation[] = [];
  const softViolations: ConstraintViolation[] = [];

  // Build lookup maps
  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const teacherMap = new Map(input.teachers.map(t => [t.id, t]));
  const roomMap = new Map(input.rooms.map(r => [r.id, r]));
  const studentMap = new Map(input.students.map(s => [s.id, s]));

  // =========================================================================
  // HARD CONSTRAINT CHECKS
  // =========================================================================

  // 1. No teacher conflicts
  const teacherConflicts = checkTeacherConflicts(schedule.sections);
  hardViolations.push(...teacherConflicts);

  // 2. No student conflicts
  const studentConflicts = checkStudentConflicts(schedule.sections);
  hardViolations.push(...studentConflicts);

  // 3. No room conflicts
  const roomConflicts = checkRoomConflicts(schedule.sections);
  hardViolations.push(...roomConflicts);

  // 4. Room capacity
  const capacityViolations = checkRoomCapacity(schedule.sections, roomMap);
  hardViolations.push(...capacityViolations);

  // 5. Teacher availability
  const availabilityViolations = checkTeacherAvailability(schedule.sections, teacherMap);
  hardViolations.push(...availabilityViolations);

  // 6. Room features
  const featureViolations = checkRoomFeatures(schedule.sections, courseMap, roomMap);
  hardViolations.push(...featureViolations);

  // 7. Grade restrictions
  const gradeViolations = checkGradeRestrictions(schedule.sections, courseMap, studentMap);
  hardViolations.push(...gradeViolations);

  // 8. Teacher qualifications
  const qualificationViolations = checkTeacherQualifications(schedule.sections, teacherMap);
  hardViolations.push(...qualificationViolations);

  // =========================================================================
  // SOFT CONSTRAINT CHECKS
  // =========================================================================

  // 1. Balanced section sizes
  const balanceViolations = checkBalancedSections(schedule.sections);
  softViolations.push(...balanceViolations);

  // 2. Student elective preferences
  const preferenceViolations = checkElectivePreferences(schedule.sections, input.students);
  softViolations.push(...preferenceViolations);

  // 3. Check for students missing required courses
  const missingRequiredViolations = checkMissingRequiredCourses(schedule, input.students);
  softViolations.push(...missingRequiredViolations);

  // Calculate score
  const hardPenalty = hardViolations.length * 20;
  const softPenalty = softViolations.reduce((sum, v) => {
    return sum + (v.severity === 'warning' ? 2 : 5);
  }, 0);

  const score = Math.max(0, 100 - hardPenalty - softPenalty);

  // Generate summary
  const summary = generateSummary(schedule, hardViolations, softViolations, input);

  return {
    valid: hardViolations.length === 0,
    hardConstraintViolations: hardViolations,
    softConstraintViolations: softViolations,
    score,
    summary,
  };
}

function checkTeacherConflicts(sections: Section[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const teacherSchedule = new Map<TeacherId, Map<string, SectionInfo[]>>();

  interface SectionInfo {
    sectionId: string;
    courseId: string;
  }

  for (const section of sections) {
    if (!section.teacherId) continue;

    if (!teacherSchedule.has(section.teacherId)) {
      teacherSchedule.set(section.teacherId, new Map());
    }
    const schedule = teacherSchedule.get(section.teacherId)!;

    for (const period of section.periods) {
      const key = `${period.day}-${period.slot}`;
      if (!schedule.has(key)) {
        schedule.set(key, []);
      }
      schedule.get(key)!.push({ sectionId: section.id, courseId: section.courseId });
    }
  }

  for (const [teacherId, schedule] of teacherSchedule) {
    for (const [periodKey, sectionInfos] of schedule) {
      if (sectionInfos.length > 1) {
        const [day, slot] = periodKey.split('-').map(Number);
        violations.push({
          constraintId: 'no_teacher_conflict',
          constraintType: 'no_teacher_conflict',
          description: `Teacher ${teacherId} has ${sectionInfos.length} sections at day ${day}, period ${slot}`,
          severity: 'error',
          entities: {
            teachers: [teacherId],
            sections: sectionInfos.map(s => s.sectionId),
            periods: [{ day, slot }],
          },
        });
      }
    }
  }

  return violations;
}

function checkStudentConflicts(sections: Section[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const studentSchedule = new Map<StudentId, Map<string, string[]>>();

  for (const section of sections) {
    for (const studentId of section.enrolledStudents) {
      if (!studentSchedule.has(studentId)) {
        studentSchedule.set(studentId, new Map());
      }
      const schedule = studentSchedule.get(studentId)!;

      for (const period of section.periods) {
        const key = `${period.day}-${period.slot}`;
        if (!schedule.has(key)) {
          schedule.set(key, []);
        }
        schedule.get(key)!.push(section.id);
      }
    }
  }

  for (const [studentId, schedule] of studentSchedule) {
    for (const [periodKey, sectionIds] of schedule) {
      if (sectionIds.length > 1) {
        const [day, slot] = periodKey.split('-').map(Number);
        violations.push({
          constraintId: 'no_student_conflict',
          constraintType: 'no_student_conflict',
          description: `Student ${studentId} has ${sectionIds.length} classes at day ${day}, period ${slot}`,
          severity: 'error',
          entities: {
            students: [studentId],
            sections: sectionIds,
            periods: [{ day, slot }],
          },
        });
      }
    }
  }

  return violations;
}

function checkRoomConflicts(sections: Section[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const roomSchedule = new Map<RoomId, Map<string, string[]>>();

  for (const section of sections) {
    if (!section.roomId) continue;

    if (!roomSchedule.has(section.roomId)) {
      roomSchedule.set(section.roomId, new Map());
    }
    const schedule = roomSchedule.get(section.roomId)!;

    for (const period of section.periods) {
      const key = `${period.day}-${period.slot}`;
      if (!schedule.has(key)) {
        schedule.set(key, []);
      }
      schedule.get(key)!.push(section.id);
    }
  }

  for (const [roomId, schedule] of roomSchedule) {
    for (const [periodKey, sectionIds] of schedule) {
      if (sectionIds.length > 1) {
        const [day, slot] = periodKey.split('-').map(Number);
        violations.push({
          constraintId: 'no_room_conflict',
          constraintType: 'no_room_conflict',
          description: `Room ${roomId} has ${sectionIds.length} sections at day ${day}, period ${slot}`,
          severity: 'error',
          entities: {
            rooms: [roomId],
            sections: sectionIds,
            periods: [{ day, slot }],
          },
        });
      }
    }
  }

  return violations;
}

function checkRoomCapacity(
  sections: Section[],
  roomMap: Map<RoomId, { capacity: number }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const section of sections) {
    if (!section.roomId) continue;

    const room = roomMap.get(section.roomId);
    if (!room) continue;

    if (section.enrolledStudents.length > room.capacity) {
      violations.push({
        constraintId: 'room_capacity',
        constraintType: 'room_capacity',
        description: `Section ${section.id} has ${section.enrolledStudents.length} students but room ${section.roomId} capacity is ${room.capacity}`,
        severity: 'error',
        entities: {
          sections: [section.id],
          rooms: [section.roomId],
        },
      });
    }
  }

  return violations;
}

function checkTeacherAvailability(
  sections: Section[],
  teacherMap: Map<TeacherId, { unavailable?: Period[] }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const section of sections) {
    if (!section.teacherId) continue;

    const teacher = teacherMap.get(section.teacherId);
    if (!teacher?.unavailable) continue;

    for (const period of section.periods) {
      const isUnavailable = teacher.unavailable.some(
        u => u.day === period.day && u.slot === period.slot
      );

      if (isUnavailable) {
        violations.push({
          constraintId: 'teacher_availability',
          constraintType: 'teacher_availability',
          description: `Teacher ${section.teacherId} is unavailable at day ${period.day}, period ${period.slot} but assigned to ${section.id}`,
          severity: 'error',
          entities: {
            teachers: [section.teacherId],
            sections: [section.id],
            periods: [period],
          },
        });
      }
    }
  }

  return violations;
}

function checkRoomFeatures(
  sections: Section[],
  courseMap: Map<CourseId, { requiredFeatures?: string[] }>,
  roomMap: Map<RoomId, { features: string[] }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const section of sections) {
    if (!section.roomId) continue;

    const course = courseMap.get(section.courseId);
    if (!course?.requiredFeatures?.length) continue;

    const room = roomMap.get(section.roomId);
    if (!room) continue;

    const missingFeatures = course.requiredFeatures.filter(
      f => !room.features.includes(f)
    );

    if (missingFeatures.length > 0) {
      violations.push({
        constraintId: 'room_features',
        constraintType: 'custom',
        description: `Section ${section.id} needs features [${missingFeatures.join(', ')}] but room ${section.roomId} lacks them`,
        severity: 'error',
        entities: {
          sections: [section.id],
          rooms: [section.roomId],
        },
      });
    }
  }

  return violations;
}

function checkGradeRestrictions(
  sections: Section[],
  courseMap: Map<CourseId, { gradeRestrictions?: number[] }>,
  studentMap: Map<StudentId, { grade: number }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const section of sections) {
    const course = courseMap.get(section.courseId);
    if (!course?.gradeRestrictions) continue;

    const invalidStudents = section.enrolledStudents.filter(studentId => {
      const student = studentMap.get(studentId);
      return student && !course.gradeRestrictions!.includes(student.grade);
    });

    if (invalidStudents.length > 0) {
      violations.push({
        constraintId: 'grade_restriction',
        constraintType: 'custom',
        description: `Section ${section.id} has ${invalidStudents.length} students from invalid grades`,
        severity: 'error',
        entities: {
          sections: [section.id],
          students: invalidStudents,
        },
      });
    }
  }

  return violations;
}

function checkTeacherQualifications(
  sections: Section[],
  teacherMap: Map<TeacherId, { subjects: CourseId[] }>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const section of sections) {
    if (!section.teacherId) continue;

    const teacher = teacherMap.get(section.teacherId);
    if (!teacher) continue;

    if (!teacher.subjects.includes(section.courseId)) {
      violations.push({
        constraintId: 'teacher_qualified',
        constraintType: 'same_teacher_same_course',
        description: `Teacher ${section.teacherId} is not qualified to teach ${section.courseId}`,
        severity: 'error',
        entities: {
          teachers: [section.teacherId],
          sections: [section.id],
        },
      });
    }
  }

  return violations;
}

function checkBalancedSections(sections: Section[]): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Group by course
  const byCourse = new Map<CourseId, Section[]>();
  for (const section of sections) {
    const list = byCourse.get(section.courseId) || [];
    list.push(section);
    byCourse.set(section.courseId, list);
  }

  for (const [courseId, courseSections] of byCourse) {
    if (courseSections.length < 2) continue;

    const sizes = courseSections.map(s => s.enrolledStudents.length);
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    const diff = max - min;

    if (diff > 5) {
      violations.push({
        constraintId: 'balanced_sections',
        constraintType: 'balanced_class_sizes',
        description: `Course ${courseId} has unbalanced sections (${min}-${max} students, diff=${diff})`,
        severity: 'warning',
        entities: {
          sections: courseSections.map(s => s.id),
        },
      });
    }
  }

  return violations;
}

function checkElectivePreferences(
  sections: Section[],
  students: { id: StudentId; electivePreferences: CourseId[] }[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Build enrollment lookup
  const studentEnrollments = new Map<StudentId, Set<CourseId>>();
  for (const section of sections) {
    for (const studentId of section.enrolledStudents) {
      if (!studentEnrollments.has(studentId)) {
        studentEnrollments.set(studentId, new Set());
      }
      studentEnrollments.get(studentId)!.add(section.courseId);
    }
  }

  let studentsWithNoElectives = 0;

  for (const student of students) {
    if (student.electivePreferences.length === 0) continue;

    const enrolled = studentEnrollments.get(student.id) || new Set();
    const hasElective = student.electivePreferences.some(e => enrolled.has(e));

    if (!hasElective) {
      studentsWithNoElectives++;
    }
  }

  if (studentsWithNoElectives > 0) {
    violations.push({
      constraintId: 'student_elective_preference',
      constraintType: 'student_elective_preference',
      description: `${studentsWithNoElectives} students did not receive any of their elective preferences`,
      severity: 'warning',
      entities: {},
    });
  }

  return violations;
}

function checkMissingRequiredCourses(
  schedule: Schedule,
  students: { id: StudentId; requiredCourses: CourseId[] }[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Build enrollment lookup
  const studentEnrollments = new Map<StudentId, Set<CourseId>>();
  for (const section of schedule.sections) {
    for (const studentId of section.enrolledStudents) {
      if (!studentEnrollments.has(studentId)) {
        studentEnrollments.set(studentId, new Set());
      }
      studentEnrollments.get(studentId)!.add(section.courseId);
    }
  }

  let totalMissing = 0;
  const studentsWithMissing: StudentId[] = [];

  for (const student of students) {
    const enrolled = studentEnrollments.get(student.id) || new Set();
    const missing = student.requiredCourses.filter(c => !enrolled.has(c));

    if (missing.length > 0) {
      totalMissing += missing.length;
      studentsWithMissing.push(student.id);
    }
  }

  if (totalMissing > 0) {
    violations.push({
      constraintId: 'required_courses',
      constraintType: 'custom',
      description: `${studentsWithMissing.length} students are missing ${totalMissing} required course enrollments`,
      severity: 'warning',
      entities: {
        students: studentsWithMissing.slice(0, 10), // Limit for readability
      },
    });
  }

  return violations;
}

function generateSummary(
  schedule: Schedule,
  hardViolations: ConstraintViolation[],
  softViolations: ConstraintViolation[],
  input: ScheduleInput
): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('SCHEDULE VALIDATION SUMMARY');
  lines.push('='.repeat(60));
  lines.push('');

  // Overall status
  if (hardViolations.length === 0) {
    lines.push('STATUS: VALID (all hard constraints satisfied)');
  } else {
    lines.push(`STATUS: INVALID (${hardViolations.length} hard constraint violations)`);
  }
  lines.push('');

  // Statistics
  lines.push('STATISTICS:');
  lines.push(`  Total sections: ${schedule.sections.length}`);
  lines.push(`  Total students: ${input.students.length}`);

  const totalEnrollments = schedule.sections.reduce(
    (sum, s) => sum + s.enrolledStudents.length, 0
  );
  lines.push(`  Total enrollments: ${totalEnrollments}`);
  lines.push(`  Unassigned students: ${schedule.unassignedStudents.length}`);
  lines.push('');

  // Constraint summary
  lines.push('CONSTRAINTS:');
  lines.push(`  Hard violations: ${hardViolations.length}`);
  lines.push(`  Soft violations: ${softViolations.length}`);
  lines.push('');

  // Hard violations detail
  if (hardViolations.length > 0) {
    lines.push('HARD CONSTRAINT VIOLATIONS:');
    for (const v of hardViolations.slice(0, 10)) {
      lines.push(`  - ${v.description}`);
    }
    if (hardViolations.length > 10) {
      lines.push(`  ... and ${hardViolations.length - 10} more`);
    }
    lines.push('');
  }

  // Soft violations detail
  if (softViolations.length > 0) {
    lines.push('SOFT CONSTRAINT VIOLATIONS (warnings):');
    for (const v of softViolations) {
      lines.push(`  - ${v.description}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}
