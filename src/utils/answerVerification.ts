const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export interface AnswerVerificationResult {
  isCorrect: boolean;
  normalizedSubmitted: string;
  matchedCandidate?: string;
  matchMethod?:
    | 'exact_normalized'
    | 'article_stripped'
    | 'space_collapsed'
    | 'fuzzy_typo'
    | 'empty'
    | 'no_match';
}

export function normalizeAnswerText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.normalize('NFKC');
  text = text.replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_INDIC_DIGITS[ch] ?? ch);

  // Strip Arabic tashkeel/diacritics & tatweel
  text = text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');

  // Unify Arabic letter variants
  text = text
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/گ/g, 'ك')
    .replace(/پ/g, 'ب')
    .replace(/چ/g, 'ج')
    .replace(/ژ/g, 'ز')
    .replace(/ڤ/g, 'ف');

  // Lowercase Latin letters and normalize common punctuation/separators to space
  text = text
    .toLowerCase()
    .replace(/[-–—_/\\،,.;:!?؟"'`~«»()[\]{}|•·+*=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

const PROTECTED_AL_WORDS = new Set([
  'الله',
  'اللهم',
  'الذي',
  'التي',
  'الذين',
  'اللذان',
  'اللتان',
  'اللاتي',
  'اللائي',
  'اله',
  'الوهية',
]);

function stripDefiniteArticle(normalizedText: string): string {
  if (!normalizedText) return '';
  return normalizedText
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      // Only strip leading "ال" from Arabic tokens long enough to avoid mangling 2-3 char roots or Allah
      if (
        !PROTECTED_AL_WORDS.has(token) &&
        /^[\u0600-\u06FF]+$/.test(token) &&
        token.length >= 4 &&
        token.startsWith('ال')
      ) {
        return token.slice(2);
      }
      return token;
    })
    .filter((token) => token !== 'the' && token !== 'a' && token !== 'an')
    .join(' ')
    .trim();
}

function extractDigitTokens(normalizedText: string): string {
  const matches = normalizedText.match(/\d+/g);
  return matches ? matches.join('|') : '';
}

function damerauLevenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, dp[i - 2][j - 2] + cost);
      }
      dp[i][j] = val;
    }
  }
  return dp[n][m];
}

export function extractAcceptedAnswerCandidates(
  correctAnswer: string,
  acceptedAnswers?: string[]
): string[] {
  const rawList: string[] = [];
  if (typeof correctAnswer === 'string' && correctAnswer.trim()) {
    rawList.push(correctAnswer.trim());
  }
  if (Array.isArray(acceptedAnswers)) {
    for (const alt of acceptedAnswers) {
      if (typeof alt === 'string' && alt.trim()) {
        rawList.push(alt.trim());
      }
    }
  }

  const expanded = new Set<string>();

  const addCandidate = (value: string) => {
    const cleaned = value.replace(/^(?:أو|او|or|مثل)\s+/i, '').trim();
    if (cleaned.length >= 1) {
      expanded.add(cleaned);
    }
  };

  for (const raw of rawList) {
    addCandidate(raw);

    // Extract text outside parentheses: e.g. "تسلا (Tesla)" -> "تسلا"
    const outsideParens = raw.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (outsideParens && outsideParens !== raw) {
      addCandidate(outsideParens);
    }

    // Extract text inside parentheses: e.g. "تسلا (Tesla)" -> "Tesla"
    const parenMatches = raw.match(/\(([^)]+)\)/g);
    if (parenMatches) {
      for (const m of parenMatches) {
        const inner = m.slice(1, -1).trim();
        if (inner) {
          addCandidate(inner);
        }
      }
    }
  }

  // Split explicit slash / "أو" / "or" / pipe alternatives on all collected items
  const snapshot = Array.from(expanded);
  for (const item of snapshot) {
    const parts = item
      .split(/\s*[/|]\s*|\s+(?:أو|او|or)\s+/i)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2);
    if (parts.length > 1) {
      for (const part of parts) {
        addCandidate(part);
      }
    }
  }

  return Array.from(expanded);
}

export function verifySubmittedAnswer(params: {
  submittedAnswer: string;
  correctAnswer: string;
  acceptedAnswers?: string[];
}): AnswerVerificationResult {
  const normalizedSubmitted = normalizeAnswerText(params.submittedAnswer || '');
  if (!normalizedSubmitted) {
    return {
      isCorrect: false,
      normalizedSubmitted: '',
      matchMethod: 'empty',
    };
  }

  const candidates = extractAcceptedAnswerCandidates(
    params.correctAnswer,
    params.acceptedAnswers
  );

  const submittedNoAl = stripDefiniteArticle(normalizedSubmitted);
  const submittedCompact = submittedNoAl.replace(/\s+/g, '');
  const submittedDigits = extractDigitTokens(normalizedSubmitted);

  for (const rawCandidate of candidates) {
    const normCandidate = normalizeAnswerText(rawCandidate);
    if (!normCandidate) continue;

    // 1. Exact normalized match
    if (normalizedSubmitted === normCandidate) {
      return {
        isCorrect: true,
        normalizedSubmitted,
        matchedCandidate: rawCandidate,
        matchMethod: 'exact_normalized',
      };
    }

    // Enforce strict digit equality whenever numbers appear in the expected answer
    const candidateDigits = extractDigitTokens(normCandidate);
    if (candidateDigits !== submittedDigits) {
      continue;
    }

    // 2. Definite article ("ال" / "the") stripped match
    const candidateNoAl = stripDefiniteArticle(normCandidate);
    if (candidateNoAl && submittedNoAl === candidateNoAl) {
      return {
        isCorrect: true,
        normalizedSubmitted,
        matchedCandidate: rawCandidate,
        matchMethod: 'article_stripped',
      };
    }

    // 3. Space-collapsed match (e.g. "عبد الله" vs "عبدالله", "ماين كرافت" vs "ماينكرافت")
    const candidateCompact = candidateNoAl.replace(/\s+/g, '');
    if (candidateCompact && submittedCompact === candidateCompact) {
      return {
        isCorrect: true,
        normalizedSubmitted,
        matchedCandidate: rawCandidate,
        matchMethod: 'space_collapsed',
      };
    }

    // 4. Controlled minor typo tolerance for sufficiently long answers (>= 5 chars)
    const maxLen = Math.max(submittedCompact.length, candidateCompact.length);
    const lenDiff = Math.abs(submittedCompact.length - candidateCompact.length);
    const maxEdits = maxLen >= 11 ? 2 : maxLen >= 5 ? 1 : 0;

    if (maxEdits > 0 && lenDiff <= maxEdits) {
      const dist = damerauLevenshtein(submittedCompact, candidateCompact);
      if (dist <= maxEdits) {
        return {
          isCorrect: true,
          normalizedSubmitted,
          matchedCandidate: rawCandidate,
          matchMethod: 'fuzzy_typo',
        };
      }
    }
  }

  return {
    isCorrect: false,
    normalizedSubmitted,
    matchMethod: 'no_match',
  };
}
