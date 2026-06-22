import type { FastifyInstance } from 'fastify';
import { sendOk } from '../../../shared/reply.js';
import { createDefaultRequestContext, NovelService, type NovelServiceOptions } from '../services/novelService.js';
import type {
  AdoptDirectionRequest,
  AdoptStructureAssetRequest,
  ConfirmCompletionRequest,
  ConfirmVideoReadinessRequest,
  ConfirmTrialRequest,
  CreateNovelDraftRequest,
  AdoptChapterContentVersionRequest,
  CreateImpactAssessmentRequest,
  ForcePassFullReviewRequest,
  FuseDirectionsRequest,
  GenerateBodyBatchRequest,
  GenerateChapterBodyRequest,
  GenerateDirectionsRequest,
  GenerateStructureAssetRequest,
  GenerateTrialRequest,
  NovelListQuery,
  OptimizeDirectionRequest,
  RecheckVideoReadinessRequest,
  ResolveFullReviewIssueRequest,
  ResolveImpactCaseRequest,
  RewriteChapterRequest,
  StartFullReviewRequest
} from '@ai-shortvideo/shared';

const querySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    keyword: { type: 'string', maxLength: 100 },
    lifecycleStatus: { type: 'string', enum: ['active', 'paused', 'archived', 'deleted'] },
    creationStage: {
      type: 'string',
      enum: ['draft', 'direction', 'setting', 'outline', 'chapter_plan', 'trial', 'body', 'full_review', 'completion_confirm', 'video_ready']
    },
    videoReferenceStatus: { type: 'string', maxLength: 80 }
  },
  additionalProperties: false
} as const;

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

