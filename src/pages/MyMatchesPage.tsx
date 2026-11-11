import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  Trophy,
  Clock,
  Play,
  RotateCcw,
  Trash2,
  Calendar,
  Layers,
  Users,
  CheckCircle2,
  AlertCircle,
  Radio,
  ArrowRight,
  Sparkles,
  Award,
} from 'lucide-react';
import { UserGameMatch } from '../types/match';
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
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>('all');
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
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف سجل هذه المباراة؟')) return;

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
    if (!match || !Array.isArray(match.teams) || match.teams.length < 2) {
      setActionError('بيانات هذه المباراة غير مكتملة أو غير قابلة للاستعادة.');
      return;
    }
    try {
      onResumeMatch(match);
    } catch (err: any) {
      console.error('Failed to resume match:', err);
      setActionError('تعذر استكمال المباراة. يرجى إعادة المحاولة.');
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (filter === 'in_progress') return m.status === 'in_progress';
    if (filter === 'completed') return m.status === 'completed';
    return true;
  });

  // Calculate quick stats
  const totalCount = matches.length;
  const completedCount = matches.filter((m) => m.status === 'completed').length;
  const inProgressCount = matches.filter((m) => m.status === 'in_progress').length;
  const highestScore = matches.reduce((max, m) => {
    const matchMax = (m.teams || []).reduce((tMax, t) => Math.max(tMax, t.score || 0), 0);
    return Math.max(max, matchMax);
  }, 0);

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
            سجّل دخولك لمشاهدة سجل جميع مبارياتك السابقة، ومتابعة المباريات غير المكتملة في أي وقت ومن أي جهاز.
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
            سجل كامل بجميع مبارياتك المكتملة وغير المكتملة مع إمكانية استكمال أي مباراة في أي وقت.
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

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E5E8DD] pb-2">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-[#14543D] text-[#FFFFFF]'
              : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
          }`}
        >
          الكل ({matches.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('completed')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'completed'
              ? 'bg-[#14543D] text-[#FFFFFF]'
              : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
          }`}
        >
          مكتملة ({completedCount})
        </button>
        <button
          type="button"
          onClick={() => setFilter('in_progress')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'in_progress'
              ? 'bg-[#14543D] text-[#FFFFFF]'
              : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
          }`}
        >
          غير مكتملة ({inProgressCount})
        </button>
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
              لا توجد مباريات في هذه الفئة
            </h3>
            <p className="text-xs text-[#777B73]">
              {filter === 'in_progress'
                ? 'لا توجد مباريات غير مكتملة حالياً. يمكنك بدء مباراة جديدة الآن!'
                : filter === 'completed'
                ? 'لم تكمل أي مباراة بعد. اكمل مباراتك لتحسم المنافسة!'
                : 'ابدأ مباراة جديدة محلياً أو أونلاين وستظهر هنا تلقائياً.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-6 py-2.5 rounded-xl bg-[#14543D] text-[#FFFFFF] text-xs font-bold hover:bg-[#0E3D2C] cursor-pointer"
          >
            بدء مباراة جديدة
          </button>
        </div>
      ) : (
        /* Matches List Grid */
        <div className="space-y-4">
          {filteredMatches.map((m) => {
            const isInProgress = m.status === 'in_progress';
            const isCompleted = m.status === 'completed';

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
                : 'مباراة نِزال');

            const shortCode = m.roomCode
              ? `#${m.roomCode}`
              : `#${m.id.replace('match_', '').slice(0, 8).toUpperCase()}`;

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

                      {/* Mode Badge */}
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#F3F5E9] text-[#777B73]">
                        {m.mode === 'online' ? (
                          <>
                            <Radio className="w-3 h-3 text-[#F07842]" />
                            <span>أونلاين</span>
                          </>
                        ) : (
                          <>
                            <Users className="w-3 h-3 text-[#14543D]" />
                            <span>لعب محلي</span>
                          </>
                        )}
                      </span>
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
                          {t.score}
                        </span>
                      </div>
                    );
                  })}
                </div>

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
                          الفريق الفائز: {m.winnerTeamName} بنتيجة {m.winnerScore} نقطة
                        </span>
                      </span>
                    ) : (
                      <span>
                        تمت الإجابة عن {m.usedTileKeys?.length || 0} أسئلة حتى الآن
                      </span>
                    )}
                  </div>

                  {isInProgress && (
                    <button
                      type="button"
                      onClick={() => handleResume(m)}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] active:scale-95 text-[#FFFFFF] text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform touch-manipulation"
                    >
                      <Play className="w-4 h-4 text-[#F07842] fill-current" />
                      <span>استكمال المباراة ◀</span>
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
