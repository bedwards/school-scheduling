#!/usr/bin/env tsx
/**
 * Report Generation CLI
 *
 * Generate reports from an existing schedule.
 *
 * Usage:
 *   npm run report -- --schedule ./output/schedule.json --data ./data/demo --format markdown
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';

import { loadScheduleInput, type DataPaths } from '../parser/data-loader.js';
import { validateSchedule } from '../validator/index.js';
import { generateReport, generateStudentSchedule } from '../reporter/index.js';
import type { Schedule } from '../types/index.js';

const program = new Command();

program
  .name('report')
  .description('Generate reports from an existing schedule')
  .requiredOption('-s, --schedule <file>', 'Path to schedule JSON file')
  .requiredOption('-d, --data <dir>', 'Directory containing input data files')
  .option('-f, --format <type>', 'Output format: json, markdown, text', 'text')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .option('--student <id>', 'Generate schedule for specific student')
  .option('--include-teachers', 'Include teacher schedules in report')
  .option('--color', 'Enable color output (text format only)')
  .parse(process.argv);

const opts = program.opts();

async function main() {
  const schedulePath = resolve(opts.schedule);
  const dataDir = resolve(opts.data);

  // Verify files exist
  if (!existsSync(schedulePath)) {
    console.error(chalk.red(`Error: Schedule file not found: ${schedulePath}`));
    process.exit(1);
  }

  // Load schedule
  const scheduleData = JSON.parse(await readFile(schedulePath, 'utf-8'));
  const schedule: Schedule = scheduleData.sections
    ? scheduleData
    : {
        sections: scheduleData.sections || [],
        unassignedStudents: scheduleData.unassignedStudents || [],
        metadata: scheduleData.metadata || {},
      };

  // Load input data
  const paths: DataPaths = {
    students: resolve(dataDir, 'students.json'),
    teachers: resolve(dataDir, 'teachers.json'),
    rooms: resolve(dataDir, 'rooms.json'),
    courses: resolve(dataDir, 'courses.json'),
    constraints: resolve(dataDir, 'constraints.txt'),
  };

  const input = await loadScheduleInput(paths);

  // Handle student-specific schedule
  if (opts.student) {
    const studentSchedule = generateStudentSchedule(opts.student, schedule, input);
    if (opts.output) {
      await writeFile(opts.output, studentSchedule);
      console.log(chalk.green(`Saved to: ${opts.output}`));
    } else {
      console.log(studentSchedule);
    }
    return;
  }

  // Validate for the report
  const validation = validateSchedule(schedule, input);

  // Generate report
  const report = generateReport(schedule, input, validation, {
    format: opts.format as 'text' | 'json' | 'markdown',
    includeTeacherSchedules: opts.includeTeachers,
    colorOutput: opts.color,
  });

  if (opts.output) {
    await writeFile(opts.output, report);
    console.log(chalk.green(`Report saved to: ${opts.output}`));
  } else {
    console.log(report);
  }
}

main().catch((err) => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
