# Playback Trend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the current V1 execution layer for ordinary users: trend/need input, trend-fused content generation, playback monetization tracking, and 14-day/30-day review.

**Architecture:** Keep the existing React/Vite local app, but stop growing `src/main.tsx` as a single-file product. First extract shared types and localStorage repositories, then add trend and playback modules with narrow interfaces. Use localStorage for V1; APIs, crawling, automatic publishing, automatic analytics, payments, and SaaS remain later.

**Tech Stack:** React, TypeScript, Vite, lucide-react, browser localStorage, existing OpenAI-compatible model gateway.

---

## Why This Plan Replaces the Old V1 Plan

The original plan at `docs/superpowers/plans/2026-06-06-v1-validation-execution-plan.md` focused on the first creation loop:

> idea -> content package -> quality check -> export -> manual publish record -> review

That loop is already mostly implemented. The current execution target has changed:

1. Product users are ordinary users, not professional creators.
2. The system must help users build their own traffic channels.
3. Short-term revenue targets are self-operated natural playback revenue: 14 days 10 RMB, 30 days 100 RMB.
4. The system moat is not only generation quality; it is demand/trend tracking plus original content transformation plus playback review.

Therefore, the next implementation slice is:

> trend/need card -> trend-fused content package -> playback schedule -> publish metrics -> revenue and trend review

## File Structure

Create:

- `src/types.ts`: shared domain types for creation, projects, trend signals, platform accounts, playback videos, playback metrics, and revenue legacy records.
- `src/storage.ts`: localStorage keys and typed read/write helpers.
- `src/trends.ts`: default trend helpers, status labels, risk labels, and trend-to-creation input helpers.
- `src/playback.ts`: playback schedule, metric, goal, and review helpers.

Modify:

- `src/main.tsx`: import shared types/helpers, add `trends` and `playback` screens, connect trend cards to generation and playback.
- `src/styles.css`: add layouts for trend cards, playback dashboard, status chips, compact metrics, and review tables.
- `PROJECT_BOARD.md`: replace next engineering task with the adjusted implementation sequence.
- `docs/v1/V1_PRODUCT_IMPLEMENTATION_RHYTHM.md`: point implementation order to this plan.
- `docs/v1/V1_PLAYBACK_MONETIZATION_REQUIREMENTS.md`: clarify that trend cards and playback tracking land together.
- `docs/v1/V1_DEMAND_TREND_INTELLIGENCE_REQUIREMENTS.md`: keep as requirements source; update only if implementation reveals gaps.

Already created as planning support:

- `docs/v1/V1_CURRENT_IMPLEMENTATION_PLAN.md`: reader-facing summary of the current implementation sequence.

## Implementation Sequence

### Task 1: Extract Shared Types

**Files:**

- Create: `src/types.ts`
- Modify: `src/main.tsx`

- [ ] Move reusable domain types from `src/main.tsx` into `src/types.ts`.
- [ ] Include existing creation types: `Screen`, `Platform`, `Genre`, `Goal`, `CreationInput`, `StoryboardRow`, `QualityScore`, `GeneratedPackage`, `PublishRecord`, `AccountProfile`, `Project`, `VideoPlan`, and revenue legacy types.
- [ ] Add new types:
  - `TrendSignal`
  - `TrendStatus`
  - `TrendRiskLevel`
  - `PlatformAccount`
  - `PlaybackVideo`
  - `PlaybackVideoStatus`
  - `PlaybackMetric`
  - `MetricWindow`
- [ ] Import the types back into `src/main.tsx`.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Extract shared V1 domain types`.

### Task 2: Extract Local Storage Helpers

**Files:**

- Create: `src/storage.ts`
- Modify: `src/main.tsx`

- [ ] Move localStorage keys and read/write helpers out of `src/main.tsx`.
- [ ] Keep existing keys stable so old browser data is not lost.
- [ ] Add new keys:
  - `aishortvideo:trend-signals`
  - `aishortvideo:platform-accounts`
  - `aishortvideo:playback-videos`
  - `aishortvideo:playback-metrics`
- [ ] Add typed helpers:
  - `readTrendSignals()`
  - `saveTrendSignals(signals)`
  - `readPlatformAccounts()`
  - `savePlatformAccounts(accounts)`
  - `readPlaybackVideos()`
  - `savePlaybackVideos(videos)`
  - `readPlaybackMetrics()`
  - `savePlaybackMetrics(metrics)`
- [ ] Run `npm run build`.
- [ ] Commit with message: `Add V1 local storage repositories`.

### Task 3: Build Trend Signal Logic

**Files:**

- Create: `src/trends.ts`
- Modify: `src/main.tsx`

- [ ] Add trend status labels: 待评估, 可生成, 已生成, 已发布, 已复盘, 不适合.
- [ ] Add risk labels: 低, 中, 高.
- [ ] Add `buildTrendCreationIdea(signal)` that turns a trend card into a safe one-sentence idea.
- [ ] Add `buildTrendFusionNote(signal)` that records source, demand insight, hot reason, content angle, and risk note.
- [ ] Add `seedTrendSignals()` with 10 manually-enterable starter examples suitable for the current story account.
- [ ] Add UI actions to create, edit, mark usable, mark unsuitable, and delete trend cards.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Add trend signal workflow`.

