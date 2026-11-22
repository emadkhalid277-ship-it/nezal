import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import {
  DEFAULT_WALA_KALIMA_SETTINGS,
  WALA_KALIMA_CONTENT_TYPES,
  type WalaKalimaContentTypeId,
  type WalaKalimaCreateSessionResponse,
  type WalaKalimaEndReason,
  type WalaKalimaPlayerSessionState,
  type WalaKalimaSessionPublicStatus,
  type WalaKalimaSessionStatus,
  type WalaKalimaSettings,
  type WalaKalimaWordEntry,
} from '../src/types/walaKalima.ts';
import type { DifficultyLevel } from '../src/types/game.ts';

interface SeedWordTuple {
  word: string;
  forbiddenWords: string[];
  difficulty: DifficultyLevel;
}

const SEED_WORDS_BY_TYPE: Record<WalaKalimaContentTypeId, SeedWordTuple[]> = {
  football_players: [
    { word: 'ليونيل ميسي', forbiddenWords: ['الأرجنتين', 'برشلونة', 'البرغوث', 'إنتر ميامي'], difficulty: 'سهل' },
    { word: 'كريستيانو رونالدو', forbiddenWords: ['النصر', 'البرتغال', 'الدون', 'ريال مدريد'], difficulty: 'سهل' },
    { word: 'سالم الدوسري', forbiddenWords: ['الهلال', 'المنتخب السعودي', 'التورنيدو', 'الأرجنتين'], difficulty: 'سهل' },
    { word: 'كريم بنزيما', forbiddenWords: ['الاتحاد', 'فرنسا', 'ريال مدريد', 'الحكومة'], difficulty: 'سهل' },
    { word: 'محمد صلاح', forbiddenWords: ['ليفربول', 'مصر', 'الملك المصري', 'إنجلترا'], difficulty: 'سهل' },
    { word: 'كيليان مبابي', forbiddenWords: ['فرنسا', 'ريال مدريد', 'باريس', 'السرعة'], difficulty: 'متوسط' },
    { word: 'إيرلينغ هالاند', forbiddenWords: ['مانشستر سيتي', 'النرويج', 'الأهداف', 'بروسيا دورتموند'], difficulty: 'متوسط' },
    { word: 'ياسر القحطاني', forbiddenWords: ['الهلال', 'القناص', 'المنتخب السعودي', 'رقم 20'], difficulty: 'متوسط' },
    { word: 'زين الدين زيدان', forbiddenWords: ['فرنسا', 'ريال مدريد', 'كأس العالم', 'نطحة'], difficulty: 'متوسط' },
    { word: 'ماجد عبدالله', forbiddenWords: ['النصر', 'السهم الملتهب', 'المنتخب السعودي', 'هدف الصين'], difficulty: 'صعب' },
    { word: 'لوكا مودريتش', forbiddenWords: ['كرواتيا', 'ريال مدريد', 'الكرة الذهبية', 'خط وسط'], difficulty: 'صعب' },
    { word: 'سلمان الفرج', forbiddenWords: ['الهلال', 'نيوم', 'قائد الأخضر', 'المنتخب'], difficulty: 'صعب جداً' },
    { word: 'دييغو مارادونا', forbiddenWords: ['الأرجنتين', 'نابولي', 'يد الله', 'كأس العالم'], difficulty: 'خبير' },
  ],
  anime_characters: [
    { word: 'مونكي دي لوفي', forbiddenWords: ['ون بيس', 'قبعة القش', 'المطاط', 'القرصان'], difficulty: 'سهل' },
    { word: 'ناروتو أوزوماكي', forbiddenWords: ['الهوكاجي', 'كونوها', 'الثعلب', 'شينوبي'], difficulty: 'سهل' },
    { word: 'غوكو', forbiddenWords: ['دراغون بول', 'سايان', 'كامي هامي ها', 'شعر أصفر'], difficulty: 'سهل' },
    { word: 'المحقق كونان', forbiddenWords: ['سينشي', 'النظارات', 'تقلص', 'المنظمة السوداء'], difficulty: 'سهل' },
    { word: 'ليفاي أكرمان', forbiddenWords: ['هجوم العمالقة', 'القائد', 'النظافة', 'السيوف'], difficulty: 'متوسط' },
    { word: 'غوجو ساتورو', forbiddenWords: ['جوجوتسو كايسن', 'العين', 'اللانهائية', 'توسيع المجال'], difficulty: 'متوسط' },
    { word: 'رورونوا زورو', forbiddenWords: ['ثلاثة سيوف', 'ون بيس', 'ضائع', 'أخضر'], difficulty: 'متوسط' },
    { word: 'كيلوا زولديك', forbiddenWords: ['هنتر', 'الكهرباء', 'غون', 'القتلة'], difficulty: 'متوسط' },
    { word: 'لايت ياغامي', forbiddenWords: ['ديث نوت', 'المفكرة', 'إل', 'كيرا'], difficulty: 'صعب' },
    { word: 'إيتاشي أوتشيها', forbiddenWords: ['الشارينغان', 'الأكاتسوكي', 'ساسكي', 'الغربان'], difficulty: 'صعب' },
    { word: 'تانجيرو كامادو', forbiddenWords: ['ديمون سلاير', 'نيزوكو', 'الماء', 'الشياطين'], difficulty: 'صعب جداً' },
    { word: 'سونغ جين وو', forbiddenWords: ['سولو ليفيلينغ', 'الظلال', 'انهض', 'الصياد'], difficulty: 'خبير' },
  ],
  movies_series_characters: [
    { word: 'والتر وايت', forbiddenWords: ['بريكنج باد', 'الكيمياء', 'هايزنبيرغ', 'جيسي'], difficulty: 'سهل' },
    { word: 'باتمان', forbiddenWords: ['الخفاش', 'غوثام', 'بروس واين', 'الجوكر'], difficulty: 'سهل' },
    { word: 'سبايدرمان', forbiddenWords: ['العنكبوت', 'بيتر باركر', 'الشبكة', 'نيويورك'], difficulty: 'سهل' },
    { word: 'هاري بوتر', forbiddenWords: ['السحر', 'هوغوورتس', 'العصا', 'فولدمورت'], difficulty: 'سهل' },
    { word: 'آيرون مان', forbiddenWords: ['توني ستارك', 'الدرع', 'أفنجرز', 'الحديد'], difficulty: 'متوسط' },
    { word: 'شيرلوك هولمز', forbiddenWords: ['التحري', 'لندن', 'واتسون', 'الغليون'], difficulty: 'متوسط' },
    { word: 'جون سنو', forbiddenWords: ['صراع العروش', 'الشمال', 'الشتاء قادم', 'ستارك'], difficulty: 'متوسط' },
    { word: 'البروفيسور (لا كاسا دي بابيل)', forbiddenWords: ['السرقة', 'طوكيو', 'البنك', 'بيلا تشاو'], difficulty: 'صعب' },
    { word: 'دارث فيدر', forbiddenWords: ['حرب النجوم', 'القوة', 'السيف الضوئي', 'القناع الأسود'], difficulty: 'صعب' },
    { word: 'جاك سبارو', forbiddenWords: ['قراصنة الكاريبي', 'جوني ديب', 'السفينة', 'البوصلة'], difficulty: 'صعب جداً' },
    { word: 'أبو عصام (باب الحارة)', forbiddenWords: ['دمشق', 'حارة الضبع', 'الحكيم', 'مسلسل شامي'], difficulty: 'خبير' },
  ],
  general_info: [
    { word: 'الجاذبية الأرضية', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'القفز بالمظلة', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'بصمة الإصبع', forbiddenWords: [], difficulty: 'متوسط' },
    { word: 'ثوران البركان', forbiddenWords: [], difficulty: 'متوسط' },
    { word: 'مثلث برمودا', forbiddenWords: [], difficulty: 'متوسط' },
    { word: 'الكسوف الكلي', forbiddenWords: [], difficulty: 'صعب' },
    { word: 'البحث عن الكنز', forbiddenWords: [], difficulty: 'صعب' },
    { word: 'حفل التخرج', forbiddenWords: [], difficulty: 'صعب جداً' },
    { word: 'التنقيب عن النفط', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'قوس قزح', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'السير أثناء النوم', forbiddenWords: [], difficulty: 'خبير' },
  ],
  countries_cities: [
    { word: 'الرياض', forbiddenWords: ['السعودية', 'العاصمة', 'نجد', 'برج المملكة'], difficulty: 'سهل' },
    { word: 'مكة المكرمة', forbiddenWords: ['الكعبة', 'الحج', 'المسجد الحرام', 'العمرة'], difficulty: 'سهل' },
    { word: 'العلا', forbiddenWords: ['مدائن صالح', 'صخرة الفيل', 'السياحة', 'المدينة'], difficulty: 'متوسط' },
    { word: 'دبي', forbiddenWords: ['الإمارات', 'برج خليفة', 'نخلة جميرا', 'إمارة'], difficulty: 'سهل' },
    { word: 'اليابان', forbiddenWords: ['طوكيو', 'الأنمي', 'السوشي', 'كوكب'], difficulty: 'سهل' },
    { word: 'باريس', forbiddenWords: ['فرنسا', 'برج إيفل', 'الشانزليزيه', 'العاصمة'], difficulty: 'سهل' },
    { word: 'القاهرة', forbiddenWords: ['مصر', 'النيل', 'الأهرامات', 'العاصمة'], difficulty: 'متوسط' },
    { word: 'إسطنبول', forbiddenWords: ['تركيا', 'البوسفور', 'قارتين', 'آيا صوفيا'], difficulty: 'متوسط' },
    { word: 'نيويورك', forbiddenWords: ['أمريكا', 'تمثال الحرية', 'التفاحة الكبيرة', 'ناطحات'], difficulty: 'صعب' },
    { word: 'سويسرا', forbiddenWords: ['جبال الألب', 'الشوكولاتة', 'الساعات', 'البنوك'], difficulty: 'صعب' },
    { word: 'ريو دي جانيرو', forbiddenWords: ['البرازيل', 'التمثال', 'الكارنفال', 'شاطئ'], difficulty: 'صعب جداً' },
    { word: 'آيسلندا', forbiddenWords: ['الجليد', 'البراكين', 'أوروبا', 'الشفق القطبي'], difficulty: 'خبير' },
  ],
  animals: [
    { word: 'الجمل', forbiddenWords: ['الصحراء', 'السنام', 'سفينة', 'القافلة'], difficulty: 'سهل' },
    { word: 'الصقر', forbiddenWords: ['الطير', 'القنص', 'السعودية', 'المخالب'], difficulty: 'سهل' },
    { word: 'البطريق', forbiddenWords: ['القطب', 'الثلج', 'لا يطير', 'أبيض وأسود'], difficulty: 'سهل' },
    { word: 'الأخطبوط', forbiddenWords: ['ثمانية', 'البحر', 'الحبر', 'أذرع'], difficulty: 'متوسط' },
    { word: 'الحرباء', forbiddenWords: ['الألوان', 'تتغير', 'اللسان', 'زاحف'], difficulty: 'متوسط' },
    { word: 'الكنغر', forbiddenWords: ['أستراليا', 'الجيب', 'يقفز', 'طفل'], difficulty: 'متوسط' },
    { word: 'الدلفين', forbiddenWords: ['البحر', 'الذكاء', 'يقفز', 'ثديي'], difficulty: 'سهل' },
    { word: 'الفهد الصياد', forbiddenWords: ['أسرع حيوان', 'الركض', 'مرقط', 'أفريقيا'], difficulty: 'صعب' },
    { word: 'القنفذ', forbiddenWords: ['الأشواك', 'كرة', 'صغير', 'ليلي'], difficulty: 'صعب' },
    { word: 'وحيد القرن', forbiddenWords: ['القرن', 'ضخم', 'جلد سميك', 'مهدد بالانقراض'], difficulty: 'صعب جداً' },
    { word: 'المها العربي', forbiddenWords: ['الصحراء', 'قرون طويلة', 'أبيض', 'الوضيحي'], difficulty: 'خبير' },
  ],
  islamic_figures: [
    { word: 'أبو بكر الصديق', forbiddenWords: ['أول الخلفاء', 'الغار', 'الصديق', 'الهجرة'], difficulty: 'سهل' },
    { word: 'عمر بن الخطاب', forbiddenWords: ['الفاروق', 'العدل', 'ثاني الخلفاء', 'فتح القدس'], difficulty: 'سهل' },
    { word: 'خالد بن الوليد', forbiddenWords: ['سيف الله المسلول', 'المعارك', 'اليرموك', 'القائد'], difficulty: 'سهل' },
    { word: 'صلاح الدين الأيوبي', forbiddenWords: ['حطين', 'القدس', 'الأقصى', 'الصليبيين'], difficulty: 'متوسط' },
    { word: 'طارق بن زياد', forbiddenWords: ['الأندلس', 'الجبل', 'إسبانيا', 'إحراق السفن'], difficulty: 'متوسط' },
    { word: 'بلال بن رباح', forbiddenWords: ['المؤذن', 'أحد أحد', 'الأذان', 'الحبشة'], difficulty: 'سهل' },
    { word: 'الإمام البخاري', forbiddenWords: ['الحديث', 'الصحيح', 'جمع الأحاديث', 'أوزبكستان'], difficulty: 'صعب' },
    { word: 'ابن سينا', forbiddenWords: ['الطب', 'القانون', 'عالم', 'الفلسفة'], difficulty: 'صعب' },
    { word: 'الخوارزمي', forbiddenWords: ['الجبر', 'الرياضيات', 'الأرقام', 'الخوارزميات'], difficulty: 'صعب جداً' },
    { word: 'عثمان بن عفان', forbiddenWords: ['ذو النورين', 'المصحف', 'ثالث الخلفاء', 'الحياء'], difficulty: 'متوسط' },
    { word: 'ابن بطوطة', forbiddenWords: ['الرحالة', 'طنجة', 'السفر', 'تحفة النظار'], difficulty: 'خبير' },
  ],
  brands_companies: [
    { word: 'أرامكو السعودية', forbiddenWords: ['النفط', 'البترول', 'الظهران', 'الطاقة'], difficulty: 'سهل' },
    { word: 'آبل (Apple)', forbiddenWords: ['آيفون', 'التفاحة', 'ستيف جوبز', 'ماك'], difficulty: 'سهل' },
    { word: 'نايكي (Nike)', forbiddenWords: ['الرياضة', 'الصح', 'أحذية', 'جوردان'], difficulty: 'سهل' },
    { word: 'تويوتا', forbiddenWords: ['سيارات', 'اليابان', 'كامري', 'لاندكروزر'], difficulty: 'سهل' },
    { word: 'البيك', forbiddenWords: ['بروستد', 'جدة', 'الدجاج', 'مطعم'], difficulty: 'سهل' },
    { word: 'نتفليكس', forbiddenWords: ['مسلسلات', 'أفلام', 'منصة', 'اشتراك'], difficulty: 'متوسط' },
    { word: 'تسلا', forbiddenWords: ['إيلون ماسك', 'سيارات كهربائية', 'البطارية', 'ذاتية القيادة'], difficulty: 'متوسط' },
    { word: 'سامسونج', forbiddenWords: ['جالكسي', 'كوريا', 'هواتف', 'شاشات'], difficulty: 'متوسط' },
    { word: 'رولكس', forbiddenWords: ['ساعات', 'سويسرا', 'التاج', 'فخامة'], difficulty: 'صعب' },
    { word: 'أمازون', forbiddenWords: ['تسوق', 'جيف بيزوس', 'توصيل', 'متجر'], difficulty: 'صعب' },
    { word: 'سوني (بلايستيشن)', forbiddenWords: ['الألعاب', 'يد تحكم', 'اليابان', 'PS5'], difficulty: 'صعب جداً' },
    { word: 'فيراري', forbiddenWords: ['الحصان', 'إيطاليا', 'سيارة رياضية', 'الأحمر'], difficulty: 'خبير' },
  ],
  objects_tools: [
    { word: 'المكواة', forbiddenWords: ['الملابس', 'الحرارة', 'البخار', 'التجاعيد'], difficulty: 'سهل' },
    { word: 'المقص', forbiddenWords: ['القص', 'الورق', 'شفرتين', 'الحلاقة'], difficulty: 'سهل' },
    { word: 'البوصلة', forbiddenWords: ['الشمال', 'الاتجاهات', 'الإبرة', 'الخريطة'], difficulty: 'سهل' },
    { word: 'المظلة (الشمسية)', forbiddenWords: ['المطر', 'الشمس', 'تفتح', 'الماء'], difficulty: 'سهل' },
    { word: 'المجهر (الميكروسكوب)', forbiddenWords: ['التكبير', 'المختبر', 'الخلايا', 'الصغيرة'], difficulty: 'متوسط' },
    { word: 'الساعة الرملية', forbiddenWords: ['الوقت', 'الزجاج', 'الرمل', 'تقلبها'], difficulty: 'متوسط' },
    { word: 'سماعة الطبيب', forbiddenWords: ['القلب', 'الدكتور', 'النبض', 'الصدر'], difficulty: 'متوسط' },
    { word: 'مفتاح الربط', forbiddenWords: ['المسمار', 'الصامولة', 'الورشة', 'التصليح'], difficulty: 'صعب' },
    { word: 'المنظار الفلكي (التلسكوب)', forbiddenWords: ['النجوم', 'الكواكب', 'الفضاء', 'القمر'], difficulty: 'صعب' },
    { word: 'طفاية الحريق', forbiddenWords: ['النار', 'الدخان', 'حمراء', 'الطوارئ'], difficulty: 'صعب جداً' },
    { word: 'الميزان ذو الكفتين', forbiddenWords: ['الوزن', 'العدل', 'الذهب', 'التساوي'], difficulty: 'خبير' },
  ],
  sports_games: [
    { word: 'الشطرنج', forbiddenWords: ['الملك', 'الوزير', 'الرقعة', 'كش ملك'], difficulty: 'سهل' },
    { word: 'البادل', forbiddenWords: ['المضرب', 'الزجاج', 'التنس', 'كرة صفراء'], difficulty: 'سهل' },
    { word: 'السباحة', forbiddenWords: ['الماء', 'المسبح', 'الطفو', 'الأولمبياد'], difficulty: 'سهل' },
    { word: 'الفورمولا 1', forbiddenWords: ['سباق سيارات', 'الحلبة', 'فيرستابن', 'جدة'], difficulty: 'متوسط' },
    { word: 'البلوت', forbiddenWords: ['ورق', 'صن', 'حكم', 'القهوة'], difficulty: 'سهل' },
    { word: 'كرة السلة', forbiddenWords: ['NBA', 'الرمية', 'البرتقالية', 'الحلقة'], difficulty: 'متوسط' },
    { word: 'الجودو', forbiddenWords: ['قتال', 'اليابان', 'حزام أسود', 'طرح'], difficulty: 'صعب' },
    { word: 'الرماية بالسهم', forbiddenWords: ['القوس', 'الهدف', 'السهم', 'التركيز'], difficulty: 'صعب' },
    { word: 'القفز بالزانة', forbiddenWords: ['العصا', 'الأولمبياد', 'الارتفاع', 'الحاجز'], difficulty: 'صعب جداً' },
    { word: 'البلياردو', forbiddenWords: ['العصا', 'الكرات', 'الطاولة الخضراء', 'الحفرة'], difficulty: 'متوسط' },
    { word: 'سباق التتابع', forbiddenWords: ['الجري', 'العصا', 'أربعة لاعبين', 'المضمار'], difficulty: 'خبير' },
  ],
  inventions_science: [
    { word: 'المصباح الكهربائي', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'الطائرة', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'الإنترنت', forbiddenWords: [], difficulty: 'سهل' },
    { word: 'الغواصة', forbiddenWords: [], difficulty: 'صعب' },
    { word: 'المطبعة', forbiddenWords: [], difficulty: 'متوسط' },
    { word: 'الأشعة السينية (X-Ray)', forbiddenWords: [], difficulty: 'متوسط' },
    { word: 'الذكاء الاصطناعي', forbiddenWords: [], difficulty: 'متوسط' },
    { word: 'الديناميت', forbiddenWords: [], difficulty: 'صعب' },
    { word: 'القطار البخاري', forbiddenWords: [], difficulty: 'صعب جداً' },
    { word: 'الصاروخ الفضائي', forbiddenWords: [], difficulty: 'خبير' },
    { word: 'التطعيم (اللقاح)', forbiddenWords: [], difficulty: 'متوسط' },
  ],
};

