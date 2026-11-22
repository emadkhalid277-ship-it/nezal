import { ANIME_QUESTIONS } from './anime';
import { FOOTBALL_QUESTIONS } from './football';
import { GAMES_QUESTIONS } from './games';
import { GENERAL_QUESTIONS } from './general';
import { GEOGRAPHY_QUESTIONS } from './geography';
import { RELIGION_QUESTIONS, QuestionTemplate } from './religion';
import { SPORTS_QUESTIONS } from './sports';
import { TriviaQuestion } from '../../types/game';
import { DEFAULT_SUBCATEGORIES } from '../categoriesAndSeed';

interface SubcategoryMeta {
  id: string;
  name: string;
  mainCategoryId: string;
  mainCategory: string;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[×✕]/g, 'x')
    .replace(/\s+/g, ' ');
}

/**
 * Verified, unambiguous mapping between raw question dictionary keys and
 * canonical DEFAULT_SUBCATEGORIES IDs.
 * Ambiguous/multi-category keys are intentionally excluded rather than guessed.
 */
const EXPLICIT_SUBCATEGORY_KEY_MAP: Record<string, string> = {
  // Anime
  'هنتر x هنتر': 'sub-hxh',

  // Football
  'كرة القدم': 'sub-football-general',
  'الدوري الانجليزي': 'sub-football-general',
  'الدوريات الخمس الكبرى': 'sub-football-general',
  'الدوري الاسباني': 'sub-football-general',
  'كرة القدم السعودية': 'sub-saudi-league',

  // Games
  'العاب عام': 'sub-video-games',
  'ماين كرافت': 'sub-video-games',
  'فيفا': 'sub-esports-fifa',
  'روكيت ليق': 'sub-esports-fifa',
  'فورتنايت': 'sub-esports-fifa',
  'ريد ديد': 'sub-story-games',
  'رزدننت ايفل': 'sub-story-games',
  'الدن رينق': 'sub-story-games',
  'ميتل قير': 'sub-story-games',

  // General
  'علوم وطب': 'sub-science',
  'تطبيقات': 'sub-tech',
  'عالم الشعر': 'sub-arabic',

  // Geography & History
  'جغرافيا': 'sub-geo-history-general',
  'خرائط': 'sub-geo-history-general',
  'الحرب العالمية': 'sub-geo-history-general',
  'دول وعواصم': 'sub-world-capitals',
  'اعلام': 'sub-flags-landmarks',

  // Religion
  'القران الكريم': 'sub-quran-sciences',
  'جزء عم': 'sub-quran-sciences',
  'اكمل الاية': 'sub-quran-sciences',
  'السيرة النبوية': 'sub-seerah-prophets',
  'قصص الانبياء': 'sub-seerah-prophets',
  'الصحابة': 'sub-companions-history',
  'احاديث': 'sub-islamic-general',

  // Sports
  'كرة السلة': 'sub-basketball-tennis',
  'تنس': 'sub-basketball-tennis',
  'فورملا ون': 'sub-motorsports',
  'ملاكمة ufc': 'sub-combat-sports',
};

const NORMALIZED_EXPLICIT_KEY_MAP = new Map<string, string>(
  Object.entries(EXPLICIT_SUBCATEGORY_KEY_MAP).map(([k, id]) => [normalizeName(k), id])
);

// Visual category helpers with verified Wikimedia / official CDN images
const VISUAL_IMAGES_MAP: Record<string, { url: string; desc: string }> = {
  // أعلام
  'علم السعودية': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/0d/Flag_of_Saudi_Arabia.svg',
    desc: 'علم المملكة العربية السعودية الأخضر مع الشهادتين والسيف'
  },
  'علم اليابان': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/Flag_of_Japan.svg',
    desc: 'علم اليابان الدائرة الحمراء على خلفية بيضاء'
  },
  'علم البرازيل': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg',
    desc: 'علم البرازيل بالقرص الأزرق المعين الذهبي والخلفية الخضراء'
  },
  'علم مصر': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fe/Flag_of_Egypt.svg',
    desc: 'علم جمهورية مصر العربية مع نسر صلاح الدين الذهبي'
  },
  'علم كندا': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/d9/Flag_of_Canada_%28Pantone%29.svg',
    desc: 'علم كندا بورقة شجر القيقب الحمراء'
  },
  // معالم خمن الدولة
  'برج إيفل': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg/640px-Tour_Eiffel_Wikimedia_Commons_%28cropped%29.jpg',
    desc: 'المعلم الحديدي الشهير في باريس'
  },
  'تاج محل': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/640px-Taj_Mahal_%28Edited%29.jpeg',
    desc: 'ضريح الرخام الأبيض الشهير في أغرا'
  },
  'أهرامات الجيزة': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Kheops-Pyramid.jpg/640px-Kheops-Pyramid.jpg',
    desc: 'الهرم الأكبر في الجيزة إحدى عجائب الدنيا السبع القديمة'
  },
  'برج خليفة': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Burj_Khalifa.jpg/640px-Burj_Khalifa.jpg',
    desc: 'أطول ناطحة سحاب في العالم في دبي'
  },
  'ساعة بيغ بن': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/Clock_Tower_-_Palace_of_Westminster%2C_London_-_May_2007.jpg/640px-Clock_Tower_-_Palace_of_Westminster%2C_London_-_May_2007.jpg',
    desc: 'برج الساعة الشهير وقصر وستمنستر في لندن'
  },
  // ملاعب وشعارات كروية
  'كأس العالم': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/World_Cup_Trophy.jpg/640px-World_Cup_Trophy.jpg',
    desc: 'المجسم الذهبي الأصلي لكأس العالم لكرة القدم'
  },
  'الكرة الذهبية': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Ballon_d%27Or_%28vector%29.svg/640px-Ballon_d%27Or_%28vector%29.svg.png',
    desc: 'جائزة الكرة الذهبية (Ballon d\'Or) من فرانس فوتبول'
  },
  'ملعب ماراكانا': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Maracana_Stadium_in_Rio_de_Janeiro.jpg/640px-Maracana_Stadium_in_Rio_de_Janeiro.jpg',
    desc: 'استاد ماراكانا الأسطوري في ريو دي جانيرو بالبرازيل'
  },
  'ملعب سانتياغو برنابيو': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Estadio_Santiago_Bernab%C3%A9u_-_2022.jpg/640px-Estadio_Santiago_Bernab%C3%A9u_-_2022.jpg',
    desc: 'ملعب سانتياغو برنابيو معقل ريال مدريد'
  },
  'ملعب كامب نو': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Camp_Nou_interior%2C_2021.jpg/640px-Camp_Nou_interior%2C_2021.jpg',
    desc: 'استاد كامب نو معقل نادي برشلونة'
  },
  // خرائط
  'مضيق هرمز': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Strait_of_Hormuz.png/640px-Strait_of_Hormuz.png',
    desc: 'خريطة مضيق هرمز شريان تصدير النفط العالمي'
  },
  'قناة السويس': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Suez_Canal_map_en.svg/640px-Suez_Canal_map_en.svg.png',
    desc: 'خريطة المجرى الملاحي لقناة السويس الرابط بين البحرين'
  },
  'مضيق جبل طارق': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Strait_of_gibraltar.jpg/640px-Strait_of_gibraltar.jpg',
    desc: 'مضيق جبل طارق الفاصل بين القارتين الإفريقية والأوروبية'
  }
};

