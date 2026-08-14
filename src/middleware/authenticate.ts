import jwt from 'jsonwebtoken';
import type { Request, RequestHandler } from 'express';
import { AppError } from '../shared/errors.js';
export function authenticate(secret: string): RequestHandler {
  return (request, _response, next) => {
    const value = request.header('authorization');
    if (!value?.startsWith('Bearer ')) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
      return;
    }
    try {
      const payload = jwt.verify(value.slice(7), secret);
      if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error();
      (request as Request & { user: { id: string; role: 'USER' | 'ADMIN' } }).user = {
        id: payload.sub,
        role: payload.role === 'ADMIN' ? 'ADMIN' : 'USER',
      };
      next();
    } catch {
      next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is invalid or expired.'));
    }
  };
}
