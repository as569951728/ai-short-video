# AIShortvideo V1 Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable validation slice for AI story short-video content creation, while preserving the complete long-term product blueprint.

**Architecture:** Use a two-layer approach: a complete product blueprint for strategy, and a V1 validation slice for execution. V1 focuses on one user path: one-sentence idea -> story short-video package -> quality check -> export -> manual publishing record -> review.

**Tech Stack:** To be finalized before coding. Recommended default for V1: local Web app, TypeScript, React/Vite or Next.js, Node.js API layer, SQLite/PostgreSQL-compatible schema, provider-agnostic model gateway.

---

## Execution Rule

V1 is not the final product boundary. It is the validation slice for the full system.

Every V1 task must support at least one of these outcomes:

1. Make the system simpler for non-expert users.
2. Help produce publishable story short-video content.
3. Help validate content performance or revenue signals.

If a task does not support one of those outcomes, move it to the full blueprint backlog.

## Deliverable Map

### Current Documents

- Product requirements: `docs/superpowers/specs/2026-06-06-ai-shortvideo-novel-system-prd.md`
- Expert gap review: `docs/superpowers/specs/2026-06-06-agent-review-prd-gaps.md`
- Success/failure factors: `docs/superpowers/specs/2026-06-06-critical-success-failure-factors.md`
- Full blueprint vs validation slice: `docs/superpowers/specs/2026-06-06-full-blueprint-vs-validation-slice.md`
- Project board: `PROJECT_BOARD.md`

### New V1 Planning Artifacts To Create

- Create: `docs/v1/V1_USER_FLOW.md`
- Create: `docs/v1/V1_SCREEN_SPEC.md`
- Create: `docs/v1/V1_DATA_MODEL.md`
- Create: `docs/v1/V1_MODEL_GATEWAY.md`
- Create: `docs/v1/V1_QUALITY_SCORECARD.md`
- Create: `docs/v1/V1_4_WEEK_VALIDATION.md`

### Future App Artifacts

These files should be created only after the V1 planning artifacts are reviewed.

- App shell and workspace.
- Start creation wizard.
- Story short-video generation workflow.
- Structured result editor.
- Quality scorecard.
- Export package.
- Manual publishing record.
- Review table.
- Minimal model connection settings.

## Milestone 0: Finalize V1 Product Definition

### Task 0.1: Create V1 User Flow

**Files:**

- Create: `docs/v1/V1_USER_FLOW.md`
- Modify: `PROJECT_BOARD.md`

- [ ] **Step 1: Create the V1 docs directory**

Run:

```bash
mkdir -p docs/v1
```

Expected: `docs/v1` exists.

- [ ] **Step 2: Write the V1 user flow document**

Create `docs/v1/V1_USER_FLOW.md` with:

```markdown
# V1 User Flow

## Principle

V1 has one main button: Start Creating.

The first-time user path must not expose Prompt, token, model routing, temperature, backup model, or advanced workflow concepts.

## Main Flow

1. User clicks Start Creating.
2. User selects goal.
   - Story short video
   - Novel to short video
   - Story draft
3. User selects platform.
   - Douyin
   - Video Account
   - Xiaohongshu
   - Bilibili
4. User selects genre.
   - Urban comeback
   - Suspense reversal
   - Emotional story
   - Workplace revenge
   - AI sci-fi
5. User enters one-sentence idea.
6. User clicks Generate.
7. System generates a structured publishable package.
8. User edits with task buttons.
9. User runs publish readiness check.
10. User exports package.
11. User manually publishes content.
12. User records basic publish data.
13. System suggests the next content direction.

## First Input Constraints

Required fields before first generation:

- Goal
- Platform
- Genre
- One-sentence idea

Optional fields hidden under Advanced:

- Account persona
- Audience
- Tone
- Duration
- Model mode

## Success Criteria

- User can finish first generation in 5 minutes.
- User can export a publishable package in 30 minutes.
- User never needs to write a Prompt manually.
- Each page has one clear primary next action.
```

