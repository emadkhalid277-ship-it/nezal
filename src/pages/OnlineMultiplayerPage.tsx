import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { User } from 'firebase/auth';
import confetti from 'canvas-confetti';
import {
  Users,
  Copy,
  Check,
  Share2,
  Crown,
  Play,
  RotateCcw,
  LogOut,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  Trophy,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  UserX,
  Volume2,
  Radio,
  Eye,
  BellRing,
  Hand,
  Layers,
  ChevronDown,
} from 'lucide-react';
import {
  ActiveQuestionState,
  OnlineGameRoom,
  PlayerRequest,
  RoomPlayer,
  RoomTeam,
} from '../types/multiplayer';
import {
  MainCategoryMeta,
  PageView,
  PointValue,
  SubcategoryItem,
  TriviaQuestion,
} from '../types/game';
import {
  assignPlayerTeam,
  claimOnlineHost,
  createOnlineRoom,
  DEFAULT_ONLINE_TEAMS,
  getOrCreatePlayerProfile,
  hostAwardPoints,
  hostCloseActiveQuestion,
  hostFinishGame,
  hostKickPlayer,
  hostMarkTileNoPoints,
  hostRestartGame,
  hostRevealAnswer,
  hostSelectQuestion,
  hostStartGame,
  hostUpdateTeams,
  joinOnlineRoom,
  leaveOnlineRoom,
  playerSendOnlineRequest,
  savePlayerName,
  subscribeToOnlineRoom,
  updateOnlinePlayerPresence,
} from '../services/multiplayerService';
import { TEAM_COLOR_OPTIONS } from '../data/categoriesAndSeed';
import { CategoryCardArtwork } from '../components/CategoryCardArtwork';

interface OnlineMultiplayerPageProps {
  user: User | null;
  mainCategories: MainCategoryMeta[];
  subcategories: SubcategoryItem[];
  approvedQuestions: TriviaQuestion[];
  onNavigateHome: () => void;
  onNavigate?: (page: PageView) => void;
  initialRoomCode?: string | null;
}

const POINT_TIERS: PointValue[] = [100, 200, 300, 400, 500];

