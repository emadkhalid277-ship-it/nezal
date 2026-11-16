import React, { useState, useEffect } from 'react';
import { Menu, X, User as UserIcon, LogOut, ShieldCheck, ChevronDown, Bookmark, Trophy, Volume2, VolumeX, Users } from 'lucide-react';
import { PageView } from '../types/game';
import { User } from 'firebase/auth';
import { soundFX } from '../services/soundEffects';
import { NotificationsCenter } from './NotificationsCenter';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  brandName: string;
  activePage: PageView;
  onNavigate: (page: PageView) => void;
  hasActiveGame: boolean;
  isGameLocked?: boolean;
  selectedSubcategoriesCount: number;
  user?: User | null;
  isAdmin?: boolean;
  onOpenAuth?: () => void;
  onLogout?: () => void;
  onJoinRoomFromInvite?: (roomCode: string, role: 'player' | 'spectator') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  brandName,
  activePage,
  onNavigate,
  hasActiveGame,
  isGameLocked = false,
  selectedSubcategoriesCount,
  user,
  isAdmin = false,
  onOpenAuth,
  onLogout,
  onJoinRoomFromInvite,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => soundFX.isEnabled());

  useEffect(() => {
    return soundFX.subscribe(setSoundEnabled);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  const navLinks: {
    id: PageView;
    label: string;
    locked?: boolean;
    badge?: string;
  }[] = [
    { id: 'home', label: 'الرئيسية' },
    {
      id: 'online_multiplayer' as PageView,
      label: 'العب عن بُعد',
      badge: 'أونلاين',
    },
    {
      id: 'categories',
      label: isGameLocked
        ? `إعداد اللعبة (${selectedSubcategoriesCount} - مقفلة)`
        : selectedSubcategoriesCount > 0
        ? `إعداد اللعبة (${selectedSubcategoriesCount})`
        : 'إعداد اللعبة',
      locked: isGameLocked,
    },
    { id: 'my_matches' as PageView, label: 'مبارياتي' },
    { id: 'friends' as PageView, label: 'الأصدقاء' },
    { id: 'my_lists' as PageView, label: 'قائمتي الخاصة' },
    { id: 'contact', label: 'تواصل معنا' },
    ...(isAdmin ? [{ id: 'admin' as PageView, label: 'لوحة المشرف' }] : []),
  ];

  const handleSelect = (page: PageView) => {
    if ((page === 'my_lists' || page === 'my_matches' || page === 'friends') && !user) {
      if (onOpenAuth) onOpenAuth();
      setMobileOpen(false);
      return;
    }
    onNavigate(page);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-sm border-b border-[#E5E8DD]">
      <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-2 sm:gap-4 lg:gap-6 px-3 sm:px-6 py-2.5 sm:py-3">
        {/* Zone 1: Nizal Brand Logo & Name */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelect('home');
            }}
            className="flex items-center gap-2.5 sm:gap-3.5 py-0.5 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] rounded-xl"
          >
            <span className="h-9 w-[54px] sm:h-11 sm:w-[66px] md:h-12 md:w-[72px] rounded-xl bg-[#124833] overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-[#14543D]/25 group-hover:ring-[#F07842] shadow-xs transition-all">
              <img
                src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                alt={`شعار ${brandName || 'نِزال'}`}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain p-1 sm:p-1.5 select-none"
              />
            </span>
            <span className="font-display text-lg sm:text-2xl font-bold tracking-tight text-[#14543D] group-hover:text-[#F07842] transition-colors whitespace-nowrap shrink-0">
              {brandName || 'نِزال'}
            </span>
          </a>
        </div>

        {/* Zone 2: Top Navigation Links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden xl:flex items-center gap-5 text-sm font-medium"
        >
          {navLinks.map((link) => {
            const isActive =
              activePage === link.id ||
              (link.id === 'categories' && activePage === 'setup');
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => handleSelect(link.id)}
                className={`relative py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'text-[#14543D] font-bold'
                    : 'text-[#777B73] hover:text-[#252824]'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{link.label}</span>
                  {link.badge && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/20">
                      {link.badge}
                    </span>
                  )}
                </span>
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-[#F07842] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: PWA Install, Sound Toggle, User Auth & Primary CTA Action */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          <PWAInstallButton />

          {/* Sound Effects Toggle (Visible directly on sm+, accessible in mobile menu on narrow phones) */}
          <button
            type="button"
            onClick={() => soundFX.toggle()}
            title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
            aria-label={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
            className={`hidden sm:inline-flex p-2 rounded-xl border transition-colors cursor-pointer ${
              soundEnabled
                ? 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D] hover:bg-[#DDECE4]'
                : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#777B73] hover:text-[#252824]'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          {/* Notifications Center (Bell with live unread count) */}
          {user && onJoinRoomFromInvite && (
            <NotificationsCenter
              user={user}
              onNavigate={handleSelect}
              onJoinRoomFromInvite={onJoinRoomFromInvite}
            />
          )}

          {/* User Profile / Login Button */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 min-h-[38px] sm:min-h-[40px] rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] cursor-pointer transition-colors"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'المستخدم'}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#14543D] text-white flex items-center justify-center text-[10px] font-bold">
                    {(user.displayName || user.email || 'ن')[0].toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:inline-block max-w-[100px] truncate">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
                {isAdmin && (
                  <span className="hidden lg:inline-block px-1.5 py-0.2 rounded text-[10px] bg-[#F07842] text-white font-bold">
                    مشرف
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-[#777B73]" />
              </button>

              {userDropdownOpen && (
                <div
                  className="absolute left-0 mt-2 w-56 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-right space-y-1"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <div className="px-3 py-2 border-b border-[#E5E8DD] space-y-0.5">
                    <div className="text-xs font-bold text-[#252824] truncate">
                      {user.displayName || 'لاعب نِزال'}
                    </div>
                    <div className="text-[11px] text-[#777B73] truncate" dir="ltr">
                      {user.email}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelect('my_lists')}
                    className="w-full text-right flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                  >
                    <Bookmark className="w-4 h-4 text-[#F07842]" />
                    <span>قائمتي الخاصة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelect('my_matches')}
                    className="w-full text-right flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-[#F07842]" />
                    <span>سجل مبارياتي</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelect('friends')}
                    className="w-full text-right flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-[#F07842]" />
                    <span>الأصدقاء</span>
                  </button>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleSelect('admin')}
                      className="w-full text-right flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#F07842]" />
                      <span>لوحة تحكم المشرف</span>
                    </button>
                  )}

                  {onLogout && (
                    <button
                      type="button"
                      onClick={onLogout}
                      className="w-full text-right flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                aria-label="تسجيل الدخول"
                className="flex items-center gap-1.5 px-2.5 sm:px-3.5 min-h-[38px] sm:min-h-[40px] rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#14543D] cursor-pointer transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5 text-[#F07842]" />
                <span className="hidden sm:inline-block">تسجيل الدخول</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() =>
              handleSelect(hasActiveGame ? 'board' : 'categories')
            }
            className="hidden sm:flex px-5 min-h-[40px] text-xs font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs items-center justify-center"
          >
            {hasActiveGame ? 'كمل التحدي' : 'يلا نلعب'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={mobileOpen}
            className="xl:hidden min-w-[44px] min-h-[44px] p-2 text-[#252824] hover:bg-[#F3F5E9] rounded-xl border border-[#E5E8DD] flex items-center justify-center cursor-pointer"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Menu */}
      {mobileOpen && (
        <div className="xl:hidden bg-[#FFFFFF] border-t border-[#E5E8DD] px-4 py-3.5 space-y-1.5 max-h-[calc(100dvh-60px)] overflow-y-auto shadow-lg">
          {user ? (
            <div className="p-3 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[#14543D] text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {(user.displayName || user.email || 'ن')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#252824] truncate">
                    {user.displayName || 'لاعب نِزال'}
                  </div>
                  <div className="text-[10px] text-[#777B73] truncate" dir="ltr">
                    {user.email}
                  </div>
                </div>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="min-w-[40px] min-h-[40px] p-2 rounded-lg text-rose-600 hover:bg-white text-xs font-bold flex items-center justify-center cursor-pointer"
                  title="تسجيل الخروج"
                  aria-label="تسجيل الخروج"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            onOpenAuth && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenAuth();
                }}
                className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-[#14543D] text-white text-xs font-bold flex items-center justify-center gap-2 mb-2 cursor-pointer"
              >
                <UserIcon className="w-4 h-4 text-[#F07842]" />
                <span>تسجيل الدخول / حساب جديد</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() =>
              handleSelect(hasActiveGame ? 'board' : 'categories')
            }
            className="sm:hidden w-full min-h-[44px] py-2.5 px-3.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-sm font-bold flex items-center justify-center mb-2 cursor-pointer transition-colors"
          >
            {hasActiveGame ? 'كمل التحدي' : 'يلا نلعب'}
          </button>

          {navLinks.map((link) => {
            const isActive =
              activePage === link.id ||
              (link.id === 'categories' && activePage === 'setup');
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => handleSelect(link.id)}
                className={`w-full text-right flex items-center justify-between min-h-[44px] py-2.5 px-3.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#EAF2EE] text-[#14543D] font-bold'
                    : 'text-[#252824] hover:bg-[#F3F5E9]/80'
                }`}
              >
                <span>{link.label}</span>
                {link.badge && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF2EE] text-[#14543D]">
                    {link.badge}
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => soundFX.toggle()}
            className="w-full text-right flex items-center justify-between min-h-[44px] py-2.5 px-3.5 rounded-xl text-sm font-medium text-[#252824] hover:bg-[#F3F5E9]/80 sm:hidden cursor-pointer"
          >
            <span>المؤثرات الصوتية</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14543D]">
              {soundEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>مفعّلة</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4 text-[#777B73]" />
                  <span className="text-[#777B73]">مكتومة</span>
                </>
              )}
            </span>
          </button>
        </div>
      )}
    </header>
  );
};
