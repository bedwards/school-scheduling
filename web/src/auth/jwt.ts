/**
 * JWT Authentication for School Scheduler
 * Uses jose library for JWT operations (works in Cloudflare Workers)
 */

import * as jose from 'jose';
import type { User, UserId } from '../shared/types';

// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 days

export interface JWTPayload {
  sub: UserId;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'readonly';
  type: 'access' | 'refresh';
}

/**
 * Generate a new access token
 */
export async function generateAccessToken(
  user: User,
  secret: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new jose.SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .setIssuer('school-scheduler')
    .setAudience('school-scheduler-web')
    .sign(secretKey);

  return token;
}

/**
 * Generate a new refresh token
 */
export async function generateRefreshToken(
  user: User,
  secret: string
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);

  const token = await new jose.SignJWT({
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .setIssuer('school-scheduler')
    .setAudience('school-scheduler-web')
    .sign(secretKey);

  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const secretKey = new TextEncoder().encode(secret);

    const { payload } = await jose.jwtVerify(token, secretKey, {
      issuer: 'school-scheduler',
      audience: 'school-scheduler-web',
    });

    return {
      sub: payload.sub as UserId,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as 'admin' | 'user' | 'readonly',
      type: payload.type as 'access' | 'refresh',
    };
  } catch {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Hash a refresh token for storage (we don't store raw tokens)
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compare a token with its hash
 */
export async function verifyTokenHash(token: string, hash: string): Promise<boolean> {
  const tokenHash = await hashToken(token);
  return tokenHash === hash;
}
