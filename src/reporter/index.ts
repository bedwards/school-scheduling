/**
 * Report Generator
 *
 * Generates human-readable and machine-readable schedule reports.
 */

import chalk from 'chalk';
import type {
  Schedule,
  ScheduleInput,
  ValidationResult,
  Section,
  Period,
  StudentId,
  CourseId,
} from '../types/index.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export interface ReportOptions {
  format: 'text' | 'json' | 'markdown';
  includeStudentSchedules?: boolean;
  includeTeacherSchedules?: boolean;
  includeRoomSchedules?: boolean;
  colorOutput?: boolean;
}

export function generateReport(
  schedule: Schedule,
  input: ScheduleInput,
  validation: ValidationResult,
  options: ReportOptions
): string {
  switch (options.format) {
    case 'json':
      return generateJsonReport(schedule, input, validation);
    case 'markdown':
      return generateMarkdownReport(schedule, input, validation, options);
    case 'text':
    default:
      return generateTextReport(schedule, input, validation, options);
  }
}

function generateJsonReport(
  schedule: Schedule,
  input: ScheduleInput,
  validation: ValidationResult
): string {
  const report = {
    metadata: schedule.metadata,
    validation: {
      valid: validation.valid,
      score: validation.score,
      hardViolations: validation.hardConstraintViolations.length,
      softViolations: validation.softConstraintViolations.length,
    },
    statistics: generateStatistics(schedule, input),
    sections: schedule.sections.map(s => ({
      id: s.id,
      course: s.courseId,
      teacher: s.teacherId,
      room: s.roomId,
      periods: s.periods,
      enrollment: s.enrolledStudents.length,
      capacity: s.capacity,
    })),
    unassignedStudents: schedule.unassignedStudents,
  };

  return JSON.stringify(report, null, 2);
}

function generateMarkdownReport(
  schedule: Schedule,
  input: ScheduleInput,
  validation: ValidationResult,
  options: ReportOptions
): string {
  const lines: string[] = [];

  // Header
  lines.push('# School Schedule Report');
  lines.push('');
  lines.push(`Generated: ${schedule.metadata.generatedAt}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Status | ${validation.valid ? 'Valid' : 'Invalid'} |`);
  lines.push(`| Score | ${validation.score}/100 |`);
  lines.push(`| Total Sections | ${schedule.sections.length} |`);
  lines.push(`| Total Students | ${input.students.length} |`);
  lines.push(`| Hard Violations | ${validation.hardConstraintViolations.length} |`);
  lines.push(`| Soft Violations | ${validation.softConstraintViolations.length} |`);
  lines.push('');

  // Constraint Violations
  if (validation.hardConstraintViolations.length > 0) {
    lines.push('## Hard Constraint Violations');
    lines.push('');
    for (const v of validation.hardConstraintViolations) {
      lines.push(`- **${v.constraintType}**: ${v.description}`);
    }
    lines.push('');
  }

  if (validation.softConstraintViolations.length > 0) {
    lines.push('## Soft Constraint Violations (Warnings)');
    lines.push('');
    for (const v of validation.softConstraintViolations) {
      lines.push(`- ${v.description}`);
    }
    lines.push('');
  }

  // Course Summary
  lines.push('## Courses');
  lines.push('');
  lines.push('| Course | Sections | Total Enrolled |');
  lines.push('|--------|----------|----------------|');

  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const byCourse = new Map<CourseId, Section[]>();
  for (const section of schedule.sections) {
    const list = byCourse.get(section.courseId) || [];
    list.push(section);
    byCourse.set(section.courseId, list);
  }

  for (const [courseId, sections] of byCourse) {
    const course = courseMap.get(courseId);
    const totalEnrolled = sections.reduce((sum, s) => sum + s.enrolledStudents.length, 0);
    lines.push(`| ${course?.name || courseId} | ${sections.length} | ${totalEnrolled} |`);
  }
  lines.push('');

  // Master Schedule Grid
  lines.push('## Master Schedule');
  lines.push('');
  lines.push(generateMasterScheduleMarkdown(schedule, input));

  // Individual schedules if requested
  if (options.includeTeacherSchedules) {
    lines.push('## Teacher Schedules');
    lines.push('');
    lines.push(generateTeacherSchedulesMarkdown(schedule, input));
  }

  return lines.join('\n');
}

