import type { FastifyInstance } from 'fastify';
import { enumOptions } from '@ai-shortvideo/shared';
import { sendOk } from '../shared/reply.js';

export async function registerContractRoutes(app: FastifyInstance) {
  app.get(
    '/contracts/enums',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['success', 'data', 'error', 'requestId'],
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object', additionalProperties: true },
              error: { type: 'null' },
              requestId: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => sendOk(request, reply, enumOptions)
  );
}
