import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
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
  X,
} from 'lucide-react';
import { DifficultyLevel } from '../types/game';
import {
  DEFAULT_WALA_KALIMA_SETTINGS,
  WALA_KALIMA_CONTENT_TYPES,
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
}

export const AdminWalaKalimaSection: React.FC<AdminWalaKalimaSectionProps> = ({
  onSettingsUpdated,
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
  const [formForbiddenRaw, setFormForbiddenRaw] = useState('');
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
      if (q) {
        const matchWord = w.word.toLowerCase().includes(q);
        const matchForbidden = w.forbiddenWords.some((fw) => fw.toLowerCase().includes(q));
        if (!matchWord && !matchForbidden) return false;
      }
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
    setFormForbiddenRaw('');
    setFormContentType(filterType !== 'all' ? filterType : 'football_players');
    setFormDifficulty('متوسط');
    setFormIsActive(true);
    setWordModalOpen(true);
  };

  const openEditWordModal = (item: WalaKalimaWordEntry) => {
    setEditingWord(item);
    setFormWord(item.word);
    setFormForbiddenRaw(item.forbiddenWords.join('، '));
    setFormContentType(item.contentType);
    setFormDifficulty(item.difficulty);
    setFormIsActive(item.isActive);
    setWordModalOpen(true);
  };

  const handleSaveWord = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWord = formWord.trim();
    if (!cleanWord) {
      setBanner({ type: 'error', text: 'يرجى إدخال الكلمة أو الشخصية.' });
      return;
    }

    const parsedForbidden = formForbiddenRaw
      .split(/[,،\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    setSavingWord(true);
    setBanner(null);
    try {
      if (editingWord) {
        const updated = await updateAdminWalaKalimaWordApi(editingWord.id, {
          word: cleanWord,
          forbiddenWords: parsedForbidden,
          contentType: formContentType,
          difficulty: formDifficulty,
          isActive: formIsActive,
        });
        setWords((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        setBanner({ type: 'success', text: `تم تحديث بطاقة «${updated.word}» بنجاح.` });
      } else {
        const created = await createAdminWalaKalimaWordApi({
          word: cleanWord,
          forbiddenWords: parsedForbidden,
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

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#E5E8DD] rounded-3xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-[#F07842]">
            <QrCode className="w-4 h-4" />
            <span>نظام ولا كلمة التفاعلي عبر QR</span>
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#252824]">
            إدارة كلمات وإعدادات «ولا كلمة»
          </h2>
          <p className="text-xs sm:text-sm text-[#777B73]">
            إجمالي البطاقات المحفوظة على الخادم:{' '}
            <span className="font-mono font-bold text-[#14543D] tabular-nums">
              {words.length}
            </span>{' '}
            بطاقة (محمية بالكامل ولا تصل لشاشة المباراة)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-bold text-[#252824] hover:border-[#14543D] flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
          <button
            type="button"
            onClick={openAddWordModal}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة كلمة جديدة</span>
          </button>
        </div>
      </div>

      {banner && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
            banner.type === 'success'
              ? 'bg-[#EAF2EE] border-[#14543D]/30 text-[#14543D]'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{banner.text}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Challenge Rules & Content Types Control Form */}
      <form
        onSubmit={handleSaveSettings}
        className="bg-white border border-[#E5E8DD] rounded-3xl p-5 sm:p-6 space-y-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-[#14543D]" />
            <h3 className="font-display text-base sm:text-lg font-bold text-[#252824]">
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
              <span>مدة التحدي (بالثواني)</span>
            </label>
            <input
              type="number"
              min={15}
              max={300}
              value={settings.timerSeconds}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, timerSeconds: Number(e.target.value) || 60 }))
              }
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] font-mono text-sm font-bold text-[#252824]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#52574E] block">
              عدد الكلمات في كل جولة
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={settings.wordsPerRound}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, wordsPerRound: Number(e.target.value) || 5 }))
              }
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] font-mono text-sm font-bold text-[#252824]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#52574E] block">
              النقاط لكل إجابة صحيحة
            </label>
            <input
              type="number"
              min={10}
              max={1000}
              step={10}
              value={settings.pointsPerCorrectWord}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  pointsPerCorrectWord: Number(e.target.value) || 100,
                }))
              }
              className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] font-mono text-sm font-bold text-[#252824]"
            />
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
                  className={`p-3 rounded-2xl border-2 text-right flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    isEnabled
                      ? 'bg-[#EAF2EE] border-[#14543D] text-[#14543D]'
                      : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#777B73] opacity-75'
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
      <div className="bg-white border border-[#E5E8DD] rounded-3xl p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن كلمة أو كلمة ممنوعة..."
              className="w-full min-h-[42px] pr-10 pl-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-xs sm:text-sm"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'all' | WalaKalimaContentTypeId)}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-xs sm:text-sm font-semibold"
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
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-xs sm:text-sm font-semibold"
          >
            <option value="all">كل مستويات الصعوبة</option>
            {DIFFICULTIES.map((diff) => (
              <option key={diff} value={diff}>
                {diff}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs font-bold text-[#777B73]">
          عرض {filteredWords.length} من أصل {words.length} بطاقة
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[#777B73]">جاري تحميل الكلمات...</div>
        ) : filteredWords.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <p className="text-sm font-bold text-[#252824]">لا توجد كلمات مطابقة للبحث الحالي</p>
            <button
              type="button"
              onClick={openAddWordModal}
              className="px-4 py-2 rounded-xl bg-[#F07842] text-white text-xs font-bold cursor-pointer"
            >
              أضف أول كلمة الآن
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredWords.map((item) => (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  item.isActive
                    ? 'bg-[#FFFFFF] border-[#E5E8DD]'
                    : 'bg-[#F3F5E9]/70 border-dashed border-[#D4D9CC] opacity-75'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className="px-2 py-0.5 rounded-md bg-[#EAF2EE] text-[#14543D]">
                          {contentTypeLabelMap.get(item.contentType) || item.contentType}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#FEF2EC] text-[#D9602B]">
                          {item.difficulty}
                        </span>
                        {!item.isActive && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                            متوقفة
                          </span>
                        )}
                      </div>
                      <h4 className="font-display text-base sm:text-lg font-bold text-[#252824]">
                        {item.word}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleQuickToggleWordActive(item)}
                        title={item.isActive ? 'إيقاف مؤقت' : 'تفعيل'}
                        className="min-w-[34px] min-h-[34px] px-2 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[11px] font-bold text-[#52574E] hover:text-[#14543D] cursor-pointer"
                      >
                        {item.isActive ? 'مفعّلة' : 'تفعيل'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditWordModal(item)}
                        aria-label={`تعديل ${item.word}`}
                        className="min-w-[34px] min-h-[34px] rounded-lg bg-[#EAF2EE] text-[#14543D] hover:bg-[#D5E6DC] flex items-center justify-center cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        aria-label={`حذف ${item.word}`}
                        className="min-w-[34px] min-h-[34px] rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Forbidden Words */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                      <Ban className="w-3 h-3" />
                      <span>الممنوعات:</span>
                    </span>
                    {item.forbiddenWords.length > 0 ? (
                      item.forbiddenWords.map((fw, idx) => (
                        <span
                          key={`${fw}_${idx}`}
                          className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[11px] font-semibold text-rose-800"
                        >
                          {fw}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#777B73]">بدون كلمات ممنوعة إضافية</span>
                    )}
                  </div>
                </div>

                {confirmDeleteId === item.id && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-rose-800">تأكيد الحذف النهائي؟</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDeleteWord(item.id)}
                        className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold cursor-pointer"
                      >
                        حذف
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-1 rounded-lg bg-white border border-rose-200 text-[#252824] font-bold cursor-pointer"
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
      {wordModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3">
          <form
            onSubmit={handleSaveWord}
            className="bg-white border-2 border-[#14543D] rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
              <h3 className="font-display text-lg font-bold text-[#252824]">
                {editingWord ? 'تعديل بطاقة ولا كلمة' : 'إضافة بطاقة ولا كلمة جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setWordModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#F3F5E9] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#52574E] block">
                  الكلمة / الشخصية / المعلومة السرية *
                </label>
                <input
                  type="text"
                  required
                  value={formWord}
                  onChange={(e) => setFormWord(e.target.value)}
                  placeholder="مثال: سالم الدوسري"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-sm font-bold text-[#252824]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#52574E] block">نوع المحتوى</label>
                  <select
                    value={formContentType}
                    onChange={(e) =>
                      setFormContentType(e.target.value as WalaKalimaContentTypeId)
                    }
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-xs sm:text-sm font-semibold"
                  >
                    {WALA_KALIMA_CONTENT_TYPES.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#52574E] block">مستوى الصعوبة</label>
                  <select
                    value={formDifficulty}
                    onChange={(e) => setFormDifficulty(e.target.value as DifficultyLevel)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-xs sm:text-sm font-semibold"
                  >
                    {DIFFICULTIES.map((diff) => (
                      <option key={diff} value={diff}>
                        {diff}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#52574E] block">
                  الكلمات الممنوعة (افصل بينها بفاصلة «،» أو سطر جديد)
                </label>
                <textarea
                  rows={3}
                  value={formForbiddenRaw}
                  onChange={(e) => setFormForbiddenRaw(e.target.value)}
                  placeholder="مثال: الهلال، التورنيدو، المنتخب السعودي، الأرجنتين"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] text-sm text-[#252824]"
                />
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
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWordModalOpen(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-bold text-[#52574E] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={savingWord}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3D2C] text-white text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-60"
              >
                {savingWord ? 'جاري الحفظ...' : editingWord ? 'حفظ التعديلات' : 'إضافة البطاقة'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
