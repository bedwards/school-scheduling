#!/usr/bin/env tsx
/**
 * Demo Script - Full Schedule Generation Pipeline
 *
 * Runs the complete scheduling process using demo data:
 * 1. Load data
 * 2. Generate schedule
 * 3. Validate
 * 4. Generate reports
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

import { loadScheduleInput } from '../parser/data-loader.js';
import { generateSchedule } from '../scheduler/index.js';
import { validateSchedule } from '../validator/index.js';
import { generateReport } from '../reporter/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');

async function main() {
  console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('           SCHOOL SCHEDULING - DEMO RUN'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════\n'));

  // Setup paths
  const demoDataDir = resolve(rootDir, 'data/demo');
  const outputDir = resolve(rootDir, 'output');

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
    console.log(chalk.gray(`Created output directory: ${outputDir}`));
  }

  const paths = {
    students: resolve(demoDataDir, 'students.json'),
    teachers: resolve(demoDataDir, 'teachers.json'),
    rooms: resolve(demoDataDir, 'rooms.json'),
    courses: resolve(demoDataDir, 'courses.json'),
    constraints: resolve(demoDataDir, 'constraints.txt'),
  };

  // Step 1: Load data
  console.log(chalk.yellow('\n[1/4] Loading input data...'));
  const input = await loadScheduleInput(paths);
  console.log(chalk.green(`  ✓ Loaded ${input.students.length} students`));
  console.log(chalk.green(`  ✓ Loaded ${input.teachers.length} teachers`));
  console.log(chalk.green(`  ✓ Loaded ${input.rooms.length} rooms`));
  console.log(chalk.green(`  ✓ Loaded ${input.courses.length} courses`));
  console.log(chalk.green(`  ✓ Loaded ${input.constraints.length} constraints`));

  // Step 2: Generate schedule with progress bar
  console.log(chalk.yellow('\n[2/4] Generating schedule...'));

  const progressBar = new cliProgress.SingleBar({
    format: '  Progress |' + chalk.cyan('{bar}') + '| {percentage}% | {phase} - {operation}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });

  progressBar.start(100, 0, { phase: 'init', operation: 'Starting...' });

  const startTime = Date.now();
  const schedule = await generateSchedule(input, {
    maxOptimizationIterations: 500,
    onProgress: (progress) => {
      progressBar.update(progress.percentComplete, {
        phase: progress.phase,
        operation: progress.currentOperation,
      });
    },
  });

  progressBar.stop();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(chalk.green(`  ✓ Schedule generated in ${elapsed}s`));
  console.log(chalk.green(`  ✓ Created ${schedule.sections.length} sections`));

  // Step 3: Validate
  console.log(chalk.yellow('\n[3/4] Validating schedule...'));
  const validation = validateSchedule(schedule, input);

  if (validation.valid) {
    console.log(chalk.green(`  ✓ Schedule is VALID`));
  } else {
    console.log(chalk.red(`  ✗ Schedule has ${validation.hardConstraintViolations.length} hard violations`));
  }
  console.log(chalk.cyan(`  Score: ${validation.score}/100`));

  // Step 4: Generate reports
  console.log(chalk.yellow('\n[4/4] Generating reports...'));

  // Text report (to console)
  const textReport = generateReport(schedule, input, validation, {
    format: 'text',
    colorOutput: true,
  });
  console.log('\n' + textReport);

  // JSON report (to file)
  const jsonReport = generateReport(schedule, input, validation, { format: 'json' });
  const jsonPath = resolve(outputDir, 'schedule.json');
  await writeFile(jsonPath, jsonReport);
  console.log(chalk.green(`  ✓ JSON report saved to: ${jsonPath}`));

  // Markdown report (to file)
  const mdReport = generateReport(schedule, input, validation, {
    format: 'markdown',
    includeTeacherSchedules: true,
  });
  const mdPath = resolve(outputDir, 'schedule.md');
  await writeFile(mdPath, mdReport);
  console.log(chalk.green(`  ✓ Markdown report saved to: ${mdPath}`));

  // Summary
  console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════════════════'));
  console.log(chalk.bold.cyan('                    DEMO COMPLETE'));
  console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════\n'));

  // Exit with appropriate code
  process.exit(validation.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});
