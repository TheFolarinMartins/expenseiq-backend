import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import type { AppConfig } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import type { Logger } from 'pino';
import { JsonStore } from './infrastructure/json-store.js';
import { LocalFileStore } from './infrastructure/file-store.js';
import { createRoutes } from './routes.js';
import { openApiDocument } from './openapi.js';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  readiness?: () => Promise<boolean>;
  store?: JsonStore;
  files?: LocalFileStore;
}

export function createApp({
  config,
  logger,
  readiness = () => Promise.resolve(true),
  store = new JsonStore(config.DATA_FILE),
  files = new LocalFileStore(config.STATEMENT_STORAGE_DIR),
}: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(pinoHttp({ logger }));
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/openapi.json', (_request, response) => response.json(openApiDocument));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }));
  app.use('/api', createRoutes({ config, store, files }));

  app.get('/health/live', (_request, response) => {
    response.json({ data: { status: 'ok' } });
  });

  app.get('/health/ready', async (_request, response, next) => {
    try {
      const ready = await readiness();
      response.status(ready ? 200 : 503).json({ data: { status: ready ? 'ready' : 'not_ready' } });
    } catch (error) {
      next(error);
    }
  });

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