function generateTextReport(
  schedule: Schedule,
  input: ScheduleInput,
  validation: ValidationResult,
  options: ReportOptions
): string {
  const lines: string[] = [];
  const c = options.colorOutput ? chalk : {
    bold: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    cyan: (s: string) => s,
    gray: (s: string) => s,
  };

  // Header
  lines.push(c.bold('═'.repeat(70)));
  lines.push(c.bold('                    SCHOOL SCHEDULE REPORT'));
  lines.push(c.bold('═'.repeat(70)));
  lines.push('');
  lines.push(`Generated: ${schedule.metadata.generatedAt}`);
  lines.push(`Algorithm: v${schedule.metadata.algorithmVersion}`);
  lines.push('');

  // Status
  const statusColor = validation.valid ? c.green : c.red;
  lines.push(c.bold('STATUS: ') + statusColor(validation.valid ? 'VALID' : 'INVALID'));
  lines.push(c.bold('SCORE:  ') + `${validation.score}/100`);
  lines.push('');

  // Statistics
  lines.push(c.bold('─'.repeat(70)));
  lines.push(c.bold('STATISTICS'));
  lines.push(c.bold('─'.repeat(70)));

  const stats = generateStatistics(schedule, input);
  lines.push(`  Total Sections:       ${stats.totalSections}`);
  lines.push(`  Total Students:       ${stats.totalStudents}`);
  lines.push(`  Total Enrollments:    ${stats.totalEnrollments}`);
  lines.push(`  Avg Class Size:       ${stats.avgClassSize.toFixed(1)}`);
  lines.push(`  Unassigned Students:  ${stats.unassignedCount}`);
  lines.push(`  Sections w/o Room:    ${stats.sectionsWithoutRoom}`);
  lines.push(`  Sections w/o Teacher: ${stats.sectionsWithoutTeacher}`);
  lines.push('');

  // Constraint Summary
  lines.push(c.bold('─'.repeat(70)));
  lines.push(c.bold('CONSTRAINT SUMMARY'));
  lines.push(c.bold('─'.repeat(70)));
  lines.push(`  Hard Violations:  ${c.red(String(validation.hardConstraintViolations.length))}`);
  lines.push(`  Soft Violations:  ${c.yellow(String(validation.softConstraintViolations.length))}`);
  lines.push('');

  // Detail violations
  if (validation.hardConstraintViolations.length > 0) {
    lines.push(c.red('  HARD CONSTRAINT VIOLATIONS:'));
    for (const v of validation.hardConstraintViolations.slice(0, 10)) {
      lines.push(c.red(`    • ${v.description}`));
    }
    if (validation.hardConstraintViolations.length > 10) {
      lines.push(c.red(`    ... and ${validation.hardConstraintViolations.length - 10} more`));
    }
    lines.push('');
  }

  if (validation.softConstraintViolations.length > 0) {
    lines.push(c.yellow('  SOFT CONSTRAINT WARNINGS:'));
    for (const v of validation.softConstraintViolations) {
      lines.push(c.yellow(`    • ${v.description}`));
    }
    lines.push('');
  }

  // Course Summary
  lines.push(c.bold('─'.repeat(70)));
  lines.push(c.bold('COURSE ENROLLMENT SUMMARY'));
  lines.push(c.bold('─'.repeat(70)));

  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const byCourse = new Map<CourseId, Section[]>();
  for (const section of schedule.sections) {
    const list = byCourse.get(section.courseId) || [];
    list.push(section);
    byCourse.set(section.courseId, list);
  }

  lines.push('');
  lines.push('  ' + 'Course'.padEnd(25) + 'Sections'.padEnd(10) + 'Enrolled'.padEnd(10) + 'Sizes');
  lines.push('  ' + '─'.repeat(60));

  for (const [courseId, sections] of byCourse) {
    const course = courseMap.get(courseId);
    const totalEnrolled = sections.reduce((sum, s) => sum + s.enrolledStudents.length, 0);
    const sizes = sections.map(s => s.enrolledStudents.length).join(', ');
    const name = (course?.name || courseId).substring(0, 24);
    lines.push(`  ${name.padEnd(25)}${String(sections.length).padEnd(10)}${String(totalEnrolled).padEnd(10)}[${sizes}]`);
  }
  lines.push('');

  // Master Schedule
  lines.push(c.bold('─'.repeat(70)));
  lines.push(c.bold('MASTER SCHEDULE GRID'));
  lines.push(c.bold('─'.repeat(70)));
  lines.push('');
  lines.push(generateMasterScheduleText(schedule, input, options.colorOutput));
  lines.push('');

  // Footer
  lines.push(c.bold('═'.repeat(70)));

  return lines.join('\n');
}

