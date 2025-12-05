# School Scheduling System - Claude Code Guide

This document describes how to use Claude Code to generate and manage school schedules.

## Overview

This is a constraint-based school scheduling system. Claude Code runs TypeScript scripts to:
1. Load student, teacher, course, and room data
2. Parse human-readable constraints
3. Generate near-optimal schedules
4. Validate schedules against constraints
5. Produce human-readable and machine-readable reports

## Directory Structure

```
school-scheduling/
├── data/demo/           # Demo data (checked into git)
├── local-data/          # Real PII data (gitignored)
├── output/              # Generated schedules (gitignored)
├── src/
│   ├── types/           # TypeScript domain types
│   ├── parser/          # Data loading & constraint parsing
│   ├── scheduler/       # Core scheduling algorithm
│   ├── validator/       # Constraint validation
│   ├── reporter/        # Report generation
│   └── scripts/         # CLI entry points
└── CLAUDE.md            # This file
```

## Quick Start (Demo)

Run the demo to verify everything works:

```bash
npm run demo
```

This loads demo data, generates a schedule, validates it, and outputs reports.

## Working with Real Data

### 1. Prepare Data Files

Create JSON files in `local-data/` following these formats:

**students.json:**
```json
{
  "students": [
    {
      "id": "unique-id",
      "name": "Student Name",
      "grade": 9,
      "requiredCourses": ["course-id-1", "course-id-2"],
      "electivePreferences": ["elective-1", "elective-2"]
    }
  ]
}
```

**teachers.json:**
```json
{
  "teachers": [
    {
      "id": "teacher-id",
      "name": "Teacher Name",
      "subjects": ["course-id-1", "course-id-2"],
      "maxSections": 5,
      "unavailable": [{"day": 0, "slot": 0}]
    }
  ]
}
```

**courses.json:**
```json
{
  "courses": [
    {
      "id": "course-id",
      "name": "Course Name",
      "maxStudents": 30,
      "periodsPerWeek": 5,
      "gradeRestrictions": [9, 10],
      "requiredFeatures": ["lab"],
      "sections": 2
    }
  ]
}
```

**rooms.json:**
```json
{
  "rooms": [
    {
      "id": "room-id",
      "name": "Room 101",
      "capacity": 30,
      "features": ["lab", "computers"]
    }
  ]
}
```

**constraints.txt:**
```
# Human-readable constraints file
# See data/demo/constraints.txt for full example

HARD: NO_TEACHER_CONFLICT | A teacher cannot teach two sections at the same time
HARD: NO_STUDENT_CONFLICT | A student cannot be in two classes at the same time
SOFT: BALANCED_SECTIONS | Sections should have similar enrollment | weight=0.7

CONFIG: PERIODS_PER_DAY = 8
CONFIG: DAYS_PER_WEEK = 5

GOAL: All students enrolled in required courses
```

### 2. Generate Schedule

```bash
npm run schedule -- --data ./local-data --output ./output
```

Options:
- `--data <dir>` - Directory with input files (required)
- `--output <dir>` - Output directory (default: ./output)
- `--format <type>` - json, markdown, text, or all (default: all)
- `--iterations <n>` - Optimization iterations (default: 1000)
- `--quiet` - Suppress progress, output JSON summary only

### 3. Validate Schedule

```bash
npm run validate -- --schedule ./output/schedule.json --data ./local-data --verbose
```

### 4. Generate Reports

```bash
# Full report
npm run report -- --schedule ./output/schedule.json --data ./local-data --format markdown

# Individual student schedule
npm run report -- --schedule ./output/schedule.json --data ./local-data --student "student-id"
```

## Claude Code Workflow

When working with Claude Code to create schedules:

### Initial Setup
1. Ask Claude to run `npm install` if not done
2. Ask Claude to run `npm run demo` to verify setup

### Creating a Schedule
1. Provide Claude with your data files or descriptions of your data
2. Claude will help create/format the JSON files in `local-data/`
3. Claude will write the constraints.txt based on your English descriptions
4. Claude runs `npm run schedule -- --data ./local-data`
5. Claude validates and shows you the results

### Iterating on Constraints
1. Tell Claude what's wrong with the schedule (e.g., "Teacher X has too many back-to-back classes")
2. Claude modifies constraints.txt
3. Claude re-runs the scheduler
4. Repeat until satisfied

### Example Prompts

**Starting fresh:**
> "I have 200 students, 15 teachers, and 20 courses. Here's a CSV of the students... Generate a schedule where no teacher has more than 4 consecutive periods."

**Adjusting constraints:**
> "The schedule looks good but I need all science classes in rooms with lab equipment."

**Getting specific information:**
> "Show me Ms. Johnson's weekly schedule."
> "Which students couldn't get their first-choice elective?"

## Algorithm Details

The scheduler uses a multi-phase constraint satisfaction approach:

1. **Section Creation**: Creates course sections with teacher assignments
2. **Time Slot Assignment**: Assigns periods avoiding teacher conflicts
3. **Room Assignment**: Matches rooms to sections by features and capacity
4. **Student Assignment**: Greedy assignment prioritizing required courses
5. **Optimization**: Local search to balance section sizes

**Time Complexity**: O(S × C × P) where S=students, C=courses, P=periods
**Typical Runtime**: 1-5 seconds for 200 students, 20 courses

## Constraint Types

### Hard Constraints (Must Satisfy)
- `NO_TEACHER_CONFLICT` - Teachers can't be double-booked
- `NO_STUDENT_CONFLICT` - Students can't be double-booked
- `NO_ROOM_CONFLICT` - Rooms can't be double-booked
- `ROOM_CAPACITY` - Enrollment ≤ room capacity
- `TEACHER_AVAILABILITY` - Respect teacher unavailable periods
- `ROOM_FEATURES` - Match course requirements to room features
- `GRADE_RESTRICTION` - Students only in grade-appropriate courses

### Soft Constraints (Optimize)
- `BALANCED_SECTIONS` - Even enrollment across sections
- `STUDENT_ELECTIVE_PREFERENCE` - Honor elective preferences
- `MINIMIZE_GAPS` - Compact student schedules
- `TEACHER_PREFERENCES` - Honor teacher period preferences

## Output Formats

### JSON
Machine-readable, includes all section/enrollment data. Use for programmatic processing.

### Markdown
Human-readable tables, good for sharing/printing. Includes master schedule grid.

### Text
Console-friendly with optional colors. Best for quick review.

## Troubleshooting

**Schedule invalid (hard constraint violations):**
- Check for data inconsistencies (e.g., student requiring non-existent course)
- Verify enough sections/rooms for demand
- Check teacher availability matches course assignments

**Poor optimization (low score):**
- Increase `--iterations` (try 2000-5000)
- Review soft constraint weights in constraints.txt
- Check if constraints conflict with each other

**Missing students from courses:**
- Check grade restrictions match student grades
- Verify course prerequisites are satisfied
- Ensure enough section capacity

## Security Notes

- `local-data/` is gitignored - safe for PII
- `output/` is gitignored - schedules may contain names
- Demo data uses fictional names - safe to commit
- Never commit real student data to git
