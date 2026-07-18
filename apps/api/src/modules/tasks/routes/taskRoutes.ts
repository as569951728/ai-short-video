import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorCode, type CancelTaskRequest, type RetryTaskRequest } from '@ai-shortvideo/shared';
import { sendOk } from '../../../shared/reply.js';
import { BusinessError } from '../../../shared/errors.js';
import type { NovelRepository, RequestContext, RequestContextResolver } from '../../novels/domain/novelDomain.js';
import { TaskService } from '../services/taskService.js';

interface RegisterTaskRoutesOptions {
  repository: NovelRepository;
  now?: () => Date;
  requestContextResolver?: RequestContextResolver;
}

const responseEnvelopeSchema = {
  type: 'object',
  required: ['success', 'data', 'error', 'requestId'],
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', additionalProperties: true },
    error: { type: 'null' },
    requestId: { type: 'string' }
  }
} as const;

const taskIdParamsSchema = {
  type: 'object',
  required: ['taskId'],
  properties: {
    taskId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const taskActionBodySchema = {
  type: 'object',
  properties: {
    reason: { type: ['string', 'null'], maxLength: 1000 }
  },
  additionalProperties: false
} as const;

export async function registerTaskRoutes(app: FastifyInstance, options: RegisterTaskRoutesOptions) {
  const taskService = new TaskService(options);

  app.get(
    '/tasks/:taskId',
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const data = await taskService.getTask(taskId, await resolveTaskContext(options.requestContextResolver, request));

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/tasks/:taskId/events',
    {
      schema: {
        params: taskIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const data = await taskService.getTaskEvents(taskId, await resolveTaskContext(options.requestContextResolver, request));

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/tasks/:taskId/retry',
    {
      schema: {
        params: taskIdParamsSchema,
        body: taskActionBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const data = await taskService.retryTask(
        taskId,
        (request.body ?? {}) as RetryTaskRequest,
        await resolveTaskContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/tasks/:taskId/cancel',
    {
      schema: {
        params: taskIdParamsSchema,
        body: taskActionBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const data = await taskService.cancelTask(
        taskId,
        (request.body ?? {}) as CancelTaskRequest,
        await resolveTaskContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );
}

async function resolveTaskContext(
  resolver: RequestContextResolver | undefined,
  request: FastifyRequest
): Promise<RequestContext> {
  if (!resolver) throw new BusinessError(ErrorCode.Unauthorized, '当前请求缺少可信身份。');
  let actor;
  try {
    actor = await resolver(request);
  } catch {
    throw new BusinessError(ErrorCode.DependencyUnavailable, '身份服务暂时不可用。');
  }
  const tenantId = actor?.tenantId?.trim() ?? '';
  const userId = actor?.userId?.trim() ?? '';
  if (!tenantId || !userId || tenantId === 'tenant_default' || userId === 'user_default') {
    throw new BusinessError(ErrorCode.Unauthorized, '当前请求缺少可信身份。');
  }
  return Object.freeze({
    tenantId,
    userId,
    requestId: request.id,
    ip: request.ip,
    userAgent: getHeader(request.headers['user-agent'])
  });
}

function getHeader(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] : header;
}