interface PersistedDatabase {
  mechanicsVersion?: string;
  settings: WalaKalimaSettings;
  words: WalaKalimaWordEntry[];
}

interface InternalSessionRecord {
  sessionId: string;
  hostSecret: string;
  qrSecret: string;
  claimedPlayerToken: string | null;
  lastPlayerTokenHash: string | null;
  matchId: string;
  tileKey: string;
  teamId: string;
  teamName: string;
  playerName: string;
  contentType: WalaKalimaContentTypeId;
  contentTypeLabel: string;
  status: WalaKalimaSessionStatus;
  timerSeconds: number;
  maxSkips: number;
  pointsPerCorrectWord: number;
  startedAt: number | null;
  expiresAt: number | null;
  createdAt: number;
  words: WalaKalimaWordEntry[];
  currentIndex: number;
  correctCount: number;
  skippedCount: number;
  endReason: WalaKalimaEndReason;
  timeoutHandle: NodeJS.Timeout | null;
  sseClients: Set<Response>;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'wala-kalima-db.json');
const CHARADES_MECHANICS_VERSION = 'charades_v1';

// Seed entries specifically upgraded from abstract trivia into silent-acting Charades concepts
const CHARADES_SEED_UPGRADES = new Set<string>([
  'wk-seed-general_info-2',
  'wk-seed-general_info-3',
  'wk-seed-general_info-4',
  'wk-seed-general_info-7',
  'wk-seed-general_info-8',
  'wk-seed-general_info-9',
  'wk-seed-general_info-11',
  'wk-seed-inventions_science-4',
  'wk-seed-inventions_science-9',
  'wk-seed-inventions_science-10',
]);