function generateStatistics(schedule: Schedule, input: ScheduleInput) {
  const totalEnrollments = schedule.sections.reduce(
    (sum, s) => sum + s.enrolledStudents.length, 0
  );
  const nonEmptySections = schedule.sections.filter(s => s.enrolledStudents.length > 0);

  return {
    totalSections: schedule.sections.length,
    totalStudents: input.students.length,
    totalEnrollments,
    avgClassSize: nonEmptySections.length > 0
      ? totalEnrollments / nonEmptySections.length
      : 0,
    unassignedCount: schedule.unassignedStudents.length,
    sectionsWithoutRoom: schedule.sections.filter(s => !s.roomId).length,
    sectionsWithoutTeacher: schedule.sections.filter(s => !s.teacherId).length,
  };
}

function generateMasterScheduleText(
  schedule: Schedule,
  input: ScheduleInput,
  colorOutput?: boolean
): string {
  const lines: string[] = [];
  const config = input.config;
  const courseMap = new Map(input.courses.map(c => [c.id, c]));

  // Build schedule grid
  const grid: Map<string, Section[]> = new Map();
  for (const section of schedule.sections) {
    for (const period of section.periods) {
      const key = `${period.day}-${period.slot}`;
      const list = grid.get(key) || [];
      list.push(section);
      grid.set(key, list);
    }
  }

  // Header
  const colWidth = 12;
  let header = '  Period │';
  for (let d = 0; d < config.daysPerWeek; d++) {
    header += ` ${DAYS[d].substring(0, colWidth - 1).padEnd(colWidth)}│`;
  }
  lines.push(header);
  lines.push('  ' + '─'.repeat(8) + '┼' + ('─'.repeat(colWidth + 1) + '┼').repeat(config.daysPerWeek - 1) + '─'.repeat(colWidth + 1) + '│');

  // Rows
  for (let slot = 0; slot < config.periodsPerDay; slot++) {
    let row = `  ${String(slot + 1).padStart(6)} │`;
    for (let day = 0; day < config.daysPerWeek; day++) {
      const key = `${day}-${slot}`;
      const sections = grid.get(key) || [];

      if (sections.length === 0) {
        row += ' '.repeat(colWidth + 1) + '│';
      } else if (sections.length === 1) {
        const s = sections[0];
        const name = courseMap.get(s.courseId)?.name || s.courseId;
        row += ` ${name.substring(0, colWidth - 1).padEnd(colWidth)}│`;
      } else {
        row += ` (${sections.length} classes)`.padEnd(colWidth + 1) + '│';
      }
    }
    lines.push(row);
  }

  return lines.join('\n');
}

