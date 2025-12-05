# School Scheduling System

A constraint-based school scheduling system using Integer Linear Programming (ILP). Built with TypeScript, designed for use with Claude Code.

## Features

- **ILP-based optimization** using HiGHS solver (compiled to WebAssembly)
- **Smart time slot assignment** that avoids grade-level conflicts
- **Configurable constraints** (hard and soft) via plain text files
- **Multiple output formats**: JSON, Markdown, and terminal
- **Demo data included** for immediate testing

## Quick Start

```bash
# Install dependencies
npm install

# Run demo (50 students, 18 courses)
npm run demo
```

**Demo Output:**
```
Score: 98/100
Total Enrollments: 305
Unassigned Students: 0
Hard Violations: 0
```

## How It Works

### Multi-Phase Algorithm

1. **Section Creation** - Create course sections with teacher assignments
2. **Time Slot Assignment** - Spread sections across periods, avoiding same-grade conflicts
3. **Room Assignment** - Match rooms by capacity and required features
4. **ILP Optimization** - Assign students using HiGHS MIP solver
5. **Post-Optimization** - Balance section sizes

### Key Insight: Grade-Aware Scheduling

The scheduler prevents courses taken by the same grade from conflicting:

```
Before: Government and English 12 both at Period 3
        → 0 students could take Government

After:  Government at Period 5, English 12 at Period 3
        → All 14 seniors take both
```

## Usage

### Generate a Schedule

```bash
npm run schedule -- --data ./local-data --output ./output
```

### Validate a Schedule

```bash
npm run validate -- --schedule ./output/schedule.json --data ./local-data --verbose
```

### Generate Reports

```bash
npm run report -- --schedule ./output/schedule.json --data ./local-data --format markdown
```

## Data Formats

Place JSON files in your data directory:

| File | Description |
|------|-------------|
| `students.json` | Student IDs, grades, required courses, elective preferences |
| `teachers.json` | Teacher IDs, subjects, max sections, availability |
| `courses.json` | Course IDs, sections, capacity, grade restrictions |
| `rooms.json` | Room IDs, capacity, features (lab, computers, etc.) |
| `constraints.txt` | Human-readable constraint definitions |

See `data/demo/` for examples.

## Constraints

Define constraints in `constraints.txt`:

```
# Hard constraints (must satisfy)
HARD: NO_TEACHER_CONFLICT | A teacher cannot teach two sections at the same time
HARD: NO_STUDENT_CONFLICT | A student cannot be in two classes at the same time

# Soft constraints (optimize)
SOFT: BALANCED_SECTIONS | Sections should have similar enrollment | weight=0.7
SOFT: STUDENT_ELECTIVE_PREFERENCE | Honor elective preferences | weight=0.8

# Configuration
CONFIG: PERIODS_PER_DAY = 8
CONFIG: DAYS_PER_WEEK = 5
```

## Project Structure

```
school-scheduling/
├── src/
│   ├── scheduler/       # Core algorithm (ILP + greedy fallback)
│   ├── validator/       # Constraint checking
│   ├── reporter/        # Output generation
│   ├── parser/          # Data loading
│   └── scripts/         # CLI entry points
├── data/demo/           # Demo data (committed)
├── local-data/          # Real data (gitignored)
├── output/              # Generated schedules (gitignored)
├── CLAUDE.md            # Claude Code workflow guide
└── RUST_IMPLEMENTATION_SPEC.md  # Rust rewrite specification
```

## Dependencies

| Package | Purpose |
|---------|---------|
| [highs](https://www.npmjs.com/package/highs) | HiGHS MIP solver (WebAssembly) |
| [zod](https://www.npmjs.com/package/zod) | Schema validation |
| [commander](https://www.npmjs.com/package/commander) | CLI argument parsing |
| [chalk](https://www.npmjs.com/package/chalk) | Terminal colors |
| [cli-progress](https://www.npmjs.com/package/cli-progress) | Progress bars |

## Performance

| Dataset | Sections | Solve Time |
|---------|----------|------------|
| Demo (50 students) | 25 | ~70ms |
| Medium (200 students) | 50 | ~200ms |
| Large (500 students) | 100 | ~500ms |

## Claude Code Workflow

This project is designed for human-Claude collaboration:

1. **You describe** your scheduling requirements in plain English
2. **Claude creates** the data files and constraints
3. **Claude runs** the scheduler and shows results
4. **You provide feedback** ("Teacher X has too many back-to-back classes")
5. **Claude adjusts** and re-runs until satisfied

See [CLAUDE.md](./CLAUDE.md) for detailed workflow instructions.

## Future: Rust Implementation

A [detailed specification](./RUST_IMPLEMENTATION_SPEC.md) exists for reimplementing this system in Rust for:

- 10-100x performance improvement
- Single binary distribution
- Native parallelization

## License

MIT