function buildInitialWords(): WalaKalimaWordEntry[] {
  const nowIso = new Date().toISOString();
  const entries: WalaKalimaWordEntry[] = [];
  for (const ct of WALA_KALIMA_CONTENT_TYPES) {
    const tuples = SEED_WORDS_BY_TYPE[ct.id] || [];
    tuples.forEach((item, idx) => {
      entries.push({
        id: `wk-seed-${ct.id}-${idx + 1}`,
        word: item.word,
        forbiddenWords: [],
        contentType: ct.id,
        difficulty: item.difficulty,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    });
  }
  return entries;
}

function sanitizeSettings(raw: Partial<WalaKalimaSettings> | undefined): WalaKalimaSettings {
  const validContentIds = new Set<WalaKalimaContentTypeId>(
    WALA_KALIMA_CONTENT_TYPES.map((ct) => ct.id)
  );
  const enabledContentTypes = Array.isArray(raw?.enabledContentTypes)
    ? raw.enabledContentTypes.filter((id): id is WalaKalimaContentTypeId =>
        validContentIds.has(id as WalaKalimaContentTypeId)
      )
    : DEFAULT_WALA_KALIMA_SETTINGS.enabledContentTypes;

  const timerSeconds = Math.max(
    15,
    Math.min(300, Math.round(Number(raw?.timerSeconds) || DEFAULT_WALA_KALIMA_SETTINGS.timerSeconds))
  );
  const maxSkips = Math.max(
    0,
    Math.min(
      10,
      Math.round(
        raw?.maxSkips !== undefined && raw?.maxSkips !== null
          ? Number(raw.maxSkips)
          : DEFAULT_WALA_KALIMA_SETTINGS.maxSkips
      )
    )
  );
  const wordsPerRound = Math.max(1, maxSkips + 1);
  const pointsPerCorrectWord = Math.max(
    10,
    Math.min(1000, Math.round(Number(raw?.pointsPerCorrectWord) || DEFAULT_WALA_KALIMA_SETTINGS.pointsPerCorrectWord))
  );

  return {
    enabled: raw?.enabled !== undefined ? Boolean(raw.enabled) : true,
    timerSeconds,
    maxSkips,
    wordsPerRound,
    pointsPerCorrectWord,
    enabledContentTypes:
      enabledContentTypes.length > 0
        ? Array.from(new Set(enabledContentTypes))
        : DEFAULT_WALA_KALIMA_SETTINGS.enabledContentTypes,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function loadDatabase(): PersistedDatabase {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as Partial<PersistedDatabase>;
      if (parsed && Array.isArray(parsed.words) && parsed.words.length > 0) {
        if (parsed.mechanicsVersion !== CHARADES_MECHANICS_VERSION) {
          // One-time seamless migration from legacy verbal mode to Charades (45s, actable words, skip cap)
          const seedMap = new Map<string, WalaKalimaWordEntry>(
            buildInitialWords().map((w) => [w.id, w])
          );
          const upgradedWords: WalaKalimaWordEntry[] = parsed.words.map(
            (existing): WalaKalimaWordEntry => {
              if (CHARADES_SEED_UPGRADES.has(existing.id)) {
                const replacement = seedMap.get(existing.id);
                if (replacement) {
                  return {
                    ...replacement,
                    isActive: existing.isActive,
                    updatedAt: new Date().toISOString(),
                  };
                }
              }
              return {
                ...existing,
                forbiddenWords: [],
              };
            }
          );
          // Ensure any newly introduced seed IDs are present without deleting custom words
          const existingIds = new Set(upgradedWords.map((w) => w.id));
          for (const seedWord of seedMap.values()) {
            if (!existingIds.has(seedWord.id)) {
              upgradedWords.push(seedWord);
            }
          }
          const prevTimer = parsed.settings?.timerSeconds;
          const migrated: PersistedDatabase = {
            mechanicsVersion: CHARADES_MECHANICS_VERSION,
            settings: sanitizeSettings({
              ...parsed.settings,
              timerSeconds: !prevTimer || prevTimer === 60 ? 45 : prevTimer,
              maxSkips:
                typeof parsed.settings?.maxSkips === 'number'
                  ? parsed.settings.maxSkips
                  : DEFAULT_WALA_KALIMA_SETTINGS.maxSkips,
              updatedAt: new Date().toISOString(),
            }),
            words: upgradedWords,
          };
          saveDatabase(migrated);
          return migrated;
        }

        return {
          mechanicsVersion: CHARADES_MECHANICS_VERSION,
          settings: sanitizeSettings(parsed.settings),
          words: parsed.words,
        };
      }
    }
  } catch (err) {
    console.warn('[NIZAL WalaKalima] Could not read persisted DB, regenerating defaults:', err);
  }

  const initial: PersistedDatabase = {
    mechanicsVersion: CHARADES_MECHANICS_VERSION,
    settings: { ...DEFAULT_WALA_KALIMA_SETTINGS, updatedAt: new Date().toISOString() },
    words: buildInitialWords(),
  };
  saveDatabase(initial);
  return initial;
}

function saveDatabase(dbData: PersistedDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(dbData, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('[NIZAL WalaKalima] Failed to persist DB:', err);
  }
}

function safeEqualStrings(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

const store: PersistedDatabase = loadDatabase();
const activeSessions = new Map<string, InternalSessionRecord>();
const matchUsedWordIds = new Map<string, { ids: Set<string>; updatedAt: number }>();

function getRemainingSeconds(session: InternalSessionRecord): number {
  if (session.status === 'waiting_scan') {
    return session.timerSeconds;
  }
  if (session.status !== 'active' || !session.expiresAt) {
    return 0;
  }
  return Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
}

function getSessionRemainingSkips(session: InternalSessionRecord): number {
  const skipsBySetting = Math.max(0, session.maxSkips - session.skippedCount);
  const skipsByPool = Math.max(0, session.words.length - 1 - session.currentIndex);
  return Math.max(0, Math.min(skipsBySetting, skipsByPool));
}

function toPublicStatus(session: InternalSessionRecord): WalaKalimaSessionPublicStatus {
  // SECURITY INVARIANT: Never expose `words`, `word`, `activeWord`, or `forbiddenWords` here.
  return {
    sessionId: session.sessionId,
    matchId: session.matchId,
    tileKey: session.tileKey,
    teamId: session.teamId,
    teamName: session.teamName,
    playerName: session.playerName,
    contentType: session.contentType,
    contentTypeLabel: session.contentTypeLabel,
    status: session.status,
    timerSeconds: session.timerSeconds,
    remainingSeconds: getRemainingSeconds(session),
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    totalWords: session.words.length,
    currentIndex: Math.min(session.currentIndex, session.words.length),
    correctCount: session.correctCount,
    skippedCount: session.skippedCount,
    maxSkips: session.maxSkips,
    remainingSkips: getSessionRemainingSkips(session),
    pointsPerCorrectWord: session.pointsPerCorrectWord,
    earnedPoints: session.correctCount * session.pointsPerCorrectWord,
    endReason: session.endReason,
  };
}

function toPlayerSessionState(
  session: InternalSessionRecord,
  playerToken: string
): WalaKalimaPlayerSessionState {
  const activeEntry =
    session.status === 'active' && session.currentIndex < session.words.length
      ? session.words[session.currentIndex]
      : null;

  return {
    sessionId: session.sessionId,
    playerToken,
    matchId: session.matchId,
    teamId: session.teamId,
    teamName: session.teamName,
    playerName: session.playerName,
    contentType: session.contentType,
    contentTypeLabel: session.contentTypeLabel,
    status: session.status,
    timerSeconds: session.timerSeconds,
    remainingSeconds: getRemainingSeconds(session),
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    totalWords: session.words.length,
    currentIndex: Math.min(session.currentIndex, session.words.length),
    correctCount: session.correctCount,
    skippedCount: session.skippedCount,
    maxSkips: session.maxSkips,
    remainingSkips: getSessionRemainingSkips(session),
    pointsPerCorrectWord: session.pointsPerCorrectWord,
    earnedPoints: session.correctCount * session.pointsPerCorrectWord,
    endReason: session.endReason,
    activeWord: activeEntry
      ? {
          word: activeEntry.word,
          contentType: activeEntry.contentType,
          contentTypeLabel: session.contentTypeLabel,
          difficulty: activeEntry.difficulty,
        }
      : null,
  };
}

function broadcastToHostStreams(session: InternalSessionRecord): void {
  const payload = `data: ${JSON.stringify(toPublicStatus(session))}\n\n`;
  for (const res of session.sseClients) {
    try {
      res.write(payload);
    } catch {
      session.sseClients.delete(res);
    }
  }
}

function finalizeSession(
  session: InternalSessionRecord,
  finalStatus: 'finished' | 'expired' | 'cancelled',
  endReason: InternalSessionRecord['endReason']
): void {
  if (
    session.status === 'finished' ||
    session.status === 'expired' ||
    session.status === 'cancelled'
  ) {
    return;
  }
  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle);
    session.timeoutHandle = null;
  }
  session.status = finalStatus;
  session.endReason = endReason;
  // Burn QR secret & player token permanently once round closes
  session.qrSecret = '';
  session.claimedPlayerToken = null;
  broadcastToHostStreams(session);
}

function enforceDeadlineIfExpired(session: InternalSessionRecord): void {
  if (session.status === 'active' && session.expiresAt && Date.now() >= session.expiresAt) {
    finalizeSession(session, 'finished', 'time_up');
    return;
  }
  // Unclaimed QR codes automatically expire after 20 minutes
  if (session.status === 'waiting_scan' && Date.now() - session.createdAt > 20 * 60 * 1000) {
    finalizeSession(session, 'expired', 'time_up');
  }
}

// Background cleanup every 30s
setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of activeSessions.entries()) {
    enforceDeadlineIfExpired(session);
    if (
      (session.status === 'finished' ||
        session.status === 'expired' ||
        session.status === 'cancelled') &&
      now - session.createdAt > 2 * 60 * 60 * 1000
    ) {
      for (const client of session.sseClients) {
        try {
          client.end();
        } catch {
          // ignore
        }
      }
      session.sseClients.clear();
      activeSessions.delete(sid);
    }
  }
  for (const [mId, record] of matchUsedWordIds.entries()) {
    if (now - record.updatedAt > 6 * 60 * 60 * 1000) {
      matchUsedWordIds.delete(mId);
    }
  }
}, 30_000).unref();

