import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeBuildBudget } from '../scripts/check-build-budget.mjs'

const knownWarningOutput = `
[INVALID_ANNOTATION] A comment "/* #__PURE__ */" in "../../node_modules/@vueuse/core/dist/index.js" contains an annotation that Rolldown cannot interpret.
../../node_modules/@vueuse/core/dist/index.js:3362:1
[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
[INVALID_ANNOTATION] A comment "/* #__PURE__ */" in "../../node_modules/@vueuse/core/dist/index.js" contains an annotation that Rolldown cannot interpret.
../../node_modules/@vueuse/core/dist/index.js:5780:23
`

const compliantChunks = [
  createChunk('index-abcd1234.js', 1_000_000, 320_000),
  createChunk('NovelDetailWorkbench-abcd1234.js', 96_000, 24_000),
  createChunk('VideoDetailWorkbench-abcd1234.js', 55_000, 12_000),
]

describe('admin build budget analyzer', () => {
  it('allows the known vueuse annotation warnings, controlled chunk warning, and compliant chunks', () => {
    const result = analyzeBuildBudget({
      buildOutput: knownWarningOutput,
      chunks: compliantChunks,
      entryBudgetBytes: 1_100_000,
      routeChunkBudgetBytes: 200_000,
    })

    assert.equal(result.entryChunk.fileName, 'index-abcd1234.js')
    assert.deepEqual(result.warningProblems, [])
  })

  it('rejects an unknown bracket warning fingerprint', () => {
    assert.throws(
      () =>
        analyzeBuildBudget({
          buildOutput: `${knownWarningOutput}\n[SOME_WARNING] New warning from bundler`,
          chunks: compliantChunks,
          entryBudgetBytes: 1_100_000,
          routeChunkBudgetBytes: 200_000,
        }),
      /SOME_WARNING/,
    )
  })

  it('rejects an unknown Vite bang warning', () => {
    assert.throws(
      () =>
        analyzeBuildBudget({
          buildOutput: `${knownWarningOutput}\n(!) Unknown Vite warning that needs review`,
          chunks: compliantChunks,
          entryBudgetBytes: 1_100_000,
          routeChunkBudgetBytes: 200_000,
        }),
      /Unknown Vite warning/,
    )
  })

  it('rejects an entry chunk that exceeds the budget', () => {
    assert.throws(
      () =>
        analyzeBuildBudget({
          buildOutput: '',
          chunks: [createChunk('index-big.js', 1_101_000, 330_000)],
          entryBudgetBytes: 1_100_000,
          routeChunkBudgetBytes: 200_000,
        }),
      /entry chunk 超预算: index-big\.js 1101\.00 kB > 1100\.00 kB/,
    )
  })

  it('rejects a route chunk that exceeds the budget', () => {
    assert.throws(
      () =>
        analyzeBuildBudget({
          buildOutput: '',
          chunks: [createChunk('index-ok.js', 1_000_000, 320_000), createChunk('NovelDetailWorkbench-big.js', 201_000, 50_000)],
          entryBudgetBytes: 1_100_000,
          routeChunkBudgetBytes: 200_000,
        }),
      /route chunk 超预算[\s\S]*NovelDetailWorkbench-big\.js 201\.00 kB > 200\.00 kB/,
    )
  })

  it('passes when warnings disappear because the whitelist is not a must-exist list', () => {
    const result = analyzeBuildBudget({
      buildOutput: '',
      chunks: compliantChunks,
      entryBudgetBytes: 1_100_000,
      routeChunkBudgetBytes: 200_000,
    })

    assert.equal(result.warningProblems.length, 0)
    assert.equal(result.oversizedRoutes.length, 0)
  })
})

function createChunk(fileName: string, sizeBytes: number, gzipBytes: number) {
  return { fileName, sizeBytes, gzipBytes }
}
