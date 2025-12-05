/**
 * Authentication API Routes
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../worker';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../auth/password';
import { generateAccessToken, generateRefreshToken, verifyToken, hashToken, verifyTokenHash } from '../auth/jwt';
import { rateLimit, auditLog } from './middleware';
import type { User, AuthTokens } from '../shared/types';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ============================================================================
// POST /api/auth/register
// ============================================================================

authRoutes.post('/register', rateLimit(5, 60000), async (c) => {
  try {
    const body = await c.req.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: result.error.flatten(),
        },
      }, 400);
    }

    const { email, password, name } = result.data;

    // Validate password strength
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return c.json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'Password does not meet requirements',
          details: passwordCheck.errors,
        },
      }, 400);
    }

    // Check if email already exists
    const existing = await c.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (existing) {
      return c.json({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists',
        },
      }, 409);
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const userId = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES (?, ?, ?, ?, 'user')
    `).bind(userId, email.toLowerCase(), passwordHash, name).run();

    // Create user object
    const user: User = {
      id: userId,
      email: email.toLowerCase(),
      name,
      role: 'user',
      createdAt: new Date().toISOString(),
    };

    // Generate tokens
    const accessToken = await generateAccessToken(user, c.env.JWT_SECRET);
    const refreshToken = await generateRefreshToken(user, c.env.JWT_SECRET);

    // Store refresh token hash
    const refreshTokenHash = await hashToken(refreshToken);
    await c.env.DB.prepare(`
      INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, datetime('now', '+7 days'), ?, ?)
    `).bind(
      crypto.randomUUID(),
      userId,
      refreshTokenHash,
      c.req.header('CF-Connecting-IP'),
      c.req.header('User-Agent')
    ).run();

    // Audit log
    await auditLog(
      c.env.DB,
      userId,
      'register',
      'user',
      userId,
      { email: email.toLowerCase() },
      c.req.header('CF-Connecting-IP') || null
    );

    return c.json({
      success: true,
      data: {
        user,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900, // 15 minutes
        } as AuthTokens,
      },
    }, 201);
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: 'Failed to create account',
      },
    }, 500);
  }
});

// ============================================================================
// POST /api/auth/login
// ============================================================================

authRoutes.post('/login', rateLimit(10, 60000), async (c) => {
  try {
    const body = await c.req.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: result.error.flatten(),
        },
      }, 400);
    }

    const { email, password } = result.data;

    // Find user
    const dbUser = await c.env.DB.prepare(`
      SELECT id, email, password_hash, name, role, created_at, last_login_at
      FROM users WHERE email = ?
    `).bind(email.toLowerCase()).first<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      role: 'admin' | 'user' | 'readonly';
      created_at: string;
      last_login_at: string | null;
    }>();

    if (!dbUser) {
      // Generic error to prevent email enumeration
      return c.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      }, 401);
    }

    // Verify password
    const passwordValid = await verifyPassword(password, dbUser.password_hash);
    if (!passwordValid) {
      await auditLog(
        c.env.DB,
        dbUser.id,
        'login_failed',
        'user',
        dbUser.id,
        { reason: 'invalid_password' },
        c.req.header('CF-Connecting-IP') || null
      );

      return c.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      }, 401);
    }

    // Update last login
    await c.env.DB.prepare(
      "UPDATE users SET last_login_at = datetime('now') WHERE id = ?"
    ).bind(dbUser.id).run();

    // Create user object
    const user: User = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      createdAt: dbUser.created_at,
      lastLoginAt: new Date().toISOString(),
    };

    // Generate tokens
    const accessToken = await generateAccessToken(user, c.env.JWT_SECRET);
    const refreshToken = await generateRefreshToken(user, c.env.JWT_SECRET);

    // Store refresh token hash
    const refreshTokenHash = await hashToken(refreshToken);
    await c.env.DB.prepare(`
      INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, datetime('now', '+7 days'), ?, ?)
    `).bind(
      crypto.randomUUID(),
      dbUser.id,
      refreshTokenHash,
      c.req.header('CF-Connecting-IP'),
      c.req.header('User-Agent')
    ).run();

    // Audit log
    await auditLog(
      c.env.DB,
      dbUser.id,
      'login',
      'user',
      dbUser.id,
      {},
      c.req.header('CF-Connecting-IP') || null
    );

    return c.json({
      success: true,
      data: {
        user,
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 900,
        } as AuthTokens,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: 'Failed to login',
      },
    }, 500);
  }
});

// ============================================================================
// POST /api/auth/refresh
// ============================================================================

authRoutes.post('/refresh', rateLimit(20, 60000), async (c) => {
  try {
    const body = await c.req.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return c.json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Refresh token is required',
        },
      }, 400);
    }

    // Verify refresh token
    const payload = await verifyToken(refreshToken, c.env.JWT_SECRET);
    if (!payload || payload.type !== 'refresh') {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired refresh token',
        },
      }, 401);
    }

    // Check if token exists in database and hasn't been revoked
    const tokenHash = await hashToken(refreshToken);
    const session = await c.env.DB.prepare(`
      SELECT s.id, s.user_id, u.email, u.name, u.role, u.created_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.refresh_token_hash = ? AND s.expires_at > datetime('now')
    `).bind(tokenHash).first<{
      id: string;
      user_id: string;
      email: string;
      name: string;
      role: 'admin' | 'user' | 'readonly';
      created_at: string;
    }>();

    if (!session) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token has been revoked or expired',
        },
      }, 401);
    }

    // Create user object
    const user: User = {
      id: session.user_id,
      email: session.email,
      name: session.name,
      role: session.role,
      createdAt: session.created_at,
    };

    // Generate new access token
    const accessToken = await generateAccessToken(user, c.env.JWT_SECRET);

    return c.json({
      success: true,
      data: {
        accessToken,
        expiresIn: 900,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({
      success: false,
      error: {
        code: 'REFRESH_FAILED',
        message: 'Failed to refresh token',
      },
    }, 500);
  }
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================

authRoutes.post('/logout', async (c) => {
  try {
    const body = await c.req.json();
    const { refreshToken } = body;

    if (refreshToken) {
      // Revoke the refresh token
      const tokenHash = await hashToken(refreshToken);
      await c.env.DB.prepare(
        'DELETE FROM sessions WHERE refresh_token_hash = ?'
      ).bind(tokenHash).run();
    }

    return c.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({
      success: true, // Still return success even if cleanup fails
      data: { message: 'Logged out' },
    });
  }
});
