import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Eye,
  Filter,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  QuestionDedupSettings,
  SeenQuestionRecord,
  SubcategoryItem,
  TriviaQuestion,
} from '../types/game';
import {
  AdminUserProfile,
  fetchAllUsersMapForAdmin,
} from '../services/adminAnalyticsService';
import {
  fetchAllSeenQuestionsForAdmin,
  resetUserSeenQuestionsByAdmin,
  saveQuestionDedupSettingsToFirestore,
} from '../services/seenQuestionsService';
import {
  computeSubcategoryDedupStats,
  DEFAULT_QUESTION_DEDUP_SETTINGS,
  normalizeSeenQuestionId,
} from '../utils/questionDedupLogic';

interface AdminSeenQuestionsSectionProps {
  adminUid: string;
  isAdmin: boolean;
  questions: TriviaQuestion[];
  subcategories: SubcategoryItem[];
  questionDedupSettings?: QuestionDedupSettings;
  onRefreshQuestionDedupSettings: () => Promise<void>;
}

interface UserSeenSummaryRow {
  uid: string;
  displayName: string;
  email: string;
  seenUniqueCount: number;
  totalAppearances: number;
  categoriesTouchedCount: number;
  lastSeenAtMs: number;
  seenQuestionIds: Set<string>;
}

interface TopQuestionAppearanceRow {
  questionId: string;
  questionText: string;
  category: string;
  points: number;
  totalAppearances: number;
  uniqueUsersCount: number;
  lastSeenAtMs: number;
}

function formatDateTimeAr(ms: number): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const AdminSeenQuestionsSection: React.FC<
  AdminSeenQuestionsSectionProps
