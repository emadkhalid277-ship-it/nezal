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
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

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
  subcategories.forEach(sub => {
    normalizedMap.set(normalizeName(sub.name), sub);
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

  const results: TriviaQuestion[] = [];

  for (const dict of allDicts) {
    for (const [subName, qList] of Object.entries(dict)) {
      const meta = normalizedMap.get(normalizeName(subName));
      if (!meta) continue;

      qList.forEach((q, idx) => {
        const id = `q-${meta.id}-${q.points}-${idx + 1}`;

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
    }
  }

  return results;
}

export const ALL_EXPANDED_QUESTIONS: TriviaQuestion[] = buildExpandedQuestionBank();
