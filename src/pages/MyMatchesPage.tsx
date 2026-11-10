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
} from 'lucide-react';
import { UserGameMatch } from '../types/match';
import {
  deleteMatchRecord,
  fetchAllMatchesForUser,
} from '../services/matchService';

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

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAllMatchesForUser(user.uid)
      .then((data) => setMatches(data))
      .catch((err) => console.error('Failed to load user matches:', err))
      .finally(() => setLoading(false));
  }, [user]);

  const handleDelete = async (matchId: string) => {
    if (!user) return;
    if (!window.confirm('هل أنت متأكد من حذف سجل هذه المباراة؟')) return;

    setDeletingId(matchId);
    try {
      await deleteMatchRecord(matchId, user.uid);
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } finally {
      setDeletingId(null);
    }
  };

  const filteredMatches = matches.filter((m) => {
    if (filter === 'in_progress') return m.status === 'in_progress';
    if (filter === 'completed') return m.status === 'completed';
    return true;
  });

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
            سجّل دخولك لمشاهدة سجل جميع مبارياتك السابقة ومتابعة المباريات غير المكتملة في أي وقت.
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
    <div className="max-w-[1000px] mx-auto px-4 py-8 md:py-12 space-y-8">
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
        </div>

        <button
          type="button"
          onClick={onNavigateHome}
          className="px-4 py-2 text-xs font-bold text-[#777B73] hover:text-[#252824] bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl hover:bg-[#F3F5E9] transition-colors cursor-pointer"
        >
          العودة للرئيسية
        </button>
      </div>

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
          onClick={() => setFilter('in_progress')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            filter === 'in_progress'
              ? 'bg-[#14543D] text-[#FFFFFF]'
              : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
          }`}
        >
          غير مكتملة ({matches.filter((m) => m.status === 'in_progress').length})
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
          مكتملة ({matches.filter((m) => m.status === 'completed').length})
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
              لا توجد مباريات مسجلة
            </h3>
            <p className="text-xs text-[#777B73]">
              {filter === 'in_progress'
                ? 'لا توجد مباريات غير مكتملة حالياً.'
                : filter === 'completed'
                ? 'لم تكمل أي مباراة بعد. العب الآن واحسم التحدي!'
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
              }
            } catch {
              // fallback
            }

            return (
              <div
                key={m.id}
                className={`bg-[#FFFFFF] border-2 rounded-2xl p-5 md:p-6 space-y-4 transition-all shadow-xs ${
                  isInProgress
                    ? 'border-[#14543D]/40 bg-[#F3F5E9]/30'
                    : 'border-[#E5E8DD]'
                }`}
              >
                {/* Match Card Top Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-3">
                  <div className="flex items-center gap-2.5">
                    {/* Status Badge */}
                    {isInProgress ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        <Clock className="w-3.5 h-3.5 animate-spin" />
                        <span>غير مكتملة (جارية)</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مكتملة</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 text-zinc-700">
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

                  <div className="flex items-center gap-3 text-xs text-[#777B73]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{dateLabel}</span>
                    </span>
                    <button
                      type="button"
                      disabled={deletingId === m.id}
                      onClick={() => handleDelete(m.id)}
                      title="حذف من السجل"
                      className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Teams & Scores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {m.teams.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: t.color }}
                        />
                        <span className="text-xs font-bold text-[#252824] truncate">
                          {t.name}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#14543D]">
                        {t.score}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Card Bottom Row: Winner info or Resume Button */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                  <div className="text-xs text-[#777B73]">
                    {isCompleted && m.winnerTeamName ? (
                      <span className="font-bold text-[#14543D] flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-[#F07842]" />
                        <span>الفائز: {m.winnerTeamName} ({m.winnerScore} نقطة)</span>
                      </span>
                    ) : (
                      <span>{m.usedTileKeys?.length || 0} أسئلة ملعوبة حتى الآن</span>
                    )}
                  </div>

                  {isInProgress && (
                    <button
                      type="button"
                      onClick={() => onResumeMatch(m)}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-[#FFFFFF] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95"
                    >
                      <Play className="w-4 h-4 text-[#F07842]" />
                      <span>متابعة المباراة ◀</span>
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
