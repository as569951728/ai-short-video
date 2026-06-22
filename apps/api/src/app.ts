import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { registerContractRoutes } from './routes/contractRoutes.js';
import { registerHealthRoutes } from './routes/healthRoutes.js';
import { registerNovelRoutes } from './modules/novels/routes/novelRoutes.js';
import { registerTaskRoutes } from './modules/tasks/routes/taskRoutes.js';
import { toErrorResponse } from './shared/errors.js';
import type { LlmClient } from './modules/ai/llmClient.js';
import type { AiProviderEnv } from './modules/ai/modelRouting.js';
import type { NovelRepository } from './modules/novels/domain/novelDomain.js';
import { createNovelProvidersFromEnv } from './modules/novels/providers/providerFactory.js';
import { createInMemoryNovelRepository } from './modules/novels/repositories/inMemoryNovelRepository.js';
import { PrismaNovelRepository } from './modules/novels/repositories/prismaNovelRepository.js';
import { env } from './config/env.js';

interface BuildAppOptions {
  logger?: boolean;
  novelRepository?: NovelRepository;
  aiProviderEnv?: AiProviderEnv;
  llmClient?: LlmClient;
  now?: () => Date;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
    genReqId: (request) => {
      const requestId = request.headers['x-request-id'];
      return Array.isArray(requestId) ? requestId[0] : requestId ?? randomUUID();
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id, Idempotency-Key');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  });

  app.options(
    '/*',
    {
      schema: {
        response: {
          204: { type: 'null' }
        }
      }
    },
    async (_request, reply) => reply.status(204).send()
  );

  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = toErrorResponse(error, request.id);
    request.log.error({ err: error, errorCode: body.error.code }, body.error.message);
    reply.status(statusCode).send(body);
  });

  await registerHealthRoutes(app);
  await registerContractRoutes(app);
  const novelRepository = options.novelRepository ?? createDefaultNovelRepository();
  const novelProviders = createNovelProvidersFromEnv({
    env: options.aiProviderEnv,
    llmClient: options.llmClient
  });
  await registerNovelRoutes(app, {
    repository: novelRepository,
    ...novelProviders,
    now: options.now
  });
  await registerTaskRoutes(app, {
    repository: novelRepository,
    now: options.now
  });

  return app;
}

function createDefaultNovelRepository(): NovelRepository {
  if (!env.DATABASE_URL) {
    return createInMemoryNovelRepository();
  }

  return new PrismaNovelRepository();
}
