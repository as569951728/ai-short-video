import 'dotenv/config';
import { pathToFileURL } from 'node:url';

interface SmokeEnv {
  DATABASE_URL?: string;
  ALLOW_P8B_SMOKE_DB_WRITE?: string;
}

type SmokeSafetyReason =
  | 'DATABASE_URL_MISSING'
  | 'DATABASE_URL_INVALID'
  | 'DATABASE_HOST_NOT_LOCAL'
  | 'DATABASE_NAME_NOT_SAFE'
  | 'SMOKE_WRITE_NOT_ALLOWED';

export interface P8bMysqlSmokeSafetySummary {
  databaseUrlConfigured: boolean;
  hostIsLocal: boolean | null;
  databaseNameLooksSafe: boolean | null;
  writeAuthorized: boolean;
}

export type P8bMysqlSmokeSafetyResult =
  | {
      ok: true;
      summary: P8bMysqlSmokeSafetySummary;
    }
  | {
      ok: false;
      reasonCode: SmokeSafetyReason;
      message: string;
      summary: P8bMysqlSmokeSafetySummary;
    };

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SAFE_DATABASE_NAME_MARKERS = ['dev', 'test', 'smoke', 'local'];

export function evaluateP8bMysqlSmokeSafety(env: SmokeEnv): P8bMysqlSmokeSafetyResult {
  const databaseUrl = env.DATABASE_URL?.trim();
  const writeAuthorized = env.ALLOW_P8B_SMOKE_DB_WRITE === '1';
  const baseSummary: P8bMysqlSmokeSafetySummary = {
    databaseUrlConfigured: Boolean(databaseUrl),
    hostIsLocal: null,
    databaseNameLooksSafe: null,
    writeAuthorized
  };

  if (!databaseUrl) {
    return {
      ok: false,
      reasonCode: 'DATABASE_URL_MISSING',
      message: '未配置数据库连接，P8b MySQL smoke 已安全停止。',
      summary: baseSummary
    };
  }

  const parsed = parseDatabaseUrl(databaseUrl);
  if (!parsed) {
    return {
      ok: false,
      reasonCode: 'DATABASE_URL_INVALID',
      message: '数据库连接格式无法识别，P8b MySQL smoke 已安全停止。',
      summary: baseSummary
    };
  }

  const summary: P8bMysqlSmokeSafetySummary = {
    ...baseSummary,
    hostIsLocal: LOCAL_DATABASE_HOSTS.has(normalizeHost(parsed.hostname)),
    databaseNameLooksSafe: SAFE_DATABASE_NAME_MARKERS.some((marker) => parsed.databaseName.toLowerCase().includes(marker))
  };

  if (!summary.hostIsLocal) {
    return {
      ok: false,
      reasonCode: 'DATABASE_HOST_NOT_LOCAL',
      message: '数据库 host 不是本地地址，P8b MySQL smoke 已拒绝执行。',
      summary
    };
  }

  if (!summary.databaseNameLooksSafe) {
    return {
      ok: false,
      reasonCode: 'DATABASE_NAME_NOT_SAFE',
      message: '数据库名缺少 dev/test/smoke/local 安全标记，P8b MySQL smoke 已拒绝执行。',
      summary
    };
  }

  if (!writeAuthorized) {
    return {
      ok: false,
      reasonCode: 'SMOKE_WRITE_NOT_ALLOWED',
      message: '未设置显式写入授权开关，P8b MySQL smoke 已拒绝执行。',
      summary
    };
  }

  return { ok: true, summary };
}

export function formatP8bMysqlSmokeSafetySummary(result: P8bMysqlSmokeSafetyResult): string {
  const status = result.ok ? 'pass' : 'blocked';
  const reason = result.ok ? 'none' : result.reasonCode;
  return [
    `status=${status}`,
    `reason=${reason}`,
    `databaseUrlConfigured=${String(result.summary.databaseUrlConfigured)}`,
    `hostIsLocal=${String(result.summary.hostIsLocal)}`,
    `databaseNameLooksSafe=${String(result.summary.databaseNameLooksSafe)}`,
    `writeAuthorized=${String(result.summary.writeAuthorized)}`
  ].join(' ');
}

export async function runP8bMysqlSmoke(env: SmokeEnv = process.env, log: (line: string) => void = console.log): Promise<number> {
  const safety = evaluateP8bMysqlSmokeSafety(env);
  log(`[p8b:mysql-smoke] safety ${formatP8bMysqlSmokeSafetySummary(safety)}`);
  if (!safety.ok) {
    log(`[p8b:mysql-smoke] blocked ${safety.message}`);
    return 1;
  }

  const { buildApp } = await import('../../app.js');
  const { disconnectPrismaClient } = await import('../../infrastructure/database/prisma.js');
  const app = await buildApp({ logger: false });
  try {
    await executeP8bSmokeFlow(app, log);
    return 0;
  } catch (error) {
    log(`[p8b:mysql-smoke] failed ${toSafeErrorMessage(error)}`);
    return 1;
  } finally {
    await app.close();
    await disconnectPrismaClient();
  }
}

