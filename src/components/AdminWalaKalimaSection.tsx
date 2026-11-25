import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Edit3,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { AlertBanner, ModalShell, StatusBadge } from './ui';
import { DIFFICULTY_TO_POINTS, DifficultyLevel, MainCategoryMeta } from '../types/game';
import {
  DEFAULT_WALA_KALIMA_SETTINGS,
  WALA_KALIMA_CONTENT_TYPES,
  WALA_KALIMA_POINT_LEVELS,
  WalaKalimaContentTypeId,
  WalaKalimaSettings,
  WalaKalimaWordEntry,
} from '../types/walaKalima';
import {
  createAdminWalaKalimaWordApi,
  deleteAdminWalaKalimaWordApi,
  fetchAdminWalaKalimaData,
  updateAdminWalaKalimaSettingsApi,
  updateAdminWalaKalimaWordApi,
} from '../services/walaKalimaService';

const DIFFICULTIES: DifficultyLevel[] = ['سهل', 'متوسط', 'صعب', 'صعب جداً', 'خبير'];

interface AdminWalaKalimaSectionProps {
  onSettingsUpdated?: (next: WalaKalimaSettings) => void;
  walaKalimaCategory?: MainCategoryMeta;
  comingSoonBusy?: boolean;
  onToggleComingSoon?: (
    mainCat: MainCategoryMeta
  ) => Promise<{ ok: boolean; message: string }>;
}

