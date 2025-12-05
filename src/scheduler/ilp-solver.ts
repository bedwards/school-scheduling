/**
 * Integer Linear Programming Solver for School Scheduling
 *
 * Uses HiGHS (https://highs.dev/) - a state-of-the-art MIP solver
 * compiled to WebAssembly for Node.js.
 *
 * Problem Formulation:
 * ====================
 *
 * Variables:
 *   x[s][k] = 1 if student s is assigned to section k, 0 otherwise
 *
 * Hard Constraints:
 *   1. Section capacity not exceeded
 *   2. No time conflicts (student can't be in overlapping sections)
 *   3. Grade restrictions enforced
 *   4. At most one section per course per student
 *
 * Soft Constraints (via objective weights):
 *   - Required courses: weight=1000 (strongly prefer assignment)
 *   - Elective preferences: weight=10-1 (ranked by preference order)
 *
 * Objective:
 *   Maximize: sum of (required course bonuses) + (elective preference scores)
 *
 * Complexity: O(S * K) variables, O(S * C + K + S * T) constraints
 *   where S=students, K=sections, C=courses, T=time slots
 */

import highs from 'highs';
import type {
  ScheduleInput,
  Section,
  Student,
  Course,
  Period,
  StudentId,
  CourseId,
  SectionId,
  ProgressCallback,
} from '../types/index.js';

export interface ILPResult {
  success: boolean;
  assignments: Map<StudentId, SectionId[]>;
  objectiveValue: number;
  solveTimeMs: number;
  status: string;
}

interface SectionInfo {
  id: SectionId;
  courseId: CourseId;
  periods: Period[];
  capacity: number;
  index: number;
}

