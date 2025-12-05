#!/usr/bin/env tsx
/**
 * Schedule Validation CLI
 *
 * Validate an existing schedule against constraints.
 *
 * Usage:
 *   npm run validate -- --schedule ./output/schedule.json --data ./data/demo
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';

import { loadScheduleInput, type DataPaths } from '../parser/data-loader.js';
import { validateSchedule } from '../validator/index.js';
import type { Schedule } from '../types/index.js';

const program = new Command();

program
  .name('validate')
  .description('Validate an existing schedule against constraints')
  .requiredOption('-s, --schedule <file>', 'Path to schedule JSON file')
  .requiredOption('-d, --data <dir>', 'Directory containing input data files')
  .option('--verbose', 'Show detailed violation information')
  .option('--json', 'Output results as JSON')
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

  if (!existsSync(dataDir)) {
    console.error(chalk.red(`Error: Data directory not found: ${dataDir}`));
    process.exit(1);
  }

  // Load schedule
  const scheduleData = JSON.parse(await readFile(schedulePath, 'utf-8'));

  // Handle both raw schedule and report format
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

  // Validate
  const validation = validateSchedule(schedule, input);

  if (opts.json) {
    console.log(JSON.stringify({
      valid: validation.valid,
      score: validation.score,
      hardViolations: validation.hardConstraintViolations,
      softViolations: validation.softConstraintViolations,
    }, null, 2));
  } else {
    console.log(chalk.bold('\nSchedule Validation Results'));
    console.log('═'.repeat(50));

    if (validation.valid) {
      console.log(chalk.green.bold('Status: VALID'));
    } else {
      console.log(chalk.red.bold('Status: INVALID'));
    }

    console.log(`Score: ${validation.score}/100`);
    console.log(`Hard Violations: ${validation.hardConstraintViolations.length}`);
    console.log(`Soft Violations: ${validation.softConstraintViolations.length}`);

    if (opts.verbose && validation.hardConstraintViolations.length > 0) {
      console.log(chalk.red('\nHard Constraint Violations:'));
      for (const v of validation.hardConstraintViolations) {
        console.log(chalk.red(`  • [${v.constraintType}] ${v.description}`));
      }
    }

    if (opts.verbose && validation.softConstraintViolations.length > 0) {
      console.log(chalk.yellow('\nSoft Constraint Warnings:'));
      for (const v of validation.softConstraintViolations) {
        console.log(chalk.yellow(`  • [${v.constraintType}] ${v.description}`));
      }
    }

    console.log('');
  }

  process.exit(validation.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
