import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  X,
  Play,
  Clock,
  Check,
  Sparkles,
  Layers,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Edit3,
  Lock,
} from 'lucide-react';
import {
  SUBCATEGORIES_PER_TEAM,
  SubcategoryItem,
  TeamConfig,
} from '../types/game';
import { TEAM_COLOR_OPTIONS } from '../data/categoriesAndSeed';
import { DEFAULT_TEAM_TEMPLATES } from '../App';

interface TeamSetupPageProps {
  teams: TeamConfig[];
  teamSubcategoryIds: Record<string, string[]>;
  subcategories: SubcategoryItem[];
  isAllTeamsSelectionComplete: boolean;
  timerDuration: number;
  isGameLocked?: boolean;
  onUpdateTeams: (teams: TeamConfig[]) => void;
  onUpdateTimer: (seconds: number) => void;
  onBackToCategories: (teamIdx?: number) => void;
  onStartGame: () => void;
  onGoToBoard?: () => void;
  approvedQuestionsCount: number;
  isAdmin: boolean;
  onSeedQuestions: () => Promise<void>;
  seeding: boolean;
}

export const TeamSetupPage: React.FC<TeamSetupPageProps> = ({
  teams,
  teamSubcategoryIds,
  subcategories,
  isAllTeamsSelectionComplete,
  timerDuration,
  isGameLocked = false,
  onUpdateTeams,
  onUpdateTimer,
  onBackToCategories,
  onStartGame,
  onGoToBoard,
  approvedQuestionsCount,
  isAdmin,
  onSeedQuestions,
  seeding,
}) => {
  const [playerInputs, setPlayerInputs] = useState<Record<string, string>>({});

  const subByIdMap = useMemo(() => {
    const map = new Map<string, SubcategoryItem>();
    subcategories.forEach((s) => map.set(s.id, s));
    return map;
  }, [subcategories]);

  const totalRequiredCount = teams.length * SUBCATEGORIES_PER_TEAM;

  const totalSelectedCount = useMemo(() => {
    const seen = new Set<string>();
    teams.forEach((t) => {
      (teamSubcategoryIds[t.id] || [])
        .slice(0, SUBCATEGORIES_PER_TEAM)
        .forEach((id) => {
          if (subByIdMap.has(id)) {
            seen.add(id);
          }
        });
    });
    return seen.size;
  }, [teams, teamSubcategoryIds, subByIdMap]);

  const firstIncompleteTeamIndex = useMemo(
    () =>
      teams.findIndex(
        (t) =>
          (teamSubcategoryIds[t.id] || []).filter((id) => subByIdMap.has(id))
            .length < SUBCATEGORIES_PER_TEAM
      ),
    [teams, teamSubcategoryIds, subByIdMap]
  );

  const handleTeamCountChange = (count: number) => {
    if (isGameLocked) return;
    if (count === teams.length) return;
    if (count < teams.length) {
      onUpdateTeams(teams.slice(0, count));
    } else {
      const nextTeams = [...teams];
      for (let i = teams.length; i < count; i++) {
        const tpl = DEFAULT_TEAM_TEMPLATES[i] || {
          id: `team-${i + 1}`,
          name: `الفريق ${i + 1}`,
          color: TEAM_COLOR_OPTIONS[i % TEAM_COLOR_OPTIONS.length].hex,
          players: [],
        };
        nextTeams.push({ ...tpl, score: 0 });
      }
      onUpdateTeams(nextTeams);
    }
  };

  const handleNameChange = (teamId: string, name: string) => {
    if (isGameLocked) return;
    onUpdateTeams(teams.map((t) => (t.id === teamId ? { ...t, name } : t)));
  };

  const handleColorChange = (teamId: string, color: string) => {
    if (isGameLocked) return;
    onUpdateTeams(teams.map((t) => (t.id === teamId ? { ...t, color } : t)));
  };

  const handleAddPlayer = (teamId: string) => {
    if (isGameLocked) return;
    const val = (playerInputs[teamId] || '').trim();
    if (!val) return;
    onUpdateTeams(
      teams.map((t) =>
        t.id === teamId
          ? { ...t, players: [...t.players, val.slice(0, 30)] }
          : t
      )
    );
    setPlayerInputs((prev) => ({ ...prev, [teamId]: '' }));
  };

  const handleRemovePlayer = (teamId: string, playerIndex: number) => {
    if (isGameLocked) return;
    onUpdateTeams(
      teams.map((t) =>
        t.id === teamId
          ? {
              ...t,
              players: t.players.filter((_, idx) => idx !== playerIndex),
            }
          : t
      )
    );
  };

  return (
    <div className="max-w-[1240px] mx-auto px-6 py-10 md:py-14 space-y-10">
      {/* Game Locked Notice */}
      {isGameLocked && (
        <div className="p-4 md:p-5 rounded-2xl bg-[#EAF2EE] border-2 border-[#14543D] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3 text-xs md:text-sm text-[#14543D] font-bold">
            <Lock className="w-5 h-5 shrink-0 mt-0.5 text-[#F07842]" />
            <div className="space-y-0.5">
              <div>إعدادات الفرق والفئات مقفلة تماماً (الجولة قيد التشغيل)</div>
              <p className="text-xs text-[#252824] font-normal">
                بدأت الجولة بالفعل. تم قفل عدد الفرق وأسمائها وألوانها، والفئات الـ {totalRequiredCount} المختارة لمنع التعديل أثناء سير اللعبة حتى إعلان الفائز والبدء في «لعبة جديدة».
              </p>
            </div>
          </div>
          {onGoToBoard && (
            <button
              type="button"
              onClick={onGoToBoard}
              className="px-4 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <span>العودة للوحة اللعب</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      {/* Selected Subcategories Summary Strip (Grouped by Team) */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#14543D]">
              <Layers className="w-4 h-4 text-[#F07842]" />
              <span>
                ملخص فئات اللوحة المختارة ({totalSelectedCount} /{' '}
                {totalRequiredCount} أعمدة · {totalRequiredCount * 5} سؤال):
              </span>
            </div>
            <p className="text-xs text-[#777B73]">
              لكل فريق {SUBCATEGORIES_PER_TEAM} فئات فرعية مستقلة بدون أي تكرار بين الفرق.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onBackToCategories()}
            className="px-4 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] flex items-center gap-2 shrink-0 self-start sm:self-center cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-[#14543D]" />
            <span>
              {isGameLocked
                ? 'عرض الفئات الـ 6 المختارة (مقفلة)'
                : 'الرجوع لتعديل الفئات المختارة'}
            </span>
          </button>
        </div>

        {/* Incomplete Selection Warning if team count was increased */}
        {!isAllTeamsSelectionComplete && (
          <div className="p-4 rounded-xl bg-[#FEF2EC] border-2 border-[#F07842] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs font-bold text-[#D9602B]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                عدد الفرق الحالي ({teams.length} فرق) يتطلب اختيار{' '}
                {totalRequiredCount} فئات فرعية (3 فئات لكل فريق). يرجى إكمال اختيار الفئات المتبقية قبل بدء الجولة.
              </span>
            </div>
            <button
              type="button"
              disabled={isGameLocked}
              onClick={() =>
                onBackToCategories(
                  firstIncompleteTeamIndex >= 0 ? firstIncompleteTeamIndex : 0
                )
              }
              className={`px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold whitespace-nowrap ${
                isGameLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              إكمال اختيار فئات الفرق ({totalSelectedCount}/{totalRequiredCount})
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[#F07842]">
            {isGameLocked
              ? 'معلومات الجولة الحالية · إعدادات الفرق مقفلة'
              : 'الخطوة الثانية · تجهيز الفرق ومراجعة الاختيارات'}
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-[#252824]">
            {isGameLocked ? 'بيانات الفرق المشاركة في الجولة' : 'سوّ فريقك وجهّز المتنافسين'}
          </h1>
          <p className="text-sm text-[#777B73]">
            {isGameLocked
              ? 'الجولة نشطة حالياً. جميع الفرق والفئات مقفلة لمنع التغيير أثناء اللعب.'
              : 'حدد عدد الفرق (3 فئات لكل فريق)، سمّ كل فريق، وتأكد من الفئات الثلاث المختارة لكل فريق قبل فتح لوحة التحدي.'}
          </p>
        </div>

        {/* Team Count & Timer Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-2 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#777B73] px-2 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#14543D]" />
              <span>عدد الفرق:</span>
            </span>
            {[2, 3, 4].map((num) => (
              <button
                key={num}
                type="button"
                disabled={isGameLocked}
                onClick={() => handleTeamCountChange(num)}
                title={isGameLocked ? 'مقفلة أثناء سير الجولة' : undefined}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors ${
                  isGameLocked
                    ? 'cursor-not-allowed opacity-80'
                    : 'cursor-pointer'
                } ${
                  teams.length === num
                    ? 'bg-[#14543D] text-white'
                    : 'text-[#252824] hover:bg-white'
                }`}
              >
                {num} فرق ({num * SUBCATEGORIES_PER_TEAM})
              </button>
            ))}
          </div>

          <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-xl p-2 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#777B73] px-2 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#F07842]" />
              <span>وقت السؤال:</span>
            </span>
            {[30, 45, 60, 90].map((sec) => (
              <button
                key={sec}
                type="button"
                disabled={isGameLocked}
                onClick={() => onUpdateTimer(sec)}
                title={isGameLocked ? 'مقفلة أثناء سير الجولة' : undefined}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors ${
                  isGameLocked
                    ? 'cursor-not-allowed opacity-80'
                    : 'cursor-pointer'
                } ${
                  timerDuration === sec
                    ? 'bg-[#F07842] text-white'
                    : 'text-[#252824] hover:bg-white'
                }`}
              >
                {sec} ث
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Warning if database has 0 approved questions */}
      {approvedQuestionsCount === 0 && (
        <div className="bg-[#FFFFFF] border-2 border-[#F07842] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-bold text-[#252824]">
              تنبيه: قاعدة بيانات Firestore لا تحتوي على أسئلة معتمدة بعد
            </h2>
            <p className="text-xs text-[#777B73]">
              لتشغيل اللوحة بأسئلة حقيقية، يمكنك تعبئة الحزمة التأسيسية المعتمدة في Firestore بضغطة زر.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={onSeedQuestions}
              disabled={seeding}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl whitespace-nowrap shrink-0 flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {seeding
                  ? 'جاري الحفظ في Firestore...'
                  : 'تعبئة الحزمة التأسيسية الآن'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Teams Configuration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {teams.map((team, index) => {
          const teamPicks = (teamSubcategoryIds[team.id] || [])
            .slice(0, SUBCATEGORIES_PER_TEAM)
            .map((id) => subByIdMap.get(id))
            .filter((s): s is SubcategoryItem => Boolean(s));
          const isTeamComplete = teamPicks.length === SUBCATEGORIES_PER_TEAM;

          return (
            <div
              key={team.id}
              className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-4">
                <div className="flex items-center gap-3">
                  <span
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: team.color }}
                  />
                  <span className="font-display text-base font-bold text-[#252824]">
                    الفريق رقم {index + 1}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-lg font-mono tabular-nums text-xs font-bold ${
                    isTeamComplete
                      ? 'bg-[#EAF2EE] text-[#14543D]'
                      : 'bg-[#FEF2EC] text-[#F07842]'
                  }`}
                >
                  الفئات المختارة: {teamPicks.length}/{SUBCATEGORIES_PER_TEAM}
                </span>
              </div>

              {/* Team's 3 Selected Subcategories Box */}
              <div className="p-3.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#252824]">
                    فئات هذا الفريق (3 فئات):
                  </span>
                  {isGameLocked ? (
                    <span className="text-xs font-bold text-[#777B73] flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-[#F07842]" />
                      <span>مقفلة طوال الجولة</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBackToCategories(index)}
                      className="text-xs font-bold text-[#14543D] hover:text-[#F07842] flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>
                        {isTeamComplete ? 'تعديل الفئات' : 'اختيار الفئات الآن'}
                      </span>
                    </button>
                  )}
                </div>

                {teamPicks.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {teamPicks.map((sub) => (
                      <span
                        key={sub.id}
                        className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#C5DDD1] text-xs font-bold text-[#14543D]"
                      >
                        {sub.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#D9602B] font-semibold">
                    لم يختر هذا الفريق فئاته الثلاث بعد (0/3).
                  </p>
                )}
              </div>

              {/* Team Name Input */}
              <div className="space-y-2">
                <label
                  htmlFor={`name-${team.id}`}
                  className="block text-xs font-semibold text-[#252824]"
                >
                  اسم الفريق
                </label>
                <input
                  id={`name-${team.id}`}
                  type="text"
                  disabled={isGameLocked}
                  readOnly={isGameLocked}
                  value={team.name}
                  onChange={(e) => handleNameChange(team.id, e.target.value)}
                  placeholder="مثال: فريق طويق"
                  maxLength={35}
                  className={`w-full px-4 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-sm font-semibold text-[#252824] focus:outline-none focus:border-[#14543D] ${
                    isGameLocked ? 'cursor-not-allowed opacity-80' : ''
                  }`}
                />
              </div>

              {/* Team Color Picker */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#252824]">
                  لون الفريق
                </span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {TEAM_COLOR_OPTIONS.map((c) => {
                    const selected = team.color === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        disabled={isGameLocked}
                        onClick={() => handleColorChange(team.id, c.hex)}
                        title={isGameLocked ? `${c.name} (مقفل)` : c.name}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-transform ${
                          isGameLocked
                            ? 'cursor-not-allowed'
                            : 'cursor-pointer'
                        } ${
                          selected
                            ? 'scale-110 ring-2 ring-offset-2 ring-[#252824]'
                            : isGameLocked
                            ? 'opacity-40'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {selected && <Check className="w-4 h-4 text-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Players List & Add Input */}
              <div className="space-y-3">
                <label
                  htmlFor={`player-input-${team.id}`}
                  className="block text-xs font-semibold text-[#252824]"
                >
                  أعضاء الفريق
                </label>
                {!isGameLocked && (
                  <div className="flex items-center gap-2">
                    <input
                      id={`player-input-${team.id}`}
                      type="text"
                      value={playerInputs[team.id] || ''}
                      onChange={(e) =>
                        setPlayerInputs((prev) => ({
                          ...prev,
                          [team.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddPlayer(team.id);
                        }
                      }}
                      placeholder="اكتب اسم اللاعب واضغط إضافة..."
                      className="flex-1 px-3.5 py-2 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs text-[#252824] focus:outline-none focus:border-[#14543D]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddPlayer(team.id)}
                      className="px-3.5 py-2 bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold rounded-xl flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة</span>
                    </button>
                  </div>
                )}

                {team.players.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {team.players.map((player, pIdx) => (
                      <span
                        key={`${player}-${pIdx}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-medium text-[#252824]"
                      >
                        <span>{player}</span>
                        {!isGameLocked && (
                          <button
                            type="button"
                            onClick={() => handleRemovePlayer(team.id, pIdx)}
                            aria-label={`حذف ${player}`}
                            className="text-[#777B73] hover:text-rose-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#777B73]">
                    ما أضفتوا أسماء لاعبين بعد (اختياري).
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview & Start Action */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E8DD] pb-5">
          <div>
            <div className="text-xs font-semibold text-[#14543D]">
              معاينة المواجهة والملخص النهائي
            </div>
            <h2 className="font-display text-xl font-bold text-[#252824]">
              مين يتحدى مين؟
            </h2>
          </div>
          <div className="text-xs text-[#777B73]">
            <span>عدد الفرق: </span>
            <strong className="font-mono tabular-nums text-[#252824]">
              {teams.length}
            </strong>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>الأعمدة والفئات المختارة: </span>
            <strong className="font-mono tabular-nums text-[#14543D]">
              {totalSelectedCount} / {totalRequiredCount}
            </strong>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>مدة الإجابة: </span>
            <strong className="font-mono tabular-nums text-[#252824]">
              {timerDuration} ثانية
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {teams.map((t, tIdx) => {
            const teamPicks = (teamSubcategoryIds[t.id] || [])
              .slice(0, SUBCATEGORIES_PER_TEAM)
              .map((id) => subByIdMap.get(id)?.name)
              .filter(Boolean);

            return (
              <div
                key={t.id}
                className="p-4 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="font-display text-sm font-bold text-[#252824] truncate">
                      {t.name || `الفريق ${tIdx + 1}`}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#14543D]">
                    {teamPicks.length}/{SUBCATEGORIES_PER_TEAM}
                  </span>
                </div>
                <div className="text-xs text-[#252824] font-semibold">
                  {teamPicks.length > 0
                    ? teamPicks.join(' · ')
                    : 'لم يتم اختيار الفئات بعد'}
                </div>
                <div className="text-[11px] text-[#777B73] truncate">
                  {t.players.length > 0
                    ? t.players.join(' · ')
                    : 'بدون أسماء لاعبين محددة'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onBackToCategories()}
            className="px-5 py-3 text-xs font-bold text-[#252824] bg-[#F3F5E9] hover:bg-[#E5E8DD] rounded-xl transition-colors cursor-pointer"
          >
            {isGameLocked ? 'عرض الفئات المختارة (مقفلة)' : 'الرجوع لتعديل الفئات'}
          </button>

          {isGameLocked ? (
            <button
              type="button"
              onClick={onGoToBoard || onStartGame}
              className="px-8 py-4 text-sm font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer shadow-sm"
            >
              <Lock className="w-4 h-4 text-[#F07842]" />
              <span>العودة إلى لوحة اللعب (الجولة مقفلة)</span>
            </button>
          ) : isAllTeamsSelectionComplete ? (
            <button
              type="button"
              onClick={onStartGame}
              className="px-8 py-4 text-sm font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                يلا نبدأ! افتح لوحة التحدي ({totalRequiredCount} أعمدة)
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onBackToCategories(
                  firstIncompleteTeamIndex >= 0 ? firstIncompleteTeamIndex : 0
                )
              }
              className="px-8 py-4 text-sm font-bold text-[#FFFFFF] bg-[#14543D] hover:bg-[#0E3F2D] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer"
            >
              <Layers className="w-4 h-4" />
              <span>
                أكمل اختيار الـ {totalRequiredCount} فئات أولاً (
                {totalSelectedCount}/{totalRequiredCount})
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