- [ ] **Step 3: Update project board**

In `PROJECT_BOARD.md`, mark `设计 V1 最小用户流程` as completed after review.

### Task 0.2: Create V1 Screen Spec

**Files:**

- Create: `docs/v1/V1_SCREEN_SPEC.md`
- Modify: `PROJECT_BOARD.md`

- [ ] **Step 1: Write screen list**

Create `docs/v1/V1_SCREEN_SPEC.md` with:

```markdown
# V1 Screen Spec

## Screen 1: Workspace Home

Primary action:

- Start Creating

Secondary actions:

- Recent Projects
- Review Records
- Settings

Home must not show advanced model terms.

## Screen 2: Start Creation Wizard

Required fields:

- Goal
- Platform
- Genre
- One-sentence idea

Primary action:

- Generate

Advanced collapsed fields:

- Audience
- Tone
- Duration
- Quality mode

## Screen 3: Generation Progress

Steps:

- Understand idea
- Generate hook
- Generate script
- Generate storyboard
- Generate subtitles
- Generate titles
- Generate cover copy
- Generate publish copy
- Run quality check

Failure actions:

- Retry current step
- Use backup model
- Save completed steps

## Screen 4: Structured Result Editor

Sections:

- Hook
- Script
- Storyboard
- Subtitles
- Title options
- Cover copy
- Publish copy

Edit buttons:

- Make shorter
- Make more suspenseful
- Make more emotional
- Make more conversational
- Rewrite opening
- Change ending conflict
- Generate more titles

## Screen 5: Publish Readiness Check

Checklist:

- Hook present
- Script complete
- Storyboard complete
- Subtitles complete
- Title selected
- Cover copy selected
- Publish copy complete
- AI content disclosure reminder shown
- Copyright and sensitive-risk reminder shown

Primary action:

- Fix Issues
- Export Package

## Screen 6: Export Package

Default export:

- Markdown publish package
- Plain text subtitles
- Storyboard table

Advanced export:

- CSV
- JSON

## Screen 7: Publish Record

Fields:

- Platform
- Publish time
- Content URL
- Views
- Likes
- Comments
- Saves
- Follows
- Notes

## Screen 8: Simple Review

Shows:

- Recent content performance
- Best genre
- Best hook pattern
- Best title pattern
- Next content suggestion
```

- [ ] **Step 2: Update project board**

In `PROJECT_BOARD.md`, mark these items complete after review:

- `设计首页：只保留一个主按钮“开始创作”`
- `设计首次成功向导：目标、平台、题材、一句话想法`
- `设计生成结果结构：钩子、脚本、分镜、字幕、标题、封面文案、发布文案`

### Task 0.3: Create V1 Data Model

**Files:**

- Create: `docs/v1/V1_DATA_MODEL.md`

- [ ] **Step 1: Write conceptual data model**

Create `docs/v1/V1_DATA_MODEL.md` with:

```markdown
# V1 Data Model

## AccountProfile

Fields:

- id
- name
- platform
- audience
- persona
- tone
- content_focus
- forbidden_topics
- conversion_goal
- created_at
- updated_at

## ContentProject

Fields:

- id
- account_profile_id
- title
- goal
- platform
- genre
- idea
- status
- selected_template_id
- created_at
- updated_at

Statuses:

- idea
- generated
- editing
- checked
- exported
- published
- reviewed

## GeneratedPackage

Fields:

- id
- content_project_id
- hook
- script
- storyboard
- subtitles
- title_options
- selected_title
- cover_copy_options
- selected_cover_copy
- publish_copy
- quality_score
- model_run_id
- created_at

## QualityScore

Fields:

- id
- generated_package_id
- hook_strength
- emotional_density
- conflict_clarity
- information_gain
- conversational_style
- visual_executability
- platform_fit
- sameness_risk
- copyright_risk
- ai_trace_risk
- total_score
- recommendations
- created_at

## PublishRecord

Fields:

- id
- content_project_id
- platform
- published_at
- content_url
- views
- likes
- comments
- saves
- follows
- notes
- created_at
- updated_at

## CompetitorSample

Fields:

- id
- platform
- url
- title
- opening_hook
- conflict
- emotion_point
- reversal
- comment_keywords
- views
- likes
- saves
- comments
- notes
- created_at

## ModelConnection

Fields:

- id
- provider
- display_name
- base_url
- api_key_reference
- default_model
- is_enabled
- last_test_status
- last_test_at
- created_at
- updated_at

## ModelRun

Fields:

- id
- content_project_id
- provider
- model
- task_type
- status
- input_summary
- output_summary
- error_message
- estimated_cost
- created_at
```

