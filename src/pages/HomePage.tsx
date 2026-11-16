import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Users,
  Layers,
  Zap,
  Trophy,
  CheckCircle2,
  Radio,
  WifiOff,
  RefreshCw,
  Clock,
  Lock,
  X,
} from 'lucide-react';
import { motion, MotionConfig, useReducedMotion } from 'motion/react';
import { MainCategoryMeta, PageView, SubcategoryItem } from '../types/game';
import { OfflineDataStatus } from '../services/offlineStore';
import { CategoryCardArtwork } from '../components/CategoryCardArtwork';
import {
  DEFAULT_SUBCATEGORIES,
  MAIN_CATEGORIES,
} from '../data/categoriesAndSeed';

interface HomePageProps {
  onStartCategorySelection: () => void;
  onStartOfflineLocalGame?: () => void;
  onSelectMainCategory?: (mainCategoryId: string) => void;
  onNavigate?: (page: PageView) => void;
  mainCategories?: MainCategoryMeta[];
  subcategories?: SubcategoryItem[];
  offlineStatus?: OfflineDataStatus;
  isOnline?: boolean;
  onSyncOfflineData?: () => void;
}

const categoryCardVariants = {
  rest: { y: 0, scale: 1 },
  hover: {
    y: -6,
    scale: 1.025,
    transition: { type: 'spring' as const, stiffness: 460, damping: 28, mass: 0.7 },
  },
  tap: {
    y: -1,
    scale: 0.96,
    transition: { type: 'spring' as const, stiffness: 560, damping: 32, mass: 0.6 },
  },
};

const categoryArtworkVariants = {
  rest: { scale: 1 },
  hover: {
    scale: 1.06,
    transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const },
  },
  tap: {
    scale: 1.02,
    transition: { duration: 0.12, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const categoryArrowVariants = {
  rest: { x: 0 },
  hover: {
    x: -4,
    transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
  },
  tap: {
    x: -2,
    transition: { duration: 0.1 },
  },
};

const comingSoonCardVariants = {
  rest: { y: 0, scale: 1 },
  hover: {
    y: -2,
    scale: 1.01,
    transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const },
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1 },
  },
};