function generateMasterScheduleMarkdown(schedule: Schedule, input: ScheduleInput): string {
  const lines: string[] = [];
  const config = input.config;
  const courseMap = new Map(input.courses.map(c => [c.id, c]));

  // Build schedule grid
  const grid: Map<string, Section[]> = new Map();
  for (const section of schedule.sections) {
    for (const period of section.periods) {
      const key = `${period.day}-${period.slot}`;
      const list = grid.get(key) || [];
      list.push(section);
      grid.set(key, list);
    }
  }

  // Header
  let header = '| Period |';
  let divider = '|--------|';
  for (let d = 0; d < config.daysPerWeek; d++) {
    header += ` ${DAYS[d]} |`;
    divider += '------|';
  }
  lines.push(header);
  lines.push(divider);

  // Rows
  for (let slot = 0; slot < config.periodsPerDay; slot++) {
    let row = `| ${slot + 1} |`;
    for (let day = 0; day < config.daysPerWeek; day++) {
      const key = `${day}-${slot}`;
      const sections = grid.get(key) || [];

      if (sections.length === 0) {
        row += ' - |';
      } else if (sections.length <= 2) {
        const names = sections.map(s => courseMap.get(s.courseId)?.name || s.courseId);
        row += ` ${names.join(', ')} |`;
      } else {
        row += ` ${sections.length} classes |`;
      }
    }
    lines.push(row);
  }

  return lines.join('\n');
}

function generateTeacherSchedulesMarkdown(schedule: Schedule, input: ScheduleInput): string {
  const lines: string[] = [];
  const config = input.config;
  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const teacherMap = new Map(input.teachers.map(t => [t.id, t]));

  // Group sections by teacher
  const byTeacher = new Map<string, Section[]>();
  for (const section of schedule.sections) {
    if (!section.teacherId) continue;
    const list = byTeacher.get(section.teacherId) || [];
    list.push(section);
    byTeacher.set(section.teacherId, list);
  }

  for (const [teacherId, sections] of byTeacher) {
    const teacher = teacherMap.get(teacherId);
    lines.push(`### ${teacher?.name || teacherId}`);
    lines.push('');

    // Build grid for this teacher
    const grid: Map<string, Section> = new Map();
    for (const section of sections) {
      for (const period of section.periods) {
        grid.set(`${period.day}-${period.slot}`, section);
      }
    }

    let header = '| Period |';
    let divider = '|--------|';
    for (let d = 0; d < config.daysPerWeek; d++) {
      header += ` ${DAYS[d].substring(0, 3)} |`;
      divider += '-----|';
    }
    lines.push(header);
    lines.push(divider);

    for (let slot = 0; slot < config.periodsPerDay; slot++) {
      let row = `| ${slot + 1} |`;
      for (let day = 0; day < config.daysPerWeek; day++) {
        const section = grid.get(`${day}-${slot}`);
        if (section) {
          const course = courseMap.get(section.courseId);
          row += ` ${course?.name?.substring(0, 10) || section.id} |`;
        } else {
          row += ' - |';
        }
      }
      lines.push(row);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function generateStudentSchedule(
  studentId: StudentId,
  schedule: Schedule,
  input: ScheduleInput
): string {
  const lines: string[] = [];
  const config = input.config;
  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const student = input.students.find(s => s.id === studentId);

  if (!student) {
    return `Student ${studentId} not found`;
  }

  lines.push(`Schedule for: ${student.name} (Grade ${student.grade})`);
  lines.push('═'.repeat(60));

  // Find all sections for this student
  const studentSections = schedule.sections.filter(s =>
    s.enrolledStudents.includes(studentId)
  );

  // Build grid
  const grid: Map<string, Section> = new Map();
  for (const section of studentSections) {
    for (const period of section.periods) {
      grid.set(`${period.day}-${period.slot}`, section);
    }
  }

  // Header
  let header = 'Period │';
  for (let d = 0; d < config.daysPerWeek; d++) {
    header += ` ${DAYS[d].substring(0, 10).padEnd(12)}│`;
  }
  lines.push(header);
  lines.push('─'.repeat(7) + '┼' + ('─'.repeat(13) + '┼').repeat(config.daysPerWeek - 1) + '─'.repeat(13) + '│');

  for (let slot = 0; slot < config.periodsPerDay; slot++) {
    let row = `  ${String(slot + 1).padStart(4)} │`;
    for (let day = 0; day < config.daysPerWeek; day++) {
      const section = grid.get(`${day}-${slot}`);
      if (section) {
        const course = courseMap.get(section.courseId);
        row += ` ${(course?.name || section.courseId).substring(0, 11).padEnd(12)}│`;
      } else {
        row += ' '.repeat(13) + '│';
      }
    }
    lines.push(row);
  }

  return lines.join('\n');
}
