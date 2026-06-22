import type { FastifyInstance } from 'fastify';
import { sendOk } from '../shared/reply.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['success', 'data', 'error', 'requestId'],
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                required: ['service', 'status'],
                properties: {
                  service: { type: 'string' },
                  status: { type: 'string' }
                }
              },
              error: { type: 'null' },
              requestId: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) =>
      sendOk(request, reply, {
        service: 'ai-shortvideo-api',
        status: 'ok'
      })
  );
}
