#!/usr/bin/env tsx
/**
 * Test ILP solver directly
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

import { loadScheduleInput } from '../parser/data-loader.js';
import { solveScheduleILP } from '../scheduler/ilp-solver.js';
import type { Section, Course, Teacher } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');

async function main() {
  console.log(chalk.cyan('Testing ILP Solver directly...\n'));

  const paths = {
    students: resolve(rootDir, 'data/demo/students.json'),
    teachers: resolve(rootDir, 'data/demo/teachers.json'),
    rooms: resolve(rootDir, 'data/demo/rooms.json'),
    courses: resolve(rootDir, 'data/demo/courses.json'),
    constraints: resolve(rootDir, 'data/demo/constraints.txt'),
  };

  const input = await loadScheduleInput(paths);
  console.log('Loaded:', input.students.length, 'students,', input.courses.length, 'courses');

  // Create minimal sections for testing
  const sections: Section[] = [];
  let sectionIdx = 0;

  for (const course of input.courses) {
    for (let i = 0; i < course.sections; i++) {
      // Assign different time slots to different sections
      const slot = sectionIdx % 8;
      sections.push({
        id: `${course.id}-${i + 1}`,
        courseId: course.id,
        periods: [
          { day: 0, slot },
          { day: 1, slot },
          { day: 2, slot },
          { day: 3, slot },
          { day: 4, slot },
        ],
        enrolledStudents: [],
        capacity: course.maxStudents,
      });
      sectionIdx++;
    }
  }

  console.log('Created', sections.length, 'sections');
  console.log('');

  try {
    console.log(chalk.yellow('Running ILP solver...'));

    const result = await solveScheduleILP(sections, input, (progress) => {
      console.log(`  [${progress.percentComplete.toFixed(0)}%] ${progress.currentOperation}`);
    });

    console.log('');
    console.log(chalk.bold('ILP Result:'));
    console.log('  Status:', result.status);
    console.log('  Success:', result.success);
    console.log('  Objective Value:', result.objectiveValue);
    console.log('  Solve Time:', result.solveTimeMs, 'ms');
    console.log('  Students with assignments:', result.assignments.size);

    if (result.success) {
      // Count total assignments
      let totalAssignments = 0;
      for (const [, sectionIds] of result.assignments) {
        totalAssignments += sectionIds.length;
      }
      console.log('  Total assignments:', totalAssignments);
    }

  } catch (err) {
    console.error(chalk.red('ILP Error:'), err);
  }
}

main();
