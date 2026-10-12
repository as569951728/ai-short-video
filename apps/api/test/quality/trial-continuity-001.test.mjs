import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/trial-continuity-001.v1.json', import.meta.url), 'utf8'));
const gold = JSON.parse(readFileSync(new URL('./gold/trial-continuity-001.v1.json', import.meta.url), 'utf8'));
const variantIds = ['clean', 'contradiction'];

function contentHash(chapters) {
  return createHash('sha256').update(chapters.map((chapter) => chapter.content).join('\n')).digest('hex');
}

describe('trial-continuity-001 benchmark assets', () => {
  it('keeps versioned fixture and proposed gold complete and bound to exact text', () => {
    assert.equal(fixture.fixtureId, 'trial-continuity-001');
    assert.equal(fixture.scope, 'trial_chapters_1_3');
    assert.equal(fixture.context.genre, '都市逆袭/重生');
    assert.match(fixture.context.worldRule, /重生后仍保留旧伤/);
    assert.equal(fixture.fixtureId, gold.fixtureId);
    assert.equal(fixture.fixtureVersion, gold.fixtureVersion);
    assert.equal(fixture.rubricVersion, gold.rubricVersion);
    assert.equal(gold.evidenceOffsetUnit, 'utf16_code_units');
    assert.equal(gold.reviewStatus, 'pending_human_review');
    assert.deepEqual(Object.keys(fixture.variants).sort(), variantIds);
    assert.deepEqual(Object.keys(gold.labels).sort(), variantIds);
    assert.deepEqual(fixture.context.chapterPlan.map((chapter) => chapter.chapterNo), [1, 2, 3]);

    for (const variantId of variantIds) {
      const chapters = fixture.variants[variantId].chapters;
      assert.deepEqual(chapters.map((chapter) => chapter.chapterNo), [1, 2, 3]);
      assert.ok(chapters.every((chapter) => typeof chapter.content === 'string' && chapter.content.length > 0));
      assert.match(gold.contentSha256[variantId], /^[a-f0-9]{64}$/);
      assert.equal(contentHash(chapters), gold.contentSha256[variantId]);
    }
  });

  it('changes exactly one sentence in chapter two', () => {
    const clean = fixture.variants.clean;
    const contradiction = fixture.variants.contradiction;
    const { chapterNo, cleanSentence, contradictionSentence } = fixture.singleChange;
    assert.equal(chapterNo, 2);
    assert.notEqual(cleanSentence, contradictionSentence);
    assert.equal(clean.chapters[1].content.split(cleanSentence).length, 2);
    assert.equal(contradiction.chapters[1].content.split(contradictionSentence).length, 2);

    const normalized = structuredClone(contradiction);
    normalized.chapters[1].content = normalized.chapters[1].content.replace(contradictionSentence, cleanSentence);
    assert.deepEqual(normalized, clean);
  });

  it('anchors both blocking-issue evidence spans in the negative variant', () => {
    assert.deepEqual(gold.labels.clean.issues, []);
    const issues = gold.labels.contradiction.issues;
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, 'character_continuity');
    assert.equal(issues[0].severity, 'blocking');
    assert.deepEqual(issues[0].evidence.map((item) => item.chapterNo), [1, 2]);

    for (const evidence of issues[0].evidence) {
      const chapter = fixture.variants.contradiction.chapters.find((item) => item.chapterNo === evidence.chapterNo);
      assert.ok(chapter);
      assert.ok(evidence.charStart >= 0 && evidence.charEnd > evidence.charStart);
      assert.equal(chapter.content.slice(evidence.charStart, evidence.charEnd), evidence.quote);
      assert.equal(chapter.content.indexOf(evidence.quote), evidence.charStart);
      assert.equal(chapter.content.lastIndexOf(evidence.quote), evidence.charStart);
    }
  });

  it('keeps reference labels independent of identical high model self-assessments', () => {
    const cleanClaim = fixture.variants.clean.mockModelSelfAssessment;
    const contradictionClaim = fixture.variants.contradiction.mockModelSelfAssessment;
    assert.deepEqual(cleanClaim, contradictionClaim);
    assert.ok(cleanClaim.totalScore >= 80);
    assert.equal(cleanClaim.trialResult, 'pass');
    assert.equal(cleanClaim.hardFailed, false);
    assert.equal(gold.labels.clean.characterContinuity, 2);
    assert.equal(gold.labels.clean.referenceDisposition, 'continue');
    assert.equal(gold.labels.contradiction.characterContinuity, 0);
    assert.equal(gold.labels.contradiction.referenceDisposition, 'revise_before_continue');
    assert.equal(JSON.stringify(gold).includes('mockModelSelfAssessment'), false);
  });
});