export function buildExpandedQuestionBank(): TriviaQuestion[] {
  const subcategories: SubcategoryMeta[] = DEFAULT_SUBCATEGORIES;
  const normalizedMap = new Map<string, SubcategoryMeta>();
  const subById = new Map<string, SubcategoryMeta>();
  subcategories.forEach(sub => {
    normalizedMap.set(normalizeName(sub.name), sub);
    subById.set(sub.id, sub);
  });

  const allDicts: Record<string, QuestionTemplate[]>[] = [
    ANIME_QUESTIONS,
    FOOTBALL_QUESTIONS,
    GAMES_QUESTIONS,
    GENERAL_QUESTIONS,
    GEOGRAPHY_QUESTIONS,
    RELIGION_QUESTIONS,
    SPORTS_QUESTIONS
  ];

  const exactEntries: Array<{ meta: SubcategoryMeta; qList: QuestionTemplate[] }> = [];
  const mappedEntries: Array<{ meta: SubcategoryMeta; qList: QuestionTemplate[] }> = [];

  for (const dict of allDicts) {
    for (const [subName, qList] of Object.entries(dict)) {
      const normalizedKey = normalizeName(subName);
      const exactMeta = normalizedMap.get(normalizedKey);
      if (exactMeta) {
        exactEntries.push({ meta: exactMeta, qList });
        continue;
      }

      const explicitSubId = NORMALIZED_EXPLICIT_KEY_MAP.get(normalizedKey);
      const mappedMeta = explicitSubId ? subById.get(explicitSubId) : undefined;
      if (mappedMeta) {
        mappedEntries.push({ meta: mappedMeta, qList });
      }
    }
  }

  const results: TriviaQuestion[] = [];
  const perSubcategoryCount = new Map<string, number>();

  const appendBatch = ({ meta, qList }: { meta: SubcategoryMeta; qList: QuestionTemplate[] }) => {
    const startOffset = perSubcategoryCount.get(meta.id) ?? 0;

    qList.forEach((q, idx) => {
      const id = `q-${meta.id}-${q.points}-${startOffset + idx + 1}`;

      // Check if question benefits from a visual illustration
      let imageUrl: string | undefined = undefined;
      let imageDescription: string | undefined = undefined;

      for (const [keyword, visual] of Object.entries(VISUAL_IMAGES_MAP)) {
        if (q.questionText.includes(keyword) || q.correctAnswer.includes(keyword)) {
          imageUrl = visual.url;
          imageDescription = visual.desc;
          break;
        }
      }

      results.push({
        id,
        subcategoryId: meta.id,
        category: meta.name,
        questionText: q.questionText,
        questionType: 'direct',
        difficulty: q.difficulty,
        points: q.points,
        options: [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || '',
        source: q.source || 'بنك أسئلة نِزال المعتمد',
        status: 'pending',
        imageUrl,
        imageDescription,
        authorId: 'system',
        createdAt: '2026-11-06T00:00:00.000Z',
        reviewedAt: '2026-11-06T00:00:00.000Z'
      });
    });

    perSubcategoryCount.set(meta.id, startOffset + qList.length);
  };

  // Process direct exact matches first so all original 675 question IDs stay identical,
  // then append confirmed mapped keys with non-overlapping per-subcategory offsets.
  exactEntries.forEach(appendBatch);
  mappedEntries.forEach(appendBatch);

  return results;
}

export const ALL_EXPANDED_QUESTIONS: TriviaQuestion[] = buildExpandedQuestionBank();
