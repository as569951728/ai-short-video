# Video P8b Backend Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/videos` P8 mock-only flow with real persisted video project, reference snapshot, default unit, and reference issue APIs.

**Architecture:** Add a dedicated video module beside the existing novels/tasks modules. Shared DTOs live in `packages/shared`, backend business rules live in `apps/api/src/modules/videos`, Prisma owns persisted video entities, and the Vue page calls a new `videoService` while keeping mock mode as fallback.

**Tech Stack:** TypeScript, Fastify, Prisma/MySQL, Vue 3, Vite, Element Plus, Node test runner.

---

## File Structure

- Create: `packages/shared/src/videos.ts` for video DTOs, request types, status literals, and paged results.
- Modify: `packages/shared/src/index.ts` to export video contracts.
- Modify: `apps/api/prisma/schema.prisma` to add `VideoProject`, `VideoUnit`, `VideoReferenceChapterSnapshot`, `VideoActionReceipt`, and complete video reference fields.
- Create: `apps/api/src/modules/videos/domain/videoDomain.ts` for status constants, normalizers, request hashing, and action rules.
- Create: `apps/api/src/modules/videos/repositories/inMemoryVideoRepository.ts` for API tests without MySQL.
- Create: `apps/api/src/modules/videos/repositories/prismaVideoRepository.ts` for real persistence.
- Create: `apps/api/src/modules/videos/services/videoService.ts` for create/list/reference/recheck/resolve/stop orchestration.
- Create: `apps/api/src/modules/videos/routes/videoRoutes.ts` for Fastify routes and JSON schema.
- Create: `apps/api/src/modules/videos/videoRoutes.test.ts` for interface-level tests.
- Modify: `apps/api/src/app.ts` to register video routes and repository options.
- Create: `apps/admin-web/src/modules/videos/services/videoService.ts` for API/mock switching.
- Modify: `apps/admin-web/src/modules/videos/model/videoP8View.ts` to map API DTOs into existing view-models.
- Modify: `apps/admin-web/src/pages/VideoListTask.vue` to load sources/projects from `videoService` and keep explicit loading/error states.
- Add or update tests under `apps/admin-web/src/modules/videos`.

## Task 1: Shared Video Contracts

**Files:**
- Create: `packages/shared/src/videos.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add shared DTOs**

Create `packages/shared/src/videos.ts` with these top-level exports:

```ts
import type { PagedResult } from './api.js';

export type VideoProjectType = 'first_test' | 'chapter_range' | 'full_book_seed';
export type VideoLifecycleStatus = 'active' | 'stopped' | 'archived';
export type VideoReferenceStatus = 'normal' | 'info' | 'warning' | 'blocking' | 'resolved';
export type VideoProductionStatus = 'not_started' | 'ready_for_generation' | 'generation_locked';
export type VideoIssueLevel = 'info' | 'warning' | 'blocking';
export type VideoIssueAction = 'ignore' | 'resolve' | 'stop_project' | 'return_to_novel';

export interface VideoReadySourceDTO {
  novelId: string;
  title: string;
  creationStage: 'video_ready';
  videoReadinessSnapshotId: string;
  snapshotStatus: string;
  chapterCount: number;
  totalWordCount: number;
  firstVideoSuggestion: {
    chapterRangeText: string;
    chapterIds: string[];
    title: string;
  };
  updatedAt: string;
}

export type VideoReadySourceListDTO = PagedResult<VideoReadySourceDTO>;

export interface VideoProjectDTO {
  id: string;
  title: string;
  projectType: VideoProjectType;
  novelId: string;
  novelTitle: string;
  lifecycleStatus: VideoLifecycleStatus;
  referenceStatus: VideoReferenceStatus;
  productionStatus: VideoProductionStatus;
  chapterRangeText: string;
  chapterCount: number;
  currentVideoReferenceId: string;
  defaultVideoUnitId: string;
  updatedAt: string;
}

export type VideoProjectListDTO = PagedResult<VideoProjectDTO>;

export interface CreateVideoProjectRequest {
  idempotencyToken: string;
  novelId: string;
  videoReadinessSnapshotId: string;
  title: string;
  projectType: VideoProjectType;
  chapterRange: {
    mode: 'first_recommended' | 'custom';
    chapterIds: string[];
  };
  duplicatePolicy?: 'return_existing' | 'create_distinct';
}

