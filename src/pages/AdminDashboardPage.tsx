import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  ShieldCheck,
  LogIn,
  LogOut,
  Plus,
  Search,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  XCircle,
  Edit3,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FolderTree,
  FileQuestion,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Image as ImageIcon,
  MessageCircle,
  Crop,
  Check,
  LayoutGrid,
  Inbox,
  BarChart3,
  Clock,
} from 'lucide-react';
import { AdminPlayerAnalytics } from '../components/AdminPlayerAnalytics';
import {
  ApprovalStatus,
  ContactSettings,
  DifficultyLevel,
  DIFFICULTY_TO_POINTS,
  MainCategoryIconName,
  MainCategoryMeta,
  MainCategoryName,
  PointValue,
  POINT_TO_DIFFICULTY,
  QuestionType,
  SubcategoryItem,
  TARGET_QUESTIONS_PER_CATEGORY,
  TARGET_TOTAL_QUESTIONS,
  TriviaQuestion,
  UserContribution,
} from '../types/game';
import {
  fetchAllContributionsForAdmin,
  approveAndPublishContribution,
  rejectContribution,
} from '../services/contributionService';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryCardArtwork } from '../components/CategoryCardArtwork';
import { ImageCropModal } from '../components/ImageCropModal';
import {
  bulkDeleteFromFirestore,
  bulkUpdateStatusInFirestore,
  convertExistingQuestionsToDirectInFirestore,
  createQuestionInFirestore,
  CreateQuestionPayload,
  deleteMainCategoryFromFirestore,
  deleteQuestionFromFirestore,
  deleteQuestionImageFromStorage,
  deleteSubcategorySafeFromFirestore,
  matchesSubcategoryQuestion,
  saveContactSettingsToFirestore,
  saveMainCategoryImageToFirestore,
  saveMainCategoryToFirestore,
  saveSubcategoryImageToFirestore,
  saveSubcategoryToFirestore,
  updateQuestionInFirestore,
  updateQuestionStatusInFirestore,
  uploadCategoryImageToFirebase,
  uploadQuestionImageToStorage,
  validateQuestionImageFile,
} from '../services/questionService';

interface AdminDashboardPageProps {
  user: User | null;
  isAdmin: boolean;
  authLoading: boolean;
  mainCategories: MainCategoryMeta[];
  questions: TriviaQuestion[];
  subcategories: SubcategoryItem[];
  contactSettings: ContactSettings;
  loadingQuestions: boolean;
  onLoginGoogle?: () => Promise<void> | void;
  onOpenAuthModal?: () => void;
  onLogout: () => Promise<void>;
  onRefreshQuestions: () => Promise<void>;
  onRefreshSubcategories: () => Promise<void>;
  onRefreshMainCategories: () => Promise<void>;
  onRefreshContactSettings: () => Promise<void>;
  onSeedFoundationalPack: () => Promise<void>;
  seeding: boolean;
}

type AdminTab =
  | 'main_categories'
  | 'subcategories'
  | 'images'
  | 'questions'
  | 'contact'
  | 'contributions'
  | 'player_analytics';

const DIFFICULTIES_LIST: DifficultyLevel[] = [
  'سهل',
  'متوسط',
  'صعب',
  'صعب جداً',
  'خبير',
];

const ICON_OPTIONS: { id: MainCategoryIconName; label: string }[] = [
  { id: 'compass', label: 'عام / بوصلة' },
  { id: 'football', label: 'كرة قدم' },
  { id: 'trophy', label: 'رياضات / كأس' },
  { id: 'moon', label: 'الدين / هلال' },
  { id: 'globe', label: 'جغرافيا وتاريخ' },
  { id: 'sparkles', label: 'أنمي / نجوم' },
  { id: 'gamepad', label: 'ألعاب' },
];

