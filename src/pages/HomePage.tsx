import React from 'react';
import { ArrowLeft, Users, Layers, Zap, Trophy, CheckCircle2 } from 'lucide-react';
import { PageView } from '../types/game';

interface HomePageProps {
  onStartCategorySelection: () => void;
  onNavigate?: (page: PageView) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onStartCategorySelection,
}) => {
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
    <div className="space-y-20 md:space-y-24 pb-12">
      {/* SECTION 1: WELCOME HERO */}
      <section className="pt-8 md:pt-12">
        <div className="max-w-[1320px] mx-auto px-6">
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-8 md:p-12 lg:p-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Right Column (RTL): Headline, Description & Primary CTA */}
            <div className="lg:col-span-7 space-y-6 text-right">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#14543D] tracking-wide">
                <span className="w-2 h-2 rounded-full bg-[#F07842]" />
                <span>لعبة التحدي الجماعي للجمعات والأصحاب</span>
              </div>

              <h1 className="font-display text-[clamp(2.25rem,4.4vw,3.75rem)] font-bold text-[#252824] leading-[1.18]">
                جاهزين تختبرون معلوماتكم؟
              </h1>

              <p className="text-base md:text-xl text-[#777B73] leading-relaxed max-w-[54ch]">
                اجمعوا أصحابكم، اختاروا فئاتكم، وتحدّوا بعض في لعبة مليانة حماس وأسئلة متنوعة!
              </p>

              <div className="pt-3 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onStartCategorySelection}
                  className="px-9 py-4 text-base md:text-lg font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-2xl transition-all flex items-center gap-3 cursor-pointer shadow-sm"
                >
                  <span>يلا نلعب</span>
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <a
                  href="#how-to-play"
                  className="px-6 py-4 text-sm md:text-base font-bold text-[#14543D] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-2xl transition-colors"
                >
                  كيف تلعب؟
                </a>
              </div>
            </div>

            {/* Left Column (RTL): Secondary Visual Element — Trivia, Competition, Teams & Knowledge */}
            <div className="lg:col-span-5">
              <div className="bg-[#F3F5E9] border-2 border-[#E5E8DD] rounded-2xl p-6 space-y-5">
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

                {/* Mini Category Columns Visual */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  {[
                    { name: 'كأس العالم', pts: [100, 200, 300], activeIdx: 2 },
                    { name: 'ون بيس', pts: [100, 200, 300], activeIdx: -1 },
                    { name: 'معلومات عامة', pts: [100, 200, 300], activeIdx: -1 },
                  ].map((col) => (
                    <div key={col.name} className="space-y-2">
                      <div className="bg-[#14543D] text-white text-xs font-bold py-2 px-2 rounded-lg truncate">
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
                    </div>
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

      {/* SECTION 2: HOW TO PLAY SECTION */}
      <section
        id="how-to-play"
        className="max-w-[1320px] mx-auto px-6 scroll-mt-24"
      >
        <div className="space-y-10">
          <div className="text-center max-w-2xl mx-auto space-y-2.5">
            <div className="text-xs font-bold text-[#F07842]">
              خطوات سريعة وواضحة
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#252824]">
              كيف تلعب؟
            </h2>
            <p className="text-sm md:text-base text-[#777B73]">
              أربع خطوات بسيطة تفصلكم عن بداية التحدي:
            </p>
          </div>

          {/* 4 Visually Connected Steps */}
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
        </div>
      </section>

      {/* SECTION 3: CALL TO ACTION SECTION */}
      <section className="max-w-[1320px] mx-auto px-6">
        <div className="bg-[#14543D] rounded-3xl p-8 md:p-12 lg:p-14 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="space-y-3 max-w-2xl">
            <div className="text-xs font-bold text-[#F07842] tracking-wide">
              الميدان جاهز للتحدي
            </div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#FFFFFF] leading-tight">
              التحدي بدأ.. مين قدّها؟
            </h2>
            <p className="text-base md:text-lg text-[#F3F5E9]/85 leading-relaxed">
              لا تضيعون الوقت، اجمعوا فريقكم وورّونا مين أكثر واحد يعرف!
            </p>
          </div>

          <button
            type="button"
            onClick={onStartCategorySelection}
            className="px-9 py-4 text-base md:text-lg font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-2xl transition-all flex items-center gap-3 shrink-0 cursor-pointer shadow-sm"
          >
            <span>العب الآن</span>
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
      </section>
    </div>
  );
};
