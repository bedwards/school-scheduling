/**
 * Data loader for schedule input files
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type {
  Student,
  Teacher,
  Room,
  Course,
  ScheduleConstraint,
  SchedulePreference,
  ScheduleConfig,
  ScheduleInput,
  ConstraintType,
  PreferenceType,
} from '../types/index.js';

export interface DataPaths {
  students: string;
  teachers: string;
  rooms: string;
  courses: string;
  constraints: string;
}

export async function loadScheduleInput(paths: DataPaths): Promise<ScheduleInput> {
  // Validate all files exist
  for (const [key, path] of Object.entries(paths)) {
    if (!existsSync(path)) {
      throw new Error(`File not found: ${path} (${key})`);
    }
  }

  const [studentsData, teachersData, roomsData, coursesData, constraintsText] = await Promise.all([
    readFile(paths.students, 'utf-8').then(JSON.parse),
    readFile(paths.teachers, 'utf-8').then(JSON.parse),
    readFile(paths.rooms, 'utf-8').then(JSON.parse),
    readFile(paths.courses, 'utf-8').then(JSON.parse),
    readFile(paths.constraints, 'utf-8'),
  ]);

  const { constraints, preferences, config } = parseConstraintsFile(constraintsText);

  return {
    students: studentsData.students as Student[],
    teachers: teachersData.teachers as Teacher[],
    rooms: roomsData.rooms as Room[],
    courses: coursesData.courses as Course[],
    constraints,
    preferences,
    config,
  };
}

interface ParsedConstraints {
  constraints: ScheduleConstraint[];
  preferences: SchedulePreference[];
  config: ScheduleConfig;
}

function parseConstraintsFile(text: string): ParsedConstraints {
  const lines = text.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#');
  });

  const constraints: ScheduleConstraint[] = [];
  const preferences: SchedulePreference[] = [];
  const config: ScheduleConfig = {
    periodsPerDay: 8,
    daysPerWeek: 5,
  };

  const configExtras: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('HARD:')) {
      const constraint = parseHardConstraint(trimmed);
      if (constraint) constraints.push(constraint);
    } else if (trimmed.startsWith('SOFT:')) {
      const preference = parseSoftConstraint(trimmed);
      if (preference) preferences.push(preference);
    } else if (trimmed.startsWith('CONFIG:')) {
      const [, rest] = trimmed.split('CONFIG:');
      const [key, value] = rest.split('=').map(s => s.trim());
      if (key === 'PERIODS_PER_DAY') {
        config.periodsPerDay = parseInt(value, 10);
      } else if (key === 'DAYS_PER_WEEK') {
        config.daysPerWeek = parseInt(value, 10);
      } else {
        configExtras[key] = value;
      }
    }
    // GOAL lines are informational, not parsed into constraints
  }

  return { constraints, preferences, config };
}

function parseHardConstraint(line: string): ScheduleConstraint | null {
  const [, rest] = line.split('HARD:');
  const parts = rest.split('|').map(s => s.trim());
  if (parts.length < 2) return null;

  const [name, description] = parts;
  const constraintType = nameToConstraintType(name);

  return {
    id: `hard-${name.toLowerCase().replace(/_/g, '-')}`,
    type: constraintType,
    description,
    params: {},
    priority: 'hard',
  };
}

function parseSoftConstraint(line: string): SchedulePreference | null {
  const [, rest] = line.split('SOFT:');
  const parts = rest.split('|').map(s => s.trim());
  if (parts.length < 2) return null;

  const [name, description, ...extras] = parts;
  let weight = 0.5;

  for (const extra of extras) {
    if (extra.startsWith('weight=')) {
      weight = parseFloat(extra.split('=')[1]);
    }
  }

  const prefType = nameToPreferenceType(name);

  return {
    id: `soft-${name.toLowerCase().replace(/_/g, '-')}`,
    type: prefType,
    description,
    params: {},
    weight,
  };
}

function nameToConstraintType(name: string): ConstraintType {
  const mapping: Record<string, ConstraintType> = {
    'NO_TEACHER_CONFLICT': 'no_teacher_conflict',
    'NO_STUDENT_CONFLICT': 'no_student_conflict',
    'NO_ROOM_CONFLICT': 'no_room_conflict',
    'ROOM_CAPACITY': 'room_capacity',
    'TEACHER_QUALIFIED': 'same_teacher_same_course',
    'TEACHER_AVAILABILITY': 'teacher_availability',
    'ROOM_FEATURES': 'custom',
    'GRADE_RESTRICTION': 'custom',
    'TEACHER_MAX_SECTIONS': 'custom',
  };
  return mapping[name] || 'custom';
}

function nameToPreferenceType(name: string): PreferenceType {
  const mapping: Record<string, PreferenceType> = {
    'BALANCED_SECTIONS': 'balanced_class_sizes',
    'STUDENT_ELECTIVE_PREFERENCE': 'student_elective_preference',
    'MINIMIZE_GAPS': 'compact_schedule',
    'TEACHER_PREFERENCES': 'teacher_period_preference',
    'LUNCH_AVAILABILITY': 'custom',
  };
  return mapping[name] || 'custom';
}
