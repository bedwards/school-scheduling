/**
 * Shared types for the School Scheduler Web App
 * Used by both API (Workers) and Frontend (React)
 */

// ============================================================================
// ID Types
// ============================================================================

export type UserId = string;
export type SchoolId = string;
export type StudentId = string;
export type TeacherId = string;
export type CourseId = string;
export type RoomId = string;
export type SectionId = string;
export type ScheduleId = string;

// ============================================================================
// Authentication
// ============================================================================

export interface User {
  id: UserId;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'readonly';
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

// ============================================================================
// Core Domain Types
// ============================================================================

export interface Period {
  day: number;   // 0-4 (Mon-Fri)
  slot: number;  // 0-7 (periods 1-8)
}

export interface Student {
  id: StudentId;
  externalId?: string;
  name: string;
  grade: number;
  requiredCourses: CourseId[];
  electivePreferences: CourseId[];
}

export interface Teacher {
  id: TeacherId;
  externalId?: string;
  name: string;
  subjects: CourseId[];
  maxSections: number;
  unavailable: Period[];
}

export interface Course {
  id: CourseId;
  externalId?: string;
  name: string;
  maxStudents: number;
  periodsPerWeek: number;
  gradeRestrictions?: number[];
  requiredFeatures: string[];
  sections: number;
}

export interface Room {
  id: RoomId;
  externalId?: string;
  name: string;
  capacity: number;
  features: string[];
  unavailable: Period[];
}

export interface School {
  id: SchoolId;
  name: string;
  config: ScheduleConfig;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleConfig {
  periodsPerDay: number;
  daysPerWeek: number;
  lunchPeriods?: number[];
}

// ============================================================================
// Constraints
// ============================================================================

export interface Constraint {
  id: string;
  type: 'hard' | 'soft';
  name: string;
  description?: string;
  weight?: number;
  enabled: boolean;
}

// ============================================================================
// Schedule Output
// ============================================================================

export interface Section {
  id: SectionId;
  courseId: CourseId;
  teacherId?: TeacherId;
  roomId?: RoomId;
  periods: Period[];
  enrolledStudents: StudentId[];
  capacity: number;
}

export interface UnassignedStudent {
  studentId: StudentId;
  courseId: CourseId;
  reason: string;
}

export interface ScheduleMetadata {
  generatedAt: string;
  algorithmVersion: string;
  score: number;
  solveTimeMs: number;
  constraintsSatisfied: number;
  constraintsTotal: number;
}

export interface Schedule {
  id: ScheduleId;
  schoolId: SchoolId;
  name: string;
  status: 'draft' | 'active' | 'archived';
  sections: Section[];
  unassignedStudents: UnassignedStudent[];
  metadata: ScheduleMetadata;
  createdBy: UserId;
  createdAt: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Bulk import types
export interface BulkImportRequest {
  students?: Student[];
  teachers?: Teacher[];
  courses?: Course[];
  rooms?: Room[];
}

export interface BulkImportResult {
  students: { imported: number; errors: string[] };
  teachers: { imported: number; errors: string[] };
  courses: { imported: number; errors: string[] };
  rooms: { imported: number; errors: string[] };
}

// Schedule generation
export interface GenerateScheduleRequest {
  name: string;
  options?: {
    useGreedy?: boolean;  // Use faster greedy algorithm
    maxIterations?: number;
  };
}

export interface ScheduleStats {
  totalSections: number;
  totalStudents: number;
  totalEnrollments: number;
  avgClassSize: number;
  unassignedCount: number;
  sectionsWithoutRoom: number;
  sectionsWithoutTeacher: number;
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  score: number;
  hardViolations: number;
  softViolations: number;
  warnings: string[];
  errors: string[];
}