async function executeP8bSmokeFlow(app: Awaited<ReturnType<typeof import('../../app.js').buildApp>>, log: (line: string) => void) {
  const runId = createSmokeRunId();
  log(`[p8b:mysql-smoke] start runId=${runId}`);

  const sourcesResponse = await app.inject({ method: 'GET', url: '/videos/sources?page=1&pageSize=5' });
  const sources = assertSuccessResponse(sourcesResponse, 'GET /videos/sources');
  const source = sources.data?.items?.[0];
  log(`[p8b:mysql-smoke] sources status=ok count=${Number(sources.data?.total ?? 0)}`);
  if (!source) {
    throw new Error('未找到 video_ready 来源小说，未覆盖 create/reference/recheck/stop；请先准备 P8b-L1b smoke 样本。');
  }

  const createPayload = {
    idempotencyToken: `${runId}:create`,
    novelId: source.novelId,
    videoReadinessSnapshotId: source.videoReadinessSnapshotId,
    title: `P8b smoke ${runId}`,
    projectType: 'first_test',
    chapterRange: {
      mode: 'first_recommended',
      chapterIds: []
    },
    duplicatePolicy: 'return_existing'
  };

  const createResponse = await app.inject({ method: 'POST', url: '/videos', payload: createPayload });
  const created = assertSuccessResponse(createResponse, 'POST /videos');
  const videoId = created.data?.project?.id;
  const referenceVersion = created.data?.reference?.versionNo;
  if (!videoId || !referenceVersion) throw new Error('创建视频项目响应缺少 videoId 或 referenceVersion。');
  log(`[p8b:mysql-smoke] create status=ok videoId=${videoId} referenceVersion=${referenceVersion} chapters=${created.data.reference.chapters.length}`);

  const reuseResponse = await app.inject({ method: 'POST', url: '/videos', payload: createPayload });
  const reused = assertSuccessResponse(reuseResponse, 'POST /videos idempotency reuse');
  if (reused.data?.project?.id !== videoId || reused.data?.reusedExisting !== true) {
    throw new Error('同幂等键同请求未复用首次创建的视频项目。');
  }
  log(`[p8b:mysql-smoke] idempotencyReuse status=ok videoId=${videoId}`);

  const conflictResponse = await app.inject({
    method: 'POST',
    url: '/videos',
    payload: {
      ...createPayload,
      title: `P8b smoke conflict ${runId}`
    }
  });
  assertErrorCode(conflictResponse, 'POST /videos idempotency conflict', 409, 'IDEMPOTENCY_CONFLICT');
  log('[p8b:mysql-smoke] idempotencyConflict status=ok errorCode=IDEMPOTENCY_CONFLICT');

  const detailResponse = await app.inject({ method: 'GET', url: `/videos/${videoId}/reference` });
  const detail = assertSuccessResponse(detailResponse, 'GET /videos/:videoId/reference');
  log(`[p8b:mysql-smoke] referenceDetail status=ok status=${detail.data.status} chapters=${detail.data.chapters.length} issues=${detail.data.issues.length}`);

  const recheckResponse = await app.inject({
    method: 'POST',
    url: `/videos/${videoId}/reference/recheck`,
    payload: {
      idempotencyToken: `${runId}:recheck`,
      expectedReferenceVersion: detail.data.versionNo,
      reason: 'P8b MySQL smoke 引用重检'
    }
  });
  const rechecked = assertSuccessResponse(recheckResponse, 'POST /videos/:videoId/reference/recheck');
  log(`[p8b:mysql-smoke] recheck status=ok referenceStatus=${rechecked.data.status} issues=${rechecked.data.issues.length}`);

  const openIssue = rechecked.data.issues.find((issue: { status: string }) => issue.status === 'open');
  if (openIssue) {
    const resolveResponse = await app.inject({
      method: 'POST',
      url: `/videos/${videoId}/reference/issues/${openIssue.id}/resolve`,
      payload: {
        idempotencyToken: `${runId}:resolve`,
        action: 'resolve',
        reason: 'P8b MySQL smoke 处理引用异常'
      }
    });
    assertSuccessResponse(resolveResponse, 'POST /videos/:videoId/reference/issues/:issueId/resolve');
    log(`[p8b:mysql-smoke] issueResolve status=ok issueId=${openIssue.id}`);
    return;
  }

  const stopResponse = await app.inject({
    method: 'POST',
    url: `/videos/${videoId}/stop`,
    payload: {
      idempotencyToken: `${runId}:stop`,
      reason: 'P8b MySQL smoke 结束后停止测试项目'
    }
  });
  const stopped = assertSuccessResponse(stopResponse, 'POST /videos/:videoId/stop');
  log(`[p8b:mysql-smoke] stop status=ok lifecycleStatus=${stopped.data.project.lifecycleStatus}`);
}

function parseDatabaseUrl(value: string): { hostname: string; databaseName: string } | null {
  try {
    const parsed = new URL(value);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '');
    if (!parsed.hostname || !databaseName) return null;
    return {
      hostname: parsed.hostname,
      databaseName
    };
  } catch {
    return null;
  }
}

function normalizeHost(host: string): string {
  return host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
}

function assertSuccessResponse(response: { statusCode: number; json: () => any }, label: string) {
  const body = response.json();
  if (response.statusCode < 200 || response.statusCode >= 300 || body.success !== true) {
    throw new Error(`${label} 未返回成功响应，status=${response.statusCode} errorCode=${body.error?.code ?? 'unknown'}`);
  }
  return body;
}

function assertErrorCode(response: { statusCode: number; json: () => any }, label: string, expectedStatus: number, expectedCode: string) {
  const body = response.json();
  if (response.statusCode !== expectedStatus || body.error?.code !== expectedCode) {
    throw new Error(`${label} 未返回预期错误，status=${response.statusCode} errorCode=${body.error?.code ?? 'unknown'}`);
  }
}

function createSmokeRunId(): string {
  return `p8b-smoke-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

if (isMainModule()) {
  runP8bMysqlSmoke().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}
