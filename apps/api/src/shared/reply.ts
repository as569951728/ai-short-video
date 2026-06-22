import type { FastifyReply, FastifyRequest } from 'fastify';
import { createSuccessResponse } from '@ai-shortvideo/shared';

export function sendOk<TData>(request: FastifyRequest, reply: FastifyReply, data: TData) {
  return reply.send(createSuccessResponse(data, request.id));
}
