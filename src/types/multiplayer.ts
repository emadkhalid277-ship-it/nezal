export type RoomStatus =
  | 'lobby'
  | 'waiting'
  | 'selecting_categories'
  | 'in_game'
  | 'playing'
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

export interface RoomTeam {
  id: string;
  name: string;
  color: string;
  score: number;
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
  imageUrl?: string;
  imageDescription?: string;
  explanation?: string;
  isAnswerRevealed: boolean;
  openedAt: number;
  openedByHostId: string;
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
  hostId: string;
  hostName: string;
  status: RoomStatus;
  maxPlayers: number;
  allowPlayerTeamSelection: boolean;
  timerDuration: number;
  teams: RoomTeam[];
  players: Record<string, RoomPlayer>;
  selectedSubcategoryIds: string[];
  teamSubcategoryIds: Record<string, string[]>;
  activeTeamIndex: number;
  usedTileKeys: string[];
  roundUsedQuestionIds: string[];
  activeQuestion: ActiveQuestionState | null;
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
