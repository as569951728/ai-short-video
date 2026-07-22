import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ErrorCode, isPlaceholderActorIdentifier } from '@ai-shortvideo/shared';
import { BusinessError } from '../../../shared/errors.js';
import { sendOk } from '../../../shared/reply.js';
import { NovelService, type NovelServiceOptions } from '../services/novelService.js';
import { resolveRequestIdempotencyKey } from '../services/taskClaim.js';
import type {
  AdoptDirectionRequest,
  AdoptStructureAssetRequest,
  ConfirmCompletionRequest,
  ConfirmVideoReadinessRequest,
  ConfirmTrialRequest,
  CreateNovelDraftRequest,
  EditDirectionCandidateRequest,
  EditStructureAssetRequest,
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
  StartFullReviewRequest,
  UpdateChapterWordTargetsRequest
} from '@ai-shortvideo/shared';
import type { RequestContext, RequestContextResolver } from '../domain/novelDomain.js';

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

type NovelRouteOptions = NovelServiceOptions & { requestContextResolver?: RequestContextResolver };
export async function registerNovelRoutes(app: FastifyInstance, options: NovelRouteOptions) {
  const novelService = new NovelService(options);
  const devSeedNovelService = new NovelService({
    repository: options.repository,
    now: options.now
  });

  if (process.env.NODE_ENV !== 'production') {
    app.post(
      '/dev/novels/acceptance-seeds/outline',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 200 }
            },
            additionalProperties: false
          },
          response: {
            201: responseEnvelopeSchema
          }
        }
      },
      async (request, reply) => {
        const data = await createOutlineAcceptanceSeed(
          devSeedNovelService,
          request.body as { title?: string } | undefined,
          await resolveProviderContext(options.requestContextResolver, request)
        );

        reply.status(201);
        return sendOk(request, reply, data);
      }
    );

    app.post(
      '/dev/novels/acceptance-seeds/trial',
      {
        schema: {
          body: {
            type: 'object',
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 200 }
            },
            additionalProperties: false
          },
          response: {
            201: responseEnvelopeSchema
          }
        }
      },
      async (request, reply) => {
        const data = await createTrialAcceptanceSeed(
          devSeedNovelService,
          request.body as { title?: string } | undefined,
          await resolveProviderContext(options.requestContextResolver, request)
        );

        reply.status(201);
        return sendOk(request, reply, data);
      }
    );
  }

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
            creationSourceType: { type: 'string', enum: ['system_recommendation', 'hotspot_reference', 'manual_idea'] },
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
        await resolveProviderContext(options.requestContextResolver, request)
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
            regenerateReason: { type: ['string', 'null'], maxLength: 500 },
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
      const data = await novelService.generateDirections(
        novelId,
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as GenerateDirectionsRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
            reason: { type: ['string', 'null'], maxLength: 500 },
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
      const data = await novelService.fuseDirections(
        novelId,
        withRequestIdempotency(request.headers['idempotency-key'], request.body as FuseDirectionsRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
            instruction: { type: ['string', 'null'], maxLength: 500 },
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
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.optimizeDirection(
        novelId,
        versionId,
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as OptimizeDirectionRequest),
        await resolveProviderContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/directions/:versionId/edit',
    {
      schema: {
        params: directionVersionParamsSchema,
        body: {
          type: 'object',
          required: ['title', 'logline', 'coreHook', 'audienceAppeal', 'videoPotential', 'sellingPoints', 'riskTags', 'recommendation', 'reason'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 120 },
            logline: { type: 'string', minLength: 1, maxLength: 300 },
            coreHook: { type: 'string', minLength: 1, maxLength: 300 },
            audienceAppeal: { type: 'string', minLength: 1, maxLength: 300 },
            videoPotential: { type: 'string', minLength: 1, maxLength: 300 },
            sellingPoints: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 80 },
              minItems: 1,
              maxItems: 8
            },
            riskTags: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 80 },
              maxItems: 8
            },
            recommendation: { type: 'string', minLength: 1, maxLength: 300 },
            reason: { type: 'string', minLength: 1, maxLength: 500 }
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
      const data = await novelService.editDirectionCandidate(
        novelId,
        versionId,
        request.body as EditDirectionCandidateRequest,
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
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
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as GenerateStructureAssetRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/settings/:versionId/edit',
    createStructureEditRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.editStructureAsset(
        novelId,
        'setting',
        versionId,
        request.body as EditStructureAssetRequest,
        await resolveProviderContext(options.requestContextResolver, request)
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
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as GenerateStructureAssetRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/outlines/:versionId/edit',
    createStructureEditRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.editStructureAsset(
        novelId,
        'outline',
        versionId,
        request.body as EditStructureAssetRequest,
        await resolveProviderContext(options.requestContextResolver, request)
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
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as GenerateStructureAssetRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/stage-outlines/:versionId/edit',
    createStructureEditRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.editStructureAsset(
        novelId,
        'stage_outline',
        versionId,
        request.body as EditStructureAssetRequest,
        await resolveProviderContext(options.requestContextResolver, request)
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
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as GenerateStructureAssetRequest),
        await resolveProviderContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.post(
    '/novels/:novelId/chapter-plans/:versionId/edit',
    createStructureEditRouteSchema(),
    async (request, reply) => {
      const { novelId, versionId } = request.params as { novelId: string; versionId: string };
      const data = await novelService.editStructureAsset(
        novelId,
        'chapter_plan',
        versionId,
        request.body as EditStructureAssetRequest,
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
      );

      return sendOk(request, reply, data);
    }
  );

  app.patch(
    '/novels/:novelId/chapter-plans/word-targets',
    {
      schema: {
        params: novelIdParamsSchema,
        body: {
          type: 'object',
          required: ['updates'],
          properties: {
            updates: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              items: {
                type: 'object',
                required: ['chapterNo', 'wordTarget'],
                properties: {
                  chapterNo: { type: 'integer', minimum: 1, maximum: 1000 },
                  wordTarget: { type: 'integer', minimum: 100, maximum: 30000 }
                },
                additionalProperties: false
              }
            },
            reason: { type: ['string', 'null'], maxLength: 500 },
            currentChapterPlanVersionId: { type: ['string', 'null'], maxLength: 80 }
          },
          additionalProperties: false
        },
        response: { 200: responseEnvelopeSchema }
      }
    },
    async (request, reply) => {
      const { novelId } = request.params as { novelId: string };
      const data = await novelService.updateChapterWordTargets(
        novelId,
        (request.body ?? {}) as UpdateChapterWordTargetsRequest,
        await resolveProviderContext(options.requestContextResolver, request)
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
            confirmRisk: { type: 'boolean' },
            selectionReason: { type: ['string', 'null'], maxLength: 500 },
            regenerateReason: { type: ['string', 'null'], maxLength: 500 },
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
      const data = await novelService.generateTrial(
        novelId,
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as GenerateTrialRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
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
          required: ['strategySnapshotId', 'expectedStrategySnapshotVersion'],
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
        withRequestIdempotency(request.headers['idempotency-key'], request.body as GenerateBodyBatchRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
            reason: { type: ['string', 'null'], maxLength: 500 },
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
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.generateChapterBody(
        novelId,
        chapterId,
        withRequestIdempotency(request.headers['idempotency-key'], request.body as GenerateChapterBodyRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
            currentContentVersionId: { type: ['string', 'null'], maxLength: 80 },
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
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.rewriteChapter(
        novelId,
        chapterId,
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as RewriteChapterRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
            pageVersionSnapshot: { type: ['object', 'null'], additionalProperties: true },
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
      const { novelId, chapterId, versionId } = request.params as { novelId: string; chapterId: string; versionId: string };
      const data = await novelService.adoptChapterContentVersion(
        novelId,
        chapterId,
        versionId,
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as AdoptChapterContentVersionRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
            currentContentVersionId: { type: ['string', 'null'], maxLength: 80 },
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
      const { novelId, chapterId } = request.params as { novelId: string; chapterId: string };
      const data = await novelService.createImpactAssessment(
        novelId,
        chapterId,
        withRequestIdempotency(request.headers['idempotency-key'], (request.body ?? {}) as CreateImpactAssessmentRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.getImpactCase(novelId, impactCaseId, context.tenantId);

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
        await resolveProviderContext(options.requestContextResolver, request)
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
        withRequestIdempotency(request.headers['idempotency-key'], request.body as StartFullReviewRequest),
        await resolveProviderContext(options.requestContextResolver, request)
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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.getLatestFullReview(novelId, context.tenantId);

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
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.getVideoReadiness(novelId, context.tenantId);

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
        await resolveProviderContext(options.requestContextResolver, request)
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
        await resolveProviderContext(options.requestContextResolver, request)
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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.getChapterWorkbench(novelId, chapterId, context.tenantId);

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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.list(query, context.tenantId);

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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.getDetail(novelId, context.tenantId);

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
      const context = await resolveProviderContext(options.requestContextResolver, request);
      const data = await novelService.getSummary(novelId, context.tenantId);

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
          regenerateReason: { type: ['string', 'null'], maxLength: 500 },
          idempotencyKey: idempotencyKeySchema
        },
        additionalProperties: false
      },
      response: {
        200: responseEnvelopeSchema
      }
    }
  } as const;
}

function withRequestIdempotency<T extends { idempotencyKey?: string | null }>(headerValue: unknown, body: T): T {
  const idempotencyKey = resolveRequestIdempotencyKey(headerValue, body.idempotencyKey);
  return idempotencyKey === undefined ? body : { ...body, idempotencyKey };
}

async function createOutlineAcceptanceSeed(
  service: NovelService,
  body: { title?: string } | undefined,
  context: RequestContext
) {
  const suffix = new Date().toISOString().slice(5, 16).replace('T', ' ');
  const title = body?.title?.trim() || `验收种子：大纲设计 ${suffix}`;
  const draft = await service.createDraft(
    {
      title,
      genres: ['都市逆袭', '系统爽文'],
      preferences: {
        appealPoints: ['低谷翻盘', '打脸反击', '事业逆袭'],
        targetAudience: '18-35 岁爽文用户',
        stageCount: 3,
        customIdea: '用于本地验收大纲设计节点：主角从底层销售被背叛开始，依靠系统提示和商业判断逐步翻盘。',
        videoAdaptationPreference: '适合口播短视频'
      },
      chapterLimit: 60,
      chapterWordRange: {
        min: 1800,
        max: 2600
      }
    } satisfies CreateNovelDraftRequest,
    context
  );
  const novelId = draft.id;

  const directions = await service.generateDirections(
    novelId,
    { regenerateReason: '本地验收种子：生成方向候选' },
    context
  );
  const direction = directions.candidates.find((candidate) => candidate.score >= 75) ?? directions.candidates[0];
  if (!direction) throw new Error('验收种子创建失败：方向候选未生成');
  await service.adoptDirection(
    novelId,
    direction.id,
    { reason: '本地验收种子：采用方向，进入设定节点。' },
    context
  );

  const settingResult = await service.generateSetting(
    novelId,
    { regenerateReason: '本地验收种子：生成设定候选' },
    context
  );
  if (!settingResult.candidate) throw new Error('验收种子创建失败：设定候选未生成');
  await service.adoptSetting(
    novelId,
    settingResult.candidate.id,
    { reason: '本地验收种子：采用设定，进入大纲设计。' },
    context
  );

  const outlineResult = await service.generateOutline(
    novelId,
    { regenerateReason: '本地验收种子：生成全书大纲候选' },
    context
  );
  if (!outlineResult.candidate) throw new Error('验收种子创建失败：全书大纲候选未生成');
  await service.adoptOutline(
    novelId,
    outlineResult.candidate.id,
    { reason: '本地验收种子：采用全书大纲，准备阶段大纲验收。' },
    context
  );

  const stageOutlineResult = await service.generateStageOutline(
    novelId,
    { regenerateReason: '本地验收种子：生成阶段大纲候选，停留待确认。' },
    context
  );
  const detail = await service.getDetail(novelId, context.tenantId);

  return {
    novelId,
    title,
    acceptanceStep: 'outline',
    acceptanceSubStep: 'stages',
    url: `/novels/${novelId}?step=outline`,
    currentAssets: detail.currentAssets,
    stageOutlineCandidateId: stageOutlineResult.candidate?.id ?? null,
    note: '已创建到第 3 个主节点“大纲设计”：方向和设定已采用，全书大纲已采用，阶段大纲候选待确认。'
  };
}

async function createTrialAcceptanceSeed(
  service: NovelService,
  body: { title?: string } | undefined,
  context: RequestContext
) {
  const suffix = new Date().toISOString().slice(5, 16).replace('T', ' ');
  const title = body?.title?.trim() || `验收种子：试写按钮链路 ${suffix}`;
  const draft = await service.createDraft(
    {
      title,
      genres: ['都市逆袭', '系统爽文'],
      preferences: {
        appealPoints: ['低谷翻盘', '打脸反击', '事业逆袭'],
        targetAudience: '18-35 岁爽文用户',
        stageCount: 3,
        customIdea: '用于本地验收试写节点：主角从底层销售被背叛开始，依靠系统提示和商业判断逐步翻盘。',
        videoAdaptationPreference: '适合口播短视频'
      },
      chapterLimit: 60,
      chapterWordRange: {
        min: 1800,
        max: 2600
      }
    } satisfies CreateNovelDraftRequest,
    context
  );
  const novelId = draft.id;

  const directions = await service.generateDirections(
    novelId,
    { regenerateReason: '本地验收种子：生成方向候选' },
    context
  );
  const direction = directions.candidates.find((candidate) => candidate.score >= 75) ?? directions.candidates[0];
  if (!direction) throw new Error('验收种子创建失败：方向候选未生成');
  await service.adoptDirection(
    novelId,
    direction.id,
    { reason: '本地验收种子：采用方向，进入设定节点。' },
    context
  );

  const settingResult = await service.generateSetting(
    novelId,
    { regenerateReason: '本地验收种子：生成设定候选' },
    context
  );
  if (!settingResult.candidate) throw new Error('验收种子创建失败：设定候选未生成');
  await service.adoptSetting(
    novelId,
    settingResult.candidate.id,
    { reason: '本地验收种子：采用设定，进入大纲设计。' },
    context
  );

  const outlineResult = await service.generateOutline(
    novelId,
    { regenerateReason: '本地验收种子：生成全书大纲候选' },
    context
  );
  if (!outlineResult.candidate) throw new Error('验收种子创建失败：全书大纲候选未生成');
  await service.adoptOutline(
    novelId,
    outlineResult.candidate.id,
    { reason: '本地验收种子：采用全书大纲，进入阶段大纲。' },
    context
  );

  const stageOutlineResult = await service.generateStageOutline(
    novelId,
    { regenerateReason: '本地验收种子：生成阶段大纲候选' },
    context
  );
  if (!stageOutlineResult.candidate) throw new Error('验收种子创建失败：阶段大纲候选未生成');
  await service.adoptStageOutline(
    novelId,
    stageOutlineResult.candidate.id,
    { reason: '本地验收种子：采用阶段大纲，进入章节目录。' },
    context
  );

  const chapterPlanResult = await service.generateChapterPlan(
    novelId,
    { regenerateReason: '本地验收种子：生成章节目录候选' },
    context
  );
  if (!chapterPlanResult.candidate) throw new Error('验收种子创建失败：章节目录候选未生成');
  await service.adoptChapterPlan(
    novelId,
    chapterPlanResult.candidate.id,
    { reason: '本地验收种子：采用章节目录，进入试写调试。' },
    context
  );

  const trialResult = await service.generateTrial(
    novelId,
    { chapterCount: 3, regenerateReason: '本地验收种子：生成第 1 章试写候选，停留待选择。' },
    context
  );
  const detail = await service.getDetail(novelId, context.tenantId);

  return {
    novelId,
    title,
    acceptanceStep: 'trial',
    acceptanceSubStep: 'chapterOne',
    url: `/novels/${novelId}?step=trial`,
    currentAssets: detail.currentAssets,
    trialRunId: trialResult.trialRun.id,
    candidateIds: trialResult.trialRun.chapterOneCandidates.map((candidate) => candidate.id),
    note: '已创建到第 5 个主节点“试写调试”：方向、设定、大纲和章节目录已采用，第 1 章候选待选择。'
  };
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

function createStructureEditRouteSchema() {
  return {
    schema: {
      params: directionVersionParamsSchema,
      body: {
        type: 'object',
        required: ['title', 'summary', 'sectionTitle', 'sectionBody', 'sectionItems', 'riskTags', 'recommendation', 'reason'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 },
          summary: { type: 'string', minLength: 1, maxLength: 1000 },
          sectionTitle: { type: 'string', minLength: 1, maxLength: 160 },
          sectionBody: { type: 'string', minLength: 1, maxLength: 4000 },
          sectionItems: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 30 },
          riskTags: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 20 },
          recommendation: { type: 'string', minLength: 1, maxLength: 1000 },
          reason: { type: 'string', minLength: 1, maxLength: 500 }
        },
        additionalProperties: false
      },
      response: {
        200: responseEnvelopeSchema
      }
    }
  } as const;
}

async function resolveProviderContext(
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
  if (isPlaceholderActorIdentifier(tenantId) || isPlaceholderActorIdentifier(userId)) {
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