export const HomePage: React.FC<HomePageProps> = ({
  onStartCategorySelection,
  onStartOfflineLocalGame,
  onSelectMainCategory,
  onNavigate,
  mainCategories = MAIN_CATEGORIES,
  subcategories = DEFAULT_SUBCATEGORIES,
  offlineStatus,
  isOnline = true,
  onSyncOfflineData,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [comingSoonNotice, setComingSoonNotice] = useState<string | null>(null);

  const visibleMainCategories = useMemo(
    () =>
      mainCategories
        .filter((m) => m.isActive && !m.isDeleted)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [mainCategories]
  );

  const subcategoryCountByMain = useMemo(() => {
    const counts = new Map<string, number>();
    const activeSubs = subcategories.filter((s) => s.isActive && !s.isDeleted);
    visibleMainCategories.forEach((main) => {
      const count = activeSubs.filter(
        (s) => s.mainCategoryId === main.id || s.mainCategory === main.name
      ).length;
      counts.set(main.id, count);
    });
    return counts;
  }, [subcategories, visibleMainCategories]);

  const handleCategoryCardClick = (mainCat: MainCategoryMeta) => {
    if (mainCat.isComingSoon) {
      setComingSoonNotice(`فئة «${mainCat.name}» قادمة قريباً، ترقبوها في التحديث القادم!`);
      return;
    }
    setComingSoonNotice(null);
    if (onSelectMainCategory) {
      onSelectMainCategory(mainCat.id);
    } else {
      onStartCategorySelection();
    }
  };

  const heroCategoryColumns = useMemo(
    () => [
      {
        name: 'كأس العالم',
        mainId: 'main-football',
        pts: [100, 200, 300],
        activeIdx: 2,
      },
      {
        name: 'ون بيس',
        mainId: 'main-anime',
        pts: [100, 200, 300],
        activeIdx: -1,
      },
      {
        name: 'معلومات عامة',
        mainId: 'main-general',
        pts: [100, 200, 300],
        activeIdx: -1,
      },
    ],
    []
  );

  const steps = [
    {
      num: '01',
      title: 'كوّنوا فرقكم',
      description: 'اختاروا عدد الفرق، واكتبوا أسماء الفرق واللاعبين.',
      icon: Users,
      accent: '#14543D',
      bgTint: '#EAF2EE',
    },
    {
      num: '02',
      title: 'اختاروا الفئات',
      description: 'اختاروا الفئات الرئيسية والفرعية اللي تناسبكم.',
      icon: Layers,
      accent: '#F07842',
      bgTint: '#FEF2EC',
    },
    {
      num: '03',
      title: 'ابدأوا التحدي',
      description: 'اختاروا الأسئلة وجاوبوا واجمعوا النقاط.',
      icon: Zap,
      accent: '#14543D',
      bgTint: '#EAF2EE',
    },
    {
      num: '04',
      title: 'احسموا المنافسة',
      description: 'الفريق اللي يجمع أعلى نقاط يفوز!',
      icon: Trophy,
      accent: '#F07842',
      bgTint: '#FEF2EC',
    },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-12 md:space-y-24 pb-8 md:pb-12">
        {/* SECTION 1: WELCOME HERO */}
        <section className="pt-4 sm:pt-8 md:pt-12">
          <div className="max-w-[1320px] mx-auto px-3 sm:px-6">
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 lg:p-16 grid grid-cols-1 lg:grid-cols-12 gap-7 sm:gap-10 lg:gap-12 items-center">
              {/* Right Column (RTL): Headline, Description & Primary CTA */}
              <div className="lg:col-span-7 space-y-4 sm:space-y-6 text-right">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-[#14543D] tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-[#F07842]" />
                  <span>لعبة التحدي الجماعي للجمعات والأصحاب</span>
                </div>

                <h1 className="font-display text-[clamp(1.75rem,4.4vw,3.75rem)] font-bold text-[#252824] leading-[1.22]">
                  جاهزين تختبرون معلوماتكم؟
                </h1>

                <p className="text-sm sm:text-base md:text-xl text-[#777B73] leading-relaxed max-w-[54ch]">
                  اجمعوا أصحابكم، اختاروا فئاتكم، وتحدّوا بعض في لعبة مليانة حماس وأسئلة متنوعة!
                </p>

                <div className="pt-2 sm:pt-3 grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-4">
                  <button
                    type="button"
                    onClick={onStartOfflineLocalGame || onStartCategorySelection}
                    className="w-full sm:w-auto min-h-[48px] px-6 sm:px-7 py-3.5 sm:py-4 text-sm sm:text-base md:text-lg font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-2xl transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                  >
                    <WifiOff className="w-5 h-5 shrink-0" />
                    <span>اللعب المحلي دون إنترنت</span>
                    <ArrowLeft className="w-5 h-5 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate?.('online_multiplayer')}
                    className="w-full sm:w-auto min-h-[48px] px-6 sm:px-7 py-3.5 sm:py-4 text-sm sm:text-base md:text-lg font-bold text-[#14543D] bg-[#EAF2EE] hover:bg-[#D5E6DC] border-2 border-[#14543D]/30 active:scale-[0.99] rounded-2xl transition-all flex items-center justify-center gap-2.5 cursor-pointer shadow-sm"
                  >
                    <Radio className="w-5 h-5 text-[#F07842] animate-pulse shrink-0" />
                    <span>العب عن بُعد</span>
                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#14543D] text-[#FFFFFF]">
                      أونلاين
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate?.('how_to_play')}
                    className="w-full sm:w-auto min-h-[46px] px-6 py-3 sm:py-4 text-sm md:text-base font-bold text-[#14543D] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-2xl transition-colors cursor-pointer flex items-center justify-center"
                  >
                    كيف تلعب؟
                  </button>
                </div>

                {offlineStatus && (
                  <div className="pt-1 flex flex-wrap items-center gap-3 text-xs text-[#777B73]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#14543D]">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          offlineStatus.syncing
                            ? 'bg-[#F07842] animate-pulse'
                            : offlineStatus.ready
                            ? 'bg-[#14543D]'
                            : 'bg-amber-500'
                        }`}
                      />
                      {offlineStatus.syncing
                        ? 'جاري تحديث النسخة المحلية للعب دون إنترنت...'
                        : offlineStatus.ready
                        ? `البيانات المحلية جاهزة دون إنترنت (${offlineStatus.questionsCount} سؤال · ${offlineStatus.categoriesCount} فئات)`
                        : 'بيانات اللعب دون إنترنت تحتاج مزامنة أولى عند توفر الاتصال'}
                    </span>

                    {isOnline && onSyncOfflineData && !offlineStatus.syncing && (
                      <button
                        type="button"
                        onClick={onSyncOfflineData}
                        className="inline-flex items-center gap-1 text-[#14543D] hover:text-[#F07842] font-bold underline underline-offset-4 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>تحديث النسخة المحلية</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Left Column (RTL): Interactive Trivia & Category Preview */}
              <div className="lg:col-span-5">
                <div className="bg-[#F3F5E9] border-2 border-[#E5E8DD] rounded-2xl p-4 sm:p-6 space-y-4 sm:space-y-5">
                  {/* Team Competition Header */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-[#14543D]">
                          الدور الآن
                        </div>
                        <div className="font-display text-sm font-bold text-[#252824]">
                          فريق طويق
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-xl font-bold text-[#14543D]">
                        900
                      </div>
                    </div>

                    <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-[#777B73]">المنافس</div>
                        <div className="font-display text-sm font-bold text-[#252824]">
                          فريق الصقور
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-xl font-bold text-[#F07842]">
                        800
                      </div>
                    </div>
                  </div>

                  {/* Interactive Mini Category Columns Visual */}
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    {heroCategoryColumns.map((col) => (
                      <motion.button
                        key={col.name}
                        type="button"
                        onClick={() =>
                          onSelectMainCategory
                            ? onSelectMainCategory(col.mainId)
                            : onStartCategorySelection()
                        }
                        whileHover={
                          shouldReduceMotion ? undefined : { y: -3, scale: 1.02 }
                        }
                        whileTap={
                          shouldReduceMotion ? undefined : { scale: 0.96 }
                        }
                        transition={{
                          type: 'spring',
                          stiffness: 460,
                          damping: 28,
                        }}
                        className="space-y-2 text-center rounded-xl p-1 -m-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842]"
                      >
                        <div className="bg-[#14543D] text-white text-[11px] sm:text-xs font-bold py-2 px-1.5 rounded-lg min-h-[40px] flex items-center justify-center leading-snug shadow-xs">
                          {col.name}
                        </div>
                        {col.pts.map((pt, idx) => {
                          const isHighlighted = col.activeIdx === idx;
                          return (
                            <div
                              key={pt}
                              className={`py-2 rounded-lg font-mono tabular-nums text-xs font-bold border transition-colors ${
                                isHighlighted
                                  ? 'bg-[#F07842] text-white border-[#F07842]'
                                  : 'bg-[#FFFFFF] text-[#252824] border-[#E5E8DD]'
                              }`}
                            >
                              {pt}
                            </div>
                          );
                        })}
                      </motion.button>
                    ))}
                  </div>

                  {/* Active Trivia Challenge Preview Card */}
                  <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#F07842]">
                        سؤال التحدي · 300 نقطة
                      </span>
                      <span className="font-mono tabular-nums font-bold text-[#14543D]">
                        00:45
                      </span>
                    </div>
                    <p className="font-display text-sm font-bold text-[#252824] leading-snug">
                      أي منتخب حقق الفوز التاريخي على الأرجنتين في مونديال 2022؟
                    </p>
                    <div className="pt-1 flex items-center justify-between text-xs text-[#14543D] font-bold">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-[#14543D]" />
                        <span>صح عليكم! +300 نقطة</span>
                      </span>
                      <span className="text-[#777B73] font-normal">
                        المنتخب السعودي
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: INTERACTIVE CATEGORY CARDS */}
        {visibleMainCategories.length > 0 && (
          <section
            id="home-categories"
            aria-labelledby="home-categories-heading"
            className="max-w-[1320px] mx-auto px-3 sm:px-6 scroll-mt-24"
          >
            <div className="space-y-6 sm:space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-2 text-right">
                  <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F07842]">
                    <span className="w-2 h-2 rounded-full bg-[#14543D]" />
                    <span>تصفح ميادين المعرفة</span>
                  </div>
                  <h2
                    id="home-categories-heading"
                    className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#252824]"
                  >
                    فئات التحدي في نِزال
                  </h2>
                  <p className="text-sm md:text-base text-[#777B73] max-w-[56ch]">
                    اختر الفئة التي تفضلونها للانتقال مباشرة إلى اختيار الفئات الفرعية وبدء الجولة.
                  </p>
                </div>

                <motion.button
                  type="button"
                  onClick={onStartCategorySelection}
                  whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-3 text-sm font-bold text-[#14543D] bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] hover:border-[#14543D]/50 rounded-2xl transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <span>عرض كل الفئات</span>
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                </motion.button>
              </div>

              {comingSoonNotice && (
                <div
                  role="status"
                  className="p-3.5 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/50 text-xs sm:text-sm font-bold text-[#D9602B] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#F07842] shrink-0" />
                    <span>{comingSoonNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setComingSoonNotice(null)}
                    aria-label="إغلاق التنبيه"
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[#D9602B] hover:bg-[#F07842]/10 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5">
                {visibleMainCategories.map((mainCat) => {
                  const isComingSoon = Boolean(mainCat.isComingSoon);
                  const subsCount = subcategoryCountByMain.get(mainCat.id) ?? 0;

                  if (isComingSoon) {
                    return (
                      <motion.button
                        key={mainCat.id}
                        type="button"
                        aria-disabled="true"
                        onClick={() => handleCategoryCardClick(mainCat)}
                        variants={shouldReduceMotion ? undefined : comingSoonCardVariants}
                        initial="rest"
                        whileHover={shouldReduceMotion ? undefined : 'hover'}
                        whileTap={shouldReduceMotion ? undefined : 'tap'}
                        aria-label={`${mainCat.name} - قريباً، هذه الفئة غير متاحة حالياً`}
                        className="group relative w-full rounded-2xl overflow-hidden bg-[#F3F5E9] border-2 border-dashed border-[#D4D9CC] hover:border-[#F07842]/70 flex flex-col select-none cursor-not-allowed shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842]"
                      >
                        <div className="relative h-28 sm:h-36 w-full overflow-hidden shrink-0">
                          <CategoryCardArtwork
                            name={mainCat.name}
                            mainCategory={mainCat.name}
                            imageUrl={mainCat.imageUrl}
                            isMainCategory
                            className="grayscale-[45%] brightness-80"
                          />
                          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                            <span className="px-2.5 py-1 rounded-lg bg-[#F07842] text-white text-[11px] font-bold flex items-center gap-1 shadow-sm">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>قريباً</span>
                            </span>
                            <span className="w-7 h-7 rounded-lg bg-[#252824]/80 border border-white/20 text-[#F3F5E9] flex items-center justify-center">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>

                        <div className="flex-1 w-full p-3.5 sm:p-5 flex flex-col items-center justify-between text-center gap-2 bg-[#F3F5E9]">
                          <div className="space-y-1.5 w-full">
                            <h3 className="font-display text-base sm:text-xl md:text-2xl font-bold text-[#252824] leading-snug">
                              {mainCat.name}
                            </h3>
                            <p className="text-xs font-semibold text-[#D9602B] leading-relaxed">
                              قادمة قريباً في التحديث القادم
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  }

                  return (
                    <motion.button
                      key={mainCat.id}
                      type="button"
                      onClick={() => handleCategoryCardClick(mainCat)}
                      variants={shouldReduceMotion ? undefined : categoryCardVariants}
                      initial="rest"
                      whileHover={shouldReduceMotion ? undefined : 'hover'}
                      whileTap={shouldReduceMotion ? undefined : 'tap'}
                      aria-label={`استعراض فئة ${mainCat.name}`}
                      className="group relative w-full rounded-2xl overflow-hidden bg-[#FFFFFF] border-2 border-[#E5E8DD] hover:border-[#F07842] flex flex-col select-none cursor-pointer shadow-xs hover:shadow-xl transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F3F5E9]"
                    >
                      {/* Top Artwork Zone (Never obscures category title) */}
                      <div className="relative h-28 sm:h-36 md:h-40 w-full overflow-hidden shrink-0 bg-[#14543D]">
                        <motion.div
                          variants={shouldReduceMotion ? undefined : categoryArtworkVariants}
                          className="w-full h-full will-change-transform"
                        >
                          <CategoryCardArtwork
                            name={mainCat.name}
                            mainCategory={mainCat.name}
                            imageUrl={mainCat.imageUrl}
                            isMainCategory
                          />
                        </motion.div>
                      </div>

                      {/* Bottom Solid High-Contrast Title & Action Zone */}
                      <div className="flex-1 w-full p-3.5 sm:p-5 flex flex-col justify-between text-center sm:text-right gap-2.5 bg-[#FFFFFF]">
                        <div className="space-y-1.5">
                          <h3 className="font-display text-base sm:text-xl md:text-2xl font-bold text-[#14543D] group-hover:text-[#F07842] leading-snug transition-colors">
                            {mainCat.name}
                          </h3>
                          <p className="text-xs sm:text-sm text-[#52574E] line-clamp-2 leading-relaxed">
                            {mainCat.tagline}
                          </p>
                        </div>

                        <div className="pt-2.5 flex items-center justify-between text-xs font-bold border-t border-[#E5E8DD]">
                          <span className="tabular-nums text-[#52574E]">
                            {subsCount > 0 ? `${subsCount} فئات فرعية` : 'تحدي مفتوح'}
                          </span>
                          <motion.span
                            variants={shouldReduceMotion ? undefined : categoryArrowVariants}
                            className="inline-flex items-center gap-1 text-[#F07842]"
                          >
                            <span>ابدأ</span>
                            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                          </motion.span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: HOW TO PLAY SECTION */}
        <section
          id="how-to-play"
          className="max-w-[1320px] mx-auto px-3 sm:px-6 scroll-mt-24"
        >
          <div className="space-y-8 md:space-y-10">
            <div className="text-center max-w-2xl mx-auto space-y-2.5">
              <div className="text-xs font-bold text-[#F07842]">
                خطوات سريعة وواضحة
              </div>
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#252824]">
                كيف تلعب؟
              </h2>
              <p className="text-sm md:text-base text-[#777B73]">
                أربع خطوات بسيطة تفصلكم عن بداية التحدي:
              </p>
            </div>

            {/* 4 Visually Connected Steps */}
            <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {steps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <div
                    key={step.num}
                    className="relative bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#14543D] rounded-2xl p-6 md:p-7 flex flex-col justify-between space-y-5 transition-colors"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div
                          className="w-12 h-12 rounded-2xl flex items-center justify-center border border-[#E5E8DD]"
                          style={{
                            backgroundColor: step.bgTint,
                            color: step.accent,
                          }}
                        >
                          <IconComponent className="w-6 h-6" />
                        </div>
                        <span className="font-mono tabular-nums text-lg font-bold text-[#777B73]/60">
                          {step.num}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <h3 className="font-display text-xl font-bold text-[#252824]">
                          {step.title}
                        </h3>
                        <p className="text-sm text-[#777B73] leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    {/* Step progress connector bar */}
                    <div className="pt-3 border-t border-[#E5E8DD] flex items-center justify-between text-xs font-semibold text-[#777B73]">
                      <span>الخطوة {index + 1} من 4</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: step.accent }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => onNavigate?.('how_to_play')}
                className="w-full sm:w-auto min-h-[46px] px-7 py-3 text-sm font-bold text-[#14543D] bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] hover:border-[#14543D]/50 rounded-2xl transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>اقرأ القواعد الكاملة لطريقة اللعب</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 4: CALL TO ACTION SECTION */}
        <section className="max-w-[1320px] mx-auto px-3 sm:px-6">
          <div className="bg-[#14543D] rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-12 lg:p-14 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 sm:gap-8">
            <div className="space-y-2.5 sm:space-y-3 max-w-2xl">
              <div className="text-xs font-bold text-[#F07842] tracking-wide">
                الميدان جاهز للتحدي
              </div>
              <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#FFFFFF] leading-tight">
                التحدي بدأ.. مين قدّها؟
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-[#F3F5E9]/85 leading-relaxed">
                لا تضيعون الوقت، اجمعوا فريقكم وورّونا مين أكثر واحد يعرف!
              </p>
            </div>

            <button
              type="button"
              onClick={onStartCategorySelection}
              className="w-full sm:w-auto min-h-[48px] px-8 sm:px-9 py-3.5 sm:py-4 text-base md:text-lg font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-2xl transition-all flex items-center justify-center gap-3 shrink-0 cursor-pointer shadow-sm"
            >
              <span>العب الآن</span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
};
