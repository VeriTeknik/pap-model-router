/**
 * JWT Authentication for PAP Model Router
 *
 * Verifies tokens issued by plugged.in Station
 */

import { jwtVerify } from 'jose';
import type { Request, Response, NextFunction } from 'express';
import type { JWTPayload } from './types.js';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

// Get JWT secret from environment
function getJwtSecret(): Uint8Array {
  const secret = process.env.MODEL_ROUTER_JWT_SECRET;
  if (!secret) {
    throw new Error('MODEL_ROUTER_JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Middleware to verify JWT tokens
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'plugged.in',
      audience: 'model-router',
    });

    // Attach user info to request
    req.user = payload as unknown as JWTPayload;
    next();
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({ error: 'Token expired' });
        return;
      }
      if (error.message.includes('signature')) {
        res.status(401).json({ error: 'Invalid token signature' });
        return;
      }
    }

    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Admin JWT authentication
 * Verifies JWT with admin:true claim for admin endpoints (pluggedin-app sync)
 */
export async function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header with Bearer token is required' });
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'plugged.in',
    });

    // Check for admin claim
    if (!payload.admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    req.user = payload as unknown as JWTPayload;
    next();
  } catch (error) {
    console.error('[AdminAuth] Token verification failed:', error);

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        res.status(401).json({ error: 'Token expired' });
        return;
      }
    }

    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optional authentication - doesn't fail if no token provided
 * Used for endpoints that can work with or without auth
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7).trim();

  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'plugged.in',
    });

    req.user = payload as unknown as JWTPayload;
  } catch {
    // Ignore auth errors for optional auth
  }

  next();
}
