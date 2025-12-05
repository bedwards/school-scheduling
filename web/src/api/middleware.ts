/**
 * API Middleware - Authentication & Authorization
 */

import { Context, Next } from 'hono';
import { verifyToken, extractBearerToken, type JWTPayload } from '../auth/jwt';
import type { Env } from '../worker';

// Extend Hono context with user info
declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
    userId: string;
  }
}

/**
 * Authentication middleware - verifies JWT and sets user context
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);

  if (!token) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
    }, 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    }, 401);
  }

  if (payload.type !== 'access') {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token type',
      },
    }, 401);
  }

  // Set user context for downstream handlers
  c.set('user', payload);
  c.set('userId', payload.sub);

  await next();
}

/**
 * Admin-only middleware - requires admin role
 */
export async function adminMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get('user');

  if (!user || user.role !== 'admin') {
    return c.json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    }, 403);
  }

  await next();
}

/**
 * School access middleware - verifies user has access to the school
 */
export async function schoolAccessMiddleware(
  requiredLevel: 'read' | 'write' | 'admin' = 'read'
) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const userId = c.get('userId');
    const schoolId = c.req.param('schoolId');

    if (!schoolId) {
      return c.json({
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'School ID is required',
        },
      }, 400);
    }

    // Check school access
    const access = await c.env.DB.prepare(`
      SELECT access_level FROM school_access
      WHERE school_id = ? AND user_id = ?
    `).bind(schoolId, userId).first<{ access_level: string }>();

    if (!access) {
      return c.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this school',
        },
      }, 403);
    }

    // Check access level
    const levels = { read: 1, write: 2, admin: 3 };
    const userLevel = levels[access.access_level as keyof typeof levels] || 0;
    const requiredLevelNum = levels[requiredLevel];

    if (userLevel < requiredLevelNum) {
      return c.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `${requiredLevel} access required`,
        },
      }, 403);
    }

    await next();
  };
}

/**
 * Rate limiting helper (simple in-memory, consider KV for production)
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  limit: number,
  windowMs: number
) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `${ip}:${c.req.path}`;
    const now = Date.now();

    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= limit) {
      return c.json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      }, 429);
    } else {
      entry.count++;
    }

    await next();
  };
}

/**
 * Audit logging helper
 */
export async function auditLog(
  db: D1Database,
  userId: string | null,
  action: string,
  resourceType: string,
  resourceId: string | null,
  details: unknown,
  ipAddress: string | null
) {
  await db.prepare(`
    INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details_json, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    userId,
    action,
    resourceType,
    resourceId,
    JSON.stringify(details),
    ipAddress
  ).run();
}
