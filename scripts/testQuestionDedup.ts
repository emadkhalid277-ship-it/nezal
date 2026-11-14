import assert from 'node:assert/strict';
import {
  buildSeenRecordId,
  computeSubcategoryDedupStats,
  DEFAULT_QUESTION_DEDUP_SETTINGS,
  isQuestionInSeenSet,
  normalizeSeenQuestionId,
  selectNextQuestionForSlot,
  shouldRecordQuestionSeenForParticipant,
} from '../src/utils/questionDedupLogic';
import { SubcategoryItem, TriviaQuestion } from '../src/types/game';

function makeQuestion(id: string, category = 'تاريخ إسلامي', subcategoryId = 'sub-islamic-history', points: 100 | 200 | 300 | 400 | 500 = 100): TriviaQuestion {
  return {
    id,
    subcategoryId,
    category,
    questionText: `سؤال تجريبي ${id}`,
    questionType: 'direct',
    difficulty: 'سهل',
    points,
    options: [],
    correctAnswer: 'إجابة تجريبية',
    explanation: '',
    source: '',
    status: 'approved',
    authorId: 'system',
    createdAt: '2026-01-01T00:00:00.000Z',
    reviewedAt: '2026-01-01T00:00:00.000Z',
  };
}

const subReligion: SubcategoryItem = {
  id: 'sub-islamic-history',
  name: 'تاريخ إسلامي',
  mainCategoryId: 'main-religion',
  mainCategory: 'الدين',
  description: 'تاريخ إسلامي',
  sortOrder: 1,
  isActive: true,
};

const subGeo: SubcategoryItem = {
  id: 'sub-capitals',
  name: 'عواصم الدول',
  mainCategoryId: 'main-geography',
  mainCategory: 'الجغرافيا',
  description: 'عواصم',
  sortOrder: 2,
  isActive: true,
};

const q1 = makeQuestion('q-rel-100-a');
const q2 = makeQuestion('q-rel-100-b');
const q3 = makeQuestion('q-rel-100-c');
const qGeo = makeQuestion('q-geo-100-a', 'عواصم الدول', 'sub-capitals', 100);

// 1. Default settings check
assert.equal(DEFAULT_QUESTION_DEDUP_SETTINGS.allowRepeatAfterExhaustion, false);
assert.equal(DEFAULT_QUESTION_DEDUP_SETTINGS.trackSpectators, false);

// 2. UID-bound deterministic record keys (never tied to displayName)
const recUserA = buildSeenRecordId('uid_alpha_123', 'q-rel-100-a');
const recUserB = buildSeenRecordId('uid_beta_456', 'q-rel-100-a');
assert.notEqual(recUserA, recUserB);
assert.equal(recUserA, 'uid_alpha_123__q-rel-100-a');
assert.equal(normalizeSeenQuestionId('q/special id'), 'q-special-id');

// 3. Match 1 -> Player sees q1, Match 2 -> q1 is excluded and q2 is selected
const userASeen = new Set<string>(['q-rel-100-a']);
const match2Selection = selectNextQuestionForSlot({
  candidates: [q1, q2, q3],
  tileKey: 'تاريخ إسلامي__100',
  userSeenQuestionIds: userASeen,
  allowRepeatAfterExhaustion: false,
});
assert.equal(match2Selection.question?.id, 'q-rel-100-b');
assert.equal(match2Selection.isExhausted, false);
assert.equal(match2Selection.isRepeatedFallback, false);
assert.equal(match2Selection.unseenCount, 2);

// 4. Independent player isolation: Player B with empty history still gets q1
const userBSeen = new Set<string>();
const playerBSelection = selectNextQuestionForSlot({
  candidates: [q1, q2, q3],
  tileKey: 'تاريخ إسلامي__100',
  userSeenQuestionIds: userBSeen,
  allowRepeatAfterExhaustion: false,
});
assert.equal(playerBSelection.question?.id, 'q-rel-100-a');
assert.equal(playerBSelection.isExhausted, false);

// 5. Exhaustion behavior with allowRepeatAfterExhaustion = false (NEVER silent repeat!)
const exhaustedSeen = new Set<string>(['q-rel-100-a', 'q-rel-100-b', 'q-rel-100-c']);
const exhaustedBlocked = selectNextQuestionForSlot({
  candidates: [q1, q2, q3],
  tileKey: 'تاريخ إسلامي__100',
  userSeenQuestionIds: exhaustedSeen,
  allowRepeatAfterExhaustion: false,
});
assert.equal(exhaustedBlocked.question, null);
assert.equal(exhaustedBlocked.isExhausted, true);
assert.equal(exhaustedBlocked.isRepeatedFallback, false);
assert.equal(exhaustedBlocked.unseenCount, 0);

