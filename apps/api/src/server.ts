import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { ConfigError, loadConfig } from '@openbahia/shared';
import { buildApp } from './app.js';
import { createProvider } from './lib/providers.js';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv();

let config;
try {
  config = loadConfig();
} catch (error) {
  const message = error instanceof ConfigError ? error.message : String(error);
  console.error(`Fatal config: ${message}`);
  process.exit(1);
}
if (!process.env.STATIC_CACHE_DIR) {
  config.staticCacheDir = resolve(process.cwd(), '../../data/cache');
}
const provider = createProvider(config);
const app = await buildApp({ config, provider, startPolling: true });

function shutdown(signal: string): void {
  app.log.info({ signal }, 'graceful shutdown');
  void app
    .close()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      app.log.fatal(error);
      process.exit(1);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  app.log.fatal(error, 'uncaughtException');
  process.exit(1);
});
process.on('unhandledRejection', (error) => {
  app.log.fatal({ err: error }, 'unhandledRejection');
  process.exit(1);
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.fatal(error);
  process.exit(1);
}
