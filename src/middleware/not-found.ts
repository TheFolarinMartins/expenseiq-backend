import type { RequestHandler } from 'express';
import { AppError } from '../shared/errors.js';

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};
