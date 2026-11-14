import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Layers,
  Radio,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';

interface HowToPlayPageProps {
  onBackToHome: () => void;
  onStartLocalGame: () => void;
  onStartOnlineGame: () => void;
}

const CORE_RULES = [
  {
    num: '01',
    title: 'كوّنوا الفرق (2 إلى 4 فرق)',
    description:
      'ابدأوا بتحديد عدد الفرق، وأدخلوا اسم كل فريق وأعضاءه واختروا لوناً مميزاً، سواء على نفس الجهاز أو عبر غرفة أونلاين.',
    icon: Users,
    accent: '#14543D',
    bgTint: '#EAF2EE',
  },
  {
    num: '02',
    title: 'اختاروا الفئات بذكاء',
    description:
      'يختار كل فريق 3 فئات فرعية مستقلة من التصنيفات المتاحة دون تكرار بين الفرق، لتتشكّل لوحة التحدي من اختيارات الجميع.',
    icon: Layers,
    accent: '#F07842',
    bgTint: '#FEF2EC',
  },
  {
    num: '03',
    title: 'جاوبوا قبل انتهاء المؤقت',
    description:
      'في كل دور يختار الفريق خانة نقاط من 100 إلى 500 حسب مستوى الصعوبة، ثم يتشاور اللاعبون لحسم الإجابة ضمن الوقت المحدد (30 إلى 90 ثانية).',
    icon: Clock,
    accent: '#14543D',
    bgTint: '#EAF2EE',
  },
  {
    num: '04',
    title: 'اجمعوا النقاط واحسموا اللقب',
    description:
      'الإجابة الصحيحة تُسجّل نقاط الخانة فوراً لصالح الفريق مع مؤثره الصوتي الخاص، ومع انتهاء اللوحة يُتوّج الفريق صاحب الرصيد الأعلى.',
    icon: Trophy,
    accent: '#F07842',
    bgTint: '#FEF2EC',
  },
];

const POINT_TIERS = [
  { pts: 100, level: 'سهل', bg: 'bg-[#FFFFFF]', text: 'text-[#14543D]' },
  { pts: 200, level: 'متوسط', bg: 'bg-[#FFFFFF]', text: 'text-[#14543D]' },
  { pts: 300, level: 'صعب', bg: 'bg-[#FEF2EC]', text: 'text-[#F07842]' },
  { pts: 400, level: 'صعب جداً', bg: 'bg-[#FEF2EC]', text: 'text-[#D9632E]' },
  { pts: 500, level: 'خبير', bg: 'bg-[#14543D]', text: 'text-[#FFFFFF]' },
];

