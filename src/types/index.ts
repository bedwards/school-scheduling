/**
 * Core domain types for school scheduling
 */

// Unique identifiers
export type StudentId = string;
export type CourseId = string;
export type TeacherId = string;
export type RoomId = string;
export type SectionId = string;

// Time representation
export interface Period {
  day: number;      // 0-4 for Mon-Fri typically
  slot: number;     // Period within day (e.g., 0-7 for 8 periods)
}

export interface TimeSlot {
  period: Period;
  duration: number; // In periods (usually 1)
}

// Core entities
export interface Student {
  id: StudentId;
  name: string;
  grade: number;
  requiredCourses: CourseId[];
  electivePreferences: CourseId[]; // Ordered by preference
  constraints?: StudentConstraint[];
}

export interface StudentConstraint {
  type: 'unavailable' | 'prefer' | 'avoid';
  periods?: Period[];
  reason?: string;
}

export interface Teacher {
  id: TeacherId;
  name: string;
  subjects: CourseId[];
  maxSections: number;
  unavailable?: Period[];
  preferences?: TeacherPreference[];
}

export interface TeacherPreference {
  type: 'prefer' | 'avoid';
  periods: Period[];
  weight: number; // 0-1, higher is stronger preference
}

export interface Room {
  id: RoomId;
  name: string;
  capacity: number;
  features: string[]; // e.g., 'lab', 'computers', 'art-supplies'
  unavailable?: Period[];
}

export interface Course {
  id: CourseId;
  name: string;
  requiredFeatures?: string[];
  minStudents?: number;
  maxStudents: number;
  periodsPerWeek: number;
  gradeRestrictions?: number[]; // Which grades can take this course
  prerequisites?: CourseId[];
  corequisites?: CourseId[];    // Must be taken same semester
  sections: number;             // Number of sections to offer
}

export interface Section {
  id: SectionId;
  courseId: CourseId;
  teacherId?: TeacherId;
  roomId?: RoomId;
  periods: Period[];
  enrolledStudents: StudentId[];
  capacity: number;
}

// Scheduling input/output
export interface ScheduleInput {
  students: Student[];
  teachers: Teacher[];
  rooms: Room[];
  courses: Course[];
  constraints: ScheduleConstraint[];
  preferences: SchedulePreference[];
  config: ScheduleConfig;
}

export interface ScheduleConfig {
  periodsPerDay: number;
  daysPerWeek: number;
  maxStudentsPerSection?: number;
  allowConcurrentSections?: boolean;
}

export interface ScheduleConstraint {
  id: string;
  type: ConstraintType;
  description: string;
  params: Record<string, unknown>;
  priority: 'hard' | 'soft';
  weight?: number; // For soft constraints, 0-1
}

export type ConstraintType =
  | 'no_teacher_conflict'
  | 'no_student_conflict'
  | 'no_room_conflict'
  | 'room_capacity'
  | 'teacher_availability'
  | 'student_availability'
  | 'consecutive_periods'
  | 'max_periods_per_day'
  | 'min_periods_between'
  | 'same_teacher_same_course'
  | 'grade_separation'
  | 'lunch_period'
  | 'custom';

export interface SchedulePreference {
  id: string;
  type: PreferenceType;
  description: string;
  params: Record<string, unknown>;
  weight: number; // 0-1, importance
}

export type PreferenceType =
  | 'balanced_class_sizes'
  | 'teacher_period_preference'
  | 'minimize_room_changes'
  | 'student_elective_preference'
  | 'compact_schedule'
  | 'custom';

// Schedule output
export interface Schedule {
  sections: Section[];
  unassignedStudents: UnassignedStudent[];
  metadata: ScheduleMetadata;
}

export interface UnassignedStudent {
  studentId: StudentId;
  courseId: CourseId;
  reason: string;
}

export interface ScheduleMetadata {
  generatedAt: string;
  algorithmVersion: string;
  iterations: number;
  score: number;
  constraintsSatisfied: number;
  constraintsTotal: number;
  warnings: string[];
}

// Validation results
export interface ValidationResult {
  valid: boolean;
  hardConstraintViolations: ConstraintViolation[];
  softConstraintViolations: ConstraintViolation[];
  score: number;
  summary: string;
}

export interface ConstraintViolation {
  constraintId: string;
  constraintType: ConstraintType | PreferenceType;
  description: string;
  severity: 'error' | 'warning';
  entities: {
    students?: StudentId[];
    teachers?: TeacherId[];
    rooms?: RoomId[];
    sections?: SectionId[];
    periods?: Period[];
  };
}

// Progress reporting
export interface ProgressCallback {
  (progress: ProgressReport): void;
}

export interface ProgressReport {
  phase: 'initializing' | 'assigning' | 'optimizing' | 'validating' | 'complete';
  percentComplete: number;
  currentOperation: string;
  stats?: {
    studentsAssigned?: number;
    sectionsCreated?: number;
    constraintsSatisfied?: number;
    currentScore?: number;
  };
}
