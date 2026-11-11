import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts';
import {
  Trophy,
  Target,
  Flame,
  Layers,
  TrendingUp,
  PieChart as PieIcon,
  BarChart3,
  Sparkles,
  Award,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { UserGameMatch } from '../types/match';

interface UserMatchesStatsProps {
  matches: UserGameMatch[];
}

const PALETTE = [
  '#14543D',
  '#F07842',
  '#2C5E8A',
  '#8C2D38',
  '#D97706',
  '#059669',
  '#4F46E5',
];

const STATUS_COLORS = {
  completed: '#14543D',
  in_progress: '#F07842',
  abandoned: '#9CA3AF',
};

// Custom Arabic Tooltip for Bar & Area charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] shadow-lg rounded-xl px-3 py-2 text-right text-xs space-y-1">
        <p className="font-bold text-[#252824]">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} className="font-bold" style={{ color: entry.color || entry.fill }}>
            {entry.name || 'القيمة'}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Custom Tooltip for Pie chart
const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] shadow-lg rounded-xl px-3 py-2 text-right text-xs space-y-0.5">
        <p className="font-bold text-[#252824]">{data.name}</p>
        <p className="font-bold" style={{ color: data.payload.fill }}>
          {data.value} مباراة ({data.payload.percent ? `${Math.round(data.payload.percent * 100)}%` : ''})
        </p>
      </div>
    );
  }
  return null;
};