function normalizeArabicText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  user,
  isAdmin,
  authLoading,
  mainCategories,
  questions,
  subcategories,
  contactSettings,
  loadingQuestions,
  onLoginGoogle,
  onOpenAuthModal,
  onLogout,
  onRefreshQuestions,
  onRefreshSubcategories,
  onRefreshMainCategories,
  onRefreshContactSettings,
  onSeedFoundationalPack,
  seeding,
}) => {
  const [adminTab, setAdminTab] = useState<AdminTab>('main_categories');

  // Filter & Search States for Questions
  const [searchQuery, setSearchQuery] = useState('');
  const [mainCategoryFilter, setMainCategoryFilter] = useState<string>('الكل');
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('الكل');
  const [typeFilter, setTypeFilter] = useState<string>('الكل');
  const [statusFilter, setStatusFilter] = useState<string>('الكل');
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [questionsPage, setQuestionsPage] = useState<number>(1);
  const questionsPerPage = 50;

  // Reset to first page whenever question filters change
  useEffect(() => {
    setQuestionsPage(1);
  }, [
    mainCategoryFilter,
    categoryFilter,
    difficultyFilter,
    typeFilter,
    statusFilter,
    showDuplicatesOnly,
    searchQuery,
  ]);

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Main Category Add / Edit Modal State
  const [mainModalOpen, setMainModalOpen] = useState(false);
  const [editingMainCategory, setEditingMainCategory] =
    useState<MainCategoryMeta | null>(null);
  const [mainFormName, setMainFormName] = useState('');
  const [mainFormDescription, setMainFormDescription] = useState('');
  const [mainFormImageUrl, setMainFormImageUrl] = useState('');
  const [mainFormSortOrder, setMainFormSortOrder] = useState<number>(1);
  const [mainFormIsActive, setMainFormIsActive] = useState<boolean>(true);
  const [mainFormIsComingSoon, setMainFormIsComingSoon] = useState<boolean>(false);
  const [mainFormIconName, setMainFormIconName] =
    useState<MainCategoryIconName>('compass');

  // Main Category Website Card Preview Modal State
  const [previewMainCategory, setPreviewMainCategory] =
    useState<MainCategoryMeta | null>(null);

  // Safe Delete Main Category Confirmation Modal State
  const [deletingMainCategory, setDeletingMainCategory] =
    useState<MainCategoryMeta | null>(null);
  const [deleteMainMode, setDeleteMainMode] = useState<
    'reassign_subcategories' | 'delete_subcategories'
  >('reassign_subcategories');
  const [deleteMainTargetId, setDeleteMainTargetId] = useState<string>('');
  const [deleteMainConfirmQuestions, setDeleteMainConfirmQuestions] =
    useState(false);

  // Subcategory Management States
  const [subMainFilter, setSubMainFilter] = useState<string>('الكل');
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] =
    useState<SubcategoryItem | null>(null);
  const [subFormName, setSubFormName] = useState('');
  const [subFormMainCategoryId, setSubFormMainCategoryId] =
    useState<string>('main-general');
  const [subFormDescription, setSubFormDescription] = useState('');
  const [subFormSortOrder, setSubFormSortOrder] = useState<number>(1);
  const [subFormIsActive, setSubFormIsActive] = useState<boolean>(true);
  const [subFormIsComingSoon, setSubFormIsComingSoon] = useState<boolean>(false);
  const [subFormImageUrl, setSubFormImageUrl] = useState<string>('');

  // Safe Delete Subcategory Confirmation Modal State
  const [deletingSubcategory, setDeletingSubcategory] =
    useState<SubcategoryItem | null>(null);
  const [deleteSubMode, setDeleteSubMode] = useState<
    'reassign_questions' | 'keep_questions' | 'delete_questions'
  >('reassign_questions');
  const [deleteSubTargetId, setDeleteSubTargetId] = useState<string>('');
  const [deleteSubConfirmQuestions, setDeleteSubConfirmQuestions] =
    useState(false);

  // Add / Edit Question Modal State (Direct Questions: Text-only or Illustrated)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null
  );
  const [formCategory, setFormCategory] = useState<string>('معلومات عامة');
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formDifficulty, setFormDifficulty] =
    useState<DifficultyLevel>('سهل');
  const [formPoints, setFormPoints] = useState<PointValue>(100);
  const [formCorrectAnswer, setFormCorrectAnswer] = useState('');
  const [formExplanation, setFormExplanation] = useState('');
  const [formSource, setFormSource] = useState('');
  const [formStatus, setFormStatus] = useState<ApprovalStatus>('approved');
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formImageStoragePath, setFormImageStoragePath] = useState<string>('');
  const [originalImageStoragePath, setOriginalImageStoragePath] =
    useState<string>('');
  const [formImageDescription, setFormImageDescription] = useState<string>('');
  const [pendingQuestionImageFile, setPendingQuestionImageFile] =
    useState<File | null>(null);
  const [pendingQuestionImagePreviewUrl, setPendingQuestionImagePreviewUrl] =
    useState<string | null>(null);
  const [questionModalError, setQuestionModalError] = useState<string | null>(
    null
  );

  // Image Management States
  const [imgMainFilter, setImgMainFilter] = useState<string>('الكل');
  const [imgSearchQuery, setImgSearchQuery] = useState('');
  const [cropTarget, setCropTarget] = useState<{
    kind: 'main' | 'sub' | 'main_draft' | 'sub_draft';
    mainCat?: MainCategoryMeta;
    subCat?: SubcategoryItem;
    file: File;
  } | null>(null);

  // Contact Settings Form State
  const [contactHeading, setContactHeading] = useState(contactSettings.heading);
  const [contactMessage, setContactMessage] = useState(contactSettings.message);
  const [contactWhatsappUrl, setContactWhatsappUrl] = useState(
    contactSettings.whatsappUrl
  );
  const [contactWhatsappDisplay, setContactWhatsappDisplay] = useState(
    contactSettings.whatsappDisplay
  );
  const [contactEmail, setContactEmail] = useState(
    contactSettings.emailAddress
  );
  const [contactTwitter, setContactTwitter] = useState(
    contactSettings.twitterUrl
  );
  const [contactInstagram, setContactInstagram] = useState(
    contactSettings.instagramUrl
  );
  const [contactTiktok, setContactTiktok] = useState(contactSettings.tiktokUrl);
  const [contactSnapchat, setContactSnapchat] = useState(
    contactSettings.snapchatUrl
  );

  useEffect(() => {
    setContactHeading(contactSettings.heading);
    setContactMessage(contactSettings.message);
    setContactWhatsappUrl(contactSettings.whatsappUrl);
    setContactWhatsappDisplay(contactSettings.whatsappDisplay);
    setContactEmail(contactSettings.emailAddress);
    setContactTwitter(contactSettings.twitterUrl);
    setContactInstagram(contactSettings.instagramUrl);
    setContactTiktok(contactSettings.tiktokUrl);
    setContactSnapchat(contactSettings.snapchatUrl);
  }, [contactSettings]);

  // User Contributions State
  const [contributions, setContributions] = useState<UserContribution[]>([]);
  const [loadingContributions, setLoadingContributions] = useState(false);
  const [contributionFilter, setContributionFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [contributionSearch, setContributionSearch] = useState('');
  const [rejectModalContribution, setRejectModalContribution] = useState<UserContribution | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');
  const [previewContribution, setPreviewContribution] = useState<UserContribution | null>(null);

  const loadContributions = async () => {
    try {
      setLoadingContributions(true);
      const list = await fetchAllContributionsForAdmin();
      setContributions(list);
    } catch (err) {
      console.error('Failed to load contributions', err);
    } finally {
      setLoadingContributions(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadContributions();
    }
  }, [isAdmin]);

  const pendingContributionsCount = useMemo(
    () => contributions.filter((c) => c.status === 'pending').length,
    [contributions]
  );

  const filteredContributions = useMemo(() => {
    return contributions.filter((c) => {
      if (contributionFilter !== 'all' && c.status !== contributionFilter) {
        return false;
      }
      if (contributionSearch.trim()) {
        const query = contributionSearch.trim().toLowerCase();
        const matchesQ = c.questionText.toLowerCase().includes(query);
        const matchesA = c.correctAnswer.toLowerCase().includes(query);
        const matchesSub = (c.category || '').toLowerCase().includes(query);
        const matchesUser =
          (c.userName || '').toLowerCase().includes(query) ||
          (c.userEmail || '').toLowerCase().includes(query);
        if (!matchesQ && !matchesA && !matchesSub && !matchesUser) {
          return false;
        }
      }
      return true;
    });
  }, [contributions, contributionFilter, contributionSearch]);

  const handleApproveContribution = async (item: UserContribution) => {
    try {
      setActionLoading(true);
      await approveAndPublishContribution(item, user?.uid || 'admin');
      setStatusBanner(`تم اعتماد السؤال «${item.questionText.slice(0, 30)}...» بنجاح وإضافته إلى بنك الأسئلة العام.`);
      await loadContributions();
      if (onRefreshQuestions) await onRefreshQuestions();
    } catch (err: any) {
      console.error(err);
      setStatusBanner(`حدث خطأ أثناء اعتماد السؤال: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenRejectModal = (item: UserContribution) => {
    setRejectModalContribution(item);
    setRejectReasonText('');
  };

  const handleConfirmReject = async () => {
    if (!rejectModalContribution) return;
    try {
      setActionLoading(true);
      await rejectContribution(
        rejectModalContribution,
        rejectReasonText.trim(),
        user?.uid || 'admin'
      );
      setStatusBanner(`تم رفض المساهمة وإرسال سبب الرفض للمستخدم.`);
      setRejectModalContribution(null);
      setRejectReasonText('');
      await loadContributions();
    } catch (err: any) {
      console.error(err);
      setStatusBanner(`حدث خطأ أثناء الرفض: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setActionLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const questionImageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageTargetRef = useRef<{
    kind: 'main' | 'sub' | 'main_draft' | 'sub_draft';
    mainCat?: MainCategoryMeta;
    subCat?: SubcategoryItem;
  } | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);

  const sortedMainCategories = useMemo(
    () => [...mainCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    [mainCategories]
  );

  const subcategoryToMainMap = useMemo(() => {
    const map = new Map<string, MainCategoryName>();
    subcategories.forEach((s) => map.set(s.name, s.mainCategory));
    return map;
  }, [subcategories]);

  const allSubcategoryNames = useMemo(
    () => subcategories.map((s) => s.name),
    [subcategories]
  );

  const getSubcategoriesForMain = (mainCat: MainCategoryMeta) =>
    subcategories
      .filter(
        (s) =>
          s.mainCategoryId === mainCat.id || s.mainCategory === mainCat.name
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);

  const getQuestionsForSubcategory = (sub: SubcategoryItem) =>
    questions.filter((q) =>
      matchesSubcategoryQuestion(q.category, sub.name, q.subcategoryId, sub.id)
    );

  const getQuestionsForMainCategory = (mainCat: MainCategoryMeta) => {
    const subs = getSubcategoriesForMain(mainCat);
    const subIds = new Set(subs.map((s) => s.id));
    const subNames = new Set(subs.map((s) => s.name));
    return questions.filter(
      (q) =>
        (q.subcategoryId && subIds.has(q.subcategoryId)) ||
        subNames.has(q.category)
    );
  };

  const duplicateIdsSet = useMemo(() => {
    const map = new Map<string, string[]>();
    questions.forEach((q) => {
      const norm = normalizeArabicText(q.questionText);
      if (!norm) return;
      const list = map.get(norm) || [];
      list.push(q.id);
      map.set(norm, list);
    });
    const dupIds = new Set<string>();
    map.forEach((ids) => {
      if (ids.length > 1) {
        ids.forEach((id) => dupIds.add(id));
      }
    });
    return dupIds;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (mainCategoryFilter !== 'الكل') {
        const qMain = subcategoryToMainMap.get(q.category) || '';
        if (qMain !== mainCategoryFilter) return false;
      }
      if (categoryFilter !== 'الكل' && q.category !== categoryFilter) {
        return false;
      }
      if (difficultyFilter !== 'الكل' && q.difficulty !== difficultyFilter) {
        return false;
      }
      if (typeFilter === 'image' && !q.imageUrl) {
        return false;
      }
      if (typeFilter === 'text' && q.imageUrl) {
        return false;
      }
      if (statusFilter !== 'الكل' && q.status !== statusFilter) {
        return false;
      }
      if (showDuplicatesOnly && !duplicateIdsSet.has(q.id)) {
        return false;
      }
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const inText = q.questionText.toLowerCase().includes(term);
        const inAns = q.correctAnswer.toLowerCase().includes(term);
        const inCat = q.category.toLowerCase().includes(term);
        const inImgDesc = (q.imageDescription || '')
          .toLowerCase()
          .includes(term);
        if (!inText && !inAns && !inCat && !inImgDesc) return false;
      }
      return true;
    });
  }, [
    questions,
    mainCategoryFilter,
    categoryFilter,
    difficultyFilter,
    typeFilter,
    statusFilter,
    showDuplicatesOnly,
    duplicateIdsSet,
    searchQuery,
    subcategoryToMainMap,
  ]);

  const totalQuestionPages = Math.max(
    1,
    Math.ceil(filteredQuestions.length / questionsPerPage)
  );

  const paginatedQuestions = useMemo(() => {
    const start = (questionsPage - 1) * questionsPerPage;
    return filteredQuestions.slice(start, start + questionsPerPage);
  }, [filteredQuestions, questionsPage, questionsPerPage]);

  const counts = useMemo(() => {
    const approved = questions.filter((q) => q.status === 'approved').length;
    const pending = questions.filter((q) => q.status === 'pending').length;
    const rejected = questions.filter((q) => q.status === 'rejected').length;
    const mcq = questions.filter((q) => q.questionType === 'mcq').length;
    const direct = questions.filter((q) => q.questionType === 'direct').length;
    const illustrated = questions.filter((q) => Boolean(q.imageUrl)).length;
    const textOnly = questions.length - illustrated;
    return {
      total: questions.length,
      approved,
      pending,
      rejected,
      mcq,
      direct,
      illustrated,
      textOnly,
      duplicates: duplicateIdsSet.size,
    };
  }, [questions, duplicateIdsSet]);

  // Trigger device file picker for a specific Main Category, Subcategory, or Form Draft
  const triggerSelectCategoryImage = (target: {
    kind: 'main' | 'sub' | 'main_draft' | 'sub_draft';
    mainCat?: MainCategoryMeta;
    subCat?: SubcategoryItem;
  }) => {
    pendingImageTargetRef.current = target;
    imageUploadInputRef.current?.click();
  };

  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = pendingImageTargetRef.current;
    e.target.value = '';
    if (!file || !target) return;

    setCropTarget({
      ...target,
      file,
    });
  };

  const handleConfirmSaveCroppedImage = async (
    croppedBlob: Blob,
    croppedDataUrl: string
  ) => {
    if (!user || !cropTarget) return;
    setActionLoading(true);
    setStatusBanner(null);

    try {
      if (cropTarget.kind === 'main_draft') {
        const tempId =
          editingMainCategory?.id || `main-draft-${Date.now()}`;
        const finalUrl = await uploadCategoryImageToFirebase(
          'main',
          tempId,
          croppedBlob,
          croppedDataUrl
        );
        setMainFormImageUrl(finalUrl);
        setCropTarget(null);
      } else if (cropTarget.kind === 'sub_draft') {
        const tempId = editingSubcategory?.id || `sub-draft-${Date.now()}`;
        const finalUrl = await uploadCategoryImageToFirebase(
          'sub',
          tempId,
          croppedBlob,
          croppedDataUrl
        );
        setSubFormImageUrl(finalUrl);
        setCropTarget(null);
      } else if (cropTarget.kind === 'main' && cropTarget.mainCat) {
        const finalUrl = await uploadCategoryImageToFirebase(
          'main',
          cropTarget.mainCat.id,
          croppedBlob,
          croppedDataUrl
        );
        await saveMainCategoryImageToFirestore(
          cropTarget.mainCat,
          finalUrl,
          user.uid
        );
        await onRefreshMainCategories();
        setStatusBanner(
          `تم حفظ وتحديث صورة الفئة الرئيسية «${cropTarget.mainCat.name}» بنجاح.`
        );
        setCropTarget(null);
      } else if (cropTarget.kind === 'sub' && cropTarget.subCat) {
        const finalUrl = await uploadCategoryImageToFirebase(
          'sub',
          cropTarget.subCat.id,
          croppedBlob,
          croppedDataUrl
        );
        await saveSubcategoryImageToFirestore(
          cropTarget.subCat,
          finalUrl,
          user.uid
        );
        await onRefreshSubcategories();
        setStatusBanner(
          `تم حفظ وتحديث صورة الفئة الفرعية «${cropTarget.subCat.name}» بنجاح.`
        );
        setCropTarget(null);
      }
    } catch (err) {
      setStatusBanner(
        `تعذر حفظ الصورة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMainCategoryImage = async (mainCat: MainCategoryMeta) => {
    if (!user) return;
    setActionLoading(true);
    try {
      await saveMainCategoryImageToFirestore(mainCat, '', user.uid);
      await onRefreshMainCategories();
      setStatusBanner(`تمت إزالة صورة الفئة الرئيسية «${mainCat.name}».`);
    } catch (err) {
      setStatusBanner(
        `تعذر إزالة الصورة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSubcategoryImage = async (sub: SubcategoryItem) => {
    if (!user) return;
    setActionLoading(true);
    try {
      await saveSubcategoryImageToFirestore(sub, '', user.uid);
      await onRefreshSubcategories();
      setStatusBanner(`تمت إزالة صورة الفئة الفرعية «${sub.name}».`);
    } catch (err) {
      setStatusBanner(
        `تعذر إزالة الصورة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  // --- MAIN CATEGORY CRUD HANDLERS ---
  const openAddMainCategoryModal = () => {
    const nextOrder =
      sortedMainCategories.length > 0
        ? Math.max(...sortedMainCategories.map((m) => m.sortOrder)) + 1
        : 1;
    setEditingMainCategory(null);
    setMainFormName('');
    setMainFormDescription('');
    setMainFormImageUrl('');
    setMainFormSortOrder(nextOrder);
    setMainFormIsActive(true);
    setMainFormIsComingSoon(false);
    setMainFormIconName('compass');
    setMainModalOpen(true);
  };

  const openEditMainCategoryModal = (mainCat: MainCategoryMeta) => {
    setEditingMainCategory(mainCat);
    setMainFormName(mainCat.name);
    setMainFormDescription(mainCat.description || mainCat.tagline || '');
    setMainFormImageUrl(mainCat.imageUrl || '');
    setMainFormSortOrder(mainCat.sortOrder);
    setMainFormIsActive(mainCat.isActive);
    setMainFormIsComingSoon(Boolean(mainCat.isComingSoon));
    setMainFormIconName(mainCat.iconName || 'compass');
    setMainModalOpen(true);
  };

  const handleSaveMainCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanName = mainFormName.trim();
    if (cleanName.length < 2) {
      setStatusBanner('يرجى إدخال اسم الفئة الرئيسية (حرفين على الأقل).');
      return;
    }
    if (cleanName === 'مسلسلات وأفلام') {
      setStatusBanner('تم استبعاد فئة «مسلسلات وأفلام» بناءً على إعدادات المنصة.');
      return;
    }

    setActionLoading(true);
    setStatusBanner(null);

    try {
      await saveMainCategoryToFirestore(
        {
          id: editingMainCategory?.id,
          name: cleanName,
          description: mainFormDescription.trim(),
          tagline: mainFormDescription.trim(),
          imageUrl: mainFormImageUrl,
          sortOrder: Number(mainFormSortOrder) || 1,
          isActive: mainFormIsActive,
          isComingSoon: mainFormIsComingSoon,
          iconName: mainFormIconName,
          accentColor: editingMainCategory?.accentColor || '#14543D',
          bgTint: editingMainCategory?.bgTint || '#EAF2EE',
          borderTint: editingMainCategory?.borderTint || '#C5DDD1',
        },
        user.uid,
        editingMainCategory || undefined
      );

      setMainModalOpen(false);
      await Promise.all([
        onRefreshMainCategories(),
        onRefreshSubcategories(),
      ]);

      setStatusBanner(
        editingMainCategory
          ? `تم حفظ تعديلات الفئة الرئيسية «${cleanName}» بنجاح.`
          : `تمت إضافة الفئة الرئيسية الجديدة «${cleanName}» وظهرت في الموقع.`
      );
    } catch (err) {
      setStatusBanner(
        `تعذر حفظ الفئة الرئيسية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleMainCategoryActive = async (mainCat: MainCategoryMeta) => {
    if (!user) return;
    setActionLoading(true);
    try {
      await saveMainCategoryToFirestore(
        {
          id: mainCat.id,
          name: mainCat.name,
          description: mainCat.description,
          tagline: mainCat.tagline,
          imageUrl: mainCat.imageUrl,
          sortOrder: mainCat.sortOrder,
          isActive: !mainCat.isActive,
          isComingSoon: mainCat.isComingSoon,
          iconName: mainCat.iconName,
          accentColor: mainCat.accentColor,
          bgTint: mainCat.bgTint,
          borderTint: mainCat.borderTint,
        },
        user.uid,
        mainCat
      );
      await onRefreshMainCategories();
      setStatusBanner(
        !mainCat.isActive
          ? `تم إظهار الفئة الرئيسية «${mainCat.name}» في الموقع.`
          : `تم إخفاء الفئة الرئيسية «${mainCat.name}» عن الألعاب الجديدة.`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleMainCategoryComingSoon = async (mainCat: MainCategoryMeta) => {
    if (!user) return;
    const nextComingSoon = !mainCat.isComingSoon;
    setActionLoading(true);
    setStatusBanner(null);
    try {
      await saveMainCategoryToFirestore(
        {
          id: mainCat.id,
          name: mainCat.name,
          description: mainCat.description,
          tagline: mainCat.tagline,
          imageUrl: mainCat.imageUrl,
          sortOrder: mainCat.sortOrder,
          isActive: nextComingSoon ? mainCat.isActive : true,
          isComingSoon: nextComingSoon,
          iconName: mainCat.iconName,
          accentColor: mainCat.accentColor,
          bgTint: mainCat.bgTint,
          borderTint: mainCat.borderTint,
        },
        user.uid,
        mainCat
      );
      await onRefreshMainCategories();
      setStatusBanner(
        nextComingSoon
          ? `تم تحويل الفئة «${mainCat.name}» إلى وضع «قريباً» مع الاحتفاظ بكافة بياناتها وأسئلتها.`
          : `تم تفعيل الفئة «${mainCat.name}» وإتاحتها للعب في الموقع بنجاح!`
      );
    } catch (err) {
      setStatusBanner(
        `تعذر تحديث حالة «قريباً» للفئة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveMainCategoryOrder = async (
    mainCat: MainCategoryMeta,
    direction: 'up' | 'down'
  ) => {
    if (!user) return;
    const idx = sortedMainCategories.findIndex((m) => m.id === mainCat.id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;

    setActionLoading(true);
    try {
      if (swapIdx >= 0 && swapIdx < sortedMainCategories.length) {
        const neighbor = sortedMainCategories[swapIdx];
        const orderA =
          neighbor.sortOrder === mainCat.sortOrder
            ? direction === 'up'
              ? Math.max(1, mainCat.sortOrder - 1)
              : mainCat.sortOrder + 1
            : neighbor.sortOrder;
        const orderB = mainCat.sortOrder;

        await Promise.all([
          saveMainCategoryToFirestore(
            {
              ...mainCat,
              sortOrder: orderA,
            },
            user.uid,
            mainCat
          ),
          saveMainCategoryToFirestore(
            {
              ...neighbor,
              sortOrder: orderB,
            },
            user.uid,
            neighbor
          ),
        ]);
      } else {
        const delta = direction === 'up' ? -1 : 1;
        await saveMainCategoryToFirestore(
          {
            ...mainCat,
            sortOrder: Math.max(1, mainCat.sortOrder + delta),
          },
          user.uid,
          mainCat
        );
      }
      await onRefreshMainCategories();
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteMainCategoryDialog = (mainCat: MainCategoryMeta) => {
    const otherMains = sortedMainCategories.filter((m) => m.id !== mainCat.id);
    const relatedSubs = getSubcategoriesForMain(mainCat);
    setDeletingMainCategory(mainCat);
    setDeleteMainTargetId(otherMains[0]?.id || '');
    setDeleteMainMode(
      relatedSubs.length > 0 && otherMains.length > 0
        ? 'reassign_subcategories'
        : 'delete_subcategories'
    );
    setDeleteMainConfirmQuestions(false);
  };

  const handleConfirmDeleteMainCategory = async () => {
    if (!user || !deletingMainCategory) return;
    const relatedSubs = getSubcategoriesForMain(deletingMainCategory);
    const relatedQs = getQuestionsForMainCategory(deletingMainCategory);
    const targetMain = sortedMainCategories.find(
      (m) => m.id === deleteMainTargetId
    );

    if (
      relatedSubs.length > 0 &&
      deleteMainMode === 'reassign_subcategories' &&
      !targetMain
    ) {
      setStatusBanner('يرجى اختيار الفئة الرئيسية البديلة لنقل الفئات الفرعية إليها.');
      return;
    }

    setActionLoading(true);
    try {
      await deleteMainCategoryFromFirestore(
        deletingMainCategory,
        relatedSubs,
        relatedQs,
        {
          mode:
            relatedSubs.length === 0 ? 'delete_subcategories' : deleteMainMode,
          targetMainCategory: targetMain,
          deleteRelatedQuestionsConfirmed: deleteMainConfirmQuestions,
        },
        user.uid
      );

      const deletedName = deletingMainCategory.name;
      setDeletingMainCategory(null);
      setMainModalOpen(false);
      await Promise.all([
        onRefreshMainCategories(),
        onRefreshSubcategories(),
        onRefreshQuestions(),
      ]);
      setStatusBanner(`تم حذف الفئة الرئيسية «${deletedName}» بنجاح.`);
    } catch (err) {
      setStatusBanner(
        `تعذر حذف الفئة الرئيسية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  // --- SUBCATEGORY CRUD HANDLERS ---
  const openAddSubcategoryModal = (defaultMainCat?: MainCategoryMeta) => {
    setEditingSubcategory(null);
    const targetMain =
      defaultMainCat ||
      sortedMainCategories.find(
        (m) => m.id === subMainFilter || m.name === subMainFilter
      ) ||
      sortedMainCategories[0];

    const existingInMain = targetMain
      ? getSubcategoriesForMain(targetMain)
      : [];
    const nextOrder =
      existingInMain.length > 0
        ? Math.max(...existingInMain.map((s) => s.sortOrder)) + 1
        : 1;

    setSubFormName('');
    setSubFormMainCategoryId(targetMain?.id || 'main-general');
    setSubFormDescription('');
    setSubFormSortOrder(nextOrder);
    setSubFormIsActive(true);
    setSubFormIsComingSoon(false);
    setSubFormImageUrl('');
    setSubModalOpen(true);
  };

  const openEditSubcategoryModal = (sub: SubcategoryItem) => {
    const parentMain =
      sortedMainCategories.find(
        (m) => m.id === sub.mainCategoryId || m.name === sub.mainCategory
      ) || sortedMainCategories[0];

    setEditingSubcategory(sub);
    setSubFormName(sub.name);
    setSubFormMainCategoryId(parentMain?.id || sub.mainCategoryId || 'main-general');
    setSubFormDescription(sub.description);
    setSubFormSortOrder(sub.sortOrder);
    setSubFormIsActive(sub.isActive);
    setSubFormIsComingSoon(Boolean(sub.isComingSoon));
    setSubFormImageUrl(sub.imageUrl || '');
    setSubModalOpen(true);
  };

  const handleSaveSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const cleanName = subFormName.trim();
    if (cleanName.length < 2) {
      setStatusBanner('يرجى إدخال اسم الفئة الفرعية (حرفين على الأقل).');
      return;
    }

    const parentMain =
      sortedMainCategories.find((m) => m.id === subFormMainCategoryId) ||
      sortedMainCategories[0];

    setActionLoading(true);
    try {
      await saveSubcategoryToFirestore(
        {
          id: editingSubcategory?.id,
          name: cleanName,
          mainCategoryId: parentMain?.id || subFormMainCategoryId,
          mainCategory: parentMain?.name || 'عام',
          description: subFormDescription.trim(),
          sortOrder: Number(subFormSortOrder) || 1,
          isActive: subFormIsActive,
          isComingSoon: subFormIsComingSoon,
          imageUrl: subFormImageUrl,
        },
        user.uid,
        editingSubcategory?.name
      );

      setSubModalOpen(false);
      await Promise.all([onRefreshSubcategories(), onRefreshQuestions()]);
      setStatusBanner(
        editingSubcategory
          ? `تم تحديث الفئة الفرعية «${cleanName}» بنجاح.`
          : `تمت إضافة الفئة الفرعية «${cleanName}» ضمن قسم «${parentMain?.name || ''}».`
      );
    } catch (err) {
      setStatusBanner(
        `تعذر حفظ الفئة الفرعية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSubcategoryActive = async (sub: SubcategoryItem) => {
    if (!user) return;
    setActionLoading(true);
    try {
      await saveSubcategoryToFirestore(
        {
          id: sub.id,
          name: sub.name,
          mainCategoryId: sub.mainCategoryId,
          mainCategory: sub.mainCategory,
          description: sub.description,
          sortOrder: sub.sortOrder,
          isActive: !sub.isActive,
          isComingSoon: sub.isComingSoon,
          imageUrl: sub.imageUrl,
        },
        user.uid
      );
      await onRefreshSubcategories();
      setStatusBanner(
        !sub.isActive
          ? `تم إظهار الفئة الفرعية «${sub.name}» للاعبين.`
          : `تم إخفاء الفئة الفرعية «${sub.name}» عن الألعاب الجديدة.`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSubcategoryComingSoon = async (sub: SubcategoryItem) => {
    if (!user) return;
    const nextComingSoon = !sub.isComingSoon;
    setActionLoading(true);
    try {
      await saveSubcategoryToFirestore(
        {
          id: sub.id,
          name: sub.name,
          mainCategoryId: sub.mainCategoryId,
          mainCategory: sub.mainCategory,
          description: sub.description,
          sortOrder: sub.sortOrder,
          isActive: nextComingSoon ? sub.isActive : true,
          isComingSoon: nextComingSoon,
          imageUrl: sub.imageUrl,
        },
        user.uid
      );
      await onRefreshSubcategories();
      setStatusBanner(
        nextComingSoon
          ? `تم تحويل الفئة الفرعية «${sub.name}» إلى وضع «قريباً» مع حفظ كافة أسئلتها.`
          : `تم تفعيل الفئة الفرعية «${sub.name}» وإتاحتها للعب.`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleMoveSubcategoryOrder = async (
    sub: SubcategoryItem,
    direction: 'up' | 'down'
  ) => {
    if (!user) return;
    const delta = direction === 'up' ? -1 : 1;
    const newOrder = Math.max(1, sub.sortOrder + delta);
    setActionLoading(true);
    try {
      await saveSubcategoryToFirestore(
        {
          id: sub.id,
          name: sub.name,
          mainCategoryId: sub.mainCategoryId,
          mainCategory: sub.mainCategory,
          description: sub.description,
          sortOrder: newOrder,
          isActive: sub.isActive,
          isComingSoon: sub.isComingSoon,
          imageUrl: sub.imageUrl,
        },
        user.uid
      );
      await onRefreshSubcategories();
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteSubcategoryDialog = (sub: SubcategoryItem) => {
    const otherSubs = subcategories.filter((s) => s.id !== sub.id);
    const relatedQs = getQuestionsForSubcategory(sub);
    setDeletingSubcategory(sub);
    setDeleteSubTargetId(otherSubs[0]?.id || '');
    setDeleteSubMode(
      relatedQs.length > 0 && otherSubs.length > 0
        ? 'reassign_questions'
        : 'keep_questions'
    );
    setDeleteSubConfirmQuestions(false);
  };

  const handleConfirmDeleteSubcategory = async () => {
    if (!user || !deletingSubcategory) return;
    const relatedQs = getQuestionsForSubcategory(deletingSubcategory);
    const targetSub = subcategories.find((s) => s.id === deleteSubTargetId);

    if (
      relatedQs.length > 0 &&
      deleteSubMode === 'reassign_questions' &&
      !targetSub
    ) {
      setStatusBanner('يرجى اختيار الفئة الفرعية البديلة لنقل الأسئلة إليها.');
      return;
    }

    if (
      relatedQs.length > 0 &&
      deleteSubMode === 'delete_questions' &&
      !deleteSubConfirmQuestions
    ) {
      setStatusBanner('يرجى تأكيد الموافقة الصريحة على حذف الأسئلة المرتبطة.');
      return;
    }

    setActionLoading(true);
    try {
      await deleteSubcategorySafeFromFirestore(
        deletingSubcategory,
        relatedQs,
        {
          mode: relatedQs.length === 0 ? 'keep_questions' : deleteSubMode,
          targetSubcategory: targetSub,
          deleteQuestionsConfirmed: deleteSubConfirmQuestions,
        },
        user.uid
      );

      const deletedName = deletingSubcategory.name;
      setDeletingSubcategory(null);
      await Promise.all([onRefreshSubcategories(), onRefreshQuestions()]);
      setStatusBanner(`تم حذف الفئة الفرعية «${deletedName}» بنجاح.`);
    } catch (err) {
      setStatusBanner(
        `تعذر حذف الفئة الفرعية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  // --- CONTACT SETTINGS HANDLER ---
  const handleSaveContactSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setActionLoading(true);
    setStatusBanner(null);

    try {
      await saveContactSettingsToFirestore(
        {
          heading: contactHeading.trim() || 'حنا هنا لمساعدتك!',
          message: contactMessage.trim(),
          whatsappUrl: contactWhatsappUrl.trim(),
          whatsappDisplay: contactWhatsappDisplay.trim(),
          emailAddress: contactEmail.trim(),
          twitterUrl: contactTwitter.trim(),
          instagramUrl: contactInstagram.trim(),
          tiktokUrl: contactTiktok.trim(),
          snapchatUrl: contactSnapchat.trim(),
        },
        user.uid
      );
      await onRefreshContactSettings();
      setStatusBanner('تم حفظ بيانات صفحة «تواصل معنا» بنجاح في Firestore.');
    } catch (err) {
      setStatusBanner(
        `تعذر حفظ بيانات التواصل: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  // --- QUESTIONS HANDLERS (Direct Questions: Text-only & Illustrated) ---
  const clearPendingQuestionImage = () => {
    if (pendingQuestionImagePreviewUrl) {
      URL.revokeObjectURL(pendingQuestionImagePreviewUrl);
    }
    setPendingQuestionImageFile(null);
    setPendingQuestionImagePreviewUrl(null);
    if (questionImageInputRef.current) {
      questionImageInputRef.current.value = '';
    }
  };

  const handleCloseQuestionModal = () => {
    clearPendingQuestionImage();
    setQuestionModalError(null);
    setModalOpen(false);
  };

  const openAddModal = () => {
    clearPendingQuestionImage();
    setQuestionModalError(null);
    setEditingQuestionId(null);
    setFormCategory(subcategories[0]?.name || 'معلومات عامة');
    setFormQuestionText('');
    setFormDifficulty('سهل');
    setFormPoints(100);
    setFormCorrectAnswer('');
    setFormExplanation('');
    setFormSource('');
    setFormStatus('approved');
    setFormImageUrl('');
    setFormImageStoragePath('');
    setOriginalImageStoragePath('');
    setFormImageDescription('');
    setModalOpen(true);
  };

  const openEditModal = (q: TriviaQuestion) => {
    clearPendingQuestionImage();
    setQuestionModalError(null);
    setEditingQuestionId(q.id);
    setFormCategory(q.category);
    setFormQuestionText(q.questionText);
    setFormDifficulty(q.difficulty);
    setFormPoints(q.points);
    setFormCorrectAnswer(q.correctAnswer);
    setFormExplanation(q.explanation);
    setFormSource(q.source);
    setFormStatus(q.status);
    setFormImageUrl(q.imageUrl || '');
    setFormImageStoragePath(q.imageStoragePath || '');
    setOriginalImageStoragePath(q.imageStoragePath || '');
    setFormImageDescription(q.imageDescription || '');
    setModalOpen(true);
  };

  const handleQuestionImageFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateQuestionImageFile(file);
    if (validationError) {
      setQuestionModalError(validationError);
      return;
    }

    setQuestionModalError(null);
    if (pendingQuestionImagePreviewUrl) {
      URL.revokeObjectURL(pendingQuestionImagePreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingQuestionImageFile(file);
    setPendingQuestionImagePreviewUrl(previewUrl);
  };

  const handleRemoveQuestionImage = () => {
    clearPendingQuestionImage();
    setFormImageUrl('');
    setFormImageStoragePath('');
    setFormImageDescription('');
    setQuestionModalError(null);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setQuestionModalError(null);

    if (formQuestionText.trim().length < 3 || !formCorrectAnswer.trim()) {
      setQuestionModalError(
        'يرجى كتابة نص السؤال المباشر والإجابة الصحيحة المعتمدة.'
      );
      return;
    }

    const matchedSub = subcategories.find(
      (s) => s.name === formCategory.trim()
    );

    setActionLoading(true);
    let finalImageUrl = formImageUrl.trim();
    let finalStoragePath = formImageStoragePath.trim();
    let newlyUploadedStoragePath = '';

    try {
      // 1. If a new image file was selected from the device, upload it to Firebase Storage first
      if (pendingQuestionImageFile) {
        const uploaded = await uploadQuestionImageToStorage(
          pendingQuestionImageFile,
          matchedSub?.id || formCategory.trim(),
          editingQuestionId || undefined
        );
        finalImageUrl = uploaded.imageUrl;
        finalStoragePath = uploaded.imageStoragePath;
        newlyUploadedStoragePath = uploaded.imageStoragePath;
      }

      // 2. Construct payload (never Base64)
      const hasImage = Boolean(finalImageUrl);
      const payload: CreateQuestionPayload = {
        subcategoryId: matchedSub?.id,
        category: formCategory.trim(),
        questionText: formQuestionText.trim(),
        questionType: 'direct',
        difficulty: formDifficulty,
        points: formPoints,
        options: [],
        correctAnswer: formCorrectAnswer.trim(),
        explanation: formExplanation.trim(),
        source: formSource.trim(),
        status: formStatus,
        imageUrl: hasImage ? finalImageUrl : '',
        imageStoragePath: hasImage ? finalStoragePath : '',
        imageDescription: hasImage ? formImageDescription.trim() : '',
      };

      if (editingQuestionId) {
        await updateQuestionInFirestore(editingQuestionId, payload, user?.uid || 'system');
        // Clean up old Storage file if the image was replaced or deleted
        if (
          originalImageStoragePath &&
          originalImageStoragePath !== finalStoragePath
        ) {
          await deleteQuestionImageFromStorage(originalImageStoragePath);
        }
        setStatusBanner(
          hasImage
            ? 'تم تحديث السؤال المصوّر وحفظ صورته في Firebase Storage بنجاح.'
            : 'تم تحديث السؤال النصي المباشر بنجاح في قاعدة البيانات.'
        );
      } else {
        await createQuestionInFirestore(payload, user.uid);
        setStatusBanner(
          hasImage
            ? 'تمت إضافة السؤال المصوّر الجديد ورفع صورته إلى Firebase Storage بنجاح.'
            : 'تمت إضافة السؤال النصي المباشر الجديد بنجاح إلى Firestore.'
        );
      }

      clearPendingQuestionImage();
      setModalOpen(false);
      await onRefreshQuestions();
    } catch (err) {
      // If Firestore write failed after a new Storage upload, clean up the orphan Storage file
      if (newlyUploadedStoragePath && !formImageUrl) {
        await deleteQuestionImageFromStorage(newlyUploadedStoragePath);
      }
      // Preserve all question form fields inside the open modal so no data is lost
      const errMsg =
        err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الحفظ.';
      setQuestionModalError(errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConvertExistingToDirect = async () => {
    if (!user) return;
    setActionLoading(true);
    setStatusBanner(null);
    try {
      const { convertedCount, markedPendingCount } =
        await convertExistingQuestionsToDirectInFirestore();
      await onRefreshQuestions();
      if (convertedCount === 0 && markedPendingCount === 0) {
        setStatusBanner(
          'جميع الأسئلة في قاعدة البيانات معتمدة كأسئلة مباشرة بالفعل.'
        );
      } else {
        setStatusBanner(
          `تم تحويل ${convertedCount} سؤال إلى سؤال مباشر بنجاح${
            markedPendingCount > 0
              ? `، وتم وضع ${markedPendingCount} سؤال قيد المراجعة لاعتماد صياغته على خيارات.`
              : '.'
          }`
        );
      }
    } catch (err) {
      setStatusBanner(
        `تعذر تحويل الأسئلة: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleStatusChange = async (
    id: string,
    status: ApprovalStatus
  ) => {
    setActionLoading(true);
    try {
      await updateQuestionStatusInFirestore(id, status);
      await onRefreshQuestions();
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      await deleteQuestionFromFirestore(id);
      setSelectedIds((prev) => prev.filter((item) => item !== id));
      await onRefreshQuestions();
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkStatus = async (status: ApprovalStatus) => {
    if (selectedIds.length === 0) return;
    setActionLoading(true);
    try {
      await bulkUpdateStatusInFirestore(selectedIds, status);
      setStatusBanner(`تم تحديث حالة ${selectedIds.length} سؤال بنجاح.`);
      setSelectedIds([]);
      await onRefreshQuestions();
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setActionLoading(true);
    try {
      await bulkDeleteFromFirestore(selectedIds);
      setStatusBanner(`تم حذف ${selectedIds.length} سؤال من قاعدة البيانات.`);
      setSelectedIds([]);
      await onRefreshQuestions();
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportJSON = () => {
    const dataStr = JSON.stringify(filteredQuestions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nizal-questions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const headers = [
      'id',
      'category',
      'questionText',
      'questionType',
      'difficulty',
      'points',
      'correctAnswer',
      'explanation',
      'source',
      'status',
    ];
    const escapeCsv = (val: string | number) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = filteredQuestions.map((q) => [
      q.id,
      q.category,
      q.questionText,
      'direct',
      q.difficulty,
      q.points,
      q.correctAnswer,
      q.explanation,
      q.source,
      q.status,
    ]);

    const csvContent =
      '\uFEFF' +
      [
        headers.map(escapeCsv).join(','),
        ...rows.map((r) => r.map(escapeCsv).join(',')),
      ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nizal-direct-questions-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setActionLoading(true);
    setStatusBanner(null);

    try {
      const text = await file.text();
      let itemsToCreate: CreateQuestionPayload[] = [];

      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          itemsToCreate = parsed.map((item) => ({
            id: item.id,
            category:
              typeof item.category === 'string' &&
              item.category.trim().length >= 2
                ? item.category.trim()
                : 'معلومات عامة',
            questionText: String(item.questionText || ''),
            questionType: 'direct',
            difficulty: DIFFICULTIES_LIST.includes(item.difficulty)
              ? item.difficulty
              : 'متوسط',
            points: [100, 200, 300, 400, 500].includes(Number(item.points))
              ? (Number(item.points) as PointValue)
              : 200,
            options: [],
            correctAnswer: String(item.correctAnswer || ''),
            explanation: String(item.explanation || ''),
            source: String(item.source || ''),
            status: ['approved', 'pending', 'rejected'].includes(item.status)
              ? item.status
              : 'approved',
          }));
        }
      } else if (file.name.endsWith('.csv')) {
        const lines = text
          .replace(/^\uFEFF/, '')
          .split(/\r?\n/)
          .filter((l) => l.trim().length > 0);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i]
            .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
            .map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
          if (cols.length >= 7) {
            const isLegacy14Col = cols.length >= 11;
            itemsToCreate.push({
              id: cols[0] || undefined,
              category:
                cols[1] && cols[1].trim().length >= 2
                  ? cols[1].trim()
                  : 'معلومات عامة',
              questionText: cols[2] || 'سؤال مستورد',
              questionType: 'direct',
              difficulty: DIFFICULTIES_LIST.includes(
                cols[4] as DifficultyLevel
              )
                ? (cols[4] as DifficultyLevel)
                : 'متوسط',
              points: [100, 200, 300, 400, 500].includes(Number(cols[5]))
                ? (Number(cols[5]) as PointValue)
                : 200,
              options: [],
              correctAnswer: (isLegacy14Col ? cols[10] : cols[6]) || '',
              explanation: (isLegacy14Col ? cols[11] : cols[7]) || '',
              source: (isLegacy14Col ? cols[12] : cols[8]) || '',
              status: ['approved', 'pending', 'rejected'].includes(
                isLegacy14Col ? cols[13] : cols[9]
              )
                ? ((isLegacy14Col ? cols[13] : cols[9]) as ApprovalStatus)
                : 'approved',
            });
          }
        }
      }

      let importedCount = 0;
      for (const item of itemsToCreate) {
        if (item.questionText.trim().length >= 3 && item.correctAnswer.trim()) {
          await createQuestionInFirestore(item, user.uid);
          importedCount++;
        }
      }

      setStatusBanner(
        `تم استيراد وحفظ ${importedCount} سؤال بنجاح في Firestore.`
      );
      await onRefreshQuestions();
    } catch (err) {
      setStatusBanner(
        `فشل الاستيراد: ${err instanceof Error ? err.message : 'تأكد من صيغة الملف'}`
      );
    } finally {
      setActionLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filtered subcategories inside Image Management Tab
  const filteredImageSubcategories = useMemo(() => {
    return subcategories.filter((s) => {
      if (
        imgMainFilter !== 'الكل' &&
        s.mainCategory !== imgMainFilter &&
        s.mainCategoryId !== imgMainFilter
      ) {
        return false;
      }
      if (imgSearchQuery.trim()) {
        const term = imgSearchQuery.trim().toLowerCase();
        if (
          !s.name.toLowerCase().includes(term) &&
          !s.mainCategory.toLowerCase().includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [subcategories, imgMainFilter, imgSearchQuery]);

  // 1. Not Logged In View
  if (!user) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-8 md:p-10 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7 text-[#14543D]" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-[#F07842]">
              منطقة مخصصة للمشرفين · نِزال
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
              لوحة تحكم نِزال الشاملة
            </h1>
            <p className="text-sm text-[#777B73] leading-relaxed">
              تتطلب إدارة الفئات الرئيسية، الفئات الفرعية، الصور، الأسئلة، وبيانات التواصل تسجيل الدخول بحساب المشرف المعتمد.
            </p>
          </div>

          <div className="pt-2 flex justify-center">
            <button
              type="button"
              disabled={authLoading}
              onClick={() => {
                if (onOpenAuthModal) {
                  onOpenAuthModal();
                } else if (onLoginGoogle) {
                  onLoginGoogle();
                }
              }}
              className="px-7 py-3.5 text-sm font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {authLoading ? 'جاري التحقق...' : 'تسجيل دخول المشرف'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Logged In But Not Authorized Admin
  if (!isAdmin) {
    return (
      <div className="max-w-[680px] mx-auto px-6 py-16">
        <div className="bg-[#FFFFFF] border-2 border-[#F07842] rounded-2xl p-8 md:p-10 text-center space-y-6">
          <AlertTriangle className="w-12 h-12 text-[#F07842] mx-auto" />
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-[#252824]">
              هذا الحساب لا يملك صلاحية الإدارة
            </h1>
            <p className="text-sm text-[#777B73] leading-relaxed">
              أنت مسجل الدخول حالياً بالحساب ({user.email})، ولكن صلاحية تعديل الفئات وبنك الأسئلة محصورة للمشرفين المعتمدين فقط لحماية قاعدة البيانات.
            </p>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLogout}
              className="px-6 py-2.5 text-xs font-bold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج وتبديل الحساب</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const mainImagesCount = sortedMainCategories.filter(
    (m) => m.imageUrl && m.imageUrl.trim().length > 0
  ).length;
  const subImagesCount = subcategories.filter(
    (s) => s.imageUrl && s.imageUrl.trim().length > 0
  ).length;

  const deletingMainSubs = deletingMainCategory
    ? getSubcategoriesForMain(deletingMainCategory)
    : [];
  const deletingMainQuestions = deletingMainCategory
    ? getQuestionsForMainCategory(deletingMainCategory)
    : [];

  const deletingSubQuestions = deletingSubcategory
    ? getQuestionsForSubcategory(deletingSubcategory)
    : [];

  // 3. Authorized Admin Dashboard
  return (
    <div className="max-w-[1360px] mx-auto px-6 py-10 space-y-8">
      {/* Hidden File Input for Category Image Upload (JPG, JPEG, PNG, WEBP) */}
      <input
        ref={imageUploadInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        onChange={handleImageFileSelected}
        className="hidden"
      />

      {/* Interactive Crop & Preview Modal */}
      <ImageCropModal
        isOpen={Boolean(cropTarget)}
        categoryLabel={
          cropTarget?.kind === 'main'
            ? cropTarget.mainCat?.name || ''
            : cropTarget?.kind === 'main_draft'
            ? mainFormName || 'فئة رئيسية'
            : cropTarget?.kind === 'sub_draft'
            ? subFormName || 'فئة فرعية'
            : cropTarget?.subCat?.name || ''
        }
        categoryTypeLabel={
          cropTarget?.kind === 'main' || cropTarget?.kind === 'main_draft'
            ? 'صورة فئة رئيسية (المستوى الأول)'
            : `صورة فئة فرعية · قسم ${cropTarget?.subCat?.mainCategory || ''}`
        }
        initialFile={cropTarget?.file || null}
        currentImageUrl={
          cropTarget?.kind === 'main'
            ? cropTarget.mainCat?.imageUrl
            : cropTarget?.kind === 'main_draft'
            ? mainFormImageUrl
            : cropTarget?.kind === 'sub_draft'
            ? subFormImageUrl
            : cropTarget?.subCat?.imageUrl
        }
        saving={actionLoading}
        onClose={() => setCropTarget(null)}
        onConfirmSave={handleConfirmSaveCroppedImage}
      />

      {/* Top Admin Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-xs font-bold text-[#14543D] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" />
            <span>لوحة المشرف المعتمدة · نِزال · {user.email}</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
            إدارة منصة نِزال الشاملة
          </h1>
          <p className="text-xs text-[#777B73]">
            تحكم كامل في الفئات الرئيسية، الفئات الفرعية، الصور، بنك الأسئلة، وبيانات التواصل المرتبطة بـ Firebase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openAddMainCategoryModal}
            className="px-4 py-2.5 text-xs font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة فئة رئيسية</span>
          </button>

          <button
            type="button"
            onClick={() => openAddSubcategoryModal()}
            className="px-4 py-2.5 text-xs font-bold text-[#14543D] bg-[#EAF2EE] hover:bg-[#D7E6DF] border border-[#14543D]/25 rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <FolderTree className="w-4 h-4" />
            <span>+ إضافة فئة فرعية</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2.5 text-xs font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سؤال جديد</span>
          </button>

          <button
            type="button"
            disabled={seeding}
            onClick={onSeedFoundationalPack}
            className="px-3.5 py-2.5 text-xs font-bold text-[#14543D] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#14543D]/25 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            title="حفظ وتزامن 1,975 سؤالاً مباشراً لجميع الفئات الـ 79 في Firestore بدفعات منظمة"
          >
            <Sparkles className="w-4 h-4 text-[#F07842] animate-pulse" />
            <span>
              {seeding ? 'جارٍ الحفظ والتزامن بدفعات...' : 'تزامن بنك الأسئلة الشامل (1,975 سؤال)'}
            </span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await Promise.all([
                onRefreshMainCategories(),
                onRefreshSubcategories(),
                onRefreshQuestions(),
                onRefreshContactSettings(),
              ]);
            }}
            className="p-2.5 text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl cursor-pointer"
            title="تحديث البيانات من Firebase"
          >
            <RefreshCw
              className={`w-4 h-4 ${loadingQuestions ? 'animate-spin' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="px-3.5 py-2.5 text-xs font-semibold text-[#777B73] hover:text-[#252824] bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* Mode Switcher Tabs (5 Sections) */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-[#E5E8DD] pb-4">
        <button
          type="button"
          onClick={() => setAdminTab('main_categories')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'main_categories'
              ? 'bg-[#14543D] text-white'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>إدارة الفئات الرئيسية ({sortedMainCategories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('subcategories')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'subcategories'
              ? 'bg-[#14543D] text-white'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <FolderTree className="w-4 h-4" />
          <span>إدارة الفئات الفرعية ({subcategories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('images')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'images'
              ? 'bg-[#14543D] text-white'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>
            إدارة صور الفئات ({mainImagesCount + subImagesCount} صورة مرفوعة)
          </span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('questions')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'questions'
              ? 'bg-[#14543D] text-white'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <FileQuestion className="w-4 h-4" />
          <span>إدارة الأسئلة ({questions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('contact')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'contact'
              ? 'bg-[#14543D] text-white'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>إدارة صفحة «تواصل معنا»</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAdminTab('contributions');
            loadContributions();
          }}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'contributions'
              ? 'bg-[#14543D] text-white'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>مساهمات المستخدمين ({contributions.length})</span>
          {pendingContributionsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F07842] text-white">
              {pendingContributionsCount} جديدة
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setAdminTab('player_analytics')}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
            adminTab === 'player_analytics'
              ? 'bg-[#14543D] text-white shadow-xs'
              : 'bg-[#FFFFFF] text-[#252824] border border-[#E5E8DD] hover:bg-[#F3F5E9]'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-[#F07842]" />
          <span>إحصائيات اللاعبين</span>
        </button>
      </div>

      {statusBanner && (
        <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-xl px-5 py-3.5 flex items-center justify-between text-xs font-semibold text-[#252824]">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-[#777B73] hover:text-[#252824] cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* TAB 1: FULL MAIN CATEGORY MANAGEMENT (إدارة الفئات الرئيسية) */}
      {adminTab === 'main_categories' && (
        <div className="space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#F07842]">
                المستوى الأول · تحكم كامل في الأقسام الرئيسية
              </div>
              <h2 className="font-display text-xl font-bold text-[#252824]">
                إدارة الفئات الرئيسية ({sortedMainCategories.length})
              </h2>
              <p className="text-xs text-[#777B73]">
                أضف فئة رئيسية جديدة، عدّل الاسم والوصف والصورة وترتيب الظهور، أو أخفِ وأظهر أي فئة في الموقع مع معاينة فورية.
              </p>
            </div>

            <button
              type="button"
              onClick={openAddMainCategoryModal}
              className="px-5 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة فئة رئيسية</span>
            </button>
          </div>

          {sortedMainCategories.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl py-16 text-center space-y-4">
              <p className="font-display text-base font-bold text-[#252824]">
                لا توجد فئات رئيسية حالياً
              </p>
              <button
                type="button"
                onClick={openAddMainCategoryModal}
                className="px-5 py-2.5 rounded-xl bg-[#14543D] text-white text-xs font-bold cursor-pointer"
              >
                + إضافة فئة رئيسية
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedMainCategories.map((mainCat, index) => {
                const subsInMain = getSubcategoriesForMain(mainCat);
                const qsInMain = getQuestionsForMainCategory(mainCat);
                const hasImg = Boolean(
                  mainCat.imageUrl && mainCat.imageUrl.trim().length > 0
                );

                return (
                  <div
                    key={mainCat.id}
                    className={`bg-[#FFFFFF] border-2 rounded-2xl p-4 flex flex-col justify-between space-y-4 transition-all ${
                      mainCat.isComingSoon
                        ? 'border-[#F07842]/60 bg-[#FEF2EC]/25'
                        : mainCat.isActive
                        ? 'border-[#E5E8DD]'
                        : 'border-dashed border-rose-300 bg-[#FFFFFF]/80 opacity-80'
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Top Status & Order Bar */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-[#F3F5E9] border border-[#E5E8DD] font-mono text-xs font-bold text-[#252824]">
                            ترتيب #{mainCat.sortOrder}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${
                              mainCat.isActive
                                ? 'bg-[#EAF2EE] text-[#14543D]'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {mainCat.isActive ? 'ظاهرة' : 'مخفية'}
                          </span>
                          {mainCat.isComingSoon && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#F07842] text-white inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>قريباً</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={actionLoading || index === 0}
                            onClick={() =>
                              handleMoveMainCategoryOrder(mainCat, 'up')
                            }
                            title="تقديم ترتيب الظهور"
                            className="p-1.5 rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] disabled:opacity-35 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={
                              actionLoading ||
                              index === sortedMainCategories.length - 1
                            }
                            onClick={() =>
                              handleMoveMainCategoryOrder(mainCat, 'down')
                            }
                            title="تأخير ترتيب الظهور"
                            className="p-1.5 rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] disabled:opacity-35 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewMainCategory(mainCat)}
                            title="معاينة شكل الفئة في الموقع"
                            className="px-2 py-1 rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[11px] font-bold text-[#14543D] cursor-pointer"
                          >
                            معاينة
                          </button>
                        </div>
                      </div>

                      {/* Live Website Card Preview (1:1 Square) */}
                      <div
                        onClick={() => setPreviewMainCategory(mainCat)}
                        title="اضغط لمعاينة شكل البطاقة في الموقع"
                        className="group relative aspect-square w-full rounded-2xl overflow-hidden border border-[#E5E8DD] bg-[#14543D] flex flex-col justify-end cursor-pointer"
                      >
                        <div className="absolute inset-0">
                          <CategoryCardArtwork
                            name={mainCat.name}
                            mainCategory={mainCat.name}
                            imageUrl={mainCat.imageUrl}
                            isMainCategory
                            className={mainCat.isComingSoon ? 'grayscale-[45%] brightness-75' : ''}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#131614]/90 via-[#131614]/30 to-transparent" />
                        </div>

                        <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10">
                          {mainCat.isComingSoon ? (
                            <span className="px-2.5 py-1 rounded-lg bg-[#F07842] text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-md">
                              <Clock className="w-3 h-3" />
                              <span>قريباً</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-[#252824]/75 backdrop-blur-xs text-white font-mono text-[11px] font-bold">
                              {subsInMain.length} فئات فرعية
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              hasImg
                                ? 'bg-[#F07842] text-white'
                                : 'bg-[#252824]/70 text-[#F3F5E9]'
                            }`}
                          >
                            {hasImg ? 'صورة مرفوعة ✓' : 'بدون صورة'}
                          </span>
                        </div>

                        <div className="relative z-10 p-4 text-right space-y-1">
                          <h3 className="font-display text-xl font-bold text-white">
                            {mainCat.name}
                          </h3>
                          <p className="text-xs text-[#F3F5E9]/85 line-clamp-1">
                            {mainCat.description ||
                              mainCat.tagline ||
                              'بدون وصف مضاف'}
                          </p>
                        </div>
                      </div>

                      {/* Category Metadata Summary */}
                      <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#252824]">
                            {mainCat.name}
                          </span>
                          <span className="font-mono text-[11px] text-[#14543D] font-bold">
                            {subsInMain.length} فئة فرعية · {qsInMain.length} سؤال
                          </span>
                        </div>
                        <p className="text-[#777B73] line-clamp-2 leading-relaxed">
                          {mainCat.description ||
                            mainCat.tagline ||
                            'لا يوجد وصف مضاف لهذه الفئة حالياً.'}
                        </p>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => openEditMainCategoryModal(mainCat)}
                          className="py-2.5 px-3 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>

                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            triggerSelectCategoryImage({
                              kind: 'main',
                              mainCat,
                            })
                          }
                          className="py-2.5 px-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Crop className="w-3.5 h-3.5" />
                          <span>{hasImg ? 'تغيير الصورة' : 'رفع صورة'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleToggleMainCategoryComingSoon(mainCat)}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border ${
                          mainCat.isComingSoon
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-[#FEF2EC] hover:bg-[#FDE4D7] text-[#D9602B] border-[#F07842]/30'
                        }`}
                      >
                        {mainCat.isComingSoon ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span>تفعيل الفئة وإتاحتها للعب الآن</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5 text-[#F07842]" />
                            <span>تعطيل مؤقت بشارة «قريباً»</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleToggleMainCategoryActive(mainCat)}
                          className="flex-1 py-2 px-3 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-[#252824] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {mainCat.isActive ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-[#777B73]" />
                              <span>إخفاء الفئة</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-[#14543D]" />
                              <span>إظهار الفئة</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => openDeleteMainCategoryDialog(mainCat)}
                          title="حذف الفئة الرئيسية"
                          className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBCATEGORIES MANAGEMENT (إدارة الفئات الفرعية) */}
      {adminTab === 'subcategories' && (
        <div className="space-y-6">
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold text-[#252824]">
                  إدارة الفئات الفرعية وتنظيمها ضمن الأقسام الرئيسية
                </h2>
                <p className="text-xs text-[#777B73]">
                  أضف فئات فرعية جديدة، عدّل أسماءها وصورها، انقلها بين الفئات الرئيسية، أو أخفها واحذفها بأمان.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAddSubcategoryModal()}
                className="px-4 py-2.5 text-xs font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl flex items-center gap-1.5 self-start cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ إضافة فئة فرعية</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubMainFilter('الكل')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  subMainFilter === 'الكل'
                    ? 'bg-[#14543D] text-white border-[#14543D]'
                    : 'bg-[#F3F5E9] text-[#252824] border-[#E5E8DD]'
                }`}
              >
                كل الأقسام الرئيسية ({sortedMainCategories.length})
              </button>
              {sortedMainCategories.map((mainCat) => {
                const subCount = getSubcategoriesForMain(mainCat).length;
                return (
                  <button
                    key={mainCat.id}
                    type="button"
                    onClick={() => setSubMainFilter(mainCat.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                      subMainFilter === mainCat.id ||
                      subMainFilter === mainCat.name
                        ? 'bg-[#14543D] text-white border-[#14543D]'
                        : 'bg-[#FFFFFF] text-[#252824] border-[#E5E8DD] hover:bg-[#F3F5E9]'
                    }`}
                  >
                    <span>{mainCat.name}</span>
                    <span className="font-mono text-[11px] opacity-80">
                      ({subCount})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sortedMainCategories
              .filter(
                (mc) =>
                  subMainFilter === 'الكل' ||
                  mc.id === subMainFilter ||
                  mc.name === subMainFilter
              )
              .map((mainCat) => {
                const groupSubs = getSubcategoriesForMain(mainCat);

                return (
                  <div
                    key={mainCat.id}
                    className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-[#E5E8DD]">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#E5E8DD]"
                            style={{
                              backgroundColor: mainCat.bgTint,
                              color: mainCat.accentColor,
                            }}
                          >
                            <CategoryIcon
                              iconName={mainCat.iconName}
                              className="w-5 h-5"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-display text-base font-bold text-[#252824]">
                                {mainCat.name}
                              </h3>
                              {mainCat.isComingSoon && (
                                <span className="text-[10px] font-bold text-white bg-[#F07842] px-2 py-0.5 rounded">
                                  قريباً
                                </span>
                              )}
                              {!mainCat.isActive && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                                  قسم مخفي
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#777B73]">
                              {groupSubs.length} فئة فرعية مسجلة
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openAddSubcategoryModal(mainCat)}
                          className="px-3 py-1.5 text-xs font-bold text-[#14543D] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة هنا</span>
                        </button>
                      </div>

                      {groupSubs.length === 0 ? (
                        <div className="py-8 text-center text-xs text-[#777B73]">
                          لا توجد فئات فرعية في هذا القسم حالياً.
                        </div>
                      ) : (
                        <div className="divide-y divide-[#E5E8DD]">
                          {groupSubs.map((sub) => {
                            const qCount = getQuestionsForSubcategory(sub).length;
                            return (
                              <div
                                key={sub.id}
                                className={`py-3 flex items-center justify-between gap-3 ${
                                  !sub.isActive ? 'opacity-50' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  {sub.imageUrl ? (
                                    <img
                                      src={sub.imageUrl}
                                      alt={sub.name}
                                      className="w-10 h-10 rounded-lg object-cover border border-[#E5E8DD] shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-center text-[#777B73] shrink-0">
                                      <ImageIcon className="w-4 h-4" />
                                    </div>
                                  )}
                                  <div className="space-y-0.5 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] text-[#777B73] bg-[#F3F5E9] px-1.5 py-0.5 rounded">
                                        #{sub.sortOrder}
                                      </span>
                                      <span className="font-display text-sm font-bold text-[#252824] truncate">
                                        {sub.name}
                                      </span>
                                      {sub.isComingSoon && (
                                        <span className="text-[10px] font-bold text-white bg-[#F07842] px-2 py-0.5 rounded">
                                          قريباً
                                        </span>
                                      )}
                                      {!sub.isActive && (
                                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                                          مخفية
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-[#777B73] truncate">
                                      {sub.description || 'بدون وصف'} ·{' '}
                                      <strong className="text-[#14543D]">
                                        {qCount} سؤال
                                      </strong>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() =>
                                      handleToggleSubcategoryComingSoon(sub)
                                    }
                                    title={
                                      sub.isComingSoon
                                        ? 'تفعيل الفئة وإزالة شارة قريباً'
                                        : 'تعطيل مؤقت بشارة قريباً'
                                    }
                                    className={`p-1.5 rounded-lg cursor-pointer ${
                                      sub.isComingSoon
                                        ? 'bg-[#FEF2EC] text-[#F07842] hover:bg-[#FDE4D7]'
                                        : 'text-[#777B73] hover:text-[#F07842] hover:bg-[#FEF2EC]'
                                    }`}
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() =>
                                      triggerSelectCategoryImage({
                                        kind: 'sub',
                                        subCat: sub,
                                      })
                                    }
                                    title="رفع أو تغيير صورة الفئة الفرعية"
                                    className="p-1.5 text-[#F07842] hover:bg-[#FEF2EC] rounded-lg cursor-pointer"
                                  >
                                    <ImageIcon className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() =>
                                      handleMoveSubcategoryOrder(sub, 'up')
                                    }
                                    title="تقديم الترتيب"
                                    className="p-1.5 text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9] rounded-lg cursor-pointer"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() =>
                                      handleMoveSubcategoryOrder(sub, 'down')
                                    }
                                    title="تأخير الترتيب"
                                    className="p-1.5 text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9] rounded-lg cursor-pointer"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() =>
                                      handleToggleSubcategoryActive(sub)
                                    }
                                    title={
                                      sub.isActive
                                        ? 'إخفاء الفئة الفرعية'
                                        : 'إظهار الفئة الفرعية'
                                    }
                                    className="p-1.5 text-[#14543D] hover:bg-[#EAF2EE] rounded-lg cursor-pointer"
                                  >
                                    {sub.isActive ? (
                                      <Eye className="w-3.5 h-3.5" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditSubcategoryModal(sub)}
                                    title="تعديل أو إعادة تسمية أو نقل الفئة"
                                    className="p-1.5 text-[#252824] hover:bg-[#F3F5E9] rounded-lg cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actionLoading}
                                    onClick={() => openDeleteSubcategoryDialog(sub)}
                                    title="حذف الفئة الفرعية"
                                    className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORY IMAGE MANAGEMENT (إدارة صور الفئات) */}
      {adminTab === 'images' && (
        <div className="space-y-10">
          {/* PART A: MAIN CATEGORIES IMAGES */}
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#F07842]">
                  المستوى الأول · الفئات الرئيسية
                </div>
                <h2 className="font-display text-xl font-bold text-[#252824]">
                  صور الفئات الرئيسية ({mainImagesCount} /{' '}
                  {sortedMainCategories.length})
                </h2>
                <p className="text-xs text-[#777B73]">
                  ارفع أو استبدل أو احذف صورة كل قسم رئيسي بشكل مستقل. الصيغ المدعومة: JPG, JPEG, PNG, WEBP مع قص وتوسيط الصورة قبل الحفظ.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {sortedMainCategories.map((mainCat) => {
                const hasImg = Boolean(
                  mainCat.imageUrl && mainCat.imageUrl.trim().length > 0
                );
                return (
                  <div
                    key={mainCat.id}
                    className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-4 flex flex-col justify-between space-y-4"
                  >
                    <div className="group relative aspect-square w-full rounded-xl overflow-hidden border border-[#E5E8DD] bg-[#14543D] flex flex-col justify-end">
                      <div className="absolute inset-0">
                        <CategoryCardArtwork
                          name={mainCat.name}
                          mainCategory={mainCat.name}
                          imageUrl={mainCat.imageUrl}
                          isMainCategory
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#131614]/90 via-[#131614]/25 to-transparent" />
                      </div>

                      <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            hasImg
                              ? 'bg-[#14543D] text-white'
                              : 'bg-[#252824]/75 text-[#F3F5E9]'
                          }`}
                        >
                          {hasImg ? 'صورة مخصصة ✓' : 'بدون صورة'}
                        </span>
                      </div>

                      <div className="relative z-10 p-3.5 text-right">
                        <div className="font-display text-lg font-bold text-white">
                          {mainCat.name}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() =>
                          triggerSelectCategoryImage({
                            kind: 'main',
                            mainCat,
                          })
                        }
                        className="flex-1 py-2.5 px-3 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Crop className="w-3.5 h-3.5" />
                        <span>{hasImg ? 'تغيير الصورة' : 'رفع صورة'}</span>
                      </button>

                      {hasImg && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleRemoveMainCategoryImage(mainCat)}
                          title="حذف الصورة الحالية"
                          className="p-2.5 rounded-xl bg-[#FFFFFF] hover:bg-rose-50 text-rose-700 border border-[#E5E8DD] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PART B: SUBCATEGORIES IMAGES */}
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
              <div className="space-y-1">
                <div className="text-xs font-bold text-[#14543D]">
                  المستوى الثاني · الفئات الفرعية المستقلة
                </div>
                <h2 className="font-display text-xl font-bold text-[#252824]">
                  صور الفئات الفرعية ({subImagesCount} / {subcategories.length})
                </h2>
                <p className="text-xs text-[#777B73]">
                  لكل فئة فرعية صورتها المستقلة تماماً في بطاقتها المربعة. اختر القسم الرئيسي أو ابحث بالاسم لرفع أو تعديل صورة أي فئة فرعية.
                </p>
              </div>

              <div className="relative w-full lg:w-72">
                <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={imgSearchQuery}
                  onChange={(e) => setImgSearchQuery(e.target.value)}
                  placeholder="ابحث عن فئة فرعية..."
                  className="w-full pr-10 pl-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none focus:border-[#14543D]"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setImgMainFilter('الكل')}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  imgMainFilter === 'الكل'
                    ? 'bg-[#14543D] text-white border-[#14543D]'
                    : 'bg-[#F3F5E9] text-[#252824] border-[#E5E8DD]'
                }`}
              >
                كل الفئات الفرعية ({subcategories.length})
              </button>
              {sortedMainCategories.map((mc) => {
                const countInMc = getSubcategoriesForMain(mc).length;
                return (
                  <button
                    key={mc.id}
                    type="button"
                    onClick={() => setImgMainFilter(mc.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      imgMainFilter === mc.id || imgMainFilter === mc.name
                        ? 'bg-[#14543D] text-white border-[#14543D]'
                        : 'bg-[#FFFFFF] text-[#252824] border-[#E5E8DD] hover:bg-[#F3F5E9]'
                    }`}
                  >
                    {mc.name} ({countInMc})
                  </button>
                );
              })}
            </div>

            {filteredImageSubcategories.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#777B73]">
                لا توجد فئات فرعية مطابقة للبحث الحالي.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredImageSubcategories.map((sub) => {
                  const hasImg = Boolean(
                    sub.imageUrl && sub.imageUrl.trim().length > 0
                  );
                  return (
                    <div
                      key={sub.id}
                      className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-3.5 flex flex-col justify-between space-y-3.5"
                    >
                      <div className="group relative aspect-square w-full rounded-xl overflow-hidden border border-[#E5E8DD] bg-[#14543D] flex flex-col justify-end">
                        <div className="absolute inset-0">
                          <CategoryCardArtwork
                            name={sub.name}
                            mainCategory={sub.mainCategory}
                            imageUrl={sub.imageUrl}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#131614]/90 via-[#131614]/25 to-transparent" />
                        </div>

                        <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                          <span className="px-2 py-0.5 rounded-md bg-[#252824]/75 text-white text-[10px] font-bold">
                            {sub.mainCategory}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              hasImg
                                ? 'bg-[#F07842] text-white'
                                : 'bg-[#252824]/60 text-[#F3F5E9]/80'
                            }`}
                          >
                            {hasImg ? 'مرفوعة ✓' : 'بدون صورة'}
                          </span>
                        </div>

                        <div className="relative z-10 p-3 text-right">
                          <div className="font-display text-base font-bold text-white leading-snug line-clamp-2">
                            {sub.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            triggerSelectCategoryImage({
                              kind: 'sub',
                              subCat: sub,
                            })
                          }
                          className="flex-1 py-2 px-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{hasImg ? 'تغيير الصورة' : 'رفع صورة'}</span>
                        </button>

                        {hasImg && (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleRemoveSubcategoryImage(sub)}
                            title="حذف صورة الفئة الفرعية"
                            className="p-2 rounded-xl bg-[#FFFFFF] hover:bg-rose-50 text-rose-700 border border-[#E5E8DD] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: QUESTIONS MANAGEMENT (إدارة الأسئلة) */}
      {adminTab === 'questions' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
              <div className="text-xs text-[#777B73]">الإجمالي الفعلي</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#252824]">
                {counts.total}{' '}
                <span className="text-xs font-normal text-[#777B73]">
                  / {TARGET_TOTAL_QUESTIONS}
                </span>
              </div>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
              <div className="text-xs text-[#777B73]">معتمد (Approved)</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#14543D]">
                {counts.approved}
              </div>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
              <div className="text-xs text-[#777B73]">بانتظار المراجعة</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#F07842]">
                {counts.pending}
              </div>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
              <div className="text-xs text-[#777B73]">مرفوض</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-rose-700">
                {counts.rejected}
              </div>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
              <div className="text-xs text-[#777B73]">أنواع الأسئلة</div>
              <div className="font-mono tabular-nums text-base font-bold text-[#14543D]">
                {counts.illustrated} مصوّر · {counts.textOnly} نصي
              </div>
            </div>
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-4 space-y-1">
              <div className="text-xs text-[#777B73]">تكرارات مكتشفة</div>
              <div className="font-mono tabular-nums text-2xl font-bold text-[#F07842]">
                {counts.duplicates}
              </div>
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-[#252824]">
                توزيع الأسئلة حسب الفئات الرئيسية (اضغط لتصفية الفئة الرئيسية)
              </h2>
              {mainCategoryFilter !== 'الكل' && (
                <button
                  type="button"
                  onClick={() => {
                    setMainCategoryFilter('الكل');
                    setCategoryFilter('الكل');
                  }}
                  className="text-xs font-bold text-[#F07842] cursor-pointer"
                >
                  إلغاء التصفية
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {sortedMainCategories.map((mainCat) => {
                const catCount = getQuestionsForMainCategory(mainCat).length;

                return (
                  <button
                    key={mainCat.id}
                    type="button"
                    onClick={() => {
                      const next =
                        mainCategoryFilter === mainCat.name
                          ? 'الكل'
                          : mainCat.name;
                      setMainCategoryFilter(next);
                      setCategoryFilter('الكل');
                    }}
                    className={`p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                      mainCategoryFilter === mainCat.name
                        ? 'bg-[#F3F5E9] border-[#14543D]'
                        : 'bg-[#FFFFFF] border-[#E5E8DD] hover:bg-[#F3F5E9]/50'
                    }`}
                  >
                    <div className="font-display text-xs font-bold text-[#252824] truncate">
                      {mainCat.name}
                    </div>
                    <div className="font-mono tabular-nums text-sm font-bold text-[#14543D] mt-1">
                      {catCount}{' '}
                      <span className="text-[11px] font-normal text-[#777B73]">
                        / {TARGET_QUESTIONS_PER_CATEGORY}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4 relative">
                <Search className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث في نص السؤال أو الإجابة أو وصف الصورة..."
                  className="w-full pr-10 pl-3.5 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none focus:border-[#14543D]"
                />
              </div>

              <div className="md:col-span-2">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="تصفية حسب الفئة الفرعية"
                  className="w-full px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none"
                >
                  <option value="الكل">
                    كل الفئات الفرعية ({allSubcategoryNames.length})
                  </option>
                  {sortedMainCategories.map((mainCat) => {
                    const subs = getSubcategoriesForMain(mainCat);
                    if (subs.length === 0) return null;
                    return (
                      <optgroup key={mainCat.id} label={mainCat.name}>
                        {subs.map((sub) => (
                          <option key={sub.id} value={sub.name}>
                            {sub.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="تصفية حسب نوع السؤال"
                  className="w-full px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none"
                >
                  <option value="الكل">كل الأنواع (نصي ومصوّر)</option>
                  <option value="text">سؤال نصي بدون صورة ({counts.textOnly})</option>
                  <option value="image">سؤال مصوّر ({counts.illustrated})</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={difficultyFilter}
                  onChange={(e) => setDifficultyFilter(e.target.value)}
                  aria-label="تصفية حسب الصعوبة"
                  className="w-full px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none"
                >
                  <option value="الكل">كل الصعوبات</option>
                  {DIFFICULTIES_LIST.map((diff) => (
                    <option key={diff} value={diff}>
                      {diff} ({DIFFICULTY_TO_POINTS[diff]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="تصفية حسب الحالة"
                  className="w-full px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none"
                >
                  <option value="الكل">كل الحالات</option>
                  <option value="approved">معتمد (Approved)</option>
                  <option value="pending">قيد المراجعة (Pending)</option>
                  <option value="rejected">مرفوض (Rejected)</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E5E8DD] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDuplicatesOnly((prev) => !prev)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    showDuplicatesOnly
                      ? 'bg-[#F07842] text-white border-[#F07842]'
                      : 'bg-[#F3F5E9] text-[#252824] border-[#E5E8DD]'
                  }`}
                >
                  كشف الأسئلة المكررة ({counts.duplicates})
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleConvertExistingToDirect}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#EAF2EE] hover:bg-[#D5E6DD] text-[#14543D] border border-[#C5DDD1] flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>توحيد جميع الأسئلة إلى مباشرة</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] border border-[#E5E8DD] flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير JSON</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] border border-[#E5E8DD] flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير CSV</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#14543D] hover:bg-[#0E3F2D] text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>استيراد JSON / CSV</span>
                </button>
              </div>

              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 bg-[#F3F5E9] px-3 py-1.5 rounded-xl border border-[#E5E8DD]">
                  <span className="text-xs font-bold text-[#252824]">
                    المحدد: {selectedIds.length}
                  </span>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleBulkStatus('approved')}
                    className="px-2.5 py-1 text-xs font-bold bg-[#14543D] text-white rounded-md cursor-pointer"
                  >
                    اعتماد الكل
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleBulkStatus('rejected')}
                    className="px-2.5 py-1 text-xs font-bold bg-[#F07842] text-white rounded-md cursor-pointer"
                  >
                    رفض الكل
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleBulkDelete}
                    className="px-2.5 py-1 text-xs font-bold bg-rose-700 text-white rounded-md cursor-pointer"
                  >
                    حذف الكل
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F3F5E9] border-b border-[#E5E8DD] text-[#777B73]">
                    <th className="py-3.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredQuestions.length > 0 &&
                          selectedIds.length === filteredQuestions.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredQuestions.map((q) => q.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                        aria-label="تحديد كل الأسئلة المعروضة"
                      />
                    </th>
                    <th className="py-3.5 px-4 font-bold">الفئة الفرعية</th>
                    <th className="py-3.5 px-4 font-bold">السؤال والإجابة</th>
                    <th className="py-3.5 px-4 font-bold">النوع</th>
                    <th className="py-3.5 px-4 font-bold">الصعوبة والنقاط</th>
                    <th className="py-3.5 px-4 font-bold">الحالة</th>
                    <th className="py-3.5 px-4 font-bold">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E8DD]">
                  {filteredQuestions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-12 text-center text-sm text-[#777B73]"
                      >
                        {loadingQuestions
                          ? 'جاري تحميل الأسئلة من قاعدة البيانات...'
                          : 'لا توجد أسئلة مطابقة لمعايير البحث الحالية.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedQuestions.map((q) => {
                      const isDup = duplicateIdsSet.has(q.id);
                      const isChecked = selectedIds.includes(q.id);
                      const parentMain = subcategoryToMainMap.get(q.category);
                      return (
                        <tr
                          key={q.id}
                          className={`hover:bg-[#F3F5E9]/50 transition-colors ${
                            isChecked ? 'bg-[#F3F5E9]' : ''
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedIds((prev) => [...prev, q.id]);
                                } else {
                                  setSelectedIds((prev) =>
                                    prev.filter((item) => item !== q.id)
                                  );
                                }
                              }}
                              aria-label={`تحديد السؤال ${q.id}`}
                            />
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-bold text-[#14543D]">
                              {q.category}
                            </div>
                            {parentMain && (
                              <div className="text-[10px] text-[#777B73]">
                                {parentMain}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 max-w-md space-y-1">
                            <div className="font-semibold text-[#252824] text-sm">
                              {q.questionText}
                              {isDup && (
                                <span className="mr-2 text-[11px] font-bold text-[#F07842]">
                                  (مكرر محتمل)
                                </span>
                              )}
                            </div>
                            <div className="text-[#777B73]">
                              الإجابة:{' '}
                              <strong className="text-[#14543D]">
                                {q.correctAnswer}
                              </strong>
                              {q.source && ` · المصدر: ${q.source}`}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {q.imageUrl ? (
                              <div className="flex items-center gap-2">
                                <img
                                  src={q.imageUrl}
                                  alt={q.imageDescription || 'صورة السؤال'}
                                  className="w-9 h-9 rounded-lg object-cover border border-[#E5E8DD] bg-[#F3F5E9] shrink-0"
                                />
                                <div>
                                  <div className="text-[#F07842] font-bold flex items-center gap-1">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    <span>سؤال مصوّر</span>
                                  </div>
                                  {q.imageDescription && (
                                    <div className="text-[10px] text-[#777B73] max-w-[120px] truncate">
                                      {q.imageDescription}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[#14543D] font-semibold">
                                سؤال نصي
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-semibold text-[#252824]">
                              {q.difficulty}
                            </span>
                            <span className="mx-1.5 text-[#777B73]">·</span>
                            <span className="font-mono tabular-nums font-bold text-[#F07842]">
                              {q.points}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-bold">
                            {q.status === 'approved' && (
                              <span className="text-[#14543D]">معتمد</span>
                            )}
                            {q.status === 'pending' && (
                              <span className="text-[#F07842]">
                                قيد المراجعة
                              </span>
                            )}
                            {q.status === 'rejected' && (
                              <span className="text-rose-700">مرفوض</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {q.status !== 'approved' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSingleStatusChange(q.id, 'approved')
                                  }
                                  title="اعتماد السؤال"
                                  className="p-1.5 text-[#14543D] hover:bg-[#EAF2EE] rounded-lg cursor-pointer"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              )}
                              {q.status !== 'rejected' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSingleStatusChange(q.id, 'rejected')
                                  }
                                  title="رفض السؤال"
                                  className="p-1.5 text-[#F07842] hover:bg-[#FEF2EC] rounded-lg cursor-pointer"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openEditModal(q)}
                                title="تعديل السؤال"
                                className="p-1.5 text-[#252824] hover:bg-[#F3F5E9] rounded-lg cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSingleDelete(q.id)}
                                title="حذف السؤال"
                                className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls for Questions */}
            {filteredQuestions.length > questionsPerPage && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-[#E5E8DD] bg-[#FFFFFF] rounded-b-2xl">
                <div className="text-xs text-[#777B73]">
                  عرض{' '}
                  <span className="font-bold text-[#252824]">
                    {((questionsPage - 1) * questionsPerPage + 1).toLocaleString('ar-SA')}
                  </span>{' '}
                  -{' '}
                  <span className="font-bold text-[#252824]">
                    {Math.min(questionsPage * questionsPerPage, filteredQuestions.length).toLocaleString('ar-SA')}
                  </span>{' '}
                  من أصل{' '}
                  <span className="font-bold text-[#252824]">
                    {filteredQuestions.length.toLocaleString('ar-SA')}
                  </span>{' '}
                  سؤال
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={questionsPage <= 1}
                    onClick={() => {
                      setQuestionsPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 400, behavior: 'smooth' });
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-[#E5E8DD] bg-[#FFFFFF] text-[#252824] hover:bg-[#F3F5E9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    الصفحة السابقة
                  </button>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#252824]">
                    <span>صفحة</span>
                    <span className="px-2.5 py-1 rounded bg-[#EAF2EE] text-[#14543D]">
                      {questionsPage.toLocaleString('ar-SA')}
                    </span>
                    <span>من</span>
                    <span>{totalQuestionPages.toLocaleString('ar-SA')}</span>
                  </div>
                  <button
                    type="button"
                    disabled={questionsPage >= totalQuestionPages}
                    onClick={() => {
                      setQuestionsPage((p) => Math.min(totalQuestionPages, p + 1));
                      window.scrollTo({ top: 400, behavior: 'smooth' });
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg border border-[#E5E8DD] bg-[#FFFFFF] text-[#252824] hover:bg-[#F3F5E9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    الصفحة التالية
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 5: CONTACT US SETTINGS MANAGEMENT */}
      {adminTab === 'contact' && (
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 md:p-8 max-w-3xl space-y-6">
          <div className="space-y-1 border-b border-[#E5E8DD] pb-4">
            <div className="text-xs font-bold text-[#F07842]">
              إعدادات صفحة تواصل معنا
            </div>
            <h2 className="font-display text-xl font-bold text-[#252824]">
              تعديل بيانات وروابط التواصل
            </h2>
            <p className="text-xs text-[#777B73]">
              جميع الحقول هنا تظهر مباشرة في صفحة «تواصل معنا». اترك أي حقل فارغاً إذا لم ترغب في عرضه حالياً.
            </p>
          </div>

          <form
            onSubmit={handleSaveContactSettings}
            className="space-y-5 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="block font-bold text-[#252824]">
                  العنوان الترحيبي الرئيسي
                </label>
                <input
                  type="text"
                  required
                  value={contactHeading}
                  onChange={(e) => setContactHeading(e.target.value)}
                  placeholder="حنا هنا لمساعدتك!"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block font-bold text-[#252824]">
                  الرسالة الترحيبية القصيرة
                </label>
                <textarea
                  rows={3}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="اكتب رسالة قصيرة تدعو الزوار للتواصل معكم..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  رقم أو رابط الواتساب (WhatsApp)
                </label>
                <input
                  type="text"
                  value={contactWhatsappUrl}
                  onChange={(e) => setContactWhatsappUrl(e.target.value)}
                  placeholder="مثال: https://wa.me/9665... أو رقم الجوال دولياً"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] text-left font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  النص الظاهر على زر الواتساب (اختياري)
                </label>
                <input
                  type="text"
                  value={contactWhatsappDisplay}
                  onChange={(e) => setContactWhatsappDisplay(e.target.value)}
                  placeholder="مثال: تواصل معنا عبر واتساب"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block font-bold text-[#252824]">
                  البريد الإلكتروني للتواصل (Email)
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="ضع بريد التواصل الرسمي هنا..."
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] text-left font-mono"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#E5E8DD] space-y-4">
              <div className="font-bold text-[#252824]">
                روابط حسابات التواصل الاجتماعي (اختيارية)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-semibold text-[#777B73]">
                    رابط حساب X (تويتر)
                  </label>
                  <input
                    type="url"
                    value={contactTwitter}
                    onChange={(e) => setContactTwitter(e.target.value)}
                    placeholder="https://x.com/..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] text-left font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-[#777B73]">
                    رابط حساب إنستغرام (Instagram)
                  </label>
                  <input
                    type="url"
                    value={contactInstagram}
                    onChange={(e) => setContactInstagram(e.target.value)}
                    placeholder="https://instagram.com/..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] text-left font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-[#777B73]">
                    رابط حساب تيك توك (TikTok)
                  </label>
                  <input
                    type="url"
                    value={contactTiktok}
                    onChange={(e) => setContactTiktok(e.target.value)}
                    placeholder="https://tiktok.com/@..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] text-left font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-[#777B73]">
                    رابط حساب سناب شات (Snapchat)
                  </label>
                  <input
                    type="url"
                    value={contactSnapchat}
                    onChange={(e) => setContactSnapchat(e.target.value)}
                    placeholder="https://snapchat.com/add/..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] text-left font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E5E8DD] flex justify-end">
              <button
                type="submit"
                disabled={actionLoading}
                className="px-7 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  {actionLoading
                    ? 'جاري الحفظ...'
                    : 'حفظ بيانات التواصل في Firebase'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 6: USER CONTRIBUTIONS REVIEW (مساهمات المستخدمين) */}
      {adminTab === 'contributions' && (
        <div className="space-y-6">
          {/* Header & Subtitle */}
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[#14543D] mb-1 font-bold text-sm">
                <Inbox className="w-5 h-5 text-[#F07842]" />
                <span>مراجعة مساهمات اللاعبين والأسئلة المقترحة</span>
              </div>
              <p className="text-xs text-[#777B73]">
                هنا تظهر جميع الأسئلة التي اقترحها المستخدمون من خلال «قائمتي الخاصة». يمكنك مراجعة نص السؤال والإجابة والصورة والتصنيف، ثم اعتماده لنشره فوراً في بنك الأسئلة العام أو رفضه مع ذكر السبب.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <button
                type="button"
                onClick={loadContributions}
                disabled={loadingContributions}
                className="px-4 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] hover:bg-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-2 cursor-pointer transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingContributions ? 'animate-spin' : ''}`}
                />
                <span>تحديث</span>
              </button>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Status pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setContributionFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  contributionFilter === 'all'
                    ? 'bg-[#14543D] text-white'
                    : 'bg-[#F3F5E9] text-[#777B73] hover:text-[#252824]'
                }`}
              >
                الكل ({contributions.length})
              </button>
              <button
                type="button"
                onClick={() => setContributionFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  contributionFilter === 'pending'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <span>قيد المراجعة</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                  {contributions.filter((c) => c.status === 'pending').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setContributionFilter('approved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  contributionFilter === 'approved'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <span>معتمدة ومنشورة</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                  {contributions.filter((c) => c.status === 'approved').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setContributionFilter('rejected')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  contributionFilter === 'rejected'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                <span>مرفوضة</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                  {contributions.filter((c) => c.status === 'rejected').length}
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-[#777B73] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={contributionSearch}
                onChange={(e) => setContributionSearch(e.target.value)}
                placeholder="ابحث بالنص، الإجابة، أو الكاتب..."
                className="w-full pl-3 pr-9 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] placeholder:text-[#777B73]/70 focus:outline-hidden focus:border-[#14543D]"
              />
            </div>
          </div>

          {/* List of Contributions */}
          {loadingContributions ? (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center text-xs text-[#777B73]">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#14543D] mb-2" />
              <span>جاري تحميل المساهمات من Firestore...</span>
            </div>
          ) : filteredContributions.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center text-xs text-[#777B73] space-y-2">
              <Inbox className="w-10 h-10 text-[#777B73]/40 mx-auto" />
              <div className="font-bold text-[#252824] text-sm">
                {contributionFilter === 'pending'
                  ? 'لا توجد مساهمات قيد المراجعة حالياً'
                  : 'لم يتم العثور على أي مساهمات مطابقة'}
              </div>
              <p className="max-w-md mx-auto text-[11px]">
                عندما يرسل اللاعبون أسئلة من «قائمتي الخاصة»، ستظهر هنا فوراً لمراجعتها واعتمادها.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredContributions.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#14543D]/40 rounded-2xl p-5 shadow-xs transition-all space-y-4"
                >
                  {/* Top Bar: Author Info & Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E5E8DD]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#14543D] text-white flex items-center justify-center text-xs font-bold">
                        {(item.userName || item.userEmail || 'م')[0].toUpperCase()}
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-[#252824]">
                          {item.userName || 'مستخدم مساهم'}
                        </div>
                        <div className="text-[10px] text-[#777B73]" dir="ltr">
                          {item.userEmail || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#EAF2EE] text-[#14543D]">
                        {item.mainCategory}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#F3F5E9] text-[#252824] border border-[#E5E8DD]">
                        {item.category}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#F07842]/10 text-[#F07842]">
                        {item.points} نقطة
                      </span>

                      {/* Status Badge */}
                      {item.status === 'pending' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800">
                          قيد المراجعة
                        </span>
                      )}
                      {item.status === 'approved' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>معتمد ومنشور</span>
                        </span>
                      )}
                      {item.status === 'rejected' && (
                        <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          <span>مرفوض</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Question & Image Body */}
                  <div className="flex flex-col md:flex-row gap-4 items-start">
                    {item.imageUrl && (
                      <div className="w-full md:w-40 h-32 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] overflow-hidden shrink-0 group relative">
                        <img
                          src={item.imageUrl}
                          alt="صورة السؤال"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewContribution(item)}
                          className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-[11px] font-bold transition-opacity cursor-pointer"
                        >
                          تكبير الصورة
                        </button>
                      </div>
                    )}

                    <div className="flex-1 space-y-3 min-w-0">
                      <div>
                        <div className="text-[11px] font-bold text-[#777B73] mb-1">
                          نص السؤال:
                        </div>
                        <div className="text-sm font-bold text-[#252824] leading-relaxed">
                          {item.questionText}
                        </div>
                      </div>

                      <div className="bg-[#EAF2EE] border border-[#14543D]/20 rounded-xl p-3 space-y-1">
                        <div className="text-[10px] font-bold text-[#14543D]">
                          الإجابة النموذجية:
                        </div>
                        <div className="text-xs font-bold text-[#14543D]">
                          {item.correctAnswer}
                        </div>
                      </div>

                      {(item.explanation || item.source) && (
                        <div className="flex flex-wrap gap-4 text-[11px] text-[#777B73]">
                          {item.explanation && (
                            <div>
                              <span className="font-bold text-[#252824]">الشرح: </span>
                              <span>{item.explanation}</span>
                            </div>
                          )}
                          {item.source && (
                            <div>
                              <span className="font-bold text-[#252824]">المصدر: </span>
                              <span>{item.source}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {item.status === 'rejected' && item.rejectionReason && (
                        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 space-y-0.5">
                          <div className="font-bold">سبب الرفض المرسل للمستخدم:</div>
                          <div>{item.rejectionReason}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-3 border-t border-[#E5E8DD] flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] text-[#777B73]">
                      تم الإرسال: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('ar-SA') : 'مؤخراً'}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewContribution(item)}
                        className="px-3 py-1.5 rounded-lg border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#252824] flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#14543D]" />
                        <span>معاينة في لوحة اللعبة</span>
                      </button>

                      {item.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenRejectModal(item)}
                            disabled={actionLoading}
                            className="px-3.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>رفض السؤال</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleApproveContribution(item)}
                            disabled={actionLoading}
                            className="px-4 py-1.5 rounded-lg bg-[#14543D] hover:bg-[#0E3D2C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#F07842]" />
                            <span>اعتماد ونشر في اللعبة</span>
                          </button>
                        </>
                      )}

                      {item.status === 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleApproveContribution(item)}
                          disabled={actionLoading}
                          className="px-3.5 py-1.5 rounded-lg border border-[#14543D] bg-[#FFFFFF] hover:bg-[#EAF2EE] text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>إعادة اعتماد السؤال</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 7: PLAYER & CATEGORY ANALYTICS DASHBOARD */}
      {adminTab === 'player_analytics' && (
        <AdminPlayerAnalytics isAdmin={isAdmin} subcategories={subcategories} />
      )}

      {/* MODAL 1: ADD / EDIT MAIN CATEGORY MODAL */}
      {mainModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            <div className="bg-[#14543D] text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">
                {editingMainCategory
                  ? `تعديل الفئة الرئيسية: ${editingMainCategory.name}`
                  : '+ إضافة فئة رئيسية جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setMainModalOpen(false)}
                className="text-white/80 hover:text-white text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <form
              onSubmit={handleSaveMainCategory}
              className="p-6 overflow-y-auto space-y-5 text-xs"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Right Column (Form Fields) */}
                <div className="md:col-span-7 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#252824]">
                      اسم الفئة
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={mainFormName}
                      onChange={(e) => setMainFormName(e.target.value)}
                      placeholder="مثال: عام، كرة قدم، علوم وتقنية..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-bold"
                    />
                    {editingMainCategory &&
                      editingMainCategory.name !== mainFormName.trim() &&
                      mainFormName.trim().length >= 2 && (
                        <p className="text-[11px] text-[#14543D] font-semibold">
                          ملاحظة: سيتم تلقائياً تحديث جميع الفئات الفرعية المرتبطة بهذا القسم للاسم الجديد مع الحفاظ على كافة الأسئلة.
                        </p>
                      )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#252824]">
                      وصف الفئة
                    </label>
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={mainFormDescription}
                      onChange={(e) => setMainFormDescription(e.target.value)}
                      placeholder="وصف مختصر يظهر تحت اسم الفئة الرئيسية في الموقع..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-[#252824]">
                        ترتيب ظهور الفئة
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={mainFormSortOrder}
                        onChange={(e) =>
                          setMainFormSortOrder(Number(e.target.value) || 1)
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-[#252824]">
                        حالة الفئة (ظاهرة / مخفية)
                      </label>
                      <select
                        value={mainFormIsActive ? 'visible' : 'hidden'}
                        onChange={(e) =>
                          setMainFormIsActive(e.target.value === 'visible')
                        }
                        className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-semibold"
                      >
                        <option value="visible">ظاهرة في الموقع</option>
                        <option value="hidden">مخفية عن الألعاب الجديدة</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#252824]">
                      أيقونة الفئة (تظهر في أعمدة لوحة اللعب)
                    </label>
                    <select
                      value={mainFormIconName}
                      onChange={(e) =>
                        setMainFormIconName(
                          e.target.value as MainCategoryIconName
                        )
                      }
                      className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                    >
                      {ICON_OPTIONS.map((ico) => (
                        <option key={ico.id} value={ico.id}>
                          {ico.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FEF2EC]/70 border border-[#F07842]/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mainFormIsComingSoon}
                      onChange={(e) => setMainFormIsComingSoon(e.target.checked)}
                      className="mt-0.5 accent-[#F07842]"
                    />
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#252824] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#F07842]" />
                        <span>تفعيل وضع «قريباً» (تعطيل مؤقت دون حذف)</span>
                      </div>
                      <p className="text-[11px] text-[#777B73]">
                        تظهر البطاقة في الموقع بشارة «قريباً» ويُمنع اختيارها في المباريات مع بقاء جميع الأسئلة والصور محفوظة.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Left Column (Category Image + Live Card Preview) */}
                <div className="md:col-span-5 space-y-3">
                  <label className="block font-bold text-[#252824]">
                    صورة الفئة ومعاينة البطاقة
                  </label>

                  <div className="group relative aspect-square w-full rounded-2xl overflow-hidden border-2 border-[#E5E8DD] bg-[#14543D] flex flex-col justify-end">
                    <div className="absolute inset-0">
                      <CategoryCardArtwork
                        name={mainFormName || 'اسم الفئة'}
                        mainCategory={mainFormName || 'اسم الفئة'}
                        imageUrl={mainFormImageUrl}
                        isMainCategory
                        className={mainFormIsComingSoon ? 'grayscale-[45%] brightness-75' : ''}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#131614]/90 via-[#131614]/30 to-transparent" />
                    </div>

                    <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10">
                      {mainFormIsComingSoon ? (
                        <span className="px-2.5 py-0.5 rounded-md bg-[#F07842] text-white text-[10px] font-bold inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>قريباً</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-[#252824]/75 text-white font-mono text-[10px] font-bold">
                          معاينة البطاقة
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          mainFormIsActive
                            ? 'bg-[#14543D] text-white'
                            : 'bg-rose-600 text-white'
                        }`}
                      >
                        {mainFormIsActive ? 'ظاهرة' : 'مخفية'}
                      </span>
                    </div>

                    <div className="relative z-10 p-4 text-right space-y-0.5">
                      <div className="font-display text-lg font-bold text-white">
                        {mainFormName || 'اسم الفئة الرئيسية'}
                      </div>
                      <p className="text-[11px] text-[#F3F5E9]/85 line-clamp-1">
                        {mainFormDescription || 'وصف الفئة يظهر هنا...'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        triggerSelectCategoryImage({
                          kind: 'main_draft',
                          mainCat: editingMainCategory || undefined,
                        })
                      }
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>
                        {mainFormImageUrl ? 'تغيير صورة الفئة' : 'رفع صورة الفئة'}
                      </span>
                    </button>

                    {mainFormImageUrl && (
                      <button
                        type="button"
                        onClick={() => setMainFormImageUrl('')}
                        title="إزالة الصورة"
                        className="p-2.5 rounded-xl bg-[#F3F5E9] hover:bg-rose-50 text-rose-700 border border-[#E5E8DD] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Required Footer Buttons: حفظ التعديلات / إلغاء / حذف الفئة */}
              <div className="pt-4 border-t border-[#E5E8DD] flex flex-wrap items-center justify-between gap-3">
                {editingMainCategory ? (
                  <button
                    type="button"
                    onClick={() =>
                      openDeleteMainCategoryDialog(editingMainCategory)
                    }
                    className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف الفئة</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMainModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#252824] font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-6 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white font-bold cursor-pointer"
                  >
                    {actionLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: WEBSITE CARD PREVIEW MODAL FOR MAIN CATEGORY */}
      {previewMainCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#F3F5E9] border-2 border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
              <div>
                <div className="text-[11px] font-bold text-[#F07842]">
                  معاينة حية لظهور الفئة في الموقع
                </div>
                <h3 className="font-display text-lg font-bold text-[#252824]">
                  {previewMainCategory.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMainCategory(null)}
                className="px-3 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-bold text-[#252824] cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="group relative aspect-square w-full rounded-2xl overflow-hidden bg-[#FFFFFF] border-2 border-[#E5E8DD] text-right flex flex-col justify-end shadow-sm">
              <div className="absolute inset-0">
                <CategoryCardArtwork
                  name={previewMainCategory.name}
                  mainCategory={previewMainCategory.name}
                  imageUrl={previewMainCategory.imageUrl}
                  isMainCategory
                  className={previewMainCategory.isComingSoon ? 'grayscale-[45%] brightness-75' : ''}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#131614]/90 via-[#131614]/30 to-transparent" />
              </div>

              <div className="absolute top-3.5 inset-x-3.5 flex items-center justify-between z-10">
                {previewMainCategory.isComingSoon ? (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F07842] text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-md">
                    <Clock className="w-3 h-3" />
                    <span>قريباً</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg bg-[#252824]/75 backdrop-blur-xs text-white font-mono text-[11px] font-bold">
                    {getSubcategoriesForMain(previewMainCategory).length} فئات
                  </span>
                )}
              </div>

              <div className="relative z-10 p-5 w-full space-y-1">
                <h2 className="font-display text-2xl font-bold text-[#FFFFFF]">
                  {previewMainCategory.name}
                </h2>
                <p className="text-xs text-[#F3F5E9]/85 line-clamp-2">
                  {previewMainCategory.description ||
                    previewMainCategory.tagline}
                </p>
                {previewMainCategory.isComingSoon && (
                  <p className="text-[11px] font-bold text-[#FFB088]">
                    غير متاحة حالياً · قادمة قريباً
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const target = previewMainCategory;
                  setPreviewMainCategory(null);
                  openEditMainCategoryModal(target);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#14543D] text-white text-xs font-bold cursor-pointer"
              >
                تعديل هذه الفئة
              </button>
              <button
                type="button"
                onClick={() => setPreviewMainCategory(null)}
                className="px-5 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-bold text-[#252824] cursor-pointer"
              >
                تم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SAFE DELETE MAIN CATEGORY CONFIRMATION & REASSIGNMENT DIALOG */}
      {deletingMainCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#FFFFFF] border-2 border-rose-200 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-5 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-[#252824]">
                  تأكيد حذف الفئة الرئيسية «{deletingMainCategory.name}»
                </h3>
                <p className="text-[#777B73] leading-relaxed">
                  هل أنت متأكد من رغبتك في حذف هذه الفئة الرئيسية؟
                </p>
              </div>
            </div>

            {(deletingMainSubs.length > 0 ||
              deletingMainQuestions.length > 0) && (
              <div className="bg-[#FEF2EC] border border-[#F07842] rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#D9602B]">
                  تنبيه حماية البيانات: تحتوي هذه الفئة على{' '}
                  {deletingMainSubs.length} فئة فرعية و{' '}
                  {deletingMainQuestions.length} سؤال مرتبط بها.
                </div>

                <div className="space-y-2.5">
                  {sortedMainCategories.filter(
                    (m) => m.id !== deletingMainCategory.id
                  ).length > 0 && (
                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] cursor-pointer">
                      <input
                        type="radio"
                        name="deleteMainMode"
                        checked={deleteMainMode === 'reassign_subcategories'}
                        onChange={() =>
                          setDeleteMainMode('reassign_subcategories')
                        }
                        className="mt-0.5"
                      />
                      <div className="space-y-2 flex-1">
                        <div className="font-bold text-[#14543D]">
                          نقل الفئات الفرعية وأسئلتها إلى فئة رئيسية أخرى (آمن وموصى به)
                        </div>
                        {deleteMainMode === 'reassign_subcategories' && (
                          <select
                            value={deleteMainTargetId}
                            onChange={(e) =>
                              setDeleteMainTargetId(e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-semibold"
                          >
                            {sortedMainCategories
                              .filter((m) => m.id !== deletingMainCategory.id)
                              .map((mc) => (
                                <option key={mc.id} value={mc.id}>
                                  {mc.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </label>
                  )}

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] cursor-pointer">
                    <input
                      type="radio"
                      name="deleteMainMode"
                      checked={deleteMainMode === 'delete_subcategories'}
                      onChange={() => setDeleteMainMode('delete_subcategories')}
                      className="mt-0.5"
                    />
                    <div className="space-y-2 flex-1">
                      <div className="font-bold text-rose-700">
                        حذف الفئة الرئيسية مع جميع فئاتها الفرعية ({deletingMainSubs.length})
                      </div>
                      {deleteMainMode === 'delete_subcategories' &&
                        deletingMainQuestions.length > 0 && (
                          <label className="flex items-center gap-2 pt-1 text-rose-800 font-semibold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={deleteMainConfirmQuestions}
                              onChange={(e) =>
                                setDeleteMainConfirmQuestions(e.target.checked)
                              }
                            />
                            <span>
                              أؤكد رغبتي أيضاً في الحذف النهائي لعدد{' '}
                              {deletingMainQuestions.length} سؤال مرتبط بهذه الفئات
                            </span>
                          </label>
                        )}
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#E5E8DD] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingMainCategory(null)}
                className="px-5 py-2.5 rounded-xl bg-[#F3F5E9] text-[#252824] font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDeleteMainCategory}
                className="px-6 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer"
              >
                {actionLoading ? 'جاري التنفيذ...' : 'تأكيد حذف الفئة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD / EDIT SUBCATEGORY MODAL */}
      {subModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="bg-[#14543D] text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">
                {editingSubcategory
                  ? 'تعديل وتنظيم الفئة الفرعية'
                  : 'إضافة فئة فرعية جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setSubModalOpen(false)}
                className="text-white/80 hover:text-white text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <form
              onSubmit={handleSaveSubcategory}
              className="p-6 overflow-y-auto space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  الفئة الرئيسية التابعة لها (يمكنك نقل الفئة الفرعية لأي قسم رئيسي)
                </label>
                <select
                  value={subFormMainCategoryId}
                  onChange={(e) => setSubFormMainCategoryId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-semibold"
                >
                  {sortedMainCategories.map((mc) => (
                    <option key={mc.id} value={mc.id}>
                      {mc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  اسم الفئة الفرعية (تظهر كعمود في لوحة اللعب)
                </label>
                <input
                  type="text"
                  required
                  value={subFormName}
                  onChange={(e) => setSubFormName(e.target.value)}
                  placeholder="مثال: الدوري السعودي، كأس العالم، ون بيس..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                />
                {editingSubcategory &&
                  editingSubcategory.name !== subFormName.trim() && (
                    <p className="text-[11px] text-[#F07842] font-semibold">
                      تنبيه: عند تغيير الاسم سيتم تلقائياً تحديث جميع الأسئلة المرتبطة بـ «{editingSubcategory.name}» إلى الاسم الجديد.
                    </p>
                  )}
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  وصف مختصر للفئة الفرعية
                </label>
                <input
                  type="text"
                  value={subFormDescription}
                  onChange={(e) => setSubFormDescription(e.target.value)}
                  placeholder="وصف قصير يوضح محتوى الأسئلة داخل هذه الفئة..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    ترتيب العرض (Sort Order)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={subFormSortOrder}
                    onChange={(e) =>
                      setSubFormSortOrder(Number(e.target.value) || 1)
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    حالة الظهور للاعبين
                  </label>
                  <select
                    value={subFormIsActive ? 'active' : 'hidden'}
                    onChange={(e) =>
                      setSubFormIsActive(e.target.value === 'active')
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  >
                    <option value="active">ظاهرة للاعبين</option>
                    <option value="hidden">مخفية عن الألعاب الجديدة</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#FEF2EC]/70 border border-[#F07842]/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={subFormIsComingSoon}
                  onChange={(e) => setSubFormIsComingSoon(e.target.checked)}
                  className="mt-0.5 accent-[#F07842]"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-[#252824] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>تفعيل وضع «قريباً» لهذه الفئة الفرعية</span>
                  </div>
                  <p className="text-[11px] text-[#777B73]">
                    تظهر بشارة «قريباً» وتُمنع من اللعب مؤقتاً مع الحفاظ على جميع أسئلتها وصورتها.
                  </p>
                </div>
              </label>

              {/* Subcategory Image Upload in Modal */}
              <div className="space-y-2 pt-1">
                <label className="block font-bold text-[#252824]">
                  صورة الفئة الفرعية
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-[#E5E8DD] bg-[#14543D] shrink-0">
                    <CategoryCardArtwork
                      name={subFormName || 'فئة فرعية'}
                      imageUrl={subFormImageUrl}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        triggerSelectCategoryImage({
                          kind: 'sub_draft',
                          subCat: editingSubcategory || undefined,
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-[#F07842] text-white font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Crop className="w-3.5 h-3.5" />
                      <span>
                        {subFormImageUrl ? 'تغيير الصورة' : 'رفع صورة'}
                      </span>
                    </button>
                    {subFormImageUrl && (
                      <button
                        type="button"
                        onClick={() => setSubFormImageUrl('')}
                        className="px-3 py-2 rounded-xl bg-[#F3F5E9] text-rose-700 font-bold cursor-pointer"
                      >
                        حذف الصورة
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E8DD] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSubModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-[#F3F5E9] text-[#252824] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold cursor-pointer"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'حفظ الفئة الفرعية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: SAFE DELETE SUBCATEGORY CONFIRMATION DIALOG */}
      {deletingSubcategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#FFFFFF] border-2 border-rose-200 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-5 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-[#252824]">
                  تأكيد حذف الفئة الفرعية «{deletingSubcategory.name}»
                </h3>
                <p className="text-[#777B73] leading-relaxed">
                  هل أنت متأكد من حذف هذه الفئة الفرعية؟
                </p>
              </div>
            </div>

            {deletingSubQuestions.length > 0 && (
              <div className="bg-[#FEF2EC] border border-[#F07842] rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#D9602B]">
                  تنبيه: تحتوي هذه الفئة الفرعية على{' '}
                  {deletingSubQuestions.length} سؤال في قاعدة البيانات.
                </div>

                <div className="space-y-2">
                  {subcategories.filter((s) => s.id !== deletingSubcategory.id)
                    .length > 0 && (
                    <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] cursor-pointer">
                      <input
                        type="radio"
                        name="deleteSubMode"
                        checked={deleteSubMode === 'reassign_questions'}
                        onChange={() => setDeleteSubMode('reassign_questions')}
                        className="mt-0.5"
                      />
                      <div className="space-y-2 flex-1">
                        <div className="font-bold text-[#14543D]">
                          نقل الأسئلة ({deletingSubQuestions.length}) إلى فئة فرعية أخرى قبل الحذف (موصى به)
                        </div>
                        {deleteSubMode === 'reassign_questions' && (
                          <select
                            value={deleteSubTargetId}
                            onChange={(e) =>
                              setDeleteSubTargetId(e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] font-semibold"
                          >
                            {subcategories
                              .filter((s) => s.id !== deletingSubcategory.id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.mainCategory})
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </label>
                  )}

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] cursor-pointer">
                    <input
                      type="radio"
                      name="deleteSubMode"
                      checked={deleteSubMode === 'keep_questions'}
                      onChange={() => setDeleteSubMode('keep_questions')}
                      className="mt-0.5"
                    />
                    <div className="font-bold text-[#252824]">
                      حذف الفئة الفرعية فقط والاحتفاظ بالأسئلة في بنك الأسئلة
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] cursor-pointer">
                    <input
                      type="radio"
                      name="deleteSubMode"
                      checked={deleteSubMode === 'delete_questions'}
                      onChange={() => setDeleteSubMode('delete_questions')}
                      className="mt-0.5"
                    />
                    <div className="space-y-2 flex-1">
                      <div className="font-bold text-rose-700">
                        حذف الفئة الفرعية وحذف جميع أسئلتها نهائياً
                      </div>
                      {deleteSubMode === 'delete_questions' && (
                        <label className="flex items-center gap-2 text-rose-800 font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={deleteSubConfirmQuestions}
                            onChange={(e) =>
                              setDeleteSubConfirmQuestions(e.target.checked)
                            }
                          />
                          <span>
                            أؤكد الموافقة الصريحة على الحذف النهائي لعدد{' '}
                            {deletingSubQuestions.length} سؤال
                          </span>
                        </label>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#E5E8DD] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingSubcategory(null)}
                className="px-5 py-2.5 rounded-xl bg-[#F3F5E9] text-[#252824] font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDeleteSubcategory}
                className="px-6 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer"
              >
                {actionLoading ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: ADD / EDIT QUESTION MODAL */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-xl max-h-[92vh] flex flex-col">
            <div className="bg-[#14543D] text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="font-display text-lg font-bold">
                {editingQuestionId ? 'تعديل بيانات السؤال' : 'إضافة سؤال جديد'}
              </h3>
              <button
                type="button"
                onClick={handleCloseQuestionModal}
                className="text-white/80 hover:text-white text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <form
              onSubmit={handleSaveQuestion}
              className="p-6 overflow-y-auto space-y-4 text-xs"
            >
              {questionModalError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
                  <div className="flex items-start gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{questionModalError}</span>
                  </div>
                  {pendingQuestionImageFile && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rose-200/70 text-[11px]">
                      <span>
                        بيانات السؤال النصية محفوظة بالكامل. يمكنك إعادة المحاولة أو إزالة الصورة المعلقة وحفظ السؤال كنص فقط.
                      </span>
                      <button
                        type="button"
                        onClick={handleRemoveQuestionImage}
                        className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold hover:bg-rose-100 cursor-pointer shrink-0"
                      >
                        إزالة الصورة المعلقة
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    الفئة الفرعية
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  >
                    {sortedMainCategories.map((mainCat) => {
                      const subs = getSubcategoriesForMain(mainCat);
                      if (subs.length === 0) return null;
                      return (
                        <optgroup key={mainCat.id} label={mainCat.name}>
                          {subs.map((sub) => (
                            <option key={sub.id} value={sub.name}>
                              {sub.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    نوع السؤال المباشر
                  </label>
                  {pendingQuestionImagePreviewUrl || formImageUrl ? (
                    <div className="w-full px-3 py-2.5 rounded-xl bg-[#FEF2EC] border border-[#F07842]/40 text-[#F07842] font-bold flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>سؤال مصوّر (نص + صورة)</span>
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2.5 rounded-xl bg-[#EAF2EE] border border-[#C5DDD1] text-[#14543D] font-bold">
                      سؤال نصي بدون صورة
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    مستوى الصعوبة والنقاط
                  </label>
                  <select
                    value={formPoints}
                    onChange={(e) => {
                      const pts = Number(e.target.value) as PointValue;
                      setFormPoints(pts);
                      setFormDifficulty(POINT_TO_DIFFICULTY[pts]);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  >
                    <option value={100}>100 نقطة — سهل</option>
                    <option value={200}>200 نقطة — متوسط</option>
                    <option value={300}>300 نقطة — صعب</option>
                    <option value={400}>400 نقطة — صعب جداً</option>
                    <option value={500}>500 نقطة — خبير</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  نص السؤال المباشر
                </label>
                <textarea
                  rows={3}
                  required
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  placeholder="اكتب السؤال المباشر بصياغة عربية واضحة ومكتملة بدون الحاجة لخيارات..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                />
              </div>

              {/* Optional Question Image Upload & Live Preview Section */}
              <div className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-bold text-[#252824] flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-[#14543D]" />
                      <span>صورة السؤال (اختياري — للسؤال المصوّر)</span>
                    </div>
                    <p className="text-[11px] text-[#777B73]">
                      الصيغ المدعومة: JPG وPNG وWEBP · الحد الأقصى للحجم: 5 ميجابايت · يمكنك تركه فارغاً لإنشاء سؤال نصي عادي.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      ref={questionImageInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                      onChange={handleQuestionImageFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => questionImageInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {pendingQuestionImagePreviewUrl || formImageUrl
                          ? 'تغيير الصورة'
                          : 'رفع صورة من الجهاز'}
                      </span>
                    </button>

                    {(pendingQuestionImagePreviewUrl || formImageUrl) && (
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={handleRemoveQuestionImage}
                        className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف الصورة</span>
                      </button>
                    )}
                  </div>
                </div>

                {(pendingQuestionImagePreviewUrl || formImageUrl) && (
                  <div className="space-y-3 pt-2 border-t border-[#E5E8DD]">
                    <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3 flex flex-col items-center gap-2">
                      <div className="w-full flex items-center justify-between text-[11px] text-[#777B73]">
                        <span className="font-semibold text-[#14543D]">
                          معاينة الصورة قبل الحفظ:
                        </span>
                        <span>
                          {pendingQuestionImageFile
                            ? `ملف جديد: ${pendingQuestionImageFile.name} (${(
                                pendingQuestionImageFile.size /
                                (1024 * 1024)
                              ).toFixed(2)} MB)`
                            : 'صورة محفوظة في Firebase Storage'}
                        </span>
                      </div>
                      <img
                        src={pendingQuestionImagePreviewUrl || formImageUrl}
                        alt={
                          formImageDescription ||
                          'معاينة صورة السؤال قبل الحفظ'
                        }
                        className="max-h-52 w-auto max-w-full object-contain rounded-lg border border-[#E5E8DD]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block font-bold text-[#252824]">
                        وصف الصورة (اختياري)
                      </label>
                      <input
                        type="text"
                        value={formImageDescription}
                        onChange={(e) =>
                          setFormImageDescription(e.target.value)
                        }
                        placeholder="توضيح مختصر للصورة يظهر أسفلها أو كوصف بديل عند الحاجة..."
                        className="w-full px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#252824]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    الإجابة الصحيحة المعتمدة
                  </label>
                  <input
                    type="text"
                    required
                    value={formCorrectAnswer}
                    onChange={(e) => setFormCorrectAnswer(e.target.value)}
                    placeholder="اكتب الإجابة الصحيحة..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    حالة الاعتماد
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as ApprovalStatus)
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  >
                    <option value="approved">معتمد (يظهر في اللعب)</option>
                    <option value="pending">قيد المراجعة</option>
                    <option value="rejected">مرفوض</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    شرح مختصر للمعلومة (اختياري)
                  </label>
                  <input
                    type="text"
                    value={formExplanation}
                    onChange={(e) => setFormExplanation(e.target.value)}
                    placeholder="توضيح يظهر بعد كشف الإجابة..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#252824]">
                    المصدر أو المرجع (اختياري)
                  </label>
                  <input
                    type="text"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    placeholder="مثال: دارة الملك عبدالعزيز، موسوعة..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E8DD] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseQuestionModal}
                  className="px-4 py-2.5 rounded-xl bg-[#F3F5E9] text-[#252824] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold cursor-pointer"
                >
                  {actionLoading
                    ? pendingQuestionImageFile
                      ? 'جاري رفع الصورة وحفظ السؤال...'
                      : 'جاري الحفظ...'
                    : 'حفظ السؤال في Firestore'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REJECT CONTRIBUTION REASON */}
      {rejectModalContribution && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-700 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <XCircle className="w-4 h-4" />
                <span>رفض مساهمة السؤال</span>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalContribution(null)}
                className="text-white/80 hover:text-white text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-[#F3F5E9] p-3 rounded-xl border border-[#E5E8DD] space-y-1">
                <div className="font-bold text-[#252824]">السؤال:</div>
                <div className="text-[#777B73] line-clamp-2">
                  {rejectModalContribution.questionText}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#252824]">
                  سبب الرفض (سيظهر للمستخدم في قائمته الخاصة لمساعدته في التعديل):
                </label>
                <textarea
                  rows={3}
                  value={rejectReasonText}
                  onChange={(e) => setRejectReasonText(e.target.value)}
                  placeholder="مثال: السؤال مكرر، أو الإجابة بحاجة لتدقيق، أو التصنيف غير مناسب..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#252824] leading-relaxed resize-none focus:outline-hidden focus:border-rose-600"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E8DD] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRejectModalContribution(null)}
                  className="px-4 py-2 rounded-xl bg-[#F3F5E9] text-[#252824] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer transition-colors"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'تأكيد الرفض'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW QUESTION IN GAME BOARD */}
      {previewContribution && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#252824]/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#14543D] text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Eye className="w-4 h-4 text-[#F07842]" />
                <span>معاينة السؤال كما يظهر في لوحة المنافسة</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewContribution(null)}
                className="text-white/80 hover:text-white text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="p-6 space-y-5 text-right">
              {/* Fake Game Tile Header */}
              <div className="flex items-center justify-between bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl px-4 py-2.5 text-xs">
                <div className="font-bold text-[#14543D]">
                  {previewContribution.mainCategory} • {previewContribution.category}
                </div>
                <div className="font-mono font-bold text-[#F07842] text-sm">
                  {previewContribution.points} نقطة
                </div>
              </div>

              {/* Fake Question Card Display */}
              <div className="border-2 border-[#14543D] rounded-2xl p-6 bg-[#FFFFFF] shadow-md space-y-4 text-center">
                {previewContribution.imageUrl && (
                  <div className="w-full max-h-64 rounded-xl overflow-hidden bg-[#F3F5E9] border border-[#E5E8DD] mx-auto">
                    <img
                      src={previewContribution.imageUrl}
                      alt="صورة السؤال"
                      className="w-full h-full max-h-64 object-contain"
                    />
                  </div>
                )}

                <div className="font-bold text-lg text-[#252824] leading-relaxed py-2">
                  {previewContribution.questionText}
                </div>

                <div className="border-t border-[#E5E8DD] pt-4 text-right space-y-2">
                  <div className="text-xs font-bold text-[#14543D]">الإجابة الصحيحة:</div>
                  <div className="bg-[#EAF2EE] border border-[#14543D]/20 rounded-xl p-3 text-sm font-bold text-[#14543D]">
                    {previewContribution.correctAnswer}
                  </div>
                </div>

                {previewContribution.explanation && (
                  <div className="text-right text-xs text-[#777B73] bg-[#F3F5E9] p-3 rounded-xl">
                    <span className="font-bold text-[#252824]">الشرح: </span>
                    {previewContribution.explanation}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewContribution(null)}
                  className="px-6 py-2 rounded-xl bg-[#14543D] text-white font-bold text-xs cursor-pointer hover:bg-[#0E3D2C]"
                >
                  إغلاق المعاينة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