export const AdminWalaKalimaSection: React.FC<AdminWalaKalimaSectionProps> = ({
  onSettingsUpdated,
  walaKalimaCategory,
  comingSoonBusy = false,
  onToggleComingSoon,
}) => {
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingWord, setSavingWord] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [words, setWords] = useState<WalaKalimaWordEntry[]>([]);
  const [settings, setSettings] = useState<WalaKalimaSettings>(DEFAULT_WALA_KALIMA_SETTINGS);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | WalaKalimaContentTypeId>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | DifficultyLevel>('all');

  // Word Form Modal
  const [wordModalOpen, setWordModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<WalaKalimaWordEntry | null>(null);
  const [formWord, setFormWord] = useState('');
  const [formContentType, setFormContentType] =
    useState<WalaKalimaContentTypeId>('football_players');
  const [formDifficulty, setFormDifficulty] = useState<DifficultyLevel>('متوسط');
  const [formIsActive, setFormIsActive] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminWalaKalimaData();
      setWords(data.words);
      setSettings(data.settings);
      setBanner(null);
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذّر تحميل بيانات فئة ولا كلمة.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const contentTypeLabelMap = useMemo(() => {
    const map = new Map<WalaKalimaContentTypeId, string>();
    WALA_KALIMA_CONTENT_TYPES.forEach((ct) => map.set(ct.id, ct.label));
    return map;
  }, []);

  const wordCountsByType = useMemo(() => {
    const map = new Map<WalaKalimaContentTypeId, number>();
    words.forEach((w) => {
      map.set(w.contentType, (map.get(w.contentType) || 0) + 1);
    });
    return map;
  }, [words]);

  const filteredWords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return words.filter((w) => {
      if (filterType !== 'all' && w.contentType !== filterType) return false;
      if (filterDifficulty !== 'all' && w.difficulty !== filterDifficulty) return false;
      if (q && !w.word.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [words, filterType, filterDifficulty, searchQuery]);

  const toggleContentTypeEnabled = (id: WalaKalimaContentTypeId) => {
    setSettings((prev) => {
      const exists = prev.enabledContentTypes.includes(id);
      const nextList = exists
        ? prev.enabledContentTypes.filter((x) => x !== id)
        : [...prev.enabledContentTypes, id];
      return {
        ...prev,
        enabledContentTypes: nextList.length > 0 ? nextList : prev.enabledContentTypes,
      };
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setBanner(null);
    try {
      const saved = await updateAdminWalaKalimaSettingsApi(settings);
      setSettings(saved);
      onSettingsUpdated?.(saved);
      setBanner({
        type: 'success',
        text: 'تم حفظ إعدادات فئة «ولا كلمة» وتحديث أنواع المحتوى المفعّلة بنجاح.',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذّر حفظ الإعدادات.',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const openAddWordModal = () => {
    setEditingWord(null);
    setFormWord('');
    setFormContentType(filterType !== 'all' ? filterType : 'football_players');
    setFormDifficulty('متوسط');
    setFormIsActive(true);
    setWordModalOpen(true);
  };

  const openEditWordModal = (item: WalaKalimaWordEntry) => {
    setEditingWord(item);
    setFormWord(item.word);
    setFormContentType(item.contentType);
    setFormDifficulty(item.difficulty);
    setFormIsActive(item.isActive);
    setWordModalOpen(true);
  };

  const handleSaveWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWord = formWord.trim();
    if (!cleanWord) {
      setBanner({ type: 'error', text: 'يرجى إدخال الكلمة أو الشخصية المطلوبة للتمثيل الصامت.' });
      return;
    }

    setSavingWord(true);
    setBanner(null);
    try {
      if (editingWord) {
        const updated = await updateAdminWalaKalimaWordApi(editingWord.id, {
          word: cleanWord,
          forbiddenWords: [],
          contentType: formContentType,
          difficulty: formDifficulty,
          isActive: formIsActive,
        });
        setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        setBanner({ type: 'success', text: `تم تحديث بطاقة «${updated.word}» بنجاح.` });
      } else {
        const created = await createAdminWalaKalimaWordApi({
          word: cleanWord,
          forbiddenWords: [],
          contentType: formContentType,
          difficulty: formDifficulty,
          isActive: formIsActive,
        });
        setWords((prev) => [created, ...prev]);
        setBanner({ type: 'success', text: `تمت إضافة بطاقة «${created.word}» بنجاح.` });
      }
      setWordModalOpen(false);
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذّر حفظ البطاقة.',
      });
    } finally {
      setSavingWord(false);
    }
  };

  const handleDeleteWord = async (wordId: string) => {
    try {
      await deleteAdminWalaKalimaWordApi(wordId);
      setWords((prev) => prev.filter((w) => w.id !== wordId));
      setConfirmDeleteId(null);
      setBanner({ type: 'success', text: 'تم حذف البطاقة من بنك ولا كلمة.' });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذّر حذف البطاقة.',
      });
    }
  };

  const handleQuickToggleWordActive = async (item: WalaKalimaWordEntry) => {
    try {
      const updated = await updateAdminWalaKalimaWordApi(item.id, {
        isActive: !item.isActive,
      });
      setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذّر تغيير حالة الكلمة.',
      });
    }
  };

  const isComingSoon = Boolean(walaKalimaCategory?.isComingSoon);

  const handleToggleWalaKalimaComingSoon = async () => {
    if (!walaKalimaCategory || !onToggleComingSoon || comingSoonBusy) return;
    setBanner(null);
    const result = await onToggleComingSoon(walaKalimaCategory);
    setBanner({
      type: result.ok ? 'success' : 'error',
      text: result.message,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#F07842]">
            <QrCode className="w-4 h-4" />
            <span>ولا كلمة · تمثيل صامت عبر QR</span>
            {isComingSoon && (
              <StatusBadge tone="orange">
                <Clock className="w-3 h-3" />
                <span>قريباً</span>
              </StatusBadge>
            )}
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#1B1F1C]">
            إدارة كلمات وإعدادات «ولا كلمة» (تمثيل صامت)
          </h2>
          <p className="text-xs sm:text-sm text-[#52574E]">
            إجمالي الكلمات المحفوظة على الخادم:{' '}
            <span className="font-mono font-bold text-[#14543D] tabular-nums">
              {words.length}
            </span>{' '}
            بطاقة (تظهر على جوال الممثل فقط ولا تصل لشاشة المباراة)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {walaKalimaCategory && onToggleComingSoon && (
            <button
              type="button"
              disabled={comingSoonBusy}
              onClick={() => void handleToggleWalaKalimaComingSoon()}
              title={
                isComingSoon
                  ? 'إلغاء وضع «قريباً» وإتاحة لعبة ولا كلمة للمباريات الجديدة'
                  : 'تفعيل وضع «قريباً» على لعبة ولا كلمة ومنع بدء مباريات جديدة بها'
              }
              className={`min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer border disabled:opacity-60 ${
                isComingSoon
                  ? 'bg-[#EAF2EE] hover:bg-[#D7E6DF] text-[#14543D] border-[#14543D]/25'
                  : 'bg-[#FEF2EC] hover:bg-[#FDE4D7] text-[#D9602B] border-[#F07842]/25'
              }`}
            >
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {comingSoonBusy
                  ? 'جاري الحفظ...'
                  : isComingSoon
                  ? 'تفعيل (إلغاء قريباً)'
                  : 'قريباً'}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] hover:border-[#14543D] flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
          <button
            type="button"
            onClick={openAddWordModal}
            className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة كلمة جديدة</span>
          </button>
        </div>
      </div>

      {banner && (
        <AlertBanner tone={banner.type} onDismiss={() => setBanner(null)}>
          {banner.text}
        </AlertBanner>
      )}

      {/* Challenge Rules & Content Types Control Form */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-[#14543D]" />
            <h3 className="font-display text-base sm:text-lg font-bold text-[#1B1F1C]">
              قواعد الجولة وأنواع المحتوى (11 فئة)
            </h3>
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="w-4 h-4 accent-[#14543D]"
            />
            <span className="text-xs sm:text-sm font-bold text-[#14543D]">
              تفعيل فئة «ولا كلمة» في المنصة
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#52574E]">
              <Clock className="w-3.5 h-3.5 text-[#F07842]" />
              <span>مدة التمثيل الصامت (بالثواني)</span>
            </label>
            <input
              type="number"
              min={15}
              max={300}
              value={settings.timerSeconds}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, timerSeconds: Number(e.target.value) || 45 }))
              }
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] font-mono text-sm font-bold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#52574E] block">
              محاولات التخطي المسموحة في الجولة
            </label>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.maxSkips ?? 3}
              onChange={(e) => {
                const nextMaxSkips = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                setSettings((prev) => ({
                  ...prev,
                  maxSkips: nextMaxSkips,
                  wordsPerRound: nextMaxSkips + 1,
                }));
              }}
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] font-mono text-sm font-bold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#52574E] block">
              مستويات النقاط المعتمدة (5 مستويات)
            </label>
            <div className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] flex flex-wrap items-center gap-1.5">
              {WALA_KALIMA_POINT_LEVELS.map((tier) => (
                <span
                  key={tier.points}
                  className="px-2 py-0.5 rounded-lg bg-white border border-[#14543D]/20 font-mono text-xs font-bold text-[#14543D] tabular-nums"
                  title={`${tier.levelLabel}: ${tier.points} نقطة (${tier.difficulty})`}
                >
                  {tier.points}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 11 Content Types Activation Grid */}
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-[#52574E]">
            تفعيل أو إيقاف أنواع المحتوى ({settings.enabledContentTypes.length} من{' '}
            {WALA_KALIMA_CONTENT_TYPES.length} مفعّلة):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {WALA_KALIMA_CONTENT_TYPES.map((ct) => {
              const isEnabled = settings.enabledContentTypes.includes(ct.id);
              const count = wordCountsByType.get(ct.id) || 0;
              return (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => toggleContentTypeEnabled(ct.id)}
                  className={`p-3 rounded-2xl border-2 text-right flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isEnabled
                      ? 'bg-[#EAF2EE] border-[#14543D] text-[#14543D]'
                      : 'bg-[#F7F8F1] border-[#E5E8DD] text-[#52574E] opacity-80'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold truncate">{ct.label}</div>
                    <div className="text-[11px] font-mono tabular-nums opacity-80">
                      {count} بطاقة
                    </div>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      isEnabled ? 'bg-[#14543D] text-white' : 'bg-white border border-[#E5E8DD]'
                    }`}
                  >
                    {isEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingSettings}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{savingSettings ? 'جاري الحفظ...' : 'حفظ إعدادات ولا كلمة'}</span>
          </button>
        </div>
      </form>

      {/* Word Bank Filter + List */}
      <div className="bg-white border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#666B62] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن كلمة أو شخصية..."
              className="w-full min-h-[42px] pr-10 pl-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] text-xs sm:text-sm text-[#1B1F1C] placeholder:text-[#666B62] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | WalaKalimaContentTypeId)}
            aria-label="تصفية حسب نوع المحتوى"
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] text-xs sm:text-sm font-semibold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
          >
            <option value="all">جميع أنواع المحتوى (11)</option>
            {WALA_KALIMA_CONTENT_TYPES.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.label} ({wordCountsByType.get(ct.id) || 0})
              </option>
            ))}
          </select>

          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value as 'all' | DifficultyLevel)}
            aria-label="تصفية حسب مستوى الصعوبة"
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] text-xs sm:text-sm font-semibold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
          >
            <option value="all">كل مستويات الصعوبة</option>
            {DIFFICULTIES.map((diff) => (
              <option key={diff} value={diff}>
                {diff}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-bold text-[#52574E] font-mono tabular-nums">
          عرض {filteredWords.length} من أصل {words.length} بطاقة
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[#52574E]">جاري تحميل الكلمات...</div>
        ) : filteredWords.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-bold text-[#1B1F1C]">لا توجد كلمات مطابقة للبحث الحالي</p>
            <button
              type="button"
              onClick={openAddWordModal}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold cursor-pointer transition-colors"
            >
              أضف أول كلمة الآن
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredWords.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-colors flex flex-col justify-between gap-3 ${
                  item.isActive
                    ? 'bg-[#FFFFFF] border-[#E5E8DD]'
                    : 'bg-[#F7F8F1] border-dashed border-[#D4D9CC] opacity-80'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <StatusBadge tone="green">
                          {contentTypeLabelMap.get(item.contentType) || item.contentType}
                        </StatusBadge>
                        <StatusBadge tone="orange">
                          {item.difficulty} · {DIFFICULTY_TO_POINTS[item.difficulty]} نقطة
                        </StatusBadge>
                        {!item.isActive && <StatusBadge tone="neutral">متوقفة</StatusBadge>}
                      </div>
                      <h4 className="font-display text-base sm:text-lg font-bold text-[#1B1F1C]">
                        {item.word}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleQuickToggleWordActive(item)}
                        title={item.isActive ? 'إيقاف مؤقت' : 'تفعيل'}
                        className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] px-2.5 sm:px-2 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[11px] font-bold text-[#52574E] hover:text-[#14543D] cursor-pointer"
                      >
                        {item.isActive ? 'مفعّلة' : 'تفعيل'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditWordModal(item)}
                        aria-label={`تعديل ${item.word}`}
                        className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg bg-[#EAF2EE] text-[#14543D] hover:bg-[#D5E6DC] flex items-center justify-center cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        aria-label={`حذف ${item.word}`}
                        className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* End Word Card Header */}
                </div>

                {confirmDeleteId === item.id && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-rose-800">تأكيد الحذف النهائي؟</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDeleteWord(item.id)}
                        className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer transition-colors"
                      >
                        حذف
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-[#1B1F1C] font-bold cursor-pointer transition-colors"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Word Modal */}
      <ModalShell
        isOpen={wordModalOpen}
        onClose={() => {
          if (!savingWord) setWordModalOpen(false);
        }}
        title={editingWord ? 'تعديل بطاقة ولا كلمة' : 'إضافة بطاقة ولا كلمة جديدة'}
        icon={<QrCode className="w-4 h-4 text-[#F07842]" />}
        headerTone="dark"
        maxWidth="lg"
        closeDisabled={savingWord}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={savingWord}
              onClick={() => setWordModalOpen(false)}
              className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] hover:bg-[#E5E8DD]/60 text-xs font-bold text-[#1B1F1C] cursor-pointer disabled:opacity-50 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              form="wala-kalima-word-form"
              disabled={savingWord}
              className="min-h-[44px] sm:min-h-[42px] px-5 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-60 transition-colors"
            >
              {savingWord ? 'جاري الحفظ...' : editingWord ? 'حفظ التعديلات' : 'إضافة البطاقة'}
            </button>
          </div>
        }
      >
        <form id="wala-kalima-word-form" onSubmit={handleSaveWord} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1B1F1C] block">
              الكلمة / الشخصية / المعلومة السرية *
            </label>
            <input
              type="text"
              required
              value={formWord}
              onChange={(e) => setFormWord(e.target.value)}
              placeholder="مثال: سالم الدوسري"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] text-sm font-bold text-[#1B1F1C] placeholder:text-[#666B62] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1B1F1C] block">نوع المحتوى</label>
              <select
                value={formContentType}
                onChange={(e) =>
                  setFormContentType(e.target.value as WalaKalimaContentTypeId)
                }
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] text-xs sm:text-sm font-semibold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
              >
                {WALA_KALIMA_CONTENT_TYPES.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1B1F1C] block">
                مستوى الصعوبة والنقاط
              </label>
              <select
                value={formDifficulty}
                onChange={(e) => setFormDifficulty(e.target.value as DifficultyLevel)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] text-xs sm:text-sm font-semibold text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
              >
                {DIFFICULTIES.map((diff) => (
                  <option key={diff} value={diff}>
                    {diff} ({DIFFICULTY_TO_POINTS[diff]} نقطة)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-[#52574E] bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl p-3 leading-relaxed">
            يُفضّل اختيار كلمات أو شخصيات أو أفعال يمكن تمثيلها بالحركات وتعبيرات الوجه دون كلام.
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              className="w-4 h-4 accent-[#14543D]"
            />
            <span className="text-xs font-bold text-[#14543D]">
              البطاقة نشطة ومتاحة للظهور في الجولات
            </span>
          </label>
        </form>
      </ModalShell>
    </div>
  );
};
