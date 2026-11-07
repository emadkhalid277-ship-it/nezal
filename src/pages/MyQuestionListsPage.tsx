import React, { useState, useEffect, useMemo } from 'react';
import {
  FolderPlus,
  Plus,
  Trash2,
  Edit3,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Image as ImageIcon,
  BookOpen,
  FolderTree,
  ChevronRight,
  Search,
  Sparkles,
  Info,
  UploadCloud,
  X,
  Eye,
  Check,
  RefreshCw,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  UserQuestionList,
  UserCustomQuestion,
  MainCategoryMeta,
  SubcategoryItem,
  PointValue,
  DifficultyLevel,
  POINT_TO_DIFFICULTY,
} from '../types/game';
import {
  fetchUserLists,
  createUserList,
  updateUserList,
  deleteUserList,
  fetchUserQuestions,
  createUserQuestion,
  updateUserQuestion,
  deleteUserQuestion,
  uploadUserQuestionImage,
  submitQuestionToAdmin,
} from '../services/contributionService';

interface MyQuestionListsPageProps {
  user: User | null;
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  onOpenAuthModal: () => void;
  onNavigateHome: () => void;
}

export const MyQuestionListsPage: React.FC<MyQuestionListsPageProps> = ({
  user,
  mainCategories,
  subcategories,
  onOpenAuthModal,
  onNavigateHome,
}) => {
  // Lists and Questions State
  const [lists, setLists] = useState<UserQuestionList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<UserCustomQuestion[]>([]);
  const [loadingLists, setLoadingLists] = useState<boolean>(true);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pointsFilter, setPointsFilter] = useState<string>('all');

  // Modals State
  const [listModalOpen, setListModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<UserQuestionList | null>(null);
  const [listFormName, setListFormName] = useState('');
  const [listFormDesc, setListFormDesc] = useState('');

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<UserCustomQuestion | null>(null);
  const [formMainCatId, setFormMainCatId] = useState('');
  const [formSubcatId, setFormSubcatId] = useState('');
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formCorrectAnswer, setFormCorrectAnswer] = useState('');
  const [formPoints, setFormPoints] = useState<PointValue>(100);
  const [formExplanation, setFormExplanation] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formImageStoragePath, setFormImageStoragePath] = useState('');
  const [formImageDesc, setFormImageDesc] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Feedback Notification Banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Preview Image Modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Rejection Reason Details Modal
  const [viewingRejection, setViewingRejection] = useState<{ questionText: string; reason: string } | null>(null);

  // 1. Initial Load of User Lists
  useEffect(() => {
    if (!user) {
      setLists([]);
      setQuestions([]);
      setLoadingLists(false);
      return;
    }

    loadLists();
  }, [user]);

  const loadLists = async () => {
    if (!user) return;
    setLoadingLists(true);
    try {
      const userLists = await fetchUserLists(user.uid);
      setLists(userLists);
      if (userLists.length > 0 && !activeListId) {
        setActiveListId(userLists[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load user lists:', err);
      showFeedback('error', 'تعذر تحميل قوائمك الخاصة. يرجى إعادة المحاولة.');
    } finally {
      setLoadingLists(false);
    }
  };

  // 2. Load Questions when Active List Changes
  useEffect(() => {
    if (!user || !activeListId) {
      setQuestions([]);
      return;
    }

    loadQuestionsForList(activeListId);
  }, [user, activeListId]);

  const loadQuestionsForList = async (listId: string) => {
    if (!user) return;
    setLoadingQuestions(true);
    try {
      const listQuestions = await fetchUserQuestions(user.uid, listId);
      setQuestions(listQuestions);
    } catch (err: any) {
      console.error('Failed to load list questions:', err);
      showFeedback('error', 'تعذر تحميل أسئلة القائمة.');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const showFeedback = (type: 'success' | 'error' | 'info', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const activeList = useMemo(() => {
    return lists.find((l) => l.id === activeListId) || null;
  }, [lists, activeListId]);

  // Available subcategories for the currently selected main category in modal
  const availableSubcategories = useMemo(() => {
    if (!formMainCatId) return [];
    return subcategories.filter(
      (s) => s.isActive && (s.mainCategoryId === formMainCatId || !s.mainCategoryId)
    );
  }, [subcategories, formMainCatId]);

  // Filtered Questions in Active List
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (statusFilter !== 'all' && q.contributionStatus !== statusFilter) return false;
      if (pointsFilter !== 'all' && q.points !== Number(pointsFilter)) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const inText = q.questionText.toLowerCase().includes(query);
        const inAns = q.correctAnswer.toLowerCase().includes(query);
        const inCat = q.category.toLowerCase().includes(query);
        return inText || inAns || inCat;
      }
      return true;
    });
  }, [questions, statusFilter, pointsFilter, searchQuery]);

  // Open Create/Edit List Modal
  const openCreateListModal = () => {
    setEditingList(null);
    setListFormName('');
    setListFormDesc('');
    setListModalOpen(true);
  };

  const openEditListModal = (list: UserQuestionList) => {
    setEditingList(list);
    setListFormName(list.name);
    setListFormDesc(list.description || '');
    setListModalOpen(true);
  };

  const handleSaveList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanName = listFormName.trim();
    if (!cleanName) {
      showFeedback('error', 'يرجى إدخال اسم للقائمة.');
      return;
    }

    setActionLoading(true);
    try {
      if (editingList) {
        await updateUserList(user.uid, editingList.id, cleanName, listFormDesc.trim());
        setLists((prev) =>
          prev.map((l) =>
            l.id === editingList.id
              ? { ...l, name: cleanName, description: listFormDesc.trim(), updatedAt: new Date().toISOString() }
              : l
          )
        );
        showFeedback('success', 'تم تعديل اسم وتفاصيل القائمة بنجاح.');
      } else {
        const newList = await createUserList(user.uid, cleanName, listFormDesc.trim());
        setLists((prev) => [newList, ...prev]);
        setActiveListId(newList.id);
        showFeedback('success', 'تم إنشاء القائمة الجديدة بنجاح.');
      }
      setListModalOpen(false);
    } catch (err: any) {
      console.error('Error saving list:', err);
      showFeedback('error', 'حدث خطأ أثناء حفظ القائمة.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteList = async (listId: string, listName: string) => {
    if (!user) return;
    if (!window.confirm(`هل أنت متأكد من حذف القائمة "${listName}"؟ سيتم حذف جميع الأسئلة الموجودة بداخلها.`)) {
      return;
    }

    setActionLoading(true);
    try {
      await deleteUserList(user.uid, listId);
      const remaining = lists.filter((l) => l.id !== listId);
      setLists(remaining);
      if (activeListId === listId) {
        setActiveListId(remaining.length > 0 ? remaining[0].id : null);
      }
      showFeedback('success', 'تم حذف القائمة وأسئلتها بنجاح.');
    } catch (err: any) {
      console.error('Error deleting list:', err);
      showFeedback('error', 'تعذر حذف القائمة.');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Create/Edit Question Modal
  const openCreateQuestionModal = () => {
    if (!activeListId) {
      showFeedback('info', 'يرجى إنشاء قائمة أو اختيارها أولاً لإضافة الأسئلة.');
      return;
    }
    setEditingQuestion(null);
    const defaultMain = mainCategories[0]?.id || '';
    setFormMainCatId(defaultMain);
    const defaultSubs = subcategories.filter((s) => s.isActive && s.mainCategoryId === defaultMain);
    setFormSubcatId(defaultSubs[0]?.id || '');
    setFormQuestionText('');
    setFormCorrectAnswer('');
    setFormPoints(100);
    setFormExplanation('');
    setFormSource('');
    setFormImageUrl('');
    setFormImageStoragePath('');
    setFormImageDesc('');
    setImageFile(null);
    setImagePreview(null);
    setQuestionModalOpen(true);
  };

  const openEditQuestionModal = (q: UserCustomQuestion) => {
    setEditingQuestion(q);
    setFormMainCatId(q.mainCategoryId);
    setFormSubcatId(q.subcategoryId);
    setFormQuestionText(q.questionText);
    setFormCorrectAnswer(q.correctAnswer);
    setFormPoints(q.points);
    setFormExplanation(q.explanation || '');
    setFormSource(q.source || '');
    setFormImageUrl(q.imageUrl || '');
    setFormImageStoragePath(q.imageStoragePath || '');
    setFormImageDesc(q.imageDescription || '');
    setImageFile(null);
    setImagePreview(q.imageUrl || null);
    setQuestionModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة كبير جداً (الحد الأقصى 5 ميجابايت).');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormImageUrl('');
    setFormImageStoragePath('');
    setFormImageDesc('');
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeListId) return;

    const qText = formQuestionText.trim();
    const ans = formCorrectAnswer.trim();
    if (!qText || !ans) {
      showFeedback('error', 'يرجى كتابة نص السؤال والإجابة الصحيحة.');
      return;
    }

    const mainCat = mainCategories.find((m) => m.id === formMainCatId);
    const subcat = subcategories.find((s) => s.id === formSubcatId);
    if (!subcat) {
      showFeedback('error', 'يرجى اختيار فئة فرعية صحيحة.');
      return;
    }

    setActionLoading(true);
    let finalImageUrl = formImageUrl;
    let finalStoragePath = formImageStoragePath;

    // Upload new image if selected
    if (imageFile) {
      setUploadingImage(true);
      try {
        const uploadRes = await uploadUserQuestionImage(imageFile, user.uid);
        finalImageUrl = uploadRes.downloadUrl;
        finalStoragePath = uploadRes.storagePath;
      } catch (uploadErr: any) {
        showFeedback('error', uploadErr.message || 'فشل رفع الصورة.');
        setActionLoading(false);
        setUploadingImage(false);
        return;
      } finally {
        setUploadingImage(false);
      }
    }

    const payload = {
      listId: activeListId,
      mainCategoryId: formMainCatId,
      mainCategory: mainCat?.name || '',
      subcategoryId: subcat.id,
      category: subcat.name,
      questionText: qText,
      correctAnswer: ans,
      points: formPoints,
      difficulty: POINT_TO_DIFFICULTY[formPoints],
      explanation: formExplanation.trim(),
      source: formSource.trim(),
      imageUrl: finalImageUrl,
      imageStoragePath: finalStoragePath,
      imageDescription: formImageDesc.trim(),
    };

    try {
      if (editingQuestion) {
        await updateUserQuestion(user.uid, editingQuestion.id, payload);
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === editingQuestion.id
              ? {
                  ...q,
                  ...payload,
                  updatedAt: new Date().toISOString(),
                }
              : q
          )
        );
        showFeedback('success', 'تم تحديث السؤال بنجاح.');
      } else {
        const createdQ = await createUserQuestion(user.uid, payload);
        setQuestions((prev) => [createdQ, ...prev]);
        showFeedback('success', 'تمت إضافة السؤال الجديد إلى قائمتك.');
      }
      setQuestionModalOpen(false);
    } catch (err: any) {
      console.error('Error saving question:', err);
      showFeedback('error', 'تعذر حفظ السؤال. يرجى المحاولة لاحقاً.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuestion = async (q: UserCustomQuestion) => {
    if (!user) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا السؤال من قائمتك؟')) return;

    setActionLoading(true);
    try {
      await deleteUserQuestion(user.uid, q.id, q.imageStoragePath);
      setQuestions((prev) => prev.filter((item) => item.id !== q.id));
      showFeedback('success', 'تم حذف السؤال من القائمة.');
    } catch (err: any) {
      console.error('Error deleting question:', err);
      showFeedback('error', 'تعذر حذف السؤال.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitForReview = async (q: UserCustomQuestion) => {
    if (!user) return;
    if (q.contributionStatus === 'pending') {
      showFeedback('info', 'هذا السؤال تم إرساله وهو حالياً قيد المراجعة لدى الإدارة.');
      return;
    }
    if (q.contributionStatus === 'approved') {
      showFeedback('info', 'هذا السؤال تم اعتماده مسبقاً في بنك أسئلة نِزال العام!');
      return;
    }

    if (!window.confirm('هل ترغب في إرسال هذا السؤال إلى إدارة نِزال للمراجعة والاعتماد في بنك الأسئلة العام؟')) {
      return;
    }

    setActionLoading(true);
    try {
      const contribId = await submitQuestionToAdmin(
        user.uid,
        q,
        user.email || '',
        user.displayName || user.email?.split('@')[0] || ''
      );

      setQuestions((prev) =>
        prev.map((item) =>
          item.id === q.id
            ? { ...item, contributionStatus: 'pending', contributionId: contribId, rejectionReason: '' }
            : item
        )
      );

      showFeedback('success', 'تم إرسال السؤال للإدارة بنجاح، وستتم مراجعته قريباً.');
    } catch (err: any) {
      console.error('Error submitting question for review:', err);
      showFeedback('error', 'تعذر إرسال السؤال للمراجعة. يرجى المحاولة لاحقاً.');
    } finally {
      setActionLoading(false);
    }
  };

  // Render Logged Out View
  if (!user) {
    return (
      <div className="max-w-[800px] mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-[#14543D]/10 text-[#14543D] flex items-center justify-center mx-auto shadow-inner">
          <BookOpen className="w-10 h-10" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#252824]">
          قائمتي الخاصة — بنك الأسئلة الشخصي
        </h1>
        <p className="text-sm sm:text-base text-[#777B73] max-w-lg mx-auto leading-relaxed">
          سجل دخولك لتتمكن من إنشاء قوائم أسئلتك المخصصة، وإضافة أسئلتك وإجاباتها، والمساهمة مع مجتمع «نِزال» في بناء بنك الأسئلة الشامل.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="px-6 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
          >
            تسجيل الدخول / إنشاء حساب
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-5 py-3 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] font-bold text-sm border border-[#E5E8DD] transition-all cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Toast Notification Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-sm font-bold shadow-md transition-all ${
            feedback.type === 'success'
              ? 'bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/20'
              : feedback.type === 'error'
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-[#FDF0EA] text-[#D9602B] border border-[#F5D0BE]'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
            {feedback.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
            {feedback.type === 'info' && <Info className="w-5 h-5 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-black/5 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#F07842]">
            <Sparkles className="w-4 h-4" />
            <span>بنك الأسئلة الشخصي ومساهمات الأعضاء</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14543D]">
            قائمتي الخاصة
          </h1>
          <p className="text-xs sm:text-sm text-[#777B73] max-w-2xl leading-relaxed">
            أنشئ قوائم أسئلتك المخصصة لمناسباتك أو أصدقائك، واصنع أسئلة مصورة أو نصية مباشرة، وشاركها مع مجتمع «نِزال» عبر زر «إرسال للمراجعة» لتُعتمد رسمياً في اللعبة!
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={openCreateListModal}
            className="px-4 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3B2B] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>إنشاء قائمة جديدة</span>
          </button>
          <button
            type="button"
            disabled={!activeListId}
            onClick={openCreateQuestionModal}
            className="px-4 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سؤال</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Lists on side, Questions on main area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SIDEBAR: User Lists Selector */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5E8DD]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#252824]">
                <FolderTree className="w-4 h-4 text-[#14543D]" />
                <span>قوائمي ({lists.length})</span>
              </div>
              <button
                type="button"
                onClick={openCreateListModal}
                className="text-xs font-bold text-[#F07842] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>قائمة</span>
              </button>
            </div>

            {loadingLists ? (
              <div className="py-6 text-center text-xs text-[#777B73]">جارٍ تحميل القوائم...</div>
            ) : lists.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-xs text-[#777B73]">لم تنشئ أي قائمة بعد.</p>
                <button
                  type="button"
                  onClick={openCreateListModal}
                  className="px-3 py-1.5 rounded-lg bg-[#EAF2EE] text-[#14543D] text-xs font-bold hover:bg-[#D7E6DF] cursor-pointer"
                >
                  + أنشئ أول قائمة
                </button>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                {lists.map((l) => {
                  const isActive = l.id === activeListId;
                  return (
                    <div
                      key={l.id}
                      onClick={() => setActiveListId(l.id)}
                      className={`group p-3 rounded-xl border text-right cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-[#EAF2EE] border-[#14543D]/30 text-[#14543D]'
                          : 'bg-[#FBFDFB] hover:bg-[#F3F5E9] border-[#E5E8DD] text-[#252824]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate">{l.name}</div>
                        {l.description && (
                          <div className="text-[11px] text-[#777B73] truncate">{l.description}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditListModal(l);
                          }}
                          className="p-1 rounded-md text-[#777B73] hover:text-[#14543D] hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="تعديل القائمة"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteList(l.id, l.name);
                          }}
                          className="p-1 rounded-md text-[#777B73] hover:text-rose-600 hover:bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="حذف القائمة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            isActive ? 'rotate-180 text-[#14543D]' : 'text-[#777B73]'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MAIN AREA: Active List Questions */}
        <div className="lg:col-span-3 space-y-6">
          {activeList ? (
            <>
              {/* Active List Banner & Tools */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E8DD]">
                  <div>
                    <div className="text-xs font-bold text-[#F07842]">القائمة المفتوحة</div>
                    <h2 className="font-display text-xl font-bold text-[#252824]">{activeList.name}</h2>
                    {activeList.description && (
                      <p className="text-xs text-[#777B73] mt-0.5">{activeList.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditListModal(activeList)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5E8DD] text-xs font-bold text-[#777B73] hover:text-[#14543D] hover:bg-[#F3F5E9] flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={openCreateQuestionModal}
                      className="px-3.5 py-1.5 rounded-lg bg-[#14543D] text-white text-xs font-bold hover:bg-[#0E3B2B] flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة سؤال</span>
                    </button>
                  </div>
                </div>

                {/* Search & Filters Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777B73]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث في الأسئلة أو الإجابات..."
                      className="w-full pl-3 pr-9 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D] focus:ring-1 focus:ring-[#14543D]"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl text-[#252824] font-medium focus:outline-none focus:border-[#14543D]"
                    >
                      <option value="all">جميع الحالات</option>
                      <option value="draft">مسودة (غير مرسل)</option>
                      <option value="pending">قيد المراجعة</option>
                      <option value="approved">معتمد رسمياً</option>
                      <option value="rejected">مرفوض</option>
                    </select>

                    <select
                      value={pointsFilter}
                      onChange={(e) => setPointsFilter(e.target.value)}
                      className="px-3 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl text-[#252824] font-medium focus:outline-none focus:border-[#14543D]"
                    >
                      <option value="all">جميع النقاط</option>
                      <option value="100">100 نقطة</option>
                      <option value="200">200 نقطة</option>
                      <option value="300">300 نقطة</option>
                      <option value="400">400 نقطة</option>
                      <option value="500">500 نقطة</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => loadQuestionsForList(activeList.id)}
                      className="p-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#777B73] hover:text-[#14543D] border border-[#E5E8DD] cursor-pointer"
                      title="تحديث الأسئلة"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              {loadingQuestions ? (
                <div className="py-16 text-center text-sm text-[#777B73] bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl">
                  جارٍ تحميل أسئلة القائمة...
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#F3F5E9] text-[#777B73] flex items-center justify-center mx-auto">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-[#252824]">لا توجد أسئلة في هذه القائمة حالياً</h3>
                    <p className="text-xs text-[#777B73] max-w-sm mx-auto">
                      ابدأ بإضافة أول سؤال، حدد نقاطه وفئته، وأرسله للمراجعة ليدخل بنك أسئلة نِزال!
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateQuestionModal}
                    className="px-4 py-2 rounded-xl bg-[#14543D] text-white text-xs font-bold hover:bg-[#0E3B2B] inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة أول سؤال</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {filteredQuestions.map((q) => {
                    const isDraft = q.contributionStatus === 'draft';
                    const isPending = q.contributionStatus === 'pending';
                    const isApproved = q.contributionStatus === 'approved';
                    const isRejected = q.contributionStatus === 'rejected';

                    return (
                      <div
                        key={q.id}
                        className="bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#14543D]/30 rounded-2xl p-4 sm:p-5 space-y-3 transition-all shadow-xs"
                      >
                        {/* Card Header: Category & Points & Status Badge */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-[#E5E8DD]/60">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#EAF2EE] text-[#14543D] text-[11px] font-bold">
                              {q.mainCategory} · {q.category}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#FDF0EA] text-[#D9602B] font-mono text-[11px] font-bold">
                              {q.points} نقطة ({q.difficulty})
                            </span>
                            {q.imageUrl && (
                              <span className="px-2 py-0.5 rounded-lg bg-[#F3F5E9] text-[#777B73] text-[10px] font-bold flex items-center gap-1">
                                <ImageIcon className="w-3 h-3 text-[#F07842]" />
                                <span>سؤال مصوّر</span>
                              </span>
                            )}
                          </div>

                          {/* Contribution Status Badge */}
                          <div className="flex items-center gap-1.5">
                            {isDraft && (
                              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold flex items-center gap-1">
                                <Edit3 className="w-3 h-3" />
                                <span>مسودة شخصية</span>
                              </span>
                            )}
                            {isPending && (
                              <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                <span>قيد المراجعة</span>
                              </span>
                            )}
                            {isApproved && (
                              <span className="px-2.5 py-1 rounded-lg bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/25 text-[11px] font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-[#14543D]" />
                                <span>معتمد في بنك نِزال</span>
                              </span>
                            )}
                            {isRejected && (
                              <button
                                type="button"
                                onClick={() =>
                                  setViewingRejection({
                                    questionText: q.questionText,
                                    reason: q.rejectionReason || 'لم يحدد المشرف سبباً.',
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-100 cursor-pointer"
                                title="اضغط لعرض سبب الرفض"
                              >
                                <XCircle className="w-3 h-3 text-rose-600" />
                                <span>مرفوض (عرض السبب)</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Card Body: Question text & Image */}
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                          {q.imageUrl && (
                            <div className="shrink-0 relative group">
                              <img
                                src={q.imageUrl}
                                alt={q.imageDescription || 'صورة السؤال'}
                                className="w-24 h-24 object-cover rounded-xl border border-[#E5E8DD] bg-slate-50 cursor-pointer"
                                onClick={() => setPreviewImageUrl(q.imageUrl || null)}
                              />
                              <button
                                type="button"
                                onClick={() => setPreviewImageUrl(q.imageUrl || null)}
                                className="absolute inset-0 bg-black/40 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                title="تكبير الصورة"
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                            </div>
                          )}

                          <div className="flex-1 space-y-1.5 min-w-0">
                            <h4 className="font-bold text-sm text-[#252824] leading-relaxed">
                              {q.questionText}
                            </h4>

                            <div className="p-2.5 rounded-xl bg-[#F3F5E9]/50 border border-[#E5E8DD]/60 space-y-1 text-xs">
                              <div>
                                <span className="font-bold text-[#14543D]">الإجابة الصحيحة: </span>
                                <span className="text-[#252824]">{q.correctAnswer}</span>
                              </div>
                              {q.explanation && (
                                <div className="text-[11px] text-[#777B73]">
                                  <span className="font-bold text-[#777B73]">الشرح: </span>
                                  <span>{q.explanation}</span>
                                </div>
                              )}
                              {q.source && (
                                <div className="text-[10px] text-[#777B73]/80">
                                  <span>المصدر: {q.source}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer: Actions */}
                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E5E8DD]/40">
                          <div className="text-[10px] text-[#777B73]">
                            أُضيف في {new Date(q.createdAt).toLocaleDateString('ar-SA')}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Send for Review Button */}
                            {(isDraft || isRejected) && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleSubmitForReview(q)}
                                className="px-3 py-1.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                title="إرسال هذا السؤال لمراجعته من إدارة نِزال"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>إرسال للمراجعة</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openEditQuestionModal(q)}
                              className="p-1.5 rounded-lg text-[#777B73] hover:text-[#14543D] hover:bg-[#F3F5E9] cursor-pointer"
                              title="تعديل السؤال"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q)}
                              className="p-1.5 rounded-lg text-[#777B73] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="حذف السؤال"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-[#EAF2EE] text-[#14543D] flex items-center justify-center mx-auto">
                <FolderPlus className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-[#252824]">اختر أو أنشئ قائمة للبدء</h3>
                <p className="text-xs text-[#777B73] max-w-sm mx-auto">
                  يمكنك تنظيم أسئلتك في قوائم متعددة، مثل «أسئلة كروية مع الأصدقاء» أو «تحديات الأنمي».
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateListModal}
                className="px-5 py-2.5 rounded-xl bg-[#14543D] text-white text-xs font-bold hover:bg-[#0E3B2B] inline-flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <FolderPlus className="w-4 h-4" />
                <span>إنشاء قائمة جديدة الآن</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Create / Edit List */}
      {listModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-3xl border border-[#E5E8DD] max-w-md w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E8DD]">
              <h3 className="font-display font-bold text-base text-[#252824]">
                {editingList ? 'تعديل اسم القائمة' : 'إنشاء قائمة أسئلة جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setListModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-[#777B73]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveList} className="space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#252824]">
                  اسم القائمة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={listFormName}
                  onChange={(e) => setListFormName(e.target.value)}
                  placeholder="مثال: أسئلة العائلة، أساطير ون بيس..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#252824]">وصف القائمة (اختياري)</label>
                <textarea
                  rows={3}
                  value={listFormDesc}
                  onChange={(e) => setListFormDesc(e.target.value)}
                  placeholder="ملاحظات أو وصف للقائمة..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setListModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#777B73] hover:bg-[#F3F5E9] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-[#14543D] text-white text-xs font-bold hover:bg-[#0E3B2B] shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? 'جارٍ الحفظ...' : editingList ? 'حفظ التعديلات' : 'إنشاء القائمة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create / Edit Question */}
      {questionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#FFFFFF] rounded-3xl border border-[#E5E8DD] max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E8DD]">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#F07842]" />
                <h3 className="font-display font-bold text-base text-[#252824]">
                  {editingQuestion ? 'تعديل السؤال' : 'إضافة سؤال جديد إلى قائمتك'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuestionModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-[#777B73]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4 text-right">
              {/* Category Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#252824]">
                    التصنيف الرئيسي <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formMainCatId}
                    onChange={(e) => {
                      const newMainId = e.target.value;
                      setFormMainCatId(newMainId);
                      const matchingSubs = subcategories.filter(
                        (s) => s.isActive && (s.mainCategoryId === newMainId || !s.mainCategoryId)
                      );
                      setFormSubcatId(matchingSubs[0]?.id || '');
                    }}
                    className="w-full px-3 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                  >
                    {mainCategories
                      .filter((m) => m.isActive)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#252824]">
                    التصنيف الفرعي <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formSubcatId}
                    onChange={(e) => setFormSubcatId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                  >
                    {availableSubcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Point Values Segmented Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#252824]">
                  قيمة السؤال والنقاط ({POINT_TO_DIFFICULTY[formPoints]})
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {([100, 200, 300, 400, 500] as PointValue[]).map((pts) => {
                    const isSelected = formPoints === pts;
                    return (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setFormPoints(pts)}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#14543D] text-white border-[#14543D] shadow-xs'
                            : 'bg-[#FBFDFB] text-[#777B73] border-[#E5E8DD] hover:border-[#14543D]/30'
                        }`}
                      >
                        {pts}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Question Text */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#252824]">
                  نص السؤال (مباشر ومحدد) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  placeholder="اكتب السؤال بصيغة مباشرة وواضحة..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                />
              </div>

              {/* Correct Answer */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#252824]">
                  الإجابة الصحيحة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formCorrectAnswer}
                  onChange={(e) => setFormCorrectAnswer(e.target.value)}
                  placeholder="الإجابة الصحيحة والدقيقة..."
                  className="w-full px-3.5 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                />
              </div>

              {/* Explanation & Source */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#252824]">شرح الإجابة (اختياري)</label>
                  <input
                    type="text"
                    value={formExplanation}
                    onChange={(e) => setFormExplanation(e.target.value)}
                    placeholder="معلومات إضافية توضيحية..."
                    className="w-full px-3 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#252824]">المصدر أو المرجع (اختياري)</label>
                  <input
                    type="text"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    placeholder="مثال: ويكيبيديا، موقع الفيفا..."
                    className="w-full px-3 py-2 text-xs bg-[#FBFDFB] border border-[#E5E8DD] rounded-xl focus:outline-none focus:border-[#14543D]"
                  />
                </div>
              </div>

              {/* Optional Image Upload */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-[#252824] flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#F07842]" />
                  <span>صورة السؤال (اختياري)</span>
                </label>

                {imagePreview ? (
                  <div className="flex items-center gap-3 p-3 bg-[#F3F5E9]/50 border border-[#E5E8DD] rounded-xl">
                    <img
                      src={imagePreview}
                      alt="معاينة الصورة"
                      className="w-16 h-16 object-cover rounded-lg border border-[#E5E8DD]"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-xs font-bold text-[#252824]">صورة مرفقة بالسؤال</div>
                      <input
                        type="text"
                        value={formImageDesc}
                        onChange={(e) => setFormImageDesc(e.target.value)}
                        placeholder="وصف مختصر للصورة..."
                        className="w-full px-2.5 py-1 text-[11px] bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="حذف الصورة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#E5E8DD] hover:border-[#14543D]/40 rounded-xl cursor-pointer bg-[#FBFDFB] hover:bg-[#F3F5E9]/30 transition-colors">
                    <UploadCloud className="w-6 h-6 text-[#777B73] mb-1" />
                    <span className="text-xs font-bold text-[#14543D]">اضغط لرفع صورة من جهازك</span>
                    <span className="text-[10px] text-[#777B73]">صيغ مدعومة: JPG, PNG, WEBP (حتى 5 ميجابايت)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E8DD]">
                <button
                  type="button"
                  onClick={() => setQuestionModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#777B73] hover:bg-[#F3F5E9] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || uploadingImage}
                  className="px-6 py-2 rounded-xl bg-[#14543D] text-white text-xs font-bold hover:bg-[#0E3B2B] shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploadingImage
                    ? 'جارٍ رفع الصورة...'
                    : actionLoading
                    ? 'جارٍ الحفظ...'
                    : editingQuestion
                    ? 'حفظ التعديلات'
                    : 'إضافة السؤال'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Rejection Reason Details Modal */}
      {viewingRejection && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-3xl border border-rose-200 max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-right">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E8DD]">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
                <XCircle className="w-5 h-5" />
                <span>سبب رفض السؤال من الإدارة</span>
              </div>
              <button
                type="button"
                onClick={() => setViewingRejection(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-[#777B73]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-[#777B73]">السؤال:</div>
              <div className="font-bold text-[#252824] p-3 rounded-xl bg-[#F3F5E9]">
                {viewingRejection.questionText}
              </div>
              <div className="text-[#777B73] pt-1">ملاحظة المشرف وسبب الرفض:</div>
              <div className="p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 leading-relaxed">
                {viewingRejection.reason}
              </div>
            </div>

            <div className="pt-2 text-left">
              <button
                type="button"
                onClick={() => setViewingRejection(null)}
                className="px-4 py-2 rounded-xl bg-[#14543D] text-white text-xs font-bold cursor-pointer"
              >
                فهمت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Full Image Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img
              src={previewImageUrl}
              alt="صورة السؤال مكبرة"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 left-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
