#!/usr/bin/env tsx
/**
 * Schedule Generation CLI
 *
 * Generate schedules from input data files.
 *
 * Usage:
 *   npm run schedule -- --data ./local-data --output ./output
 *   npm run schedule -- --data ./data/demo
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

import { loadScheduleInput, type DataPaths } from '../parser/data-loader.js';
import { generateSchedule } from '../scheduler/index.js';
import { validateSchedule } from '../validator/index.js';
import { generateReport } from '../reporter/index.js';

const program = new Command();

program
  .name('schedule')
  .description('Generate a school schedule from input data')
  .requiredOption('-d, --data <dir>', 'Directory containing input data files')
  .option('-o, --output <dir>', 'Output directory for reports', './output')
  .option('--format <type>', 'Output format: json, markdown, text, all', 'all')
  .option('--iterations <n>', 'Max optimization iterations', '1000')
  .option('--quiet', 'Suppress progress output')
  .parse(process.argv);

const opts = program.opts();

async function main() {
  const dataDir = resolve(opts.data);
  const outputDir = resolve(opts.output);
  const iterations = parseInt(opts.iterations, 10);

  // Verify data directory exists
  if (!existsSync(dataDir)) {
    console.error(chalk.red(`Error: Data directory not found: ${dataDir}`));
    process.exit(1);
  }

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true });
  }

  const paths: DataPaths = {
    students: resolve(dataDir, 'students.json'),
    teachers: resolve(dataDir, 'teachers.json'),
    rooms: resolve(dataDir, 'rooms.json'),
    courses: resolve(dataDir, 'courses.json'),
    constraints: resolve(dataDir, 'constraints.txt'),
  };

  // Load data
  if (!opts.quiet) {
    console.log(chalk.cyan('Loading input data...'));
  }

  const input = await loadScheduleInput(paths);

  if (!opts.quiet) {
    console.log(chalk.green(`  Loaded ${input.students.length} students, ${input.courses.length} courses`));
  }

  // Generate schedule
  if (!opts.quiet) {
    console.log(chalk.cyan('\nGenerating schedule...'));
  }

  let progressBar: cliProgress.SingleBar | null = null;

  if (!opts.quiet) {
    progressBar = new cliProgress.SingleBar({
      format: '  Progress |' + chalk.cyan('{bar}') + '| {percentage}% | {operation}',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
    });
    progressBar.start(100, 0, { operation: 'Starting...' });
  }

  const startTime = Date.now();

  const schedule = await generateSchedule(input, {
    maxOptimizationIterations: iterations,
    onProgress: (progress) => {
      progressBar?.update(progress.percentComplete, {
        operation: progress.currentOperation,
      });
    },
  });

  progressBar?.stop();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  if (!opts.quiet) {
    console.log(chalk.green(`  Generated in ${elapsed}s`));
  }

  // Validate
  const validation = validateSchedule(schedule, input);

  if (!opts.quiet) {
    if (validation.valid) {
      console.log(chalk.green(`  Status: VALID (score: ${validation.score}/100)`));
    } else {
      console.log(chalk.red(`  Status: INVALID - ${validation.hardConstraintViolations.length} violations`));
    }
  }

  // Generate reports
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (opts.format === 'all' || opts.format === 'json') {
    const jsonReport = generateReport(schedule, input, validation, { format: 'json' });
    const jsonPath = resolve(outputDir, `schedule-${timestamp}.json`);
    await writeFile(jsonPath, jsonReport);
    if (!opts.quiet) console.log(chalk.gray(`  Saved: ${jsonPath}`));
  }

  if (opts.format === 'all' || opts.format === 'markdown') {
    const mdReport = generateReport(schedule, input, validation, {
      format: 'markdown',
      includeTeacherSchedules: true,
    });
    const mdPath = resolve(outputDir, `schedule-${timestamp}.md`);
    await writeFile(mdPath, mdReport);
    if (!opts.quiet) console.log(chalk.gray(`  Saved: ${mdPath}`));
  }

  if (opts.format === 'all' || opts.format === 'text') {
    const textReport = generateReport(schedule, input, validation, {
      format: 'text',
      colorOutput: false,
    });
    const textPath = resolve(outputDir, `schedule-${timestamp}.txt`);
    await writeFile(textPath, textReport);
    if (!opts.quiet) console.log(chalk.gray(`  Saved: ${textPath}`));
  }

  // Print summary to stdout if quiet
  if (opts.quiet) {
    console.log(JSON.stringify({
      valid: validation.valid,
      score: validation.score,
      sections: schedule.sections.length,
      violations: validation.hardConstraintViolations.length,
    }));
  }

  process.exit(validation.valid ? 0 : 1);
}

main().catch((err) => {
  console.error(chalk.red('Error:'), err.message);
  process.exit(1);
});
