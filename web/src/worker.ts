/**
 * School Scheduler - Cloudflare Worker Entry Point
 *
 * API Routes:
 * - POST /api/auth/register - Create new account
 * - POST /api/auth/login - Login and get tokens
 * - POST /api/auth/refresh - Refresh access token
 * - POST /api/auth/logout - Invalidate refresh token
 *
 * - GET /api/schools - List user's schools
 * - POST /api/schools - Create new school
 * - GET /api/schools/:id - Get school details
 *
 * - CRUD for /api/schools/:id/students
 * - CRUD for /api/schools/:id/teachers
 * - CRUD for /api/schools/:id/courses
 * - CRUD for /api/schools/:id/rooms
 *
 * - POST /api/schools/:id/import - Bulk import data
 * - POST /api/schools/:id/schedules/generate - Generate schedule
 * - GET /api/schools/:id/schedules - List schedules
 * - GET /api/schools/:id/schedules/:scheduleId - Get schedule details
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';

import { authRoutes } from './api/auth';
import { schoolRoutes } from './api/schools';
import { studentRoutes } from './api/students';
import { teacherRoutes } from './api/teachers';
import { courseRoutes } from './api/courses';
import { roomRoutes } from './api/rooms';
import { scheduleRoutes } from './api/schedules';
import { authMiddleware } from './api/middleware';

// Environment bindings type
export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

// Create Hono app with typed environment
const app = new Hono<{ Bindings: Env }>();

// ============================================================================
// Global Middleware
// ============================================================================

// Security headers
app.use('*', secureHeaders());

// CORS configuration
app.use('/api/*', cors({
  origin: (origin) => {
    // In production, restrict to your domain
    // In development, allow localhost
    if (!origin) return '*';
    if (origin.includes('localhost')) return origin;
    if (origin.includes('school-scheduler')) return origin;
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
}));

// Request logging (only in development)
app.use('*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'development') {
    console.log(`${c.req.method} ${c.req.path}`);
  }
  await next();
});

// ============================================================================
// Health Check (no auth required)
// ============================================================================

app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  });
});

// ============================================================================
// Auth Routes (no auth required)
// ============================================================================

app.route('/api/auth', authRoutes);

// ============================================================================
// Protected Routes (auth required)
// ============================================================================

// Apply auth middleware to all routes below
app.use('/api/schools/*', authMiddleware);
app.use('/api/schools', authMiddleware);

// School management
app.route('/api/schools', schoolRoutes);

// School data (nested under schools)
app.route('/api/schools/:schoolId/students', studentRoutes);
app.route('/api/schools/:schoolId/teachers', teacherRoutes);
app.route('/api/schools/:schoolId/courses', courseRoutes);
app.route('/api/schools/:schoolId/rooms', roomRoutes);
app.route('/api/schools/:schoolId/schedules', scheduleRoutes);

// ============================================================================
// Error Handling
// ============================================================================

app.onError((err, c) => {
  console.error('Unhandled error:', err);

  // Don't expose internal errors in production
  const message = c.env.ENVIRONMENT === 'development'
    ? err.message
    : 'Internal server error';

  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
    },
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
  }, 404);
});

// Export for Cloudflare Workers
export default app;
