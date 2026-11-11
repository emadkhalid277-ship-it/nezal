import React, { useState, useEffect, useMemo } from 'react';
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
  Users,
  Trophy,
  Flame,
  Layers,
  TrendingUp,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Sparkles,
  Award,
  Activity,
  BarChart3,
  PieChart as PieIcon,
  HelpCircle,
  Mail,
  UserCheck,
} from 'lucide-react';
import {
  AdminAnalyticsData,
  AdminCategoryStat,
  AdminPlayerSummary,
  computeAdminAnalytics,
  fetchAllMatchesForAdmin,
  fetchAllUsersMapForAdmin,
  TimeFilterOption,
} from '../services/adminAnalyticsService';
import { UserGameMatch } from '../types/match';

const PALETTE = [
  '#14543D',
  '#F07842',
  '#2C5E8A',
  '#8C2D38',
  '#D97706',
  '#059669',
  '#4F46E5',
  '#0284C7',
  '#7C3AED',
  '#DB2777',
];

type PlayerSortField = 'totalMatches' | 'completedMatches' | 'inProgressMatches' | 'lastPlayedAt' | 'winsCount';

export const AdminPlayerAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rawMatches, setRawMatches] = useState<UserGameMatch[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, any>>(new Map());
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all');

  // Search & Sorting for Players Table
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerSortField, setPlayerSortField] = useState<PlayerSortField>('totalMatches');
  const [playerSortOrder, setPlayerSortOrder] = useState<'asc' | 'desc'>('desc');
  const [playerPage, setPlayerPage] = useState(1);
  const playersPerPage = 10;

  // Category Search & View (Top 10 vs Bottom 10 vs All)
  const [categoryView, setCategoryView] = useState<'top' | 'bottom' | 'all'>('top');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Initial Data Load
  const loadData = async () => {
    try {
      setRefreshing(true);
      const [matches, uMap] = await Promise.all([
        fetchAllMatchesForAdmin(),
        fetchAllUsersMapForAdmin(),
      ]);
      setRawMatches(matches);
      setUsersMap(uMap);
    } catch (err) {
      console.error('Failed to load admin analytics data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute Analytics based on selected time filter
  const analytics: AdminAnalyticsData = useMemo(() => {
    return computeAdminAnalytics(rawMatches, usersMap, timeFilter);
  }, [rawMatches, usersMap, timeFilter]);

  // Filtered and Sorted Players Table
  const filteredPlayers = useMemo(() => {
    let list = [...analytics.players];

    if (playerSearchQuery.trim()) {
      const q = playerSearchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.userName.toLowerCase().includes(q) ||
          p.userEmail.toLowerCase().includes(q) ||
          p.userId.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA = a[playerSortField] || 0;
      let valB = b[playerSortField] || 0;
      if (playerSortOrder === 'asc') {
        return valA > valB ? 1 : -1;
      }
      return valA < valB ? 1 : -1;
    });

    return list;
  }, [analytics.players, playerSearchQuery, playerSortField, playerSortOrder]);

  const totalPlayerPages = Math.max(1, Math.ceil(filteredPlayers.length / playersPerPage));
  const paginatedPlayers = useMemo(() => {
    const start = (playerPage - 1) * playersPerPage;
    return filteredPlayers.slice(start, start + playersPerPage);
  }, [filteredPlayers, playerPage, playersPerPage]);

  const handleToggleSort = (field: PlayerSortField) => {
    if (playerSortField === field) {
      setPlayerSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setPlayerSortField(field);
      setPlayerSortOrder('desc');
    }
    setPlayerPage(1);
  };

  // Categories list based on sub-tab
  const displayedCategories = useMemo(() => {
    let list: AdminCategoryStat[] = [];
    if (categoryView === 'top') {
      list = analytics.top10Categories;
    } else if (categoryView === 'bottom') {
      list = analytics.bottom10Categories;
    } else {
      list = analytics.categoryStats;
    }

    if (categorySearchQuery.trim()) {
      const q = categorySearchQuery.trim().toLowerCase();
      list = list.filter((c) => c.categoryName.toLowerCase().includes(q));
    }

    return list;
  }, [analytics, categoryView, categorySearchQuery]);

  // Format date helper in Arabic
  const formatDate = (millis: number | null | undefined) => {
    if (!millis) return 'غير متوفر';
    try {
      return new Date(millis).toLocaleDateString('ar-SA', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'تاريخ غير معروف';
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl">
        <div className="w-12 h-12 border-3 border-[#14543D] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-display text-sm font-bold text-[#14543D]">
          جاري استخراج وتحليل إحصائيات اللاعبين والمباريات من قاعدة البيانات...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Header with Time Range Filters & Refresh */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 md:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#14543D] mb-1">
            <Activity className="w-4 h-4 text-[#F07842]" />
            <span>لوحة تحليلية متقدمة</span>
            <span>•</span>
            <span className="text-[#777B73]">للإدارة فقط</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-[#252824]">
            إحصائيات اللاعبين والفئات في نِزال
          </h2>
          <p className="text-xs text-[#777B73] mt-1">
            بيانات واقعية مستخرجة مباشرة من سجل المباريات الفعلية في Firestore.
          </p>
        </div>

        {/* Time Filters & Refresh Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#F3F5E9] p-1 rounded-xl border border-[#E5E8DD]">
            {(
              [
                { id: 'today', label: 'اليوم' },
                { id: '7d', label: '7 أيام' },
                { id: '30d', label: '30 يوماً' },
                { id: '90d', label: '90 يوماً' },
                { id: 'all', label: 'جميع الأوقات' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setTimeFilter(opt.id);
                  setPlayerPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  timeFilter === opt.id
                    ? 'bg-[#14543D] text-white shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={refreshing}
            onClick={loadData}
            title="تحديث البيانات فورياً"
            className="px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] hover:bg-[#F3F5E9] text-xs font-bold text-[#252824] flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#14543D] ${refreshing ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* 2. Key Statistical Indicators (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#777B73]">
            <span>إجمالي الحسابات التي لعبت</span>
            <Users className="w-4 h-4 text-[#14543D]" />
          </div>
          <div className="font-display text-2xl font-bold text-[#14543D]">
            {analytics.kpis.totalPlayersWhoPlayed}
          </div>
          <div className="text-[11px] text-[#777B73]">
            لاعبون نشطون في الفترة: <span className="font-bold text-[#252824]">{analytics.kpis.activePlayersCount}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#777B73]">
            <span>المباريات التي بدأت</span>
            <Flame className="w-4 h-4 text-[#F07842]" />
          </div>
          <div className="font-display text-2xl font-bold text-[#F07842]">
            {analytics.kpis.totalMatchesStarted}
          </div>
          <div className="text-[11px] text-[#777B73] flex items-center gap-1">
            <span className="text-emerald-700 font-bold">{analytics.kpis.totalMatchesCompleted} مكتملة</span>
            <span>•</span>
            <span className="text-amber-700 font-bold">{analytics.kpis.totalMatchesInProgress} جارية</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#777B73]">
            <span>معدل المباريات لكل لاعب</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-display text-2xl font-bold text-[#252824]">
            {analytics.kpis.avgMatchesPerPlayer}
          </div>
          <div className="text-[11px] text-[#777B73]">
            مباراة في المتوسط لكل حساب
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#777B73]">
            <span>أكثر لاعب فاز بمباريات</span>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-display text-base font-bold text-[#14543D] truncate" title={analytics.kpis.mostVictoriousPlayer?.name || 'لا يوجد'}>
            {analytics.kpis.mostVictoriousPlayer ? analytics.kpis.mostVictoriousPlayer.name : '—'}
          </div>
          <div className="text-[11px] text-[#777B73]">
            {analytics.kpis.mostVictoriousPlayer ? `${analytics.kpis.mostVictoriousPlayer.wins} انتصار مسجل` : 'لا توجد مباريات بعد'}
          </div>
        </div>
      </div>

      {/* 3. Recharts Visual Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Top 10 Most Popular Categories BarChart */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#14543D]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                أكثر 10 فئات اختياراً وتنافساً
              </h3>
            </div>
            <span className="text-[11px] text-[#777B73] font-bold">
              إجمالي الاختيارات: {analytics.categoryStats.reduce((s, c) => s + c.selectionCount, 0)}
            </span>
          </div>

          {analytics.top10Categories.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#777B73]">
              لا توجد بيانات اختيارات كافية في هذه الفترة الزمنية.
            </div>
          ) : (
            <div className="h-72 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.top10Categories}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 20, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E8DD" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                  <YAxis
                    dataKey="categoryName"
                    type="category"
                    width={120}
                    tick={{ fontSize: 11, fill: '#252824', fontWeight: 600 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as AdminCategoryStat;
                        return (
                          <div className="bg-[#FFFFFF] border border-[#E5E8DD] shadow-lg rounded-xl p-3 text-right text-xs space-y-1">
                            <p className="font-bold text-[#252824]">{data.categoryName}</p>
                            <p className="text-[#14543D] font-bold">مرات الاختيار: {data.selectionCount}</p>
                            <p className="text-[#777B73]">نسبة الاختيار: {data.selectionPercentage}%</p>
                            <p className="text-[#F07842]">اللاعبون المختلفون: {data.uniquePlayersCount}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="selectionCount"
                    name="عدد مرات الاختيار"
                    radius={[0, 8, 8, 0]}
                    barSize={18}
                  >
                    {analytics.top10Categories.map((_, index) => (
                      <Cell key={`bar-${index}`} fill={PALETTE[index % PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Match Status Breakdown (Donut PieChart) */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-[#F07842]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                نسبة المباريات المكتملة وغير المكتملة
              </h3>
            </div>
            <span className="text-[11px] text-[#777B73] font-bold">
              {analytics.kpis.totalMatchesStarted} مباراة
            </span>
          </div>

          <div className="h-52 w-full min-w-0 flex items-center justify-center" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0];
                      return (
                        <div className="bg-[#FFFFFF] border border-[#E5E8DD] shadow-lg rounded-xl p-2.5 text-right text-xs">
                          <p className="font-bold text-[#252824]">{data.name}</p>
                          <p className="font-bold" style={{ color: data.payload.fill }}>
                            {data.value} مباراة
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Pie
                  data={analytics.completionPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={78}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {analytics.completionPieData.map((entry, index) => (
                    <Cell key={`slice-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5E8DD] text-xs">
            {analytics.completionPieData.map((item, idx) => (
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

        {/* Chart 3: Matches Activity Trend (AreaChart) */}
        {analytics.matchesOverTime.length >= 2 && (
          <div className="lg:col-span-12 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#14543D]" />
                <h3 className="font-display text-sm font-bold text-[#252824]">
                  نشاط ونمو المباريات خلال الفترة الزمنية
                </h3>
              </div>
              <span className="text-[11px] text-[#777B73]">
                توزيع زمني للمباريات
              </span>
            </div>

            <div className="h-56 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analytics.matchesOverTime}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="matchesTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14543D" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#14543D" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8DD" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#777B73' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-[#FFFFFF] border border-[#E5E8DD] shadow-lg rounded-xl p-3 text-right text-xs space-y-1">
                            <p className="font-bold text-[#252824]">التاريخ: {label}</p>
                            <p className="text-[#14543D] font-bold">إجمالي المباريات: {payload[0]?.value}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="matchesCount"
                    name="المباريات"
                    stroke="#14543D"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#matchesTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 4. Section: Category Popularity Analytics (أكثر وأقل الفئات شعبية) */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 md:p-6 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#F07842]" />
              <h3 className="font-display text-lg font-bold text-[#252824]">
                إحصائيات الفئات الأكثر والأقل اختياراً
              </h3>
            </div>
            <p className="text-xs text-[#777B73] mt-0.5">
              ترتيب الفئات حسب عدد مرات الاختيار، النسبة المئوية، وعدد اللاعبين المختلفين
            </p>
          </div>

          {/* Sub-tabs: Top 10 / Bottom 10 / All */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCategoryView('top')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                categoryView === 'top'
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#F3F5E9] text-[#777B73] hover:text-[#252824]'
              }`}
            >
              أكثر 10 فئات شعبية ⭐
            </button>
            <button
              type="button"
              onClick={() => setCategoryView('bottom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                categoryView === 'bottom'
                  ? 'bg-[#F07842] text-white'
                  : 'bg-[#F3F5E9] text-[#777B73] hover:text-[#252824]'
              }`}
            >
              أقل 10 فئات شعبية 📉
            </button>
            <button
              type="button"
              onClick={() => setCategoryView('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                categoryView === 'all'
                  ? 'bg-[#252824] text-white'
                  : 'bg-[#F3F5E9] text-[#777B73] hover:text-[#252824]'
              }`}
            >
              جميع الفئات ({analytics.categoryStats.length})
            </button>
          </div>
        </div>

        {/* Search Input for categories */}
        {categoryView === 'all' && (
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={categorySearchQuery}
              onChange={(e) => setCategorySearchQuery(e.target.value)}
              placeholder="ابحث عن فئة معينة..."
              className="w-full pl-3 pr-10 py-2 rounded-xl border border-[#E5E8DD] text-xs focus:outline-none focus:border-[#14543D]"
            />
          </div>
        )}

        {/* Category Table */}
        {displayedCategories.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#777B73]">
            لا توجد فئات مطابقة لمعايير البحث في هذه الفترة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-3 px-4 font-bold">#</th>
                  <th className="py-3 px-4 font-bold">اسم الفئة</th>
                  <th className="py-3 px-4 font-bold">عدد مرات الاختيار</th>
                  <th className="py-3 px-4 font-bold">نسبة الاختيار</th>
                  <th className="py-3 px-4 font-bold">لاعبون مختلفون</th>
                  <th className="py-3 px-4 font-bold">مؤشر الشعبية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {displayedCategories.map((cat, idx) => {
                  const rank = idx + 1;
                  return (
                    <tr key={cat.categoryName} className="hover:bg-[#F3F5E9]/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-[#777B73]">
                        {categoryView === 'top' && rank <= 3 ? (
                          <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] inline-flex items-center justify-center font-bold">
                            {rank}
                          </span>
                        ) : (
                          rank
                        )}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#252824]">
                        {cat.categoryName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#14543D]">
                        {cat.selectionCount}
                      </td>
                      <td className="py-3 px-4 font-bold text-[#F07842]">
                        {cat.selectionPercentage}%
                      </td>
                      <td className="py-3 px-4 text-[#777B73]">
                        {cat.uniquePlayersCount} لاعب
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-28 bg-[#E5E8DD] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-[#14543D] h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (cat.selectionPercentage * 4))}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Section: All Players List Table (قائمة جميع اللاعبين) */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 md:p-6 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#14543D]" />
              <h3 className="font-display text-lg font-bold text-[#252824]">
                قائمة جميع اللاعبين النشطين
              </h3>
            </div>
            <p className="text-xs text-[#777B73] mt-0.5">
              جميع الحسابات التي لعبت مباراة واحدة على الأقل في نِزال مع تفاصيل الأداء وسجل الانتصارات.
            </p>
          </div>

          <div className="text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-3.5 py-1.5 rounded-xl border border-[#14543D]/20">
            {filteredPlayers.length} لاعب مسجل
          </div>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={playerSearchQuery}
              onChange={(e) => {
                setPlayerSearchQuery(e.target.value);
                setPlayerPage(1);
              }}
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-[#E5E8DD] text-xs focus:outline-none focus:border-[#14543D]"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-[#777B73]">
            <span>الترتيب حسب:</span>
            <button
              type="button"
              onClick={() => handleToggleSort('totalMatches')}
              className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                playerSortField === 'totalMatches'
                  ? 'bg-[#14543D] text-white border-[#14543D]'
                  : 'bg-[#FFFFFF] border-[#E5E8DD] text-[#252824]'
              }`}
            >
              المباريات {playerSortField === 'totalMatches' && (playerSortOrder === 'desc' ? '↓' : '↑')}
            </button>
            <button
              type="button"
              onClick={() => handleToggleSort('winsCount')}
              className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                playerSortField === 'winsCount'
                  ? 'bg-[#14543D] text-white border-[#14543D]'
                  : 'bg-[#FFFFFF] border-[#E5E8DD] text-[#252824]'
              }`}
            >
              الانتصارات {playerSortField === 'winsCount' && (playerSortOrder === 'desc' ? '↓' : '↑')}
            </button>
            <button
              type="button"
              onClick={() => handleToggleSort('lastPlayedAt')}
              className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                playerSortField === 'lastPlayedAt'
                  ? 'bg-[#14543D] text-white border-[#14543D]'
                  : 'bg-[#FFFFFF] border-[#E5E8DD] text-[#252824]'
              }`}
            >
              آخر نشاط {playerSortField === 'lastPlayedAt' && (playerSortOrder === 'desc' ? '↓' : '↑')}
            </button>
          </div>
        </div>

        {/* Players Table */}
        {paginatedPlayers.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#777B73]">
            لا توجد حسابات مطابقة لمعايير البحث.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-3 px-4 font-bold">اللاعب</th>
                  <th className="py-3 px-4 font-bold">البريد الإلكتروني (للأدمن)</th>
                  <th className="py-3 px-4 font-bold">تاريخ التسجيل</th>
                  <th className="py-3 px-4 font-bold cursor-pointer" onClick={() => handleToggleSort('totalMatches')}>
                    <span className="flex items-center gap-1">
                      <span>إجمالي المباريات</span>
                      <ArrowUpDown className="w-3 h-3 text-[#777B73]" />
                    </span>
                  </th>
                  <th className="py-3 px-4 font-bold">مكتملة / جارية</th>
                  <th className="py-3 px-4 font-bold cursor-pointer" onClick={() => handleToggleSort('winsCount')}>
                    <span className="flex items-center gap-1">
                      <span>الانتصارات</span>
                      <ArrowUpDown className="w-3 h-3 text-[#777B73]" />
                    </span>
                  </th>
                  <th className="py-3 px-4 font-bold cursor-pointer" onClick={() => handleToggleSort('lastPlayedAt')}>
                    <span className="flex items-center gap-1">
                      <span>آخر مرة لعب</span>
                      <ArrowUpDown className="w-3 h-3 text-[#777B73]" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {paginatedPlayers.map((player) => (
                  <tr key={player.userId} className="hover:bg-[#F3F5E9]/50 transition-colors">
                    {/* User Name */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center font-bold text-xs shrink-0">
                          {player.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-[#252824]">{player.userName}</div>
                          <div className="font-mono text-[10px] text-[#777B73]">{player.userId.slice(0, 10)}...</div>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-3.5 px-4 font-mono text-[#777B73]">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-[#777B73] shrink-0" />
                        <span>{player.userEmail}</span>
                      </div>
                    </td>

                    {/* Registration Date */}
                    <td className="py-3.5 px-4 text-[#777B73]">
                      {player.registeredAt ? formatDate(player.registeredAt) : 'سجل قديماً'}
                    </td>

                    {/* Total Matches */}
                    <td className="py-3.5 px-4 font-mono font-bold text-sm text-[#14543D]">
                      {player.totalMatches}
                    </td>

                    {/* Completed vs InProgress */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 text-[11px] font-bold">
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          {player.completedMatches} مكتملة
                        </span>
                        {player.inProgressMatches > 0 && (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                            {player.inProgressMatches} جارية
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Wins Count */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1 font-bold text-[#14543D] bg-[#EAF2EE] px-2.5 py-0.5 rounded-lg border border-[#14543D]/20">
                        <Trophy className="w-3 h-3 text-[#F07842]" />
                        <span>{player.winsCount}</span>
                      </div>
                    </td>

                    {/* Last Played Date */}
                    <td className="py-3.5 px-4 text-[#777B73] font-medium">
                      {formatDate(player.lastPlayedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPlayerPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E5E8DD] pt-4 text-xs">
            <span className="text-[#777B73]">
              الصفحة {playerPage} من {totalPlayerPages} (إجمالي {filteredPlayers.length} لاعب)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={playerPage <= 1}
                onClick={() => setPlayerPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] font-bold text-[#252824] cursor-pointer disabled:opacity-40"
              >
                السابق
              </button>
              <button
                type="button"
                disabled={playerPage >= totalPlayerPages}
                onClick={() => setPlayerPage((p) => Math.min(totalPlayerPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] font-bold text-[#252824] cursor-pointer disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
