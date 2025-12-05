# School Scheduling System - Rust Implementation Specification

A comprehensive specification for implementing a constraint-based school scheduling system in Rust, incorporating lessons learned from the TypeScript prototype.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Lessons Learned from TypeScript Implementation](#lessons-learned)
3. [Recommended Rust Libraries](#recommended-rust-libraries)
4. [Architecture Overview](#architecture-overview)
5. [Data Structures](#data-structures)
6. [Algorithm Design](#algorithm-design)
7. [CLI Interface](#cli-interface)
8. [Error Handling Strategy](#error-handling-strategy)
9. [Testing Strategy](#testing-strategy)
10. [Claude Code Workflow](#claude-code-workflow)
11. [Implementation Phases](#implementation-phases)

---

## Executive Summary

This spec defines a Rust implementation of a school scheduling system. The system takes student, teacher, course, and room data as input, applies configurable constraints, and produces near-optimal schedules using Integer Linear Programming (ILP).

**Key differentiators from TypeScript version:**
- Native performance (10-100x faster for large problems)
- Memory safety guarantees
- Single binary distribution (no runtime dependencies)
- Better parallelization for constraint checking

---

## Lessons Learned from TypeScript Implementation {#lessons-learned}

### Critical Insights

#### 1. Time Slot Assignment is the Key Bottleneck

**Problem:** Initial implementation assigned sections naively, putting many courses at the same time slots. This caused:
- 60% of required enrollments to fail (104 out of 250)
- Empty periods (only 4 of 8 used)
- Infeasible ILP problems

**Solution:** Implement smart time slot assignment:
```
Priority 1: Spread sections of SAME course across DIFFERENT slots
Priority 2: Avoid same-grade course conflicts (courses taken by same students)
Priority 3: Load-balance across all available periods
Priority 4: Respect teacher availability
```

**Rust Advantage:** Can parallelize constraint checking during slot assignment.

#### 2. Hard vs Soft Constraints in ILP

**Problem:** Using hard equality constraints (`x = 1`) for required courses caused "Infeasible" results when conflicts existed.

**Solution:** Use weighted objective function instead:
- Required courses: weight = 1000 (strongly prefer, but not mandatory)
- Elective preferences: weight = 10 to 1 (ranked by preference)
- Hard constraints only for: capacity, time conflicts, grade restrictions

**Key Formula:**
```
Maximize: Σ(1000 * required_assignment) + Σ((10-rank) * elective_assignment)
Subject to:
  - capacity constraints (hard)
  - time conflict constraints (hard)
  - at most one section per course per student (hard)
```

#### 3. Post-ILP Optimization is Necessary

**Problem:** ILP maximizes assignments but ignores section balancing. One section of Algebra 2 had 15 students, another had 0.

**Solution:** Run local search optimization AFTER ILP to rebalance:
1. Find courses with unbalanced sections
2. Attempt to move students from larger to smaller sections
3. Only move if no time conflicts created

#### 4. Grade-Aware Scheduling

**Problem:** Government and English 12 (both required for 12th graders only) assigned to same slot = 0 students could take Government.

**Solution:** Track grade restrictions during time slot assignment:
```rust
struct GradeSlotTracker {
    // grade -> slot -> count of courses at this slot
    usage: HashMap<u8, HashMap<u8, u32>>,
}

// Penalize slots already used by same-grade courses
fn slot_penalty(slot: u8, grades: &[u8], tracker: &GradeSlotTracker) -> u32 {
    grades.iter()
        .map(|g| tracker.usage.get(g).and_then(|m| m.get(&slot)).unwrap_or(&0) * 500)
        .sum()
}
```

#### 5. Data Format Choices

**What Worked:**
- JSON for structured data (students, teachers, courses, rooms)
- Plain text for human-readable constraints
- Separate input/output directories
- Gitignored local-data/ for PII

**Improvements for Rust:**
- Use TOML for configuration (more Rust-idiomatic)
- Consider MessagePack for large datasets (faster parsing)
- Validate with JSON Schema during development

#### 6. Progress Reporting Matters

Users need visibility into long-running operations. Phases to report:
1. Loading data (5%)
2. Creating sections (10%)
3. Assigning time slots (20%)
4. Assigning rooms (30%)
5. Building ILP model (40%)
6. Solving ILP (40-85%)
7. Post-optimization (90%)
8. Generating reports (95%)
9. Complete (100%)

---

## Recommended Rust Libraries {#recommended-rust-libraries}

### Core Solver

| Crate | Purpose | Notes |
|-------|---------|-------|
| **[highs](https://crates.io/crates/highs)** | ILP/MIP solver | Safe Rust bindings to HiGHS. Best open-source MIP solver. Statically links C++ library. |
| **[good_lp](https://crates.io/crates/good_lp)** | LP modeling DSL | High-level API, supports multiple backends (HiGHS, SCIP, CBC). Recommended for ergonomics. |

**Recommendation:** Use `good_lp` with `highs` backend for best balance of usability and performance.

```toml
[dependencies]
good_lp = { version = "1.8", features = ["highs"] }
```

**Alternative for CP-SAT:** If ILP proves insufficient, consider:
- [cp_sat](https://crates.io/crates/cp_sat) - Rust bindings to Google OR-Tools CP-SAT (requires OR-Tools installation)
- [rustsat](https://crates.io/crates/rustsat) - Pure Rust SAT solving framework

### CLI & User Interface

| Crate | Purpose | Notes |
|-------|---------|-------|
| **[clap](https://crates.io/crates/clap)** | Argument parsing | Use derive macros. Industry standard. |
| **[indicatif](https://crates.io/crates/indicatif)** | Progress bars | Thread-safe, customizable templates. |
| **[console](https://crates.io/crates/console)** | Terminal utilities | Part of indicatif ecosystem. |
| **[colored](https://crates.io/crates/colored)** | Terminal colors | Simple `.red()`, `.bold()` API. |

```toml
[dependencies]
clap = { version = "4", features = ["derive"] }
indicatif = "0.17"
colored = "2"
```

### Data Handling

| Crate | Purpose | Notes |
|-------|---------|-------|
| **[serde](https://crates.io/crates/serde)** | Serialization framework | Essential. Use derive. |
| **[serde_json](https://crates.io/crates/serde_json)** | JSON parsing | Battle-tested, 614M+ downloads. |
| **[toml](https://crates.io/crates/toml)** | TOML parsing | For config files. |
| **[serde_valid](https://crates.io/crates/serde_valid)** | Validation | JSON Schema-based validation. |

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"
```

### Error Handling

| Crate | Purpose | Notes |
|-------|---------|-------|
| **[thiserror](https://crates.io/crates/thiserror)** | Error type derivation | For library/domain errors. |
| **[anyhow](https://crates.io/crates/anyhow)** | Error propagation | For application-level errors. |

```toml
[dependencies]
thiserror = "1"
anyhow = "1"
```

### Testing & Development

| Crate | Purpose | Notes |
|-------|---------|-------|
| **[insta](https://crates.io/crates/insta)** | Snapshot testing | Great for testing schedule output. |
| **[proptest](https://crates.io/crates/proptest)** | Property testing | Fuzz constraint validation. |
| **[criterion](https://crates.io/crates/criterion)** | Benchmarking | Measure solver performance. |

---

## Architecture Overview {#architecture-overview}

```
school-scheduler/
├── Cargo.toml
├── CLAUDE.md                    # Claude Code instructions
├── src/
│   ├── main.rs                  # CLI entry point
│   ├── lib.rs                   # Library root
│   ├── types/
│   │   ├── mod.rs
│   │   ├── student.rs
│   │   ├── teacher.rs
│   │   ├── course.rs
│   │   ├── room.rs
│   │   ├── section.rs
│   │   ├── schedule.rs
│   │   └── constraint.rs
│   ├── parser/
│   │   ├── mod.rs
│   │   ├── json.rs              # JSON data loading
│   │   ├── constraints.rs       # Constraint file parsing
│   │   └── validation.rs        # Input validation
│   ├── scheduler/
│   │   ├── mod.rs
│   │   ├── section_creator.rs   # Phase 1: Create sections
│   │   ├── time_assigner.rs     # Phase 2: Assign time slots
│   │   ├── room_assigner.rs     # Phase 3: Assign rooms
│   │   ├── ilp_solver.rs        # Phase 4: ILP student assignment
│   │   ├── optimizer.rs         # Phase 5: Post-ILP balancing
│   │   └── greedy.rs            # Fallback greedy solver
│   ├── validator/
│   │   ├── mod.rs
│   │   ├── hard_constraints.rs
│   │   └── soft_constraints.rs
│   └── reporter/
│       ├── mod.rs
│       ├── json.rs
│       ├── markdown.rs
│       └── text.rs
├── data/
│   └── demo/                    # Demo data (committed)
├── local-data/                  # Real data (gitignored)
└── tests/
    ├── integration/
    └── fixtures/
```

### Module Dependency Graph

```
main.rs
    └── lib.rs
        ├── parser/     ─────────────────┐
        │   └── types/                   │
        ├── scheduler/                   │
        │   ├── types/                   │
        │   └── validator/ (for checks)  │
        ├── validator/                   │
        │   └── types/                   │
        └── reporter/                    │
            └── types/  ◄────────────────┘
```

---

## Data Structures {#data-structures}

### Core Types

```rust
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

// === Identifiers (newtype pattern for type safety) ===

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct StudentId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TeacherId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CourseId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RoomId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SectionId(pub String);

// === Domain Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Student {
    pub id: StudentId,
    pub name: String,
    pub grade: u8,
    pub required_courses: Vec<CourseId>,
    pub elective_preferences: Vec<CourseId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Teacher {
    pub id: TeacherId,
    pub name: String,
    pub subjects: Vec<CourseId>,
    pub max_sections: u8,
    #[serde(default)]
    pub unavailable: Vec<Period>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Course {
    pub id: CourseId,
    pub name: String,
    pub max_students: u32,
    pub periods_per_week: u8,
    #[serde(default)]
    pub grade_restrictions: Option<Vec<u8>>,
    #[serde(default)]
    pub required_features: Vec<String>,
    pub sections: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: RoomId,
    pub name: String,
    pub capacity: u32,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub unavailable: Vec<Period>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Period {
    pub day: u8,   // 0-4 for Mon-Fri
    pub slot: u8,  // 0-7 for periods 1-8
}

// === Schedule Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub id: SectionId,
    pub course_id: CourseId,
    pub teacher_id: Option<TeacherId>,
    pub room_id: Option<RoomId>,
    pub periods: Vec<Period>,
    pub enrolled_students: Vec<StudentId>,
    pub capacity: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub sections: Vec<Section>,
    pub unassigned: Vec<UnassignedStudent>,
    pub metadata: ScheduleMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnassignedStudent {
    pub student_id: StudentId,
    pub course_id: CourseId,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleMetadata {
    pub generated_at: String,
    pub algorithm_version: String,
    pub score: f64,
    pub solve_time_ms: u64,
}
```

### Constraint Types

```rust
#[derive(Debug, Clone)]
pub enum ConstraintType {
    Hard,
    Soft { weight: f64 },
}

#[derive(Debug, Clone)]
pub enum Constraint {
    // Hard constraints
    NoTeacherConflict,
    NoStudentConflict,
    NoRoomConflict,
    RoomCapacity,
    TeacherQualified,
    TeacherAvailability,
    RoomFeatures,
    GradeRestriction,
    TeacherMaxSections,

    // Soft constraints
    BalancedSections { weight: f64 },
    StudentElectivePreference { weight: f64 },
    MinimizeGaps { weight: f64 },
    TeacherPreferences { weight: f64 },
    LunchAvailability { weight: f64, periods: Vec<u8> },
}

#[derive(Debug, Clone)]
pub struct ScheduleConfig {
    pub periods_per_day: u8,
    pub days_per_week: u8,
    pub lunch_periods: Vec<u8>,
}
```

### Input Bundle

```rust
#[derive(Debug)]
pub struct ScheduleInput {
    pub students: Vec<Student>,
    pub teachers: Vec<Teacher>,
    pub courses: Vec<Course>,
    pub rooms: Vec<Room>,
    pub constraints: Vec<Constraint>,
    pub config: ScheduleConfig,
}
```

---

## Algorithm Design {#algorithm-design}

### Phase 1: Section Creation

```rust
pub fn create_sections(courses: &[Course], teachers: &[Teacher]) -> Vec<Section> {
    // For each course, create N sections
    // Assign teachers round-robin from qualified pool
    // Track teacher section count to respect max_sections
}
```

### Phase 2: Time Slot Assignment (CRITICAL)

This is the most important phase. Poor time slot assignment makes optimal student assignment impossible.

```rust
pub struct TimeSlotAssigner {
    teacher_schedules: HashMap<TeacherId, HashSet<Period>>,
    slot_usage: Vec<u32>,  // How many sections at each slot
    grade_slot_usage: HashMap<u8, HashMap<u8, u32>>,  // grade -> slot -> count
}

impl TimeSlotAssigner {
    pub fn assign(&mut self, sections: &mut [Section], courses: &HashMap<CourseId, Course>) {
        // Group sections by course
        let sections_by_course = group_by_course(sections);

        for (course_id, course_sections) in sections_by_course {
            let course = &courses[&course_id];
            let grades = course.grade_restrictions.as_ref();

            let mut course_used_slots = HashSet::new();

            for section in course_sections {
                let best_slot = self.find_best_slot(
                    section.teacher_id.as_ref(),
                    &course_used_slots,
                    grades,
                );

                self.assign_section_to_slot(section, best_slot);
                course_used_slots.insert(best_slot);
            }
        }
    }

    fn find_best_slot(
        &self,
        teacher: Option<&TeacherId>,
        course_used: &HashSet<u8>,
        grades: Option<&Vec<u8>>,
    ) -> u8 {
        (0..8)
            .filter(|&slot| self.teacher_available(teacher, slot))
            .min_by_key(|&slot| self.calculate_penalty(slot, course_used, grades))
            .unwrap_or(0)
    }

    fn calculate_penalty(
        &self,
        slot: u8,
        course_used: &HashSet<u8>,
        grades: Option<&Vec<u8>>,
    ) -> u32 {
        let mut penalty = self.slot_usage[slot as usize];

        // Heavy penalty for reusing slot within same course
        if course_used.contains(&slot) {
            penalty += 1000;
        }

        // Penalty for same-grade conflicts
        if let Some(grades) = grades {
            for grade in grades {
                if let Some(grade_usage) = self.grade_slot_usage.get(grade) {
                    penalty += grade_usage.get(&slot).unwrap_or(&0) * 500;
                }
            }
        }

        penalty
    }
}
```

### Phase 3: Room Assignment

```rust
pub fn assign_rooms(
    sections: &mut [Section],
    rooms: &[Room],
    courses: &HashMap<CourseId, Course>,
) {
    let mut room_schedules: HashMap<RoomId, HashSet<Period>> = HashMap::new();

    for section in sections {
        let course = &courses[&section.course_id];
        let required_features = &course.required_features;

        // Find suitable rooms (capacity + features), sorted by capacity (smallest first)
        let suitable = rooms.iter()
            .filter(|r| r.capacity >= section.capacity)
            .filter(|r| required_features.iter().all(|f| r.features.contains(f)))
            .sorted_by_key(|r| r.capacity);

        for room in suitable {
            let schedule = room_schedules.entry(room.id.clone()).or_default();
            if section.periods.iter().all(|p| !schedule.contains(p)) {
                section.room_id = Some(room.id.clone());
                schedule.extend(section.periods.iter().cloned());
                break;
            }
        }
    }
}
```

### Phase 4: ILP Student Assignment

```rust
use good_lp::{constraint, variable, variables, Expression, Solution, SolverModel};
use good_lp::solvers::highs::highs;

pub fn solve_student_assignment(
    sections: &[Section],
    students: &[Student],
    courses: &HashMap<CourseId, Course>,
) -> Result<HashMap<StudentId, Vec<SectionId>>, SolverError> {

    let mut vars = variables!();

    // x[s][k] = 1 if student s assigned to section k
    let x: HashMap<(usize, usize), _> = students.iter().enumerate()
        .flat_map(|(s, _)| {
            sections.iter().enumerate()
                .map(move |(k, _)| ((s, k), vars.add(variable().binary())))
        })
        .collect();

    // Build objective: maximize weighted assignments
    let mut objective = Expression::default();

    for (s, student) in students.iter().enumerate() {
        for (k, section) in sections.iter().enumerate() {
            let course = &courses[&section.course_id];

            // Skip grade-restricted courses
            if let Some(grades) = &course.grade_restrictions {
                if !grades.contains(&student.grade) {
                    continue;
                }
            }

            let weight = if student.required_courses.contains(&section.course_id) {
                1000.0  // Strong incentive for required courses
            } else if let Some(rank) = student.elective_preferences
                .iter()
                .position(|c| c == &section.course_id)
            {
                (10 - rank) as f64  // Elective preference
            } else {
                0.0
            };

            if weight > 0.0 {
                objective += weight * x[&(s, k)];
            }
        }
    }

    let mut problem = vars.maximise(objective).using(highs);

    // Constraint: At most one section per course per student
    for (s, student) in students.iter().enumerate() {
        let all_courses: HashSet<_> = student.required_courses.iter()
            .chain(student.elective_preferences.iter())
            .collect();

        for course_id in all_courses {
            let section_indices: Vec<_> = sections.iter()
                .enumerate()
                .filter(|(_, sec)| &sec.course_id == course_id)
                .map(|(k, _)| k)
                .collect();

            if !section_indices.is_empty() {
                let sum: Expression = section_indices.iter()
                    .map(|&k| x[&(s, k)].into())
                    .sum();
                problem = problem.with(constraint!(sum <= 1));
            }
        }
    }

    // Constraint: Section capacity
    for (k, section) in sections.iter().enumerate() {
        let sum: Expression = students.iter()
            .enumerate()
            .map(|(s, _)| x[&(s, k)].into())
            .sum();
        problem = problem.with(constraint!(sum <= section.capacity as f64));
    }

    // Constraint: No time conflicts per student
    // ... (similar structure)

    let solution = problem.solve()?;

    // Extract assignments
    let mut assignments: HashMap<StudentId, Vec<SectionId>> = HashMap::new();
    for (s, student) in students.iter().enumerate() {
        for (k, section) in sections.iter().enumerate() {
            if solution.value(x[&(s, k)]) > 0.5 {
                assignments.entry(student.id.clone())
                    .or_default()
                    .push(section.id.clone());
            }
        }
    }

    Ok(assignments)
}
```

### Phase 5: Post-ILP Optimization

```rust
pub fn optimize_section_balance(
    sections: &mut [Section],
    student_schedules: &mut HashMap<StudentId, HashSet<Period>>,
    max_iterations: u32,
) {
    let sections_by_course = group_sections_by_course(sections);

    for _ in 0..max_iterations {
        let mut improved = false;

        for (_, course_sections) in &sections_by_course {
            if course_sections.len() < 2 {
                continue;
            }

            let (smallest, largest) = find_extremes(course_sections);
            let diff = largest.enrolled_students.len() - smallest.enrolled_students.len();

            if diff <= 1 {
                continue;
            }

            // Try to move a student from largest to smallest
            for student_id in &largest.enrolled_students {
                if can_move_student(student_id, largest, smallest, student_schedules) {
                    move_student(student_id, largest, smallest, student_schedules);
                    improved = true;
                    break;
                }
            }
        }

        if !improved {
            break;
        }
    }
}
```

---

## CLI Interface {#cli-interface}

```rust
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "school-scheduler")]
#[command(about = "Constraint-based school schedule generator")]
#[command(version)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Run demo with sample data
    Demo,

    /// Generate a schedule from input data
    Schedule {
        /// Directory containing input JSON files
        #[arg(short, long)]
        data: PathBuf,

        /// Output directory for schedule files
        #[arg(short, long, default_value = "./output")]
        output: PathBuf,

        /// Output format(s): json, markdown, text, or all
        #[arg(short, long, default_value = "all")]
        format: String,

        /// Suppress progress output, print JSON summary only
        #[arg(short, long)]
        quiet: bool,
    },

    /// Validate an existing schedule
    Validate {
        /// Path to schedule.json file
        #[arg(short, long)]
        schedule: PathBuf,

        /// Directory containing input data for validation
        #[arg(short, long)]
        data: PathBuf,

        /// Show detailed validation results
        #[arg(short, long)]
        verbose: bool,
    },

    /// Generate reports from a schedule
    Report {
        /// Path to schedule.json file
        #[arg(short, long)]
        schedule: PathBuf,

        /// Directory containing input data
        #[arg(short, long)]
        data: PathBuf,

        /// Output format: json, markdown, or text
        #[arg(short, long, default_value = "markdown")]
        format: String,

        /// Generate schedule for specific student ID
        #[arg(long)]
        student: Option<String>,

        /// Generate schedule for specific teacher ID
        #[arg(long)]
        teacher: Option<String>,
    },
}
```

**Usage Examples:**

```bash
# Run demo
school-scheduler demo

# Generate schedule
school-scheduler schedule --data ./local-data --output ./output

# Validate
school-scheduler validate --schedule ./output/schedule.json --data ./local-data -v

# Student report
school-scheduler report --schedule ./output/schedule.json --data ./local-data --student s-001
```

---

## Error Handling Strategy {#error-handling-strategy}

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SchedulerError {
    // Input/Parse errors
    #[error("Failed to read file: {path}")]
    FileRead { path: String, #[source] source: std::io::Error },

    #[error("Failed to parse JSON in {file}: {message}")]
    JsonParse { file: String, message: String },

    #[error("Invalid constraint: {0}")]
    InvalidConstraint(String),

    // Data validation errors
    #[error("Student {student_id} references unknown course {course_id}")]
    UnknownCourse { student_id: String, course_id: String },

    #[error("Teacher {teacher_id} cannot teach course {course_id}")]
    UnqualifiedTeacher { teacher_id: String, course_id: String },

    #[error("Not enough sections for course {course_id}: need {needed}, have {available}")]
    InsufficientSections { course_id: String, needed: u32, available: u32 },

    // Solver errors
    #[error("ILP solver failed: {0}")]
    SolverFailed(String),

    #[error("No feasible solution found")]
    Infeasible,

    // Validation errors
    #[error("Schedule violates hard constraint: {0}")]
    HardConstraintViolation(String),
}

// Use anyhow::Result at application boundaries
pub type Result<T> = anyhow::Result<T>;
```

---

## Testing Strategy {#testing-strategy}

### Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_time_slot_avoids_same_grade_conflict() {
        // Create two courses with same grade restriction
        // Verify they get different slots
    }

    #[test]
    fn test_section_balancing() {
        // Create unbalanced sections
        // Run optimizer
        // Verify balance improved
    }

    #[test]
    fn test_ilp_respects_capacity() {
        // Create section with capacity 10
        // 15 students want the course
        // Verify only 10 assigned
    }
}
```

### Integration Tests

```rust
// tests/integration/demo_test.rs
#[test]
fn test_demo_produces_valid_schedule() {
    let input = load_demo_data();
    let schedule = generate_schedule(&input).unwrap();
    let validation = validate_schedule(&schedule, &input);

    assert!(validation.is_valid);
    assert_eq!(validation.hard_violations, 0);
    assert!(validation.score >= 90.0);
}
```

### Snapshot Tests

```rust
use insta::assert_json_snapshot;

#[test]
fn test_schedule_output_format() {
    let schedule = generate_demo_schedule();
    assert_json_snapshot!(schedule);
}
```

### Property Tests

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn no_double_booking(
        students in prop::collection::vec(arbitrary_student(), 1..100),
        sections in prop::collection::vec(arbitrary_section(), 1..50),
    ) {
        let schedule = assign_students(&students, &sections);

        for student in &students {
            let assigned_periods: Vec<_> = schedule
                .get_student_sections(&student.id)
                .flat_map(|s| &s.periods)
                .collect();

            // No duplicate periods
            let unique: HashSet<_> = assigned_periods.iter().collect();
            prop_assert_eq!(assigned_periods.len(), unique.len());
        }
    }
}
```

---

## Claude Code Workflow {#claude-code-workflow}

### CLAUDE.md Template

```markdown
# School Scheduler - Claude Code Guide

## Quick Start

\`\`\`bash
cargo build --release
cargo run -- demo
\`\`\`

## Project Structure

- `src/` - Rust source code
- `data/demo/` - Demo data (committed)
- `local-data/` - Real data (gitignored)
- `output/` - Generated schedules (gitignored)

## Common Tasks

### Generate Schedule
\`\`\`bash
cargo run -- schedule --data ./local-data --output ./output
\`\`\`

### Validate Schedule
\`\`\`bash
cargo run -- validate --schedule ./output/schedule.json --data ./local-data -v
\`\`\`

### Run Tests
\`\`\`bash
cargo test
cargo test -- --nocapture  # Show println output
\`\`\`

## Working with Claude

### Initial Setup
1. Run `cargo build` to verify compilation
2. Run `cargo run -- demo` to verify functionality

### Creating Schedules
1. Provide data files or describe your data
2. Claude creates/formats JSON files in `local-data/`
3. Claude writes constraints based on your requirements
4. Claude runs `cargo run -- schedule`
5. Claude validates and shows results

### Iterating
- "Teacher X has too many back-to-back classes" → modify constraints
- "Science needs lab rooms" → update room features
- "Show Ms. Johnson's schedule" → generate teacher report

## Data Formats

[Include JSON schemas here]

## Constraint File Format

\`\`\`
HARD: NO_TEACHER_CONFLICT | A teacher cannot teach two sections at the same time
SOFT: BALANCED_SECTIONS | Sections should have similar enrollment | weight=0.7
CONFIG: PERIODS_PER_DAY = 8
\`\`\`
```

### Human-Claude Workflow Pattern

1. **Human provides context**: Data description, constraints in plain English
2. **Claude creates data files**: Validates format, creates JSON in local-data/
3. **Claude runs scheduler**: `cargo run -- schedule`
4. **Claude analyzes results**: Shows statistics, identifies issues
5. **Human provides feedback**: "Too many conflicts in period 3"
6. **Claude adjusts**: Modifies constraints or algorithm parameters
7. **Iterate until satisfied**

---

## Implementation Phases {#implementation-phases}

### Phase 1: Foundation (Week 1)
- [ ] Project setup with Cargo workspace
- [ ] Define all types in `src/types/`
- [ ] Implement JSON parsing with serde
- [ ] Basic CLI with clap
- [ ] Demo data files

### Phase 2: Core Algorithm (Week 2)
- [ ] Section creation
- [ ] Time slot assignment (with grade-awareness)
- [ ] Room assignment
- [ ] Greedy student assignment (fallback)

### Phase 3: ILP Solver (Week 3)
- [ ] Integrate good_lp with HiGHS
- [ ] Build ILP model for student assignment
- [ ] Implement soft constraint weights
- [ ] Post-ILP optimization

### Phase 4: Validation & Reporting (Week 4)
- [ ] Hard constraint validation
- [ ] Soft constraint scoring
- [ ] JSON report generation
- [ ] Markdown report generation
- [ ] Individual schedule reports

### Phase 5: Polish (Week 5)
- [ ] Progress bars with indicatif
- [ ] Comprehensive error messages
- [ ] Performance optimization
- [ ] Documentation
- [ ] Test coverage

---

## Performance Targets

| Metric | TypeScript | Rust Target |
|--------|------------|-------------|
| 50 students, 25 sections | 70ms | <10ms |
| 500 students, 100 sections | ~500ms | <50ms |
| 2000 students, 300 sections | ~5s | <500ms |
| Binary size | N/A (Node) | <5MB |
| Memory usage | ~100MB | <20MB |

---

## Appendix: Constraint File Grammar

```ebnf
file        = { line } ;
line        = comment | constraint | config | goal | empty ;
comment     = "#" { any_char } ;
constraint  = type ":" name "|" description [ "|" params ] ;
type        = "HARD" | "SOFT" ;
name        = identifier ;
description = { any_char - "|" } ;
params      = param { "," param } ;
param       = key "=" value ;
config      = "CONFIG:" key "=" value ;
goal        = "GOAL:" description ;
empty       = "" ;
```

---

*Specification Version: 1.0*
*Based on TypeScript implementation commit: 2702f1b*
*Author: Claude Code*
