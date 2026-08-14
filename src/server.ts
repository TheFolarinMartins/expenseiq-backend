import 'dotenv/config';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './infrastructure/logger.js';
import { JsonStore } from './infrastructure/json-store.js';
import { LocalFileStore } from './infrastructure/file-store.js';

const config = loadConfig();
const logger = createLogger(config);
const store = new JsonStore(config.DATA_FILE);
const files = new LocalFileStore(config.STATEMENT_STORAGE_DIR);
await Promise.all([store.initialize(), files.initialize()]);
const app = createApp({ config, logger, store, files });
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'ExpenseIQ API listening');
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Graceful shutdown failed');
      process.exitCode = 1;
    }
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
