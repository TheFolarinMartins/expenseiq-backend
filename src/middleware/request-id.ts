import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestId: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-request-id');
  const id = supplied && supplied.length <= 128 ? supplied : randomUUID();
  response.setHeader('x-request-id', id);
  response.locals.requestId = id;
  next();
};
