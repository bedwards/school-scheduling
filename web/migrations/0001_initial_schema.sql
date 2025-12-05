-- School Scheduler D1 Database Schema
-- All PII is stored encrypted or hashed where appropriate
-- This schema prioritizes security and data integrity

-- ============================================================================
-- AUTHENTICATION & USERS
-- ============================================================================

-- Users table (school administrators)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'readonly')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
);

-- Sessions for JWT refresh tokens
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_address TEXT,
    user_agent TEXT
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================================
-- SCHEDULING DATA
-- ============================================================================

-- Schools (multi-tenant support)
CREATE TABLE IF NOT EXISTS schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    config_json TEXT NOT NULL DEFAULT '{"periodsPerDay":8,"daysPerWeek":5}'
);

CREATE INDEX idx_schools_created_by ON schools(created_by);

-- School user access (who can access which school's data)
CREATE TABLE IF NOT EXISTS school_access (
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL DEFAULT 'read' CHECK (access_level IN ('admin', 'write', 'read')),
    granted_at TEXT NOT NULL DEFAULT (datetime('now')),
    granted_by TEXT REFERENCES users(id),
    PRIMARY KEY (school_id, user_id)
);

-- Students (PII - names should be handled carefully)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    external_id TEXT, -- School's internal ID (optional)
    name TEXT NOT NULL, -- Encrypted in application layer for extra security
    grade INTEGER NOT NULL CHECK (grade >= 1 AND grade <= 12),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(school_id, external_id)
);

CREATE INDEX idx_students_school ON students(school_id);
CREATE INDEX idx_students_grade ON students(school_id, grade);

-- Student required courses
CREATE TABLE IF NOT EXISTS student_required_courses (
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    PRIMARY KEY (student_id, course_id)
);

-- Student elective preferences (ordered by preference)
CREATE TABLE IF NOT EXISTS student_elective_preferences (
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    preference_order INTEGER NOT NULL,
    PRIMARY KEY (student_id, course_id)
);

CREATE INDEX idx_student_electives_order ON student_elective_preferences(student_id, preference_order);

-- Teachers
CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    external_id TEXT,
    name TEXT NOT NULL,
    max_sections INTEGER NOT NULL DEFAULT 6,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(school_id, external_id)
);

CREATE INDEX idx_teachers_school ON teachers(school_id);

-- Teacher subjects (courses they can teach)
CREATE TABLE IF NOT EXISTS teacher_subjects (
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    PRIMARY KEY (teacher_id, course_id)
);

-- Teacher unavailable periods
CREATE TABLE IF NOT EXISTS teacher_unavailable (
    teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    day INTEGER NOT NULL CHECK (day >= 0 AND day <= 4),
    slot INTEGER NOT NULL CHECK (slot >= 0 AND slot <= 7),
    PRIMARY KEY (teacher_id, day, slot)
);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    external_id TEXT,
    name TEXT NOT NULL,
    max_students INTEGER NOT NULL DEFAULT 30,
    periods_per_week INTEGER NOT NULL DEFAULT 5,
    num_sections INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(school_id, external_id)
);

CREATE INDEX idx_courses_school ON courses(school_id);

-- Course grade restrictions
CREATE TABLE IF NOT EXISTS course_grade_restrictions (
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL CHECK (grade >= 1 AND grade <= 12),
    PRIMARY KEY (course_id, grade)
);

-- Course required room features
CREATE TABLE IF NOT EXISTS course_required_features (
    course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    PRIMARY KEY (course_id, feature)
);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    external_id TEXT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 30,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(school_id, external_id)
);

CREATE INDEX idx_rooms_school ON rooms(school_id);

-- Room features
CREATE TABLE IF NOT EXISTS room_features (
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    feature TEXT NOT NULL,
    PRIMARY KEY (room_id, feature)
);

-- Room unavailable periods
CREATE TABLE IF NOT EXISTS room_unavailable (
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    day INTEGER NOT NULL CHECK (day >= 0 AND day <= 4),
    slot INTEGER NOT NULL CHECK (slot >= 0 AND slot <= 7),
    PRIMARY KEY (room_id, day, slot)
);

-- ============================================================================
-- CONSTRAINTS CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS constraints (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    constraint_type TEXT NOT NULL CHECK (constraint_type IN ('hard', 'soft')),
    name TEXT NOT NULL,
    description TEXT,
    weight REAL DEFAULT 1.0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_constraints_school ON constraints(school_id);

-- ============================================================================
-- GENERATED SCHEDULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    score REAL,
    algorithm_version TEXT,
    solve_time_ms INTEGER,
    metadata_json TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_schedules_school ON schedules(school_id);
CREATE INDEX idx_schedules_status ON schedules(school_id, status);

-- Schedule sections
CREATE TABLE IF NOT EXISTS schedule_sections (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    teacher_id TEXT,
    room_id TEXT,
    capacity INTEGER NOT NULL
);

CREATE INDEX idx_sections_schedule ON schedule_sections(schedule_id);

-- Section periods (when the section meets)
CREATE TABLE IF NOT EXISTS section_periods (
    section_id TEXT NOT NULL REFERENCES schedule_sections(id) ON DELETE CASCADE,
    day INTEGER NOT NULL CHECK (day >= 0 AND day <= 4),
    slot INTEGER NOT NULL CHECK (slot >= 0 AND slot <= 7),
    PRIMARY KEY (section_id, day, slot)
);

-- Student enrollments in sections
CREATE TABLE IF NOT EXISTS section_enrollments (
    section_id TEXT NOT NULL REFERENCES schedule_sections(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    PRIMARY KEY (section_id, student_id)
);

CREATE INDEX idx_enrollments_student ON section_enrollments(student_id);

-- Unassigned students (couldn't be scheduled)
CREATE TABLE IF NOT EXISTS schedule_unassigned (
    schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    reason TEXT,
    PRIMARY KEY (schedule_id, student_id, course_id)
);

-- ============================================================================
-- AUDIT LOG (for security compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    details_json TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
