import { PointValue, QuestionMediaType, TeamConfig } from './game';

export type MatchStatus = 'in_progress' | 'completed' | 'abandoned';
export type MatchMode = 'local' | 'online';

export interface ActiveQuestionSavedState {
  tileKey: string;
  subcategoryId?: string;
  subcategoryName: string;
  mainCategoryName: string;
  points: PointValue;
  questionId: string;
  questionText: string;
  correctAnswer: string;
  mediaType?: QuestionMediaType;
  imageUrl?: string;
  imageDescription?: string;
  audioUrl?: string;
  audioMaxPlays?: number | null;
  audioPlaysUsed?: number;
  explanation?: string;
  answerRevealed: boolean;
  timeLeft: number;
  timerPaused?: boolean;
}

export interface UserGameMatch {
  id: string;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  matchTitle?: string;
  status: MatchStatus;
  mode: MatchMode;
  roomCode?: string;
  activePage?: 'categories' | 'setup' | 'board' | 'results' | string;
  isGameLocked?: boolean;
  teams: TeamConfig[];
  teamSubcategoryIds?: Record<string, string[]>;
  selectedSubcategories: string[];
  orderedTeamSelections?: any[];
  timerDuration?: number;
  activeTeamIndex: number;
  usedTileKeys: string[];
  roundUsedQuestionIds?: string[];
  activeQuestionState?: ActiveQuestionSavedState | null;
  winnerTeamName?: string;
  winnerScore?: number;
  totalQuestionsPlayed?: number;
  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;
}
