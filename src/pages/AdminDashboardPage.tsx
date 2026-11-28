import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
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
  Volume2,
  QrCode,
  Home,
  Menu,
  X,
  ChevronLeft,
  Database,
} from 'lucide-react';
import { AdminPlayerAnalytics } from '../components/AdminPlayerAnalytics';
import { AdminSeenQuestionsSection } from '../components/AdminSeenQuestionsSection';
import { AdminVisualEffectsSection } from '../components/AdminVisualEffectsSection';
import { AdminWalaKalimaSection } from '../components/AdminWalaKalimaSection';
import { QuestionAudioPlayer } from '../components/QuestionAudioPlayer';
import {
  isWalaKalimaCategory,
  WALA_KALIMA_MAIN_CATEGORY_ID,
  WalaKalimaSettings,
} from '../types/walaKalima';
import { MAIN_CATEGORIES } from '../data/categoriesAndSeed';
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
  QuestionDedupSettings,
  QuestionMediaType,
  QuestionType,
  SubcategoryItem,
  TARGET_QUESTIONS_PER_CATEGORY,
  TARGET_TOTAL_QUESTIONS,
  TriviaQuestion,
  UserContribution,
  VisualEffectsSettings,
} from '../types/game';
import { DEFAULT_VISUAL_EFFECTS_SETTINGS } from '../services/visualEffectsService';
import { DEFAULT_QUESTION_DEDUP_SETTINGS } from '../utils/questionDedupLogic';
import {
  fetchAllContributionsForAdmin,
  approveAndPublishContribution,
  rejectContribution,
} from '../services/contributionService';
import { CategoryIcon } from '../components/CategoryIcon';
import { CategoryCardArtwork } from '../components/CategoryCardArtwork';
import { ImageCropModal } from '../components/ImageCropModal';
import { AlertBanner } from '../components/ui';
import { uploadCategoryImageToCloudinarySigned } from '../services/cloudinaryService';
import {
  bulkDeleteFromFirestore,
  bulkUpdateStatusInFirestore,
  computeQuestionCountsBySubcategory,
  convertExistingQuestionsToDirectInFirestore,
  createQuestionInFirestore,
  CreateQuestionPayload,
  deleteMainCategoryFromFirestore,
  deleteQuestionFromFirestore,
  deleteSubcategorySafeFromFirestore,
  inferQuestionMediaType,
  matchesSubcategoryQuestion,
  normalizeAudioMaxPlays,
  saveContactSettingsToFirestore,
  saveMainCategoryImageToFirestore,
  saveMainCategoryToFirestore,
  saveSubcategoryImageToFirestore,
  saveSubcategoryToFirestore,
  updateQuestionInFirestore,
  updateQuestionStatusInFirestore,
  uploadQuestionAudioToStorage,
  uploadQuestionImageToCloudinary,
  uploadQuestionImageToStorage,
  validateQuestionAudioFile,
  validateQuestionImageFile,
} from '../services/questionService';
import { isValidHttpUrl } from '../utils/questionMedia';

interface AdminDashboardPageProps {
  user: User | null;
  isAdmin: boolean;
  authLoading: boolean;
  mainCategories: MainCategoryMeta[];
  questions: TriviaQuestion[];
  subcategories: SubcategoryItem[];
  contactSettings: ContactSettings;
  questionDedupSettings?: QuestionDedupSettings;
  loadingQuestions: boolean;
  onLoginGoogle?: () => Promise<void> | void;
  onOpenAuthModal?: () => void;
  onLogout: () => Promise<void>;
  onRefreshQuestions: () => Promise<void>;
  onRefreshSubcategories: () => Promise<void>;
  onRefreshMainCategories: () => Promise<void>;
  onRefreshContactSettings: () => Promise<void>;
  onRefreshQuestionDedupSettings?: () => Promise<void>;
  visualEffectsSettings?: VisualEffectsSettings;
  onRefreshVisualEffectsSettings?: () => Promise<void>;
  onWalaKalimaSettingsUpdated?: (next: WalaKalimaSettings) => void;
  onSeedFoundationalPack: () => Promise<void>;
  seeding: boolean;
}

type AdminTab =
  | 'overview'
  | 'main_categories'
  | 'subcategories'
  | 'images'
  | 'questions'
  | 'wala_kalima'
  | 'contact'
  | 'question_dedup'
  | 'visual_effects'
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

interface SubcategoryAdminRowProps {
  sub: SubcategoryItem;
  qCount: number;
  actionLoading: boolean;
  onToggleComingSoon: (sub: SubcategoryItem) => void;
  onSelectImage: (sub: SubcategoryItem) => void;
  onMoveOrder: (sub: SubcategoryItem, direction: 'up' | 'down') => void;
  onToggleActive: (sub: SubcategoryItem) => void;
  onEdit: (sub: SubcategoryItem) => void;
  onDelete: (sub: SubcategoryItem) => void;
}

