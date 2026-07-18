export enum ErrorCode {
  ValidationError = 'VALIDATION_ERROR',
  Unauthorized = 'UNAUTHORIZED',
  DependencyUnavailable = 'DEPENDENCY_UNAVAILABLE',
  NotFound = 'NOT_FOUND',
  PermissionDenied = 'PERMISSION_DENIED',
  LifecycleNotActive = 'LIFECYCLE_NOT_ACTIVE',
  InvalidStage = 'INVALID_STAGE',
  GateBlocked = 'GATE_BLOCKED',
  ConflictTaskExists = 'CONFLICT_TASK_EXISTS',
  VersionConflict = 'VERSION_CONFLICT',
  CandidateStale = 'CANDIDATE_STALE',
  IdempotencyConflict = 'IDEMPOTENCY_CONFLICT',
  ConfigMissing = 'CONFIG_MISSING',
  TaskNotRetryable = 'TASK_NOT_RETRYABLE',
  RetryNotAvailable = 'RETRY_NOT_AVAILABLE',
  ContentRiskBlocking = 'CONTENT_RISK_BLOCKING',
  VideoReferenceBlocking = 'VIDEO_REFERENCE_BLOCKING',
  PublishGateBlocked = 'PUBLISH_GATE_BLOCKED',
  PublishDuplicate = 'PUBLISH_DUPLICATE',
  MetricBackfillInvalid = 'METRIC_BACKFILL_INVALID',
  InternalError = 'INTERNAL_ERROR'
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiSuccessResponse<TData> {
  success: true;
  data: TData;
  error: null;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  data: null;
  error: ApiError;
  requestId: string;
}

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

export interface PagedResult<TItem> {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ErrorDefinition {
  code: ErrorCode;
  httpStatus: number;
  message: string;
}

export const errorDefinitions: Record<ErrorCode, ErrorDefinition> = {
  [ErrorCode.ValidationError]: {
    code: ErrorCode.ValidationError,
    httpStatus: 400,
    message: '请求参数不合法'
  },
  [ErrorCode.Unauthorized]: {
    code: ErrorCode.Unauthorized,
    httpStatus: 401,
    message: '身份认证失败'
  },
  [ErrorCode.DependencyUnavailable]: {
    code: ErrorCode.DependencyUnavailable,
    httpStatus: 503,
    message: '身份服务暂时不可用'
  },
  [ErrorCode.NotFound]: {
    code: ErrorCode.NotFound,
    httpStatus: 404,
    message: '对象不存在'
  },
  [ErrorCode.PermissionDenied]: {
    code: ErrorCode.PermissionDenied,
    httpStatus: 403,
    message: '无权限'
  },
  [ErrorCode.LifecycleNotActive]: {
    code: ErrorCode.LifecycleNotActive,
    httpStatus: 409,
    message: '小说已暂停、归档或删除'
  },
  [ErrorCode.InvalidStage]: {
    code: ErrorCode.InvalidStage,
    httpStatus: 409,
    message: '当前阶段不允许该动作'
  },
  [ErrorCode.GateBlocked]: {
    code: ErrorCode.GateBlocked,
    httpStatus: 409,
    message: '门禁阻塞'
  },
  [ErrorCode.ConflictTaskExists]: {
    code: ErrorCode.ConflictTaskExists,
    httpStatus: 409,
    message: '存在冲突任务'
  },
  [ErrorCode.VersionConflict]: {
    code: ErrorCode.VersionConflict,
    httpStatus: 409,
    message: '页面版本或当前版本已变化'
  },
  [ErrorCode.CandidateStale]: {
    code: ErrorCode.CandidateStale,
    httpStatus: 409,
    message: '候选已过期'
  },
  [ErrorCode.IdempotencyConflict]: {
    code: ErrorCode.IdempotencyConflict,
    httpStatus: 409,
    message: '幂等键对应不同请求'
  },
  [ErrorCode.ConfigMissing]: {
    code: ErrorCode.ConfigMissing,
    httpStatus: 500,
    message: '模型、策略或模板配置缺失'
  },
  [ErrorCode.TaskNotRetryable]: {
    code: ErrorCode.TaskNotRetryable,
    httpStatus: 409,
    message: '当前失败不可重试'
  },
  [ErrorCode.RetryNotAvailable]: {
    code: ErrorCode.RetryNotAvailable,
    httpStatus: 409,
    message: '当前阶段暂不支持任务重试'
  },
  [ErrorCode.ContentRiskBlocking]: {
    code: ErrorCode.ContentRiskBlocking,
    httpStatus: 409,
    message: '内容安全强阻塞'
  },
  [ErrorCode.VideoReferenceBlocking]: {
    code: ErrorCode.VideoReferenceBlocking,
    httpStatus: 409,
    message: '视频引用异常阻塞'
  },
  [ErrorCode.PublishGateBlocked]: {
    code: ErrorCode.PublishGateBlocked,
    httpStatus: 409,
    message: '发布登记门禁阻塞'
  },
  [ErrorCode.PublishDuplicate]: {
    code: ErrorCode.PublishDuplicate,
    httpStatus: 409,
    message: '发布事实重复'
  },
  [ErrorCode.MetricBackfillInvalid]: {
    code: ErrorCode.MetricBackfillInvalid,
    httpStatus: 400,
    message: '回填数据不合法'
  },
  [ErrorCode.InternalError]: {
    code: ErrorCode.InternalError,
    httpStatus: 500,
    message: '系统异常'
  }
};

export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  return errorDefinitions[code];
}

export function createSuccessResponse<TData>(data: TData, requestId: string): ApiSuccessResponse<TData> {
  return {
    success: true,
    data,
    error: null,
    requestId
  };
}

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: unknown
): ApiErrorResponse {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details })
    },
    requestId
  };
}
