#!/usr/bin/env npx tsx
/**
 * Screenshot Testing Framework for School Scheduler
 *
 * Usage:
 *   npx tsx scripts/screenshot-test.ts capture --url http://localhost:8787 --output ./screenshots
 *   npx tsx scripts/screenshot-test.ts verify --screenshot ./screenshots/dashboard.png --description "Dashboard should show school stats"
 *   npx tsx scripts/screenshot-test.ts compare --before ./screenshots/v1 --after ./screenshots/v2
 *
 * Requirements:
 *   - Playwright for capturing (npm install playwright)
 *   - Claude Code can read PNG files directly
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const program = new Command();

program
  .name('screenshot-test')
  .description('Screenshot testing framework for School Scheduler web app')
  .version('1.0.0');

// ============================================================================
// capture - Capture screenshots from a running app
// ============================================================================

program
  .command('capture')
  .description('Capture screenshots from the web app')
  .requiredOption('-u, --url <url>', 'Base URL of the app (e.g., http://localhost:8787)')
  .option('-o, --output <dir>', 'Output directory', './screenshots')
  .option('--auth <token>', 'Authorization token for authenticated pages')
  .option('--pages <pages>', 'Comma-separated list of pages to capture', 'home,login,dashboard,students,schedule')
  .action(async (options) => {
    const { url, output, auth, pages } = options;
    const pageList = pages.split(',').map((p: string) => p.trim());

    console.log(`Capturing screenshots from ${url}`);
    console.log(`Output directory: ${output}`);
    console.log(`Pages: ${pageList.join(', ')}`);

    // Ensure output directory exists
    fs.mkdirSync(output, { recursive: true });

    // Page configurations
    const pageConfigs: Record<string, { path: string; requiresAuth: boolean }> = {
      home: { path: '/', requiresAuth: false },
      login: { path: '/login', requiresAuth: false },
      register: { path: '/register', requiresAuth: false },
      dashboard: { path: '/dashboard', requiresAuth: true },
      students: { path: '/schools/:id/students', requiresAuth: true },
      teachers: { path: '/schools/:id/teachers', requiresAuth: true },
      courses: { path: '/schools/:id/courses', requiresAuth: true },
      rooms: { path: '/schools/:id/rooms', requiresAuth: true },
      schedule: { path: '/schools/:id/schedules', requiresAuth: true },
      'schedule-view': { path: '/schools/:id/schedules/:scheduleId', requiresAuth: true },
    };

    // Generate Playwright script
    const playwrightScript = generatePlaywrightScript(url, output, pageList, pageConfigs, auth);
    const scriptPath = path.join(output, '_capture.mjs');
    fs.writeFileSync(scriptPath, playwrightScript);

    console.log('\nGenerated Playwright script. Run with:');
    console.log(`  npx playwright test ${scriptPath}`);
    console.log('\nOr install playwright and run directly:');
    console.log('  npm install playwright');
    console.log(`  node ${scriptPath}`);
  });

// ============================================================================
// verify - Verify a screenshot matches expectations
// ============================================================================

program
  .command('verify')
  .description('Verify a screenshot against a description (uses Claude Code visual analysis)')
  .requiredOption('-s, --screenshot <path>', 'Path to screenshot PNG file')
  .requiredOption('-d, --description <desc>', 'Description of what the screenshot should show')
  .option('--strict', 'Fail on any discrepancy')
  .action(async (options) => {
    const { screenshot, description, strict } = options;

    // Check file exists
    if (!fs.existsSync(screenshot)) {
      console.error(`Screenshot not found: ${screenshot}`);
      process.exit(1);
    }

    // Get file info
    const stats = fs.statSync(screenshot);
    const sizeKB = Math.round(stats.size / 1024);

    console.log('\n=== Screenshot Verification ===');
    console.log(`File: ${screenshot}`);
    console.log(`Size: ${sizeKB} KB`);
    console.log(`Expected: ${description}`);
    console.log('\n--- To verify, open this file in Claude Code: ---');
    console.log(`Read the file: ${path.resolve(screenshot)}`);
    console.log('\nAsk Claude Code:');
    console.log(`"Analyze this screenshot. Does it show: ${description}?"`);
    console.log('\n--- Automated verification coming soon ---');

    // For now, output instructions for manual verification with Claude Code
    // Future: integrate with Claude API for automated visual verification
  });

// ============================================================================
// list - List all screenshots in a directory
// ============================================================================

program
  .command('list')
  .description('List all screenshots in a directory')
  .argument('<dir>', 'Directory containing screenshots')
  .action((dir) => {
    if (!fs.existsSync(dir)) {
      console.error(`Directory not found: ${dir}`);
      process.exit(1);
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.png'))
      .sort();

    console.log(`\nScreenshots in ${dir}:`);
    console.log('='.repeat(50));

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      const sizeKB = Math.round(stats.size / 1024);
      const mtime = stats.mtime.toISOString().slice(0, 19).replace('T', ' ');
      console.log(`  ${file.padEnd(30)} ${sizeKB.toString().padStart(6)} KB  ${mtime}`);
    }

    console.log(`\nTotal: ${files.length} screenshots`);
  });

// ============================================================================
// scenarios - Generate test scenarios
// ============================================================================

program
  .command('scenarios')
  .description('Output test scenarios for manual or automated testing')
  .action(() => {
    const scenarios = [
      {
        name: 'Login Flow',
        steps: [
          'Navigate to /login',
          'Screenshot: login page with email/password fields',
          'Enter valid credentials',
          'Screenshot: should redirect to dashboard',
        ],
      },
      {
        name: 'Dashboard Overview',
        steps: [
          'Navigate to /dashboard (authenticated)',
          'Screenshot: should show school cards with stats',
          'Click on a school',
          'Screenshot: should show school detail with student/teacher/course counts',
        ],
      },
      {
        name: 'Data Entry - Students',
        steps: [
          'Navigate to /schools/:id/students',
          'Screenshot: student list table',
          'Click "Add Student"',
          'Screenshot: student form with grade, required courses, elective preferences',
          'Submit valid student',
          'Screenshot: success message, student in list',
        ],
      },
      {
        name: 'Schedule Generation',
        steps: [
          'Navigate to /schools/:id/schedules',
          'Click "Generate Schedule"',
          'Screenshot: generation progress/loading',
          'Wait for completion',
          'Screenshot: schedule summary with score, stats',
          'Click "View Details"',
          'Screenshot: master schedule grid',
        ],
      },
      {
        name: 'Schedule Report',
        steps: [
          'Navigate to schedule detail page',
          'Screenshot: constraint summary (hard/soft violations)',
          'Screenshot: course enrollment summary',
          'Click "Student View"',
          'Screenshot: individual student schedule',
        ],
      },
    ];

    console.log('\n=== Screenshot Test Scenarios ===\n');

    for (const scenario of scenarios) {
      console.log(`## ${scenario.name}`);
      scenario.steps.forEach((step, i) => {
        const prefix = step.startsWith('Screenshot:') ? '📸' : '  ';
        console.log(`${prefix} ${i + 1}. ${step}`);
      });
      console.log();
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

function generatePlaywrightScript(
  baseUrl: string,
  outputDir: string,
  pages: string[],
  pageConfigs: Record<string, { path: string; requiresAuth: boolean }>,
  authToken?: string
): string {
  return `
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = '${baseUrl}';
const OUTPUT_DIR = '${outputDir}';
const AUTH_TOKEN = ${authToken ? `'${authToken}'` : 'null'};

async function captureScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // Set auth cookie/header if provided
  if (AUTH_TOKEN) {
    await context.addCookies([{
      name: 'auth_token',
      value: AUTH_TOKEN,
      domain: new URL(BASE_URL).hostname,
      path: '/',
    }]);
  }

  const page = await context.newPage();

  const pages = ${JSON.stringify(pages)};
  const configs = ${JSON.stringify(pageConfigs)};

  for (const pageName of pages) {
    const config = configs[pageName];
    if (!config) {
      console.log(\`Skipping unknown page: \${pageName}\`);
      continue;
    }

    if (config.requiresAuth && !AUTH_TOKEN) {
      console.log(\`Skipping \${pageName} (requires auth)\`);
      continue;
    }

    const url = BASE_URL + config.path.replace(':id', 'demo').replace(':scheduleId', 'latest');
    console.log(\`Capturing: \${pageName} -> \${url}\`);

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500); // Let animations settle

      const screenshotPath = path.join(OUTPUT_DIR, \`\${pageName}.png\`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(\`  Saved: \${screenshotPath}\`);
    } catch (error) {
      console.error(\`  Error capturing \${pageName}: \${error.message}\`);
    }
  }

  await browser.close();
  console.log('\\nDone!');
}

captureScreenshots().catch(console.error);
`;
}

// Run the CLI
program.parse();
