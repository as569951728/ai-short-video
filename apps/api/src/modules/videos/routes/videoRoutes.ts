import type { FastifyInstance } from 'fastify';
import type {
  CreateVideoProjectRequest,
  ConfirmVideoNarrationRequest,
  ConfirmVideoRenderRequest,
  ConfirmVideoSubtitleRequest,
  ConfirmVideoTtsRequest,
  ConfirmVideoVisualPlanRequest,
  CreateVideoExportRequest,
  GenerateVideoNarrationRequest,
  GenerateVideoRenderRequest,
  GenerateVideoSubtitleRequest,
  GenerateVideoTtsRequest,
  RecheckVideoReferenceRequest,
  RejectVideoNarrationRequest,
  RejectVideoRenderRequest,
  RejectVideoSubtitleRequest,
  RejectVideoTtsRequest,
  RejectVideoVisualPlanRequest,
  ResolveVideoReferenceIssueRequest,
  SaveVideoNarrationDraftRequest,
  SaveVideoSubtitleDraftRequest,
  SaveVideoVisualPlanRequest,
  StopVideoProjectRequest,
  VideoLifecycleStatus,
  VideoProductionStatus,
  VideoReferenceStatus
} from '@ai-shortvideo/shared';
import { sendOk } from '../../../shared/reply.js';
import type { VideoRepository } from '../domain/videoDomain.js';
import { createVideoRequestContext, VideoService } from '../services/videoService.js';

interface RegisterVideoRoutesOptions {
  repository: VideoRepository;
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

const listQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    keyword: { type: 'string', maxLength: 100 },
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    referenceStatus: { type: 'string', enum: ['normal', 'info', 'warning', 'blocking', 'resolved'] },
    lifecycleStatus: { type: 'string', enum: ['active', 'stopped', 'archived'] },
    productionStatus: { type: 'string', enum: ['not_started', 'ready_for_generation', 'generation_locked'] }
  },
  additionalProperties: false
} as const;

const sourceQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    keyword: { type: 'string', maxLength: 100 }
  },
  additionalProperties: false
} as const;

