import {
  QuestionDedupSettings,
  SubcategoryItem,
  TriviaQuestion,
} from '../types/game';
import { matchesSubcategoryQuestion } from '../services/questionService';

export const DEFAULT_QUESTION_DEDUP_SETTINGS: QuestionDedupSettings = {
  id: 'question_dedup',
  allowRepeatAfterExhaustion: false,
  trackSpectators: false,
};

export function normalizeSeenQuestionId(questionId: string): string {
  const cleaned = String(questionId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .slice(0, 128);
  return cleaned || 'q-unknown';
}

export function buildSeenRecordId(uid: string, questionId: string): string {
  const cleanUid = String(uid || '').trim().slice(0, 128);
  return `${cleanUid}__${normalizeSeenQuestionId(questionId)}`;
}

export function isQuestionInSeenSet(
  questionId: string,
  seenSet: Set<string>
): boolean {
  if (!questionId || seenSet.size === 0) return false;
  if (seenSet.has(questionId)) return true;
  const normalized = normalizeSeenQuestionId(questionId);
  return seenSet.has(normalized);
}

export interface SlotSelectionInput {
  candidates: TriviaQuestion[];
  tileKey: string;
  pinnedTileQuestions?: Record<string, string>;
  currentlyOpenTileKey?: string | null;
  roundUsedQuestionIds?: string[];
  sessionUsedQuestionIds?: string[];
  userSeenQuestionIds: Set<string> | string[];
  allowRepeatAfterExhaustion: boolean;
}

export interface SlotSelectionResult {
  question: TriviaQuestion | null;
  hasAnyBankQuestions: boolean;
  isExhausted: boolean;
  isRepeatedFallback: boolean;
  unseenCount: number;
}

export function selectNextQuestionForSlot(
  input: SlotSelectionInput
): SlotSelectionResult {
  const {
    candidates,
    tileKey,
    pinnedTileQuestions = {},
    currentlyOpenTileKey = null,
    roundUsedQuestionIds = [],
    sessionUsedQuestionIds = [],
    userSeenQuestionIds,
    allowRepeatAfterExhaustion,
  } = input;

  if (!candidates || candidates.length === 0) {
    return {
      question: null,
      hasAnyBankQuestions: false,
      isExhausted: false,
      isRepeatedFallback: false,
      unseenCount: 0,
    };
  }

  const seenSet =
    userSeenQuestionIds instanceof Set
      ? userSeenQuestionIds
      : new Set(userSeenQuestionIds || []);
  const roundUsedSet = new Set(roundUsedQuestionIds);
  const sessionUsedSet = new Set(sessionUsedQuestionIds);

  // If this exact tile is currently open in the active modal and pinned, keep it stable while modal is open
  const pinnedId = pinnedTileQuestions[tileKey];
  if (pinnedId && currentlyOpenTileKey === tileKey) {
    const pinnedQ = candidates.find((q) => q.id === pinnedId);
    if (pinnedQ && !roundUsedSet.has(pinnedQ.id)) {
      const unseenRemaining = candidates.filter(
        (q) => !roundUsedSet.has(q.id) && !isQuestionInSeenSet(q.id, seenSet)
      ).length;
      return {
        question: pinnedQ,
        hasAnyBankQuestions: true,
        isExhausted: false,
        isRepeatedFallback: false,
        unseenCount: Math.max(unseenRemaining, 1),
      };
    }
  }

  const pinnedByOtherTiles = new Set(
    Object.entries(pinnedTileQuestions)
      .filter(([k]) => k !== tileKey)
      .map(([, v]) => v)
  );

  // Exclude questions already used in the current round
  const notUsedInRound = candidates.filter((q) => !roundUsedSet.has(q.id));
  if (notUsedInRound.length === 0) {
    return {
      question: null,
      hasAnyBankQuestions: true,
      isExhausted: true,
      isRepeatedFallback: false,
      unseenCount: 0,
    };
  }

  // Strictly exclude all questions in this player's persistent UID seen history
  const unseenInHistory = notUsedInRound.filter(
    (q) => !isQuestionInSeenSet(q.id, seenSet)
  );

  if (unseenInHistory.length > 0) {
    // Also honor an un-seen pin for this tile if still fresh
    if (pinnedId) {
      const freshPinned = unseenInHistory.find((q) => q.id === pinnedId);
      if (freshPinned) {
        return {
          question: freshPinned,
          hasAnyBankQuestions: true,
          isExhausted: false,
          isRepeatedFallback: false,
          unseenCount: unseenInHistory.length,
        };
      }
    }

    const unseenNotPinned = unseenInHistory.filter(
      (q) => !pinnedByOtherTiles.has(q.id)
    );
    const unseenFreshSession = unseenNotPinned.filter(
      (q) => !sessionUsedSet.has(q.id)
    );

    const chosen =
      unseenFreshSession[0] || unseenNotPinned[0] || unseenInHistory[0];

    return {
      question: chosen,
      hasAnyBankQuestions: true,
      isExhausted: false,
      isRepeatedFallback: false,
      unseenCount: unseenInHistory.length,
    };
  }

  // All questions in this slot have already been seen by this user
  if (!allowRepeatAfterExhaustion) {
    return {
      question: null,
      hasAnyBankQuestions: true,
      isExhausted: true,
      isRepeatedFallback: false,
      unseenCount: 0,
    };
  }

  // Admin explicitly enabled replaying old questions AFTER exhausting all new ones
  const fallbackPool = notUsedInRound.filter(
    (q) => !pinnedByOtherTiles.has(q.id)
  );
  const chosenFallback = fallbackPool[0] || notUsedInRound[0];

  return {
    question: chosenFallback,
    hasAnyBankQuestions: true,
    isExhausted: true,
    isRepeatedFallback: true,
    unseenCount: 0,
  };
}

export interface SubcategoryDedupStat {
  subcategoryId: string;
  subcategoryName: string;
  mainCategory: string;
  totalQuestions: number;
  seenQuestions: number;
  remainingUnseen: number;
  isExhausted: boolean;
}

export function computeSubcategoryDedupStats(params: {
  approvedQuestions: TriviaQuestion[];
  subcategories: SubcategoryItem[];
  seenQuestionIds: Set<string>;
}): SubcategoryDedupStat[] {
  const { approvedQuestions, subcategories, seenQuestionIds } = params;

  return subcategories.map((sub) => {
    const matching = approvedQuestions.filter((q) =>
      matchesSubcategoryQuestion(q.category, sub.name, q.subcategoryId, sub.id)
    );
    const uniqueIds = new Set<string>();
    let seenCount = 0;

    for (const q of matching) {
      if (uniqueIds.has(q.id)) continue;
      uniqueIds.add(q.id);
      if (isQuestionInSeenSet(q.id, seenQuestionIds)) {
        seenCount++;
      }
    }

    const total = uniqueIds.size;
    const remaining = Math.max(0, total - seenCount);

    return {
      subcategoryId: sub.id,
      subcategoryName: sub.name,
      mainCategory: sub.mainCategory,
      totalQuestions: total,
      seenQuestions: seenCount,
      remainingUnseen: remaining,
      isExhausted: total > 0 && remaining === 0,
    };
  });
}

export function shouldRecordQuestionSeenForParticipant(params: {
  userId?: string | null;
  isSpectator: boolean;
  trackSpectators: boolean;
}): boolean {
  if (!params.userId || !params.userId.trim()) return false;
  if (params.isSpectator && !params.trackSpectators) return false;
  return true;
}
