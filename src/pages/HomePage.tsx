import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Users,
  Layers,
  Zap,
  Trophy,
  Radio,
  RefreshCw,
  Clock,
  Lock,
  X,
  Play,
  BookOpen,
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

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const categoryCardVariants = {
  rest: { y: 0 },
  hover: {
    y: -5,
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  tap: {
    y: -1,
    scale: 0.985,
    transition: { duration: 0.12, ease: EASE_OUT },
  },
};

const categoryArrowVariants = {
  rest: { x: 0 },
  hover: {
    x: -4,
    transition: { duration: 0.16, ease: EASE_OUT },
  },
  tap: {
    x: -2,
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
  const [selectedBoardTile, setSelectedBoardTile] = useState<{
    colIndex: number;
    points: number;
  }>({ colIndex: 0, points: 300 });

  const visibleMainCategories = useMemo(
    () =>
      mainCategories
        .filter((m) => m.isActive && !m.isDeleted)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [mainCategories]
  );

  const activeSubcategoriesCount = useMemo(
    () => subcategories.filter((s) => s.isActive && !s.isDeleted).length,
    [subcategories]
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

  const heroBoardCategories = useMemo(() => {
    const playable = visibleMainCategories.filter((m) => !m.isComingSoon);
    const source = playable.length > 0 ? playable : visibleMainCategories;
    return source.slice(0, 3);
  }, [visibleMainCategories]);

  const handlePrimaryPlay = () => {
    if (onStartOfflineLocalGame) {
      onStartOfflineLocalGame();
    } else {
      onStartCategorySelection();
    }
  };

  const handleCategoryCardClick = (mainCat: MainCategoryMeta) => {
    if (mainCat.isComingSoon) {
      setComingSoonNotice(
        `فئة «${mainCat.name}» قادمة قريباً، ترقبوها في التحديث القادم!`
      );
      return;
    }
    setComingSoonNotice(null);
    if (onSelectMainCategory) {
      onSelectMainCategory(mainCat.id);
    } else {
      onStartCategorySelection();
    }
  };

  const safeSelectedCol =
    heroBoardCategories[selectedBoardTile.colIndex] || heroBoardCategories[0];

  const steps = [
    {
      num: '01',
      title: 'كوّن فريقك',
      description: 'حدّدوا عدد الفرق المتنافسة، وسمّوا كل فريق قبل دخول ساحة النِزال.',
      icon: Users,
      accent: '#F07842',
      surface: '#FEF2EC',
    },
    {
      num: '02',
      title: 'اختر الفئات التي تناسبكم',
      description: 'ينتقي كل فريق فئاته المفضلة من الأقسام الرئيسية والفرعية المتاحة.',
      icon: Layers,
      accent: '#14543D',
      surface: '#EAF2EE',
    },
    {
      num: '03',
      title: 'ابدأ التحدي وأجب عن الأسئلة',
      description: 'افتحوا مربعات النقاط من 100 إلى 500 نقطة وأجيبوا قبل انتهاء الوقت.',
      icon: Zap,
      accent: '#F07842',
      surface: '#FEF2EC',
    },
    {
      num: '04',
      title: 'اجمع النقاط ونافس للفوز',
      description: 'ارفعوا رصيدكم مع كل إجابة صحيحة واحسموا المواجهة بأعلى مجموع.',
      icon: Trophy,
      accent: '#14543D',
      surface: '#EAF2EE',
    },
  ];

  const tierPoints = [100, 300, 500];

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-10 sm:space-y-16 md:space-y-24 pb-8 md:pb-16">
        {/* SECTION 1: HERO SECTION */}
        <section
          aria-labelledby="hero-heading"
          className="pt-3 sm:pt-7 md:pt-10"
        >
          <div className="max-w-[1320px] mx-auto px-3 sm:px-6">
            <div className="relative overflow-hidden bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl sm:rounded-3xl p-4 sm:p-8 md:p-11 lg:p-14">
              {/* Subtle architectural grid & radial arena line art */}
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.35]"
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern
                    id="nizal-hero-grid"
                    width="36"
                    height="36"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 36 0 L 0 0 0 36"
                      fill="none"
                      stroke="#E5E8DD"
                      strokeWidth="0.75"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#nizal-hero-grid)" />
              </svg>

              <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-10 lg:gap-12 items-center">
                {/* Right Column (RTL): Brand Lockup, Headline, Value Prop & CTAs */}
                <div className="lg:col-span-7 space-y-4 sm:space-y-6 text-right">
                  {/* Clear NIZAL Logo + Bilingual Wordmark */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-9 sm:w-20 sm:h-[52px] rounded-xl bg-[#124833] border border-[#14543D]/25 overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                      <img
                        src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                        alt="شعار منصة نِزال NIZAL"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain p-1 sm:p-1.5 select-none"
                      />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-lg sm:text-2xl font-bold text-[#1B1F1C]">
                          نِزال
                        </span>
                        <span
                          dir="ltr"
                          className="font-mono text-[11px] sm:text-sm font-bold tracking-[0.2em] text-[#F07842]"
                        >
                          NIZAL
                        </span>
                      </div>
                      <p className="text-[11px] sm:text-xs font-semibold text-[#666B62] truncate">
                        منصة المسابقات والتحديات الجماعية
                      </p>
                    </div>
                  </div>

                  {/* Hero Headline */}
                  <div className="space-y-2.5 sm:space-y-4">
                    <h1
                      id="hero-heading"
                      className="font-display text-[1.95rem] sm:text-[clamp(2.25rem,4.6vw,3.75rem)] font-bold text-[#1B1F1C] leading-[1.15] tracking-tight"
                    >
                      التحدي يبدأ{' '}
                      <span className="text-[#F07842]">هنا</span>
                    </h1>

                    <p className="text-sm sm:text-base md:text-lg text-[#52574E] leading-relaxed max-w-[54ch]">
                      نِزال منصة مسابقات وتحديات جماعية تجمع الأصدقاء والعائلة في
                      منافسة مباشرة عبر فئات معرفية متنوعة، سواءً على جهاز واحد أو
                      عن بُعد.
                    </p>
                  </div>

                  {/* Primary & Secondary CTAs */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3 pt-0.5 sm:pt-1">
                    <motion.button
                      type="button"
                      onClick={handlePrimaryPlay}
                      whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                      whileTap={
                        shouldReduceMotion ? undefined : { scale: 0.98 }
                      }
                      transition={{ duration: 0.15, ease: EASE_OUT }}
                      data-testid="hero-play-cta"
                      className="min-h-[50px] sm:min-h-[52px] px-6 sm:px-7 py-3 text-sm sm:text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-2xl transition-colors flex items-center justify-center gap-2.5 cursor-pointer shadow-xs whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] focus-visible:ring-offset-2"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>العب الآن</span>
                      <ArrowLeft className="w-4 h-4 shrink-0" />
                    </motion.button>

                    <button
                      type="button"
                      onClick={() => onNavigate?.('how_to_play')}
                      className="min-h-[46px] sm:min-h-[52px] px-5 sm:px-6 py-2.5 sm:py-3.5 text-sm sm:text-base font-bold text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#D7DCCB] rounded-2xl transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14543D]"
                    >
                      <BookOpen className="w-4 h-4 text-[#14543D] shrink-0" />
                      <span>كيف تلعب؟</span>
                    </button>
                  </div>

                  {/* Secondary Play Mode & Real Data Metadata Strip (No Pill Clutter) */}
                  <div className="pt-2 border-t border-[#E5E8DD] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <button
                        type="button"
                        onClick={() => onNavigate?.('online_multiplayer')}
                        className="inline-flex items-center gap-2 font-bold text-[#14543D] hover:text-[#F07842] transition-colors cursor-pointer min-h-[44px] sm:min-h-[36px]"
                      >
                        <Radio className="w-4 h-4 text-[#F07842] shrink-0" />
                        <span>اللعب عن بُعد (أونلاين)</span>
                        <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                      </button>

                      {offlineStatus && (
                        <>
                          <span
                            aria-hidden="true"
                            className="hidden sm:inline text-[#D0D5C8]"
                          >
                            |
                          </span>
                          <span className="text-[#52574E] font-medium">
                            {offlineStatus.syncing
                              ? 'جاري تحديث النسخة المحلية...'
                              : offlineStatus.ready
                              ? `جاهز دون إنترنت · ${offlineStatus.questionsCount} سؤال`
                              : 'وضع الأونلاين متاح'}
                          </span>
                          {isOnline &&
                            onSyncOfflineData &&
                            !offlineStatus.syncing && (
                                <button
                                  type="button"
                                  onClick={onSyncOfflineData}
                                  className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-1 text-[#14543D] hover:text-[#F07842] font-bold underline underline-offset-4 cursor-pointer"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  <span>تحديث المحلي</span>
                                </button>
                            )}
                        </>
                      )}
                    </div>

                    <div className="text-[#666B62] font-semibold tabular-nums whitespace-nowrap">
                      {visibleMainCategories.length} فئات رئيسية
                      <span aria-hidden="true" className="mx-1.5">
                        ·
                      </span>
                      {activeSubcategoriesCount} فئة فرعية
                    </div>
                  </div>
                </div>

                {/* Left Column (RTL): Creative Interactive NIZAL Arena Stage */}
                <div className="lg:col-span-5">
                  <div className="relative rounded-2xl bg-[#1B1F1C] text-[#FFFFFF] p-4 sm:p-5 border border-[#2C312D] overflow-hidden">
                    {/* Subtle geometric arena accent */}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 320 220"
                      className="pointer-events-none absolute -top-12 -left-12 w-64 h-48 opacity-20"
                    >
                      <circle
                        cx="120"
                        cy="100"
                        r="88"
                        fill="none"
                        stroke="#F07842"
                        strokeWidth="1"
                        strokeDasharray="4 6"
                      />
                      <circle
                        cx="120"
                        cy="100"
                        r="56"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="0.75"
                      />
                    </svg>

                    <div className="relative space-y-4">
                      {/* Arena Versus Header */}
                      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-xs bg-[#F07842] shrink-0" />
                          <span className="font-display text-xs sm:text-sm font-bold text-white truncate">
                            الفريق الأول
                          </span>
                        </div>

                        <div
                          dir="ltr"
                          className="font-mono text-[11px] font-bold tracking-widest px-2.5 py-1 rounded-md bg-[#F07842] text-white shrink-0"
                        >
                          VS
                        </div>

                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-display text-xs sm:text-sm font-bold text-[#E5E8DD] truncate">
                            الفريق الثاني
                          </span>
                          <span className="w-2.5 h-2.5 rounded-xs bg-[#14543D] border border-white/30 shrink-0" />
                        </div>
                      </div>

                      {/* Real Categories Interactive Board Matrix */}
                      {heroBoardCategories.length > 0 && (
                        <>
                          {/* Mobile: Readable Horizontal Strips (Category Name + 3 Point Tiles) */}
                          <div className="space-y-2 sm:hidden">
                            {heroBoardCategories.map((cat, colIndex) => (
                              <div
                                key={`mob_prev_${cat.id}`}
                                className="flex items-stretch gap-2"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCategoryCardClick(cat)}
                                  className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-[#14543D] hover:bg-[#19694C] border border-white/10 text-xs font-bold text-white text-right flex items-center transition-colors cursor-pointer min-w-0"
                                >
                                  <span className="truncate">{cat.name}</span>
                                </button>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {tierPoints.map((pts) => {
                                    const isActiveTile =
                                      selectedBoardTile.colIndex === colIndex &&
                                      selectedBoardTile.points === pts;
                                    return (
                                      <button
                                        key={`mob_prev_${cat.id}_${pts}`}
                                        type="button"
                                        onClick={() =>
                                          setSelectedBoardTile({
                                            colIndex,
                                            points: pts,
                                          })
                                        }
                                        className={`min-w-[44px] min-h-[44px] px-2 rounded-xl font-mono tabular-nums text-xs font-bold transition-colors cursor-pointer border ${
                                          isActiveTile
                                            ? 'bg-[#F07842] border-[#F07842] text-white'
                                            : 'bg-[#272B27] hover:bg-[#313631] border-white/10 text-[#F3F5E9]'
                                        }`}
                                      >
                                        {pts}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Tablet & Desktop: Classic 3-Column Interactive Matrix */}
                          <div className="hidden sm:grid sm:grid-cols-3 gap-2.5">
                            {heroBoardCategories.map((cat, colIndex) => (
                              <div key={cat.id} className="space-y-2 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleCategoryCardClick(cat)}
                                  className="w-full min-h-[44px] px-1.5 py-2 rounded-xl bg-[#14543D] hover:bg-[#19694C] border border-white/10 text-xs font-bold text-white leading-tight flex items-center justify-center text-center transition-colors cursor-pointer"
                                >
                                  <span className="line-clamp-2">{cat.name}</span>
                                </button>

                                {tierPoints.map((pts) => {
                                  const isActiveTile =
                                    selectedBoardTile.colIndex === colIndex &&
                                    selectedBoardTile.points === pts;
                                  return (
                                    <button
                                      key={pts}
                                      type="button"
                                      onClick={() =>
                                        setSelectedBoardTile({
                                          colIndex,
                                          points: pts,
                                        })
                                      }
                                      className={`w-full min-h-[44px] rounded-xl font-mono tabular-nums text-sm font-bold transition-all cursor-pointer border ${
                                        isActiveTile
                                          ? 'bg-[#F07842] border-[#F07842] text-white -translate-y-0.5'
                                          : 'bg-[#272B27] hover:bg-[#313631] border-white/10 text-[#F3F5E9]'
                                      }`}
                                    >
                                      {pts}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Active Board Selection Prompt Footer */}
                      {safeSelectedCol && (
                        <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-[11px] font-bold text-[#F07842] tabular-nums">
                              جولة {safeSelectedCol.name} ·{' '}
                              {selectedBoardTile.points} نقطة
                            </div>
                            <p className="text-xs text-[#D5D9CE] truncate">
                              {safeSelectedCol.tagline ||
                                'اختر مستوى النقاط لبدء التحدي'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              handleCategoryCardClick(safeSelectedCol)
                            }
                            className="min-h-[44px] sm:min-h-[38px] px-3.5 py-2 rounded-xl bg-white text-[#1B1F1C] hover:bg-[#F07842] hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                          >
                            <span>ابدأ</span>
                            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: HOW TO PLAY */}
        <section
          id="how-to-play"
          aria-labelledby="how-to-play-heading"
          className="max-w-[1320px] mx-auto px-3 sm:px-6 scroll-mt-24"
        >
          <div className="space-y-8 sm:space-y-10">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-2 text-right">
                <p className="text-xs font-bold text-[#F07842]">
                  آلية اللعب في نِزال
                </p>
                <h2
                  id="how-to-play-heading"
                  className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#1B1F1C]"
                >
                  كيف تلعب؟
                </h2>
                <p className="text-sm md:text-base text-[#52574E] max-w-[54ch]">
                  أربع خطوات واضحة تنقل فريقك من التحضير إلى حسم المنافسة.
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNavigate?.('how_to_play')}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#14543D] bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] hover:border-[#14543D]/40 rounded-xl transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <span>الدليل الكامل للقواعد</span>
                <ArrowLeft className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* 4 Connected Step Cards */}
            <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {steps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <motion.div
                    key={step.num}
                    initial={
                      shouldReduceMotion ? false : { opacity: 0, y: 10 }
                    }
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.08 }}
                    transition={{
                      duration: 0.22,
                      delay: shouldReduceMotion ? 0 : index * 0.03,
                      ease: EASE_OUT,
                    }}
                    className="bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842]/60 rounded-2xl p-4 sm:p-6 flex flex-col justify-between space-y-4 sm:space-y-5 transition-colors"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center border border-[#E5E8DD]"
                          style={{
                            backgroundColor: step.surface,
                            color: step.accent,
                          }}
                        >
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <span className="font-mono tabular-nums text-xl font-bold text-[#C7CDC0]">
                          {step.num}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]">
                          {step.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#52574E] leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E5E8DD] flex items-center justify-between text-xs font-semibold text-[#666B62]">
                      <span className="tabular-nums">
                        الخطوة {index + 1} من 4
                      </span>
                      <span
                        className="h-1 w-8 rounded-full"
                        style={{ backgroundColor: step.accent }}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 3: MAIN CATEGORIES FROM DATABASE */}
        {visibleMainCategories.length > 0 && (
          <section
            id="home-categories"
            aria-labelledby="home-categories-heading"
            className="max-w-[1320px] mx-auto px-3 sm:px-6 scroll-mt-24"
          >
            <div className="space-y-6 sm:space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-2 text-right">
                  <p className="text-xs font-bold text-[#F07842]">
                    ميادين المعرفة المعتمدة
                  </p>
                  <h2
                    id="home-categories-heading"
                    className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#1B1F1C]"
                  >
                    فئات التحدي في نِزال
                  </h2>
                  <p className="text-sm md:text-base text-[#52574E] max-w-[56ch]">
                    اختر الفئة التي تفضلونها للانتقال مباشرة إلى اختيار الفئات
                    الفرعية وتكوين الفرق.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={onStartCategorySelection}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-3 text-sm font-bold text-[#14543D] bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] hover:border-[#14543D]/50 rounded-xl transition-colors inline-flex items-center justify-center gap-2 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <span>عرض كل الفئات</span>
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                </button>
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
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#D9602B] hover:bg-[#F07842]/10 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {visibleMainCategories.map((mainCat, index) => {
                  const isComingSoon = Boolean(mainCat.isComingSoon);
                  const subsCount = subcategoryCountByMain.get(mainCat.id) ?? 0;

                  if (isComingSoon) {
                    return (
                      <motion.button
                        key={mainCat.id}
                        type="button"
                        aria-disabled="true"
                        onClick={() => handleCategoryCardClick(mainCat)}
                        initial={
                          shouldReduceMotion ? false : { opacity: 0, y: 10 }
                        }
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.05 }}
                        transition={{
                          duration: 0.2,
                          delay: shouldReduceMotion
                            ? 0
                            : Math.min(index, 5) * 0.02,
                          ease: EASE_OUT,
                        }}
                        aria-label={`${mainCat.name} - قريباً، هذه الفئة غير متاحة حالياً`}
                        className="group relative w-full min-w-0 rounded-2xl overflow-hidden bg-[#F7F8F1] border border-dashed border-[#D4D9CC] hover:border-[#F07842]/60 flex flex-col select-none cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842]"
                      >
                        <div className="relative h-28 sm:h-36 md:h-40 w-full overflow-hidden shrink-0">
                          <CategoryCardArtwork
                            name={mainCat.name}
                            mainCategory={mainCat.name}
                            imageUrl={mainCat.imageUrl}
                            isMainCategory
                            className="grayscale-[45%] brightness-80"
                          />
                          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                            <span className="px-2.5 py-1 rounded-lg bg-[#F07842] text-white text-[11px] font-bold flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>قريباً</span>
                            </span>
                            <span className="w-7 h-7 rounded-lg bg-[#1B1F1C]/80 border border-white/20 text-[#F3F5E9] flex items-center justify-center">
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>

                        <div className="flex-1 w-full p-3.5 sm:p-5 flex flex-col justify-between text-right gap-2 bg-[#F7F8F1]">
                          <div className="space-y-1">
                            <h3 className="font-display text-base sm:text-xl font-bold text-[#1B1F1C] leading-snug">
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
                      variants={
                        shouldReduceMotion ? undefined : categoryCardVariants
                      }
                      initial={
                        shouldReduceMotion ? 'rest' : { opacity: 0, y: 10 }
                      }
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.05 }}
                      whileHover={shouldReduceMotion ? undefined : 'hover'}
                      whileTap={shouldReduceMotion ? undefined : 'tap'}
                      transition={{
                        duration: 0.2,
                        delay: shouldReduceMotion
                          ? 0
                          : Math.min(index, 5) * 0.02,
                        ease: EASE_OUT,
                      }}
                      aria-label={`استعراض فئة ${mainCat.name}`}
                      className="group relative w-full min-w-0 rounded-2xl overflow-hidden bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842] flex flex-col select-none cursor-pointer shadow-xs hover:shadow-md transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F3F5E9]"
                    >
                      {/* Clean Artwork Frame using official category images */}
                      <div className="relative h-28 sm:h-36 md:h-40 w-full overflow-hidden shrink-0 bg-[#14543D]">
                        <CategoryCardArtwork
                          name={mainCat.name}
                          mainCategory={mainCat.name}
                          imageUrl={mainCat.imageUrl}
                          isMainCategory
                        />
                      </div>

                      {/* Clean High-Contrast Info Zone */}
                      <div className="flex-1 w-full p-3.5 sm:p-5 flex flex-col justify-between text-right gap-2.5 bg-[#FFFFFF]">
                        <div className="space-y-1.5">
                          <h3 className="font-display text-base sm:text-xl font-bold text-[#1B1F1C] group-hover:text-[#F07842] leading-snug transition-colors">
                            {mainCat.name}
                          </h3>
                          <p className="text-xs sm:text-sm text-[#52574E] line-clamp-2 leading-relaxed">
                            {mainCat.tagline}
                          </p>
                        </div>

                        <div className="pt-2.5 flex items-center justify-between text-xs font-bold border-t border-[#E5E8DD]">
                          <span className="tabular-nums text-[#666B62]">
                            {subsCount > 0
                              ? `${subsCount} فئات فرعية`
                              : 'تحدي مفتوح'}
                          </span>
                          <motion.span
                            variants={
                              shouldReduceMotion
                                ? undefined
                                : categoryArrowVariants
                            }
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

        {/* SECTION 4: FINAL CALL TO ACTION */}
        <section
          aria-labelledby="cta-heading"
          className="max-w-[1320px] mx-auto px-3 sm:px-6"
        >
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="relative overflow-hidden bg-[#14543D] rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-12 lg:p-14 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 sm:gap-8"
          >
            {/* Subtle geometric arena curves */}
            <svg
              aria-hidden="true"
              viewBox="0 0 400 220"
              className="pointer-events-none absolute left-0 top-0 h-full w-auto opacity-15"
            >
              <circle
                cx="80"
                cy="110"
                r="130"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1"
              />
              <circle
                cx="80"
                cy="110"
                r="82"
                fill="none"
                stroke="#F07842"
                strokeWidth="1.2"
                strokeDasharray="5 5"
              />
            </svg>

            <div className="relative space-y-2.5 sm:space-y-3 max-w-2xl text-right">
              <p className="text-xs font-bold text-[#F07842] tracking-wide">
                ساحة النِزال بانتظاركم
              </p>
              <h2
                id="cta-heading"
                className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#FFFFFF] leading-tight"
              >
                اجمعوا الفريق وأطلقوا الجولة الأولى
              </h2>
              <p className="text-sm sm:text-base md:text-lg text-[#F3F5E9]/85 leading-relaxed">
                اختاروا الفئات، حدّدوا التحدي، واكتشفوا من يحسم الصدارة في نِزال.
              </p>
            </div>

            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0">
              <motion.button
                type="button"
                onClick={handlePrimaryPlay}
                whileHover={shouldReduceMotion ? undefined : { y: -2 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
                className="min-h-[52px] px-8 py-3.5 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-2xl transition-colors flex items-center justify-center gap-2.5 shrink-0 cursor-pointer shadow-xs whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>ابدأ التحدي الآن</span>
                <ArrowLeft className="w-5 h-5 shrink-0" />
              </motion.button>

              <button
                type="button"
                onClick={() => onNavigate?.('online_multiplayer')}
                className="min-h-[52px] px-5 py-3.5 text-sm font-bold text-[#FFFFFF] bg-white/10 hover:bg-white/15 border border-white/20 rounded-2xl transition-colors flex items-center justify-center gap-2 shrink-0 cursor-pointer whitespace-nowrap"
              >
                <Radio className="w-4 h-4 text-[#F07842] shrink-0" />
                <span>غرفة أونلاين</span>
              </button>
            </div>
          </motion.div>
        </section>
      </div>
    </MotionConfig>
  );
};