export async function solveScheduleILP(
  sections: Section[],
  input: ScheduleInput,
  onProgress?: ProgressCallback
): Promise<ILPResult> {
  const startTime = Date.now();

  onProgress?.({
    phase: 'initializing',
    percentComplete: 5,
    currentOperation: 'Building ILP model...',
  });

  // Build lookup structures
  const courseMap = new Map(input.courses.map(c => [c.id, c]));
  const sectionsByCourse = new Map<CourseId, SectionInfo[]>();

  sections.forEach((section, index) => {
    const info: SectionInfo = {
      id: section.id,
      courseId: section.courseId,
      periods: section.periods,
      capacity: section.capacity,
      index,
    };
    const list = sectionsByCourse.get(section.courseId) || [];
    list.push(info);
    sectionsByCourse.set(section.courseId, list);
  });

  // Build time slot lookup for conflict detection
  const sectionsByTimeSlot = new Map<string, SectionInfo[]>();
  for (const section of sections) {
    for (const period of section.periods) {
      const key = `${period.day}-${period.slot}`;
      const list = sectionsByTimeSlot.get(key) || [];
      list.push({
        id: section.id,
        courseId: section.courseId,
        periods: section.periods,
        capacity: section.capacity,
        index: sections.indexOf(section),
      });
      sectionsByTimeSlot.set(key, list);
    }
  }

  // Variable naming: x_s_k where s=student index, k=section index
  // We'll build the LP in CPLEX LP format
  const students = input.students;
  const numStudents = students.length;
  const numSections = sections.length;

  // Map variable names to indices
  const varName = (studentIdx: number, sectionIdx: number) =>
    `x_${studentIdx}_${sectionIdx}`;

  onProgress?.({
    phase: 'initializing',
    percentComplete: 10,
    currentOperation: `Building model: ${numStudents} students, ${numSections} sections`,
  });

  // Build the LP model in CPLEX format
  const lines: string[] = [];

  // Objective: Maximize preference satisfaction
  lines.push('Maximize');
  const objectiveTerms: string[] = [];

  for (let s = 0; s < numStudents; s++) {
    const student = students[s];

    for (let k = 0; k < numSections; k++) {
      const section = sections[k];
      const course = courseMap.get(section.courseId);

      // Skip if grade restriction doesn't match
      if (course?.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue;
      }

      // Calculate preference weight
      let weight = 0;

      // High weight for required courses (soft constraint via objective)
      if (student.requiredCourses.includes(section.courseId)) {
        weight = 1000; // Strong incentive to assign required courses
      }

      // Medium weight for elective preferences
      const electiveRank = student.electivePreferences.indexOf(section.courseId);
      if (electiveRank !== -1) {
        weight = 10 - electiveRank; // First choice = 10, second = 9, etc.
      }

      if (weight > 0) {
        objectiveTerms.push(`${weight} ${varName(s, k)}`);
      }
    }
  }

  lines.push(' obj: ' + (objectiveTerms.length > 0 ? objectiveTerms.join(' + ') : '0'));

  // Constraints
  lines.push('Subject To');

  let constraintCount = 0;

  // Constraint 1: At most one section per required course (assignment incentivized via objective)
  for (let s = 0; s < numStudents; s++) {
    const student = students[s];

    for (const courseId of student.requiredCourses) {
      const courseSections = sectionsByCourse.get(courseId);
      if (!courseSections || courseSections.length === 0) continue;

      const course = courseMap.get(courseId);
      if (course?.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue; // Skip if grade doesn't match
      }

      const validSections = courseSections.filter(sec => {
        const c = courseMap.get(sec.courseId);
        return !c?.gradeRestrictions || c.gradeRestrictions.includes(student.grade);
      });

      if (validSections.length === 0) continue;

      const terms = validSections.map(sec => varName(s, sec.index)).join(' + ');
      lines.push(` req_${s}_${courseId.replace(/[^a-zA-Z0-9]/g, '_')}: ${terms} <= 1`);
      constraintCount++;
    }
  }

  // Constraint 2: At most one section per elective course
  for (let s = 0; s < numStudents; s++) {
    const student = students[s];

    for (const courseId of student.electivePreferences) {
      const courseSections = sectionsByCourse.get(courseId);
      if (!courseSections || courseSections.length === 0) continue;

      const course = courseMap.get(courseId);
      if (course?.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue;
      }

      const validSections = courseSections.filter(sec => {
        const c = courseMap.get(sec.courseId);
        return !c?.gradeRestrictions || c.gradeRestrictions.includes(student.grade);
      });

      if (validSections.length === 0) continue;

      const terms = validSections.map(sec => varName(s, sec.index)).join(' + ');
      lines.push(` elec_${s}_${courseId.replace(/[^a-zA-Z0-9]/g, '_')}: ${terms} <= 1`);
      constraintCount++;
    }
  }

  onProgress?.({
    phase: 'initializing',
    percentComplete: 30,
    currentOperation: `Added ${constraintCount} course assignment constraints`,
  });

  // Constraint 3: Section capacity
  for (let k = 0; k < numSections; k++) {
    const section = sections[k];
    const course = courseMap.get(section.courseId);

    const terms: string[] = [];
    for (let s = 0; s < numStudents; s++) {
      const student = students[s];

      // Only include if student could be in this section
      if (course?.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue;
      }

      const isRequired = student.requiredCourses.includes(section.courseId);
      const isElective = student.electivePreferences.includes(section.courseId);

      if (isRequired || isElective) {
        terms.push(varName(s, k));
      }
    }

    if (terms.length > 0) {
      lines.push(` cap_${k}: ${terms.join(' + ')} <= ${section.capacity}`);
      constraintCount++;
    }
  }

  onProgress?.({
    phase: 'initializing',
    percentComplete: 50,
    currentOperation: `Added capacity constraints, building time conflict constraints...`,
  });

  // Constraint 4: No time conflicts - for each student and each time slot,
  // sum of sections at that time <= 1
  for (let s = 0; s < numStudents; s++) {
    const student = students[s];

    // Get all time slots the student might use
    const studentTimeSlots = new Map<string, number[]>(); // timeKey -> section indices

    for (let k = 0; k < numSections; k++) {
      const section = sections[k];
      const course = courseMap.get(section.courseId);

      if (course?.gradeRestrictions && !course.gradeRestrictions.includes(student.grade)) {
        continue;
      }

      const isRequired = student.requiredCourses.includes(section.courseId);
      const isElective = student.electivePreferences.includes(section.courseId);

      if (!isRequired && !isElective) continue;

      for (const period of section.periods) {
        const key = `${period.day}-${period.slot}`;
        const list = studentTimeSlots.get(key) || [];
        list.push(k);
        studentTimeSlots.set(key, list);
      }
    }

    // Add constraint for each time slot with multiple possible sections
    for (const [timeKey, sectionIndices] of studentTimeSlots) {
      if (sectionIndices.length > 1) {
        const terms = sectionIndices.map(k => varName(s, k)).join(' + ');
        lines.push(` time_${s}_${timeKey.replace('-', '_')}: ${terms} <= 1`);
        constraintCount++;
      }
    }
  }

  onProgress?.({
    phase: 'initializing',
    percentComplete: 70,
    currentOperation: `Total constraints: ${constraintCount}`,
  });

  // Binary variables
  lines.push('Binary');
  const binaryVars: string[] = [];
  for (let s = 0; s < numStudents; s++) {
    for (let k = 0; k < numSections; k++) {
      binaryVars.push(varName(s, k));
    }
  }
  lines.push(' ' + binaryVars.join(' '));

  lines.push('End');

  const lpModel = lines.join('\n');

  onProgress?.({
    phase: 'optimizing',
    percentComplete: 75,
    currentOperation: 'Solving with HiGHS...',
  });

  // Solve with HiGHS
  const solver = await highs();
  const solution = solver.solve(lpModel);

  const solveTime = Date.now() - startTime;

  onProgress?.({
    phase: 'optimizing',
    percentComplete: 95,
    currentOperation: `Solved in ${solveTime}ms, extracting assignments...`,
  });

  // Extract assignments
  const assignments = new Map<StudentId, SectionId[]>();

  if (solution.Status === 'Optimal' || solution.Status === 'Feasible') {
    for (let s = 0; s < numStudents; s++) {
      const studentId = students[s].id;
      const studentSections: SectionId[] = [];

      for (let k = 0; k < numSections; k++) {
        const varValue = solution.Columns?.[varName(s, k)]?.Primal;
        if (varValue && varValue > 0.5) {
          studentSections.push(sections[k].id);
        }
      }

      assignments.set(studentId, studentSections);
    }
  }

  onProgress?.({
    phase: 'complete',
    percentComplete: 100,
    currentOperation: 'ILP solving complete',
  });

  return {
    success: solution.Status === 'Optimal' || solution.Status === 'Feasible',
    assignments,
    objectiveValue: solution.ObjectiveValue || 0,
    solveTimeMs: solveTime,
    status: solution.Status,
  };
}
