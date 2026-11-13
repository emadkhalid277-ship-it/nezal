export type PageView =
  | 'home'
  | 'categories'
  | 'setup'
  | 'board'
  | 'results'
  | 'admin'
  | 'contact'
  | 'my_lists'
  | 'online_multiplayer'
  | 'my_matches'
  | 'friends';

export type MainCategoryName = string;

export type CategoryName = string;

export type DifficultyLevel = 'سهل' | 'متوسط' | 'صعب' | 'صعب جداً' | 'خبير';

export type PointValue = 100 | 200 | 300 | 400 | 500;

export type QuestionType = 'direct' | 'mcq';

export type ApprovalStatus = 'approved' | 'pending' | 'rejected';

export type MainCategoryIconName =
  | 'compass'
  | 'football'
  | 'trophy'
  | 'moon'
  | 'globe'
  | 'sparkles'
  | 'gamepad';

export interface SubcategoryItem {
  id: string;
  name: string;
  mainCategoryId: string;
  mainCategory: MainCategoryName;
  description: string;
  sortOrder: number;
  isActive: boolean;
  isComingSoon?: boolean;
  isDeleted?: boolean;
  imageUrl?: string;
  authorId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MainCategoryMeta {
  id: string;
  name: MainCategoryName;
  tagline: string;
  description: string;
  accentColor: string;
  bgTint: string;
  borderTint: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  isComingSoon?: boolean;
  isDeleted?: boolean;
  iconName: MainCategoryIconName;
  updatedBy?: string;
  updatedAt?: string;
}

export interface ContactSettings {
  id: string;
  heading: string;
  message: string;
  whatsappUrl: string;
  whatsappDisplay: string;
  emailAddress: string;
  twitterUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  snapchatUrl: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface TriviaQuestion {
  id: string;
  subcategoryId?: string;
  category: string; // Subcategory name
  questionText: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  points: PointValue;
  options: string[];
  correctAnswer: string;
  explanation: string;
  source: string;
  status: ApprovalStatus;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
  authorId: string;
  createdAt: string;
  reviewedAt: string;
}

export interface TeamConfig {
  id: string;
  name: string;
  color: string;
  players: string[];
  score: number;
}

export const POINT_TO_DIFFICULTY: Record<PointValue, DifficultyLevel> = {
  100: 'سهل',
  200: 'متوسط',
  300: 'صعب',
  400: 'صعب جداً',
  500: 'خبير',
};

export const DIFFICULTY_TO_POINTS: Record<DifficultyLevel, PointValue> = {
  سهل: 100,
  متوسط: 200,
  صعب: 300,
  'صعب جداً': 400,
  خبير: 500,
};

export const SUBCATEGORIES_PER_TEAM = 3;
export const TARGET_QUESTIONS_PER_CATEGORY = 25;
export const TARGET_TOTAL_QUESTIONS = 1975;
export const DEFAULT_BRAND_NAME = 'نِزال';

export interface UserQuestionList {
  id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContributionStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface UserCustomQuestion {
  id: string;
  listId: string;
  userId: string;
  mainCategoryId: string;
  mainCategory: string;
  subcategoryId: string;
  category: string;
  questionText: string;
  correctAnswer: string;
  points: PointValue;
  difficulty: DifficultyLevel;
  explanation?: string;
  source?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
  contributionStatus: ContributionStatus;
  contributionId?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserContribution {
  id: string;
  originalQuestionId: string;
  originalListId: string;
  userId: string;
  userName: string;
  userEmail: string;
  mainCategoryId: string;
  mainCategory: string;
  subcategoryId: string;
  category: string;
  questionText: string;
  correctAnswer: string;
  points: PointValue;
  difficulty: DifficultyLevel;
  explanation?: string;
  source?: string;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  publishedQuestionId?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}