// =============================================================================
// Public Settings & Session API Helpers
// =============================================================================

export function getPublicWalaKalimaConfig(): WalaKalimaSettings {
  return { ...store.settings };
}

export function getAdminWalaKalimaWords(): WalaKalimaWordEntry[] {
  return [...store.words];
}

export function updateAdminWalaKalimaSettings(
  next: Partial<WalaKalimaSettings>
): WalaKalimaSettings {
  store.settings = sanitizeSettings({
    ...store.settings,
    ...next,
    updatedAt: new Date().toISOString(),
  });
  saveDatabase(store);
  return { ...store.settings };
}

export function createAdminWalaKalimaWord(input: {
  word: string;
  forbiddenWords?: string[];
  contentType: WalaKalimaContentTypeId;
  difficulty: DifficultyLevel;
  isActive?: boolean;
}): WalaKalimaWordEntry {
  const cleanWord = String(input.word || '').trim().slice(0, 120);
  if (!cleanWord) {
    throw new Error('يرجى إدخال الكلمة أو الشخصية المطلوبة.');
  }
  const cleanForbidden = Array.isArray(input.forbiddenWords)
    ? input.forbiddenWords
        .map((w) => String(w || '').trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const validCt = WALA_KALIMA_CONTENT_TYPES.find((c) => c.id === input.contentType);
  if (!validCt) {
    throw new Error('نوع المحتوى غير صالح.');
  }
  const validDiffs: DifficultyLevel[] = ['سهل', 'متوسط', 'صعب', 'صعب جداً', 'خبير'];
  const diff: DifficultyLevel = validDiffs.includes(input.difficulty) ? input.difficulty : 'متوسط';
  const nowIso = new Date().toISOString();

  const entry: WalaKalimaWordEntry = {
    id: `wk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    word: cleanWord,
    forbiddenWords: cleanForbidden,
    contentType: validCt.id,
    difficulty: diff,
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  store.words.unshift(entry);
  saveDatabase(store);
  return entry;
}

export function updateAdminWalaKalimaWord(
  wordId: string,
  input: Partial<{
    word: string;
    forbiddenWords?: string[];
    contentType: WalaKalimaContentTypeId;
    difficulty: DifficultyLevel;
    isActive: boolean;
  }>
): WalaKalimaWordEntry {
  const idx = store.words.findIndex((w) => w.id === wordId);
  if (idx < 0) {
    throw new Error('الكلمة غير موجودة.');
  }
  const existing = store.words[idx];
  const cleanWord =
    input.word !== undefined ? String(input.word).trim().slice(0, 120) : existing.word;
  if (!cleanWord) {
    throw new Error('نص الكلمة لا يمكن أن يكون فارغاً.');
  }
  const cleanForbidden =
    input.forbiddenWords !== undefined
      ? input.forbiddenWords
          .map((w) => String(w || '').trim().slice(0, 60))
          .filter(Boolean)
          .slice(0, 8)
      : existing.forbiddenWords || [];
  const validCt = input.contentType
    ? WALA_KALIMA_CONTENT_TYPES.find((c) => c.id === input.contentType)?.id
    : existing.contentType;
  if (!validCt) {
    throw new Error('نوع المحتوى غير صالح.');
  }
  const validDiffs: DifficultyLevel[] = ['سهل', 'متوسط', 'صعب', 'صعب جداً', 'خبير'];
  const diff =
    input.difficulty && validDiffs.includes(input.difficulty)
      ? input.difficulty
      : existing.difficulty;

  const updated: WalaKalimaWordEntry = {
    ...existing,
    word: cleanWord,
    forbiddenWords: cleanForbidden,
    contentType: validCt,
    difficulty: diff,
    isActive: input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive,
    updatedAt: new Date().toISOString(),
  };

  store.words[idx] = updated;
  saveDatabase(store);
  return updated;
}

export function deleteAdminWalaKalimaWord(wordId: string): boolean {
  const idx = store.words.findIndex((w) => w.id === wordId);
  if (idx < 0) return false;
  store.words.splice(idx, 1);
  saveDatabase(store);
  return true;
}

// =============================================================================
// Session Lifecycle
// =============================================================================

export function createWalaKalimaSession(params: {
  matchId: string;
  tileKey: string;
  teamId: string;
  teamName: string;
  playerName: string;
  contentType: WalaKalimaContentTypeId;
  preferredDifficulty?: DifficultyLevel;
}): WalaKalimaCreateSessionResponse {
  if (!store.settings.enabled) {
    throw new Error('تم إيقاف فئة «ولا كلمة» مؤقتاً من لوحة التحكم.');
  }

  const enabledSet = new Set(store.settings.enabledContentTypes);
  const ctMeta =
    WALA_KALIMA_CONTENT_TYPES.find((c) => c.id === params.contentType) ||
    WALA_KALIMA_CONTENT_TYPES[0];

  if (!enabledSet.has(ctMeta.id)) {
    throw new Error(`نوع المحتوى «${ctMeta.label}» غير مفعّل حالياً من المشرف.`);
  }

  const matchId = String(params.matchId || '').trim().slice(0, 128);
  const tileKey = String(params.tileKey || '').trim().slice(0, 128);
  const teamId = String(params.teamId || '').trim().slice(0, 128);
  const teamName = String(params.teamName || 'الفريق').trim().slice(0, 80);
  const playerName = String(params.playerName || 'اللاعب المشارك').trim().slice(0, 80);

  if (!matchId || !tileKey || !teamId) {
    throw new Error('بيانات المباراة أو الفريق أو الخانة غير مكتملة لإنشاء جولة ولا كلمة.');
  }

  // Cancel any stale waiting/active session for the exact same matchId + tileKey
  for (const existing of activeSessions.values()) {
    if (
      existing.matchId === matchId &&
      existing.tileKey === tileKey &&
      (existing.status === 'waiting_scan' || existing.status === 'active')
    ) {
      finalizeSession(existing, 'cancelled', 'host_ended');
    }
  }

  // Build pool of words strictly belonging to the enabled content type
  let typePool = store.words.filter(
    (w) => w.isActive && w.contentType === ctMeta.id
  );
  if (typePool.length === 0) {
    // Fallback across any enabled content types so game never deadlocks if admin deleted all words of one type
    typePool = store.words.filter(
      (w) => w.isActive && enabledSet.has(w.contentType)
    );
  }
  if (typePool.length === 0) {
    throw new Error('لا توجد كلمات نشطة متاحة في بنك «ولا كلمة» حالياً.');
  }

  const neededWordsCount = Math.max(1, store.settings.maxSkips + 1);
  const matchHistory = matchUsedWordIds.get(matchId)?.ids || new Set<string>();
  const freshPool = typePool.filter((w) => !matchHistory.has(w.id));
  const candidatePool = freshPool.length >= neededWordsCount ? freshPool : typePool;

  // Prioritize preferred difficulty first, then fill with shuffled remaining candidates
  let prioritized: WalaKalimaWordEntry[] = [];
  if (params.preferredDifficulty) {
    const diffMatches = shuffleArray(
      candidatePool.filter((w) => w.difficulty === params.preferredDifficulty)
    );
    const rest = shuffleArray(
      candidatePool.filter((w) => w.difficulty !== params.preferredDifficulty)
    );
    prioritized = [...diffMatches, ...rest];
  } else {
    prioritized = shuffleArray(candidatePool);
  }

  const chosenWords = prioritized.slice(0, neededWordsCount);

  // Record only the initial drawn word right away; skipped reserve words become used when shown
  const nextSet = new Set(matchHistory);
  if (chosenWords[0]) {
    nextSet.add(chosenWords[0].id);
  }
  matchUsedWordIds.set(matchId, { ids: nextSet, updatedAt: Date.now() });

  const sessionId = `wk_${crypto.randomBytes(6).toString('hex')}`;
  const hostSecret = crypto.randomBytes(24).toString('hex');
  const qrSecret = crypto.randomBytes(24).toString('hex');

  const session: InternalSessionRecord = {
    sessionId,
    hostSecret,
    qrSecret,
    claimedPlayerToken: null,
    lastPlayerTokenHash: null,
    matchId,
    tileKey,
    teamId,
    teamName,
    playerName,
    contentType: ctMeta.id,
    contentTypeLabel: ctMeta.label,
    status: 'waiting_scan',
    timerSeconds: store.settings.timerSeconds,
    maxSkips: Math.min(store.settings.maxSkips, Math.max(0, chosenWords.length - 1)),
    pointsPerCorrectWord: store.settings.pointsPerCorrectWord,
    startedAt: null,
    expiresAt: null,
    createdAt: Date.now(),
    words: chosenWords,
    currentIndex: 0,
    correctCount: 0,
    skippedCount: 0,
    endReason: null,
    timeoutHandle: null,
    sseClients: new Set<Response>(),
  };

  activeSessions.set(sessionId, session);

  return {
    ...toPublicStatus(session),
    hostSecret,
    qrPath: `/?wkSession=${encodeURIComponent(sessionId)}&wkToken=${encodeURIComponent(qrSecret)}`,
  };
}

export function getHostSessionStatus(
  sessionId: string,
  hostSecret: string
): WalaKalimaSessionPublicStatus {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw Object.assign(new Error('جلسة «ولا كلمة» غير موجودة أو انتهت صلاحيتها.'), { status: 404 });
  }
  if (!safeEqualStrings(session.hostSecret, hostSecret)) {
    throw Object.assign(new Error('غير مصرح بالوصول إلى حالة هذه الجولة.'), { status: 403 });
  }
  enforceDeadlineIfExpired(session);
  return toPublicStatus(session);
}

export function attachHostStream(
  sessionId: string,
  hostSecret: string,
  res: Response
): () => void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw Object.assign(new Error('الجولة غير موجودة.'), { status: 404 });
  }
  if (!safeEqualStrings(session.hostSecret, hostSecret)) {
    throw Object.assign(new Error('غير مصرح بمتابعة بث هذه الجولة.'), { status: 403 });
  }
  enforceDeadlineIfExpired(session);
  session.sseClients.add(res);
  res.write(`data: ${JSON.stringify(toPublicStatus(session))}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15_000);

  return () => {
    clearInterval(keepAlive);
    session.sseClients.delete(res);
  };
}

export function performHostSessionAction(
  sessionId: string,
  hostSecret: string,
  action: 'correct' | 'finish' | 'cancel'
): WalaKalimaSessionPublicStatus {
  const session = activeSessions.get(sessionId);
  if (!session) {
    throw Object.assign(new Error('الجولة غير موجودة.'), { status: 404 });
  }
  if (!safeEqualStrings(session.hostSecret, hostSecret)) {
    throw Object.assign(new Error('غير مصرح بتنفيذ هذا الإجراء.'), { status: 403 });
  }
  enforceDeadlineIfExpired(session);
  if (action === 'cancel') {
    finalizeSession(session, 'cancelled', 'host_ended');
  } else if (action === 'correct') {
    if (session.status === 'active') {
      session.correctCount = 1;
      finalizeSession(session, 'finished', 'correct_guess');
    } else if (session.status === 'waiting_scan') {
      throw Object.assign(
        new Error('لا يمكن اعتماد التخمين قبل مسح رمز QR وبدء الجولة.'),
        { status: 400 }
      );
    }
  } else {
    finalizeSession(session, 'finished', 'host_ended');
  }
  return toPublicStatus(session);
}

export function claimWalaKalimaQrSession(params: {
  sessionId: string;
  qrToken?: string;
  playerToken?: string;
}): WalaKalimaPlayerSessionState {
  const session = activeSessions.get(params.sessionId);
  if (!session) {
    throw Object.assign(
      new Error('رمز QR غير صالح أو أن الجولة انتهت ولم تعد متاحة.'),
      { status: 404 }
    );
  }

  enforceDeadlineIfExpired(session);

  if (
    session.status === 'finished' ||
    session.status === 'expired' ||
    session.status === 'cancelled'
  ) {
    throw Object.assign(
      new Error('انتهت هذه الجولة بالفعل ولا يمكن استخدام رمز QR مرة أخرى.'),
      { status: 410 }
    );
  }

  // Case 1: Same mobile browser refreshing/resuming its own already-claimed active session
  if (
    session.status === 'active' &&
    session.claimedPlayerToken &&
    params.playerToken &&
    safeEqualStrings(session.claimedPlayerToken, params.playerToken)
  ) {
    return toPlayerSessionState(session, session.claimedPlayerToken);
  }

  // Case 2: Already claimed by a player device — block any other scan
  if (session.claimedPlayerToken) {
    throw Object.assign(
      new Error('تم مسح رمز QR بالفعل من جهاز اللاعب المشارك ولا يمكن فتحه من جهاز آخر.'),
      { status: 409 }
    );
  }

  // Case 3: First valid QR scan -> verify qrToken and claim atomically
  if (!params.qrToken || !safeEqualStrings(session.qrSecret, params.qrToken)) {
    throw Object.assign(
      new Error('رمز التحقق الخاص بـ QR غير صحيح أو منتهي الصلاحية.'),
      { status: 403 }
    );
  }

  const issuedPlayerToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  session.claimedPlayerToken = issuedPlayerToken;
  session.lastPlayerTokenHash = crypto
    .createHash('sha256')
    .update(issuedPlayerToken)
    .digest('hex');
  session.qrSecret = ''; // Burn QR secret immediately on first claim
  session.status = 'active';
  session.startedAt = now;
  session.expiresAt = now + session.timerSeconds * 1000;

  session.timeoutHandle = setTimeout(() => {
    enforceDeadlineIfExpired(session);
  }, session.timerSeconds * 1000 + 50);

  broadcastToHostStreams(session);
  return toPlayerSessionState(session, issuedPlayerToken);
}

export function performPlayerSessionAction(params: {
  sessionId: string;
  playerToken: string;
  action: 'correct' | 'skip' | 'finish' | 'sync';
}): WalaKalimaPlayerSessionState {
  const session = activeSessions.get(params.sessionId);
  if (!session) {
    throw Object.assign(new Error('الجولة غير موجودة أو انتهت.'), { status: 404 });
  }

  enforceDeadlineIfExpired(session);

  if (
    session.status === 'finished' ||
    session.status === 'expired' ||
    session.status === 'cancelled'
  ) {
    if (params.action === 'sync' && params.playerToken && session.lastPlayerTokenHash) {
      const candidateHash = crypto
        .createHash('sha256')
        .update(params.playerToken)
        .digest('hex');
      if (safeEqualStrings(session.lastPlayerTokenHash, candidateHash)) {
        return {
          ...toPlayerSessionState(session, ''),
          status: session.status,
          remainingSeconds: 0,
          activeWord: null,
        };
      }
    }
    throw Object.assign(
      new Error('انتهى وقت الجولة أو تم إنهاؤها بالفعل.'),
      { status: 410 }
    );
  }

  if (
    !session.claimedPlayerToken ||
    !params.playerToken ||
    !safeEqualStrings(session.claimedPlayerToken, params.playerToken)
  ) {
    throw Object.assign(new Error('جلسة اللاعب غير مصرح بها لهذه الجولة.'), { status: 403 });
  }

  if (params.action === 'sync') {
    return toPlayerSessionState(session, session.claimedPlayerToken);
  }

  if (params.action === 'finish') {
    const summarySnapshot = toPlayerSessionState(session, '');
    finalizeSession(session, 'finished', 'player_finished');
    return {
      ...summarySnapshot,
      status: 'finished',
      remainingSeconds: 0,
      endReason: 'player_finished',
      activeWord: null,
    };
  }

  if (params.action === 'correct') {
    // Charades rule: Correct guess immediately ends the round and awards round points!
    session.correctCount = 1;
    const summarySnapshot = toPlayerSessionState(session, '');
    finalizeSession(session, 'finished', 'correct_guess');
    return {
      ...summarySnapshot,
      status: 'finished',
      remainingSeconds: 0,
      correctCount: 1,
      skippedCount: session.skippedCount,
      remainingSkips: getSessionRemainingSkips(session),
      earnedPoints: session.pointsPerCorrectWord,
      endReason: 'correct_guess',
      activeWord: null,
    };
  }

  if (params.action === 'skip') {
    if (getSessionRemainingSkips(session) <= 0 || session.currentIndex + 1 >= session.words.length) {
      throw Object.assign(
        new Error('استُنفدت محاولات التخطي المسموح بها في هذه الجولة.'),
        { status: 400 }
      );
    }
    session.skippedCount += 1;
    session.currentIndex += 1;
    const revealedSkipWord = session.words[session.currentIndex];
    if (revealedSkipWord) {
      const prevSet = matchUsedWordIds.get(session.matchId)?.ids || new Set<string>();
      const nextSet = new Set(prevSet);
      nextSet.add(revealedSkipWord.id);
      matchUsedWordIds.set(session.matchId, { ids: nextSet, updatedAt: Date.now() });
    }
  }

  broadcastToHostStreams(session);
  return toPlayerSessionState(session, session.claimedPlayerToken);
}