const videoIdParamsSchema = {
  type: 'object',
  required: ['videoId'],
  properties: {
    videoId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const issueParamsSchema = {
  type: 'object',
  required: ['videoId', 'issueId'],
  properties: {
    videoId: { type: 'string', minLength: 1, maxLength: 80 },
    issueId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const narrationParamsSchema = {
  type: 'object',
  required: ['videoId', 'artifactId'],
  properties: {
    videoId: { type: 'string', minLength: 1, maxLength: 80 },
    artifactId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const ttsParamsSchema = narrationParamsSchema;
const subtitleParamsSchema = narrationParamsSchema;
const visualPlanParamsSchema = narrationParamsSchema;

const renderParamsSchema = {
  type: 'object',
  required: ['videoId', 'renderId'],
  properties: {
    videoId: { type: 'string', minLength: 1, maxLength: 80 },
    renderId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const idempotencyTokenSchema = { type: 'string', minLength: 8, maxLength: 160, pattern: '^[A-Za-z0-9:_-]+$' } as const;

const createVideoBodySchema = {
  type: 'object',
  required: ['novelId', 'videoReadinessSnapshotId', 'projectType', 'chapterRange', 'idempotencyToken'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    videoReadinessSnapshotId: { type: 'string', minLength: 1, maxLength: 80 },
    projectType: { type: 'string', enum: ['first_test', 'chapter_range', 'full_book_seed'] },
    title: { type: 'string', minLength: 1, maxLength: 120 },
    chapterRange: {
      type: 'object',
      required: ['mode', 'chapterIds'],
      properties: {
        mode: { type: 'string', enum: ['first_recommended', 'custom'] },
        chapterIds: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 80 },
          maxItems: 20
        }
      },
      additionalProperties: false
    },
    idempotencyToken: idempotencyTokenSchema,
    duplicatePolicy: { type: 'string', enum: ['return_existing', 'create_distinct'] }
  },
  additionalProperties: false
} as const;

const recheckBodySchema = {
  type: 'object',
  required: ['expectedReferenceVersion', 'idempotencyToken'],
  properties: {
    expectedReferenceVersion: { type: 'integer', minimum: 1 },
    reason: { type: 'string', maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const resolveIssueBodySchema = {
  type: 'object',
  required: ['action', 'reason', 'idempotencyToken'],
  properties: {
    action: { type: 'string', enum: ['ignore', 'resolve', 'stop_project'] },
    reason: { type: 'string', minLength: 4, maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const stopBodySchema = {
  type: 'object',
  required: ['reason', 'idempotencyToken'],
  properties: {
    reason: { type: 'string', minLength: 4, maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const generateNarrationBodySchema = {
  type: 'object',
  required: ['expectedReferenceVersion', 'videoUnitId', 'idempotencyToken'],
  properties: {
    expectedReferenceVersion: { type: 'integer', minimum: 1 },
    videoUnitId: { type: 'string', minLength: 1, maxLength: 80 },
    candidateCount: { type: 'integer', minimum: 1, maximum: 3, default: 3 },
    qualityMode: { type: 'string', enum: ['fast', 'standard', 'high_quality'], default: 'standard' },
    retryOfTaskId: { type: 'string', minLength: 1, maxLength: 80 },
    mockTaskOutcome: { type: 'string', enum: ['success', 'failed', 'cancelled'], default: 'success' },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const saveNarrationDraftBodySchema = {
  type: 'object',
  required: ['contentText', 'hook', 'firstScreenSubtitle', 'endingHook', 'reason', 'idempotencyToken'],
  properties: {
    baseArtifactId: { type: 'string', minLength: 1, maxLength: 80 },
    contentText: { type: 'string', minLength: 20, maxLength: 10000 },
    hook: { type: 'string', minLength: 1, maxLength: 500 },
    firstScreenSubtitle: { type: 'string', minLength: 1, maxLength: 500 },
    endingHook: { type: 'string', minLength: 1, maxLength: 500 },
    reason: { type: 'string', minLength: 4, maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const confirmNarrationBodySchema = {
  type: 'object',
  required: ['expectedVersionNo', 'idempotencyToken'],
  properties: {
    expectedVersionNo: { type: 'integer', minimum: 1 },
    riskContinueReason: { type: 'string', minLength: 4, maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const rejectNarrationBodySchema = {
  type: 'object',
  required: ['reason', 'idempotencyToken'],
  properties: {
    reason: { type: 'string', minLength: 4, maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const generateTtsBodySchema = {
  type: 'object',
  required: [
    'expectedReferenceVersion',
    'videoUnitId',
    'narrationArtifactId',
    'expectedNarrationVersionNo',
    'voiceId',
    'speed',
    'emotion',
    'volume',
    'idempotencyToken'
  ],
  properties: {
    expectedReferenceVersion: { type: 'integer', minimum: 1 },
    videoUnitId: { type: 'string', minLength: 1, maxLength: 80 },
    narrationArtifactId: { type: 'string', minLength: 1, maxLength: 80 },
    expectedNarrationVersionNo: { type: 'integer', minimum: 1 },
    voiceId: { type: 'string', minLength: 1, maxLength: 120 },
    voiceName: { type: 'string', minLength: 1, maxLength: 120 },
    speed: { type: 'number', minimum: 0.5, maximum: 2 },
    emotion: { type: 'string', enum: ['calm', 'suspense', 'excited', 'warm'] },
    volume: { type: 'integer', minimum: 0, maximum: 100 },
    qualityMode: { type: 'string', enum: ['fast', 'standard', 'high_quality'], default: 'standard' },
    retryOfTaskId: { type: 'string', minLength: 1, maxLength: 80 },
    mockTaskOutcome: { type: 'string', enum: ['success', 'failed', 'cancelled'], default: 'success' },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const confirmTtsBodySchema = confirmNarrationBodySchema;
const rejectTtsBodySchema = rejectNarrationBodySchema;

const generateSubtitleBodySchema = {
  type: 'object',
  required: ['expectedReferenceVersion', 'videoUnitId', 'ttsArtifactId', 'expectedTtsVersionNo', 'idempotencyToken'],
  properties: {
    expectedReferenceVersion: { type: 'integer', minimum: 1 },
    videoUnitId: { type: 'string', minLength: 1, maxLength: 80 },
    ttsArtifactId: { type: 'string', minLength: 1, maxLength: 80 },
    expectedTtsVersionNo: { type: 'integer', minimum: 1 },
    subtitleStyle: { type: 'string', enum: ['compact', 'balanced', 'dramatic'], default: 'balanced' },
    lineLength: { type: 'integer', minimum: 10, maximum: 28, default: 18 },
    qualityMode: { type: 'string', enum: ['fast', 'standard', 'high_quality'], default: 'standard' },
    retryOfTaskId: { type: 'string', minLength: 1, maxLength: 80 },
    mockTaskOutcome: { type: 'string', enum: ['success', 'failed', 'cancelled'], default: 'success' },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const saveSubtitleDraftBodySchema = {
  type: 'object',
  required: ['contentText', 'firstScreenSubtitle', 'reason', 'idempotencyToken'],
  properties: {
    baseArtifactId: { type: 'string', minLength: 1, maxLength: 80 },
    contentText: { type: 'string', minLength: 10, maxLength: 10000 },
    firstScreenSubtitle: { type: 'string', minLength: 1, maxLength: 500 },
    reason: { type: 'string', minLength: 4, maxLength: 1000 },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const confirmSubtitleBodySchema = confirmNarrationBodySchema;
const rejectSubtitleBodySchema = rejectNarrationBodySchema;

const saveVisualPlanBodySchema = {
  type: 'object',
  required: [
    'expectedReferenceVersion',
    'videoUnitId',
    'subtitleArtifactId',
    'expectedSubtitleVersionNo',
    'backgroundAssetId',
    'aspectRatio',
    'resolution',
    'subtitlePosition',
    'fontSize',
    'textColor',
    'strokeColor',
    'shadowEnabled',
    'safeAreaPreset',
    'idempotencyToken'
  ],
  properties: {
    expectedReferenceVersion: { type: 'integer', minimum: 1 },
    videoUnitId: { type: 'string', minLength: 1, maxLength: 80 },
    subtitleArtifactId: { type: 'string', minLength: 1, maxLength: 80 },
    expectedSubtitleVersionNo: { type: 'integer', minimum: 1 },
    backgroundAssetId: { type: 'string', enum: ['mock-bg-salt-field', 'mock-bg-night-city', 'mock-bg-ink-motion'] },
    backgroundName: { type: 'string', minLength: 1, maxLength: 120 },
    aspectRatio: { type: 'string', enum: ['9:16', '16:9', '1:1'] },
    resolution: { type: 'string', enum: ['720x1280', '1080x1920', '1920x1080'] },
    subtitlePosition: { type: 'string', enum: ['bottom_safe', 'middle', 'top_safe'] },
    fontSize: { type: 'integer', minimum: 20, maximum: 80 },
    textColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    strokeColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    shadowEnabled: { type: 'boolean' },
    safeAreaPreset: { type: 'string', enum: ['douyin_safe', 'kuaishou_safe', 'wide_safe'] },
    qualityMode: { type: 'string', enum: ['fast', 'standard', 'high_quality'], default: 'standard' },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const confirmVisualPlanBodySchema = confirmNarrationBodySchema;
const rejectVisualPlanBodySchema = rejectNarrationBodySchema;

const generateRenderBodySchema = {
  type: 'object',
  required: ['expectedReferenceVersion', 'videoUnitId', 'visualPlanArtifactId', 'expectedVisualPlanVersionNo', 'idempotencyToken'],
  properties: {
    expectedReferenceVersion: { type: 'integer', minimum: 1 },
    videoUnitId: { type: 'string', minLength: 1, maxLength: 80 },
    visualPlanArtifactId: { type: 'string', minLength: 1, maxLength: 80 },
    expectedVisualPlanVersionNo: { type: 'integer', minimum: 1 },
    qualityMode: { type: 'string', enum: ['fast', 'standard', 'high_quality'], default: 'standard' },
    retryOfTaskId: { type: 'string', minLength: 1, maxLength: 80 },
    mockTaskOutcome: { type: 'string', enum: ['success', 'failed', 'cancelled'], default: 'success' },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

const confirmRenderBodySchema = confirmNarrationBodySchema;
const rejectRenderBodySchema = rejectNarrationBodySchema;

const createExportBodySchema = {
  type: 'object',
  required: ['renderVersionId', 'expectedRenderVersionNo', 'idempotencyToken'],
  properties: {
    renderVersionId: { type: 'string', minLength: 1, maxLength: 80 },
    expectedRenderVersionNo: { type: 'integer', minimum: 1 },
    fileName: { type: 'string', minLength: 1, maxLength: 200 },
    format: { type: 'string', enum: ['mp4'], default: 'mp4' },
    idempotencyToken: idempotencyTokenSchema
  },
  additionalProperties: false
} as const;

export async function registerVideoRoutes(app: FastifyInstance, options: RegisterVideoRoutesOptions) {
  const videoService = new VideoService(options.repository, options.now);

  app.get(
    '/videos/sources',
    {
      schema: {
        querystring: sourceQuerySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const query = request.query as { page?: number; pageSize?: number; keyword?: string };
      const data = await videoService.listSources({
        context: createVideoRequestContext(request.id),
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        keyword: query.keyword
      });

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos',
    {
      schema: {
        querystring: listQuerySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const query = request.query as {
        page?: number;
        pageSize?: number;
        keyword?: string;
        novelId?: string;
        referenceStatus?: VideoReferenceStatus;
        lifecycleStatus?: VideoLifecycleStatus;
        productionStatus?: VideoProductionStatus;
      };
      const data = await videoService.listProjects({
        context: createVideoRequestContext(request.id),
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        keyword: query.keyword,
        novelId: query.novelId,
        referenceStatus: query.referenceStatus,
        lifecycleStatus: query.lifecycleStatus,
        productionStatus: query.productionStatus
      });

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos',
    {
      schema: {
        body: createVideoBodySchema,
        response: {
          200: responseEnvelopeSchema,
          201: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const data = await videoService.createProject(createVideoRequestContext(request.id), request.body as CreateVideoProjectRequest);
      if (!data.reusedByIdempotency) reply.status(201);

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/reference',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.getReference(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/workbench',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.getWorkbench(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/narrations',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.listNarrations(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/narrations/generate',
    {
      schema: {
        params: videoIdParamsSchema,
        body: generateNarrationBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.generateNarrations(
        createVideoRequestContext(request.id),
        videoId,
        request.body as GenerateVideoNarrationRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/narrations/drafts',
    {
      schema: {
        params: videoIdParamsSchema,
        body: saveNarrationDraftBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.saveNarrationDraft(
        createVideoRequestContext(request.id),
        videoId,
        request.body as SaveVideoNarrationDraftRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/narrations/:artifactId/confirm',
    {
      schema: {
        params: narrationParamsSchema,
        body: confirmNarrationBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.confirmNarration(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as ConfirmVideoNarrationRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/narrations/:artifactId/reject',
    {
      schema: {
        params: narrationParamsSchema,
        body: rejectNarrationBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.rejectNarration(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as RejectVideoNarrationRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/tts',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.listTts(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/tts/generate',
    {
      schema: {
        params: videoIdParamsSchema,
        body: generateTtsBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.generateTts(
        createVideoRequestContext(request.id),
        videoId,
        request.body as GenerateVideoTtsRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/tts/:artifactId/confirm',
    {
      schema: {
        params: ttsParamsSchema,
        body: confirmTtsBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.confirmTts(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as ConfirmVideoTtsRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/tts/:artifactId/reject',
    {
      schema: {
        params: ttsParamsSchema,
        body: rejectTtsBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.rejectTts(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as RejectVideoTtsRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/subtitles',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.listSubtitles(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/subtitles/generate',
    {
      schema: {
        params: videoIdParamsSchema,
        body: generateSubtitleBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.generateSubtitles(
        createVideoRequestContext(request.id),
        videoId,
        request.body as GenerateVideoSubtitleRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/subtitles/drafts',
    {
      schema: {
        params: videoIdParamsSchema,
        body: saveSubtitleDraftBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.saveSubtitleDraft(
        createVideoRequestContext(request.id),
        videoId,
        request.body as SaveVideoSubtitleDraftRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/subtitles/:artifactId/confirm',
    {
      schema: {
        params: subtitleParamsSchema,
        body: confirmSubtitleBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.confirmSubtitle(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as ConfirmVideoSubtitleRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/subtitles/:artifactId/reject',
    {
      schema: {
        params: subtitleParamsSchema,
        body: rejectSubtitleBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.rejectSubtitle(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as RejectVideoSubtitleRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/visual-plans',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.listVisualPlans(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/visual-plans',
    {
      schema: {
        params: videoIdParamsSchema,
        body: saveVisualPlanBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.saveVisualPlan(
        createVideoRequestContext(request.id),
        videoId,
        request.body as SaveVideoVisualPlanRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/visual-plans/:artifactId/confirm',
    {
      schema: {
        params: visualPlanParamsSchema,
        body: confirmVisualPlanBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.confirmVisualPlan(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as ConfirmVideoVisualPlanRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/visual-plans/:artifactId/reject',
    {
      schema: {
        params: visualPlanParamsSchema,
        body: rejectVisualPlanBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, artifactId } = request.params as { videoId: string; artifactId: string };
      const data = await videoService.rejectVisualPlan(
        createVideoRequestContext(request.id),
        videoId,
        artifactId,
        request.body as RejectVideoVisualPlanRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/renders',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.listRenders(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/renders/generate',
    {
      schema: {
        params: videoIdParamsSchema,
        body: generateRenderBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.generateRender(
        createVideoRequestContext(request.id),
        videoId,
        request.body as GenerateVideoRenderRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/renders/:renderId/confirm',
    {
      schema: {
        params: renderParamsSchema,
        body: confirmRenderBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, renderId } = request.params as { videoId: string; renderId: string };
      const data = await videoService.confirmRender(
        createVideoRequestContext(request.id),
        videoId,
        renderId,
        request.body as ConfirmVideoRenderRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/renders/:renderId/reject',
    {
      schema: {
        params: renderParamsSchema,
        body: rejectRenderBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, renderId } = request.params as { videoId: string; renderId: string };
      const data = await videoService.rejectRender(
        createVideoRequestContext(request.id),
        videoId,
        renderId,
        request.body as RejectVideoRenderRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/videos/:videoId/exports',
    {
      schema: {
        params: videoIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.listExports(createVideoRequestContext(request.id), videoId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/exports',
    {
      schema: {
        params: videoIdParamsSchema,
        body: createExportBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.createExport(
        createVideoRequestContext(request.id),
        videoId,
        request.body as CreateVideoExportRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/reference/recheck',
    {
      schema: {
        params: videoIdParamsSchema,
        body: recheckBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.recheckReference(
        createVideoRequestContext(request.id),
        videoId,
        request.body as RecheckVideoReferenceRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/reference/issues/:issueId/resolve',
    {
      schema: {
        params: issueParamsSchema,
        body: resolveIssueBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId, issueId } = request.params as { videoId: string; issueId: string };
      const data = await videoService.resolveIssue(
        createVideoRequestContext(request.id),
        videoId,
        issueId,
        request.body as ResolveVideoReferenceIssueRequest
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/videos/:videoId/stop',
    {
      schema: {
        params: videoIdParamsSchema,
        body: stopBodySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { videoId } = request.params as { videoId: string };
      const data = await videoService.stopProject(createVideoRequestContext(request.id), videoId, request.body as StopVideoProjectRequest);

      return sendOk(request, reply, data);
    }
  );
}
