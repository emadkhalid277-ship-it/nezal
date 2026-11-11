import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  Trophy,
  Clock,
  Play,
  Trash2,
  Calendar,
  Layers,
  Users,
  CheckCircle2,
  AlertCircle,
  Radio,
  Award,
  Search,
  X,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { UserGameMatch, MatchMode, MatchStatus } from '../types/match';
import {
  deleteMatchRecord,
  fetchAllMatchesForUser,
} from '../services/matchService';
import { UserMatchesStats } from '../components/UserMatchesStats';

interface MyMatchesPageProps {
  user: User | null;
  onOpenAuthModal: () => void;
  onResumeMatch: (match: UserGameMatch) => void;
  onNavigateHome: () => void;
}

export const MyMatchesPage: React.FC<MyMatchesPageProps> = ({
  user,
  onOpenAuthModal,
  onResumeMatch,
  onNavigateHome,
}) => {
  const [matches, setMatches] = useState<UserGameMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // Dual-axis multi-filtering states + search
  const [modeFilter, setModeFilter] = useState<'all' | MatchMode>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | MatchStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setActionError(null);
    fetchAllMatchesForUser(user.uid)
      .then((data) => setMatches(data))
      .catch((err) => {
        console.error('Failed to load user matches:', err);
        setActionError('تعذر تحميل سجل المباريات. يرجى إعادة المحاولة.');
      })
      .finally(() => setLoading(false));
  }, [user]);

  const handleDelete = async (matchId: string) => {
    if (!user) return;
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف سجل هذه المباراة نهائياً؟')) return;

    setDeletingId(matchId);
    setActionError(null);
    try {
      await deleteMatchRecord(matchId, user.uid);
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err) {
      console.error('Failed to delete match:', err);
      setActionError('حدث خطأ أثناء حذف المباراة. يرجى المحاولة لاحقاً.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleResume = (match: UserGameMatch) => {
    setActionError(null);
    if (!match) {
      setActionError('بيانات هذه المباراة غير مكتملة أو غير قابلة للاستعادة.');
      return;
    }

    // Local match validation
    if (match.mode !== 'online' && (!Array.isArray(match.teams) || match.teams.length < 2)) {
      setActionError('بيانات هذه المباراة المحلية غير مكتملة.');
      return;
    }

    // Online match validation
    if (match.mode === 'online' && !match.roomCode) {
      setActionError('رمز غرفة المباراة الأونلاين غير متوفر للاستكمال.');
      return;
    }

    try {
      onResumeMatch(match);
    } catch (err: any) {
      console.error('Failed to resume match:', err);
      setActionError('تعذر استكمال المباراة. يرجى إعادة المحاولة.');
    }
  };

  // Accurate overall counts
  const totalCount = matches.length;
  const localCount = useMemo(
    () => matches.filter((m) => (m.mode || 'local') === 'local').length,
    [matches]
  );
  const onlineCount = useMemo(
    () => matches.filter((m) => m.mode === 'online').length,
    [matches]
  );
  const completedCount = useMemo(
    () => matches.filter((m) => m.status === 'completed').length,
    [matches]
  );
  const inProgressCount = useMemo(
    () => matches.filter((m) => m.status === 'in_progress').length,
    [matches]
  );

  // Composite Multi-Filter Logic (Mode + Status + Search working together simultaneously)
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // 1. Mode Filter
      const actualMode = m.mode || (m.roomCode ? 'online' : 'local');
      if (modeFilter !== 'all' && actualMode !== modeFilter) {
        return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'all' && m.status !== statusFilter) {
        return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const titleMatch = (m.matchTitle || '').toLowerCase().includes(q);
        const roomMatch = (m.roomCode || '').toLowerCase().includes(q);
        const teamsMatch = (m.teams || []).some((t) =>
          (t.name || '').toLowerCase().includes(q)
        );
        const categoriesMatch = (m.selectedSubcategories || []).some((cat) =>
          String(cat || '').toLowerCase().includes(q)
        );
        if (!titleMatch && !roomMatch && !teamsMatch && !categoriesMatch) {
          return false;
        }
      }

      return true;
    });
  }, [matches, modeFilter, statusFilter, searchQuery]);

  const hasActiveFilters =
    modeFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setModeFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  // Not signed in state
  if (!user) {
    return (
      <div className="max-w-[700px] mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center mx-auto">
          <Trophy className="w-8 h-8 text-[#F07842]" />
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-bold text-[#252824]">
            سجل مبارياتي
          </h1>
          <p className="text-sm text-[#777B73] max-w-md mx-auto">
            سجّل دخولك لمشاهدة سجل جميع مبارياتك المحلية والأونلاين، ومتابعة المباريات غير المكتملة في أي وقت ومن أي جهاز.
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-8 py-3.5 rounded-2xl bg-[#14543D] text-[#FFFFFF] text-sm font-bold hover:bg-[#0E3D2C] cursor-pointer shadow-sm transition-all"
          >
            تسجيل الدخول / إنشاء حساب
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1040px] mx-auto px-4 py-8 md:py-12 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#777B73]">
            <span>حساب اللاعب</span>
            <span>•</span>
            <span className="font-bold text-[#14543D]">{user.displayName || user.email}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
            سجل مبارياتي
          </h1>
          <p className="text-xs sm:text-sm text-[#777B73] mt-1">
            سجل شامل يجمع مبارياتك المحلية (على نفس الجهاز) والمباريات الأونلاين (عن بُعد) مع إمكانية استكمال أي مباراة في أي وقت.
          </p>
        </div>

        <button
          type="button"
          onClick={onNavigateHome}
          className="px-4 py-2 text-xs font-bold text-[#777B73] hover:text-[#252824] bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl hover:bg-[#F3F5E9] transition-colors cursor-pointer"
        >
          العودة للرئيسية
        </button>
      </div>

      {/* Error alert if any */}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-500 hover:text-rose-700 text-xs font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Interactive Stats Dashboard with Recharts */}
      <UserMatchesStats matches={matches} />

      {/* Multi-Filter Controls Section */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#252824]">
            <Filter className="w-4 h-4 text-[#14543D]" />
            <span>تصفية وبحث المباريات</span>
            <span className="text-[11px] font-normal text-[#777B73]">
              (يتم تطبيق الفلاتر والبحث معاً)
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 text-xs text-[#F07842] hover:text-[#d45e2a] font-bold cursor-pointer self-start sm:self-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة تعيين الفلاتر</span>
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث باسم الفريق، عنوان المباراة، الفئات المختارة، أو رمز الغرفة..."
            className="w-full pr-10 pl-9 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 text-xs sm:text-sm text-[#252824] placeholder:text-[#777B73] focus:outline-none focus:border-[#14543D] focus:bg-[#FFFFFF] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777B73] hover:text-[#252824] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dual Axis Filters Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          {/* Axis 1: Mode Filter (نوع المباراة) */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#777B73] block">
              نوع المباراة:
            </span>
            <div className="grid grid-cols-3 gap-1.5 bg-[#F3F5E9] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setModeFilter('all')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  modeFilter === 'all'
                    ? 'bg-[#FFFFFF] text-[#14543D] shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>الكل ({totalCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setModeFilter('local')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  modeFilter === 'local'
                    ? 'bg-[#FFFFFF] text-[#14543D] shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-[#14543D]" />
                <span>محلية ({localCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setModeFilter('online')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  modeFilter === 'online'
                    ? 'bg-[#FFFFFF] text-[#F07842] shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-[#F07842]" />
                <span>أونلاين ({onlineCount})</span>
              </button>
            </div>
          </div>

          {/* Axis 2: Status Filter (حالة المباراة) */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-[#777B73] block">
              حالة المباراة:
            </span>
            <div className="grid grid-cols-3 gap-1.5 bg-[#F3F5E9] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-[#FFFFFF] text-[#14543D] shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <span>جميع الحالات</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'completed'
                    ? 'bg-[#FFFFFF] text-emerald-700 shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>مكتملة ({completedCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('in_progress')}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'in_progress'
                    ? 'bg-[#FFFFFF] text-amber-700 shadow-xs'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>غير مكتملة ({inProgressCount})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Active Results Summary */}
        <div className="flex items-center justify-between text-xs text-[#777B73] pt-1">
          <div>
            يتم عرض{' '}
            <span className="font-bold text-[#252824]">{filteredMatches.length}</span> من
            أصل <span className="font-bold text-[#252824]">{matches.length}</span> مباراة
          </div>
          {hasActiveFilters && (
            <div className="text-[11px] text-[#14543D] font-bold">
              فلاتر مطبقة: {modeFilter !== 'all' ? (modeFilter === 'local' ? 'محلية' : 'أونلاين') : ''}
              {modeFilter !== 'all' && statusFilter !== 'all' ? ' + ' : ''}
              {statusFilter !== 'all' ? (statusFilter === 'completed' ? 'مكتملة' : 'غير مكتملة') : ''}
              {searchQuery.trim() ? ` (بحث: "${searchQuery}")` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#14543D] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-[#777B73]">جاري تحميل سجل المباريات...</p>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F3F5E9] text-[#777B73] flex items-center justify-center mx-auto">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-lg font-bold text-[#252824]">
              لا توجد مباريات تطابق الفلاتر المحددة
            </h3>
            <p className="text-xs text-[#777B73] max-w-md mx-auto">
              {hasActiveFilters
                ? 'جرّب تغيير خيارات التصفية أو البحث للعثور على المباريات التي تبحث عنها.'
                : 'ابدأ مباراة جديدة محلياً أو أونلاين وستظهر هنا تلقائياً.'}
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-6 py-2.5 rounded-xl bg-[#14543D] text-[#FFFFFF] text-xs font-bold hover:bg-[#0E3D2C] cursor-pointer"
            >
              عرض جميع المباريات
            </button>
          ) : (
            <button
              type="button"
              onClick={onNavigateHome}
              className="px-6 py-2.5 rounded-xl bg-[#14543D] text-[#FFFFFF] text-xs font-bold hover:bg-[#0E3D2C] cursor-pointer"
            >
              بدء مباراة جديدة
            </button>
          )}
        </div>
      ) : (
        /* Matches List Grid */
        <div className="space-y-4">
          {filteredMatches.map((m) => {
            const isInProgress = m.status === 'in_progress';
            const isCompleted = m.status === 'completed';
            const isOnline = m.mode === 'online';

            let dateLabel = 'بتاريخ سابق';
            try {
              if (m.updatedAt?.toDate) {
                dateLabel = m.updatedAt.toDate().toLocaleDateString('ar-SA', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } else if (m.updatedAt) {
                dateLabel = new Date(m.updatedAt).toLocaleDateString('ar-SA', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              } else if (m.createdAt?.toDate) {
                dateLabel = m.createdAt.toDate().toLocaleDateString('ar-SA', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }
            } catch {
              // fallback
            }

            const matchTitle =
              m.matchTitle ||
              (m.teams?.length >= 2
                ? `${m.teams[0].name} ضد ${m.teams[1].name}`
                : isOnline
                ? 'مباراة نِزال أونلاين'
                : 'مباراة نِزال محلية');

            const shortCode = m.roomCode
              ? `#${m.roomCode}`
              : `#${m.id.replace('match_', '').replace('session-', '').slice(0, 8).toUpperCase()}`;

            const categoriesList = m.selectedSubcategories || [];

            return (
              <div
                key={m.id}
                className={`bg-[#FFFFFF] border-2 rounded-2xl p-5 md:p-6 space-y-4 transition-all shadow-xs ${
                  isInProgress
                    ? 'border-[#14543D]/40 bg-[#F3F5E9]/20'
                    : 'border-[#E5E8DD]'
                }`}
              >
                {/* Match Card Top Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-display font-bold text-base text-[#252824]">
                        {matchTitle}
                      </h3>
                      <span className="font-mono text-xs text-[#777B73] bg-[#F3F5E9] px-2 py-0.5 rounded-md font-bold">
                        {shortCode}
                      </span>

                      {/* Prominent Mode Badge */}
                      {isOnline ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-[#F07842] border border-[#F07842]/30">
                          <Radio className="w-3.5 h-3.5 text-[#F07842] animate-pulse" />
                          <span>مباراة أونلاين (عن بُعد)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/25">
                          <Users className="w-3.5 h-3.5 text-[#14543D]" />
                          <span>مباراة محلية (نفس الجهاز)</span>
                        </span>
                      )}

                      {/* Status Badge */}
                      {isInProgress ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          <Clock className="w-3.5 h-3.5" />
                          <span>غير مكتملة</span>
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>مكتملة</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700">
                          <span>متوقفة</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#777B73]">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{dateLabel}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={deletingId === m.id}
                    onClick={() => handleDelete(m.id)}
                    title="حذف من السجل"
                    className="text-rose-500 hover:text-rose-700 p-2 rounded-xl hover:bg-rose-50 cursor-pointer transition-colors self-end sm:self-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Teams & Scores Grid */}
                {Array.isArray(m.teams) && m.teams.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {m.teams.map((t) => {
                      const isWinner = isCompleted && m.winnerTeamName === t.name;
                      return (
                        <div
                          key={t.id}
                          className={`p-3 rounded-xl border flex items-center justify-between ${
                            isWinner
                              ? 'bg-[#EAF2EE] border-[#14543D]/30 shadow-xs ring-1 ring-[#14543D]/20'
                              : 'bg-[#FFFFFF] border-[#E5E8DD]'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className="w-3.5 h-3.5 rounded-full shrink-0"
                              style={{ backgroundColor: t.color }}
                            />
                            <div className="truncate">
                              <span className="text-xs font-bold text-[#252824] truncate block">
                                {t.name}
                              </span>
                              {isWinner && (
                                <span className="text-[10px] text-[#14543D] font-bold flex items-center gap-1">
                                  <Award className="w-3 h-3 text-[#F07842]" />
                                  <span>الفائز</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-base font-bold text-[#14543D] mr-2">
                            {t.score ?? 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Selected Categories Tags */}
                {categoriesList.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-[#777B73] font-medium">
                      <Layers className="w-3.5 h-3.5 text-[#14543D]" />
                      <span>التصنيفات المختارة ({categoriesList.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {categoriesList.map((catName, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[11px] font-bold text-[#252824]"
                        >
                          {catName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Card Bottom Row: Winner / Questions info and Resume Button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-[#E5E8DD]">
                  <div className="text-xs text-[#777B73]">
                    {isCompleted && m.winnerTeamName ? (
                      <span className="font-bold text-[#14543D] flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-[#F07842]" />
                        <span>
                          الفريق الفائز: {m.winnerTeamName} بنتيجة {m.winnerScore ?? 0} نقطة
                        </span>
                      </span>
                    ) : (
                      <span>
                        تمت الإجابة عن {m.usedTileKeys?.length || m.totalQuestionsPlayed || 0} أسئلة حتى الآن
                      </span>
                    )}
                  </div>

                  {isInProgress && (
                    <button
                      type="button"
                      onClick={() => handleResume(m)}
                      className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-[#FFFFFF] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95 touch-manipulation ${
                        isOnline
                          ? 'bg-[#F07842] hover:bg-[#d45e2a]'
                          : 'bg-[#14543D] hover:bg-[#0E3D2C]'
                      }`}
                    >
                      {isOnline ? (
                        <>
                          <Radio className="w-4 h-4 text-white" />
                          <span>العودة لغرفة الأونلاين ◀</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 text-[#F07842] fill-current" />
                          <span>استكمال المباراة المحلية ◀</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