export interface VideoProjectActionResultDTO {
  project: VideoProjectDTO;
  reusedExisting: boolean;
  reference: VideoReferenceDetailDTO;
}

export interface VideoReferenceChapterSnapshotDTO {
  chapterId: string;
  chapterNo: number;
  chapterTitle: string;
  contentVersionId: string;
  wordCount: number;
  summary: string;
  riskLevel: string;
}

export interface VideoReferenceIssueDTO {
  id: string;
  issueLevel: VideoIssueLevel;
  issueType: string;
  issueReason: string;
  status: 'open' | 'resolved' | 'ignored';
  affectedChapterIds: string[];
  resolutionAction: VideoIssueAction | null;
  resolutionReason: string | null;
}

export interface VideoReferenceDetailDTO {
  project: VideoProjectDTO;
  referenceId: string;
  versionNo: number;
  status: VideoReferenceStatus;
  chapterRangeText: string;
  chapterCount: number;
  referenceSummary: string;
  chapters: VideoReferenceChapterSnapshotDTO[];
  issues: VideoReferenceIssueDTO[];
  nextAction: {
    label: string;
    disabled: boolean;
    disabledReason: string | null;
  };
}

export interface RecheckVideoReferenceRequest {
  idempotencyToken: string;
  expectedReferenceVersion: number;
}

export interface ResolveVideoReferenceIssueRequest {
  idempotencyToken: string;
  action: Exclude<VideoIssueAction, 'return_to_novel'>;
  reason: string;
}

export interface StopVideoProjectRequest {
  idempotencyToken: string;
  reason: string;
}
```

- [ ] **Step 2: Export contracts**

Add to `packages/shared/src/index.ts`:

```ts
export * from './videos.js';
```

- [ ] **Step 3: Run shared package tests**

Run: `npm test -w @ai-shortvideo/shared`

Expected: PASS.

## Task 2: Prisma Video Models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add models and fields**

Add `VideoProject`, `VideoUnit`, `VideoReferenceChapterSnapshot`, and `VideoActionReceipt`. Extend `VideoReference` and `VideoReferenceIssue` according to `docs/modules/video-task-package-8b-detailed-design.md`.

- [ ] **Step 2: Generate Prisma client**

Run: `npm run prisma:generate -w @ai-shortvideo/api`

Expected: generated client includes `VideoProject`, `VideoUnit`, `VideoReferenceChapterSnapshot`, `VideoActionReceipt`.

- [ ] **Step 3: Validate schema**

Run: `npm run prisma:validate -w @ai-shortvideo/api`

Expected: PASS.

## Task 3: Video Domain Rules

**Files:**
- Create: `apps/api/src/modules/videos/domain/videoDomain.ts`
- Test: `apps/api/src/modules/videos/videoRoutes.test.ts`

- [ ] **Step 1: Add request hashing and validation helpers**

Implement helpers:

```ts
export function createVideoActionRequestHash(input: unknown): string;
export function assertIdempotencyToken(value: unknown): string;
export function assertIssueActionAllowed(level: 'info' | 'warning' | 'blocking', action: string): void;
export function createVideoReferenceNextAction(status: string): { label: string; disabled: boolean; disabledReason: string | null };
```

- [ ] **Step 2: Add tests through route behavior**

Cover idempotency conflict and blocking issue ignore in `videoRoutes.test.ts`, rather than over-testing private helpers.

## Task 4: In-Memory Repository and Service

**Files:**
- Create: `apps/api/src/modules/videos/repositories/inMemoryVideoRepository.ts`
- Create: `apps/api/src/modules/videos/services/videoService.ts`
- Create: `apps/api/src/modules/videos/videoRoutes.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests for:

```ts
it('creates a video project from a video_ready novel and stores a reference snapshot');
it('reuses a video project for the same idempotency token and same request hash');
it('rejects the same idempotency token with a different request hash');
it('rejects non video_ready novels');
it('creates a reference issue when recheck sees changed chapter versions');
it('does not allow blocking issues to be ignored');
```

- [ ] **Step 2: Implement in-memory repository**

Repository methods:

