import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FolderPlus,
  Plus,
  Trash2,
  Edit3,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  BookOpen,
  FolderTree,
  ChevronRight,
  Search,
  Sparkles,
  UploadCloud,
  X,
  Eye,
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
  uploadUserQuestionImageToCloudinary,
  submitQuestionToAdmin,
} from '../services/contributionService';
import {
  isValidHttpUrl,
  validateQuestionImageFile,
} from '../utils/questionMedia';
import {
  AlertBanner,
  ConfirmDialog,
  EmptyState,
  LoadingState,
  ModalShell,
  StatusBadge,
  UI_CLASSES,
} from '../components/ui';

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
  const [questionModalError, setQuestionModalError] = useState<string | null>(null);
  const isSavingQuestionRef = useRef(false);
  const blobPreviewUrlRef = useRef<string | null>(null);

  // Feedback Notification Banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Preview Image Modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Rejection Reason Details Modal
  const [viewingRejection, setViewingRejection] = useState<{ questionText: string; reason: string } | null>(null);

  // Unified ConfirmDialog state (replaces window.confirm)
  const [confirmState, setConfirmState] = useState<
    | { kind: 'delete_list'; listId: string; listName: string }
    | { kind: 'delete_question'; question: UserCustomQuestion }
    | { kind: 'submit_review'; question: UserCustomQuestion }
    | null
  >(null);

  useEffect(() => {
    if (!previewImageUrl) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPreviewImageUrl(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImageUrl]);

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

  const handleDeleteList = (listId: string, listName: string) => {
    if (!user) return;
    setConfirmState({ kind: 'delete_list', listId, listName });
  };

  const executeConfirmAction = async () => {
    if (!user || !confirmState) return;
    setActionLoading(true);
    try {
      if (confirmState.kind === 'delete_list') {
        const { listId } = confirmState;
        await deleteUserList(user.uid, listId);
        const remaining = lists.filter((l) => l.id !== listId);
        setLists(remaining);
        if (activeListId === listId) {
          setActiveListId(remaining.length > 0 ? remaining[0].id : null);
        }
        showFeedback('success', 'تم حذف القائمة وأسئلتها بنجاح.');
      } else if (confirmState.kind === 'delete_question') {
        const { question: q } = confirmState;
        await deleteUserQuestion(user.uid, q.id, q.imageStoragePath);
        setQuestions((prev) => prev.filter((item) => item.id !== q.id));
        showFeedback('success', 'تم حذف السؤال من القائمة.');
      } else if (confirmState.kind === 'submit_review') {
        const { question: q } = confirmState;
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
      }
      setConfirmState(null);
    } catch (err: any) {
      console.error('Confirm action failed:', err);
      if (confirmState.kind === 'delete_list') {
        showFeedback('error', 'تعذر حذف القائمة.');
      } else if (confirmState.kind === 'delete_question') {
        showFeedback('error', 'تعذر حذف السؤال.');
      } else {
        showFeedback('error', 'تعذر إرسال السؤال للمراجعة. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const revokeBlobPreview = () => {
    if (blobPreviewUrlRef.current) {
      URL.revokeObjectURL(blobPreviewUrlRef.current);
      blobPreviewUrlRef.current = null;
    }
  };

  const handleCloseQuestionModal = () => {
    if (isSavingQuestionRef.current || actionLoading || uploadingImage) return;
    revokeBlobPreview();
    setImageFile(null);
    setImagePreview(null);
    setQuestionModalError(null);
    setQuestionModalOpen(false);
  };

  // Open Create/Edit Question Modal
  const openCreateQuestionModal = () => {
    if (!activeListId) {
      showFeedback('info', 'يرجى إنشاء قائمة أو اختيارها أولاً لإضافة الأسئلة.');
      return;
    }
    revokeBlobPreview();
    setQuestionModalError(null);
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
    revokeBlobPreview();
    setQuestionModalError(null);
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
    e.target.value = '';
    if (!file) return;

    const validationError = validateQuestionImageFile(file);
    if (validationError) {
      setQuestionModalError(validationError);
      return;
    }

    setQuestionModalError(null);
    revokeBlobPreview();
    const previewUrl = URL.createObjectURL(file);
    blobPreviewUrlRef.current = previewUrl;
    setImageFile(file);
    setImagePreview(previewUrl);
  };

  const handleRemoveImage = () => {
    revokeBlobPreview();
    setImageFile(null);
    setImagePreview(null);
    setFormImageUrl('');
    setFormImageStoragePath('');
    setFormImageDesc('');
    setQuestionModalError(null);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeListId || isSavingQuestionRef.current || actionLoading || uploadingImage) return;
    setQuestionModalError(null);

    const qText = formQuestionText.trim();
    const ans = formCorrectAnswer.trim();
    if (!qText || !ans) {
      setQuestionModalError('يرجى كتابة نص السؤال والإجابة الصحيحة.');
      return;
    }

    const mainCat = mainCategories.find((m) => m.id === formMainCatId);
    const subcat = subcategories.find((s) => s.id === formSubcatId);
    if (!subcat) {
      setQuestionModalError('يرجى اختيار فئة فرعية صحيحة.');
      return;
    }

    isSavingQuestionRef.current = true;
    setActionLoading(true);
    let finalImageUrl = formImageUrl.trim();
    let finalStoragePath = formImageStoragePath.trim();

    try {
      // 1. Upload new image to Cloudinary (signed) and await verified HTTPS URL before saving to Firestore
      if (imageFile) {
        setUploadingImage(true);
        try {
          const uploadRes = await uploadUserQuestionImageToCloudinary(imageFile, user.uid);
          if (!isValidHttpUrl(uploadRes.downloadUrl)) {
            throw new Error('لم يتم استلام رابط صورة صالح من Cloudinary.');
          }
          finalImageUrl = uploadRes.downloadUrl;
          finalStoragePath = uploadRes.storagePath;
          setFormImageUrl(uploadRes.downloadUrl);
          setFormImageStoragePath(uploadRes.storagePath);
        } finally {
          setUploadingImage(false);
        }
      }

      if (imageFile && !isValidHttpUrl(finalImageUrl)) {
        throw new Error('تعذر التحقق من رابط الصورة الصالح قبل حفظ السؤال.');
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
        imageStoragePath: finalImageUrl ? finalStoragePath : '',
        imageDescription: finalImageUrl ? formImageDesc.trim() : '',
      };

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
        showFeedback('success', 'تم تحديث السؤال وحفظه بنجاح.');
      } else {
        const createdQ = await createUserQuestion(user.uid, payload);
        setQuestions((prev) => [createdQ, ...prev]);
        showFeedback(
          'success',
          finalImageUrl
            ? 'تمت إضافة السؤال الجديد وحفظ الصورة وربطها بالسؤال بنجاح.'
            : 'تمت إضافة السؤال الجديد إلى قائمتك.'
        );
      }

      revokeBlobPreview();
      setImageFile(null);
      setImagePreview(null);
      setQuestionModalOpen(false);
    } catch (err: any) {
      console.error('Error saving question:', err);
      const errMsg =
        err instanceof Error && err.message
          ? err.message
          : 'تعذر حفظ السؤال. يرجى المحاولة لاحقاً.';
      setQuestionModalError(errMsg);
    } finally {
      isSavingQuestionRef.current = false;
      setActionLoading(false);
    }
  };

  const handleDeleteQuestion = (q: UserCustomQuestion) => {
    if (!user) return;
    setConfirmState({ kind: 'delete_question', question: q });
  };

  const handleSubmitForReview = (q: UserCustomQuestion) => {
    if (!user) return;
    if (q.contributionStatus === 'pending') {
      showFeedback('info', 'هذا السؤال تم إرساله وهو حالياً قيد المراجعة لدى الإدارة.');
      return;
    }
    if (q.contributionStatus === 'approved') {
      showFeedback('info', 'هذا السؤال تم اعتماده مسبقاً في بنك أسئلة نِزال العام!');
      return;
    }
    setConfirmState({ kind: 'submit_review', question: q });
  };

  // Render Logged Out View
  if (!user) {
    return (
      <div className="max-w-[800px] mx-auto px-3 sm:px-6 py-8 md:py-16 text-center space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-[#14543D]/10 text-[#14543D] flex items-center justify-center mx-auto shadow-inner">
          <BookOpen className="w-10 h-10" />
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1B1F1C]">
          قائمتي الخاصة — بنك الأسئلة الشخصي
        </h1>
        <p className="text-sm sm:text-base text-[#52574E] max-w-lg mx-auto leading-relaxed">
          سجل دخولك لتتمكن من إنشاء قوائم أسئلتك المخصصة، وإضافة أسئلتك وإجاباتها، والمساهمة مع مجتمع «نِزال» في بناء بنك الأسئلة الشامل.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className={`${UI_CLASSES.btnPrimary} w-full sm:w-auto px-6 min-h-[46px] shadow-sm`}
          >
            تسجيل الدخول / إنشاء حساب
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className={`${UI_CLASSES.btnOutline} w-full sm:w-auto px-5 min-h-[46px] text-[#52574E]`}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1320px] mx-auto px-3 sm:px-6 py-5 md:py-8 space-y-6 md:space-y-8">
      {/* Toast Notification Banner */}
      {feedback && (
        <AlertBanner
          tone={feedback.type === 'success' ? 'success' : feedback.type === 'error' ? 'error' : 'warning'}
          onDismiss={() => setFeedback(null)}
        >
          {feedback.message}
        </AlertBanner>
      )}

      {/* Page Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 sm:p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 shadow-xs">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#F07842]">
            <Sparkles className="w-4 h-4" />
            <span>بنك الأسئلة الشخصي ومساهمات الأعضاء</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-[#14543D]">
            قائمتي الخاصة
          </h1>
          <p className="text-xs sm:text-sm text-[#52574E] max-w-2xl leading-relaxed">
            أنشئ قوائم أسئلتك المخصصة لمناسباتك أو أصدقائك، واصنع أسئلة مصورة أو نصية مباشرة، وشاركها مع مجتمع «نِزال» عبر زر «إرسال للمراجعة» لتُعتمد رسمياً في اللعبة!
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={openCreateListModal}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#14543D] hover:bg-[#0E3B2B] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>إنشاء قائمة جديدة</span>
          </button>
          <button
            type="button"
            disabled={!activeListId}
            onClick={openCreateQuestionModal}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
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
              <div className="flex items-center gap-2 text-xs font-bold text-[#1B1F1C]">
                <FolderTree className="w-4 h-4 text-[#14543D]" />
                <span className="tabular-nums">قوائمي ({lists.length})</span>
              </div>
              <button
                type="button"
                onClick={openCreateListModal}
                className="min-h-[36px] px-2 text-xs font-bold text-[#F07842] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>قائمة</span>
              </button>
            </div>

            {loadingLists ? (
              <div className="py-6 text-center text-xs text-[#52574E]">جارٍ تحميل القوائم...</div>
            ) : lists.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-xs text-[#666B62]">لم تنشئ أي قائمة بعد.</p>
                <button
                  type="button"
                  onClick={openCreateListModal}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#EAF2EE] text-[#14543D] text-xs font-bold hover:bg-[#D7E6DF] cursor-pointer"
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
                          : 'bg-[#F7F8F1] hover:bg-[#F3F5E9] border-[#E5E8DD] text-[#1B1F1C]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate">{l.name}</div>
                        {l.description && (
                          <div className="text-[11px] text-[#52574E] truncate">{l.description}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditListModal(l);
                          }}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[#52574E] hover:text-[#14543D] hover:bg-black/5 transition-colors cursor-pointer"
                          title="تعديل القائمة"
                          aria-label={`تعديل القائمة ${l.name}`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteList(l.id, l.name);
                          }}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-[#52574E] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="حذف القائمة"
                          aria-label={`حذف القائمة ${l.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            isActive ? 'rotate-180 text-[#14543D]' : 'text-[#666B62]'
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
                    <h2 className="font-display text-xl font-bold text-[#1B1F1C]">{activeList.name}</h2>
                    {activeList.description && (
                      <p className="text-xs text-[#52574E] mt-0.5">{activeList.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditListModal(activeList)}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#E5E8DD] text-xs font-bold text-[#52574E] hover:text-[#14543D] hover:bg-[#F7F8F1] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={openCreateQuestionModal}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#14543D] text-white text-xs font-bold hover:bg-[#0E3B2B] flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة سؤال</span>
                    </button>
                  </div>
                </div>

                {/* Search & Filters Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="relative min-w-0 w-full sm:flex-1 sm:min-w-[200px]">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#666B62]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث في الأسئلة أو الإجابات..."
                      aria-label="ابحث في الأسئلة أو الإجابات"
                      className="w-full min-h-[42px] pl-3 pr-9 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] placeholder:text-[#666B62] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15 transition-colors"
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      aria-label="تصفية حسب الحالة"
                      className="min-h-[42px] px-3 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] font-medium focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
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
                      aria-label="تصفية حسب النقاط"
                      className="min-h-[42px] px-3 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] font-medium focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
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
                      className="min-w-[42px] min-h-[42px] rounded-xl bg-[#F7F8F1] hover:bg-[#E5E8DD] text-[#52574E] hover:text-[#14543D] border border-[#E5E8DD] flex items-center justify-center cursor-pointer transition-colors"
                      title="تحديث الأسئلة"
                      aria-label="تحديث الأسئلة"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              {loadingQuestions ? (
                <LoadingState message="جارٍ تحميل أسئلة القائمة..." />
              ) : filteredQuestions.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="w-6 h-6" />}
                  title="لا توجد أسئلة في هذه القائمة حالياً"
                  description="ابدأ بإضافة أول سؤال، حدد نقاطه وفئته، وأرسله للمراجعة ليدخل بنك أسئلة نِزال!"
                  action={
                    <button
                      type="button"
                      onClick={openCreateQuestionModal}
                      className={`${UI_CLASSES.btnGreen} text-xs`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة أول سؤال</span>
                    </button>
                  }
                />
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
                            <StatusBadge tone="green">
                              {q.mainCategory} · {q.category}
                            </StatusBadge>
                            <StatusBadge tone="orange" className="font-mono">
                              {q.points} نقطة ({q.difficulty})
                            </StatusBadge>
                            {q.imageUrl && (
                              <StatusBadge tone="neutral">
                                <ImageIcon className="w-3 h-3 text-[#F07842]" />
                                <span>سؤال مصوّر</span>
                              </StatusBadge>
                            )}
                          </div>

                          {/* Contribution Status Badge */}
                          <div className="flex items-center gap-1.5">
                            {isDraft && (
                              <StatusBadge tone="neutral">
                                <Edit3 className="w-3 h-3" />
                                <span>مسودة شخصية</span>
                              </StatusBadge>
                            )}
                            {isPending && (
                              <StatusBadge tone="amber">
                                <Clock className="w-3 h-3" />
                                <span>قيد المراجعة</span>
                              </StatusBadge>
                            )}
                            {isApproved && (
                              <StatusBadge tone="green">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>معتمد في بنك نِزال</span>
                              </StatusBadge>
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
                                className="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 hover:bg-rose-100 cursor-pointer transition-colors"
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
                                className="w-24 h-24 object-cover rounded-xl border border-[#E5E8DD] bg-[#F7F8F1] cursor-pointer"
                                onClick={() => setPreviewImageUrl(q.imageUrl || null)}
                              />
                              <button
                                type="button"
                                onClick={() => setPreviewImageUrl(q.imageUrl || null)}
                                aria-label="تكبير صورة السؤال"
                                className="absolute inset-0 bg-black/40 text-white rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="تكبير الصورة"
                              >
                                <Eye className="w-5 h-5" />
                              </button>
                            </div>
                          )}

                          <div className="flex-1 space-y-1.5 min-w-0">
                            <h4 className="font-bold text-sm text-[#1B1F1C] leading-relaxed">
                              {q.questionText}
                            </h4>

                            <div className="p-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] space-y-1 text-xs">
                              <div>
                                <span className="font-bold text-[#14543D]">الإجابة الصحيحة: </span>
                                <span className="text-[#1B1F1C]">{q.correctAnswer}</span>
                              </div>
                              {q.explanation && (
                                <div className="text-[11px] text-[#52574E]">
                                  <span className="font-bold text-[#52574E]">الشرح: </span>
                                  <span>{q.explanation}</span>
                                </div>
                              )}
                              {q.source && (
                                <div className="text-[10px] text-[#666B62]">
                                  <span>المصدر: {q.source}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer: Actions */}
                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#E5E8DD]/60">
                          <div className="text-[10px] text-[#666B62]">
                            أُضيف في {new Date(q.createdAt).toLocaleDateString('ar-SA')}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Send for Review Button */}
                            {(isDraft || isRejected) && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => handleSubmitForReview(q)}
                                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                                title="إرسال هذا السؤال لمراجعته من إدارة نِزال"
                              >
                                <Send className="w-3.5 h-3.5" />
                                <span>إرسال للمراجعة</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openEditQuestionModal(q)}
                              className="min-w-[40px] min-h-[40px] rounded-xl text-[#52574E] hover:text-[#14543D] hover:bg-[#F7F8F1] border border-transparent hover:border-[#E5E8DD] flex items-center justify-center cursor-pointer transition-colors"
                              title="تعديل السؤال"
                              aria-label="تعديل السؤال"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q)}
                              className="min-w-[40px] min-h-[40px] rounded-xl text-[#52574E] hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                              title="حذف السؤال"
                              aria-label="حذف السؤال"
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
            <EmptyState
              icon={<FolderPlus className="w-7 h-7 text-[#14543D]" />}
              title="اختر أو أنشئ قائمة للبدء"
              description="يمكنك تنظيم أسئلتك في قوائم متعددة، مثل «أسئلة كروية مع الأصدقاء» أو «تحديات الأنمي»."
              action={
                <button
                  type="button"
                  onClick={openCreateListModal}
                  className={`${UI_CLASSES.btnGreen} text-xs`}
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>إنشاء قائمة جديدة الآن</span>
                </button>
              }
            />
          )}
        </div>
      </div>

      {/* MODAL 1: Create / Edit List */}
      <ModalShell
        isOpen={listModalOpen}
        onClose={() => setListModalOpen(false)}
        title={editingList ? 'تعديل اسم القائمة' : 'إنشاء قائمة أسئلة جديدة'}
        icon={<FolderPlus className="w-4 h-4 text-[#F07842]" />}
        headerTone="dark"
        maxWidth="md"
        closeDisabled={actionLoading}
      >
        <form onSubmit={handleSaveList} className="space-y-4 text-right">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1B1F1C]">
              اسم القائمة <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={listFormName}
              onChange={(e) => setListFormName(e.target.value)}
              placeholder="مثال: أسئلة العائلة، أساطير ون بيس..."
              className="w-full min-h-[44px] px-3.5 py-2 text-xs sm:text-sm bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#1B1F1C]">وصف القائمة (اختياري)</label>
            <textarea
              rows={3}
              value={listFormDesc}
              onChange={(e) => setListFormDesc(e.target.value)}
              placeholder="ملاحظات أو وصف للقائمة..."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setListModalOpen(false)}
              className={`${UI_CLASSES.btnNeutral} text-xs`}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className={`${UI_CLASSES.btnGreen} text-xs`}
            >
              {actionLoading ? 'جارٍ الحفظ...' : editingList ? 'حفظ التعديلات' : 'إنشاء القائمة'}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* MODAL 2: Create / Edit Question */}
      <ModalShell
        isOpen={questionModalOpen}
        onClose={handleCloseQuestionModal}
        title={editingQuestion ? 'تعديل السؤال' : 'إضافة سؤال جديد إلى قائمتك'}
        icon={<BookOpen className="w-4 h-4 text-[#F07842]" />}
        headerTone="dark"
        maxWidth="2xl"
        closeDisabled={actionLoading || uploadingImage}
      >
        <form onSubmit={handleSaveQuestion} className="space-y-4 text-right">
          {questionModalError && (
            <AlertBanner tone="error">{questionModalError}</AlertBanner>
          )}
          {/* Category Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F1C]">
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
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
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
              <label className="text-xs font-bold text-[#1B1F1C]">
                التصنيف الفرعي <span className="text-rose-500">*</span>
              </label>
              <select
                value={formSubcatId}
                onChange={(e) => setFormSubcatId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
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
            <label className="text-xs font-bold text-[#1B1F1C]">
              قيمة السؤال والنقاط ({POINT_TO_DIFFICULTY[formPoints]})
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {([100, 200, 300, 400, 500] as PointValue[]).map((pts) => {
                const isSelected = formPoints === pts;
                return (
                  <button
                    key={pts}
                    type="button"
                    onClick={() => setFormPoints(pts)}
                    className={`py-2 min-h-[42px] text-xs font-mono font-bold tabular-nums rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#14543D] text-white border-[#14543D] shadow-xs'
                        : 'bg-[#F7F8F1] text-[#52574E] border-[#E5E8DD] hover:border-[#F07842]/50'
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
            <label className="text-xs font-bold text-[#1B1F1C]">
              نص السؤال (مباشر ومحدد) <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={formQuestionText}
              onChange={(e) => setFormQuestionText(e.target.value)}
              placeholder="اكتب السؤال بصيغة مباشرة وواضحة..."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          {/* Correct Answer */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1B1F1C]">
              الإجابة الصحيحة <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formCorrectAnswer}
              onChange={(e) => setFormCorrectAnswer(e.target.value)}
              placeholder="الإجابة الصحيحة والدقيقة..."
              className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
            />
          </div>

          {/* Explanation & Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F1C]">شرح الإجابة (اختياري)</label>
              <input
                type="text"
                value={formExplanation}
                onChange={(e) => setFormExplanation(e.target.value)}
                placeholder="معلومات إضافية توضيحية..."
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1B1F1C]">المصدر أو المرجع (اختياري)</label>
              <input
                type="text"
                value={formSource}
                onChange={(e) => setFormSource(e.target.value)}
                placeholder="مثال: ويكيبيديا، موقع الفيفا..."
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl text-[#1B1F1C] focus:bg-white focus:outline-none focus:border-[#F07842] focus:ring-2 focus:ring-[#F07842]/15"
              />
            </div>
          </div>

          {/* Optional Image Upload */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-[#1B1F1C] flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-[#F07842]" />
              <span>صورة السؤال (اختياري)</span>
            </label>

            {imagePreview ? (
              <div className="flex items-center gap-3 p-3 bg-[#F7F8F1] border border-[#E5E8DD] rounded-xl">
                <img
                  src={imagePreview}
                  alt="معاينة الصورة"
                  className="w-16 h-16 object-cover rounded-lg border border-[#E5E8DD]"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-bold text-[#1B1F1C]">صورة مرفقة بالسؤال</div>
                  <input
                    type="text"
                    value={formImageDesc}
                    onChange={(e) => setFormImageDesc(e.target.value)}
                    placeholder="وصف مختصر للصورة..."
                    className="w-full min-h-[34px] px-2.5 py-1 text-[11px] bg-[#FFFFFF] border border-[#E5E8DD] rounded-lg focus:outline-none focus:border-[#F07842]"
                  />
                </div>
                <button
                  type="button"
                  disabled={actionLoading || uploadingImage}
                  onClick={handleRemoveImage}
                  aria-label="حذف الصورة المرفقة"
                  className="min-w-[36px] min-h-[36px] rounded-lg text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer disabled:opacity-50"
                  title="حذف الصورة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-[#E5E8DD] hover:border-[#F07842]/50 rounded-xl cursor-pointer bg-[#F7F8F1] hover:bg-[#FEF2EC]/40 transition-colors">
                <UploadCloud className="w-6 h-6 text-[#666B62] mb-1" />
                <span className="text-xs font-bold text-[#14543D]">اضغط لرفع صورة من جهازك</span>
                <span className="text-[10px] text-[#666B62]">صيغ مدعومة: JPG, PNG, WEBP (حتى 5 ميجابايت)</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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
              disabled={actionLoading || uploadingImage}
              onClick={handleCloseQuestionModal}
              className={`${UI_CLASSES.btnNeutral} text-xs`}
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={actionLoading || uploadingImage}
              className={`${UI_CLASSES.btnGreen} text-xs`}
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
      </ModalShell>

      {/* MODAL 3: Rejection Reason Details Modal */}
      <ModalShell
        isOpen={Boolean(viewingRejection)}
        onClose={() => setViewingRejection(null)}
        title="سبب رفض السؤال من الإدارة"
        icon={<XCircle className="w-4 h-4" />}
        headerTone="danger"
        maxWidth="md"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setViewingRejection(null)}
              className={`${UI_CLASSES.btnGreen} text-xs`}
            >
              فهمت
            </button>
          </div>
        }
      >
        {viewingRejection && (
          <div className="space-y-3 text-xs text-right">
            <div className="text-[#52574E] font-bold">السؤال:</div>
            <div className="font-bold text-[#1B1F1C] p-3 rounded-xl bg-[#F7F8F1] border border-[#E5E8DD] leading-relaxed">
              {viewingRejection.questionText}
            </div>
            <div className="text-[#52574E] font-bold pt-1">ملاحظة المشرف وسبب الرفض:</div>
            <div className="p-3 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 leading-relaxed">
              {viewingRejection.reason}
            </div>
          </div>
        )}
      </ModalShell>

      {/* MODAL 4: Full Image Preview Modal */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-[#1B1F1C]/85 flex items-center justify-center p-3 sm:p-4 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة صورة السؤال مكبرة"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90dvh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImageUrl}
              alt="صورة السؤال مكبرة"
              className="max-h-[82dvh] max-w-[94vw] rounded-2xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              aria-label="إغلاق المعاينة"
              className="absolute top-3 left-3 min-w-[44px] min-h-[44px] bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG (Delete List / Delete Question / Submit for Review) */}
      <ConfirmDialog
        isOpen={confirmState !== null}
        onClose={() => setConfirmState(null)}
        onConfirm={executeConfirmAction}
        title={
          confirmState?.kind === 'delete_list'
            ? 'حذف قائمة الأسئلة'
            : confirmState?.kind === 'delete_question'
            ? 'حذف السؤال'
            : 'إرسال السؤال للمراجعة'
        }
        message={
          confirmState?.kind === 'delete_list'
            ? `هل أنت متأكد من حذف القائمة «${confirmState.listName}»؟ سيتم حذف جميع الأسئلة الموجودة بداخلها.`
            : confirmState?.kind === 'delete_question'
            ? 'هل أنت متأكد من حذف هذا السؤال من قائمتك نهائياً؟'
            : 'هل ترغب في إرسال هذا السؤال إلى إدارة نِزال للمراجعة والاعتماد في بنك الأسئلة العام؟'
        }
        confirmLabel={
          confirmState?.kind === 'submit_review' ? 'إرسال للمراجعة' : 'تأكيد الحذف'
        }
        tone={confirmState?.kind === 'submit_review' ? 'green' : 'danger'}
        loading={actionLoading}
      />
    </div>
  );
};