export const OnlineMultiplayerPage: React.FC<OnlineMultiplayerPageProps> = ({
  user,
  mainCategories,
  subcategories,
  approvedQuestions,
  onNavigateHome,
  initialRoomCode,
}) => {
  // Local profile & session
  const [playerProfile, setPlayerProfile] = useState(() =>
    getOrCreatePlayerProfile(user)
  );

  // View mode inside multiplayer: 'entry' | 'room'
  const [entryMode, setEntryMode] = useState<'create' | 'join'>('create');
  const [roomCodeInput, setRoomCodeInput] = useState<string>(
    initialRoomCode ? initialRoomCode.toUpperCase() : ''
  );
  const [playerNameInput, setPlayerNameInput] = useState<string>(
    playerProfile.name || ''
  );

  // Create room options
  const [teamCount, setTeamCount] = useState<number>(2);
  const [timerDuration, setTimerDuration] = useState<number>(60);
  const [customTeams, setCustomTeams] = useState<
    { name: string; color: string }[]
  >(
    DEFAULT_ONLINE_TEAMS.slice(0, 2).map((t) => ({
      name: t.name,
      color: t.color,
    }))
  );

  // Active room state
  const [currentRoom, setCurrentRoom] = useState<OnlineGameRoom | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [toastNotification, setToastNotification] = useState<string | null>(
    null
  );

  // Category selection step inside Lobby for host
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] =
    useState<boolean>(false);
  const [hostPicksMap, setHostPicksMap] = useState<Record<string, string[]>>({});

  // Question Timer State (synced from openedAt)
  const [modalTimeLeft, setModalTimeLeft] = useState<number>(60);

  // Ref to active subscription
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  // Sync player profile with user changes
  useEffect(() => {
    const p = getOrCreatePlayerProfile(user);
    setPlayerProfile(p);
    if (!playerNameInput) {
      setPlayerNameInput(p.name);
    }
  }, [user]);

  // Handle URL room code parameter on load
  useEffect(() => {
    if (initialRoomCode && initialRoomCode.trim()) {
      setRoomCodeInput(initialRoomCode.trim().toUpperCase());
      setEntryMode('join');
    }
  }, [initialRoomCode]);

  // Adjust custom teams array when teamCount changes
  useEffect(() => {
    setCustomTeams((prev) => {
      const result: { name: string; color: string }[] = [];
      for (let i = 0; i < teamCount; i++) {
        if (prev[i]) {
          result.push(prev[i]);
        } else {
          const fallback = DEFAULT_ONLINE_TEAMS[i] || {
            name: `الفريق ${i + 1}`,
            color: TEAM_COLOR_OPTIONS[i % TEAM_COLOR_OPTIONS.length].hex,
          };
          result.push({ name: fallback.name, color: fallback.color });
        }
      }
      return result;
    });
  }, [teamCount]);

  // Confetti on game finished
  useEffect(() => {
    if (currentRoom?.status === 'finished') {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#14543D', '#F07842', '#F3F5E9', '#FFFFFF'],
        });
      } catch {
        // ignore
      }
    }
  }, [currentRoom?.status]);

  // Active question countdown timer (anchored to room.activeQuestion.openedAt)
  useEffect(() => {
    if (!currentRoom?.activeQuestion) {
      return;
    }
    const qDuration = currentRoom.timerDuration || 60;
    const openedAt = currentRoom.activeQuestion.openedAt || Date.now();

    const updateTimer = () => {
      const elapsedSeconds = Math.floor((Date.now() - openedAt) / 1000);
      const remaining = Math.max(0, qDuration - elapsedSeconds);
      setModalTimeLeft(remaining);
    };

    updateTimer();
    const interval = window.setInterval(updateTimer, 500);
    return () => window.clearInterval(interval);
  }, [currentRoom?.activeQuestion, currentRoom?.timerDuration]);

  // Toast notifications on lastActionMessage
  useEffect(() => {
    if (currentRoom?.lastActionMessage) {
      setToastNotification(currentRoom.lastActionMessage);
      const timer = window.setTimeout(() => setToastNotification(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [currentRoom?.lastActionAt, currentRoom?.lastActionMessage]);

  // Heartbeat presence listener (Every 10 seconds while in room)
  useEffect(() => {
    if (!currentRoom) return;

    const ping = () => {
      updateOnlinePlayerPresence(currentRoom.code, playerProfile.id, 'online');
    };

    ping(); // Immediate ping on entry
    const interval = window.setInterval(ping, 10000);
    heartbeatRef.current = interval;

    return () => {
      window.clearInterval(interval);
    };
  }, [currentRoom?.code, playerProfile.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
      }
    };
  }, []);

  // Pre-index approved questions by subcategory and points for O(1) instant board lookups
  const questionsBySlotMap = useMemo(() => {
    const map = new Map<string, TriviaQuestion>();
    for (const q of approvedQuestions) {
      if (q.subcategoryId) {
        const idKey = `${q.subcategoryId}__${q.points}`;
        if (!map.has(idKey)) map.set(idKey, q);
      }
      const nameKey = `${q.category.trim()}__${q.points}`;
      if (!map.has(nameKey)) map.set(nameKey, q);
    }
    return map;
  }, [approvedQuestions]);

  const findQuestionForTile = useCallback(
    (subId: string, subName: string, points: PointValue): TriviaQuestion | null => {
      const idKey = `${subId}__${points}`;
      const foundById = questionsBySlotMap.get(idKey);
      if (foundById) return foundById;

      const nameKey = `${subName.trim()}__${points}`;
      const foundByName = questionsBySlotMap.get(nameKey);
      if (foundByName) return foundByName;

      return (
        approvedQuestions.find(
          (q) =>
            (q.subcategoryId === subId || q.category === subName) &&
            q.points === points
        ) || null
      );
    },
    [questionsBySlotMap, approvedQuestions]
  );

  // Active subcategories that belong to active main categories
  const activeSubcategories = useMemo(() => {
    const visibleMainCategoryIds = new Set(
      mainCategories.filter((m) => m.isActive && !m.isDeleted).map((m) => m.id)
    );
    const visibleMainCategoryNames = new Set(
      mainCategories.filter((m) => m.isActive && !m.isDeleted).map((m) => m.name)
    );
    return subcategories.filter(
      (s) =>
        s.isActive &&
        !s.isDeleted &&
        ((s.mainCategoryId && visibleMainCategoryIds.has(s.mainCategoryId)) ||
          visibleMainCategoryNames.has(s.mainCategory))
    );
  }, [subcategories, mainCategories]);

  // Connect to room stream
  const connectToRoomStream = (roomCode: string) => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    const unsub = subscribeToOnlineRoom(
      roomCode,
      (updatedRoom) => {
        if (!updatedRoom) {
          setErrorMsg('تم إغلاق الغرفة أو أنها لم تعد متوفرة.');
          setCurrentRoom(null);
          return;
        }
        setCurrentRoom(updatedRoom);
      },
      (err) => {
        console.error('Room subscription error:', err);
        setErrorMsg('حدث خطأ أثناء مزامنة الغرفة. جاري المحاولة مجدداً...');
      }
    );
    unsubscribeRef.current = unsub;
  };

  // 1. Handle Create Room
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const name = playerNameInput.trim();
    if (!name) {
      setErrorMsg('يرجى إدخال اسمك أولاً');
      return;
    }

    setLoading(true);
    savePlayerName(name);

    try {
      const newRoom = await createOnlineRoom({
        hostName: name,
        user,
        teamCount,
        timerDuration,
        customTeams,
      });

      setPlayerProfile(getOrCreatePlayerProfile(user, name));
      setCurrentRoom(newRoom);
      connectToRoomStream(newRoom.code);
    } catch (err: any) {
      console.error('Failed to create room:', err);
      setErrorMsg(err.message || 'فشل إنشاء الغرفة. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Handle Join Room
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const name = playerNameInput.trim();
    const code = roomCodeInput.trim().toUpperCase();

    if (!name) {
      setErrorMsg('يرجى إدخال اسمك أولاً');
      return;
    }
    if (!code || code.length < 5) {
      setErrorMsg('يرجى إدخال رمز غرفة صحيح مكون من 6 خانات');
      return;
    }

    setLoading(true);
    savePlayerName(name);

    try {
      const { room } = await joinOnlineRoom({
        code,
        playerName: name,
        user,
      });

      setPlayerProfile(getOrCreatePlayerProfile(user, name));
      setCurrentRoom(room);
      connectToRoomStream(room.code);
    } catch (err: any) {
      console.error('Failed to join room:', err);
      setErrorMsg(err.message || 'تعذر الانضمام إلى الغرفة. تحقق من الرمز.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Leave Room
  const handleLeaveRoom = async () => {
    if (!currentRoom) return;
    try {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      await leaveOnlineRoom(currentRoom.code, playerProfile.id);
    } catch {
      // ignore
    } finally {
      setCurrentRoom(null);
    }
  };

  // 4. Handle Copy Room Code & Share
  const handleCopyCode = () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareInviteLink = () => {
    if (!currentRoom) return;
    const origin = window.location.origin;
    const shareUrl = `${origin}?room=${currentRoom.code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  // 5. Host Auto-Pick Subcategories and Start Game
  const handleHostStartGameAuto = async () => {
    if (!currentRoom || !isHost) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      // Pick 3 unique subcategories per team
      const neededCount = currentRoom.teams.length * 3;
      const shuffledSubs = [...activeSubcategories].sort(() => 0.5 - Math.random());
      const selectedSubs = shuffledSubs.slice(0, neededCount);

      if (selectedSubs.length < neededCount) {
        throw new Error('لا يوجد عدد كافٍ من التصنيفات الفرعية النشطة لبدء اللعبة.');
      }

      const teamSubMap: Record<string, string[]> = {};
      const selectedIds: string[] = [];

      currentRoom.teams.forEach((team, idx) => {
        const teamSubs = selectedSubs.slice(idx * 3, idx * 3 + 3).map((s) => s.id);
        teamSubMap[team.id] = teamSubs;
        selectedIds.push(...teamSubs);
      });

      await hostStartGame(currentRoom.code, currentRoom.hostId, selectedIds, teamSubMap);
      setIsCategoryPickerOpen(false);
    } catch (err: any) {
      console.error('Error starting game:', err);
      setErrorMsg(err.message || 'حدث خطأ أثناء بدء المباراة');
    } finally {
      setLoading(false);
    }
  };

  // 6. Host Select Tile to open question modal
  const handleHostTileClick = async (
    subId: string,
    subName: string,
    points: PointValue,
    tileKey: string
  ) => {
    if (!currentRoom || !isHost) return;
    if (currentRoom.usedTileKeys.includes(tileKey)) return;

    const matchedQ = findQuestionForTile(subId, subName, points);
    if (!matchedQ) {
      setErrorMsg('لا يتوفر سؤال مخصص لهذه الخانة حالياً.');
      return;
    }

    const payload: ActiveQuestionState = {
      tileKey,
      questionId: matchedQ.id,
      subcategoryId: subId,
      subcategoryName: subName,
      category: matchedQ.category,
      points,
      difficulty: matchedQ.difficulty,
      questionText: matchedQ.questionText,
      correctAnswer: matchedQ.correctAnswer,
      imageUrl: matchedQ.imageUrl || '',
      imageDescription: matchedQ.imageDescription || '',
      explanation: matchedQ.explanation || '',
      isAnswerRevealed: false,
      openedAt: Date.now(),
      openedByHostId: currentRoom.hostId,
    };

    try {
      await hostSelectQuestion(currentRoom.code, currentRoom.hostId, payload);
    } catch (err) {
      console.error('Failed to open question for all players:', err);
    }
  };

  // 7. Host Award Points
  const handleHostAward = async (awardedTeamIndex: number) => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion) return;
    const { tileKey, questionId, points } = currentRoom.activeQuestion;
    const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;

    try {
      await hostAwardPoints({
        code: currentRoom.code,
        hostId: currentRoom.hostId,
        awardedTeamIndex,
        points,
        tileKey,
        questionId,
        totalPlayableTiles: totalTiles,
      });
    } catch (err) {
      console.error('Failed to award points:', err);
    }
  };

  // 8. Host Skip Question
  const handleHostSkip = async () => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion) return;
    const { tileKey, questionId } = currentRoom.activeQuestion;
    const totalTiles = currentRoom.selectedSubcategoryIds.length * 5;

    try {
      await hostMarkTileNoPoints({
        code: currentRoom.code,
        hostId: currentRoom.hostId,
        tileKey,
        questionId,
        totalPlayableTiles: totalTiles,
      });
    } catch (err) {
      console.error('Failed to skip question:', err);
    }
  };

  // 9. Host Reveal Answer
  const handleHostReveal = async () => {
    if (!currentRoom || !isHost || !currentRoom.activeQuestion) return;
    try {
      await hostRevealAnswer(currentRoom.code, currentRoom.hostId);
    } catch (err) {
      console.error('Failed to reveal answer:', err);
    }
  };

  // 10. Player sends request / buzz in
  const handlePlayerBuzz = async (type: 'reveal_answer' | 'buzz_in') => {
    if (!currentRoom) return;
    const msg =
      type === 'reveal_answer'
        ? 'يطلب كشف الإجابة 📢'
        : 'رفع يده ومستعد للإجابة! ✋';

    const req: PlayerRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      playerId: playerProfile.id,
      playerName: playerProfile.name,
      teamId: currentRoom.players[playerProfile.id]?.teamId,
      type,
      message: msg,
      timestamp: Date.now(),
    };

    await playerSendOnlineRequest(currentRoom.code, req);
  };

  // Computed state
  const isHost = currentRoom ? currentRoom.hostId === playerProfile.id : false;
  const currentHostPlayer = currentRoom ? currentRoom.players[currentRoom.hostId] : null;
  const isHostOffline =
    currentHostPlayer &&
    (currentHostPlayer.connectionStatus === 'offline' ||
      Date.now() - (currentHostPlayer.lastSeen || 0) > 35000);

  const playersList = useMemo(() => {
    return currentRoom ? Object.values(currentRoom.players) : [];
  }, [currentRoom]);

  const activeTurnTeam = useMemo(() => {
    if (!currentRoom || currentRoom.teams.length === 0) return null;
    return currentRoom.teams[currentRoom.activeTeamIndex % currentRoom.teams.length];
  }, [currentRoom]);

  // Board columns resolved from selectedSubcategoryIds
  const onlineBoardColumns = useMemo(() => {
    if (!currentRoom || !currentRoom.selectedSubcategoryIds) return [];
    return currentRoom.selectedSubcategoryIds.map((subId) => {
      const subObj =
        subcategories.find((s) => s.id === subId) ||
        subcategories.find((s) => s.name === subId);
      const parentMain =
        mainCategories.find(
          (m) =>
            (subObj?.mainCategoryId && m.id === subObj.mainCategoryId) ||
            m.name === subObj?.mainCategory
        ) ||
        mainCategories[0];

      // Identify which team chose this subcategory
      let owningTeam = currentRoom.teams[0];
      for (const t of currentRoom.teams) {
        const teamPicks = currentRoom.teamSubcategoryIds?.[t.id] || [];
        if (teamPicks.includes(subId)) {
          owningTeam = t;
          break;
        }
      }

      return {
        subId: subObj?.id || subId,
        subName: subObj?.name || 'تصنيف',
        teamName: owningTeam?.name || '',
        teamColor: owningTeam?.color || '#14543D',
        mainCategoryName: parentMain?.name || '',
        accentColor: parentMain?.accentColor || '#14543D',
        bgTint: parentMain?.bgTint || '#EAF2EE',
        borderTint: parentMain?.borderTint || '#14543D',
        iconName: parentMain?.iconName || 'compass',
      };
    });
  }, [currentRoom, subcategories, mainCategories]);

  // Total playable tiles
  const totalPlayableTiles = onlineBoardColumns.length * 5;
  const usedCount = currentRoom?.usedTileKeys?.length || 0;

  // -------------------------------------------------------------
  // RENDER: 1. ENTRY SCREEN (Create or Join Room)
  // -------------------------------------------------------------
  if (!currentRoom) {
    return (
      <div className="max-w-[1000px] mx-auto px-4 py-8 md:py-12 space-y-8">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EAF2EE] border border-[#14543D]/20 text-xs font-bold text-[#14543D]">
              <Radio className="w-3.5 h-3.5 animate-pulse text-[#F07842]" />
              <span>اللعب عن بُعد • Online Multiplayer</span>
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
              تحدّوا بعض أونلاين من أجهزتكم المختلفة!
            </h1>
          </div>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-4 py-2 text-xs font-bold text-[#777B73] hover:text-[#252824] bg-[#FFFFFF] border border-[#E5E8DD] rounded-xl hover:bg-[#F3F5E9] transition-colors cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
            <p className="font-bold">{errorMsg}</p>
          </div>
        )}

        {/* Tab Selection: Create vs Join */}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto p-1.5 bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl">
          <button
            type="button"
            onClick={() => {
              setEntryMode('create');
              setErrorMsg(null);
            }}
            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              entryMode === 'create'
                ? 'bg-[#14543D] text-[#FFFFFF] shadow-sm'
                : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
            }`}
          >
            <Crown className="w-4 h-4" />
            <span>إنشاء غرفة جديدة</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEntryMode('join');
              setErrorMsg(null);
            }}
            className={`py-3 px-4 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
              entryMode === 'join'
                ? 'bg-[#14543D] text-[#FFFFFF] shadow-sm'
                : 'text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>الانضمام إلى غرفة</span>
          </button>
        </div>

        {/* FORM: CREATE ROOM */}
        {entryMode === 'create' && (
          <form
            onSubmit={handleCreateRoom}
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-10 max-w-xl mx-auto space-y-6 shadow-sm"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF2EE] border border-[#14543D]/20 text-[#14543D] flex items-center justify-center mx-auto">
                <Crown className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#252824]">
                إنشاء غرفة تحدي أونلاين
              </h2>
              <p className="text-xs text-[#777B73]">
                ستحصل على رمز فريد مكون من 6 خانات لمشاركته مع أصدقائك.
              </p>
            </div>

            {/* Host Player Name */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                اسمك (المضيف):
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="مثال: سعود، نورة، أبو فهد..."
                className="w-full px-4 py-3 rounded-xl border border-[#E5E8DD] focus:border-[#14543D] focus:ring-2 focus:ring-[#14543D]/10 outline-none text-sm font-bold text-[#252824]"
                required
              />
            </div>

            {/* Teams Count (2 to 4) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                عدد الفرق المتنافسة:
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setTeamCount(count)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      teamCount === count
                        ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                        : 'border-[#E5E8DD] text-[#777B73] hover:bg-[#F3F5E9]'
                    }`}
                  >
                    {count} فرق
                  </button>
                ))}
              </div>
            </div>

            {/* Teams Customization */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-[#252824]">
                تسمية الفرق:
              </label>
              <div className="space-y-2.5">
                {customTeams.map((team, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 p-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD]"
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: team.color }}
                    />
                    <input
                      type="text"
                      value={team.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomTeams((prev) =>
                          prev.map((t, i) => (i === idx ? { ...t, name: val } : t))
                        );
                      }}
                      className="flex-1 bg-transparent border-none text-xs font-bold text-[#252824] outline-none"
                      placeholder={`فريق ${idx + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Question Timer Duration */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                وقت الإجابة على السؤال:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 45, 60, 90].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setTimerDuration(sec)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      timerDuration === sec
                        ? 'border-[#14543D] bg-[#EAF2EE] text-[#14543D]'
                        : 'border-[#E5E8DD] text-[#777B73] hover:bg-[#F3F5E9]'
                    }`}
                  >
                    {sec} ثانية
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 text-base font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3D2C] active:scale-[0.99] rounded-2xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <span>جاري إنشاء الغرفة...</span>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-[#F07842]" />
                  <span>إنشاء الغرفة وبدء التحدي</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* FORM: JOIN ROOM */}
        {entryMode === 'join' && (
          <form
            onSubmit={handleJoinRoom}
            className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-10 max-w-xl mx-auto space-y-6 shadow-sm"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-[#FEF2EC] border border-[#F07842]/20 text-[#F07842] flex items-center justify-center mx-auto">
                <Users className="w-7 h-7" />
              </div>
              <h2 className="font-display text-xl font-bold text-[#252824]">
                الانضمام إلى غرفة موجودة
              </h2>
              <p className="text-xs text-[#777B73]">
                أدخل رمز الغرفة المكون من 6 خانات الذي أرسله لك المضيف.
              </p>
            </div>

            {/* Room Code */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                رمز الغرفة (6 خانات):
              </label>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(e) =>
                  setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                maxLength={6}
                placeholder="مثال: NZL849"
                className="w-full px-4 py-3.5 rounded-xl border-2 border-[#E5E8DD] focus:border-[#F07842] outline-none text-center font-mono text-2xl font-bold tracking-widest text-[#14543D] uppercase"
                required
              />
            </div>

            {/* Player Name */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#252824]">
                اسمك المعروض:
              </label>
              <input
                type="text"
                value={playerNameInput}
                onChange={(e) => setPlayerNameInput(e.target.value)}
                placeholder="اكتب اسمك للمباراة..."
                className="w-full px-4 py-3 rounded-xl border border-[#E5E8DD] focus:border-[#14543D] focus:ring-2 focus:ring-[#14543D]/10 outline-none text-sm font-bold text-[#252824]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading || roomCodeInput.length < 5}
              className="w-full py-4 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.99] rounded-2xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <span>جاري الاتصال بالغرفة...</span>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  <span>دخول الغرفة</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 2. LOBBY SCREEN (شاشة انتظار اللاعبين)
  // -------------------------------------------------------------
  if (currentRoom.status === 'lobby') {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-8">
        {/* Toast Alert */}
        {toastNotification && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#14543D] text-[#FFFFFF] px-5 py-2.5 rounded-2xl shadow-lg border border-[#FFFFFF]/20 text-xs font-bold flex items-center gap-2 animate-bounce">
            <BellRing className="w-4 h-4 text-[#F07842]" />
            <span>{toastNotification}</span>
          </div>
        )}

        {/* Host Offline Alert / Succession */}
        {isHostOffline && !isHost && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>المضيف ({currentRoom.hostName}) يبدو غير متصل حالياً. يمكنك استلام دور المضيف لمواصلة المباراة.</span>
            </div>
            <button
              type="button"
              onClick={() => claimOnlineHost(currentRoom.code, playerProfile.id)}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
            >
              استلام دور المضيف 👑
            </button>
          </div>
        )}

        {/* Room Header & Invite Card */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 md:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#777B73]">
                <Radio className="w-3.5 h-3.5 text-[#14543D] animate-pulse" />
                <span>صالة انتظار اللاعبين</span>
                <span>•</span>
                <span className="font-bold text-[#14543D]">
                  المضيف: {currentRoom.hostName}
                </span>
              </div>
              <h1 className="font-display text-2xl font-bold text-[#252824]">
                استعدوا للمباراة!
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="px-4 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>مغادرة الغرفة</span>
              </button>
            </div>
          </div>

          {/* Big Room Code Box */}
          <div className="bg-[#F3F5E9] border-2 border-[#14543D]/20 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-right">
            <div className="space-y-1">
              <div className="text-xs font-bold text-[#777B73]">
                شارك هذا الرمز مع أصدقائك للانضمام:
              </div>
              <div className="font-mono text-4xl md:text-5xl font-bold tracking-widest text-[#14543D]">
                {currentRoom.code}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-5 py-3 rounded-xl bg-[#FFFFFF] hover:bg-[#EAF2EE] border border-[#E5E8DD] text-xs font-bold text-[#14543D] flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                {copiedCode ? (
                  <>
                    <Check className="w-4 h-4 text-[#14543D]" />
                    <span>تم نسخ الرمز!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>نسخ الرمز</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleShareInviteLink}
                className="px-5 py-3 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-xs font-bold text-[#FFFFFF] flex items-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تم نسخ رابط الدعوة!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>مشاركة رابط الدعوة</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* TEAMS AND PLAYERS LIST */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-[#14543D]" />
              <h2 className="font-display text-lg font-bold text-[#252824]">
                الفرق واللاعبين المتصلين ({playersList.length})
              </h2>
            </div>
            <div className="text-xs text-[#777B73]">
              {isHost
                ? 'يمكنك نقل اللاعبين بين الفرق أو استبعاد أي لاعب'
                : 'يمكنك اختيار فريقك بالضغط على الزر أدناه'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentRoom.teams.map((team) => {
              const teamPlayers = playersList.filter((p) => p.teamId === team.id);
              const isMyTeam = currentRoom.players[playerProfile.id]?.teamId === team.id;

              return (
                <div
                  key={team.id}
                  className="bg-[#FFFFFF] border-2 rounded-2xl p-5 space-y-4 transition-all"
                  style={{ borderColor: `${team.color}40` }}
                >
                  {/* Team header */}
                  <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-4 h-4 rounded-full border border-black/10"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="font-display font-bold text-base text-[#252824]">
                        {team.name}
                      </span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F3F5E9] text-[#777B73]">
                        {teamPlayers.length} لاعبين
                      </span>
                    </div>

                    {!isMyTeam && (
                      <button
                        type="button"
                        onClick={() =>
                          assignPlayerTeam(currentRoom.code, playerProfile.id, team.id)
                        }
                        className="text-xs font-bold px-3 py-1 rounded-lg border border-[#E5E8DD] hover:bg-[#F3F5E9] text-[#14543D] cursor-pointer"
                      >
                        الانضمام لهذا الفريق
                      </button>
                    )}
                  </div>

                  {/* Players list */}
                  <div className="space-y-2 min-h-[90px]">
                    {teamPlayers.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#777B73]">
                        لا يوجد لاعبين في هذا الفريق حتى الآن
                      </div>
                    ) : (
                      teamPlayers.map((player) => {
                        const isSelf = player.id === playerProfile.id;
                        const isOnline =
                          player.connectionStatus === 'online' &&
                          Date.now() - (player.lastSeen || 0) < 35000;

                        return (
                          <div
                            key={player.id}
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                              isSelf
                                ? 'bg-[#EAF2EE] border-[#14543D]/30'
                                : 'bg-[#F3F5E9]/60 border-[#E5E8DD]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {/* Online indicator */}
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  isOnline
                                    ? 'bg-emerald-500 ring-2 ring-emerald-200'
                                    : 'bg-zinc-400'
                                }`}
                                title={isOnline ? 'متصل' : 'غير متصل'}
                              />
                              <span className="text-xs font-bold text-[#252824]">
                                {player.name}
                              </span>
                              {player.isHost && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#14543D] text-white">
                                  <Crown className="w-3 h-3" /> المضيف
                                </span>
                              )}
                              {isSelf && (
                                <span className="text-[10px] font-bold text-[#14543D]">
                                  (أنت)
                                </span>
                              )}
                            </div>

                            {/* Host management options */}
                            {isHost && !player.isHost && (
                              <div className="flex items-center gap-1">
                                {/* Move team select */}
                                <select
                                  value={team.id}
                                  onChange={(e) =>
                                    assignPlayerTeam(
                                      currentRoom.code,
                                      player.id,
                                      e.target.value
                                    )
                                  }
                                  className="text-[11px] font-bold bg-[#FFFFFF] border border-[#E5E8DD] rounded px-1.5 py-1 text-[#252824] outline-none"
                                >
                                  {currentRoom.teams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      نقل إلى {t.name}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  onClick={() =>
                                    hostKickPlayer(
                                      currentRoom.code,
                                      currentRoom.hostId,
                                      player.id
                                    )
                                  }
                                  title="استبعاد اللاعب"
                                  className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* START GAME BAR (Host Authority) */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div>
            <div className="font-display font-bold text-base text-[#252824]">
              {isHost ? 'جاهزون لبدء المنافسة؟' : 'بانتظار المضيف لبدء المباراة...'}
            </div>
            <p className="text-xs text-[#777B73]">
              {isHost
                ? 'سيتم اختيار 3 تصنيفات فرعية لكل فريق بشكل متوازن ثم بدء البورد فوراً لجميع الأجهزة المتصلة.'
                : 'ستبدأ شاشة الأسئلة تلقائياً بمجرد إطلاق المضيف للمباراة.'}
            </p>
          </div>

          {isHost ? (
            <button
              type="button"
              disabled={loading || playersList.length === 0}
              onClick={handleHostStartGameAuto}
              className="px-8 py-3.5 text-base font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3D2C] active:scale-[0.99] rounded-2xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
              {loading ? (
                <span>جاري إعداد البورد...</span>
              ) : (
                <>
                  <Play className="w-5 h-5 text-[#F07842]" />
                  <span>بدء المباراة الآن 🔥</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-[#14543D] bg-[#EAF2EE] px-4 py-2.5 rounded-xl border border-[#14543D]/20">
              <span className="w-2.5 h-2.5 rounded-full bg-[#14543D] animate-ping" />
              <span>الغرفة جاهزة، بانتظار إشارة البدء...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 3. IN-GAME BOARD (المباراة المباشرة المتزامنة)
  // -------------------------------------------------------------
  if (currentRoom.status === 'in_game') {
    return (
      <div className="max-w-[1320px] mx-auto px-4 py-6 space-y-6">
        {/* Toast Alert */}
        {toastNotification && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#14543D] text-[#FFFFFF] px-5 py-2.5 rounded-2xl shadow-lg border border-[#FFFFFF]/20 text-xs font-bold flex items-center gap-2 animate-bounce">
            <BellRing className="w-4 h-4 text-[#F07842]" />
            <span>{toastNotification}</span>
          </div>
        )}

        {/* TOP STATUS BAR: Teams Scores & Turn Indicator */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-4 md:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#E5E8DD] pb-4">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F07842] animate-pulse" />
              <span className="text-xs font-bold text-[#14543D]">
                غرفة: <span className="font-mono">{currentRoom.code}</span>
              </span>
              <span className="text-xs text-[#777B73]">•</span>
              <span className="text-xs text-[#777B73]">
                {isHost ? 'أنت المضيف 👑' : `أنت متصل كـ ${playerProfile.name}`}
              </span>
            </div>

            {/* Turn badge */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#777B73]">الدور الآن:</span>
              {activeTurnTeam && (
                <div
                  className="px-3 py-1 rounded-full text-xs font-bold text-[#FFFFFF] flex items-center gap-1.5 shadow-sm"
                  style={{ backgroundColor: activeTurnTeam.color }}
                >
                  <span>{activeTurnTeam.name}</span>
                </div>
              )}
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => hostFinishGame(currentRoom.code, currentRoom.hostId)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
                >
                  إنهاء المباراة
                </button>
              </div>
            )}
          </div>

          {/* Teams Scores Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {currentRoom.teams.map((team, idx) => {
              const isTurn = idx === currentRoom.activeTeamIndex % currentRoom.teams.length;
              return (
                <div
                  key={team.id}
                  className={`p-3.5 rounded-xl border-2 transition-all flex items-center justify-between ${
                    isTurn
                      ? 'bg-[#F3F5E9] shadow-sm'
                      : 'bg-[#FFFFFF] border-[#E5E8DD]'
                  }`}
                  style={{ borderColor: isTurn ? team.color : '#E5E8DD' }}
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="text-xs font-bold text-[#252824] truncate max-w-[100px]">
                        {team.name}
                      </span>
                    </div>
                    {isTurn && (
                      <span className="text-[10px] font-bold text-[#14543D]">
                        الدور الحالي
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-2xl font-bold text-[#14543D]">
                    {team.score}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GAME BOARD: Subcategory Columns × 5 Point Rows */}
        <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-4 md:p-6 shadow-sm overflow-x-auto">
          <div
            className="grid gap-3 min-w-[700px]"
            style={{
              gridTemplateColumns: `repeat(${onlineBoardColumns.length}, minmax(130px, 1fr))`,
            }}
          >
            {/* Column Headers (Subcategories) */}
            {onlineBoardColumns.map((col, idx) => (
              <div
                key={idx}
                className="rounded-2xl p-3 border text-center space-y-1.5 shadow-xs"
                style={{
                  backgroundColor: col.bgTint,
                  borderColor: `${col.borderTint}40`,
                }}
              >
                <div
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block text-white"
                  style={{ backgroundColor: col.teamColor }}
                >
                  {col.teamName}
                </div>
                <div className="font-display font-bold text-xs text-[#252824] line-clamp-2 min-h-[32px] flex items-center justify-center">
                  {col.subName}
                </div>
              </div>
            ))}

            {/* 5 Point Rows (100, 200, 300, 400, 500) */}
            {POINT_TIERS.map((points) => (
              <React.Fragment key={points}>
                {onlineBoardColumns.map((col, cIdx) => {
                  const tileKey = `${col.subId}__${points}`;
                  const isUsed = currentRoom.usedTileKeys.includes(tileKey);

                  return (
                    <button
                      key={`${col.subId}_${points}`}
                      type="button"
                      disabled={isUsed || (!isHost && !isUsed)}
                      onClick={() =>
                        handleHostTileClick(col.subId, col.subName, points, tileKey)
                      }
                      className={`h-20 md:h-24 rounded-2xl border-2 font-display text-2xl md:text-3xl font-bold transition-all flex flex-col items-center justify-center cursor-pointer select-none ${
                        isUsed
                          ? 'bg-[#E5E8DD]/40 border-transparent text-[#777B73]/40 cursor-not-allowed'
                          : isHost
                          ? 'bg-[#FFFFFF] hover:bg-[#EAF2EE] border-[#14543D]/30 text-[#14543D] hover:scale-[1.02] shadow-sm active:scale-95'
                          : 'bg-[#FFFFFF] border-[#14543D]/20 text-[#14543D]/80 cursor-default'
                      }`}
                    >
                      {isUsed ? (
                        <Check className="w-6 h-6 text-[#777B73]/40" />
                      ) : (
                        <span>{points}</span>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Bottom notice for non-hosts */}
          {!isHost && (
            <div className="pt-4 text-center text-xs font-bold text-[#777B73]">
              المضيف ({currentRoom.hostName}) هو من يملك صلاحية فتح الأسئلة وتسجيل النقاط.
            </div>
          )}
        </div>

        {/* SYNCHRONIZED QUESTION MODAL (POPS UP FOR ALL PLAYERS IN REAL TIME) */}
        {currentRoom.activeQuestion && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-6 md:p-8 max-w-2xl w-full space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Top Bar */}
              <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/20">
                    {currentRoom.activeQuestion.subcategoryName}
                  </span>
                  <span className="font-mono text-sm font-bold text-[#F07842]">
                    {currentRoom.activeQuestion.points} نقطة
                  </span>
                </div>

                {/* Countdown Timer */}
                <div
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-mono text-base font-bold ${
                    modalTimeLeft <= 10
                      ? 'bg-rose-100 text-rose-700 animate-pulse'
                      : 'bg-[#F3F5E9] text-[#252824]'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>{modalTimeLeft}s</span>
                </div>
              </div>

              {/* Question Body */}
              <div className="space-y-4 text-center py-2">
                <h3 className="font-display text-xl md:text-2xl font-bold text-[#252824] leading-relaxed">
                  {currentRoom.activeQuestion.questionText}
                </h3>

                {/* Optional Question Image */}
                {currentRoom.activeQuestion.imageUrl && (
                  <div className="max-w-md mx-auto rounded-2xl overflow-hidden border border-[#E5E8DD]">
                    <img
                      src={currentRoom.activeQuestion.imageUrl}
                      alt={
                        currentRoom.activeQuestion.imageDescription ||
                        'صورة السؤال'
                      }
                      className="w-full max-h-64 object-contain bg-[#F3F5E9]"
                    />
                  </div>
                )}
              </div>

              {/* Answer Area (Revealed or Masked) */}
              {currentRoom.activeQuestion.isAnswerRevealed ? (
                <div className="p-4 rounded-2xl bg-[#EAF2EE] border-2 border-[#14543D] text-center space-y-1 animate-in fade-in">
                  <div className="text-xs font-bold text-[#14543D]">
                    الإجابة الصحيحة:
                  </div>
                  <div className="font-display text-xl font-bold text-[#14543D]">
                    {currentRoom.activeQuestion.correctAnswer}
                  </div>
                  {currentRoom.activeQuestion.explanation && (
                    <p className="text-xs text-[#777B73] pt-1">
                      {currentRoom.activeQuestion.explanation}
                    </p>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#F3F5E9] border border-[#E5E8DD] text-center space-y-1">
                  <div className="text-xs font-bold text-[#777B73]">
                    الإجابة مخفية حالياً
                  </div>
                  <div className="text-xs text-[#777B73]">
                    {isHost
                      ? 'اضغط على زر كشف الإجابة لعرضها للجميع'
                      : 'بانتظار المضيف لكشف الإجابة...'}
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              {isHost ? (
                <div className="space-y-3 pt-2">
                  {!currentRoom.activeQuestion.isAnswerRevealed ? (
                    <button
                      type="button"
                      onClick={handleHostReveal}
                      className="w-full py-3.5 text-base font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-xl cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Eye className="w-5 h-5" />
                      <span>إظهار الإجابة للجميع</span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-center text-[#252824]">
                        اختر الفريق الذي أجاب إجابة صحيحة لمنحه النقاط:
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {currentRoom.teams.map((t, tIdx) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleHostAward(tIdx)}
                            className="py-3 px-3 rounded-xl text-xs font-bold text-[#FFFFFF] hover:opacity-95 cursor-pointer shadow-xs transition-transform active:scale-95"
                            style={{ backgroundColor: t.color }}
                          >
                            + {currentRoom.activeQuestion?.points} لـ {t.name}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={handleHostSkip}
                          className="flex-1 py-2.5 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#777B73] cursor-pointer"
                        >
                          تخطي بدون نقاط
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            hostCloseActiveQuestion(
                              currentRoom.code,
                              currentRoom.hostId
                            )
                          }
                          className="py-2.5 px-4 rounded-xl border border-[#E5E8DD] text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          إغلاق
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Non-Host Player Interactive Buttons */
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handlePlayerBuzz('buzz_in')}
                    className="flex-1 w-full py-3 text-xs font-bold rounded-xl bg-[#14543D] text-[#FFFFFF] hover:bg-[#0E3D2C] cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Hand className="w-4 h-4 text-[#F07842]" />
                    <span>أنا جاهز للإجابة! (رفع اليد)</span>
                  </button>

                  {!currentRoom.activeQuestion.isAnswerRevealed && (
                    <button
                      type="button"
                      onClick={() => handlePlayerBuzz('reveal_answer')}
                      className="py-3 px-4 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#252824] cursor-pointer"
                    >
                      طلب كشف الإجابة 📢
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: 4. RESULTS SCREEN (نهاية المباراة)
  // -------------------------------------------------------------
  const sortedTeams = [...currentRoom.teams].sort((a, b) => b.score - a.score);
  const winningTeam = sortedTeams[0];

  return (
    <div className="max-w-[800px] mx-auto px-4 py-12 text-center space-y-8 animate-in fade-in">
      <div className="bg-[#FFFFFF] border-2 border-[#14543D] rounded-3xl p-8 md:p-12 space-y-6 shadow-xl">
        <div className="w-20 h-20 rounded-3xl bg-[#FEF2EC] border border-[#F07842]/20 text-[#F07842] flex items-center justify-center mx-auto">
          <Trophy className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <div className="inline-block px-4 py-1 rounded-full bg-[#EAF2EE] text-xs font-bold text-[#14543D]">
            انتهت المباراة أونلاين 🏁
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#252824]">
            مبروك الفوز لـ {winningTeam?.name}! 🏆
          </h1>
          <p className="text-sm text-[#777B73]">
            برصيد{' '}
            <span className="font-bold text-[#14543D]">
              {winningTeam?.score} نقطة
            </span>
          </p>
        </div>

        {/* Final Scoreboard */}
        <div className="space-y-3 pt-4 max-w-md mx-auto">
          {sortedTeams.map((team, idx) => (
            <div
              key={team.id}
              className={`p-4 rounded-2xl border-2 flex items-center justify-between ${
                idx === 0
                  ? 'bg-[#EAF2EE] border-[#14543D]'
                  : 'bg-[#F3F5E9] border-[#E5E8DD]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm text-[#777B73]">
                  #{idx + 1}
                </span>
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <span className="font-display font-bold text-sm text-[#252824]">
                  {team.name}
                </span>
              </div>
              <div className="font-mono text-xl font-bold text-[#14543D]">
                {team.score} نقطة
              </div>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="pt-6 flex flex-wrap items-center justify-center gap-4">
          {isHost ? (
            <>
              <button
                type="button"
                onClick={() => hostRestartGame(currentRoom.code, currentRoom.hostId, false)}
                className="px-6 py-3.5 rounded-xl bg-[#14543D] text-[#FFFFFF] text-sm font-bold hover:bg-[#0E3D2C] cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>جولة جديدة بنفس الغرفة</span>
              </button>

              <button
                type="button"
                onClick={() => hostRestartGame(currentRoom.code, currentRoom.hostId, true)}
                className="px-6 py-3.5 rounded-xl bg-[#FFFFFF] border border-[#E5E8DD] text-sm font-bold text-[#252824] hover:bg-[#F3F5E9] cursor-pointer"
              >
                العودة لصالة الانتظار
              </button>
            </>
          ) : (
            <div className="text-xs font-bold text-[#777B73]">
              بانتظار المضيف لإعادة بدء جولة جديدة أو العودة للانتظار.
            </div>
          )}

          <button
            type="button"
            onClick={handleLeaveRoom}
            className="px-6 py-3.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-sm font-bold cursor-pointer flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>مغادرة الغرفة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
