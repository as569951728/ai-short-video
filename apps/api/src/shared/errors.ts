import {
  ErrorCode,
  createErrorResponse,
  getErrorDefinition,
  type ApiErrorResponse
} from '@ai-shortvideo/shared';
import { isLlmProviderError } from '../modules/ai/llmClient.js';

export class BusinessError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    super(message ?? getErrorDefinition(code).message);
    this.name = 'BusinessError';
    this.code = code;
    this.details = details;
  }
}

export function toErrorResponse(error: unknown, requestId: string): { statusCode: number; body: ApiErrorResponse } {
  if (error instanceof BusinessError) {
    const definition = getErrorDefinition(error.code);
    return {
      statusCode: definition.httpStatus,
      body: createErrorResponse(error.code, error.message, requestId, error.details)
    };
  }

  if (isFastifyValidationError(error)) {
    const definition = getErrorDefinition(ErrorCode.ValidationError);
    return {
      statusCode: definition.httpStatus,
      body: createErrorResponse(ErrorCode.ValidationError, definition.message, requestId, {
        issues: error.validation.map((issue) => ({
          path: issue.instancePath.replace(/^\//, '') || issue.params?.missingProperty || issue.schemaPath,
          message: issue.message ?? definition.message
        }))
      })
    };
  }

  if (isLlmProviderError(error)) {
    const code = error.category === 'configuration_error' ? ErrorCode.ConfigMissing : ErrorCode.InternalError;
    const definition = getErrorDefinition(code);
    return {
      statusCode: definition.httpStatus,
      body: createErrorResponse(code, error.message, requestId, {
        category: error.category,
        ...(error.details ?? {})
      })
    };
  }

  const definition = getErrorDefinition(ErrorCode.InternalError);
  return {
    statusCode: definition.httpStatus,
    body: createErrorResponse(ErrorCode.InternalError, definition.message, requestId)
  };
}

function isFastifyValidationError(error: unknown): error is {
  validation: Array<{
    instancePath: string;
    schemaPath: string;
    message?: string;
    params?: {
      missingProperty?: string;
    };
  }>;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    Array.isArray((error as { validation?: unknown }).validation)
  );
}