### Task 4: Connect Trend Cards To Generation

**Files:**

- Modify: `src/main.tsx`

- [ ] Add a `trends` navigation item labeled `趋势`.
- [ ] Add a Trends screen with:
  - trend count
  - usable trend count
  - used trend count
  - risk summary
  - trend form
  - trend card list
- [ ] Add a `用趋势生成` action that:
  - populates the creation wizard idea from `buildTrendCreationIdea(signal)`
  - stores the selected `trendSignalId` in local state
  - keeps the user on the normal generation flow
- [ ] Extend `Project` data with optional `trendSignalId` and `trendFusionNote`.
- [ ] Show trend source and fusion note in editor/export.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Connect trend signals to content generation`.

### Task 5: Build Playback Tracking Logic

**Files:**

- Create: `src/playback.ts`
- Modify: `src/main.tsx`

- [ ] Add helpers to create 14-day/30-day schedule slots.
- [ ] Add helpers to compute:
  - published count for 14 days
  - published count for 30 days
  - cumulative views
  - cumulative estimated revenue
  - best video by views
  - best video by revenue
  - trend-fused published count
  - current main action
- [ ] Add helper to attach a generated project to a playback video.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Add playback tracking helpers`.

### Task 6: Build Playback Monetization Page

**Files:**

- Modify: `src/main.tsx`
- Modify: `src/styles.css`

- [ ] Add a `playback` navigation item labeled `播放`.
- [ ] Add platform account panel:
  - platform
  - account name
  - followers
  - monetization entry
  - original declaration
  - settlement status
  - notes
- [ ] Add 14-day and 30-day goal cards:
  - 28/60 publish targets
  - 10/100 RMB revenue targets
  - cumulative views
  - best video
  - trend-fused count
- [ ] Add playback video list with editable status and URL.
- [ ] Add metric entry for 24h, 48h, and 7d views, likes, comments, favorites, follows, estimated revenue, and settled revenue.
- [ ] Add review note fields for topic, hook type, title type, duration, visual style, and trend effectiveness.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Add playback monetization page`.

### Task 7: Connect Export And Cases To Playback

**Files:**

- Modify: `src/main.tsx`

- [ ] Add `加入播放排期` action on export and case detail areas.
- [ ] When adding to playback, preserve:
  - project id
  - platform
  - topic
  - selected title
  - trend signal id
  - planned publish date
- [ ] After adding, route the user to the playback page.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Connect generated projects to playback schedule`.

### Task 8: Add Review Exports

**Files:**

- Modify: `src/playback.ts`
- Modify: `src/main.tsx`

- [ ] Add Markdown export for 14-day playback review.
- [ ] Add Markdown export for 30-day traffic asset review.
- [ ] Add Markdown export for trend/need review.
- [ ] Each export must include:
  - target progress
  - published count
  - revenue
  - best videos
  - trend conclusions
  - blocker diagnosis
  - next 7-day actions
- [ ] Run `npm run build`.
- [ ] Commit with message: `Add playback and trend review exports`.

### Task 9: Update Home Dashboard

**Files:**

- Modify: `src/main.tsx`
- Modify: `src/styles.css`

- [ ] Replace sales-led home metrics with current V1 metrics:
  - trend signals
  - usable trends
  - generated projects
  - scheduled playback videos
  - published videos
  - cumulative views
  - 14-day revenue progress
  - 30-day revenue progress
- [ ] Add one current main action based on helper output.
- [ ] Keep the old revenue page accessible but visually label it as 后置销售路线.
- [ ] Run `npm run build`.
- [ ] Commit with message: `Update home dashboard for playback goals`.

### Task 10: Browser Verification

**Files:**

- No source changes unless defects are found.

- [ ] Start `npm run dev`.
- [ ] Open the app in the in-app browser.
- [ ] Verify:
  - trend card creation
  - trend-to-generation flow
  - project generation
  - add to playback schedule
  - platform account entry
  - 24h metric entry
  - 14-day and 30-day progress cards
  - review export copy
- [ ] Take screenshots or notes for visible UI issues.
- [ ] Fix any blocking UI/data issues.
- [ ] Run `npm run build`.
- [ ] Commit fixes with a focused message.

## Acceptance Criteria

- Ordinary user path is visible from home: 趋势 -> 生成 -> 播放 -> 复盘.
- The app can store at least 10 trend/need signals locally.
- A trend card can generate or prefill a content idea.
- A generated project can be added to a playback schedule.
- Playback page tracks 14-day 10 RMB and 30-day 100 RMB goals.
- Playback page can record 24h/48h/7d metrics and estimated revenue.
- Trend-fused videos can be reviewed separately from non-trend videos.
- Old sales/revenue workflow is labeled as later, not current P0.
- `npm run build` passes.