export const HowToPlayPage: React.FC<HowToPlayPageProps> = ({
  onBackToHome,
  onStartLocalGame,
  onStartOnlineGame,
}) => {
  return (
    <div className="max-w-[1320px] mx-auto px-6 py-8 md:py-12 space-y-12 md:space-y-16">
      {/* Top Bar + Hero Header */}
      <section className="space-y-6">
        <button
          type="button"
          onClick={onBackToHome}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#14543D] hover:text-[#F07842] transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة إلى الرئيسية</span>
        </button>

        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-7 md:p-11 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-4 text-right">
            <div className="text-xs font-bold text-[#F07842] tracking-wide">
              دليل اللاعبين · قواعد اللعبة في نِزال
            </div>
            <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-[#252824] leading-tight">
              كيف تلعب وتفوز في نِزال؟
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-[#777B73] leading-relaxed max-w-[60ch]">
              كل ما تحتاج معرفته للانطلاق في المنافسة: من تكوين الفرق واختيار الفئات، حتى نظام
              النقاط والمؤقت وحسم الفوز لصالح فريقك.
            </p>
          </div>

          <div className="lg:col-span-4 bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-5 space-y-3">
            <div className="text-xs font-bold text-[#14543D]">ملخص سريع قبل البدء</div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3">
                <div className="font-mono tabular-nums text-2xl font-bold text-[#14543D]">
                  2–4
                </div>
                <div className="text-xs text-[#777B73] mt-0.5">فرق متنافسة</div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3">
                <div className="font-mono tabular-nums text-2xl font-bold text-[#F07842]">
                  3
                </div>
                <div className="text-xs text-[#777B73] mt-0.5">فئات لكل فريق</div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3">
                <div className="font-mono tabular-nums text-xl font-bold text-[#252824]">
                  100–500
                </div>
                <div className="text-xs text-[#777B73] mt-0.5">نقاط الأسئلة</div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3">
                <div className="font-mono tabular-nums text-xl font-bold text-[#14543D]">
                  30–90ث
                </div>
                <div className="text-xs text-[#777B73] mt-0.5">مؤقت الإجابة</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Core Game Rules */}
      <section className="space-y-7">
        <div className="space-y-1.5">
          <div className="text-xs font-bold text-[#F07842]">أولاً · نظام المباراة</div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
            قواعد اللعبة الأساسية
          </h2>
          <p className="text-sm md:text-base text-[#777B73]">
            تسير كل جولة في نِزال وفق خطوات واضحة تضمن العدالة والحماس بين جميع الفرق:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {CORE_RULES.map((rule) => {
            const Icon = rule.icon;
            return (
              <article
                key={rule.num}
                className="bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#14543D]/60 rounded-2xl p-6 flex flex-col justify-between space-y-5 transition-colors"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center border border-[#E5E8DD]"
                      style={{
                        backgroundColor: rule.bgTint,
                        color: rule.accent,
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="font-mono tabular-nums text-lg font-bold text-[#777B73]/60">
                      {rule.num}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="font-display text-lg font-bold text-[#252824]">
                      {rule.title}
                    </h3>
                    <p className="text-sm text-[#777B73] leading-relaxed">
                      {rule.description}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Points Scale Strip */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold text-[#252824]">
                سُلّم النقاط ومستويات الصعوبة
              </h3>
              <p className="text-xs sm:text-sm text-[#777B73]">
                كل فئة تحتوي على 5 مستويات متدرجة — كلما ارتفعت النقاط زاد التحدي والربح.
              </p>
            </div>
            <span className="text-xs font-bold text-[#14543D]">
              5 مستويات في كل عمود فئة
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {POINT_TIERS.map((tier) => (
              <div
                key={tier.pts}
                className={`${tier.bg} border border-[#E5E8DD] rounded-xl p-3.5 text-center space-y-1`}
              >
                <div
                  className={`font-mono tabular-nums text-2xl font-bold ${tier.text}`}
                >
                  {tier.pts}
                </div>
                <div
                  className={`text-xs font-bold ${
                    tier.pts === 500 ? 'text-[#F3F5E9]/90' : 'text-[#777B73]'
                  }`}
                >
                  {tier.level}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Local vs Online Modes + Start Playing CTAs */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-7 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F07842]">
              <Zap className="w-4 h-4" />
              <span>للمجالس والجمعات</span>
            </div>
            <h3 className="font-display text-2xl font-bold text-[#252824]">
              المباراة المحلية (على نفس الجهاز)
            </h3>
            <p className="text-sm text-[#777B73] leading-relaxed">
              مناسبة إذا كنتم مجتمعين في نفس المكان. كوّنوا من فريقين إلى أربعة فرق، اختاروا
              فئاتكم، وأديروا الأدوار والنتائج من شاشة واحدة بكل سلاسة.
            </p>
          </div>

          <button
            type="button"
            onClick={onStartLocalGame}
            className="w-full sm:w-auto self-start px-7 py-3.5 rounded-2xl bg-[#F07842] hover:bg-[#D9632E] text-[#FFFFFF] font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>ابدأ مباراة محلية</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-7 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#14543D]">
              <Radio className="w-4 h-4 text-[#F07842]" />
              <span>للتحدي عن بُعد</span>
            </div>
            <h3 className="font-display text-2xl font-bold text-[#252824]">
              اللعب عن بُعد (أونلاين)
            </h3>
            <p className="text-sm text-[#777B73] leading-relaxed">
              أنشئ غرفة خاصة برمز فريد أو ادعُ أصدقاءك مباشرة للعب أو المشاهدة. تتزامن الفئات،
              المؤقت، الإجابات، والنقاط لحظياً بين الجميع.
            </p>
          </div>

          <button
            type="button"
            onClick={onStartOnlineGame}
            className="w-full sm:w-auto self-start px-7 py-3.5 rounded-2xl bg-[#14543D] hover:bg-[#0F4230] text-[#FFFFFF] font-bold text-sm sm:text-base transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>العب عن بُعد الآن</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
};
