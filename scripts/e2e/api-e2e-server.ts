import type { FastifyInstance } from 'fastify';

const FORBIDDEN_ENV_KEYS = [
  'DATABASE_URL',
  'DEEPSEEK_API_KEY',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'TTS_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_ENDPOINT',
  'S3_BUCKET',
  'COS_SECRET_ID',
  'COS_SECRET_KEY',
  'MEDIA_STORAGE_URL',
  'STORAGE_ENDPOINT'
];

function assertSafeE2eEnv(env: NodeJS.ProcessEnv) {
  const present = FORBIDDEN_ENV_KEYS.filter((key) => Boolean(env[key]));
  if (present.length > 0) {
    throw new Error(`RP-01A E2E refuses real environment variables: ${present.join(', ')}`);
  }
  if (env.E2E_PROFILE && env.E2E_PROFILE !== 'rp01a-local-inmemory') {
    throw new Error(`RP-01A E2E only allows profile rp01a-local-inmemory, got ${env.E2E_PROFILE}`);
  }
  if (env.AI_PROVIDER_MODE && env.AI_PROVIDER_MODE !== 'mock') {
    throw new Error('RP-01A E2E only allows AI_PROVIDER_MODE=mock');
  }
}

void main();

async function main() {
  assertSafeE2eEnv(process.env);

  if (process.env.E2E_FORCE_API_START_FAILURE === '1') {
    throw new Error('RP-01A injected API start failure');
  }

  const [{ buildApp }, { createInMemoryNovelRepository }, { createInMemoryVideoRepository }] = await Promise.all([
    import('../../apps/api/src/app.js'),
    import('../../apps/api/src/modules/novels/repositories/inMemoryNovelRepository.js'),
    import('../../apps/api/src/modules/videos/repositories/inMemoryVideoRepository.js')
  ]);

  const port = Number(process.env.PORT ?? 0);
  const testOnlyRequestContextOptions = process.env.E2E_PROFILE === 'rp01a-local-inmemory'
    ? {
        requestContextResolver: async (request: {
          id: string;
          ip: string;
          headers: Record<string, string | string[] | undefined>;
        }) => ({
          tenantId: 'tenant_rp01a_e2e',
          userId: 'user_rp01a_e2e',
          requestId: request.id,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        })
      }
    : {};
  const app: FastifyInstance = await buildApp({
    logger: false,
    novelRepository: createInMemoryNovelRepository(),
    videoRepository: createInMemoryVideoRepository(),
    aiProviderEnv: { AI_PROVIDER_MODE: 'mock' },
    ...testOnlyRequestContextOptions
  });

  await app.listen({ host: '127.0.0.1', port });
  console.log(`RP-01A API ready on ${port}`);

  async function close() {
    await app.close();
  }

  process.once('SIGTERM', () => {
    close().finally(() => process.exit(0));
  });
  process.once('SIGINT', () => {
    close().finally(() => process.exit(0));
  });
}