const SubcategoryAdminRow = React.memo<SubcategoryAdminRowProps>(
  ({
    sub,
    qCount,
    actionLoading,
    onToggleComingSoon,
    onSelectImage,
    onMoveOrder,
    onToggleActive,
    onEdit,
    onDelete,
  }) => (
    <div
      className={`py-3.5 px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_76px] ${
        !sub.isActive ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {sub.imageUrl ? (
          <img
            src={sub.imageUrl}
            alt={sub.name}
            loading="lazy"
            decoding="async"
            className="w-11 h-11 rounded-xl object-cover border border-[#E5E8DD] bg-[#F3F5E9] shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-center text-[#52574E] shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
        )}
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono tabular-nums text-[11px] font-bold text-[#52574E]">
              #{sub.sortOrder}
            </span>
            <span className="font-display text-sm font-bold text-[#1B1F1C] truncate">
              {sub.name}
            </span>
            {sub.isComingSoon && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D9602B] bg-[#FEF2EC] border border-[#F07842]/30 px-2 py-0.5 rounded-md">
                <Clock className="w-3 h-3" />
                <span>قريباً</span>
              </span>
            )}
            {!sub.isActive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                <EyeOff className="w-3 h-3" />
                <span>مخفية</span>
              </span>
            )}
          </div>
          <div className="text-xs text-[#52574E] flex flex-wrap items-center gap-1.5 truncate">
            <span className="truncate">{sub.description || 'بدون وصف'}</span>
            <span aria-hidden="true" className="text-[#E5E8DD]">·</span>
            <span className="font-mono tabular-nums font-bold text-[#14543D] shrink-0">
              {qCount} سؤال
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:justify-end">
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onToggleComingSoon(sub)}
          title={
            sub.isComingSoon
              ? 'تفعيل الفئة وإزالة شارة قريباً'
              : 'تعطيل مؤقت بشارة قريباً'
          }
          className={`min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] px-2.5 sm:px-2 rounded-lg border cursor-pointer transition-colors flex items-center justify-center gap-1 ${
            sub.isComingSoon
              ? 'bg-[#FEF2EC] border-[#F07842]/35 text-[#F07842] hover:bg-[#FDE4D7]'
              : 'bg-[#FFFFFF] border-[#E5E8DD] text-[#52574E] hover:text-[#F07842] hover:border-[#F07842]/40'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onSelectImage(sub)}
          title={
            sub.imageUrl
              ? 'تغيير صورة الفئة الفرعية من الجهاز'
              : 'اختيار صورة للفئة الفرعية من الجهاز'
          }
          className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 py-1 text-xs sm:text-[11px] font-bold text-[#F07842] bg-[#FEF2EC] hover:bg-[#FDE4D7] border border-[#F07842]/25 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5 shrink-0" />
          <span>{sub.imageUrl ? 'تغيير الصورة' : 'إضافة صورة'}</span>
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onMoveOrder(sub, 'up')}
          title="تقديم الترتيب"
          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center text-[#52574E] hover:text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg cursor-pointer transition-colors"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onMoveOrder(sub, 'down')}
          title="تأخير الترتيب"
          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center text-[#52574E] hover:text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg cursor-pointer transition-colors"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onToggleActive(sub)}
          title={
            sub.isActive ? 'إخفاء الفئة الفرعية' : 'إظهار الفئة الفرعية'
          }
          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center text-[#14543D] bg-[#EAF2EE]/70 hover:bg-[#EAF2EE] rounded-lg cursor-pointer transition-colors"
        >
          {sub.isActive ? (
            <Eye className="w-3.5 h-3.5" />
          ) : (
            <EyeOff className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onEdit(sub)}
          title="تعديل أو إعادة تسمية أو نقل الفئة"
          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-lg cursor-pointer transition-colors"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => onDelete(sub)}
          title="حذف الفئة الفرعية"
          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-[34px] flex items-center justify-center text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
);

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({
  user,
  isAdmin,
  authLoading,
  mainCategories,
  questions,
  subcategories,
  contactSettings,
  questionDedupSettings = DEFAULT_QUESTION_DEDUP_SETTINGS,
  loadingQuestions,
  onLoginGoogle,
  onOpenAuthModal,
  onLogout,
  onRefreshQuestions,
  onRefreshSubcategories,
  onRefreshMainCategories,
  onRefreshContactSettings,
  onRefreshQuestionDedupSettings,
  visualEffectsSettings = DEFAULT_VISUAL_EFFECTS_SETTINGS,
  onRefreshVisualEffectsSettings,
  onWalaKalimaSettingsUpdated,
  onSeedFoundationalPack,
  seeding,
}) => {
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  // Bulk Selection, Preview & Confirmation State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<TriviaQuestion | null>(null);
  const [bulkStatusConfirmModal, setBulkStatusConfirmModal] = useState<{
    status: ApprovalStatus;
    ids: string[];
  } | null>(null);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    mode: 'single' | 'bulk';
    ids: string[];
    previewText?: string;
    scopeLabel: string;
  } | null>(null);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);

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
  const [subSearchQuery, setSubSearchQuery] = useState<string>('');
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
  const [subModalFeedback, setSubModalFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Safe Delete Subcategory Confirmation Modal State
  const [deletingSubcategory, setDeletingSubcategory] =
    useState<SubcategoryItem | null>(null);
  const [deleteSubMode, setDeleteSubMode] = useState<
    'reassign_questions' | 'keep_questions' | 'delete_questions'
  >('reassign_questions');
  const [deleteSubTargetId, setDeleteSubTargetId] = useState<string>('');
  const [deleteSubConfirmQuestions, setDeleteSubConfirmQuestions] =
    useState(false);

  // Add / Edit Question Modal State (Direct Questions: Text, Image, or Audio)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null
  );
  const [formCategory, setFormCategory] = useState<string>('معلومات عامة');
  const [formMediaType, setFormMediaType] = useState<QuestionMediaType>('text');
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
  const [formImageDescription, setFormImageDescription] = useState<string>('');
  const [pendingQuestionImageFile, setPendingQuestionImageFile] =
    useState<File | null>(null);
  const [pendingQuestionImagePreviewUrl, setPendingQuestionImagePreviewUrl] =
    useState<string | null>(null);
  const [formAudioUrl, setFormAudioUrl] = useState<string>('');
  const [formAudioStoragePath, setFormAudioStoragePath] = useState<string>('');
  const [formAudioMaxPlays, setFormAudioMaxPlays] = useState<number | null>(
    null
  );
  const [pendingQuestionAudioFile, setPendingQuestionAudioFile] =
    useState<File | null>(null);
  const [pendingQuestionAudioPreviewUrl, setPendingQuestionAudioPreviewUrl] =
    useState<string | null>(null);
  const [questionModalError, setQuestionModalError] = useState<string | null>(
    null
  );
  const isSavingQuestionRef = useRef(false);

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
  const questionAudioInputRef = useRef<HTMLInputElement | null>(null);
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

  const subcategoriesByMainIdMap = useMemo(() => {
    const map = new Map<string, SubcategoryItem[]>();
    for (const mainCat of sortedMainCategories) {
      map.set(mainCat.id, []);
    }
    const nameToMainId = new Map<string, string>();
    for (const mainCat of sortedMainCategories) {
      nameToMainId.set(mainCat.name, mainCat.id);
    }

    for (const sub of subcategories) {
      const targetMainId = map.has(sub.mainCategoryId)
        ? sub.mainCategoryId
        : nameToMainId.get(sub.mainCategory);
      if (targetMainId) {
        map.get(targetMainId)!.push(sub);
      }
    }

    map.forEach((list) => {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    });
    return map;
  }, [sortedMainCategories, subcategories]);

  const getSubcategoriesForMain = useCallback(
    (mainCat: MainCategoryMeta) =>
      subcategoriesByMainIdMap.get(mainCat.id) || [],
    [subcategoriesByMainIdMap]
  );

  const questionCountBySubIdMap = useMemo(
    () => computeQuestionCountsBySubcategory(questions, subcategories),
    [questions, subcategories]
  );

  const questionCountByMainIdMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const mainCat of sortedMainCategories) {
      const subs = subcategoriesByMainIdMap.get(mainCat.id) || [];
      const subIds = new Set(subs.map((s) => s.id));
      const subNames = new Set(subs.map((s) => s.name));
      let count = 0;
      for (const q of questions) {
        if (
          (q.subcategoryId && subIds.has(q.subcategoryId)) ||
          subNames.has(q.category)
        ) {
          count++;
        }
      }
      map.set(mainCat.id, count);
    }
    return map;
  }, [sortedMainCategories, subcategoriesByMainIdMap, questions]);

  const getQuestionsForSubcategory = useCallback(
    (sub: SubcategoryItem) =>
      questions.filter((q) =>
        matchesSubcategoryQuestion(q.category, sub.name, q.subcategoryId, sub.id)
      ),
    [questions]
  );

  const getQuestionsForMainCategory = useCallback(
    (mainCat: MainCategoryMeta) => {
      const subs = getSubcategoriesForMain(mainCat);
      const subIds = new Set(subs.map((s) => s.id));
      const subNames = new Set(subs.map((s) => s.name));
      return questions.filter(
        (q) =>
          (q.subcategoryId && subIds.has(q.subcategoryId)) ||
          subNames.has(q.category)
      );
    },
    [getSubcategoriesForMain, questions]
  );

  const filteredSubcategoryMainGroups = useMemo(() => {
    return sortedMainCategories.filter(
      (mc) =>
        subMainFilter === 'الكل' ||
        mc.id === subMainFilter ||
        mc.name === subMainFilter
    );
  }, [sortedMainCategories, subMainFilter]);

  const { singlePageSubcategoryGroups, filteredSubcategoriesCount } = useMemo(() => {
    const term = subSearchQuery.trim().toLowerCase();
    const groups: {
      mainCat: MainCategoryMeta;
      subs: SubcategoryItem[];
      totalInMain: number;
    }[] = [];
    let count = 0;

    for (const mainCat of filteredSubcategoryMainGroups) {
      const allInMain = subcategoriesByMainIdMap.get(mainCat.id) || [];
      const matchedSubs = term
        ? allInMain.filter(
            (sub) =>
              sub.name.toLowerCase().includes(term) ||
              (sub.description || '').toLowerCase().includes(term) ||
              mainCat.name.toLowerCase().includes(term)
          )
        : allInMain;

      if (term && matchedSubs.length === 0) {
        continue;
      }

      count += matchedSubs.length;
      groups.push({
        mainCat,
        subs: matchedSubs,
        totalInMain: allInMain.length,
      });
    }

    return {
      singlePageSubcategoryGroups: groups,
      filteredSubcategoriesCount: count,
    };
  }, [filteredSubcategoryMainGroups, subcategoriesByMainIdMap, subSearchQuery]);

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
      if (typeFilter === 'image' && inferQuestionMediaType(q) !== 'image') {
        return false;
      }
      if (typeFilter === 'audio' && inferQuestionMediaType(q) !== 'audio') {
        return false;
      }
      if (typeFilter === 'text' && inferQuestionMediaType(q) !== 'text') {
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
        const inMainCat = (subcategoryToMainMap.get(q.category) || '')
          .toLowerCase()
          .includes(term);
        const inImgDesc = (q.imageDescription || '')
          .toLowerCase()
          .includes(term);
        if (!inText && !inAns && !inCat && !inMainCat && !inImgDesc) return false;
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

  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Prune stale selectedIds when questions list changes and clamp active page
  useEffect(() => {
    const validIdSet = new Set(questions.map((q) => q.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => validIdSet.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [questions]);

  useEffect(() => {
    if (questionsPage > totalQuestionPages) {
      setQuestionsPage(totalQuestionPages);
    }
  }, [questionsPage, totalQuestionPages]);

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
    const illustrated = questions.filter(
      (q) => inferQuestionMediaType(q) === 'image'
    ).length;
    const audioOnly = questions.filter(
      (q) => inferQuestionMediaType(q) === 'audio'
    ).length;
    const textOnly = Math.max(0, questions.length - illustrated - audioOnly);
    return {
      total: questions.length,
      approved,
      pending,
      rejected,
      mcq,
      direct,
      illustrated,
      audioOnly,
      textOnly,
      duplicates: duplicateIdsSet.size,
    };
  }, [questions, duplicateIdsSet]);

  const overviewStats = useMemo(() => {
    const activeMain = mainCategories.filter((m) => m.isActive && !m.isComingSoon).length;
    const comingSoonMain = mainCategories.filter((m) => m.isComingSoon).length;
    const hiddenMain = mainCategories.filter((m) => !m.isActive).length;
    const activeSub = subcategories.filter((s) => s.isActive && !s.isComingSoon).length;
    const comingSoonSub = subcategories.filter((s) => s.isComingSoon).length;
    const emptySub = subcategories.filter(
      (s) => (questionCountBySubIdMap.get(s.id) ?? 0) === 0
    ).length;
    const missingImgSub = subcategories.filter(
      (s) => !s.imageUrl || s.imageUrl.trim().length === 0
    ).length;
    return {
      activeMain,
      comingSoonMain,
      hiddenMain,
      activeSub,
      comingSoonSub,
      emptySub,
      missingImgSub,
    };
  }, [mainCategories, subcategories, questionCountBySubIdMap]);

  // Trigger device file picker for a specific Main Category, Subcategory, or Form Draft
  const triggerSelectCategoryImage = useCallback(
    (target: {
      kind: 'main' | 'sub' | 'main_draft' | 'sub_draft';
      mainCat?: MainCategoryMeta;
      subCat?: SubcategoryItem;
    }) => {
      pendingImageTargetRef.current = target;
      imageUploadInputRef.current?.click();
    },
    []
  );

  const triggerSubcategoryImagePicker = useCallback(
    (sub: SubcategoryItem) => {
      triggerSelectCategoryImage({ kind: 'sub', subCat: sub });
    },
    [triggerSelectCategoryImage]
  );

  const handleImageFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = pendingImageTargetRef.current;
    pendingImageTargetRef.current = null;
    e.target.value = '';
    if (!file || !target) return;

    const validationError = validateQuestionImageFile(file);
    if (validationError) {
      setStatusBanner(validationError);
      if (target.kind === 'sub_draft' || subModalOpen) {
        setSubModalFeedback({ type: 'error', text: validationError });
      }
      return;
    }

    if (target.kind === 'sub_draft') {
      setSubModalFeedback(null);
    }

    setCropTarget({
      ...target,
      file,
    });
  };

  const handleConfirmSaveCroppedImage = async (
    croppedBlob: Blob,
    _croppedDataUrl: string
  ) => {
    if (!user || !cropTarget) {
      throw new Error('يجب تسجيل الدخول بحساب المشرف قبل رفع الصورة.');
    }
    setActionLoading(true);
    setStatusBanner(null);

    try {
      const targetCategoryType: 'main' | 'sub' =
        cropTarget.kind === 'main' || cropTarget.kind === 'main_draft'
          ? 'main'
          : 'sub';
      const targetCategoryId =
        cropTarget.kind === 'main'
          ? cropTarget.mainCat?.id || `main-${Date.now()}`
          : cropTarget.kind === 'main_draft'
          ? editingMainCategory?.id || `main-draft-${Date.now()}`
          : cropTarget.kind === 'sub_draft'
          ? editingSubcategory?.id || `sub-draft-${Date.now()}`
          : cropTarget.subCat?.id || `sub-${Date.now()}`;

      const uploaded = await uploadCategoryImageToCloudinarySigned(croppedBlob, {
        categoryType: targetCategoryType,
        categoryId: targetCategoryId,
      });
      const finalUrl = uploaded.imageUrl?.trim() || '';
      if (!isValidHttpUrl(finalUrl)) {
        throw new Error('لم يُرجع Cloudinary رابط صورة صالحاً.');
      }

      if (cropTarget.kind === 'main_draft') {
        setMainFormImageUrl(finalUrl);
        setCropTarget(null);
      } else if (cropTarget.kind === 'sub_draft') {
        setSubFormImageUrl(finalUrl);
        setSubModalFeedback({
          type: 'success',
          text: 'تم رفع الصورة إلى Cloudinary ومعاينتها بنجاح — اضغط «حفظ الفئة الفرعية» لتثبيتها.',
        });
        setCropTarget(null);
      } else if (cropTarget.kind === 'main' && cropTarget.mainCat) {
        await saveMainCategoryImageToFirestore(
          cropTarget.mainCat,
          finalUrl,
          user.uid
        );
        await onRefreshMainCategories();
        setStatusBanner(
          `تم رفع الصورة إلى Cloudinary وحفظها للفئة الرئيسية «${cropTarget.mainCat.name}» بنجاح.`
        );
        setCropTarget(null);
      } else if (cropTarget.kind === 'sub' && cropTarget.subCat) {
        await saveSubcategoryImageToFirestore(
          cropTarget.subCat,
          finalUrl,
          user.uid
        );
        await onRefreshSubcategories();
        setStatusBanner(
          `تم رفع الصورة إلى Cloudinary وحفظها للفئة الفرعية «${cropTarget.subCat.name}» بنجاح.`
        );
        setCropTarget(null);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'خطأ غير معروف أثناء رفع الصورة.';
      setStatusBanner(`تعذر حفظ الصورة: ${errorMsg}`);
      if (cropTarget.kind === 'sub_draft') {
        setSubModalFeedback({
          type: 'error',
          text: `تعذر رفع الصورة: ${errorMsg}`,
        });
      }
      throw err instanceof Error ? err : new Error(errorMsg);
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

  const handleToggleMainCategoryComingSoon = async (
    mainCat: MainCategoryMeta
  ): Promise<{ ok: boolean; message: string }> => {
    if (!user || !isAdmin) {
      const msg = 'تعذر تحديث حالة «قريباً»: هذا الإجراء متاح للمشرفين المصرح لهم فقط.';
      setStatusBanner(msg);
      return { ok: false, message: msg };
    }
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
      const successMsg = nextComingSoon
        ? `تم تحويل الفئة «${mainCat.name}» إلى وضع «قريباً» مع الاحتفاظ بكافة بياناتها وأسئلتها.`
        : `تم تفعيل الفئة «${mainCat.name}» وإتاحتها للعب في الموقع بنجاح!`;
      setStatusBanner(successMsg);
      return { ok: true, message: successMsg };
    } catch (err) {
      const errorMsg = `تعذر تحديث حالة «قريباً» للفئة: ${
        err instanceof Error ? err.message : 'خطأ غير معروف'
      }`;
      setStatusBanner(errorMsg);
      return { ok: false, message: errorMsg };
    } finally {
      setActionLoading(false);
    }
  };

  const walaKalimaMainCategory = useMemo(
    () =>
      mainCategories.find((m) =>
        isWalaKalimaCategory({ mainCategoryId: m.id, mainCategoryName: m.name })
      ) ||
      MAIN_CATEGORIES.find((m) => m.id === WALA_KALIMA_MAIN_CATEGORY_ID),
    [mainCategories]
  );

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
    setSubModalFeedback(null);
    setSubModalOpen(true);
  };

  const openEditSubcategoryModal = useCallback(
    (sub: SubcategoryItem) => {
      const parentMain =
        sortedMainCategories.find(
          (m) => m.id === sub.mainCategoryId || m.name === sub.mainCategory
        ) || sortedMainCategories[0];

      setEditingSubcategory(sub);
      setSubFormName(sub.name);
      setSubFormMainCategoryId(
        parentMain?.id || sub.mainCategoryId || 'main-general'
      );
      setSubFormDescription(sub.description);
      setSubFormSortOrder(sub.sortOrder);
      setSubFormIsActive(sub.isActive);
      setSubFormIsComingSoon(Boolean(sub.isComingSoon));
      setSubFormImageUrl(sub.imageUrl || '');
      setSubModalFeedback(null);
      setSubModalOpen(true);
    },
    [sortedMainCategories]
  );

  const handleSaveSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubModalFeedback(null);
    setStatusBanner(null);

    const cleanName = subFormName.trim();
    if (cleanName.length < 2) {
      const msg = 'يرجى إدخال اسم الفئة الفرعية (حرفين على الأقل).';
      setSubModalFeedback({ type: 'error', text: msg });
      setStatusBanner(msg);
      return;
    }

    const cleanImageUrl = subFormImageUrl.trim();
    if (cleanImageUrl && !isValidHttpUrl(cleanImageUrl)) {
      const msg =
        'رابط صورة الفئة الفرعية غير صالح. يرجى اختيار الصورة ورفعها عبر Cloudinary قبل الحفظ.';
      setSubModalFeedback({ type: 'error', text: msg });
      setStatusBanner(msg);
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
          imageUrl: cleanImageUrl,
        },
        user.uid,
        editingSubcategory?.name
      );

      const wasRenamed = Boolean(
        editingSubcategory &&
          editingSubcategory.name.trim() &&
          editingSubcategory.name.trim() !== cleanName
      );
      setSubModalOpen(false);
      setSubModalFeedback(null);
      await onRefreshSubcategories();
      if (wasRenamed) {
        await onRefreshQuestions();
      }
      setStatusBanner(
        editingSubcategory
          ? `تم تحديث الفئة الفرعية «${cleanName}»${cleanImageUrl ? ' وحفظ صورتها' : ''} بنجاح.`
          : `تمت إضافة الفئة الفرعية «${cleanName}» ضمن قسم «${parentMain?.name || ''}» بنجاح.`
      );
    } catch (err) {
      const errorMsg = `تعذر حفظ الفئة الفرعية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`;
      setSubModalFeedback({ type: 'error', text: errorMsg });
      setStatusBanner(errorMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSubcategoryActive = useCallback(
    async (sub: SubcategoryItem) => {
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
      } catch (err) {
        setStatusBanner(
          `تعذر تحديث حالة الفئة الفرعية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
        );
      } finally {
        setActionLoading(false);
      }
    },
    [user, onRefreshSubcategories]
  );

  const handleToggleSubcategoryComingSoon = useCallback(
    async (sub: SubcategoryItem) => {
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
      } catch (err) {
        setStatusBanner(
          `تعذر تحديث وضع «قريباً» للفئة الفرعية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
        );
      } finally {
        setActionLoading(false);
      }
    },
    [user, onRefreshSubcategories]
  );

  const handleMoveSubcategoryOrder = useCallback(
    async (sub: SubcategoryItem, direction: 'up' | 'down') => {
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
      } catch (err) {
        setStatusBanner(
          `تعذر تعديل ترتيب الفئة الفرعية: ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
        );
      } finally {
        setActionLoading(false);
      }
    },
    [user, onRefreshSubcategories]
  );

  const openDeleteSubcategoryDialog = useCallback(
    (sub: SubcategoryItem) => {
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
    },
    [subcategories, getQuestionsForSubcategory]
  );

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
      const shouldRefreshQuestions =
        relatedQs.length > 0 && deleteSubMode !== 'keep_questions';
      setDeletingSubcategory(null);
      await onRefreshSubcategories();
      if (shouldRefreshQuestions) {
        await onRefreshQuestions();
      }
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

  // --- QUESTIONS HANDLERS (Direct Questions: Text, Image, & Audio) ---
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

  const clearPendingQuestionAudio = () => {
    if (pendingQuestionAudioPreviewUrl) {
      URL.revokeObjectURL(pendingQuestionAudioPreviewUrl);
    }
    setPendingQuestionAudioFile(null);
    setPendingQuestionAudioPreviewUrl(null);
    if (questionAudioInputRef.current) {
      questionAudioInputRef.current.value = '';
    }
  };

  const handleCloseQuestionModal = () => {
    if (isSavingQuestionRef.current || actionLoading) return;
    clearPendingQuestionImage();
    clearPendingQuestionAudio();
    setQuestionModalError(null);
    setModalOpen(false);
  };

  const openAddModal = () => {
    clearPendingQuestionImage();
    clearPendingQuestionAudio();
    setQuestionModalError(null);
    setEditingQuestionId(null);
    setFormCategory(subcategories[0]?.name || 'معلومات عامة');
    setFormMediaType('text');
    setFormQuestionText('');
    setFormDifficulty('سهل');
    setFormPoints(100);
    setFormCorrectAnswer('');
    setFormExplanation('');
    setFormSource('');
    setFormStatus('approved');
    setFormImageUrl('');
    setFormImageStoragePath('');
    setFormImageDescription('');
    setFormAudioUrl('');
    setFormAudioStoragePath('');
    setFormAudioMaxPlays(null);
    setModalOpen(true);
  };

  const openEditModal = (q: TriviaQuestion) => {
    clearPendingQuestionImage();
    clearPendingQuestionAudio();
    setQuestionModalError(null);
    setEditingQuestionId(q.id);
    setFormCategory(q.category);
    setFormMediaType(inferQuestionMediaType(q));
    setFormQuestionText(q.questionText);
    setFormDifficulty(q.difficulty);
    setFormPoints(q.points);
    setFormCorrectAnswer(q.correctAnswer);
    setFormExplanation(q.explanation);
    setFormSource(q.source);
    setFormStatus(q.status);
    setFormImageUrl(q.imageUrl || '');
    setFormImageStoragePath(q.imageStoragePath || '');
    setFormImageDescription(q.imageDescription || '');
    setFormAudioUrl(q.audioUrl || '');
    setFormAudioStoragePath(q.audioStoragePath || '');
    setFormAudioMaxPlays(normalizeAudioMaxPlays(q.audioMaxPlays));
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
    setFormMediaType('image');
  };

  const handleRemoveQuestionImage = () => {
    clearPendingQuestionImage();
    setFormImageUrl('');
    setFormImageStoragePath('');
    setFormImageDescription('');
    setQuestionModalError(null);
  };

  const handleQuestionAudioFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateQuestionAudioFile(file);
    if (validationError) {
      setQuestionModalError(validationError);
      return;
    }

    setQuestionModalError(null);
    if (pendingQuestionAudioPreviewUrl) {
      URL.revokeObjectURL(pendingQuestionAudioPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingQuestionAudioFile(file);
    setPendingQuestionAudioPreviewUrl(previewUrl);
    setFormMediaType('audio');
  };

  const handleRemoveQuestionAudio = () => {
    clearPendingQuestionAudio();
    setFormAudioUrl('');
    setFormAudioStoragePath('');
    setQuestionModalError(null);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSavingQuestionRef.current || actionLoading) return;
    setQuestionModalError(null);
    setStatusBanner(null);

    if (formQuestionText.trim().length < 3 || !formCorrectAnswer.trim()) {
      setQuestionModalError(
        'يرجى كتابة نص السؤال المباشر والإجابة الصحيحة المعتمدة.'
      );
      return;
    }

    if (
      formMediaType === 'image' &&
      !pendingQuestionImageFile &&
      !formImageUrl.trim()
    ) {
      setQuestionModalError(
        'يرجى رفع صورة للسؤال المصوّر أو إدخال رابط صورة موثوق، أو اختيار «سؤال نصي عادي».'
      );
      return;
    }

    if (
      formMediaType === 'image' &&
      !pendingQuestionImageFile &&
      formImageUrl.trim() &&
      !isValidHttpUrl(formImageUrl)
    ) {
      setQuestionModalError('يجب أن يبدأ رابط الصورة بـ https:// أو http://');
      return;
    }

    if (
      formMediaType === 'audio' &&
      !pendingQuestionAudioFile &&
      !formAudioUrl.trim()
    ) {
      setQuestionModalError(
        'يرجى رفع مقطع صوتي للسؤال الصوتي أو إدخال رابط صوتي موثوق، أو اختيار «سؤال نصي عادي».'
      );
      return;
    }

    if (
      formMediaType === 'audio' &&
      !pendingQuestionAudioFile &&
      formAudioUrl.trim() &&
      !isValidHttpUrl(formAudioUrl)
    ) {
      setQuestionModalError('يجب أن يبدأ الرابط الصوتي بـ https:// أو http://');
      return;
    }

    const matchedSub = subcategories.find(
      (s) => s.name === formCategory.trim()
    );

    isSavingQuestionRef.current = true;
    setActionLoading(true);
    let finalImageUrl = formMediaType === 'image' ? formImageUrl.trim() : '';
    let finalImageStoragePath =
      formMediaType === 'image' ? formImageStoragePath.trim() : '';
    let finalAudioUrl = formMediaType === 'audio' ? formAudioUrl.trim() : '';
    let finalAudioStoragePath =
      formMediaType === 'audio' ? formAudioStoragePath.trim() : '';

    try {
      // 1. Read, upload to Cloudinary (signed), await completion, and extract secure HTTPS URL first
      if (formMediaType === 'image' && pendingQuestionImageFile) {
        const uploaded = await uploadQuestionImageToCloudinary(
          pendingQuestionImageFile,
          matchedSub?.id || formCategory.trim(),
          editingQuestionId || undefined
        );
        if (!isValidHttpUrl(uploaded.imageUrl)) {
          throw new Error(
            'فشل استخراج رابط صورة صالح من Cloudinary.'
          );
        }
        finalImageUrl = uploaded.imageUrl;
        finalImageStoragePath = uploaded.imageStoragePath;
        setFormImageUrl(uploaded.imageUrl);
        setFormImageStoragePath(uploaded.imageStoragePath);
      } else if (formMediaType === 'audio' && pendingQuestionAudioFile) {
        const uploaded = await uploadQuestionAudioToStorage(
          pendingQuestionAudioFile,
          matchedSub?.id || formCategory.trim(),
          editingQuestionId || undefined
        );
        if (!isValidHttpUrl(uploaded.audioUrl)) {
          throw new Error(
            'فشل استخراج رابط تنزيل صالح للمقطع الصوتي من Firebase Storage.'
          );
        }
        finalAudioUrl = uploaded.audioUrl;
        finalAudioStoragePath = uploaded.audioStoragePath;
        setFormAudioUrl(uploaded.audioUrl);
        setFormAudioStoragePath(uploaded.audioStoragePath);
      }

      // 2. Strictly verify media URL is never empty/invalid before Firestore write
      if (formMediaType === 'image' && !isValidHttpUrl(finalImageUrl)) {
        throw new Error(
          'تعذر التحقق من رابط الصورة الصالح قبل حفظ السؤال في Firestore.'
        );
      }
      if (formMediaType === 'audio' && !isValidHttpUrl(finalAudioUrl)) {
        throw new Error(
          'تعذر التحقق من الرابط الصوتي الصالح قبل حفظ السؤال في Firestore.'
        );
      }

      // 3. Construct payload (never Base64 or empty media URLs)
      const payload: CreateQuestionPayload = {
        subcategoryId: matchedSub?.id,
        category: formCategory.trim(),
        questionText: formQuestionText.trim(),
        questionType: 'direct',
        mediaType: formMediaType,
        difficulty: formDifficulty,
        points: formPoints,
        options: [],
        correctAnswer: formCorrectAnswer.trim(),
        explanation: formExplanation.trim(),
        source: formSource.trim(),
        status: formStatus,
        imageUrl: formMediaType === 'image' ? finalImageUrl : '',
        imageStoragePath:
          formMediaType === 'image' ? finalImageStoragePath : '',
        imageDescription:
          formMediaType === 'image' ? formImageDescription.trim() : '',
        audioUrl: formMediaType === 'audio' ? finalAudioUrl : '',
        audioStoragePath:
          formMediaType === 'audio' ? finalAudioStoragePath : '',
        audioMaxPlays:
          formMediaType === 'audio'
            ? normalizeAudioMaxPlays(formAudioMaxPlays)
            : null,
      };

      const isEditing = Boolean(editingQuestionId);
      if (editingQuestionId) {
        await updateQuestionInFirestore(
          editingQuestionId,
          payload,
          user?.uid || 'system'
        );
      } else {
        await createQuestionInFirestore(payload, user.uid);
      }

      // 4. Refresh fresh Firestore list before closing modal & showing completion message
      clearPendingQuestionImage();
      clearPendingQuestionAudio();
      setModalOpen(false);
      await onRefreshQuestions();

      setStatusBanner(
        isEditing
          ? formMediaType === 'audio'
            ? 'تم تحديث السؤال الصوتي وحفظ المقطع الصوتي بنجاح.'
            : formMediaType === 'image'
            ? 'تم تحديث سؤال الصورة وحفظ رابط الصورة بنجاح في Firestore.'
            : 'تم تحديث السؤال النصي المباشر بنجاح في قاعدة البيانات.'
          : formMediaType === 'audio'
          ? 'تمت إضافة السؤال الصوتي الجديد بنجاح إلى Firestore.'
          : formMediaType === 'image'
          ? 'تمت إضافة سؤال الصورة الجديد وحفظ الصورة وربطها بالسؤال بنجاح.'
          : 'تمت إضافة السؤال النصي المباشر الجديد بنجاح إلى Firestore.'
      );
    } catch (err) {
      console.error('[NIZAL Save Question Error]', err);
      // Preserve all question form fields inside the open modal and never show a success banner on failure
      const errMsg =
        err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الحفظ.';
      setQuestionModalError(errMsg);
    } finally {
      isSavingQuestionRef.current = false;
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
    setStatusBanner(null);
    try {
      await updateQuestionStatusInFirestore(id, status);
      await onRefreshQuestions();
    } catch (err) {
      console.error('[NIZAL Update Question Status Error]', err);
      setStatusBanner(
        `تعذر تحديث حالة السؤال: ${err instanceof Error ? err.message : 'تحقق من صلاحيات المشرف أو الاتصال'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const requestSingleDelete = (question: TriviaQuestion) => {
    setDeleteModalError(null);
    setDeleteConfirmModal({
      mode: 'single',
      ids: [question.id],
      previewText: question.questionText,
      scopeLabel: `حذف سؤال واحد من فئة «${question.category}»`,
    });
  };

  const requestBulkStatus = (status: ApprovalStatus) => {
    if (selectedIds.length === 0) return;
    setBulkStatusConfirmModal({
      status,
      ids: [...selectedIds],
    });
  };

  const executeConfirmedBulkStatus = async () => {
    if (!bulkStatusConfirmModal || bulkStatusConfirmModal.ids.length === 0) return;
    const { status, ids } = bulkStatusConfirmModal;
    const count = ids.length;
    setActionLoading(true);
    setStatusBanner(null);
    try {
      await bulkUpdateStatusInFirestore(ids, status);
      setBulkStatusConfirmModal(null);
      setStatusBanner(
        status === 'approved'
          ? `تم اعتماد ${count} سؤال بنجاح.`
          : `تم تحديث حالة ${count} سؤال إلى مرفوض بنجاح.`
      );
      setSelectedIds([]);
      await onRefreshQuestions();
    } catch (err) {
      console.error('[NIZAL Bulk Status Error]', err);
      setStatusBanner(
        `تعذر تحديث حالة الأسئلة: ${err instanceof Error ? err.message : 'تحقق من صلاحيات المشرف أو الاتصال'}`
      );
    } finally {
      setActionLoading(false);
    }
  };

  const requestBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setDeleteModalError(null);
    const allTotalSelected =
      questions.length > 0 && selectedIds.length === questions.length;
    const allFilteredSelected =
      filteredQuestions.length > 0 &&
      filteredQuestions.every((q) => selectedIdsSet.has(q.id)) &&
      selectedIds.length === filteredQuestions.length;

    const scopeLabel = allTotalSelected
      ? `حذف جميع أسئلة المنصة المعروضة (${selectedIds.length} سؤال)`
      : allFilteredSelected
      ? `حذف جميع الأسئلة المطابقة للتصفية الحالية (${selectedIds.length} سؤال)`
      : `حذف الأسئلة المحددة (${selectedIds.length} سؤال)`;

    setDeleteConfirmModal({
      mode: 'bulk',
      ids: [...selectedIds],
      scopeLabel,
    });
  };

  const handleExecuteConfirmedDelete = async () => {
    if (!deleteConfirmModal || deleteConfirmModal.ids.length === 0) return;
    const targetIds = deleteConfirmModal.ids;
    const mode = deleteConfirmModal.mode;

    setActionLoading(true);
    setDeleteModalError(null);
    setStatusBanner(null);

    try {
      if (mode === 'single') {
        await deleteQuestionFromFirestore(targetIds[0]);
        setSelectedIds((prev) => prev.filter((item) => item !== targetIds[0]));
        setStatusBanner('تم حذف السؤال بنجاح من قاعدة البيانات وبشكل دائم.');
      } else {
        const res = await bulkDeleteFromFirestore(targetIds);
        setSelectedIds([]);
        setStatusBanner(
          `تم حذف ${res.deletedCount} سؤال بنجاح بشكل دائم (عبر ${res.batchCount} دفعة آمنة) دون المساس بالفئات أو الصور أو المباريات.`
        );
      }

      setDeleteConfirmModal(null);
      await onRefreshQuestions();
    } catch (err) {
      console.error('[NIZAL Delete Questions Error]', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'تعذر تنفيذ الحذف. تأكد من صلاحيات المشرف واتصالك بالإنترنت.';
      setDeleteModalError(`فشل الحذف: ${message}`);
      setStatusBanner(`تعذر إتمام حذف الأسئلة: ${message}`);
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

  // Dismiss topmost open admin modal or mobile drawer with Escape
  useEffect(() => {
    const hasOpenOverlay = Boolean(
      !cropTarget &&
        (deleteConfirmModal ||
          bulkStatusConfirmModal ||
          previewQuestion ||
          previewContribution ||
          rejectModalContribution ||
          modalOpen ||
          deletingSubcategory ||
          subModalOpen ||
          deletingMainCategory ||
          previewMainCategory ||
          mainModalOpen ||
          mobileSidebarOpen)
    );
    if (!hasOpenOverlay) return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (deleteConfirmModal) {
        if (!actionLoading) {
          setDeleteConfirmModal(null);
          setDeleteModalError(null);
        }
        return;
      }
      if (bulkStatusConfirmModal) {
        if (!actionLoading) setBulkStatusConfirmModal(null);
        return;
      }
      if (previewQuestion) {
        setPreviewQuestion(null);
        return;
      }
      if (previewContribution) {
        setPreviewContribution(null);
        return;
      }
      if (rejectModalContribution) {
        if (!actionLoading) setRejectModalContribution(null);
        return;
      }
      if (modalOpen) {
        if (!actionLoading) handleCloseQuestionModal();
        return;
      }
      if (deletingSubcategory) {
        if (!actionLoading) setDeletingSubcategory(null);
        return;
      }
      if (subModalOpen) {
        if (!actionLoading) setSubModalOpen(false);
        return;
      }
      if (deletingMainCategory) {
        if (!actionLoading) setDeletingMainCategory(null);
        return;
      }
      if (previewMainCategory) {
        setPreviewMainCategory(null);
        return;
      }
      if (mainModalOpen) {
        if (!actionLoading) setMainModalOpen(false);
        return;
      }
      if (mobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [
    cropTarget,
    deleteConfirmModal,
    bulkStatusConfirmModal,
    previewQuestion,
    previewContribution,
    rejectModalContribution,
    modalOpen,
    deletingSubcategory,
    subModalOpen,
    deletingMainCategory,
    previewMainCategory,
    mainModalOpen,
    mobileSidebarOpen,
    actionLoading,
  ]);

  // 1. Not Logged In View
  if (!user) {
    return (
      <div className="min-h-[75dvh] bg-[#F3F5E9] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[540px] bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 sm:p-10 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7 text-[#F07842]" />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-[#F07842]">
              منطقة المشرفين · منصة نِزال
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1B1F1C]">
              لوحة تحكم نِزال
            </h1>
            <p className="text-sm text-[#52574E] leading-relaxed">
              تتطلب إدارة الفئات الرئيسية، الفئات الفرعية، الصور، بنك الأسئلة، وإعدادات المنصة تسجيل الدخول بحساب المشرف المعتمد.
            </p>
          </div>

          <div className="pt-1 flex justify-center">
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
              className="min-h-[46px] px-7 py-3 text-sm font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer"
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
      <div className="min-h-[75dvh] bg-[#F3F5E9] flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[560px] bg-[#FFFFFF] border border-[#F07842]/50 rounded-2xl p-6 sm:p-10 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/25 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-[#F07842]" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-[#1B1F1C]">
              هذا الحساب لا يملك صلاحية الإدارة
            </h1>
            <p className="text-sm text-[#52574E] leading-relaxed">
              أنت مسجل الدخول حالياً بالحساب ({user.email})، ولكن صلاحية تعديل الفئات وبنك الأسئلة محصورة للمشرفين المعتمدين فقط لحماية قاعدة البيانات.
            </p>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[44px] px-6 py-2.5 text-xs font-bold text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl flex items-center gap-2 cursor-pointer"
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

  const navGroups: {
    groupLabel: string;
    items: {
      id: AdminTab;
      label: string;
      icon: React.ReactNode;
      count?: number;
      alertCount?: number;
    }[];
  }[] = [
    {
      groupLabel: 'الرئيسية',
      items: [
        {
          id: 'overview',
          label: 'نظرة عامة',
          icon: <Home className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      groupLabel: 'المحتوى والأقسام',
      items: [
        {
          id: 'main_categories',
          label: 'الفئات الرئيسية',
          icon: <LayoutGrid className="w-4 h-4 shrink-0" />,
          count: sortedMainCategories.length,
        },
        {
          id: 'subcategories',
          label: 'الفئات الفرعية',
          icon: <FolderTree className="w-4 h-4 shrink-0" />,
          count: subcategories.length,
        },
        {
          id: 'images',
          label: 'صور الفئات',
          icon: <ImageIcon className="w-4 h-4 shrink-0" />,
          count: mainImagesCount + subImagesCount,
        },
        {
          id: 'questions',
          label: 'بنك الأسئلة',
          icon: <FileQuestion className="w-4 h-4 shrink-0" />,
          count: questions.length,
        },
        {
          id: 'wala_kalima',
          label: 'كلمات ولا كلمة (QR)',
          icon: <QrCode className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      groupLabel: 'المجتمع والتواصل',
      items: [
        {
          id: 'contributions',
          label: 'مساهمات المستخدمين',
          icon: <Inbox className="w-4 h-4 shrink-0" />,
          count: contributions.length,
          alertCount: pendingContributionsCount,
        },
        {
          id: 'contact',
          label: 'صفحة تواصل معنا',
          icon: <MessageCircle className="w-4 h-4 shrink-0" />,
        },
      ],
    },
    {
      groupLabel: 'التحليلات وإعدادات اللعب',
      items: [
        {
          id: 'player_analytics',
          label: 'إحصائيات اللاعبين',
          icon: <BarChart3 className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'question_dedup',
          label: 'منع تكرار الأسئلة',
          icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
        },
        {
          id: 'visual_effects',
          label: 'المؤثرات البصرية',
          icon: <Sparkles className="w-4 h-4 shrink-0" />,
        },
      ],
    },
  ];

  const tabMetaMap: Record<AdminTab, { title: string; subtitle: string }> = {
    overview: {
      title: 'نظرة عامة على المنصة',
      subtitle: 'ملخص الأرقام الفعلية والوصول السريع لمهام الإدارة اليومية',
    },
    main_categories: {
      title: 'إدارة الفئات الرئيسية',
      subtitle: 'تنظيم الأقسام الرئيسية، الترتيب، الصور، وحالات الظهور أو قريباً',
    },
    subcategories: {
      title: 'إدارة الفئات الفرعية',
      subtitle: 'تنظيم الفئات الفرعية، ربطها بالأقسام، وإدارة صورها ومحتواها',
    },
    images: {
      title: 'إدارة صور الفئات',
      subtitle: 'رفع وقص ومعاينة صور الفئات الرئيسية والفرعية عبر Cloudinary',
    },
    questions: {
      title: 'إدارة بنك الأسئلة',
      subtitle: 'بحث وتصفية ومعاينة الأسئلة النصية والمصوّرة والصوتية وإدارتها',
    },
    wala_kalima: {
      title: 'إدارة فئة «ولا كلمة» (QR)',
      subtitle: 'إدارة بطاقات التمثيل الصامت وإعدادات الجولة وأنواع المحتوى',
    },
    contributions: {
      title: 'مراجعة مساهمات المستخدمين',
      subtitle: 'تدقيق الأسئلة المقترحة من اللاعبين واعتمادها أو رفضها مع السبب',
    },
    contact: {
      title: 'إعدادات صفحة تواصل معنا',
      subtitle: 'تحديث بيانات الدعم الفني والواتساب وحسابات التواصل الاجتماعي',
    },
    player_analytics: {
      title: 'إحصائيات اللاعبين والمباريات',
      subtitle: 'تحليل النشاط في اللعب المحلي والأونلاين وشعبية الفئات',
    },
    question_dedup: {
      title: 'منع تكرار الأسئلة',
      subtitle: 'ضبط قواعد عدم تكرار الأسئلة ومتابعة سجل المشاهدات لكل لاعب',
    },
    visual_effects: {
      title: 'إعدادات المؤثرات البصرية',
      subtitle: 'التحكم بمؤثرات الإجابات والاحتفالات ومعاينتها مباشرة',
    },
  };

  const handleSelectAdminTab = (tab: AdminTab) => {
    setAdminTab(tab);
    setMobileSidebarOpen(false);
    if (tab === 'contributions') {
      void loadContributions();
    }
  };

  const renderSidebarNavigation = () => (
    <div className="flex flex-col h-full">
      {/* Sidebar Brand Header */}
      <div className="px-5 py-4 border-b border-[#E5E8DD] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#F07842] text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-base font-bold text-[#1B1F1C] leading-tight">
              إدارة نِزال
            </div>
            <div className="text-[11px] text-[#52574E] truncate" dir="ltr">
              {user.email}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="إغلاق القائمة الجانبية"
          className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl bg-[#F3F5E9] text-[#1B1F1C] flex items-center justify-center cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav aria-label="أقسام لوحة المشرف" className="flex-1 overflow-y-auto p-3.5 space-y-5">
        {navGroups.map((group) => (
          <div key={group.groupLabel} className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold text-[#52574E]">
              {group.groupLabel}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = adminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectAdminTab(item.id)}
                    className={`w-full min-h-[44px] sm:min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#FEF2EC] text-[#1B1F1C] border border-[#F07842]/35'
                        : 'text-[#52574E] hover:bg-[#F3F5E9]/80 hover:text-[#1B1F1C] border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span className={isActive ? 'text-[#F07842]' : 'text-[#52574E]'}>
                        {item.icon}
                      </span>
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {typeof item.alertCount === 'number' && item.alertCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#F07842] text-white font-mono tabular-nums text-[10px] font-bold">
                          {item.alertCount}
                        </span>
                      )}
                      {typeof item.count === 'number' && (
                        <span
                          className={`font-mono tabular-nums text-[11px] ${
                            isActive ? 'text-[#F07842] font-bold' : 'text-[#52574E]'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3.5 border-t border-[#E5E8DD]">
        <button
          type="button"
          onClick={onLogout}
          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-[#52574E]" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );

  // 3. Authorized Admin Dashboard
  return (
    <div className="min-h-[calc(100dvh-64px)] bg-[#F3F5E9] text-[#1B1F1C]">
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

      {/* Mobile Slide-Over Sidebar Drawer */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="قائمة لوحة المشرف"
        >
          <div
            className="fixed inset-0 bg-[#1B1F1C]/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full bg-[#FFFFFF] border-l border-[#E5E8DD] shadow-2xl">
            {renderSidebarNavigation()}
          </aside>
        </div>
      )}

      {/* Workspace Container */}
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6 py-4 lg:py-6 flex flex-col lg:flex-row items-start gap-5 lg:gap-6">
        {/* Persistent Desktop Sidebar */}
        <aside className="hidden lg:block w-64 xl:w-72 shrink-0 sticky top-20 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden max-h-[calc(100dvh-100px)]">
          {renderSidebarNavigation()}
        </aside>

        {/* Main Workspace Column */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {/* Top Bar */}
          <header className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="فتح قائمة لوحة المشرف"
                className="lg:hidden min-w-[44px] min-h-[44px] rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-[#1B1F1C] flex items-center justify-center cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#52574E]">
                  <button
                    type="button"
                    onClick={() => handleSelectAdminTab('overview')}
                    className="hover:text-[#F07842] cursor-pointer transition-colors"
                  >
                    لوحة المشرف
                  </button>
                  <ChevronLeft className="w-3.5 h-3.5 text-[#52574E]/60" />
                  <span className="text-[#F07842] truncate">
                    {tabMetaMap[adminTab].title}
                  </span>
                </div>
                <h1 className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C] truncate">
                  {tabMetaMap[adminTab].title}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openAddModal}
                className="min-h-[44px] sm:min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>إضافة سؤال</span>
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
                className="min-h-[44px] min-w-[44px] sm:min-h-[42px] sm:min-w-[42px] px-3 text-xs font-bold text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                title="تحديث البيانات من Firebase"
              >
                <RefreshCw
                  className={`w-4 h-4 text-[#52574E] ${loadingQuestions ? 'animate-spin' : ''}`}
                />
                <span className="hidden sm:inline">تحديث</span>
              </button>
            </div>
          </header>

          {/* Global Status Feedback Banner */}
          {statusBanner && (
            <AlertBanner
              tone={
                statusBanner.startsWith('تعذر') ||
                statusBanner.startsWith('صيغة') ||
                statusBanner.startsWith('حجم') ||
                statusBanner.startsWith('يرجى') ||
                statusBanner.startsWith('حدث') ||
                statusBanner.startsWith('الملف') ||
                statusBanner.includes('غير صالحة')
                  ? 'error'
                  : 'success'
              }
              onDismiss={() => setStatusBanner(null)}
            >
              {statusBanner}
            </AlertBanner>
          )}

          {/* TAB 0: ADMIN HOME / OVERVIEW */}
          {adminTab === 'overview' && (
            <div className="space-y-6">
              {/* Welcome Banner */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-7 flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-[#F07842] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>مرحباً بك في لوحة إدارة نِزال</span>
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#1B1F1C]">
                    نظرة شاملة على المحتوى والجاهزية
                  </h2>
                  <p className="text-xs sm:text-sm text-[#52574E] max-w-2xl leading-relaxed">
                    تحكم مركزي في الفئات الرئيسية والفرعية، الصور المرفوعة، وبنك الأسئلة المعتمد من بيانات المنصة الفعلية المحمّلة حالياً.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={openAddMainCategoryModal}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4 text-[#F07842]" />
                    <span>إضافة فئة رئيسية</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAddSubcategoryModal()}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#1B1F1C] hover:bg-[#2F3531] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <FolderTree className="w-4 h-4 text-[#F07842]" />
                    <span>إضافة فئة فرعية</span>
                  </button>
                </div>
              </div>

              {/* Real Stat Cards (Derived from loaded props — zero redundant queries) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#52574E]">الفئات الرئيسية</span>
                    <LayoutGrid className="w-4 h-4 text-[#F07842]" />
                  </div>
                  <div className="font-mono tabular-nums text-3xl font-bold text-[#1B1F1C]">
                    {sortedMainCategories.length}
                  </div>
                  <div className="text-xs text-[#52574E] font-mono tabular-nums">
                    متاحة {overviewStats.activeMain} · قريباً {overviewStats.comingSoonMain} · مخفية {overviewStats.hiddenMain}
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#52574E]">الفئات الفرعية</span>
                    <FolderTree className="w-4 h-4 text-[#F07842]" />
                  </div>
                  <div className="font-mono tabular-nums text-3xl font-bold text-[#1B1F1C]">
                    {subcategories.length}
                  </div>
                  <div className="text-xs text-[#52574E] font-mono tabular-nums">
                    مفعّلة {overviewStats.activeSub} · مرفوعة الصور {subImagesCount}
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#52574E]">إجمالي بنك الأسئلة</span>
                    <FileQuestion className="w-4 h-4 text-[#F07842]" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono tabular-nums text-3xl font-bold text-[#1B1F1C]">
                      {counts.total}
                    </span>
                    <span className="font-mono tabular-nums text-xs text-[#52574E]">
                      / {TARGET_TOTAL_QUESTIONS}
                    </span>
                  </div>
                  <div className="text-xs text-[#52574E] font-mono tabular-nums">
                    نصي {counts.textOnly} · صورة {counts.illustrated} · صوت {counts.audioOnly}
                  </div>
                </div>

                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#52574E]">الأسئلة المعتمدة</span>
                    <CheckCircle2 className="w-4 h-4 text-[#14543D]" />
                  </div>
                  <div className="font-mono tabular-nums text-3xl font-bold text-[#14543D]">
                    {counts.approved}
                  </div>
                  <div className="text-xs text-[#52574E] font-mono tabular-nums">
                    مراجعة {counts.pending} · مرفوض {counts.rejected}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-bold text-[#1B1F1C]">
                      إجراءات سريعة
                    </h3>
                    <p className="text-xs text-[#52574E]">
                      انتقل مباشرة إلى المهام الإدارية الأكثر استخداماً
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={openAddModal}
                    className="min-h-[60px] p-4 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 hover:bg-[#FEF2EC] hover:border-[#F07842]/45 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#F07842] text-white flex items-center justify-center shrink-0">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[#1B1F1C]">
                          إضافة سؤال جديد
                        </div>
                        <div className="text-[11px] text-[#52574E] truncate">
                          نصي أو مصوّر أو صوتي
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[#52574E] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAdminTab('questions')}
                    className="min-h-[60px] p-4 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 hover:bg-[#FEF2EC] hover:border-[#F07842]/45 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#F07842] flex items-center justify-center shrink-0">
                        <FileQuestion className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[#1B1F1C]">
                          مراجعة بنك الأسئلة
                        </div>
                        <div className="text-[11px] text-[#52574E] font-mono tabular-nums truncate">
                          {counts.total} سؤال مسجل
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[#52574E] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAdminTab('images')}
                    className="min-h-[60px] p-4 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 hover:bg-[#FEF2EC] hover:border-[#F07842]/45 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#F07842] flex items-center justify-center shrink-0">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[#1B1F1C]">
                          إدارة صور الفئات
                        </div>
                        <div className="text-[11px] text-[#52574E] font-mono tabular-nums truncate">
                          {mainImagesCount + subImagesCount} صورة مرفوعة
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[#52574E] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAdminTab('contributions')}
                    className="min-h-[60px] p-4 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 hover:bg-[#FEF2EC] hover:border-[#F07842]/45 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#F07842] flex items-center justify-center shrink-0">
                        <Inbox className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[#1B1F1C]">
                          مساهمات المستخدمين
                        </div>
                        <div className="text-[11px] text-[#52574E] font-mono tabular-nums truncate">
                          {pendingContributionsCount > 0
                            ? `${pendingContributionsCount} مساهمة بانتظار المراجعة`
                            : `${contributions.length} إجمالي المساهمات`}
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[#52574E] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAdminTab('player_analytics')}
                    className="min-h-[60px] p-4 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 hover:bg-[#FEF2EC] hover:border-[#F07842]/45 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#14543D] flex items-center justify-center shrink-0">
                        <BarChart3 className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[#1B1F1C]">
                          إحصائيات اللاعبين
                        </div>
                        <div className="text-[11px] text-[#52574E] truncate">
                          المباريات المحلية والأونلاين والفئات
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[#52574E] shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAdminTab('wala_kalima')}
                    className="min-h-[60px] p-4 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9]/50 hover:bg-[#FEF2EC] hover:border-[#F07842]/45 text-right flex items-center justify-between gap-3 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#F07842] flex items-center justify-center shrink-0">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-display text-sm font-bold text-[#1B1F1C]">
                          كلمات «ولا كلمة» (QR)
                        </div>
                        <div className="text-[11px] text-[#52574E] truncate">
                          إدارة البطاقات وإعدادات التمثيل الصامت
                        </div>
                      </div>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-[#52574E] shrink-0" />
                  </button>
                </div>
              </div>

              {/* Two-Column Distribution & Real System Status */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                {/* Category Distribution (7 cols) */}
                <div className="xl:col-span-7 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-[#E5E8DD] pb-3.5">
                    <div>
                      <h3 className="font-display text-base font-bold text-[#1B1F1C]">
                        توزيع الأسئلة حسب الفئات الرئيسية
                      </h3>
                      <p className="text-xs text-[#52574E]">
                        اضغط على أي فئة للانتقال مباشرة إلى أسئلتها
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectAdminTab('main_categories')}
                      className="text-xs font-bold text-[#F07842] hover:underline cursor-pointer shrink-0"
                    >
                      عرض الفئات
                    </button>
                  </div>

                  <div className="space-y-3">
                    {sortedMainCategories.map((mainCat) => {
                      const qCount = questionCountByMainIdMap.get(mainCat.id) ?? 0;
                      const subCount = getSubcategoriesForMain(mainCat).length;
                      const pct = Math.min(
                        100,
                        Math.round((qCount / Math.max(1, TARGET_QUESTIONS_PER_CATEGORY)) * 100)
                      );
                      return (
                        <button
                          key={mainCat.id}
                          type="button"
                          onClick={() => {
                            setMainCategoryFilter(mainCat.name);
                            setCategoryFilter('الكل');
                            setAdminTab('questions');
                          }}
                          className="w-full text-right p-3 rounded-xl border border-[#E5E8DD] hover:border-[#F07842]/50 bg-[#F3F5E9]/40 hover:bg-[#FEF2EC]/40 transition-colors space-y-2 cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-display font-bold text-[#1B1F1C] truncate">
                                {mainCat.name}
                              </span>
                              {mainCat.isComingSoon && (
                                <span className="text-[10px] font-bold text-[#D9602B] bg-[#FEF2EC] px-1.5 py-0.5 rounded">
                                  قريباً
                                </span>
                              )}
                              {!mainCat.isActive && (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                                  مخفية
                                </span>
                              )}
                            </div>
                            <div className="font-mono tabular-nums text-[11px] text-[#52574E] shrink-0">
                              <strong className="text-[#1B1F1C]">{qCount}</strong> سؤال · {subCount} فرعية
                            </div>
                          </div>
                          <div className="h-2 rounded-full bg-[#E5E8DD] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#F07842] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Real Content Status & Maintenance Tools (5 cols) */}
                <div className="xl:col-span-5 space-y-5">
                  <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="border-b border-[#E5E8DD] pb-3.5">
                      <h3 className="font-display text-base font-bold text-[#1B1F1C]">
                        حالة النظام والمحتوى الفعلي
                      </h3>
                      <p className="text-xs text-[#52574E]">
                        مؤشرات حقيقية محسوبة من البيانات المحمّلة حالياً
                      </p>
                    </div>

                    <div className="divide-y divide-[#E5E8DD] text-xs">
                      <div className="py-3 flex items-center justify-between gap-3">
                        <span className="text-[#52574E]">تغطية صور الفئات الرئيسية</span>
                        <span className="font-mono tabular-nums font-bold text-[#1B1F1C]">
                          {mainImagesCount} / {sortedMainCategories.length}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-3">
                        <span className="text-[#52574E]">تغطية صور الفئات الفرعية</span>
                        <span className="font-mono tabular-nums font-bold text-[#1B1F1C]">
                          {subImagesCount} / {subcategories.length}
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-3">
                        <span className="text-[#52574E]">فئات فرعية بدون صور مخصصة</span>
                        <button
                          type="button"
                          onClick={() => handleSelectAdminTab('images')}
                          className="font-mono tabular-nums font-bold text-[#F07842] hover:underline cursor-pointer"
                        >
                          {overviewStats.missingImgSub} فئة
                        </button>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-3">
                        <span className="text-[#52574E]">فئات فرعية بدون أسئلة حالياً</span>
                        <span className="font-mono tabular-nums font-bold text-[#1B1F1C]">
                          {overviewStats.emptySub} فئة
                        </span>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-3">
                        <span className="text-[#52574E]">أسئلة مكررة محتملة</span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowDuplicatesOnly(true);
                            setAdminTab('questions');
                          }}
                          className="font-mono tabular-nums font-bold text-[#F07842] hover:underline cursor-pointer"
                        >
                          {counts.duplicates} سؤال
                        </button>
                      </div>

                      <div className="py-3 flex items-center justify-between gap-3">
                        <span className="text-[#52574E]">مساهمات بانتظار المراجعة</span>
                        <button
                          type="button"
                          onClick={() => handleSelectAdminTab('contributions')}
                          className="font-mono tabular-nums font-bold text-[#14543D] hover:underline cursor-pointer"
                        >
                          {pendingContributionsCount} مساهمة
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Foundational Pack Sync Card */}
                  <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#1B1F1C]">
                      <Database className="w-4 h-4 text-[#F07842]" />
                      <span>أداة مزامنة بنك الأسئلة التأسيسي</span>
                    </div>
                    <p className="text-xs text-[#52574E] leading-relaxed">
                      مزامنة وتحديث حزمة الأسئلة التأسيسية ({TARGET_TOTAL_QUESTIONS.toLocaleString('en-US')} سؤال) على دفعات منظمة مع احترام قائمة المحذوفات المعتمدة.
                    </p>
                    <button
                      type="button"
                      disabled={seeding}
                      onClick={onSeedFoundationalPack}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-colors"
                      title="حفظ وتزامن الأسئلة التأسيسية في Firestore بدفعات منظمة"
                    >
                      <RefreshCw className={`w-4 h-4 text-[#F07842] ${seeding ? 'animate-spin' : ''}`} />
                      <span>
                        {seeding ? 'جارٍ الحفظ والتزامن بدفعات...' : `تزامن بنك الأسئلة الشامل (${TARGET_TOTAL_QUESTIONS.toLocaleString('en-US')} سؤال)`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: FULL MAIN CATEGORY MANAGEMENT (إدارة الفئات الرئيسية) */}
          {adminTab === 'main_categories' && (
            <div className="space-y-6">
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[#F07842]">
                    المستوى الأول · الأقسام الرئيسية
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]">
                    الفئات الرئيسية ({sortedMainCategories.length})
                  </h2>
                  <p className="text-xs text-[#52574E]">
                    أضف فئة رئيسية جديدة، عدّل الاسم والوصف والصورة وترتيب الظهور، أو أخفِ وأظهر أي فئة مع معاينة فورية.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={openAddMainCategoryModal}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة فئة رئيسية</span>
                </button>
              </div>

              {sortedMainCategories.length === 0 ? (
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl py-16 text-center space-y-4">
                  <p className="font-display text-base font-bold text-[#1B1F1C]">
                    لا توجد فئات رئيسية حالياً
                  </p>
                  <button
                    type="button"
                    onClick={openAddMainCategoryModal}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#F07842] text-white text-xs font-bold cursor-pointer"
                  >
                    إضافة أول فئة رئيسية
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {sortedMainCategories.map((mainCat, index) => {
                    const subsInMain = getSubcategoriesForMain(mainCat);
                    const qsInMainCount =
                      questionCountByMainIdMap.get(mainCat.id) ?? 0;
                    const hasImg = Boolean(
                      mainCat.imageUrl && mainCat.imageUrl.trim().length > 0
                    );

                    return (
                      <div
                        key={mainCat.id}
                        className={`bg-[#FFFFFF] border rounded-2xl p-4 flex flex-col justify-between space-y-4 transition-colors ${
                          mainCat.isComingSoon
                            ? 'border-[#F07842]/50'
                            : mainCat.isActive
                            ? 'border-[#E5E8DD]'
                            : 'border-dashed border-rose-300 opacity-85'
                        }`}
                      >
                        <div className="space-y-3.5">
                          {/* Top Status & Order Bar */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="font-mono tabular-nums font-bold text-[#52574E]">
                                #{mainCat.sortOrder}
                              </span>
                              <span aria-hidden="true" className="text-[#E5E8DD]">·</span>
                              <span
                                className={`inline-flex items-center gap-1 font-bold ${
                                  mainCat.isActive
                                    ? 'text-[#14543D]'
                                    : 'text-rose-700'
                                }`}
                              >
                                {mainCat.isActive ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                                <span>{mainCat.isActive ? 'ظاهرة' : 'مخفية'}</span>
                              </span>
                              {mainCat.isComingSoon && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FEF2EC] text-[#D9602B] border border-[#F07842]/30 inline-flex items-center gap-1">
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
                                className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] disabled:opacity-35 flex items-center justify-center cursor-pointer"
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
                                className="min-w-[44px] min-h-[44px] sm:min-w-[34px] sm:min-h-[34px] rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] disabled:opacity-35 flex items-center justify-center cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewMainCategory(mainCat)}
                                title="معاينة شكل الفئة في الموقع"
                                className="min-h-[44px] sm:min-h-[34px] px-3 sm:px-2.5 rounded-lg bg-[#F3F5E9] hover:bg-[#E5E8DD] text-xs sm:text-[11px] font-bold text-[#1B1F1C] cursor-pointer"
                              >
                                معاينة
                              </button>
                            </div>
                          </div>

                          {/* Website Card Preview */}
                          <div
                            onClick={() => setPreviewMainCategory(mainCat)}
                            title="اضغط لمعاينة شكل البطاقة في الموقع"
                            className="group relative aspect-[16/10] w-full rounded-xl overflow-hidden border border-[#E5E8DD] bg-[#14543D] flex flex-col justify-end cursor-pointer"
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

                            <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between z-10">
                              {mainCat.isComingSoon ? (
                                <span className="px-2.5 py-0.5 rounded-md bg-[#F07842] text-white text-[11px] font-bold inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>قريباً</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-[#1B1F1C]/75 text-white font-mono tabular-nums text-[11px] font-bold">
                                  {subsInMain.length} فرعية
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  hasImg
                                    ? 'bg-[#14543D] text-white'
                                    : 'bg-[#1B1F1C]/75 text-[#F3F5E9]'
                                }`}
                              >
                                {hasImg ? 'صورة مرفوعة' : 'بدون صورة'}
                              </span>
                            </div>

                            <div className="relative z-10 p-3.5 text-right space-y-0.5">
                              <h3 className="font-display text-lg font-bold text-white">
                                {mainCat.name}
                              </h3>
                              <p className="text-[11px] text-[#F3F5E9]/85 line-clamp-1">
                                {mainCat.description ||
                                  mainCat.tagline ||
                                  'بدون وصف مضاف'}
                              </p>
                            </div>
                          </div>

                          {/* Category Metadata Summary */}
                          <div className="pt-1 space-y-1 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-display font-bold text-[#1B1F1C] truncate">
                                {mainCat.name}
                              </span>
                              <span className="font-mono tabular-nums text-[11px] text-[#14543D] font-bold shrink-0">
                                {subsInMain.length} فرعية · {qsInMainCount} سؤال
                              </span>
                            </div>
                            <p className="text-[#52574E] line-clamp-2 leading-relaxed">
                              {mainCat.description ||
                                mainCat.tagline ||
                                'لا يوجد وصف مضاف لهذه الفئة حالياً.'}
                            </p>
                          </div>
                        </div>

                        {/* Action Controls */}
                        <div className="space-y-2 pt-2 border-t border-[#E5E8DD]">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => openEditMainCategoryModal(mainCat)}
                              className="min-h-[44px] sm:min-h-[40px] py-2 px-3 rounded-xl bg-[#1B1F1C] hover:bg-[#2E3430] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                              className="min-h-[44px] sm:min-h-[40px] py-2 px-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Crop className="w-3.5 h-3.5" />
                              <span>{hasImg ? 'تغيير الصورة' : 'رفع صورة'}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleToggleMainCategoryComingSoon(mainCat)}
                              className={`min-h-[44px] sm:min-h-[38px] py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer border ${
                                mainCat.isComingSoon
                                  ? 'bg-[#EAF2EE] hover:bg-[#D7E6DF] text-[#14543D] border-[#14543D]/25'
                                  : 'bg-[#FEF2EC] hover:bg-[#FDE4D7] text-[#D9602B] border-[#F07842]/25'
                              }`}
                            >
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>{mainCat.isComingSoon ? 'تفعيل' : 'قريباً'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleToggleMainCategoryActive(mainCat)}
                              className="min-h-[44px] sm:min-h-[38px] py-1.5 px-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-[#1B1F1C] text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              {mainCat.isActive ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-[#52574E] shrink-0" />
                                  <span>إخفاء</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-[#14543D] shrink-0" />
                                  <span>إظهار</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => openDeleteMainCategoryDialog(mainCat)}
                              title="حذف الفئة الرئيسية"
                              className="min-h-[44px] sm:min-h-[38px] py-1.5 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
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
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h2 className="font-display text-lg font-bold text-[#1B1F1C]">
                      الفئات الفرعية وتنظيمها ({subcategories.length})
                    </h2>
                    <p className="text-xs text-[#52574E]">
                      أضف فئات فرعية جديدة، عدّل أسماءها وصورها، انقلها بين الفئات الرئيسية، أو أخفها واحذفها بأمان.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddSubcategoryModal()}
                    className="min-h-[44px] px-4 py-2.5 text-xs font-bold text-white bg-[#F07842] hover:bg-[#D9632E] rounded-xl flex items-center gap-1.5 self-start cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إضافة فئة فرعية</span>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-1">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-[#52574E] absolute right-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={subSearchQuery}
                      onChange={(e) => setSubSearchQuery(e.target.value)}
                      placeholder="ابحث في الفئات الفرعية بالاسم أو الوصف..."
                      className="w-full min-h-[42px] pr-10 pl-3.5 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:bg-[#FFFFFF]"
                    />
                  </div>
                  <div className="text-xs text-[#52574E] font-semibold">
                    النتائج:{' '}
                    <strong className="font-mono tabular-nums text-[#1B1F1C]">
                      {filteredSubcategoriesCount}
                    </strong>{' '}
                    فئة فرعية
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSubMainFilter('الكل')}
                    className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      subMainFilter === 'الكل'
                        ? 'bg-[#1B1F1C] text-white border-[#1B1F1C]'
                        : 'bg-[#F3F5E9] text-[#52574E] border-[#E5E8DD] hover:text-[#1B1F1C]'
                    }`}
                  >
                    كل الأقسام ({sortedMainCategories.length})
                  </button>
                  {sortedMainCategories.map((mainCat) => {
                    const subCount = getSubcategoriesForMain(mainCat).length;
                    const activeFilter =
                      subMainFilter === mainCat.id ||
                      subMainFilter === mainCat.name;
                    return (
                      <button
                        key={mainCat.id}
                        type="button"
                        onClick={() => setSubMainFilter(mainCat.id)}
                        className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                          activeFilter
                            ? 'bg-[#F07842] text-white border-[#F07842]'
                            : 'bg-[#FFFFFF] text-[#1B1F1C] border-[#E5E8DD] hover:bg-[#F3F5E9]'
                        }`}
                      >
                        <span>{mainCat.name}</span>
                        <span className="font-mono tabular-nums text-[11px] opacity-85">
                          ({subCount})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {singlePageSubcategoryGroups.length === 0 ? (
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl py-12 text-center text-xs text-[#52574E]">
                  لا توجد فئات فرعية مطابقة لمعايير البحث الحالية.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {singlePageSubcategoryGroups.map(({ mainCat, subs: groupSubs, totalInMain }) => {
                    return (
                      <div
                        key={mainCat.id}
                        className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 flex flex-col justify-between space-y-4 [content-visibility:auto] [contain-intrinsic-size:auto_380px]"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#E5E8DD]">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#E5E8DD] shrink-0"
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
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-display text-base font-bold text-[#1B1F1C] truncate">
                                    {mainCat.name}
                                  </h3>
                                  {mainCat.isComingSoon && (
                                    <span className="text-[10px] font-bold text-[#D9602B] bg-[#FEF2EC] border border-[#F07842]/30 px-2 py-0.5 rounded-md">
                                      قريباً
                                    </span>
                                  )}
                                  {!mainCat.isActive && (
                                    <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                                      قسم مخفي
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#52574E] font-mono tabular-nums">
                                  {totalInMain} فئة فرعية مسجلة
                                </p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => openAddSubcategoryModal(mainCat)}
                              className="min-h-[44px] sm:min-h-[36px] px-3 py-1.5 text-xs font-bold text-[#1B1F1C] bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] rounded-xl flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#F07842]" />
                              <span>إضافة هنا</span>
                            </button>
                          </div>

                          {groupSubs.length === 0 ? (
                            <div className="py-8 text-center text-xs text-[#52574E]">
                              لا توجد فئات فرعية في هذا القسم حالياً.
                            </div>
                          ) : (
                            <div className="divide-y divide-[#E5E8DD]">
                              {groupSubs.map((sub) => (
                                <SubcategoryAdminRow
                                  key={sub.id}
                                  sub={sub}
                                  qCount={questionCountBySubIdMap.get(sub.id) ?? 0}
                                  actionLoading={actionLoading}
                                  onToggleComingSoon={handleToggleSubcategoryComingSoon}
                                  onSelectImage={triggerSubcategoryImagePicker}
                                  onMoveOrder={handleMoveSubcategoryOrder}
                                  onToggleActive={handleToggleSubcategoryActive}
                                  onEdit={openEditSubcategoryModal}
                                  onDelete={openDeleteSubcategoryDialog}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CATEGORY IMAGE MANAGEMENT (إدارة صور الفئات) */}
          {adminTab === 'images' && (
            <div className="space-y-8">
              {/* PART A: MAIN CATEGORIES IMAGES */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E8DD] pb-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#F07842]">
                      المستوى الأول · الفئات الرئيسية
                    </div>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]">
                      صور الفئات الرئيسية ({mainImagesCount} / {sortedMainCategories.length})
                    </h2>
                    <p className="text-xs text-[#52574E]">
                      ارفع أو استبدل أو احذف صورة كل قسم رئيسي بشكل مستقل. الصيغ المدعومة: JPG, JPEG, PNG, WEBP مع القص والتوسيط قبل الحفظ.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedMainCategories.map((mainCat) => {
                    const hasImg = Boolean(
                      mainCat.imageUrl && mainCat.imageUrl.trim().length > 0
                    );
                    return (
                      <div
                        key={mainCat.id}
                        className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-3.5 flex flex-col justify-between space-y-3.5"
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
                                  : 'bg-[#1B1F1C]/75 text-[#F3F5E9]'
                              }`}
                            >
                              {hasImg ? 'صورة مخصصة' : 'بدون صورة'}
                            </span>
                          </div>

                          <div className="relative z-10 p-3.5 text-right">
                            <div className="font-display text-base font-bold text-white">
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
                            className="flex-1 min-h-[44px] sm:min-h-[40px] py-2 px-3 rounded-xl bg-[#1B1F1C] hover:bg-[#2F3531] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                              className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[#FFFFFF] hover:bg-rose-50 text-rose-700 border border-[#E5E8DD] flex items-center justify-center transition-colors cursor-pointer"
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
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#14543D]">
                      المستوى الثاني · الفئات الفرعية
                    </div>
                    <h2 className="font-display text-lg sm:text-xl font-bold text-[#1B1F1C]">
                      صور الفئات الفرعية ({subImagesCount} / {subcategories.length})
                    </h2>
                    <p className="text-xs text-[#52574E]">
                      لكل فئة فرعية صورتها المستقلة في بطاقتها المربعة. اختر القسم الرئيسي أو ابحث بالاسم لرفع أو تعديل صورة أي فئة فرعية.
                    </p>
                  </div>

                  <div className="relative w-full lg:w-72">
                    <Search className="w-4 h-4 text-[#52574E] absolute right-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={imgSearchQuery}
                      onChange={(e) => setImgSearchQuery(e.target.value)}
                      placeholder="ابحث عن فئة فرعية..."
                      className="w-full min-h-[42px] pr-10 pl-3.5 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:bg-[#FFFFFF]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setImgMainFilter('الكل')}
                    className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      imgMainFilter === 'الكل'
                        ? 'bg-[#1B1F1C] text-white border-[#1B1F1C]'
                        : 'bg-[#F3F5E9] text-[#52574E] border-[#E5E8DD]'
                    }`}
                  >
                    كل الفئات ({subcategories.length})
                  </button>
                  {sortedMainCategories.map((mc) => {
                    const countInMc = getSubcategoriesForMain(mc).length;
                    const activeImgMain =
                      imgMainFilter === mc.id || imgMainFilter === mc.name;
                    return (
                      <button
                        key={mc.id}
                        type="button"
                        onClick={() => setImgMainFilter(mc.id)}
                        className={`min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          activeImgMain
                            ? 'bg-[#F07842] text-white border-[#F07842]'
                            : 'bg-[#FFFFFF] text-[#1B1F1C] border-[#E5E8DD] hover:bg-[#F3F5E9]'
                        }`}
                      >
                        {mc.name} ({countInMc})
                      </button>
                    );
                  })}
                </div>

                {filteredImageSubcategories.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#52574E]">
                    لا توجد فئات فرعية مطابقة للبحث الحالي.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredImageSubcategories.map((sub) => {
                      const hasImg = Boolean(
                        sub.imageUrl && sub.imageUrl.trim().length > 0
                      );
                      return (
                        <div
                          key={sub.id}
                          className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-3.5 flex flex-col justify-between space-y-3"
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
                              <span className="px-2 py-0.5 rounded-md bg-[#1B1F1C]/75 text-white text-[10px] font-bold">
                                {sub.mainCategory}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  hasImg
                                    ? 'bg-[#F07842] text-white'
                                    : 'bg-[#1B1F1C]/70 text-[#F3F5E9]/85'
                                }`}
                              >
                                {hasImg ? 'مرفوعة' : 'بدون صورة'}
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
                              className="flex-1 min-h-[44px] sm:min-h-[40px] py-2 px-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                                className="min-w-[44px] min-h-[44px] sm:min-w-[40px] sm:min-h-[40px] rounded-xl bg-[#FFFFFF] hover:bg-rose-50 text-rose-700 border border-[#E5E8DD] flex items-center justify-center transition-colors cursor-pointer"
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
            <div className="space-y-5">
              {/* Summary KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-1">
                  <div className="text-xs text-[#52574E]">الإجمالي الفعلي</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-[#1B1F1C]">
                    {counts.total}{' '}
                    <span className="text-xs font-normal text-[#52574E]">
                      / {TARGET_TOTAL_QUESTIONS}
                    </span>
                  </div>
                </div>
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-1">
                  <div className="text-xs text-[#52574E]">معتمد</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-[#14543D]">
                    {counts.approved}
                  </div>
                </div>
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-1">
                  <div className="text-xs text-[#52574E]">قيد المراجعة</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-[#F07842]">
                    {counts.pending}
                  </div>
                </div>
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-1">
                  <div className="text-xs text-[#52574E]">مرفوض</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-rose-700">
                    {counts.rejected}
                  </div>
                </div>
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-1">
                  <div className="text-xs text-[#52574E]">أنواع الوسائط</div>
                  <div className="font-mono tabular-nums text-xs font-bold text-[#1B1F1C] leading-relaxed">
                    {counts.textOnly} نص · {counts.illustrated} صورة · {counts.audioOnly} صوت
                  </div>
                </div>
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 space-y-1">
                  <div className="text-xs text-[#52574E]">تكرارات محتملة</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-[#F07842]">
                    {counts.duplicates}
                  </div>
                </div>
              </div>

              {/* Main Category Quick Filter */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-bold text-[#1B1F1C]">
                    تصفية حسب الفئة الرئيسية
                  </h2>
                  {mainCategoryFilter !== 'الكل' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMainCategoryFilter('الكل');
                        setCategoryFilter('الكل');
                      }}
                      className="min-h-[44px] sm:min-h-[32px] px-2 text-xs font-bold text-[#F07842] hover:underline cursor-pointer inline-flex items-center"
                    >
                      عرض جميع الفئات
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                  {sortedMainCategories.map((mainCat) => {
                    const catCount = questionCountByMainIdMap.get(mainCat.id) ?? 0;
                    const isSelected = mainCategoryFilter === mainCat.name;

                    return (
                      <button
                        key={mainCat.id}
                        type="button"
                        onClick={() => {
                          const next = isSelected ? 'الكل' : mainCat.name;
                          setMainCategoryFilter(next);
                          setCategoryFilter('الكل');
                        }}
                        className={`p-3 rounded-xl border text-right transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-[#FEF2EC] border-[#F07842]'
                            : 'bg-[#FFFFFF] border-[#E5E8DD] hover:bg-[#F3F5E9]/60'
                        }`}
                      >
                        <div className="font-display text-xs font-bold text-[#1B1F1C] truncate">
                          {mainCat.name}
                        </div>
                        <div className="font-mono tabular-nums text-sm font-bold text-[#14543D] mt-1">
                          {catCount}{' '}
                          <span className="text-[11px] font-normal text-[#52574E]">
                            / {TARGET_QUESTIONS_PER_CATEGORY}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search, Filters & Import/Export Toolbar */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4 relative">
                    <Search className="w-4 h-4 text-[#52574E] absolute right-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ابحث بنص السؤال أو الإجابة أو الفئة..."
                      className="w-full min-h-[42px] pr-10 pl-3.5 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842] focus:bg-[#FFFFFF]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      aria-label="تصفية حسب الفئة الفرعية"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842]"
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
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842]"
                    >
                      <option value="الكل">كل الأنواع</option>
                      <option value="text">سؤال نصي ({counts.textOnly})</option>
                      <option value="image">سؤال صورة ({counts.illustrated})</option>
                      <option value="audio">سؤال صوتي ({counts.audioOnly})</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <select
                      value={difficultyFilter}
                      onChange={(e) => setDifficultyFilter(e.target.value)}
                      aria-label="تصفية حسب الصعوبة"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842]"
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
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] focus:outline-none focus:border-[#F07842]"
                    >
                      <option value="الكل">كل الحالات</option>
                      <option value="approved">معتمد</option>
                      <option value="pending">قيد المراجعة</option>
                      <option value="rejected">مرفوض</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E5E8DD] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDuplicatesOnly((prev) => !prev)}
                      className={`min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        showDuplicatesOnly
                          ? 'bg-[#F07842] text-white border-[#F07842]'
                          : 'bg-[#F3F5E9] text-[#1B1F1C] border-[#E5E8DD] hover:bg-[#E5E8DD]'
                      }`}
                    >
                      كشف المكرر ({counts.duplicates})
                    </button>

                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleConvertExistingToDirect}
                      className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#EAF2EE] hover:bg-[#D5E6DD] text-[#14543D] border border-[#C5DDD1] flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>توحيد إلى أسئلة مباشرة</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportJSON}
                      className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] border border-[#E5E8DD] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>تصدير JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] border border-[#E5E8DD] flex items-center gap-1.5 cursor-pointer"
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
                      className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1B1F1C] hover:bg-[#2F3531] text-white flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#F07842]" />
                      <span>استيراد JSON / CSV</span>
                    </button>
                  </div>

                  <div className="text-xs text-[#52574E] font-mono tabular-nums">
                    المطابق للتصفية: <strong className="text-[#1B1F1C]">{filteredQuestions.length}</strong> سؤال
                  </div>
                </div>

                {/* Sticky / Highlighted Bulk Actions Bar */}
                {selectedIds.length > 0 && (
                  <div className="bg-[#FEF2EC] border border-[#F07842]/45 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#1B1F1C]">
                      <span>تم تحديد</span>
                      <span className="font-mono tabular-nums text-[#F07842] text-sm">
                        {selectedIds.length}
                      </span>
                      <span>سؤال</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => requestBulkStatus('approved')}
                        className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-[#14543D] hover:bg-[#0E3F2D] text-white rounded-lg cursor-pointer transition-colors"
                      >
                        اعتماد المحدد
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => requestBulkStatus('rejected')}
                        className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-[#F07842] hover:bg-[#D9632E] text-white rounded-lg cursor-pointer transition-colors"
                      >
                        رفض المحدد
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={requestBulkDelete}
                        className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg cursor-pointer transition-colors"
                      >
                        حذف المحدد ({selectedIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIds([])}
                        className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 text-xs font-bold bg-[#FFFFFF] border border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C] rounded-lg cursor-pointer"
                      >
                        إلغاء التحديد
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Questions Data View: Desktop Table + Mobile Cards */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl overflow-hidden">
                {/* Mobile Select-All Bar */}
                {filteredQuestions.length > 0 && (
                  <div className="md:hidden px-4 py-3 bg-[#F3F5E9]/70 border-b border-[#E5E8DD] flex items-center justify-between gap-2 text-xs">
                    <label className="flex items-center gap-2.5 font-bold text-[#1B1F1C] cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#F07842]"
                        checked={
                          filteredQuestions.length > 0 &&
                          filteredQuestions.every((q) => selectedIdsSet.has(q.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(filteredQuestions.map((q) => q.id));
                          } else {
                            setSelectedIds([]);
                          }
                        }}
                      />
                      <span>تحديد كل النتائج ({filteredQuestions.length})</span>
                    </label>
                    <span className="font-mono tabular-nums text-[#52574E]">
                      صفحة {questionsPage} / {totalQuestionPages}
                    </span>
                  </div>
                )}

                {filteredQuestions.length === 0 ? (
                  <div className="py-14 px-4 text-center space-y-3">
                    <p className="text-sm font-bold text-[#1B1F1C]">
                      {loadingQuestions
                        ? 'جاري تحميل الأسئلة من قاعدة البيانات...'
                        : 'لا توجد أسئلة مطابقة لمعايير البحث الحالية.'}
                    </p>
                    {!loadingQuestions && (
                      <button
                        type="button"
                        onClick={openAddModal}
                        className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F07842] text-white text-xs font-bold cursor-pointer"
                      >
                        إضافة سؤال جديد
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#F3F5E9] border-b border-[#E5E8DD] text-[#52574E]">
                            <th className="py-3.5 px-4 w-10">
                              <input
                                type="checkbox"
                                className="w-4 h-4 accent-[#F07842]"
                                checked={
                                  filteredQuestions.length > 0 &&
                                  filteredQuestions.every((q) => selectedIdsSet.has(q.id))
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
                            <th className="py-3.5 px-4 font-bold">الفئة</th>
                            <th className="py-3.5 px-4 font-bold">السؤال والإجابة</th>
                            <th className="py-3.5 px-4 font-bold">الوسائط</th>
                            <th className="py-3.5 px-4 font-bold">المستوى والنقاط</th>
                            <th className="py-3.5 px-4 font-bold">الحالة</th>
                            <th className="py-3.5 px-4 font-bold">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E8DD]">
                          {paginatedQuestions.map((q) => {
                            const isDup = duplicateIdsSet.has(q.id);
                            const isChecked = selectedIdsSet.has(q.id);
                            const parentMain = subcategoryToMainMap.get(q.category);
                            const mediaKind = inferQuestionMediaType(q);
                            return (
                              <tr
                                key={q.id}
                                className={`hover:bg-[#F3F5E9]/50 transition-colors ${
                                  isChecked ? 'bg-[#FEF2EC]/55' : ''
                                }`}
                              >
                                <td className="py-3.5 px-4">
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 accent-[#F07842]"
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
                                  <div className="font-bold text-[#1B1F1C]">
                                    {q.category}
                                  </div>
                                  {parentMain && (
                                    <div className="text-[11px] text-[#52574E]">
                                      {parentMain}
                                    </div>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 max-w-md space-y-1">
                                  <div className="font-semibold text-[#1B1F1C] text-sm leading-snug">
                                    {q.questionText}
                                    {isDup && (
                                      <span className="mr-2 text-[11px] font-bold text-[#F07842]">
                                        (مكرر محتمل)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[#52574E]">
                                    الإجابة:{' '}
                                    <strong className="text-[#14543D]">
                                      {q.correctAnswer}
                                    </strong>
                                    {q.source && ` · المصدر: ${q.source}`}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  {mediaKind === 'audio' ? (
                                    <div className="flex items-center gap-2">
                                      <div className="w-9 h-9 rounded-lg bg-[#EAF2EE] border border-[#C5DDD1] flex items-center justify-center shrink-0">
                                        <Volume2 className="w-4 h-4 text-[#14543D]" />
                                      </div>
                                      <div>
                                        <div className="text-[#14543D] font-bold">
                                          سؤال صوتي
                                        </div>
                                        <div className="text-[10px] text-[#52574E]">
                                          {q.audioMaxPlays
                                            ? `حد: ${q.audioMaxPlays} ${q.audioMaxPlays === 1 ? 'مرة' : 'مرات'}`
                                            : 'تشغيل مفتوح'}
                                        </div>
                                      </div>
                                    </div>
                                  ) : mediaKind === 'image' && q.imageUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewQuestion(q)}
                                      className="flex items-center gap-2 text-right cursor-pointer group"
                                      title="اضغط لمعاينة الصورة والسؤال"
                                    >
                                      <img
                                        src={q.imageUrl}
                                        alt={q.imageDescription || 'صورة السؤال'}
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                        className="w-10 h-10 rounded-lg object-cover border border-[#E5E8DD] bg-[#F3F5E9] shrink-0 group-hover:border-[#F07842]"
                                      />
                                      <div>
                                        <div className="text-[#F07842] font-bold flex items-center gap-1">
                                          <ImageIcon className="w-3.5 h-3.5" />
                                          <span>سؤال صورة</span>
                                        </div>
                                        {q.imageDescription && (
                                          <div className="text-[10px] text-[#52574E] max-w-[120px] truncate">
                                            {q.imageDescription}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  ) : (
                                    <span className="text-[#52574E] font-semibold">
                                      سؤال نصي
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span className="font-semibold text-[#1B1F1C]">
                                    {q.difficulty}
                                  </span>
                                  <span className="mx-1.5 text-[#E5E8DD]">·</span>
                                  <span className="font-mono tabular-nums font-bold text-[#F07842]">
                                    {q.points}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap font-bold">
                                  {q.status === 'approved' && (
                                    <span className="inline-flex items-center gap-1 text-[#14543D]">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>معتمد</span>
                                    </span>
                                  )}
                                  {q.status === 'pending' && (
                                    <span className="inline-flex items-center gap-1 text-[#D9602B]">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>قيد المراجعة</span>
                                    </span>
                                  )}
                                  {q.status === 'rejected' && (
                                    <span className="inline-flex items-center gap-1 text-rose-700">
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>مرفوض</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewQuestion(q)}
                                      title="معاينة السؤال والإجابة"
                                      aria-label="معاينة السؤال والإجابة"
                                      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#52574E] hover:text-[#1B1F1C] hover:bg-[#F3F5E9] rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    {q.status !== 'approved' && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleSingleStatusChange(q.id, 'approved')
                                        }
                                        title="اعتماد السؤال"
                                        aria-label="اعتماد السؤال"
                                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#14543D] hover:bg-[#EAF2EE] rounded-lg transition-colors cursor-pointer"
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
                                        aria-label="رفض السؤال"
                                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#F07842] hover:bg-[#FEF2EC] rounded-lg transition-colors cursor-pointer"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openEditModal(q)}
                                      title="تعديل السؤال"
                                      aria-label="تعديل السؤال"
                                      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-[#1B1F1C] hover:bg-[#F3F5E9] rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => requestSingleDelete(q)}
                                      title="حذف السؤال"
                                      aria-label="حذف السؤال"
                                      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View (Zero Horizontal Overflow) */}
                    <div className="md:hidden divide-y divide-[#E5E8DD]">
                      {paginatedQuestions.map((q) => {
                        const isDup = duplicateIdsSet.has(q.id);
                        const isChecked = selectedIdsSet.has(q.id);
                        const parentMain = subcategoryToMainMap.get(q.category);
                        const mediaKind = inferQuestionMediaType(q);
                        return (
                          <div
                            key={q.id}
                            className={`p-4 space-y-3 ${isChecked ? 'bg-[#FEF2EC]/55' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <label className="flex items-start gap-2.5 min-w-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-5 h-5 mt-0.5 accent-[#F07842] shrink-0"
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
                                />
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-[#1B1F1C] truncate">
                                    {q.category}
                                  </div>
                                  <div className="text-[11px] text-[#52574E] truncate">
                                    {parentMain || 'فئة عامة'} · {q.difficulty} ·{' '}
                                    <span className="font-mono tabular-nums font-bold text-[#F07842]">
                                      {q.points}
                                    </span>
                                  </div>
                                </div>
                              </label>

                              <span className="shrink-0 text-[11px] font-bold">
                                {q.status === 'approved' && (
                                  <span className="inline-flex items-center gap-1 text-[#14543D]">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>معتمد</span>
                                  </span>
                                )}
                                {q.status === 'pending' && (
                                  <span className="inline-flex items-center gap-1 text-[#D9602B]">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>قيد المراجعة</span>
                                  </span>
                                )}
                                {q.status === 'rejected' && (
                                  <span className="inline-flex items-center gap-1 text-rose-700">
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span>مرفوض</span>
                                  </span>
                                )}
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <div className="text-sm font-bold text-[#1B1F1C] leading-relaxed">
                                {q.questionText}
                                {isDup && (
                                  <span className="mr-1.5 text-[11px] font-bold text-[#F07842]">
                                    (مكرر محتمل)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#52574E]">
                                الإجابة:{' '}
                                <strong className="text-[#14543D]">{q.correctAnswer}</strong>
                              </div>
                            </div>

                            {(mediaKind === 'image' && q.imageUrl) || mediaKind === 'audio' ? (
                              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F3F5E9]/70 border border-[#E5E8DD] text-xs">
                                {mediaKind === 'image' && q.imageUrl ? (
                                  <>
                                    <img
                                      src={q.imageUrl}
                                      alt={q.imageDescription || 'صورة السؤال'}
                                      loading="lazy"
                                      className="w-11 h-11 rounded-lg object-cover border border-[#E5E8DD] shrink-0"
                                    />
                                    <span className="font-bold text-[#F07842]">سؤال بصورة</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-4 h-4 text-[#14543D] shrink-0" />
                                    <span className="font-bold text-[#14543D]">سؤال صوتي</span>
                                  </>
                                )}
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setPreviewQuestion(q)}
                                className="min-h-[44px] px-3.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>معاينة</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(q)}
                                className="min-h-[44px] px-3.5 rounded-xl bg-[#1B1F1C] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>
                              {q.status !== 'approved' && (
                                <button
                                  type="button"
                                  onClick={() => handleSingleStatusChange(q.id, 'approved')}
                                  className="min-h-[44px] px-3.5 rounded-xl bg-[#EAF2EE] text-[#14543D] text-xs font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>اعتماد</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => requestSingleDelete(q)}
                                className="min-h-[44px] px-3.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer mr-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Pagination Controls for Questions */}
                {filteredQuestions.length > questionsPerPage && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-[#E5E8DD] bg-[#FFFFFF]">
                    <div className="text-xs text-[#52574E] font-mono tabular-nums">
                      عرض{' '}
                      <strong className="text-[#1B1F1C]">
                        {(questionsPage - 1) * questionsPerPage + 1}
                      </strong>{' '}
                      -{' '}
                      <strong className="text-[#1B1F1C]">
                        {Math.min(questionsPage * questionsPerPage, filteredQuestions.length)}
                      </strong>{' '}
                      من أصل{' '}
                      <strong className="text-[#1B1F1C]">
                        {filteredQuestions.length}
                      </strong>{' '}
                      سؤال
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={questionsPage <= 1}
                        onClick={() => {
                          setQuestionsPage((p) => Math.max(1, p - 1));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="min-h-[44px] sm:min-h-[38px] px-4 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] text-[#1B1F1C] hover:bg-[#F3F5E9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        السابق
                      </button>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#1B1F1C] font-mono tabular-nums">
                        <span className="px-2.5 py-1 rounded-lg bg-[#FEF2EC] text-[#F07842]">
                          {questionsPage}
                        </span>
                        <span className="text-[#52574E]">/</span>
                        <span>{totalQuestionPages}</span>
                      </div>
                      <button
                        type="button"
                        disabled={questionsPage >= totalQuestionPages}
                        onClick={() => {
                          setQuestionsPage((p) => Math.min(totalQuestionPages, p + 1));
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="min-h-[44px] sm:min-h-[38px] px-4 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] text-[#1B1F1C] hover:bg-[#F3F5E9] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        التالي
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CONTACT US SETTINGS MANAGEMENT */}
          {adminTab === 'contact' && (
            <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-8 max-w-3xl space-y-6">
              <div className="space-y-1 border-b border-[#E5E8DD] pb-4">
                <div className="text-xs font-bold text-[#F07842]">
                  إعدادات صفحة تواصل معنا
                </div>
                <h2 className="font-display text-xl font-bold text-[#1B1F1C]">
                  تعديل بيانات وروابط التواصل
                </h2>
                <p className="text-xs text-[#52574E]">
                  جميع الحقول هنا تظهر مباشرة في صفحة «تواصل معنا». اترك أي حقل فارغاً إذا لم ترغب في عرضه حالياً.
                </p>
              </div>

              <form
                onSubmit={handleSaveContactSettings}
                className="space-y-5 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block font-bold text-[#1B1F1C]">
                      العنوان الترحيبي الرئيسي
                    </label>
                    <input
                      type="text"
                      required
                      value={contactHeading}
                      onChange={(e) => setContactHeading(e.target.value)}
                      placeholder="حنا هنا لمساعدتك!"
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C]"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block font-bold text-[#1B1F1C]">
                      الرسالة الترحيبية القصيرة
                    </label>
                    <textarea
                      rows={3}
                      value={contactMessage}
                      onChange={(e) => setContactMessage(e.target.value)}
                      placeholder="اكتب رسالة قصيرة تدعو الزوار للتواصل معكم..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#1B1F1C]">
                      رقم أو رابط الواتساب (WhatsApp)
                    </label>
                    <input
                      type="text"
                      value={contactWhatsappUrl}
                      onChange={(e) => setContactWhatsappUrl(e.target.value)}
                      placeholder="مثال: https://wa.me/9665... أو رقم الجوال دولياً"
                      dir="ltr"
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#1B1F1C]">
                      النص الظاهر على زر الواتساب (اختياري)
                    </label>
                    <input
                      type="text"
                      value={contactWhatsappDisplay}
                      onChange={(e) => setContactWhatsappDisplay(e.target.value)}
                      placeholder="مثال: تواصل معنا عبر واتساب"
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C]"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block font-bold text-[#1B1F1C]">
                      البريد الإلكتروني للتواصل (Email)
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="ضع بريد التواصل الرسمي هنا..."
                      dir="ltr"
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E5E8DD] space-y-4">
                  <div className="font-bold text-[#1B1F1C]">
                    روابط حسابات التواصل الاجتماعي (اختيارية)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block font-semibold text-[#52574E]">
                        رابط حساب X (تويتر)
                      </label>
                      <input
                        type="url"
                        value={contactTwitter}
                        onChange={(e) => setContactTwitter(e.target.value)}
                        placeholder="https://x.com/..."
                        dir="ltr"
                        className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-semibold text-[#52574E]">
                        رابط حساب إنستغرام (Instagram)
                      </label>
                      <input
                        type="url"
                        value={contactInstagram}
                        onChange={(e) => setContactInstagram(e.target.value)}
                        placeholder="https://instagram.com/..."
                        dir="ltr"
                        className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-semibold text-[#52574E]">
                        رابط حساب تيك توك (TikTok)
                      </label>
                      <input
                        type="url"
                        value={contactTiktok}
                        onChange={(e) => setContactTiktok(e.target.value)}
                        placeholder="https://tiktok.com/@..."
                        dir="ltr"
                        className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-semibold text-[#52574E]">
                        رابط حساب سناب شات (Snapchat)
                      </label>
                      <input
                        type="url"
                        value={contactSnapchat}
                        onChange={(e) => setContactSnapchat(e.target.value)}
                        placeholder="https://snapchat.com/add/..."
                        dir="ltr"
                        className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E5E8DD] flex justify-end">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="min-h-[44px] px-7 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center gap-2 cursor-pointer transition-colors"
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
            <div className="space-y-5">
              {/* Header & Subtitle */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[#1B1F1C] font-bold text-sm">
                    <Inbox className="w-5 h-5 text-[#F07842]" />
                    <span>مراجعة مساهمات اللاعبين والأسئلة المقترحة</span>
                  </div>
                  <p className="text-xs text-[#52574E]">
                    هنا تظهر الأسئلة التي اقترحها المستخدمون من خلال «قائمتي الخاصة». يمكنك مراجعتها واعتمادها أو رفضها مع ذكر السبب.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={loadContributions}
                  disabled={loadingContributions}
                  className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl border border-[#E5E8DD] bg-[#F3F5E9] hover:bg-[#E5E8DD] text-xs font-bold text-[#1B1F1C] flex items-center gap-2 cursor-pointer self-start md:self-auto shrink-0 transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 text-[#F07842] ${loadingContributions ? 'animate-spin' : ''}`}
                  />
                  <span>تحديث</span>
                </button>
              </div>

              {/* Filter Bar & Search */}
              <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setContributionFilter('all')}
                    className={`min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      contributionFilter === 'all'
                        ? 'bg-[#1B1F1C] text-white'
                        : 'bg-[#F3F5E9] text-[#52574E] hover:text-[#1B1F1C]'
                    }`}
                  >
                    الكل ({contributions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setContributionFilter('pending')}
                    className={`min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      contributionFilter === 'pending'
                        ? 'bg-[#F07842] text-white'
                        : 'bg-[#FEF2EC] text-[#D9602B] hover:bg-[#FDE4D7]'
                    }`}
                  >
                    <span>قيد المراجعة</span>
                    <span className="font-mono tabular-nums text-[11px]">
                      ({contributions.filter((c) => c.status === 'pending').length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContributionFilter('approved')}
                    className={`min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      contributionFilter === 'approved'
                        ? 'bg-[#14543D] text-white'
                        : 'bg-[#EAF2EE] text-[#14543D] hover:bg-[#D7E6DF]'
                    }`}
                  >
                    <span>معتمدة</span>
                    <span className="font-mono tabular-nums text-[11px]">
                      ({contributions.filter((c) => c.status === 'approved').length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setContributionFilter('rejected')}
                    className={`min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                      contributionFilter === 'rejected'
                        ? 'bg-rose-600 text-white'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                    }`}
                  >
                    <span>مرفوضة</span>
                    <span className="font-mono tabular-nums text-[11px]">
                      ({contributions.filter((c) => c.status === 'rejected').length})
                    </span>
                  </button>
                </div>

                {/* Search Input */}
                <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[240px]">
                  <Search className="w-4 h-4 text-[#52574E] absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={contributionSearch}
                    onChange={(e) => setContributionSearch(e.target.value)}
                    placeholder="ابحث بالنص، الإجابة، أو الكاتب..."
                    className="w-full min-h-[40px] pl-3 pr-9 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#1B1F1C] placeholder:text-[#52574E]/70 focus:outline-hidden focus:border-[#F07842]"
                  />
                </div>
              </div>

              {/* List of Contributions */}
              {loadingContributions ? (
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center text-xs text-[#52574E]">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#F07842] mb-2" />
                  <span>جاري تحميل المساهمات من Firestore...</span>
                </div>
              ) : filteredContributions.length === 0 ? (
                <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-12 text-center text-xs text-[#52574E] space-y-2">
                  <Inbox className="w-10 h-10 text-[#52574E]/40 mx-auto" />
                  <div className="font-bold text-[#1B1F1C] text-sm">
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
                      className="bg-[#FFFFFF] border border-[#E5E8DD] hover:border-[#F07842]/40 rounded-2xl p-5 transition-colors space-y-4"
                    >
                      {/* Top Bar: Author Info & Metadata */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E5E8DD]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-[#1B1F1C] text-white flex items-center justify-center text-xs font-bold">
                            {(item.userName || item.userEmail || 'م')[0].toUpperCase()}
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-bold text-[#1B1F1C]">
                              {item.userName || 'مستخدم مساهم'}
                            </div>
                            <div className="text-[11px] text-[#52574E] font-mono" dir="ltr">
                              {item.userEmail || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-[#1B1F1C]">
                            {item.mainCategory}
                          </span>
                          <span aria-hidden="true" className="text-[#E5E8DD]">·</span>
                          <span className="text-[#52574E]">{item.category}</span>
                          <span aria-hidden="true" className="text-[#E5E8DD]">·</span>
                          <span className="font-mono tabular-nums font-bold text-[#F07842]">
                            {item.points} نقطة
                          </span>
                          <span aria-hidden="true" className="text-[#E5E8DD]">·</span>

                          {item.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 font-bold text-[#D9602B]">
                              <Clock className="w-3.5 h-3.5" />
                              <span>قيد المراجعة</span>
                            </span>
                          )}
                          {item.status === 'approved' && (
                            <span className="inline-flex items-center gap-1 font-bold text-[#14543D]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>معتمد ومنشور</span>
                            </span>
                          )}
                          {item.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                              <XCircle className="w-3.5 h-3.5" />
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
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setPreviewContribution(item)}
                              className="absolute inset-0 bg-black/45 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-[11px] font-bold transition-opacity cursor-pointer"
                            >
                              تكبير الصورة
                            </button>
                          </div>
                        )}

                        <div className="flex-1 space-y-3 min-w-0">
                          <div>
                            <div className="text-[11px] font-bold text-[#52574E] mb-1">
                              نص السؤال:
                            </div>
                            <div className="text-sm font-bold text-[#1B1F1C] leading-relaxed">
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
                            <div className="flex flex-wrap gap-4 text-[11px] text-[#52574E]">
                              {item.explanation && (
                                <div>
                                  <span className="font-bold text-[#1B1F1C]">الشرح: </span>
                                  <span>{item.explanation}</span>
                                </div>
                              )}
                              {item.source && (
                                <div>
                                  <span className="font-bold text-[#1B1F1C]">المصدر: </span>
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
                        <div className="text-[11px] text-[#52574E] font-mono tabular-nums">
                          تاريخ الإرسال: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('ar-SA') : 'مؤخراً'}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewContribution(item)}
                            className="min-h-[44px] sm:min-h-[38px] px-3 py-1.5 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#1B1F1C] flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#F07842]" />
                            <span>معاينة</span>
                          </button>

                          {item.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenRejectModal(item)}
                                disabled={actionLoading}
                                className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleApproveContribution(item)}
                                disabled={actionLoading}
                                className="min-h-[44px] sm:min-h-[38px] px-4 py-1.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>اعتماد ونشر</span>
                              </button>
                            </>
                          )}

                          {item.status === 'rejected' && (
                            <button
                              type="button"
                              onClick={() => handleApproveContribution(item)}
                              disabled={actionLoading}
                              className="min-h-[44px] sm:min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#14543D] bg-[#FFFFFF] hover:bg-[#EAF2EE] text-xs font-bold text-[#14543D] flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>إعادة اعتماد</span>
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

      {/* SECTION 8: PER-PLAYER QUESTION DEDUP SETTINGS & SEEN HISTORY ANALYTICS */}
      {adminTab === 'question_dedup' && (
        <AdminSeenQuestionsSection
          adminUid={user?.uid || ''}
          isAdmin={isAdmin}
          questions={questions}
          subcategories={subcategories}
          questionDedupSettings={questionDedupSettings}
          onRefreshQuestionDedupSettings={async () => {
            if (onRefreshQuestionDedupSettings) {
              await onRefreshQuestionDedupSettings();
            }
          }}
        />
      )}

      {/* SECTION 9: VISUAL EFFECTS & ANIMATIONS ADMIN SETTINGS */}
      {adminTab === 'visual_effects' && (
        <AdminVisualEffectsSection
          adminUid={user?.uid || ''}
          isAdmin={isAdmin}
          visualEffectsSettings={visualEffectsSettings}
          onRefreshVisualEffectsSettings={async () => {
            if (onRefreshVisualEffectsSettings) {
              await onRefreshVisualEffectsSettings();
            }
          }}
        />
      )}

      {/* SECTION 10: WALA KALIMA QR WORD BANK & SETTINGS */}
      {adminTab === 'wala_kalima' && (
        <AdminWalaKalimaSection
          onSettingsUpdated={onWalaKalimaSettingsUpdated}
          walaKalimaCategory={walaKalimaMainCategory}
          comingSoonBusy={actionLoading}
          onToggleComingSoon={handleToggleMainCategoryComingSoon}
        />
      )}
        </div>
      </div>

      {/* MODAL 1: ADD / EDIT MAIN CATEGORY MODAL */}
      {mainModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={
            editingMainCategory
              ? `تعديل الفئة الرئيسية: ${editingMainCategory.name}`
              : 'إضافة فئة رئيسية جديدة'
          }
          onClick={() => {
            if (!actionLoading) setMainModalOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-[#1B1F1C] text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <h3 className="font-display text-base sm:text-lg font-bold">
                {editingMainCategory
                  ? `تعديل الفئة الرئيسية: ${editingMainCategory.name}`
                  : '+ إضافة فئة رئيسية جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setMainModalOpen(false)}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            <form
              onSubmit={handleSaveMainCategory}
              className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs"
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                {/* Right Column (Form Fields) */}
                <div className="md:col-span-7 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#1B1F1C]">
                      اسم الفئة
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={mainFormName}
                      onChange={(e) => setMainFormName(e.target.value)}
                      placeholder="مثال: عام، كرة قدم، علوم وتقنية..."
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-bold focus:outline-hidden focus:border-[#F07842]"
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
                    <label className="block font-bold text-[#1B1F1C]">
                      وصف الفئة
                    </label>
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={mainFormDescription}
                      onChange={(e) => setMainFormDescription(e.target.value)}
                      placeholder="وصف مختصر يظهر تحت اسم الفئة الرئيسية في الموقع..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block font-bold text-[#1B1F1C]">
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
                        className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-mono tabular-nums focus:outline-hidden focus:border-[#F07842]"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-bold text-[#1B1F1C]">
                        حالة الفئة (ظاهرة / مخفية)
                      </label>
                      <select
                        value={mainFormIsActive ? 'visible' : 'hidden'}
                        onChange={(e) =>
                          setMainFormIsActive(e.target.value === 'visible')
                        }
                        className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-semibold focus:outline-hidden focus:border-[#F07842]"
                      >
                        <option value="visible">ظاهرة في الموقع</option>
                        <option value="hidden">مخفية عن الألعاب الجديدة</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-bold text-[#1B1F1C]">
                      أيقونة الفئة (تظهر في أعمدة لوحة اللعب)
                    </label>
                    <select
                      value={mainFormIconName}
                      onChange={(e) =>
                        setMainFormIconName(
                          e.target.value as MainCategoryIconName
                        )
                      }
                      className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
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
                      <div className="font-bold text-[#1B1F1C] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#F07842]" />
                        <span>تفعيل وضع «قريباً» (تعطيل مؤقت دون حذف)</span>
                      </div>
                      <p className="text-[11px] text-[#52574E]">
                        تظهر البطاقة في الموقع بشارة «قريباً» ويُمنع اختيارها في المباريات مع بقاء جميع الأسئلة والصور محفوظة.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Left Column (Category Image + Live Card Preview) */}
                <div className="md:col-span-5 space-y-3">
                  <label className="block font-bold text-[#1B1F1C]">
                    صورة الفئة ومعاينة البطاقة
                  </label>

                  <div className="group relative aspect-square w-full rounded-2xl overflow-hidden border-2 border-[#E5E8DD] bg-[#1B1F1C] flex flex-col justify-end">
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
                        <span className="px-2 py-0.5 rounded-md bg-[#1B1F1C]/75 text-white font-mono text-[10px] font-bold">
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
                      className="flex-1 min-h-[44px] sm:min-h-[42px] py-2.5 px-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
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
                        className="min-w-[44px] min-h-[44px] sm:min-h-[42px] px-3 rounded-xl bg-[#F3F5E9] hover:bg-rose-50 text-rose-700 border border-[#E5E8DD] flex items-center justify-center cursor-pointer"
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
                    className="min-h-[44px] sm:min-h-[42px] px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف الفئة</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMainModalOpen(false)}
                    className="min-h-[44px] sm:min-h-[42px] px-5 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="min-h-[44px] sm:min-h-[42px] px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold cursor-pointer transition-colors"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={`معاينة الفئة الرئيسية: ${previewMainCategory.name}`}
          onClick={() => setPreviewMainCategory(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#F3F5E9] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-y-auto max-h-[94dvh] sm:max-h-[92dvh] shadow-2xl p-4 sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
              <div>
                <div className="text-[11px] font-bold text-[#F07842]">
                  معاينة حية لظهور الفئة في الموقع
                </div>
                <h3 className="font-display text-lg font-bold text-[#1B1F1C]">
                  {previewMainCategory.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMainCategory(null)}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 py-1.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] cursor-pointer"
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
                  <span className="px-2.5 py-1 rounded-lg bg-[#1B1F1C]/75 backdrop-blur-xs text-white font-mono tabular-nums text-[11px] font-bold">
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
                className="flex-1 min-h-[44px] sm:min-h-[42px] py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold cursor-pointer transition-colors"
              >
                تعديل هذه الفئة
              </button>
              <button
                type="button"
                onClick={() => setPreviewMainCategory(null)}
                className="min-h-[44px] sm:min-h-[42px] px-5 py-2.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={`تأكيد حذف الفئة الرئيسية ${deletingMainCategory.name}`}
          onClick={() => {
            if (!actionLoading) setDeletingMainCategory(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFFFF] border-2 border-rose-200 rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-y-auto max-h-[94dvh] sm:max-h-[92dvh] shadow-2xl p-4 sm:p-6 space-y-5 text-xs"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-[#1B1F1C]">
                  تأكيد حذف الفئة الرئيسية «{deletingMainCategory.name}»
                </h3>
                <p className="text-[#52574E] leading-relaxed">
                  هل أنت متأكد من رغبتك في حذف هذه الفئة الرئيسية؟
                </p>
              </div>
            </div>

            {(deletingMainSubs.length > 0 ||
              deletingMainQuestions.length > 0) && (
              <div className="bg-[#FEF2EC] border border-[#F07842] rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#D9602B]">
                  تنبيه حماية البيانات: تحتوي هذه الفئة على{' '}
                  <span className="font-mono tabular-nums">{deletingMainSubs.length}</span> فئة فرعية و{' '}
                  <span className="font-mono tabular-nums">{deletingMainQuestions.length}</span> سؤال مرتبط بها.
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
                        className="mt-0.5 accent-[#F07842]"
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
                            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-semibold"
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
                      className="mt-0.5 accent-rose-600"
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

            <div className="pt-3 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingMainCategory(null)}
                className="min-h-[44px] sm:min-h-[42px] px-5 py-2.5 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDeleteMainCategory}
                className="min-h-[44px] sm:min-h-[42px] px-6 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={
            editingSubcategory
              ? 'تعديل وتنظيم الفئة الفرعية'
              : 'إضافة فئة فرعية جديدة'
          }
          onClick={() => {
            if (!actionLoading) setSubModalOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-[#1B1F1C] text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <h3 className="font-display text-base sm:text-lg font-bold">
                {editingSubcategory
                  ? 'تعديل وتنظيم الفئة الفرعية'
                  : 'إضافة فئة فرعية جديدة'}
              </h3>
              <button
                type="button"
                onClick={() => setSubModalOpen(false)}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            <form
              onSubmit={handleSaveSubcategory}
              className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs"
            >
              {subModalFeedback && (
                <div
                  role={subModalFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold border flex items-center justify-between gap-2 ${
                    subModalFeedback.type === 'error'
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  <span>{subModalFeedback.text}</span>
                  <button
                    type="button"
                    onClick={() => setSubModalFeedback(null)}
                    className="text-[11px] underline shrink-0 cursor-pointer"
                  >
                    إخفاء
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block font-bold text-[#1B1F1C]">
                  الفئة الرئيسية التابعة لها (يمكنك نقل الفئة الفرعية لأي قسم رئيسي)
                </label>
                <select
                  value={subFormMainCategoryId}
                  onChange={(e) => setSubFormMainCategoryId(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-semibold focus:outline-hidden focus:border-[#F07842]"
                >
                  {sortedMainCategories.map((mc) => (
                    <option key={mc.id} value={mc.id}>
                      {mc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#1B1F1C]">
                  اسم الفئة الفرعية (تظهر كعمود في لوحة اللعب)
                </label>
                <input
                  type="text"
                  required
                  value={subFormName}
                  onChange={(e) => setSubFormName(e.target.value)}
                  placeholder="مثال: الدوري السعودي، كأس العالم، ون بيس..."
                  className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                />
                {editingSubcategory &&
                  editingSubcategory.name !== subFormName.trim() && (
                    <p className="text-[11px] text-[#F07842] font-semibold">
                      تنبيه: عند تغيير الاسم سيتم تلقائياً تحديث جميع الأسئلة المرتبطة بـ «{editingSubcategory.name}» إلى الاسم الجديد.
                    </p>
                  )}
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#1B1F1C]">
                  وصف مختصر للفئة الفرعية
                </label>
                <input
                  type="text"
                  value={subFormDescription}
                  onChange={(e) => setSubFormDescription(e.target.value)}
                  placeholder="وصف قصير يوضح محتوى الأسئلة داخل هذه الفئة..."
                  className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
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
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-mono tabular-nums focus:outline-hidden focus:border-[#F07842]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
                    حالة الظهور للاعبين
                  </label>
                  <select
                    value={subFormIsActive ? 'active' : 'hidden'}
                    onChange={(e) =>
                      setSubFormIsActive(e.target.value === 'active')
                    }
                    className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
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
                  <div className="font-bold text-[#1B1F1C] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#F07842]" />
                    <span>تفعيل وضع «قريباً» لهذه الفئة الفرعية</span>
                  </div>
                  <p className="text-[11px] text-[#52574E]">
                    تظهر بشارة «قريباً» وتُمنع من اللعب مؤقتاً مع الحفاظ على جميع أسئلتها وصورتها.
                  </p>
                </div>
              </label>

              {/* Subcategory Image Upload in Modal */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-[#1B1F1C]">
                    صورة الفئة الفرعية
                  </label>
                  {subFormImageUrl ? (
                    <span className="text-[11px] font-bold text-[#14543D] inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>مرتبطة بالصورة</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-[#52574E]">
                      بدون صورة مخصصة
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-[#F3F5E9]/70 border border-[#E5E8DD]">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-[#E5E8DD] bg-[#1B1F1C] shrink-0">
                    <CategoryCardArtwork
                      name={subFormName || 'فئة فرعية'}
                      mainCategory={
                        sortedMainCategories.find(
                          (m) => m.id === subFormMainCategoryId
                        )?.name
                      }
                      imageUrl={subFormImageUrl}
                    />
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() =>
                          triggerSelectCategoryImage({
                            kind: 'sub_draft',
                            subCat: editingSubcategory || undefined,
                          })
                        }
                        className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {subFormImageUrl
                            ? 'تغيير الصورة من الجهاز'
                            : 'اختيار صورة من الجهاز'}
                        </span>
                      </button>
                      {subFormImageUrl && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => {
                            setSubFormImageUrl('');
                            setSubModalFeedback(null);
                          }}
                          className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] hover:bg-rose-50 text-rose-700 font-bold cursor-pointer"
                        >
                          إزالة الصورة
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-[#52574E] leading-relaxed">
                      الصيغ المدعومة: JPG, JPEG, PNG, WEBP · الحد الأقصى 5 ميجابايت · تُقص وتُرفع إلى Cloudinary ثم تُربط بالفئة عند الحفظ.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSubModalOpen(false)}
                  className="min-h-[44px] sm:min-h-[42px] px-4 py-2.5 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="min-h-[44px] sm:min-h-[42px] px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold cursor-pointer transition-colors"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={`تأكيد حذف الفئة الفرعية ${deletingSubcategory.name}`}
          onClick={() => {
            if (!actionLoading) setDeletingSubcategory(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFFFF] border-2 border-rose-200 rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-y-auto max-h-[94dvh] sm:max-h-[92dvh] shadow-2xl p-4 sm:p-6 space-y-5 text-xs"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-[#1B1F1C]">
                  تأكيد حذف الفئة الفرعية «{deletingSubcategory.name}»
                </h3>
                <p className="text-[#52574E] leading-relaxed">
                  هل أنت متأكد من حذف هذه الفئة الفرعية؟
                </p>
              </div>
            </div>

            {deletingSubQuestions.length > 0 && (
              <div className="bg-[#FEF2EC] border border-[#F07842] rounded-xl p-4 space-y-3">
                <div className="font-bold text-[#D9602B]">
                  تنبيه: تحتوي هذه الفئة الفرعية على{' '}
                  <span className="font-mono tabular-nums">{deletingSubQuestions.length}</span> سؤال في قاعدة البيانات.
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
                        className="mt-0.5 accent-[#F07842]"
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
                            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] font-semibold"
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
                      className="mt-0.5 accent-[#F07842]"
                    />
                    <div className="font-bold text-[#1B1F1C]">
                      حذف الفئة الفرعية فقط والاحتفاظ بالأسئلة في بنك الأسئلة
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] cursor-pointer">
                    <input
                      type="radio"
                      name="deleteSubMode"
                      checked={deleteSubMode === 'delete_questions'}
                      onChange={() => setDeleteSubMode('delete_questions')}
                      className="mt-0.5 accent-rose-600"
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

            <div className="pt-3 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingSubcategory(null)}
                className="min-h-[44px] sm:min-h-[42px] px-5 py-2.5 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDeleteSubcategory}
                className="min-h-[44px] sm:min-h-[42px] px-6 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={editingQuestionId ? 'تعديل بيانات السؤال' : 'إضافة سؤال جديد'}
          onClick={() => {
            if (!actionLoading) handleCloseQuestionModal();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-[#1B1F1C] text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <h3 className="font-display text-base sm:text-lg font-bold">
                {editingQuestionId ? 'تعديل بيانات السؤال' : 'إضافة سؤال جديد'}
              </h3>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleCloseQuestionModal}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            <form
              onSubmit={handleSaveQuestion}
              className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs"
            >
              {questionModalError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
                  <div className="flex items-start gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{questionModalError}</span>
                  </div>
                  {(pendingQuestionImageFile || pendingQuestionAudioFile) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rose-200/70 text-[11px]">
                      <span>
                        بيانات السؤال النصية محفوظة بالكامل. يمكنك إعادة المحاولة أو إزالة الملف المعلق وحفظ السؤال.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (pendingQuestionImageFile) handleRemoveQuestionImage();
                          if (pendingQuestionAudioFile) handleRemoveQuestionAudio();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 text-rose-700 font-bold hover:bg-rose-100 cursor-pointer shrink-0"
                      >
                        إزالة الملف المعلق
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Question Media Type Selector */}
              <div className="space-y-1.5">
                <label className="block font-bold text-[#1B1F1C]">
                  نوع السؤال
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      setFormMediaType('text');
                      setQuestionModalError(null);
                    }}
                    className={`px-3 py-2.5 min-h-[44px] sm:min-h-[42px] rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                      formMediaType === 'text'
                        ? 'bg-[#1B1F1C] text-white border-[#1B1F1C]'
                        : 'bg-[#F3F5E9] text-[#1B1F1C] border-[#E5E8DD] hover:border-[#1B1F1C]/40'
                    }`}
                  >
                    <FileQuestion className="w-4 h-4 shrink-0" />
                    <span>سؤال نصي عادي</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      setFormMediaType('image');
                      setQuestionModalError(null);
                    }}
                    className={`px-3 py-2.5 min-h-[44px] sm:min-h-[42px] rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                      formMediaType === 'image'
                        ? 'bg-[#F07842] text-white border-[#F07842]'
                        : 'bg-[#F3F5E9] text-[#1B1F1C] border-[#E5E8DD] hover:border-[#F07842]/40'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>سؤال بصورة</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      setFormMediaType('audio');
                      setQuestionModalError(null);
                    }}
                    className={`px-3 py-2.5 min-h-[44px] sm:min-h-[42px] rounded-xl border text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                      formMediaType === 'audio'
                        ? 'bg-[#14543D] text-white border-[#14543D]'
                        : 'bg-[#F3F5E9] text-[#1B1F1C] border-[#E5E8DD] hover:border-[#14543D]/40'
                    }`}
                  >
                    <Volume2 className="w-4 h-4 text-[#F07842] shrink-0" />
                    <span>سؤال صوتي</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
                    الفئة الفرعية
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
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
                  <label className="block font-bold text-[#1B1F1C]">
                    مستوى الصعوبة والنقاط
                  </label>
                  <select
                    value={formPoints}
                    onChange={(e) => {
                      const pts = Number(e.target.value) as PointValue;
                      setFormPoints(pts);
                      setFormDifficulty(POINT_TO_DIFFICULTY[pts]);
                    }}
                    className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
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
                <label className="block font-bold text-[#1B1F1C]">
                  نص السؤال المباشر
                </label>
                <textarea
                  rows={3}
                  required
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  placeholder={
                    formMediaType === 'image'
                      ? 'مثال: لمن يعود هذا الشعار؟ أو ما اسم المعلم الظاهر في الصورة؟'
                      : formMediaType === 'audio'
                      ? 'مثال: استمع إلى المقطع الصوتي وتعرّف على الصوت أو صاحب النشيد...'
                      : 'اكتب السؤال المباشر بصياغة عربية واضحة ومكتملة بدون الحاجة لخيارات...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                />
              </div>

              {/* Image Upload & Live Preview Section (Shown when mediaType === 'image') */}
              {formMediaType === 'image' && (
                <div className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#1B1F1C] flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-[#F07842]" />
                        <span>صورة السؤال (مطلوبة لسؤال الصورة)</span>
                      </div>
                      <p className="text-[11px] text-[#52574E]">
                        الصيغ المدعومة: JPG وPNG وWEBP · الحد الأقصى للحجم: 5 ميجابايت · أو أدخل رابط صورة HTTPS موثوق.
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
                        className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center gap-1.5 cursor-pointer"
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
                          className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>إزالة الصورة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!pendingQuestionImageFile && (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#52574E]">
                        أو رابط صورة موثوق (HTTPS):
                      </label>
                      <input
                        type="url"
                        dir="ltr"
                        value={formImageUrl}
                        onChange={(e) => {
                          setFormImageUrl(e.target.value);
                          setFormImageStoragePath('');
                        }}
                        placeholder="https://..."
                        className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                      />
                    </div>
                  )}

                  {(pendingQuestionImagePreviewUrl || formImageUrl) && (
                    <div className="space-y-3 pt-2 border-t border-[#E5E8DD]">
                      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl p-3 flex flex-col items-center gap-2">
                        <div className="w-full flex items-center justify-between text-[11px] text-[#52574E]">
                          <span className="font-semibold text-[#14543D]">
                            معاينة الصورة قبل الحفظ:
                          </span>
                          <span className="font-mono">
                            {pendingQuestionImageFile
                              ? `ملف جديد: ${pendingQuestionImageFile.name} (${(
                                  pendingQuestionImageFile.size /
                                  (1024 * 1024)
                                ).toFixed(2)} MB)`
                              : 'رابط صورة محفوظ'}
                          </span>
                        </div>
                        <img
                          src={pendingQuestionImagePreviewUrl || formImageUrl}
                          alt={
                            formImageDescription ||
                            'معاينة صورة السؤال قبل الحفظ'
                          }
                          referrerPolicy="no-referrer"
                          className="max-h-52 w-auto max-w-full object-contain rounded-lg border border-[#E5E8DD]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block font-bold text-[#1B1F1C]">
                          وصف الصورة (اختياري — لا يظهر قبل الإجابة إذا كان يكشف الحل)
                        </label>
                        <input
                          type="text"
                          value={formImageDescription}
                          onChange={(e) =>
                            setFormImageDescription(e.target.value)
                          }
                          placeholder="وصف بديل مختصر للصورة..."
                          className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#1B1F1C]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Audio Upload, Preview & Max Plays Section (Shown when mediaType === 'audio') */}
              {formMediaType === 'audio' && (
                <div className="bg-[#F3F5E9]/70 border border-[#E5E8DD] rounded-2xl p-4 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#1B1F1C] flex items-center gap-1.5">
                        <Volume2 className="w-4 h-4 text-[#14543D]" />
                        <span>المقطع الصوتي للسؤال (مطلوب للسؤال الصوتي)</span>
                      </div>
                      <p className="text-[11px] text-[#52574E]">
                        الصيغ المدعومة: MP3 وWAV وOGG وM4A وAAC وWEBM · الحد الأقصى: 10 ميجابايت · لا يظهر اسم الملف للاعبين.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        ref={questionAudioInputRef}
                        type="file"
                        accept=".mp3,.wav,.ogg,.m4a,.aac,.webm,audio/*"
                        onChange={handleQuestionAudioFileChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => questionAudioInputRef.current?.click()}
                        className="min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>
                          {pendingQuestionAudioPreviewUrl || formAudioUrl
                            ? 'تغيير المقطع'
                            : 'رفع ملف صوتي'}
                        </span>
                      </button>

                      {(pendingQuestionAudioPreviewUrl || formAudioUrl) && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={handleRemoveQuestionAudio}
                          className="min-h-[44px] sm:min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>إزالة المقطع</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!pendingQuestionAudioFile && (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-[#52574E]">
                        أو رابط صوتي موثوق (HTTPS):
                      </label>
                      <input
                        type="url"
                        dir="ltr"
                        value={formAudioUrl}
                        onChange={(e) => {
                          setFormAudioUrl(e.target.value);
                          setFormAudioStoragePath('');
                        }}
                        placeholder="https://..."
                        className="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-[#1B1F1C] text-left font-mono"
                      />
                    </div>
                  )}

                  {(pendingQuestionAudioPreviewUrl || formAudioUrl) && (
                    <div className="space-y-2 pt-2 border-t border-[#E5E8DD]">
                      <div className="flex items-center justify-between text-[11px] text-[#52574E]">
                        <span className="font-semibold text-[#14543D]">
                          معاينة المقطع الصوتي قبل الحفظ:
                        </span>
                        <span className="font-mono">
                          {pendingQuestionAudioFile
                            ? `ملف جديد (${(
                                pendingQuestionAudioFile.size /
                                (1024 * 1024)
                              ).toFixed(2)} MB)`
                            : 'ملف صوتي محفوظ'}
                        </span>
                      </div>
                      <QuestionAudioPlayer
                        audioUrl={pendingQuestionAudioPreviewUrl || formAudioUrl}
                        maxPlays={formAudioMaxPlays}
                        previewMode
                        questionKey={`admin_preview_${editingQuestionId || 'new'}`}
                      />
                    </div>
                  )}

                  {/* Configurable Max Play Count */}
                  <div className="pt-2 border-t border-[#E5E8DD] space-y-2">
                    <label className="block font-bold text-[#1B1F1C]">
                      عدد مرات تشغيل المقطع المسموحة لكل سؤال
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { label: 'غير محدود', value: null },
                        { label: 'مرة واحدة (1)', value: 1 },
                        { label: 'مرتان (2)', value: 2 },
                        { label: '3 مرات', value: 3 },
                      ].map((opt) => {
                        const isSelected = formAudioMaxPlays === opt.value;
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            onClick={() => setFormAudioMaxPlays(opt.value)}
                            className={`min-h-[44px] sm:min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[#F07842] text-white border-[#F07842]'
                                : 'bg-[#FFFFFF] text-[#1B1F1C] border-[#E5E8DD] hover:border-[#F07842]/50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}

                      <div className="flex items-center gap-1.5 mr-auto">
                        <span className="text-[11px] text-[#52574E]">مخصص:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          placeholder="—"
                          value={formAudioMaxPlays ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              setFormAudioMaxPlays(null);
                            } else {
                              setFormAudioMaxPlays(normalizeAudioMaxPlays(val));
                            }
                          }}
                          className="w-16 min-h-[36px] px-2 py-1.5 rounded-lg bg-[#FFFFFF] border border-[#E5E8DD] text-center font-mono tabular-nums text-xs text-[#1B1F1C]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
                    الإجابة الصحيحة المعتمدة
                  </label>
                  <input
                    type="text"
                    required
                    value={formCorrectAnswer}
                    onChange={(e) => setFormCorrectAnswer(e.target.value)}
                    placeholder="اكتب الإجابة الصحيحة..."
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
                    حالة الاعتماد
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as ApprovalStatus)
                    }
                    className="w-full min-h-[42px] px-3 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                  >
                    <option value="approved">معتمد (يظهر في اللعب)</option>
                    <option value="pending">قيد المراجعة</option>
                    <option value="rejected">مرفوض</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
                    شرح مختصر للمعلومة (اختياري)
                  </label>
                  <input
                    type="text"
                    value={formExplanation}
                    onChange={(e) => setFormExplanation(e.target.value)}
                    placeholder="توضيح يظهر بعد كشف الإجابة..."
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-[#1B1F1C]">
                    المصدر أو المرجع (اختياري)
                  </label>
                  <input
                    type="text"
                    value={formSource}
                    onChange={(e) => setFormSource(e.target.value)}
                    placeholder="مثال: دارة الملك عبدالعزيز، موسوعة..."
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] focus:outline-hidden focus:border-[#F07842]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleCloseQuestionModal}
                  className="min-h-[44px] sm:min-h-[42px] px-4 py-2.5 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-semibold cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="min-h-[44px] sm:min-h-[42px] px-6 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading
                    ? pendingQuestionImageFile
                      ? 'جاري رفع الصورة وحفظ السؤال...'
                      : pendingQuestionAudioFile
                      ? 'جاري رفع المقطع الصوتي وحفظ السؤال...'
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="رفض مساهمة السؤال"
          onClick={() => {
            if (!actionLoading) setRejectModalContribution(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-rose-700 text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm">
                <XCircle className="w-4 h-4" />
                <span>رفض مساهمة السؤال</span>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalContribution(null)}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-[#F3F5E9] p-3 rounded-xl border border-[#E5E8DD] space-y-1">
                <div className="font-bold text-[#1B1F1C]">السؤال:</div>
                <div className="text-[#52574E] line-clamp-2">
                  {rejectModalContribution.questionText}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-[#1B1F1C]">
                  سبب الرفض (سيظهر للمستخدم في قائمته الخاصة لمساعدته في التعديل):
                </label>
                <textarea
                  rows={3}
                  value={rejectReasonText}
                  onChange={(e) => setRejectReasonText(e.target.value)}
                  placeholder="مثال: السؤال مكرر، أو الإجابة بحاجة لتدقيق، أو التصنيف غير مناسب..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-[#1B1F1C] leading-relaxed resize-none focus:outline-hidden focus:border-rose-600"
                />
              </div>

              <div className="pt-3 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRejectModalContribution(null)}
                  className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReject}
                  disabled={actionLoading}
                  className="min-h-[44px] sm:min-h-[42px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer transition-colors"
                >
                  {actionLoading ? 'جاري الحفظ...' : 'تأكيد الرفض'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PREVIEW QUESTION IN GAME BOARD (CONTRIBUTION) */}
      {previewContribution && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة السؤال كما يظهر في لوحة المنافسة"
          onClick={() => setPreviewContribution(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-[#1B1F1C] text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Eye className="w-4 h-4 text-[#F07842]" />
                <span>معاينة السؤال كما يظهر في لوحة المنافسة</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewContribution(null)}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-right">
              <div className="flex items-center justify-between bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl px-4 py-2.5 text-xs">
                <div className="font-bold text-[#1B1F1C]">
                  {previewContribution.mainCategory} · {previewContribution.category}
                </div>
                <div className="font-mono tabular-nums font-bold text-[#F07842] text-sm">
                  {previewContribution.points} نقطة
                </div>
              </div>

              <div className="border-2 border-[#E5E8DD] rounded-2xl p-6 bg-[#FFFFFF] shadow-xs space-y-4 text-center">
                {previewContribution.imageUrl && (
                  <div className="w-full max-h-64 rounded-xl overflow-hidden bg-[#F3F5E9] border border-[#E5E8DD] mx-auto">
                    <img
                      src={previewContribution.imageUrl}
                      alt="صورة السؤال"
                      referrerPolicy="no-referrer"
                      className="w-full h-full max-h-64 object-contain"
                    />
                  </div>
                )}

                <div className="font-bold text-lg text-[#1B1F1C] leading-relaxed py-2">
                  {previewContribution.questionText}
                </div>

                <div className="border-t border-[#E5E8DD] pt-4 text-right space-y-2">
                  <div className="text-xs font-bold text-[#14543D]">الإجابة الصحيحة:</div>
                  <div className="bg-[#EAF2EE] border border-[#14543D]/20 rounded-xl p-3 text-sm font-bold text-[#14543D]">
                    {previewContribution.correctAnswer}
                  </div>
                </div>

                {previewContribution.explanation && (
                  <div className="text-right text-xs text-[#52574E] bg-[#F3F5E9] p-3 rounded-xl">
                    <span className="font-bold text-[#1B1F1C]">الشرح: </span>
                    {previewContribution.explanation}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewContribution(null)}
                  className="min-h-[44px] sm:min-h-[42px] px-6 py-2 rounded-xl bg-[#1B1F1C] hover:bg-[#2F3531] text-white font-bold text-xs cursor-pointer"
                >
                  إغلاق المعاينة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QUESTION BANK PREVIEW MODAL */}
      {previewQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/75 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة السؤال والإجابة"
          onClick={() => setPreviewQuestion(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-[#1B1F1C] text-white px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Eye className="w-4 h-4 text-[#F07842]" />
                <span>معاينة السؤال والإجابة</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQuestion(null)}
                className="min-h-[44px] sm:min-h-[38px] px-3.5 sm:px-3 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>إغلاق</span>
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-right text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl px-4 py-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-[#1B1F1C] text-sm">
                    {previewQuestion.category}
                  </div>
                  <div className="text-[11px] text-[#52574E]">
                    {subcategoryToMainMap.get(previewQuestion.category) || 'فئة عامة'} ·{' '}
                    {previewQuestion.difficulty}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums font-bold text-[#F07842] text-sm">
                    {previewQuestion.points} نقطة
                  </span>
                  {previewQuestion.status === 'approved' && (
                    <span className="inline-flex items-center gap-1 font-bold text-[#14543D]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>معتمد</span>
                    </span>
                  )}
                  {previewQuestion.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 font-bold text-[#D9602B]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>قيد المراجعة</span>
                    </span>
                  )}
                  {previewQuestion.status === 'rejected' && (
                    <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>مرفوض</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-[#E5E8DD] rounded-2xl p-5 bg-[#FFFFFF] space-y-4">
                {inferQuestionMediaType(previewQuestion) === 'image' &&
                  previewQuestion.imageUrl && (
                    <div className="w-full max-h-64 rounded-xl overflow-hidden bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-center">
                      <img
                        src={previewQuestion.imageUrl}
                        alt={previewQuestion.imageDescription || 'صورة السؤال'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full max-h-64 object-contain"
                      />
                    </div>
                  )}

                {inferQuestionMediaType(previewQuestion) === 'audio' &&
                  previewQuestion.audioUrl && (
                    <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3">
                      <QuestionAudioPlayer
                        audioUrl={previewQuestion.audioUrl}
                        maxPlays={previewQuestion.audioMaxPlays ?? null}
                        previewMode
                        questionKey={`bank_preview_${previewQuestion.id}`}
                      />
                    </div>
                  )}

                <div className="font-display font-bold text-base sm:text-lg text-[#1B1F1C] leading-relaxed text-center py-1">
                  {previewQuestion.questionText}
                </div>

                <div className="border-t border-[#E5E8DD] pt-4 space-y-1.5">
                  <div className="font-bold text-[#14543D]">الإجابة الصحيحة:</div>
                  <div className="bg-[#EAF2EE] border border-[#C5DDD1] rounded-xl p-3.5 text-sm font-bold text-[#14543D]">
                    {previewQuestion.correctAnswer}
                  </div>
                </div>

                {(previewQuestion.explanation || previewQuestion.source) && (
                  <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3.5 space-y-1 text-[#52574E]">
                    {previewQuestion.explanation && (
                      <div>
                        <strong className="text-[#1B1F1C]">التوضيح: </strong>
                        {previewQuestion.explanation}
                      </div>
                    )}
                    {previewQuestion.source && (
                      <div>
                        <strong className="text-[#1B1F1C]">المصدر: </strong>
                        {previewQuestion.source}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-[#E5E8DD] flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const target = previewQuestion;
                      setPreviewQuestion(null);
                      openEditModal(target);
                    }}
                    className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل السؤال</span>
                  </button>
                  {previewQuestion.status !== 'approved' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => {
                        const targetId = previewQuestion.id;
                        setPreviewQuestion(null);
                        handleSingleStatusChange(targetId, 'approved');
                      }}
                      className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد</span>
                    </button>
                  )}
                  {previewQuestion.status !== 'rejected' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => {
                        const targetId = previewQuestion.id;
                        setPreviewQuestion(null);
                        handleSingleStatusChange(targetId, 'rejected');
                      }}
                      className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#FEF2EC] border border-[#F07842]/40 text-[#D9602B] hover:bg-[#FDE4D7] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>رفض</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewQuestion(null)}
                  className="min-h-[44px] sm:min-h-[42px] px-5 py-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] font-bold cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM BULK STATUS UPDATE */}
      {bulkStatusConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label={
            bulkStatusConfirmModal.status === 'approved'
              ? 'تأكيد الاعتماد الجماعي للأسئلة'
              : 'تأكيد الرفض الجماعي للأسئلة'
          }
          onClick={() => {
            if (!actionLoading) setBulkStatusConfirmModal(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div
              className={`px-5 py-4 flex items-center justify-between text-white shrink-0 ${
                bulkStatusConfirmModal.status === 'approved'
                  ? 'bg-[#14543D]'
                  : 'bg-[#F07842]'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                {bulkStatusConfirmModal.status === 'approved' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                <span>
                  {bulkStatusConfirmModal.status === 'approved'
                    ? 'تأكيد الاعتماد الجماعي للأسئلة'
                    : 'تأكيد الرفض الجماعي للأسئلة'}
                </span>
              </div>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setBulkStatusConfirmModal(null)}
                className="min-h-[44px] sm:min-h-[36px] px-3 sm:px-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs text-right overflow-y-auto">
              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-4 space-y-1.5">
                <div className="font-bold text-[#1B1F1C] text-sm">
                  {bulkStatusConfirmModal.status === 'approved'
                    ? 'سيتم اعتماد الأسئلة المحددة وإتاحتها في المباريات:'
                    : 'سيتم تغيير حالة الأسئلة المحددة إلى مرفوض:'}
                </div>
                <div className="text-[#52574E]">
                  عدد الأسئلة المشمولة بالإجراء:{' '}
                  <strong className="font-mono tabular-nums text-sm text-[#1B1F1C]">
                    {bulkStatusConfirmModal.ids.length}
                  </strong>{' '}
                  سؤال
                </div>
              </div>

              <div className="pt-2 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setBulkStatusConfirmModal(null)}
                  className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={executeConfirmedBulkStatus}
                  className={`min-h-[44px] sm:min-h-[42px] px-5 py-2 rounded-xl text-white font-bold cursor-pointer disabled:opacity-60 transition-colors ${
                    bulkStatusConfirmModal.status === 'approved'
                      ? 'bg-[#14543D] hover:bg-[#0E3F2D]'
                      : 'bg-[#F07842] hover:bg-[#D9632E]'
                  }`}
                >
                  {actionLoading
                    ? 'جاري التنفيذ...'
                    : bulkStatusConfirmModal.status === 'approved'
                    ? `تأكيد اعتماد (${bulkStatusConfirmModal.ids.length})`
                    : `تأكيد رفض (${bulkStatusConfirmModal.ids.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM QUESTION(S) PERMANENT DELETE */}
      {deleteConfirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#1B1F1C]/70 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="تأكيد الحذف النهائي للأسئلة"
          onClick={() => {
            if (!actionLoading) {
              setDeleteConfirmModal(null);
              setDeleteModalError(null);
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#FFFFFF] border border-[#E5E8DD] rounded-t-3xl rounded-b-none sm:rounded-2xl overflow-hidden shadow-2xl max-h-[94dvh] sm:max-h-[92dvh] flex flex-col"
          >
            <div className="bg-rose-700 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>تأكيد الحذف النهائي للأسئلة</span>
              </div>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => {
                  setDeleteConfirmModal(null);
                  setDeleteModalError(null);
                }}
                className="min-h-[44px] sm:min-h-[36px] px-3 sm:px-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 text-xs text-right overflow-y-auto">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-1.5">
                <div className="font-bold text-rose-900 text-sm">
                  {deleteConfirmModal.scopeLabel}
                </div>
                <div className="text-rose-800">
                  عدد الأسئلة التي سيتم حذفها نهائياً:{' '}
                  <strong className="font-mono tabular-nums text-sm">
                    {deleteConfirmModal.ids.length}
                  </strong>{' '}
                  سؤال
                </div>
              </div>

              {deleteConfirmModal.previewText && (
                <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3 text-[#1B1F1C]">
                  <span className="font-bold">نص السؤال: </span>
                  {deleteConfirmModal.previewText}
                </div>
              )}

              <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-3.5 text-[#52574E] space-y-1 leading-relaxed">
                <div className="font-bold text-[#1B1F1C]">نطاق الحماية والحذف:</div>
                <div>• سيتم حذف مستندات هذه الأسئلة من Firestore ومنع عودة أسئلة البنك المدمج المحذوفة عند تحديث الصفحة.</div>
                <div>• لن يتم حذف أي فئة رئيسية أو فرعية، ولا صور Cloudinary، ولا بيانات المباريات أو المستخدمين.</div>
              </div>

              {deleteModalError && (
                <div className="bg-rose-50 border border-rose-300 text-rose-800 rounded-xl p-3 font-semibold">
                  {deleteModalError}
                </div>
              )}

              <div className="pt-2 border-t border-[#E5E8DD] flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setDeleteConfirmModal(null);
                    setDeleteModalError(null);
                  }}
                  className="min-h-[44px] sm:min-h-[42px] px-4 py-2 rounded-xl bg-[#F3F5E9] text-[#1B1F1C] font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleExecuteConfirmedDelete}
                  className="min-h-[44px] sm:min-h-[42px] px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer disabled:opacity-60"
                >
                  {actionLoading
                    ? 'جاري تنفيذ الحذف...'
                    : `تأكيد حذف (${deleteConfirmModal.ids.length})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