### Task 0.4: Create Model Gateway Minimum Plan

**Files:**

- Create: `docs/v1/V1_MODEL_GATEWAY.md`

- [ ] **Step 1: Write model gateway plan**

Create `docs/v1/V1_MODEL_GATEWAY.md` with:

```markdown
# V1 Model Gateway

## V1 Goal

V1 proves model replaceability with a small, real implementation. It does not try to connect every model provider.

## Supported Provider Types

1. Primary quality model
2. Low-cost draft model
3. Review model
4. OpenAI-compatible custom endpoint

## Hidden From Non-Expert Users

The main creation flow must not show:

- Prompt
- Token
- Temperature
- Model routing
- Backup model

## Visible To Admin

Admin settings can show:

- Provider
- Base URL
- API Key input
- Default model
- Connection test
- Last status
- Failure message

## V1 Tasks

Text generation tasks:

- understandIdea
- generateHook
- generateScript
- generateStoryboard
- generateSubtitles
- generateTitleOptions
- generateCoverCopy
- generatePublishCopy
- scoreQuality
- rewriteSection

## Failure Handling

If a generation step fails:

1. Save completed steps.
2. Show user-friendly failure message.
3. Offer retry.
4. Offer use backup model if configured.
5. Do not lose generated content.

## Acceptance Criteria

- A connection test can verify one provider.
- A failed provider returns a readable error.
- The generation workflow can switch from primary model to backup model.
- Each generation step logs provider, model, task type, status, and error.
```

### Task 0.5: Create Quality Scorecard

**Files:**

- Create: `docs/v1/V1_QUALITY_SCORECARD.md`

- [ ] **Step 1: Write quality scorecard**

Create `docs/v1/V1_QUALITY_SCORECARD.md` with:

```markdown
# V1 Quality Scorecard

Each item scores 1 to 5.

## Score Items

1. Hook strength
2. Emotional density
3. Conflict clarity
4. Information gain
5. Conversational style
6. Visual executability
7. Platform fit
8. Sameness risk
9. Copyright and sensitive risk
10. AI trace risk

## Score Meaning

- 1: Not publishable
- 2: Weak, needs major rewrite
- 3: Usable after edits
- 4: Publishable
- 5: Strong

## Publish Threshold

Recommended publish threshold:

- Total score >= 35
- Hook strength >= 4
- Conflict clarity >= 3
- Visual executability >= 3
- Copyright and sensitive risk >= 4

## Required Recommendations

If any item is below 3, system must generate concrete rewrite suggestions.

## V1 Manual Review Rule

The user can override the score, but must provide a note:

- Why publish anyway
- What will be tested
- What risk is accepted
```

### Task 0.6: Create 4-Week Validation Plan

**Files:**

- Create: `docs/v1/V1_4_WEEK_VALIDATION.md`
- Modify: `PROJECT_BOARD.md`

- [ ] **Step 1: Write validation plan**

Create `docs/v1/V1_4_WEEK_VALIDATION.md` with:

