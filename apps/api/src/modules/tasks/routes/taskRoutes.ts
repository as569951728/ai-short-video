import type { FastifyInstance } from 'fastify';
import type { CancelTaskRequest, RetryTaskRequest } from '@ai-shortvideo/shared';
import { sendOk } from '../../../shared/reply.js';
import type { NovelRepository } from '../../novels/domain/novelDomain.js';
import { createDefaultRequestContext } from '../../novels/services/novelService.js';
import { TaskService } from '../services/taskService.js';

interface RegisterTaskRoutesOptions {
  repository: NovelRepository;
  now?: () => Date;
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
      const data = await taskService.getTask(taskId, createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent'])));

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
      const data = await taskService.getTaskEvents(taskId, createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent'])));

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
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
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
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );
}

function getHeader(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] : header;
}