```ts
listSources(query)
listProjects(query)
findProjectById(tenantId, videoId)
createProjectWithReference(input)
findActionReceipt(tenantId, actionType, idempotencyToken)
createActionReceipt(input)
getReferenceDetail(tenantId, videoId)
recheckReference(input)
resolveIssue(input)
stopProject(input)
```

- [ ] **Step 3: Implement service orchestration**

Service must:

- Check `video_ready` and current `VideoReadinessSnapshot`.
- Build `VideoReferenceChapterSnapshot` from current chapters and chapter content versions.
- Create default `VideoUnit`.
- Write action receipts and operation logs.
- Return shared DTOs only, never full chapter body.

- [ ] **Step 4: Run API tests**

Run: `npm test -w @ai-shortvideo/api -- videoRoutes`

Expected: PASS.

## Task 5: Fastify Routes

**Files:**
- Create: `apps/api/src/modules/videos/routes/videoRoutes.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Add routes**

Register:

```ts
GET /videos/sources
GET /videos
POST /videos
GET /videos/:videoId/reference
POST /videos/:videoId/reference/recheck
POST /videos/:videoId/reference/issues/:issueId/resolve
POST /videos/:videoId/stop
```

- [ ] **Step 2: Add JSON schemas**

Every route has params/query/body schema. Every response uses the existing envelope via `sendOk`.

- [ ] **Step 3: Register routes in app**

`buildApp` should create a default video repository matching the novel repository mode.

## Task 6: Prisma Repository

**Files:**
- Create: `apps/api/src/modules/videos/repositories/prismaVideoRepository.ts`

- [ ] **Step 1: Implement transactional create**

Use one transaction to create:

```text
VideoProject
VideoReference
VideoReferenceChapterSnapshot[]
VideoUnit
VideoActionReceipt
OperationLog
```

- [ ] **Step 2: Implement list/detail/recheck/resolve/stop**

All queries must filter by `tenantId` and `deletedAt` where applicable. List queries must paginate and avoid loading full chapter bodies.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck -w @ai-shortvideo/api`

Expected: PASS.

## Task 7: Frontend Video Service

**Files:**
- Create: `apps/admin-web/src/modules/videos/services/videoService.ts`
- Modify: `apps/admin-web/src/modules/videos/model/videoP8View.ts`
- Test: `apps/admin-web/src/modules/videos/model/videoP8View.test.ts`

- [ ] **Step 1: Add service functions**

Implement:

```ts
listVideoSources()
listVideoProjects()
createVideoProject()
getVideoReference()
recheckVideoReference()
resolveVideoReferenceIssue()
stopVideoProject()
```

Each function uses `apiRequest` in API mode and existing prototype data in mock mode.

- [ ] **Step 2: Add DTO mapping tests**

Map `VideoProjectDTO` to existing `VideoP8Project` and assert:

- status tags match.
- production remains `P8 未开始生成`.
- no forbidden action label appears.

## Task 8: Wire `/videos` Page to API

**Files:**
- Modify: `apps/admin-web/src/pages/VideoListTask.vue`

- [ ] **Step 1: Load sources and projects**

On mount and after filter changes, call `videoService`.

- [ ] **Step 2: Add loading/error states**

Show loading for sources/list/create/recheck/issue actions. On API errors, show Element Plus message/alert with next-step text.

- [ ] **Step 3: Preserve mock behavior**

When `VITE_API_MODE=mock`, the page keeps current prototype behavior.

- [ ] **Step 4: Smoke test**

Run app, open `/videos`, create a project from a `video_ready` novel, verify list and reference detail update.

## Task 9: Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run backend tests**

Run: `npm test -w @ai-shortvideo/api`

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run: `npm test -w admin-web`

Expected: PASS.

- [ ] **Step 3: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 4: Browser smoke**

Verify:

- `/videos` opens.
- `/videos?create=1&novelId=...` opens create flow.
- create uses API in API mode.
- repeated create reuses result.
- no active P9/P10 action is visible.

## Self-Review

- Spec coverage: P8b covers persisted video project, reference snapshot, default unit, reference issues, idempotency, frontend service integration, and P9/P10 boundary.
- Placeholder scan: no TBD/TODO placeholders are intentionally left as plan content.
- Type consistency: DTO names match `packages/shared/src/videos.ts`; backend service/routes should import these names from `@ai-shortvideo/shared`.