```markdown
# V1 4-Week Validation Plan

## Week 1: Minimum Generation Loop

Build or simulate:

- Account profile
- Start creation wizard
- Story short-video package generation
- Basic editing
- Markdown export

Targets:

- Generate 20 scripts
- Select 8 publishable scripts
- Export each selected script in 30 minutes or less
- Achieve 95% required field completeness

## Week 2: Quality and Competitor Samples

Build or simulate:

- 20 competitor samples
- Quality scorecard
- Rewrite suggestions
- Project status list

Targets:

- Publish 10 pieces
- Record quality score for each piece
- Record experiment hypothesis for each piece
- Scorecard explains at least 70% of manual edits

## Week 3: Publishing Review and Templates

Build or simulate:

- Publishing data entry
- Genre/hook/title comparison
- 3 reusable templates

Targets:

- Publish 20 pieces cumulatively
- Identify 2 promising content structures
- Produce one written review: what to change next

## Week 4: Commercial Validation Package

Build or simulate:

- 1 demo case
- 1 template pack
- 1 AI creation SOP
- 10 customer interview records

Targets:

- Publish 30 pieces cumulatively
- Complete 10 customer interviews
- Get 3 strong-intent signals or 1 paid/trial opportunity

## Gate

Do not start deployment edition or SaaS before:

- 30 published pieces
- 3 complete cases
- 10 customer interviews
- 1 paid, trial, or strong-intent signal
- Non-expert user can export publishable content in 30 minutes
```

- [ ] **Step 2: Update project board**

In `PROJECT_BOARD.md`, mark `制定 4 周执行计划` as completed after review.

## Milestone 1: Choose Technical Execution Path

### Task 1.1: Decide App Form

**Files:**

- Modify: `docs/v1/V1_TECH_DECISIONS.md`

- [ ] **Step 1: Create tech decision file**

Create `docs/v1/V1_TECH_DECISIONS.md` with:

```markdown
# V1 Tech Decisions

## App Form

Decision: Local Web App first.

Reason:

- Fast to build.
- Easy to demo.
- Can later become deployed Web app.
- Avoids mobile app complexity.

## Recommended Stack

- Frontend: React + TypeScript
- Build: Vite or Next.js
- Backend: Node.js API layer
- Database: SQLite for local V1, schema compatible with PostgreSQL later
- Model providers: provider-agnostic gateway

## Non-Goals For V1

- Mobile app
- SaaS billing
- Multi-tenant auth
- Automatic publishing
- Automatic platform data scraping
- Full video editing
```

### Task 1.2: Confirm First Model Providers

**Files:**

- Modify: `docs/v1/V1_TECH_DECISIONS.md`

- [ ] **Step 1: Append model provider decision**

Append:

```markdown
## V1 Model Provider Scope

V1 must prove replaceability, not provider quantity.

Minimum:

- One high-quality primary model
- One low-cost or backup model
- One OpenAI-compatible custom endpoint option

Acceptance:

- Admin can configure provider credentials.
- Admin can run connection test.
- Generation workflow logs provider and model.
- User-facing creation flow hides provider complexity.
```

## Milestone 2: Build V1 After Planning Review

Do not start coding until Milestone 0 and Milestone 1 documents are reviewed.

Recommended build order:

1. Project scaffold.
2. Data schema.
3. Model gateway connection test.
4. Start creation wizard.
5. Mock generation workflow.
6. Real model generation workflow.
7. Structured result editor.
8. Quality scorecard.
9. Export package.
10. Publish record.
11. Simple review.

Each build task must include tests or manual acceptance checks before moving on.

## Milestone 3: Run Validation

After the app can complete the V1 flow:

1. Generate 20 scripts.
2. Manually select 8.
3. Publish first 10.
4. Record results.
5. Adjust templates.
6. Continue to 30 published pieces.
7. Build 3 cases.
8. Conduct 10 customer interviews.
9. Decide next module expansion.

## Immediate Next Step

Create and review the six V1 planning artifacts:

1. `docs/v1/V1_USER_FLOW.md`
2. `docs/v1/V1_SCREEN_SPEC.md`
3. `docs/v1/V1_DATA_MODEL.md`
4. `docs/v1/V1_MODEL_GATEWAY.md`
5. `docs/v1/V1_QUALITY_SCORECARD.md`
6. `docs/v1/V1_4_WEEK_VALIDATION.md`

