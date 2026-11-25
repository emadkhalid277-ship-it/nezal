import { QuestionMediaType } from './game';

export type RoomStatus =
  | 'waiting_for_opponent'
  | 'selecting_categories'
  | 'ready'
  | 'playing'
  | 'completed'
  // Aliases for backwards compatibility:
  | 'lobby'
  | 'waiting'
  | 'in_game'
  | 'finished';

export type PlayerConnectionStatus = 'online' | 'connecting' | 'offline';

export interface RoomPlayer {
  id: string;
  name: string;
  teamId: string | null;
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
  connectionStatus: PlayerConnectionStatus;
  userId?: string | null;
  avatarColor?: string;
}

export interface RoomSpectator {
  id: string;
  name: string;
  userId?: string | null;
  joinedAt: number;
  lastSeen: number;
  connectionStatus: PlayerConnectionStatus;
}

export interface RoomTeam {
  id: string;
  name: string;
  color: string;
  score: number;
}

export type TurnRole = 'host' | 'guest';

export type RoomEventType =
  | 'room_created'
  | 'player_joined'
  | 'player_reconnected'
  | 'player_disconnected'
  | 'categories_updated'
  | 'categories_confirmed'
  | 'match_started'
  | 'question_selected'
  | 'answer_submitted'
  | 'question_timeout'
  | 'match_finished'
  | 'match_restarted';

export interface RoomEventEntry {
  id: string;
  type: RoomEventType;
  timestamp: number;
  actorRole?: TurnRole | 'system';
  actorName?: string;
  tileKey?: string;
  subcategoryName?: string;
  points?: number;
  questionText?: string;
  submittedAnswer?: string;
  correctAnswer?: string;
  isCorrect?: boolean;
  earnedPoints?: number;
  nextTurnRole?: TurnRole;
  nextTurnName?: string;
  message: string;
}

export interface ActiveQuestionState {
  tileKey: string;
  questionId: string;
  subcategoryId: string;
  subcategoryName: string;
  category: string;
  points: number;
  difficulty: string;
  questionText: string;
  correctAnswer: string;
  mediaType?: QuestionMediaType;
  imageUrl?: string;
  imageDescription?: string;
  audioUrl?: string;
  audioMaxPlays?: number | null;
  explanation?: string;
  isAnswerRevealed: boolean;
  openedAt: number;
  openedByHostId: string;
  openedByRole?: TurnRole;
  openedByUid?: string;
  openedByName?: string;
  submissionStatus?: 'awaiting_answer' | 'resolved';
  submittedByRole?: TurnRole | null;
  submittedByUid?: string | null;
  submittedByName?: string | null;
  submittedAnswer?: string | null;
  isCorrect?: boolean | null;
  earnedPoints?: number;
  resolvedAt?: number | null;
  isWalaKalima?: boolean;
  walaKalimaMeta?: {
    sessionId: string;
    qrPath?: string;
    teamId: string;
    teamName: string;
    playerName: string;
    contentTypeLabel: string;
    status: 'waiting_scan' | 'active' | 'finished' | 'expired' | 'cancelled';
    correctCount: number;
    skippedCount: number;
    maxSkips?: number;
    remainingSkips?: number;
    pointsPerCorrectWord?: number;
    earnedPoints: number;
    totalWords: number;
    timerSeconds: number;
    startedAt?: number | null;
    expiresAt?: number | null;
    serverNow?: number;
    endReason?: 'correct_guess' | 'time_up' | 'completed_all' | 'player_finished' | 'host_ended' | null;
  };
}

export interface PlayerRequest {
  id: string;
  playerId: string;
  playerName: string;
  teamId?: string | null;
  type: 'reveal_answer' | 'buzz_in' | 'cheer';
  message: string;
  timestamp: number;
}

export interface OnlineGameRoom {
  id: string; // 6-char room code
  code: string;
  mode?: 'host_vs_guest';
  hostId: string;
  hostUid?: string;
  hostName: string;
  guestId?: string | null;
  guestUid?: string | null;
  guestName?: string | null;
  status: RoomStatus;
  maxPlayers: number;
  allowPlayerTeamSelection: boolean;
  timerDuration: number;
  teams: RoomTeam[];
  players: Record<string, RoomPlayer>;
  spectators?: Record<string, RoomSpectator>;
  selectedSubcategoryIds: string[];
  teamSubcategoryIds: Record<string, string[]>;
  categoryConfirmations?: {
    host: boolean;
    guest: boolean;
  };
  activeTurnRole?: TurnRole;
  turnNumber?: number;
  activeTeamIndex: number;
  usedTileKeys: string[];
  roundUsedQuestionIds: string[];
  activeQuestion: ActiveQuestionState | null;
  lastResolvedTurn?: RoomEventEntry | null;
  eventLog?: RoomEventEntry[];
  winnerTeamId: string | null;
  winnerTeamName: string | null;
  winnerScore: number;
  lastActionMessage: string;
  lastActionAt: number;
  hostLastSeen: number;
  playerRequests?: Record<string, PlayerRequest>;
  createdAt: number;
  updatedAt: number;
}
