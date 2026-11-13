import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Legend,
} from 'recharts';
import {
  Users,
  Trophy,
  Layers,
  TrendingUp,
  Search,
  RefreshCw,
  ArrowUpDown,
  BarChart3,
  PieChart as PieIcon,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import {
  AdminAnalyticsData,
  AdminCategoryStat,
  AdminPlayerSummary,
  buildCanonicalMatches,
  CanonicalMatch,
  computeAdminAnalytics,
  fetchAllUsersMapForAdmin,
  fetchRawMatchCollectionsForAdmin,
  MatchModeFilter,
  subscribeToAdminMatchUpdates,
  TimeFilterOption,
  TimelineGranularity,
} from '../services/adminAnalyticsService';
import { SubcategoryItem } from '../types/game';

interface AdminPlayerAnalyticsProps {
  isAdmin?: boolean;
  subcategories?: SubcategoryItem[];
}

type PlayerSortField =
  | 'totalMatches'
  | 'localMatches'
  | 'onlineMatches'
  | 'winsCount'
  | 'lossesCount'
  | 'drawsCount'
  | 'winRate'
  | 'lastPlayedAt'
  | 'registeredAt';

type LeaderboardTab =
  | 'mostPlayed'
  | 'mostWins'
  | 'highestWinRate'
  | 'mostLocal'
  | 'mostOnline'
  | 'mostActiveLast30d';

export const AdminPlayerAnalytics: React.FC<AdminPlayerAnalyticsProps> = ({
  isAdmin = false,
  subcategories = [],
}) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [canonicalMatches, setCanonicalMatches] = useState<CanonicalMatch[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, any>>(new Map());

  // Global Filters
  const [modeFilter, setModeFilter] = useState<MatchModeFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilterOption>('all');
  const [timelineGranularity, setTimelineGranularity] =
    useState<TimelineGranularity>('daily');

  // Leaderboard State
  const [leaderboardTab, setLeaderboardTab] =
    useState<LeaderboardTab>('mostPlayed');

  // Category Analytics State
  const [categoryModeView, setCategoryModeView] =
    useState<MatchModeFilter>('all');
  const [categoryListScope, setCategoryListScope] = useState<
    'all' | 'top' | 'bottom'
  >('all');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Players Table State
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [includeUnclassifiedGuests, setIncludeUnclassifiedGuests] =
    useState(false);
  const [playerSortField, setPlayerSortField] =
    useState<PlayerSortField>('totalMatches');
  const [playerSortOrder, setPlayerSortOrder] = useState<'asc' | 'desc'>(
    'desc'
  );
  const [playerPage, setPlayerPage] = useState(1);
  const playersPerPage = 12;

  const subcategoriesRef = React.useRef<SubcategoryItem[]>(subcategories);
  useEffect(() => {
    subcategoriesRef.current = subcategories;
  }, [subcategories]);

  const loadData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setRefreshing(true);
      setLoadError(null);
      const [raw, uMap] = await Promise.all([
        fetchRawMatchCollectionsForAdmin(),
        fetchAllUsersMapForAdmin(),
      ]);
      const unified = buildCanonicalMatches(
        raw,
        uMap,
        subcategoriesRef.current
      );
      setCanonicalMatches(unified);
      setUsersMap(uMap);
    } catch (err) {
      console.error('Failed to load admin analytics data:', err);
      setLoadError('تعذر تحميل إحصائيات اللاعبين من قاعدة البيانات.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    loadData();
    const unsub = subscribeToAdminMatchUpdates(() => {
      loadData();
    });
    return () => unsub();
  }, [isAdmin, loadData]);

  // Compute Analytics dynamically from Mode + Time Filters
  const analytics: AdminAnalyticsData = useMemo(() => {
    return computeAdminAnalytics(
      canonicalMatches,
      usersMap,
      timeFilter,
      modeFilter
    );
  }, [canonicalMatches, usersMap, timeFilter, modeFilter]);

  // Active Match Timeline by selected granularity
  const activeMatchTimeline = useMemo(() => {
    if (timelineGranularity === 'weekly') return analytics.matchesTimelineWeekly;
    if (timelineGranularity === 'monthly')
      return analytics.matchesTimelineMonthly;
    return analytics.matchesTimelineDaily;
  }, [analytics, timelineGranularity]);

  // Active Leaderboard List
  const activeLeaderboard = useMemo(() => {
    return analytics.leaderboards[leaderboardTab] || [];
  }, [analytics.leaderboards, leaderboardTab]);

  // Categories Table filtered by Mode & Scope & Search
  const displayedCategories = useMemo(() => {
    let list: AdminCategoryStat[] = [...analytics.categoryStats];

    if (categoryModeView === 'local') {
      list = list
        .filter((c) => c.localSelectionCount > 0)
        .sort((a, b) => b.localSelectionCount - a.localSelectionCount);
    } else if (categoryModeView === 'online') {
      list = list
        .filter((c) => c.onlineSelectionCount > 0)
        .sort((a, b) => b.onlineSelectionCount - a.onlineSelectionCount);
    }

    if (categoryListScope === 'top') {
      list = list.slice(0, 10);
    } else if (categoryListScope === 'bottom') {
      list = [...list].reverse().slice(0, 10);
    }

    if (categorySearchQuery.trim()) {
      const q = categorySearchQuery.trim().toLowerCase();
      list = list.filter((c) => c.categoryName.toLowerCase().includes(q));
    }

    return list;
  }, [
    analytics.categoryStats,
    categoryModeView,
    categoryListScope,
    categorySearchQuery,
  ]);

  // Filtered and Sorted Players Table
  const filteredPlayers = useMemo(() => {
    const base = includeUnclassifiedGuests
      ? analytics.players
      : analytics.registeredPlayersOnly.length > 0
      ? analytics.registeredPlayersOnly
      : analytics.players;

    let list = [...base];

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
      const valA = Number(a[playerSortField] || 0);
      const valB = Number(b[playerSortField] || 0);
      if (playerSortOrder === 'asc') {
        return valA - valB;
      }
      return valB - valA;
    });

    return list;
  }, [
    analytics.players,
    analytics.registeredPlayersOnly,
    includeUnclassifiedGuests,
    playerSearchQuery,
    playerSortField,
    playerSortOrder,
  ]);

  const totalPlayerPages = Math.max(
    1,
    Math.ceil(filteredPlayers.length / playersPerPage)
  );
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

  const formatDate = (millis: number | null | undefined) => {
    if (!millis) return '—';
    try {
      return new Date(millis).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const formatDateTime = (millis: number | null | undefined) => {
    if (!millis) return '—';
    try {
      return new Date(millis).toLocaleDateString('ar-SA', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  // Security guard: Admin only
  if (!isAdmin) {
    return (
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-12 text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-[#DC2626] mx-auto" />
        <h3 className="font-display text-lg font-bold text-[#252824]">
          وصول مقيّد للمشرفين فقط
        </h3>
        <p className="text-xs text-[#777B73]">
          بيانات وإحصائيات اللاعبين محمية بصلاحيات المشرف المعتمدة في Firebase.
        </p>
      </div>
    );
  }

  // Loading Skeleton matching layout geometry
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl animate-pulse" />
          <div className="h-72 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const topLocalCategory = analytics.topCategoriesLocal[0];
  const topOnlineCategory = analytics.topCategoriesOnline[0];
  const guestPlayersCount =
    analytics.players.length - analytics.registeredPlayersOnly.length;

  return (
    <div className="space-y-8">
      {/* 1. Header & Unified Filter Bar */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 md:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#777B73]">
              <span className="font-bold text-[#14543D]">إحصائيات المنصة</span>
              <span aria-hidden="true">·</span>
              <span>محلي وأونلاين موحّد</span>
              <span aria-hidden="true">·</span>
              <span>تحديث تلقائي مباشر</span>
            </div>
            <h2 className="font-display text-xl md:text-2xl font-bold text-[#252824]">
              إحصائيات اللاعبين والمباريات والفئات
            </h2>
            <p className="text-xs text-[#777B73]">
              تحليل موحّد لجميع المباريات المسجلة في Firestore دون تكرار أو استثناء، شاملاً المباريات المحلية والأونلاين والمكتملة وغير المكتملة.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(modeFilter !== 'all' || timeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setModeFilter('all');
                  setTimeFilter('all');
                  setPlayerPage(1);
                }}
                className="px-3 py-2 rounded-lg border border-[#E5E8DD] bg-[#F3F5E9] hover:bg-[#E5E8DD]/60 text-xs font-bold text-[#252824] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#F07842]" />
                <span>إعادة الضبط</span>
              </button>
            )}

            <button
              type="button"
              disabled={refreshing}
              onClick={loadData}
              className="px-4 py-2 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] hover:bg-[#F3F5E9] text-xs font-bold text-[#252824] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#14543D] ${
                  refreshing ? 'animate-spin' : ''
                }`}
              />
              <span>تحديث البيانات</span>
            </button>
          </div>
        </div>

        {/* Mode & Time Controls Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-[#E5E8DD]">
          {/* Mode Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#777B73]">نوع اللعب:</span>
            <div className="flex items-center bg-[#F3F5E9] p-1 rounded-lg border border-[#E5E8DD]">
              {(
                [
                  { id: 'all', label: 'جميع المباريات' },
                  { id: 'local', label: 'المحلية فقط' },
                  { id: 'online', label: 'الأونلاين فقط' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setModeFilter(opt.id);
                    setPlayerPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    modeFilter === opt.id
                      ? 'bg-[#14543D] text-white'
                      : 'text-[#777B73] hover:text-[#252824]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time Window Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#777B73]">الفترة الزمنية:</span>
            <div className="flex items-center bg-[#F3F5E9] p-1 rounded-lg border border-[#E5E8DD]">
              {(
                [
                  { id: '7d', label: 'آخر 7 أيام' },
                  { id: '30d', label: 'آخر 30 يوماً' },
                  { id: '90d', label: 'آخر 90 يوماً' },
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
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    timeFilter === opt.id
                      ? 'bg-[#252824] text-white'
                      : 'text-[#777B73] hover:text-[#252824]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loadError && (
          <div className="p-3 rounded-lg border border-[#DC2626]/30 bg-rose-50 text-xs font-bold text-[#DC2626]">
            {loadError}
          </div>
        )}
      </div>

      {/* 2. Local + Online Unified & Separated KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">إجمالي جميع المباريات</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {analytics.kpis.totalMatches}
          </div>
          <div className="text-[11px] text-[#777B73] font-mono tabular-nums">
            محلي {analytics.kpis.totalLocalMatches} · أونلاين{' '}
            {analytics.kpis.totalOnlineMatches}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">المباريات المحلية</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#14543D]">
            {analytics.kpis.totalLocalMatches}
          </div>
          <div className="text-[11px] text-[#777B73]">
            لعب جماعي على نفس الجهاز
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">المباريات الأونلاين</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#F07842]">
            {analytics.kpis.totalOnlineMatches}
          </div>
          <div className="text-[11px] text-[#777B73]">
            غرف التحدي عن بُعد
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">المكتملة / غير المكتملة</span>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-bold text-[#16A34A]">
              {analytics.kpis.completedMatches}
            </span>
            <span className="text-xs text-[#777B73]">/</span>
            <span className="text-lg font-bold text-[#D97706]">
              {analytics.kpis.incompleteMatches}
            </span>
          </div>
          <div className="text-[11px] text-[#777B73] font-mono tabular-nums">
            نسبة الإتمام {analytics.kpis.completionRate}%
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">اللاعبون المختلفون (الكل)</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#14543D]">
            {analytics.kpis.totalUniquePlayers}
          </div>
          <div className="text-[11px] text-[#777B73] font-mono tabular-nums">
            متوسط {analytics.kpis.avgMatchesPerPlayer} مباراة للاعب
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">مشاركو المباريات المحلية</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {analytics.kpis.localPlayersCount}
          </div>
          <div className="text-[11px] text-[#777B73]">
            حسابات فريدة في الوضع المحلي
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">مشاركو المباريات الأونلاين</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {analytics.kpis.onlinePlayersCount}
          </div>
          <div className="text-[11px] text-[#777B73]">
            حسابات فريدة في غرف الأونلاين
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] space-y-1">
          <span className="text-xs text-[#777B73] block">البيانات القديمة / غير المصنفة</span>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#777B73]">
            {analytics.kpis.unclassifiedMatchesCount}
          </div>
          <div className="text-[11px] text-[#777B73]">
            مباريات محفوظة بدون حساب أو تصنيف
          </div>
        </div>
      </div>

      {/* 3. Recharts Visual Analytics (6 Professional Charts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Chart 1: Match Growth Trend (Daily / Weekly / Monthly) */}
        <div className="lg:col-span-8 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#14543D]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                تطور عدد المباريات (المحلية والأونلاين)
              </h3>
            </div>
            <div className="flex items-center bg-[#F3F5E9] p-1 rounded-lg border border-[#E5E8DD] self-start sm:self-center">
              {(
                [
                  { id: 'daily', label: 'يومي' },
                  { id: 'weekly', label: 'أسبوعي' },
                  { id: 'monthly', label: 'شهري' },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setTimelineGranularity(g.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    timelineGranularity === g.id
                      ? 'bg-[#FFFFFF] text-[#14543D]'
                      : 'text-[#777B73] hover:text-[#252824]'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {activeMatchTimeline.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#777B73]">
              لا توجد بيانات مباريات كافية لعرض التطور الزمني في هذه الفترة.
            </div>
          ) : (
            <div className="h-64 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={activeMatchTimeline}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="localAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14543D" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#14543D" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="onlineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F07842" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#F07842" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8DD" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#777B73' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload;
                      return (
                        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg p-3 text-right text-xs space-y-1">
                          <p className="font-bold text-[#252824]">{label}</p>
                          <p className="font-mono tabular-nums text-[#252824]">
                            الإجمالي: {row.totalCount}
                          </p>
                          <p className="font-mono tabular-nums text-[#14543D]">
                            محلية: {row.localCount}
                          </p>
                          <p className="font-mono tabular-nums text-[#F07842]">
                            أونلاين: {row.onlineCount}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area
                    type="monotone"
                    dataKey="localCount"
                    name="المحلية"
                    stroke="#14543D"
                    strokeWidth={2}
                    fill="url(#localAreaGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="onlineCount"
                    name="الأونلاين"
                    stroke="#F07842"
                    strokeWidth={2}
                    fill="url(#onlineAreaGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 2: Completed vs Incomplete Ratio */}
        <div className="lg:col-span-4 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-[#F07842]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                نسبة المكتملة وغير المكتملة
              </h3>
            </div>
            <span className="font-mono tabular-nums text-xs text-[#777B73]">
              {analytics.kpis.totalMatches} مباراة
            </span>
          </div>

          {analytics.completionPieData.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#777B73]">
              لا توجد مباريات بعد.
            </div>
          ) : (
            <div className="h-52 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      return (
                        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg p-2.5 text-right text-xs">
                          <p className="font-bold text-[#252824]">{d.name}</p>
                          <p className="font-mono tabular-nums font-bold" style={{ color: d.payload.fill }}>
                            {d.value} مباراة
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Pie
                    data={analytics.completionPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {analytics.completionPieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-[#E5E8DD] text-xs font-mono tabular-nums">
            <span className="text-[#16A34A] font-bold">
              مكتملة: {analytics.kpis.completedMatches} ({analytics.kpis.completionRate}%)
            </span>
            <span className="text-[#D97706] font-bold">
              غير مكتملة: {analytics.kpis.incompleteMatches}
            </span>
          </div>
        </div>

        {/* Chart 3: Player Growth Over Time */}
        <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#14543D]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                نمو عدد اللاعبين (التراكمي)
              </h3>
            </div>
            <span className="font-mono tabular-nums text-xs text-[#777B73]">
              الإجمالي: {analytics.kpis.totalUniquePlayers}
            </span>
          </div>

          {analytics.playerGrowthTimeline.length === 0 ? (
            <div className="py-14 text-center text-xs text-[#777B73]">
              لا توجد بيانات تسجيل زمنية كافية للرسم البياني.
            </div>
          ) : (
            <div className="h-60 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analytics.playerGrowthTimeline}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="playerGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14543D" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#14543D" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E8DD" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#777B73' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload;
                      return (
                        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg p-3 text-right text-xs space-y-1">
                          <p className="font-bold text-[#252824]">{label}</p>
                          <p className="font-mono tabular-nums text-[#14543D] font-bold">
                            إجمالي اللاعبين: {row.cumulativePlayers}
                          </p>
                          <p className="font-mono tabular-nums text-[#777B73]">
                            لاعبون جدد في هذا اليوم: +{row.newPlayers}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativePlayers"
                    name="إجمالي اللاعبين"
                    stroke="#14543D"
                    strokeWidth={2.5}
                    fill="url(#playerGrowthGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 4: Local vs Online Matches Comparison */}
        <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#F07842]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                مقارنة المباريات المحلية مقابل الأونلاين
              </h3>
            </div>
            <span className="text-xs text-[#777B73]">الوضعان معاً</span>
          </div>

          <div className="h-60 w-full min-w-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.localVsOnlineChartData}
                margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E8DD" />
                <XAxis dataKey="metric" tick={{ fontSize: 11, fill: '#252824' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg p-3 text-right text-xs space-y-1">
                        <p className="font-bold text-[#252824]">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p
                            key={i}
                            className="font-mono tabular-nums font-bold"
                            style={{ color: p.fill }}
                          >
                            {p.name}: {p.value}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar
                  dataKey="local"
                  name="المحلية"
                  fill="#14543D"
                  radius={[6, 6, 0, 0]}
                  barSize={22}
                />
                <Bar
                  dataKey="online"
                  name="الأونلاين"
                  fill="#F07842"
                  radius={[6, 6, 0, 0]}
                  barSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Most Played Categories (Stacked Local + Online) */}
        <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#14543D]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                أكثر 10 فئات لعباً (محلي + أونلاين)
              </h3>
            </div>
            <span className="font-mono tabular-nums text-xs text-[#777B73]">
              {analytics.categoryStats.length} فئة
            </span>
          </div>

          {analytics.topCategoriesAll.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#777B73]">
              لا توجد اختيارات فئات مسجلة في هذه الفترة.
            </div>
          ) : (
            <div className="h-72 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.topCategoriesAll}
                  layout="vertical"
                  margin={{ top: 6, right: 16, left: 20, bottom: 6 }}
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
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as AdminCategoryStat;
                      return (
                        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg p-3 text-right text-xs space-y-1">
                          <p className="font-bold text-[#252824]">{d.categoryName}</p>
                          <p className="font-mono tabular-nums text-[#252824] font-bold">
                            الإجمالي: {d.selectionCount} ({d.selectionPercentage}%)
                          </p>
                          <p className="font-mono tabular-nums text-[#14543D]">
                            في المحلية: {d.localSelectionCount}
                          </p>
                          <p className="font-mono tabular-nums text-[#F07842]">
                            في الأونلاين: {d.onlineSelectionCount}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="localSelectionCount"
                    name="محلية"
                    stackId="cat"
                    fill="#14543D"
                    barSize={16}
                  />
                  <Bar
                    dataKey="onlineSelectionCount"
                    name="أونلاين"
                    stackId="cat"
                    fill="#F07842"
                    radius={[0, 6, 6, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Chart 6: Top Active Players Ranking */}
        <div className="lg:col-span-6 bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#F07842]" />
              <h3 className="font-display text-sm font-bold text-[#252824]">
                ترتيب أكثر اللاعبين نشاطاً
              </h3>
            </div>
            <span className="text-xs text-[#777B73]">أعلى 8 لاعبين</span>
          </div>

          {analytics.topActivePlayersChartData.length === 0 ? (
            <div className="py-16 text-center text-xs text-[#777B73]">
              لا توجد مشاركات لاعبين في هذه الفترة.
            </div>
          ) : (
            <div className="h-72 w-full min-w-0" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.topActivePlayersChartData}
                  layout="vertical"
                  margin={{ top: 6, right: 16, left: 20, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E8DD" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#777B73' }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    tick={{ fontSize: 11, fill: '#252824', fontWeight: 600 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg p-3 text-right text-xs space-y-1">
                          <p className="font-bold text-[#252824]">{d.name}</p>
                          <p className="font-mono tabular-nums font-bold text-[#252824]">
                            إجمالي المباريات: {d.totalMatches}
                          </p>
                          <p className="font-mono tabular-nums text-[#14543D]">
                            محلية: {d.localMatches}
                          </p>
                          <p className="font-mono tabular-nums text-[#F07842]">
                            أونلاين: {d.onlineMatches}
                          </p>
                          <p className="font-mono tabular-nums text-[#16A34A]">
                            الانتصارات: {d.winsCount}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="localMatches"
                    name="محلية"
                    stackId="plr"
                    fill="#14543D"
                    barSize={16}
                  />
                  <Bar
                    dataKey="onlineMatches"
                    name="أونلاين"
                    stackId="plr"
                    fill="#F07842"
                    radius={[0, 6, 6, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* 4. Player Leaderboards Section (ترتيب اللاعبين) */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-0.5">
            <h3 className="font-display text-lg font-bold text-[#252824]">
              ترتيب اللاعبين (قوائم المتصدرين)
            </h3>
            <p className="text-xs text-[#777B73]">
              تصنيفات متعددة تقيس عدد المباريات، الانتصارات، نسب الفوز، والمشاركة حسب وضع اللعب والنشاط الحديث.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-[#F3F5E9] p-1 rounded-lg border border-[#E5E8DD]">
            {(
              [
                { id: 'mostPlayed', label: 'الأكثر لعباً' },
                { id: 'mostWins', label: 'الأكثر انتصاراً' },
                { id: 'highestWinRate', label: 'أعلى نسبة فوز' },
                { id: 'mostLocal', label: 'الأكثر محلياً' },
                { id: 'mostOnline', label: 'الأكثر أونلاين' },
                { id: 'mostActiveLast30d', label: 'الأكثر نشاطاً (30 يوماً)' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLeaderboardTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  leaderboardTab === tab.id
                    ? 'bg-[#14543D] text-white'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeLeaderboard.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#777B73]">
            لا توجد بيانات كافية لهذا التصنيف في الفترة المحددة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-2.5 px-4 font-bold w-14">الترتيب</th>
                  <th className="py-2.5 px-4 font-bold">اللاعب</th>
                  <th className="py-2.5 px-4 font-bold">إجمالي المباريات</th>
                  <th className="py-2.5 px-4 font-bold">محلية / أونلاين</th>
                  <th className="py-2.5 px-4 font-bold">فوز / خسارة / تعادل</th>
                  <th className="py-2.5 px-4 font-bold">نسبة الفوز</th>
                  <th className="py-2.5 px-4 font-bold">نشاط آخر 30 يوماً</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {activeLeaderboard.map((p, idx) => (
                  <tr
                    key={p.userId}
                    className="hover:bg-[#F3F5E9]/40 transition-colors h-11"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-[#14543D]">
                      #{idx + 1}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-[#252824]">{p.userName}</div>
                      <div className="text-[11px] text-[#777B73]">
                        {p.mostPlayedCategory !== '—'
                          ? `الأكثر لعباً: ${p.mostPlayedCategory}`
                          : p.userEmail}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-[#252824]">
                      {p.totalMatches}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#777B73]">
                      <span className="text-[#14543D] font-bold">
                        {p.localMatches} محلي
                      </span>
                      {' · '}
                      <span className="text-[#F07842] font-bold">
                        {p.onlineMatches} أونلاين
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">
                      <span className="text-[#16A34A] font-bold">{p.winsCount}</span>
                      {' / '}
                      <span className="text-[#DC2626]">{p.lossesCount}</span>
                      {' / '}
                      <span className="text-[#777B73]">{p.drawsCount}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-[#14543D]">
                      {p.winRate}%
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#252824]">
                      {p.matchesLast30d} مباراة
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Category Popularity Analytics (إحصائيات الفئات) */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-[#252824]">
              إحصائيات الفئات (شعبية التصنيفات)
            </h3>
            <div className="text-xs text-[#777B73] flex flex-wrap items-center gap-2">
              <span>
                الأكثر محلياً:{' '}
                <strong className="text-[#14543D]">
                  {topLocalCategory
                    ? `${topLocalCategory.categoryName} (${topLocalCategory.localSelectionCount})`
                    : '—'}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                الأكثر أونلاين:{' '}
                <strong className="text-[#F07842]">
                  {topOnlineCategory
                    ? `${topOnlineCategory.categoryName} (${topOnlineCategory.onlineSelectionCount})`
                    : '—'}
                </strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode filter specifically for Category Ranking */}
            <div className="flex items-center bg-[#F3F5E9] p-1 rounded-lg border border-[#E5E8DD]">
              {(
                [
                  { id: 'all', label: 'الكل' },
                  { id: 'local', label: 'في المحلية' },
                  { id: 'online', label: 'في الأونلاين' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setCategoryModeView(m.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    categoryModeView === m.id
                      ? 'bg-[#FFFFFF] text-[#14543D]'
                      : 'text-[#777B73] hover:text-[#252824]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-[#F3F5E9] p-1 rounded-lg border border-[#E5E8DD]">
              {(
                [
                  { id: 'all', label: `الكل (${analytics.categoryStats.length})` },
                  { id: 'top', label: 'أعلى 10' },
                  { id: 'bottom', label: 'أقل 10' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCategoryListScope(s.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    categoryListScope === s.id
                      ? 'bg-[#252824] text-white'
                      : 'text-[#777B73] hover:text-[#252824]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category Search */}
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={categorySearchQuery}
            onChange={(e) => setCategorySearchQuery(e.target.value)}
            placeholder="ابحث عن فئة..."
            className="w-full pl-3 pr-10 py-2 rounded-lg border border-[#E5E8DD] text-xs focus:outline-none focus:border-[#14543D]"
          />
        </div>

        {displayedCategories.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#777B73]">
            لا توجد فئات مطابقة لمعايير التصفية الحالية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-2.5 px-4 font-bold w-12">#</th>
                  <th className="py-2.5 px-4 font-bold">اسم الفئة</th>
                  <th className="py-2.5 px-4 font-bold">مرات الاختيار</th>
                  <th className="py-2.5 px-4 font-bold">المباريات التي ظهرت فيها</th>
                  <th className="py-2.5 px-4 font-bold">لاعبون مختلفون</th>
                  <th className="py-2.5 px-4 font-bold">نسبة الانتشار</th>
                  <th className="py-2.5 px-4 font-bold">في المحلية</th>
                  <th className="py-2.5 px-4 font-bold">في الأونلاين</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {displayedCategories.map((cat, idx) => (
                  <tr
                    key={cat.categoryName}
                    className="hover:bg-[#F3F5E9]/40 transition-colors h-10"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#777B73] font-bold">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-[#252824]">
                      {cat.categoryName}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-[#14543D]">
                      {cat.selectionCount}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#252824]">
                      {cat.matchesAppearedCount}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#777B73]">
                      {cat.uniquePlayersCount}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums font-bold text-[#F07842]">
                      {cat.selectionPercentage}%
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#14543D]">
                      {cat.localSelectionCount}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-[#F07842]">
                      {cat.onlineSelectionCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Comprehensive All Players Table (جدول جميع اللاعبين) */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-5 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-0.5">
            <h3 className="font-display text-lg font-bold text-[#252824]">
              جدول جميع اللاعبين المشاركين
            </h3>
            <p className="text-xs text-[#777B73]">
              جميع الحسابات التي شاركت في مباراة واحدة على الأقل (محلية أو أونلاين) مع سجل النتائج التفصيلي.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            {guestPlayersCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIncludeUnclassifiedGuests((v) => !v);
                  setPlayerPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  includeUnclassifiedGuests
                    ? 'bg-[#252824] text-white border-[#252824]'
                    : 'bg-[#F3F5E9] text-[#252824] border-[#E5E8DD] hover:bg-[#E5E8DD]/60'
                }`}
              >
                {includeUnclassifiedGuests
                  ? 'إخفاء جلسات الضيوف غير المصنفة'
                  : `إظهار غير المصنف / الضيوف (${guestPlayersCount})`}
              </button>
            )}
            <span className="font-mono tabular-nums font-bold text-[#14543D]">
              {filteredPlayers.length} لاعب
            </span>
          </div>
        </div>

        {/* Search & Quick Sort Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={playerSearchQuery}
              onChange={(e) => {
                setPlayerSearchQuery(e.target.value);
                setPlayerPage(1);
              }}
              placeholder="ابحث باسم اللاعب أو البريد الإلكتروني..."
              className="w-full pl-3 pr-10 py-2 rounded-lg border border-[#E5E8DD] text-xs focus:outline-none focus:border-[#14543D]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#777B73]">
            <span>ترتيب سريع:</span>
            {(
              [
                { id: 'totalMatches', label: 'المباريات' },
                { id: 'winsCount', label: 'الفوز' },
                { id: 'winRate', label: 'نسبة الفوز' },
                { id: 'lastPlayedAt', label: 'آخر نشاط' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleToggleSort(s.id)}
                className={`px-3 py-1.5 rounded-lg font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  playerSortField === s.id
                    ? 'bg-[#14543D] text-white border-[#14543D]'
                    : 'bg-[#FFFFFF] border-[#E5E8DD] text-[#252824] hover:bg-[#F3F5E9]'
                }`}
              >
                {s.label}{' '}
                {playerSortField === s.id &&
                  (playerSortOrder === 'desc' ? '↓' : '↑')}
              </button>
            ))}
          </div>
        </div>

        {/* 12-Column Dense High-Accuracy Table */}
        {paginatedPlayers.length === 0 ? (
          <div className="py-14 text-center space-y-3">
            <p className="text-xs text-[#777B73]">
              لا توجد حسابات مطابقة لمعايير البحث أو التصفية الحالية.
            </p>
            {(playerSearchQuery || modeFilter !== 'all' || timeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setPlayerSearchQuery('');
                  setModeFilter('all');
                  setTimeFilter('all');
                  setPlayerPage(1);
                }}
                className="px-4 py-2 rounded-lg bg-[#14543D] text-white text-xs font-bold cursor-pointer"
              >
                عرض جميع اللاعبين
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-2.5 px-3 font-bold">اسم اللاعب</th>
                  <th className="py-2.5 px-3 font-bold">البريد الإلكتروني</th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('registeredAt')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>تاريخ التسجيل</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('totalMatches')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>الإجمالي</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('localMatches')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>المحلية</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('onlineMatches')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>الأونلاين</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('winsCount')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>الفوز</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('lossesCount')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>الخسارة</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('drawsCount')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>التعادل</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('winRate')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>نسبة الفوز</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    className="py-2.5 px-3 font-bold cursor-pointer"
                    onClick={() => handleToggleSort('lastPlayedAt')}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span>آخر نشاط</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-2.5 px-3 font-bold">أكثر فئة لعبها</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {paginatedPlayers.map((player) => (
                  <tr
                    key={player.userId}
                    className="hover:bg-[#F3F5E9]/40 transition-colors h-11"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#252824]">
                        {player.userName}
                      </div>
                      <div className="font-mono text-[10px] text-[#777B73]">
                        {player.isRegisteredAccount
                          ? player.userId.slice(0, 10)
                          : 'غير مصنف'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#777B73]">
                      {player.userEmail}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                      {formatDate(player.registeredAt)}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#252824]">
                      {player.totalMatches}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#14543D]">
                      {player.localMatches}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#F07842]">
                      {player.onlineMatches}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#16A34A]">
                      {player.winsCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#DC2626]">
                      {player.lossesCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                      {player.drawsCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#14543D]">
                      {player.winRate}%
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                      {formatDateTime(player.lastPlayedAt)}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#252824]">
                      {player.mostPlayedCategory}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPlayerPages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E5E8DD] pt-4 text-xs">
            <span className="font-mono tabular-nums text-[#777B73]">
              الصفحة {playerPage} من {totalPlayerPages} · إجمالي{' '}
              {filteredPlayers.length} لاعب
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
                onClick={() =>
                  setPlayerPage((p) => Math.min(totalPlayerPages, p + 1))
                }
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