// 6. Exhaustion behavior with allowRepeatAfterExhaustion = true
const exhaustedAllowed = selectNextQuestionForSlot({
  candidates: [q1, q2, q3],
  tileKey: 'تاريخ إسلامي__100',
  userSeenQuestionIds: exhaustedSeen,
  allowRepeatAfterExhaustion: true,
});
assert.equal(exhaustedAllowed.question?.id, 'q-rel-100-a');
assert.equal(exhaustedAllowed.isExhausted, true);
assert.equal(exhaustedAllowed.isRepeatedFallback, true);

// 7. When allowRepeatAfterExhaustion = true, unseen questions STILL strictly take precedence
const partialSeen = new Set<string>(['q-rel-100-a', 'q-rel-100-b']);
const stillHasUnseen = selectNextQuestionForSlot({
  candidates: [q1, q2, q3],
  tileKey: 'تاريخ إسلامي__100',
  userSeenQuestionIds: partialSeen,
  allowRepeatAfterExhaustion: true,
});
assert.equal(stillHasUnseen.question?.id, 'q-rel-100-c');
assert.equal(stillHasUnseen.isExhausted, false);
assert.equal(stillHasUnseen.isRepeatedFallback, false);

// 8. Empty bank slot is NOT falsely flagged as exhausted
const emptyBank = selectNextQuestionForSlot({
  candidates: [],
  tileKey: 'تاريخ إسلامي__500',
  userSeenQuestionIds: exhaustedSeen,
  allowRepeatAfterExhaustion: false,
});
assert.equal(emptyBank.question, null);
assert.equal(emptyBank.hasAnyBankQuestions, false);
assert.equal(emptyBank.isExhausted, false);

// 9. Currently open modal tile stays stable while modal is open even after seenSet updates
const openModalSlot = selectNextQuestionForSlot({
  candidates: [q1],
  tileKey: 'تاريخ إسلامي__100',
  pinnedTileQuestions: { 'تاريخ إسلامي__100': 'q-rel-100-a' },
  currentlyOpenTileKey: 'تاريخ إسلامي__100',
  userSeenQuestionIds: new Set(['q-rel-100-a']),
  allowRepeatAfterExhaustion: false,
});
assert.equal(openModalSlot.question?.id, 'q-rel-100-a');

// 10. Spectator exclusion rules
assert.equal(
  shouldRecordQuestionSeenForParticipant({
    userId: 'uid_1',
    isSpectator: false,
    trackSpectators: false,
  }),
  true
);
assert.equal(
  shouldRecordQuestionSeenForParticipant({
    userId: 'uid_spec',
    isSpectator: true,
    trackSpectators: false,
  }),
  false
);
assert.equal(
  shouldRecordQuestionSeenForParticipant({
    userId: 'uid_spec',
    isSpectator: true,
    trackSpectators: true,
  }),
  true
);
assert.equal(
  shouldRecordQuestionSeenForParticipant({
    userId: null,
    isSpectator: false,
    trackSpectators: true,
  }),
  false
);

// 11. Per-subcategory remaining unseen question statistics
const stats = computeSubcategoryDedupStats({
  approvedQuestions: [q1, q2, q3, qGeo],
  subcategories: [subReligion, subGeo],
  seenQuestionIds: new Set(['q-rel-100-a', 'q-rel-100-b']),
});
assert.equal(stats.length, 2);
assert.equal(stats[0].totalQuestions, 3);
assert.equal(stats[0].seenQuestions, 2);
assert.equal(stats[0].remainingUnseen, 1);
assert.equal(stats[0].isExhausted, false);
assert.equal(stats[1].totalQuestions, 1);
assert.equal(stats[1].remainingUnseen, 1);

const statsAllReligionSeen = computeSubcategoryDedupStats({
  approvedQuestions: [q1, q2, q3, qGeo],
  subcategories: [subReligion, subGeo],
  seenQuestionIds: exhaustedSeen,
});
assert.equal(statsAllReligionSeen[0].remainingUnseen, 0);
assert.equal(statsAllReligionSeen[0].isExhausted, true);
assert.equal(isQuestionInSeenSet('q-rel-100-a', exhaustedSeen), true);

console.log('✅ All 11 per-player question deduplication & exhaustion tests passed!');