> = ({
  adminUid,
  isAdmin,
  questions,
  subcategories,
  questionDedupSettings = DEFAULT_QUESTION_DEDUP_SETTINGS,
  onRefreshQuestionDedupSettings,
}) => {
  // Settings form state
  const [allowRepeatAfterExhaustion, setAllowRepeatAfterExhaustion] =
    useState<boolean>(questionDedupSettings.allowRepeatAfterExhaustion);
  const [trackSpectators, setTrackSpectators] = useState<boolean>(
    questionDedupSettings.trackSpectators
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Analytics & records state
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [seenRecords, setSeenRecords] = useState<SeenQuestionRecord[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, AdminUserProfile>>(
    new Map()
  );

  // Filters & inspection state
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserIdForBreakdown, setSelectedUserIdForBreakdown] =
    useState<string>('global');
  const [categorySearch, setCategorySearch] = useState('');
  const [topQuestionSearch, setTopQuestionSearch] = useState('');

  // Admin reset confirmation modal state
  const [resetTargetUser, setResetTargetUser] =
    useState<UserSeenSummaryRow | null>(null);
  const [resettingUser, setResettingUser] = useState(false);

  useEffect(() => {
    setAllowRepeatAfterExhaustion(
      Boolean(questionDedupSettings.allowRepeatAfterExhaustion)
    );
    setTrackSpectators(Boolean(questionDedupSettings.trackSpectators));
  }, [questionDedupSettings]);

  const loadSeenAnalytics = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [records, uMap] = await Promise.all([
        fetchAllSeenQuestionsForAdmin(),
        fetchAllUsersMapForAdmin(),
      ]);
      setSeenRecords(records);
      setUsersMap(uMap);
    } catch (err) {
      console.error('Failed to load seen question analytics:', err);
      setLoadError('تعذر تحميل سجل الأسئلة المشاهدة من قاعدة البيانات.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadSeenAnalytics();
  }, [loadSeenAnalytics]);

  const approvedQuestions = useMemo(
    () => questions.filter((q) => q.status !== 'rejected'),
    [questions]
  );

  // Question lookup map by both raw ID and normalized ID
  const questionLookupMap = useMemo(() => {
    const map = new Map<string, TriviaQuestion>();
    for (const q of questions) {
      map.set(q.id, q);
      map.set(normalizeSeenQuestionId(q.id), q);
    }
    return map;
  }, [questions]);

  // Aggregate per-user seen question summaries
  const userRows = useMemo<UserSeenSummaryRow[]>(() => {
    const grouped = new Map<
      string,
      {
        seenIds: Set<string>;
        totalAppearances: number;
        categories: Set<string>;
        lastSeenAtMs: number;
      }
    >();

    for (const rec of seenRecords) {
      if (!rec.userId) continue;
      let bucket = grouped.get(rec.userId);
      if (!bucket) {
        bucket = {
          seenIds: new Set<string>(),
          totalAppearances: 0,
          categories: new Set<string>(),
          lastSeenAtMs: 0,
        };
        grouped.set(rec.userId, bucket);
      }
      bucket.seenIds.add(rec.questionId);
      bucket.seenIds.add(normalizeSeenQuestionId(rec.questionId));
      bucket.totalAppearances += rec.seenCount || 1;
      if (rec.category) bucket.categories.add(rec.category);
      if (rec.lastSeenAtMs > bucket.lastSeenAtMs) {
        bucket.lastSeenAtMs = rec.lastSeenAtMs;
      }
    }

    // Merge registered users from /users even if 0 seen questions so admin sees full player roster
    const allUids = new Set<string>([
      ...Array.from(usersMap.keys()),
      ...Array.from(grouped.keys()),
    ]);

    const rows: UserSeenSummaryRow[] = [];
    for (const uid of allUids) {
      const profile = usersMap.get(uid);
      const stats = grouped.get(uid);
      const uniqueCount = stats
        ? new Set(
            seenRecords
              .filter((r) => r.userId === uid)
              .map((r) => r.questionId)
          ).size
        : 0;

      rows.push({
        uid,
        displayName:
          profile?.displayName?.trim() ||
          profile?.email?.split('@')[0] ||
          `لاعب (${uid.slice(0, 6)})`,
        email: profile?.email || '—',
        seenUniqueCount: uniqueCount,
        totalAppearances: stats?.totalAppearances || 0,
        categoriesTouchedCount: stats?.categories.size || 0,
        lastSeenAtMs: stats?.lastSeenAtMs || 0,
        seenQuestionIds: stats?.seenIds || new Set<string>(),
      });
    }

    return rows.sort((a, b) => {
      if (b.seenUniqueCount !== a.seenUniqueCount) {
        return b.seenUniqueCount - a.seenUniqueCount;
      }
      return b.lastSeenAtMs - a.lastSeenAtMs;
    });
  }, [seenRecords, usersMap]);

  const filteredUserRows = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return userRows;
    return userRows.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [userRows, userSearch]);

  const selectedUserRow = useMemo(() => {
    if (selectedUserIdForBreakdown === 'global') return null;
    return (
      userRows.find((u) => u.uid === selectedUserIdForBreakdown) || null
    );
  }, [selectedUserIdForBreakdown, userRows]);

  // Global union of seen question IDs (if viewing global) or specific user's seen IDs
  const breakdownSeenSet = useMemo(() => {
    if (selectedUserRow) return selectedUserRow.seenQuestionIds;
    const union = new Set<string>();
    for (const r of seenRecords) {
      union.add(r.questionId);
      union.add(normalizeSeenQuestionId(r.questionId));
    }
    return union;
  }, [selectedUserRow, seenRecords]);

  // Remaining unseen questions per subcategory
  const subcategoryBreakdown = useMemo(() => {
    const activeSubs = subcategories.filter((s) => !s.isDeleted);
    const stats = computeSubcategoryDedupStats({
      approvedQuestions,
      subcategories: activeSubs,
      seenQuestionIds: breakdownSeenSet,
    });

    const search = categorySearch.trim().toLowerCase();
    const filtered = search
      ? stats.filter(
          (s) =>
            s.subcategoryName.toLowerCase().includes(search) ||
            s.mainCategory.toLowerCase().includes(search)
        )
      : stats;

    return filtered.sort((a, b) => a.remainingUnseen - b.remainingUnseen);
  }, [subcategories, approvedQuestions, breakdownSeenSet, categorySearch]);

  // Top most frequently appeared questions across all players
  const topAppearedQuestions = useMemo<TopQuestionAppearanceRow[]>(() => {
    const map = new Map<
      string,
      {
        questionId: string;
        category: string;
        totalAppearances: number;
        users: Set<string>;
        lastSeenAtMs: number;
      }
    >();

    for (const rec of seenRecords) {
      const key = rec.questionId;
      let entry = map.get(key);
      if (!entry) {
        entry = {
          questionId: key,
          category: rec.category || 'عام',
          totalAppearances: 0,
          users: new Set<string>(),
          lastSeenAtMs: 0,
        };
        map.set(key, entry);
      }
      entry.totalAppearances += rec.seenCount || 1;
      if (rec.userId) entry.users.add(rec.userId);
      if (rec.lastSeenAtMs > entry.lastSeenAtMs) {
        entry.lastSeenAtMs = rec.lastSeenAtMs;
      }
    }

    const list: TopQuestionAppearanceRow[] = [];
    for (const entry of map.values()) {
      const qObj = questionLookupMap.get(entry.questionId);
      list.push({
        questionId: entry.questionId,
        questionText:
          qObj?.questionText || `سؤال (${entry.questionId})`,
        category: qObj?.category || entry.category,
        points: qObj?.points || 100,
        totalAppearances: entry.totalAppearances,
        uniqueUsersCount: entry.users.size,
        lastSeenAtMs: entry.lastSeenAtMs,
      });
    }

    const search = topQuestionSearch.trim().toLowerCase();
    const filtered = search
      ? list.filter(
          (item) =>
            item.questionText.toLowerCase().includes(search) ||
            item.category.toLowerCase().includes(search) ||
            item.questionId.toLowerCase().includes(search)
        )
      : list;

    return filtered
      .sort((a, b) => {
        if (b.totalAppearances !== a.totalAppearances) {
          return b.totalAppearances - a.totalAppearances;
        }
        return b.uniqueUsersCount - a.uniqueUsersCount;
      })
      .slice(0, 30);
  }, [seenRecords, questionLookupMap, topQuestionSearch]);

  const totalUniquePlayersWithHistory = useMemo(() => {
    const uids = new Set(seenRecords.map((r) => r.userId).filter(Boolean));
    return uids.size;
  }, [seenRecords]);

  const totalUniqueQuestionsShown = useMemo(() => {
    const qIds = new Set(seenRecords.map((r) => r.questionId).filter(Boolean));
    return qIds.size;
  }, [seenRecords]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUid) return;
    setSavingSettings(true);
    setStatusMessage(null);
    try {
      await saveQuestionDedupSettingsToFirestore(
        {
          allowRepeatAfterExhaustion,
          trackSpectators,
        },
        adminUid
      );
      await onRefreshQuestionDedupSettings();
      setStatusMessage(
        'تم حفظ إعدادات منع تكرار الأسئلة بنجاح وتطبيقها على المنصة.'
      );
    } catch (err) {
      setStatusMessage(
        `تعذر حفظ الإعدادات: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleConfirmResetUser = async () => {
    if (!resetTargetUser || resettingUser) return;
    setResettingUser(true);
    setStatusMessage(null);
    try {
      const deletedCount = await resetUserSeenQuestionsByAdmin(
        resetTargetUser.uid
      );
      setStatusMessage(
        `تم تصفير سجل الأسئلة المشاهدة للاعب «${resetTargetUser.displayName}» (${deletedCount} سجل).`
      );
      setResetTargetUser(null);
      await loadSeenAnalytics();
    } catch (err) {
      setStatusMessage(
        `تعذر تصفير سجل اللاعب: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setResettingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-[#252824]">
            منع تكرار الأسئلة وسجل المشاهدات
          </h2>
          <p className="text-xs text-[#777B73] leading-relaxed">
            يتابع النظام الأسئلة التي ظهرت فعلياً لكل حساب مستخدم (UID) بشكل دائم، ويستبعدها في المباريات القادمة المحلية والأونلاين، مع تحكم كامل للإدارة في حالة نفاد الأسئلة.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSeenAnalytics}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] hover:bg-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث السجلات</span>
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="bg-[#EAF2EE] border border-[#14543D]/30 rounded-xl px-5 py-3.5 flex items-center justify-between gap-3 text-xs font-semibold text-[#14543D]"
        >
          <span>{statusMessage}</span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-[#14543D]/70 hover:text-[#14543D] cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {loadError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-3.5 text-xs font-semibold text-rose-800">
          {loadError}
        </div>
      )}

      {/* 1. Admin Settings Form */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-5 text-xs"
      >
        <div className="border-b border-[#E5E8DD] pb-3">
          <h3 className="font-display text-base font-bold text-[#252824]">
            إعدادات التعامل عند انتهاء الأسئلة والمشاهدين
          </h3>
          <p className="text-xs text-[#777B73] mt-0.5">
            تُطبق هذه الإعدادات فوراً على جميع المباريات دون مسح سجل أي لاعب.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-display text-sm font-bold text-[#252824]">
                إعادة الأسئلة القديمة بعد انتهاء الجديدة
              </div>
              <p className="text-[11px] text-[#777B73] leading-relaxed">
                عند التعطيل (الافتراضي): تظهر رسالة «خلصت الأسئلة الجديدة في هذي الفئة» ولا يتكرر أي سؤال. عند التفعيل: يُسمح بعرض أسئلة سابقة فقط بعد نفاد كل الأسئلة الجديدة.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAllowRepeatAfterExhaustion((v) => !v)}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors shrink-0 cursor-pointer whitespace-nowrap ${
                allowRepeatAfterExhaustion
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#FFFFFF] text-[#777B73] border border-[#E5E8DD]'
              }`}
            >
              {allowRepeatAfterExhaustion ? 'مسموح بعد النفاد' : 'ممنوع تماماً'}
            </button>
          </div>

          <div className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-display text-sm font-bold text-[#252824]">
                تسجيل الأسئلة للمشاهدين (أونلاين)
              </div>
              <p className="text-[11px] text-[#777B73] leading-relaxed">
                عند التعطيل (الافتراضي): لا تُحتسب الأسئلة في سجل المشاهدين الذين دخلوا للمتابعة فقط. عند التفعيل: تُسجل الأسئلة المعروضة للمشاهدين المسجلين أيضاً.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTrackSpectators((v) => !v)}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors shrink-0 cursor-pointer whitespace-nowrap ${
                trackSpectators
                  ? 'bg-[#14543D] text-white'
                  : 'bg-[#FFFFFF] text-[#777B73] border border-[#E5E8DD]'
              }`}
            >
              {trackSpectators ? 'احتساب المشاهدين' : 'استبعاد المشاهدين'}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingSettings}
            className="px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>
              {savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات منع التكرار'}
            </span>
          </button>
        </div>
      </form>

      {/* 2. Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-1">
          <div className="text-xs text-[#777B73] flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#14543D]" />
            <span>إجمالي الأسئلة المعتمدة</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {approvedQuestions.length}
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-1">
          <div className="text-xs text-[#777B73] flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-[#F07842]" />
            <span>سجلات المشاهدة الفريدة</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {seenRecords.length}
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-1">
          <div className="text-xs text-[#777B73] flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#14543D]" />
            <span>حسابات لديها سجل</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {totalUniquePlayersWithHistory}
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-1">
          <div className="text-xs text-[#777B73] flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#F07842]" />
            <span>أسئلة ظهرت للاعبين</span>
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
            {totalUniqueQuestionsShown}
          </div>
        </div>
      </div>

      {/* 3. Per-User Seen History & Admin Reset */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-0.5">
            <h3 className="font-display text-base font-bold text-[#252824]">
              سجل الأسئلة المشاهدة لكل مستخدم
            </h3>
            <p className="text-xs text-[#777B73]">
              مربوط بمعرّف الحساب (UID). يمكنك استعراض المتبقي لكل لاعب أو تصفير سجله بعد التأكيد.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-[#777B73] absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد أو UID..."
              className="w-full pr-9 pl-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824]"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-[#777B73]">
            جاري تحميل سجل المستخدمين...
          </div>
        ) : filteredUserRows.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#777B73]">
            لا توجد حسابات مطابقة لبحثك.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-2.5 px-3 font-bold">المستخدم</th>
                  <th className="py-2.5 px-3 font-bold">الأسئلة المشاهدة</th>
                  <th className="py-2.5 px-3 font-bold">إجمالي مرات الظهور</th>
                  <th className="py-2.5 px-3 font-bold">الفئات المستكشفة</th>
                  <th className="py-2.5 px-3 font-bold">آخر ظهور</th>
                  <th className="py-2.5 px-3 font-bold">إجراءات الإدارة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {filteredUserRows.slice(0, 40).map((u) => (
                  <tr key={u.uid} className="hover:bg-[#F3F5E9]/40">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-[#252824]">
                        {u.displayName}
                      </div>
                      <div className="text-[11px] text-[#777B73]">
                        {u.email} · <span className="font-mono">{u.uid.slice(0, 10)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#14543D]">
                      {u.seenUniqueCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#252824]">
                      {u.totalAppearances}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                      {u.categoriesTouchedCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                      {formatDateTimeAr(u.lastSeenAtMs)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedUserIdForBreakdown(u.uid)}
                          className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors whitespace-nowrap ${
                            selectedUserIdForBreakdown === u.uid
                              ? 'bg-[#14543D] text-white border-[#14543D]'
                              : 'bg-[#FFFFFF] text-[#14543D] border-[#E5E8DD] hover:bg-[#EAF2EE]'
                          }`}
                        >
                          المتبقي بالفئات
                        </button>
                        <button
                          type="button"
                          disabled={u.seenUniqueCount === 0}
                          onClick={() => setResetTargetUser(u)}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>تصفير السجل</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Remaining Unseen Questions per Category */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-0.5">
            <h3 className="font-display text-base font-bold text-[#252824]">
              الأسئلة المتبقية في كل فئة
            </h3>
            <p className="text-xs text-[#777B73]">
              {selectedUserRow
                ? `يعرض المتبقي لحساب: ${selectedUserRow.displayName} (${selectedUserRow.email})`
                : 'يعرض إجمالي الأسئلة التي لم يشاهدها أي لاعب بعد (أو اختر لاعباً محدداً للمقارنة).'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#777B73]" />
              <select
                value={selectedUserIdForBreakdown}
                onChange={(e) => setSelectedUserIdForBreakdown(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-bold text-[#252824]"
              >
                <option value="global">النظرة العامة (جميع اللاعبين)</option>
                {userRows.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({u.seenUniqueCount} مشاهد)
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#777B73] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="تصفية الفئات..."
                className="pr-8 pl-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824]"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-[#F3F5E9] z-10">
              <tr className="text-[#777B73] border-b border-[#E5E8DD]">
                <th className="py-2.5 px-3 font-bold">الفئة الفرعية</th>
                <th className="py-2.5 px-3 font-bold">الفئة الرئيسية</th>
                <th className="py-2.5 px-3 font-bold">الإجمالي</th>
                <th className="py-2.5 px-3 font-bold">المُشاهد</th>
                <th className="py-2.5 px-3 font-bold">المتبقي الجديد</th>
                <th className="py-2.5 px-3 font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E8DD]">
              {subcategoryBreakdown.map((stat) => (
                <tr key={stat.subcategoryId} className="hover:bg-[#F3F5E9]/40">
                  <td className="py-2.5 px-3 font-bold text-[#252824]">
                    {stat.subcategoryName}
                  </td>
                  <td className="py-2.5 px-3 text-[#777B73]">
                    {stat.mainCategory}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[#252824]">
                    {stat.totalQuestions}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                    {stat.seenQuestions}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#14543D]">
                    {stat.remainingUnseen}
                  </td>
                  <td className="py-2.5 px-3">
                    {stat.totalQuestions === 0 ? (
                      <span className="text-[#777B73]">لا توجد أسئلة</span>
                    ) : stat.isExhausted ? (
                      <span className="font-bold text-[#F07842]">
                        خلصت الأسئلة الجديدة
                      </span>
                    ) : (
                      <span className="font-bold text-[#14543D]">متاح</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Most Frequently Appeared Questions */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="space-y-0.5">
            <h3 className="font-display text-base font-bold text-[#252824]">
              الأسئلة الأكثر ظهوراً للاعبين
            </h3>
            <p className="text-xs text-[#777B73]">
              أكثر 30 سؤالاً تم عرضها فعلياً عبر جميع الحسابات في المباريات المحلية والأونلاين.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-[#777B73] absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={topQuestionSearch}
              onChange={(e) => setTopQuestionSearch(e.target.value)}
              placeholder="بحث في الأسئلة الأكثر ظهوراً..."
              className="w-full pr-8 pl-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824]"
            />
          </div>
        </div>

        {topAppearedQuestions.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#777B73]">
            لم يتم تسجيل ظهور أي أسئلة بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-[#F3F5E9] text-[#777B73] border-b border-[#E5E8DD]">
                  <th className="py-2.5 px-3 font-bold w-12">#</th>
                  <th className="py-2.5 px-3 font-bold">السؤال</th>
                  <th className="py-2.5 px-3 font-bold">الفئة</th>
                  <th className="py-2.5 px-3 font-bold">النقاط</th>
                  <th className="py-2.5 px-3 font-bold">مرات الظهور</th>
                  <th className="py-2.5 px-3 font-bold">عدد اللاعبين</th>
                  <th className="py-2.5 px-3 font-bold">آخر ظهور</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E8DD]">
                {topAppearedQuestions.map((item, idx) => (
                  <tr key={item.questionId} className="hover:bg-[#F3F5E9]/40">
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#777B73]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 max-w-md">
                      <div className="font-bold text-[#252824] line-clamp-2">
                        {item.questionText}
                      </div>
                      <div className="font-mono text-[10px] text-[#777B73]">
                        {item.questionId}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[#252824] font-semibold">
                      {item.category}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#F07842]">
                      {item.points}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-[#14543D]">
                      {item.totalAppearances}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#252824]">
                      {item.uniqueUsersCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[#777B73]">
                      {formatDateTimeAr(item.lastSeenAtMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Admin-only Confirmation Modal for Resetting a Player's Seen History */}
      {resetTargetUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-rose-700 text-white px-6 py-4 flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h3 className="font-display text-base font-bold">
                تأكيد تصفير سجل الأسئلة للاعب
              </h3>
            </div>

            <div className="p-6 space-y-4 text-xs leading-relaxed text-[#252824]">
              <p>
                هل أنت متأكد من رغبتك في حذف سجل الأسئلة المشاهدة بالكامل للحساب التالي؟ بعد التصفير ستظهر له الأسئلة السابقة من جديد وكأنه لم يشاهدها.
              </p>

              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
                <div className="font-bold text-sm text-[#252824]">
                  {resetTargetUser.displayName}
                </div>
                <div className="text-[#777B73]">
                  {resetTargetUser.email} ·{' '}
                  <span className="font-mono">{resetTargetUser.uid}</span>
                </div>
                <div className="font-bold text-rose-700 pt-1">
                  عدد الأسئلة المسجلة التي سيتم حذفها: {resetTargetUser.seenUniqueCount}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={resettingUser}
                  onClick={() => setResetTargetUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] font-bold text-[#252824] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={resettingUser}
                  onClick={handleConfirmResetUser}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {resettingUser ? 'جاري التصفير...' : 'نعم، صفّر السجل الآن'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