export const UserMatchesStats: React.FC<UserMatchesStatsProps> = ({ matches }) => {
  // 1. Core Summary Metrics
  const summary = useMemo(() => {
    const total = matches.length;
    if (total === 0) {
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        completionRate: 0,
        totalQuestionsPlayed: 0,
        highestScore: 0,
        avgScore: 0,
      };
    }

    const completed = matches.filter((m) => m.status === 'completed').length;
    const inProgress = matches.filter((m) => m.status === 'in_progress').length;
    const completionRate = Math.round((completed / total) * 100);

    const totalQuestions = matches.reduce(
      (sum, m) => sum + (m.usedTileKeys?.length || 0),
      0
    );

    let highest = 0;
    let totalScoreSum = 0;
    let scoresCount = 0;

    matches.forEach((m) => {
      (m.teams || []).forEach((t) => {
        const score = Number(t.score) || 0;
        if (score > highest) highest = score;
        totalScoreSum += score;
        scoresCount++;
      });
    });

    const avgScore = scoresCount > 0 ? Math.round(totalScoreSum / scoresCount) : 0;

    return {
      total,
      completed,
      inProgress,
      completionRate,
      totalQuestionsPlayed: totalQuestions,
      highestScore: highest,
      avgScore,
    };
  }, [matches]);

  // 2. Most Played Categories (Frequency analysis across all selectedSubcategories)
  const topCategoriesData = useMemo(() => {
    const countMap: Record<string, number> = {};

    matches.forEach((m) => {
      const cats = m.selectedSubcategories || [];
      cats.forEach((cat) => {
        const clean = String(cat || '').trim();
        if (clean) {
          countMap[clean] = (countMap[clean] || 0) + 1;
        }
      });
    });

    return Object.entries(countMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [matches]);

  // 3. Status Distribution (Pie chart)
  const statusDistributionData = useMemo(() => {
    const completed = matches.filter((m) => m.status === 'completed').length;
    const inProgress = matches.filter((m) => m.status === 'in_progress').length;
    const other = matches.length - completed - inProgress;

    const data = [];
    if (completed > 0) {
      data.push({ name: 'مكتملة', value: completed, fill: STATUS_COLORS.completed });
    }
    if (inProgress > 0) {
      data.push({ name: 'غير مكتملة', value: inProgress, fill: STATUS_COLORS.in_progress });
    }
    if (other > 0) {
      data.push({ name: 'متوقفة', value: other, fill: STATUS_COLORS.abandoned });
    }
    return data;
  }, [matches]);

  // 4. Performance / Score Progression (Chronological order of recent completed or in-progress matches)
  const scoreTrendData = useMemo(() => {
    const validMatches = matches
      .filter((m) => (m.teams || []).some((t) => (t.score || 0) > 0))
      .slice(0, 8)
      .reverse();

    return validMatches.map((m, index) => {
      const topScore = Math.max(
        0,
        ...(m.teams || []).map((t) => Number(t.score) || 0)
      );

      let label = `مباراة ${index + 1}`;
      if (m.teams && m.teams.length >= 2) {
        label = `${m.teams[0].name.slice(0, 6)}..`;
      }

      return {
        matchLabel: label,
        score: topScore,
        questions: m.usedTileKeys?.length || 0,
      };
    });
  }, [matches]);

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-5 sm:p-7 space-y-7 shadow-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-[#F07842]" />
          </div>
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#252824]">
              لوحة الإحصائيات والأداء
            </h2>
            <p className="text-xs text-[#777B73]">
              تحليل دقيق لنشاطك، الفئات المفضلة، ونسب الإنجاز عبر مبارياتك في نِزال
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F3F5E9] text-xs font-bold text-[#14543D] self-start sm:self-center">
          <Sparkles className="w-3.5 h-3.5 text-[#F07842]" />
          <span>تحديث إحصائي فوري</span>
        </div>
      </div>

      {/* KPI Highlight Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Matches */}
        <div className="p-4 rounded-2xl bg-[#F3F5E9]/60 border border-[#E5E8DD] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#777B73] font-medium">
            <span>إجمالي المباريات</span>
            <Target className="w-4 h-4 text-[#14543D]" />
          </div>
          <div className="font-display text-2xl font-bold text-[#14543D]">
            {summary.total}
          </div>
          <div className="text-[11px] text-[#777B73] flex items-center gap-1.5 pt-0.5">
            <span className="text-emerald-700 font-bold">{summary.completed} مكتملة</span>
            <span>•</span>
            <span className="text-amber-700 font-bold">{summary.inProgress} جارية</span>
          </div>
        </div>

        {/* Completion Rate */}
        <div className="p-4 rounded-2xl bg-[#F3F5E9]/60 border border-[#E5E8DD] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#777B73] font-medium">
            <span>نسبة الإتمام والحسم</span>
            <CheckCircle2 className="w-4 h-4 text-[#F07842]" />
          </div>
          <div className="font-display text-2xl font-bold text-[#F07842]">
            {summary.completionRate}%
          </div>
          <div className="w-full bg-[#E5E8DD] h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-[#F07842] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, summary.completionRate)}%` }}
            />
          </div>
        </div>

        {/* Total Questions Played */}
        <div className="p-4 rounded-2xl bg-[#F3F5E9]/60 border border-[#E5E8DD] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#777B73] font-medium">
            <span>الأسئلة المجابة</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-display text-2xl font-bold text-[#252824]">
            {summary.totalQuestionsPlayed}
          </div>
          <div className="text-[11px] text-[#777B73] pt-0.5">
            سؤال تم التنافس عليه
          </div>
        </div>

        {/* Highest Score */}
        <div className="p-4 rounded-2xl bg-[#F3F5E9]/60 border border-[#E5E8DD] space-y-1">
          <div className="flex items-center justify-between text-xs text-[#777B73] font-medium">
            <span>أعلى نقاط مسجلة</span>
            <Trophy className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-display text-2xl font-bold text-emerald-700">
            {summary.highestScore}
          </div>
          <div className="text-[11px] text-[#777B73] pt-0.5">
            معدل الفريق: {summary.avgScore} نقطة
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        {/* Chart 1: Most Played Categories (BarChart) */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#14543D]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                أكثر الفئات لعباً واختياراً
              </h3>
            </div>
            <span className="text-[11px] font-bold text-[#777B73]">
              أعلى {topCategoriesData.length} تصنيفات
            </span>
          </div>

          {topCategoriesData.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#777B73]">
              لا توجد بيانات فئات كافية بعد. اختر فئاتك وابدأ التحدي!
            </div>
          ) : (
            <div className="h-64 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topCategoriesData}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E8DD" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    tick={{ fontSize: 11, fill: '#252824', fontWeight: 600 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    name="عدد مرات اللعب"
                    radius={[0, 8, 8, 0]}
                    barSize={18}
                  >
                    {topCategoriesData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PALETTE[index % PALETTE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Status Breakdown (Donut PieChart) */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-[#F07842]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                توزيع حالات المباريات
              </h3>
            </div>
            <span className="text-[11px] font-bold text-[#777B73]">
              {summary.total} مباراة
            </span>
          </div>

          <div className="h-48 w-full min-w-0 flex items-center justify-center" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<CustomPieTooltip />} />
                <Pie
                  data={statusDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={74}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusDistributionData.map((entry, index) => (
                    <Cell key={`slice-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom Legend */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5E8DD] text-xs">
            {statusDistributionData.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: item.fill }}
                />
                <span className="text-[#777B73]">{item.name}:</span>
                <span className="font-bold text-[#252824]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3: Score Progression Trend across recent games */}
        {scoreTrendData.length >= 2 && (
          <div className="lg:col-span-12 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#14543D]" />
                <h3 className="font-display text-sm font-bold text-[#252824]">
                  مسار أعلى نتيجة تم تحقيقها (المباريات الأخيرة)
                </h3>
              </div>
              <span className="text-[11px] font-bold text-[#777B73]">
                تطور الأداء
              </span>
            </div>

            <div className="h-52 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={scoreTrendData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F07842" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F07842" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8DD" />
                  <XAxis
                    dataKey="matchLabel"
                    tick={{ fontSize: 11, fill: '#777B73' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#777B73' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    name="أعلى نقاط"
                    stroke="#F07842"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#scoreColor)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
