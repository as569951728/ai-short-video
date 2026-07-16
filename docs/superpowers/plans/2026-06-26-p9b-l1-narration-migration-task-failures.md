# P9b-L1 Narration Migration and Task Failure Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce P9b conditional-pass risk by adding reviewable `VideoArtifact` migration support and verifiable narration failure, cancellation, and retry paths.

**Architecture:** Keep P9b limited to narration artifacts. Store safe task summaries in `VideoActionReceipt.metadata`, render them through the workbench aggregate, and keep failure/cancellation from writing `VideoArtifact` rows or unlocking downstream P9c steps.

**Tech Stack:** Fastify + TypeScript, Prisma schema/migration SQL, Vue 3 + Element Plus, shared DTO contracts.

---

### Task 1: Migration Draft

**Files:**
- Create: `apps/api/prisma/migrations/20260626000000_add_video_artifact/migration.sql`
- Test: `apps/api/prisma/video-artifact-migration.test.ts`

- [x] **Step 1: Write the failing migration test**

```ts
assert.match(sql, /CREATE TABLE `video_artifact`/);
assert.match(sql, /UNIQUE KEY `video_artifact_tenant_project_type_version_uq`/);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -w @ai-shortvideo/api -- videoRoutes video-artifact-migration`
Expected: FAIL because the migration file does not exist.

- [x] **Step 3: Add migration SQL**

Create `video_artifact` with tenant/project/unit/reference IDs, artifact status/version/current fields, source/provider JSON, narration text metadata, confirmation/rejection fields, unique version constraint, and workbench lookup indexes.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -w @ai-shortvideo/api -- videoRoutes video-artifact-migration`
Expected: PASS.

### Task 2: API Failure, Cancellation, and Retry

**Files:**
- Modify: `packages/shared/src/videos.ts`
- Modify: `apps/api/src/modules/videos/routes/videoRoutes.ts`
- Modify: `apps/api/src/modules/videos/services/videoService.ts`
- Modify: `apps/api/src/modules/videos/repositories/inMemoryVideoRepository.ts`
- Modify: `apps/api/src/modules/videos/repositories/prismaVideoRepository.ts`
- Test: `apps/api/src/modules/videos/videoRoutes.test.ts`

- [x] **Step 1: Write failing API tests**

```ts
assert.equal(failed.task.status, 'failed');
assert.equal(failed.artifacts.length, 0);
assert.equal(retry.task.retryOfTaskId, failed.task.id);
assert.equal(cancelled.task.status, 'cancelled');
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -w @ai-shortvideo/api -- videoRoutes video-artifact-migration`
Expected: FAIL because route/service treat all narration generation as completed.

- [x] **Step 3: Implement task summaries**

Add `mockTaskOutcome` and `retryOfTaskId` to the generation request, save safe task summaries in action receipt metadata, and make workbench recent tasks read the latest narration task receipt.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -w @ai-shortvideo/api -- videoRoutes video-artifact-migration`
Expected: PASS.

### Task 3: Frontend Failure and Retry UX

**Files:**
- Modify: `apps/admin-web/src/modules/videos/services/videoService.ts`
- Modify: `apps/admin-web/src/pages/VideoDetailWorkbench.vue`
- Test: `apps/admin-web/src/modules/videos/services/videoService.test.ts`

- [x] **Step 1: Write failing frontend service tests**

```ts
assert.equal(failed.task.status, 'failed');
assert.equal(failedWorkbench.recentTasks[0].failureCategory, 'provider_error');
assert.equal(cancelled.current, null);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -w admin-web -- videoService`
Expected: FAIL because mock service always returns completed tasks.

- [x] **Step 3: Implement visible task controls**

Show failure category, step, progress, retry, and cancel actions in the task card. Add mock-only failure/cancellation sample buttons for page smoke.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -w admin-web -- videoService`
Expected: PASS.
