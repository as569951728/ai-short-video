import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, '..');
const distAssetsDir = join(appRoot, 'dist', 'assets');

export class BuildBudgetFailure extends Error {}

export const DEFAULT_ENTRY_BUDGET_BYTES = 1_100_000;
export const DEFAULT_ROUTE_CHUNK_BUDGET_BYTES = 200_000;

export function runBuildBudgetCli() {
  const entryBudgetBytes = readPositiveIntEnv('ADMIN_BUILD_ENTRY_BUDGET_BYTES', DEFAULT_ENTRY_BUDGET_BYTES);
  const routeChunkBudgetBytes = readPositiveIntEnv('ADMIN_BUILD_ROUTE_CHUNK_BUDGET_BYTES', DEFAULT_ROUTE_CHUNK_BUDGET_BYTES);

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: appRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const buildOutput = `${build.stdout ?? ''}${build.stderr ?? ''}`;
  if (buildOutput) process.stdout.write(buildOutput);

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  const result = analyzeBuildBudget({
    buildOutput,
    chunks: collectJsChunks(),
    entryBudgetBytes,
    routeChunkBudgetBytes
  });

  printChunkSummary(result.entryChunk, result.chunks);
  console.log(
    `Admin build budget: entry <= ${formatBytes(entryBudgetBytes)}, route chunks <= ${formatBytes(routeChunkBudgetBytes)}`
  );
  console.log('Admin build budget check passed.');
}

export function analyzeBuildBudget({ buildOutput, chunks, entryBudgetBytes, routeChunkBudgetBytes }) {
  const sortedChunks = [...chunks].sort((left, right) => right.sizeBytes - left.sizeBytes);
  const warningProblems = analyzeBuildWarnings(stripAnsi(buildOutput));
  const entryChunk = sortedChunks.find((chunk) => /^index-[\w-]+\.js$/.test(chunk.fileName));

  if (!entryChunk) {
    fail('未找到 admin entry chunk: dist/assets/index-*.js');
  }

  const oversizedRoutes = sortedChunks.filter(
    (chunk) => chunk.fileName !== entryChunk.fileName && chunk.sizeBytes > routeChunkBudgetBytes
  );

  if (warningProblems.length > 0) {
    fail(`发现未纳入白名单的 build warning:\n- ${warningProblems.join('\n- ')}`);
  }

  if (entryChunk.sizeBytes > entryBudgetBytes) {
    fail(
      `entry chunk 超预算: ${entryChunk.fileName} ${formatBytes(entryChunk.sizeBytes)} > ${formatBytes(entryBudgetBytes)}`
    );
  }

  if (oversizedRoutes.length > 0) {
    fail(
      `route chunk 超预算:\n${oversizedRoutes
        .map((chunk) => `- ${chunk.fileName} ${formatBytes(chunk.sizeBytes)} > ${formatBytes(routeChunkBudgetBytes)}`)
        .join('\n')}`
    );
  }

  return {
    chunks: sortedChunks,
    entryChunk,
    oversizedRoutes,
    warningProblems
  };
}

export function collectJsChunks(assetsDir = distAssetsDir) {
  if (!existsSync(assetsDir)) {
    fail(`dist assets 目录不存在: ${assetsDir}`);
  }

  return readdirSync(assetsDir)
    .filter((fileName) => fileName.endsWith('.js'))
    .map((fileName) => {
      const filePath = join(assetsDir, fileName);
      const source = readFileSync(filePath);
      return {
        fileName,
        sizeBytes: statSync(filePath).size,
        gzipBytes: gzipSync(source).length
      };
    })
    .sort((left, right) => right.sizeBytes - left.sizeBytes);
}

export function analyzeBuildWarnings(output) {
  const problems = [];
  const invalidAnnotationMarkers = output.match(/\[INVALID_ANNOTATION]/g) ?? [];
  const invalidAnnotationLocations = new Set(
    Array.from(output.matchAll(/@vueuse\/core\/dist\/index\.js:(\d+):(\d+)/g)).map(
      (match) => `${match[1]}:${match[2]}`
    )
  );
  const allowedVueUseLocations = new Set(['3362:1', '5780:23']);

  if (invalidAnnotationMarkers.length > 0) {
    const exactLocationsAllowed =
      invalidAnnotationLocations.size === allowedVueUseLocations.size &&
      Array.from(invalidAnnotationLocations).every((location) => allowedVueUseLocations.has(location));

    if (invalidAnnotationMarkers.length !== 2 || !exactLocationsAllowed) {
      problems.push(
        `未知 INVALID_ANNOTATION 指纹: count=${invalidAnnotationMarkers.length}, locations=${Array.from(
          invalidAnnotationLocations
        ).join(', ')}`
      );
    }
  }

  const upperCaseMarkers = Array.from(output.matchAll(/\[[A-Z][A-Z_]+]/g)).map((match) => match[0]);
  const unknownMarkers = upperCaseMarkers.filter((marker) => marker !== '[INVALID_ANNOTATION]');
  if (unknownMarkers.length > 0) {
    problems.push(`未知方括号 warning/error 标记: ${Array.from(new Set(unknownMarkers)).join(', ')}`);
  }

  const viteWarningLines = output
    .split('\n')
    .filter((line) => line.includes('(!)'))
    .map((line) => line.trim());
  const allowedViteChunkWarning = '(!) Some chunks are larger than 500 kB after minification. Consider:';
  const unknownViteWarnings = viteWarningLines.filter((line) => line !== allowedViteChunkWarning);
  if (unknownViteWarnings.length > 0) {
    problems.push(`未知 Vite warning: ${unknownViteWarnings.join(' | ')}`);
  }

  return problems;
}

export function printChunkSummary(entryChunk, chunks) {
  console.log('Admin build chunk summary:');
  console.log(`- entry: ${entryChunk.fileName} ${formatBytes(entryChunk.sizeBytes)} gzip ${formatBytes(entryChunk.gzipBytes)}`);
  for (const chunk of chunks.filter((item) => item.fileName !== entryChunk.fileName).slice(0, 8)) {
    console.log(`- route/vendor: ${chunk.fileName} ${formatBytes(chunk.sizeBytes)} gzip ${formatBytes(chunk.gzipBytes)}`);
  }
}

export function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

export function readPositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    fail(`${name} 必须是正整数字节数，当前值: ${raw}`);
  }
  return parsed;
}

export function formatBytes(bytes) {
  return `${(bytes / 1000).toFixed(2)} kB`;
}

function fail(message) {
  throw new BuildBudgetFailure(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runBuildBudgetCli();
  } catch (error) {
    if (error instanceof BuildBudgetFailure) {
      console.error(`Admin build budget check failed: ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