const novelIdParamsSchema = {
  type: 'object',
  required: ['novelId'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const directionVersionParamsSchema = {
  type: 'object',
  required: ['novelId', 'versionId'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    versionId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const chapterParamsSchema = {
  type: 'object',
  required: ['novelId', 'chapterId'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    chapterId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const chapterContentVersionParamsSchema = {
  type: 'object',
  required: ['novelId', 'chapterId', 'versionId'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    chapterId: { type: 'string', minLength: 1, maxLength: 80 },
    versionId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const impactCaseParamsSchema = {
  type: 'object',
  required: ['novelId', 'impactCaseId'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    impactCaseId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const fullReviewParamsSchema = {
  type: 'object',
  required: ['novelId', 'reviewId'],
  properties: {
    novelId: { type: 'string', minLength: 1, maxLength: 80 },
    reviewId: { type: 'string', minLength: 1, maxLength: 80 }
  },
  additionalProperties: false
} as const;

const idempotencyKeySchema = { type: 'string', minLength: 8, maxLength: 120, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' } as const;

export async function registerNovelRoutes(app: FastifyInstance, options: NovelServiceOptions) {
  const novelService = new NovelService(options);

  app.post(
    '/novels/drafts',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            channel: { type: 'string', maxLength: 80 },
            genres: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 12 },
            hotspotReportId: { type: ['string', 'null'], maxLength: 80 },
            hotspotOpportunityId: { type: ['string', 'null'], maxLength: 80 },
            preferences: {
              type: 'object',
              properties: {
                appealPoints: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 20 },
                openingState: { type: ['string', 'null'], maxLength: 1000 },
                blockedElements: { type: 'array', items: { type: 'string', maxLength: 120 }, maxItems: 20 },
                targetAudience: { type: ['string', 'null'], maxLength: 120 },
                stageCount: { type: ['integer', 'null'], minimum: 1, maximum: 20 },
                customIdea: { type: ['string', 'null'], maxLength: 2000 },
                style: { type: ['string', 'null'], maxLength: 120 },
                videoAdaptationPreference: { type: ['string', 'null'], maxLength: 120 }
              },
              additionalProperties: false
            },
            chapterLimit: { type: 'integer', minimum: 1, maximum: 1000 },
            chapterWordRange: {
              type: 'object',
              required: ['min', 'max'],
              properties: {
                min: { type: 'integer', minimum: 100 },
                max: { type: 'integer', minimum: 100 }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        },
        response: {
          201: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const data = await novelService.createDraft(
        request.body as CreateNovelDraftRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      reply.status(201);
      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/directions/generate',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          properties: {
            regenerateReason: { type: ['string', 'null'], maxLength: 500 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateDirections(
        novelId,
        (request.body ?? {}) as GenerateDirectionsRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/directions/fuse',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['versionIds'],
          properties: {
            versionIds: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 80 },
              minItems: 2,
              maxItems: 5
            },
            reason: { type: ['string', 'null'], maxLength: 500 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.fuseDirections(
        novelId,
        request.body as FuseDirectionsRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/directions/:versionId/optimize',
    {
      schema: {
        params: directionVersionParamsSchema,
        body: {
          type: 'object',
          properties: {
            instruction: { type: ['string', 'null'], maxLength: 500 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.optimizeDirection(
        novelId,
        versionId,
        (request.body ?? {}) as OptimizeDirectionRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/directions/:versionId/adopt',
    {
      schema: {
        params: directionVersionParamsSchema,
        body: {
          type: 'object',
          properties: {
            confirmLowScore: { type: 'boolean' },
            reason: { type: ['string', 'null'], maxLength: 1000 },
            pageVersionSnapshot: { type: ['object', 'null'], additionalProperties: true },
            currentVersionId: { type: ['string', 'null'], maxLength: 80 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.adoptDirection(
        novelId,
        versionId,
        (request.body ?? {}) as AdoptDirectionRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/settings/generate',
    createStructureGenerateRouteSchema(),
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateSetting(
        novelId,
        (request.body ?? {}) as GenerateStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/settings/:versionId/adopt',
    createStructureAdoptRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.adoptSetting(
        novelId,
        versionId,
        (request.body ?? {}) as AdoptStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/outlines/generate',
    createStructureGenerateRouteSchema(),
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateOutline(
        novelId,
        (request.body ?? {}) as GenerateStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/outlines/:versionId/adopt',
    createStructureAdoptRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.adoptOutline(
        novelId,
        versionId,
        (request.body ?? {}) as AdoptStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/stage-outlines/generate',
    createStructureGenerateRouteSchema(),
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateStageOutline(
        novelId,
        (request.body ?? {}) as GenerateStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/stage-outlines/:versionId/adopt',
    createStructureAdoptRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.adoptStageOutline(
        novelId,
        versionId,
        (request.body ?? {}) as AdoptStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapter-plans/generate',
    createStructureGenerateRouteSchema(),
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateChapterPlan(
        novelId,
        (request.body ?? {}) as GenerateStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapter-plans/:versionId/adopt',
    createStructureAdoptRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.adoptChapterPlan(
        novelId,
        versionId,
        (request.body ?? {}) as AdoptStructureAssetRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/trial/generate',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          properties: {
            chapterCount: { type: 'integer', enum: [2, 3, 5] },
            trialRunId: { type: ['string', 'null'], maxLength: 80 },
            selectedCandidateId: { type: ['string', 'null'], maxLength: 80 },
            regenerateReason: { type: ['string', 'null'], maxLength: 500 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateTrial(
        novelId,
        (request.body ?? {}) as GenerateTrialRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/trial/confirm',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['trialRunId', 'decision'],
          properties: {
            trialRunId: { type: 'string', minLength: 1, maxLength: 80 },
            decision: { type: 'string', enum: ['confirm_pass', 'force_pass', 'return_upstream'] },
            reason: { type: ['string', 'null'], maxLength: 1000 },
            confirmRisk: { type: 'boolean' }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.confirmTrial(
        novelId,
        request.body as ConfirmTrialRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapters/batch-generate',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['strategySnapshotId', 'expectedStrategySnapshotVersion', 'idempotencyKey'],
          properties: {
            strategySnapshotId: { type: 'string', minLength: 1, maxLength: 80 },
            expectedStrategySnapshotVersion: { type: 'integer', minimum: 1 },
            startChapterNo: { type: ['integer', 'null'], minimum: 4 },
            endChapterNo: { type: ['integer', 'null'], minimum: 4 },
            idempotencyKey: { type: 'string', minLength: 8, maxLength: 120, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$' }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.generateBodyBatch(
        novelId,
        request.body as GenerateBodyBatchRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapters/:chapterId/generate',
    {
      schema: {
        params: chapterParamsSchema,
        body: {
          type: 'object',
          required: ['strategySnapshotId', 'expectedStrategySnapshotVersion'],
          properties: {
            strategySnapshotId: { type: 'string', minLength: 1, maxLength: 80 },
            expectedStrategySnapshotVersion: { type: 'integer', minimum: 1 },
            reason: { type: ['string', 'null'], maxLength: 500 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.generateChapterBody(
        novelId,
        chapterId,
        request.body as GenerateChapterBodyRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapters/:chapterId/rewrite',
    {
      schema: {
        params: chapterParamsSchema,
        body: {
          type: 'object',
          properties: {
            instruction: { type: ['string', 'null'], maxLength: 1000 },
            reason: { type: ['string', 'null'], maxLength: 1000 },
            currentContentVersionId: { type: ['string', 'null'], maxLength: 80 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.rewriteChapter(
        novelId,
        chapterId,
        (request.body ?? {}) as RewriteChapterRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapters/:chapterId/content-versions/:versionId/adopt',
    {
      schema: {
        params: chapterContentVersionParamsSchema,
        body: {
          type: 'object',
          properties: {
            reason: { type: ['string', 'null'], maxLength: 1000 },
            currentContentVersionId: { type: ['string', 'null'], maxLength: 80 },
            pageVersionSnapshot: { type: ['object', 'null'], additionalProperties: true }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, chapterId, versionId } = request.params as { novelId: string; chapterId: string; versionId: string };
      const data = await novelService.adoptChapterContentVersion(
        novelId,
        chapterId,
        versionId,
        (request.body ?? {}) as AdoptChapterContentVersionRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapters/:chapterId/impact-assessments',
    {
      schema: {
        params: chapterParamsSchema,
        body: {
          type: 'object',
          properties: {
            reason: { type: ['string', 'null'], maxLength: 1000 },
            currentContentVersionId: { type: ['string', 'null'], maxLength: 80 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.createImpactAssessment(
        novelId,
        chapterId,
        (request.body ?? {}) as CreateImpactAssessmentRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels/:novelId/impact-cases/:impactCaseId',
    {
      schema: {
        params: impactCaseParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, impactCaseId } = request.params as { novelId: string; impactCaseId: string };
      const data = await novelService.getImpactCase(novelId, impactCaseId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/impact-cases/:impactCaseId/resolve',
    {
      schema: {
        params: impactCaseParamsSchema,
        body: {
          type: 'object',
          required: ['resolution'],
          properties: {
            resolution: { type: 'string', enum: ['resolved', 'ignored', 'cancelled'] },
            reason: { type: ['string', 'null'], maxLength: 1000 },
            handlingChoice: { type: ['string', 'null'], enum: ['confirm_no_impact', 'mark_resolved', 'cancel_case', null] }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, impactCaseId } = request.params as { novelId: string; impactCaseId: string };
      const data = await novelService.resolveImpactCase(
        novelId,
        impactCaseId,
        request.body as ResolveImpactCaseRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/full-review',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['idempotencyKey'],
          properties: {
            idempotencyKey: idempotencyKeySchema,
            expectedNovelVersion: { type: ['string', 'null'], maxLength: 80 },
            reviewPolicyVersionId: { type: ['string', 'null'], maxLength: 120 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.startFullReview(
        novelId,
        request.body as StartFullReviewRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels/:novelId/full-review/latest',
    {
      schema: {
        params: novelIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.getLatestFullReview(novelId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/full-review/:reviewId/resolve-issue',
    {
      schema: {
        params: fullReviewParamsSchema,
        body: {
          type: 'object',
          required: ['issueId', 'action'],
          properties: {
            issueId: { type: 'string', minLength: 1, maxLength: 120 },
            action: { type: 'string', enum: ['resolve', 'accept_risk'] },
            reason: { type: ['string', 'null'], maxLength: 1000 }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, reviewId } = request.params as { novelId: string; reviewId: string };
      const data = await novelService.resolveFullReviewIssue(
        novelId,
        reviewId,
        request.body as ResolveFullReviewIssueRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/full-review/:reviewId/force-pass',
    {
      schema: {
        params: fullReviewParamsSchema,
        body: {
          type: 'object',
          required: ['idempotencyKey', 'fullReviewGateId', 'reason', 'confirmRisk'],
          properties: {
            idempotencyKey: idempotencyKeySchema,
            fullReviewGateId: { type: 'string', minLength: 1, maxLength: 80 },
            expectedReviewReportVersion: { type: ['integer', 'null'], minimum: 1 },
            reason: { type: 'string', minLength: 1, maxLength: 1000 },
            confirmRisk: { type: 'boolean', const: true }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, reviewId } = request.params as { novelId: string; reviewId: string };
      const data = await novelService.forcePassFullReview(
        novelId,
        reviewId,
        request.body as ForcePassFullReviewRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/completion/confirm',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['idempotencyKey', 'reviewReportId', 'fullReviewGateId'],
          properties: {
            idempotencyKey: idempotencyKeySchema,
            reviewReportId: { type: 'string', minLength: 1, maxLength: 80 },
            fullReviewGateId: { type: 'string', minLength: 1, maxLength: 80 },
            expectedReviewReportVersion: { type: ['integer', 'null'], minimum: 1 },
            expectedNovelVersion: { type: ['string', 'null'], maxLength: 80 },
            reason: { type: ['string', 'null'], maxLength: 1000 },
            confirmRisk: { type: 'boolean' }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.confirmCompletion(
        novelId,
        request.body as ConfirmCompletionRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels/:novelId/video-readiness',
    {
      schema: {
        params: novelIdParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.getVideoReadiness(novelId);

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/video-readiness/recheck',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          properties: {
            idempotencyKey: idempotencyKeySchema
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.recheckVideoReadiness(
        novelId,
        (request.body ?? {}) as RecheckVideoReadinessRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/video-readiness/confirm',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['idempotencyKey', 'completionDecisionId', 'readinessCheckId', 'checkVersion'],
          properties: {
            idempotencyKey: idempotencyKeySchema,
            completionDecisionId: { type: 'string', minLength: 1, maxLength: 80 },
            readinessCheckId: { type: 'string', minLength: 1, maxLength: 80 },
            checkVersion: { type: 'integer', minimum: 1 },
            expectedNovelVersion: { type: ['string', 'null'], maxLength: 80 },
            reason: { type: ['string', 'null'], maxLength: 1000 },
            confirmRisk: { type: 'boolean' }
          },
          additionalProperties: false
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.confirmVideoReadiness(
        novelId,
        request.body as ConfirmVideoReadinessRequest,
        createDefaultRequestContext(request.id, request.ip, getHeader(request.headers['user-agent']))
      );

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels/:novelId/chapters/:chapterId',
    {
      schema: {
        params: chapterParamsSchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.getChapterWorkbench(novelId, chapterId);

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels',
    {
      schema: {
        querystring: querySchema,
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const query = request.query as NovelListQuery;
      const data = await novelService.list(query);

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels/:novelId',
    {
      schema: {
        params: {
          ...novelIdParamsSchema
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.getDetail(novelId);

      return sendOk(request, reply, data);
    }
  );

  app.get(
    '/novels/:novelId/summary',
    {
      schema: {
        params: {
          ...novelIdParamsSchema
        },
        response: {
          200: responseEnvelopeSchema
        }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.getSummary(novelId);

      return sendOk(request, reply, data);
    }
  );
}

function createStructureGenerateRouteSchema() {
  return {
    schema: {
      params: novelIdParamsSchema,
      body: {
        type: 'object',
        properties: {
          regenerateReason: { type: ['string', 'null'], maxLength: 500 }
        },
        additionalProperties: false
      },
      response: {
        200: responseEnvelopeSchema
      }
    }
  } as const;
}

function createStructureAdoptRouteSchema() {
  return {
    schema: {
      params: directionVersionParamsSchema,
      body: {
        type: 'object',
        properties: {
          confirmHighRisk: { type: 'boolean' },
          reason: { type: ['string', 'null'], maxLength: 1000 },
          pageVersionSnapshot: { type: ['object', 'null'], additionalProperties: true },
          currentVersionId: { type: ['string', 'null'], maxLength: 80 }
        },
        additionalProperties: false
      },
      response: {
        200: responseEnvelopeSchema
      }
    }
  } as const;
}

function getHeader(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] : header;
}
