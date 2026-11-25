import React, { useState, useEffect, useRef } from 'react';
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
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return soundFX.subscribe(setSoundEnabled);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!userDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setUserDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [userDropdownOpen]);

  const navLinks: {
    id: PageView;
    label: string;
    group: 'play' | 'account' | 'other';
    locked?: boolean;
    badge?: string;
  }[] = [
    { id: 'home', label: 'الرئيسية', group: 'play' },
    {
      id: 'online_multiplayer' as PageView,
      label: 'العب عن بُعد',
      badge: 'أونلاين',
      group: 'play',
    },
    {
      id: 'categories',
      label: isGameLocked
        ? `إعداد اللعبة (${selectedSubcategoriesCount} - مقفلة)`
        : selectedSubcategoriesCount > 0
        ? `إعداد اللعبة (${selectedSubcategoriesCount})`
        : 'إعداد اللعبة',
      locked: isGameLocked,
      group: 'play',
    },
    { id: 'my_matches' as PageView, label: 'مبارياتي', group: 'account' },
    { id: 'friends' as PageView, label: 'الأصدقاء', group: 'account' },
    { id: 'my_lists' as PageView, label: 'قائمتي الخاصة', group: 'account' },
    { id: 'how_to_play', label: 'طريقة اللعب', group: 'other' },
    { id: 'contact', label: 'تواصل معنا', group: 'other' },
    ...(isAdmin ? [{ id: 'admin' as PageView, label: 'لوحة المشرف', group: 'other' as const }] : []),
  ];

  const desktopNavLinks = navLinks.filter((l) => l.id !== 'how_to_play');

  const handleSelect = (page: PageView) => {
    if ((page === 'my_lists' || page === 'my_matches' || page === 'friends') && !user) {
      if (onOpenAuth) onOpenAuth();
      setMobileOpen(false);
      return;
    }
    onNavigate(page);
    setMobileOpen(false);
    setUserDropdownOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-sm border-b border-[#E5E8DD]">
        <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-2 sm:gap-4 lg:gap-6 px-3 sm:px-6 py-0.5 sm:py-2.5 min-h-[48px] sm:min-h-[56px]">
          {/* Zone 1: Compact Nizal Brand Logo & Name */}
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                handleSelect('home');
              }}
              className="flex items-center gap-2 sm:gap-3 min-h-[44px] sm:min-h-0 py-0.5 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F07842] rounded-xl"
            >
              <span className="h-9 w-11 sm:h-11 sm:w-[66px] md:h-12 md:w-[72px] rounded-xl bg-[#124833] overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-[#14543D]/25 group-hover:ring-[#F07842] shadow-xs transition-all">
                <img
                  src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                  alt={`شعار ${brandName || 'نِزال'}`}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain p-1 sm:p-1.5 select-none"
                />
              </span>
              <span className="font-display text-base sm:text-2xl font-bold tracking-tight text-[#14543D] group-hover:text-[#F07842] transition-colors whitespace-nowrap shrink-0">
                {brandName || 'نِزال'}
              </span>
            </a>
          </div>

          {/* Zone 2: Desktop Navigation Links */}
          <nav
            aria-label="التنقل الرئيسي"
            className="hidden xl:flex items-center gap-5 text-sm font-medium"
          >
            {desktopNavLinks.map((link) => {
              const isActive =
                activePage === link.id ||
                (link.id === 'categories' && activePage === 'setup');
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleSelect(link.id)}
                  className={`relative py-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-[#14543D] font-bold'
                      : 'text-[#52574E] hover:text-[#1B1F1C]'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span>{link.label}</span>
                    {link.badge && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/20 leading-none">
                        {link.badge}
                      </span>
                    )}
                  </span>
                  {isActive && (
                    <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-[#F07842] rounded-sm" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Primary Mobile+Desktop Play CTA, Notifications, Account & Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <PWAInstallButton />

            {/* Sound Effects Toggle (Desktop/Tablet directly, Mobile inside drawer) */}
            <button
              type="button"
              onClick={() => soundFX.toggle()}
              title={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
              aria-label={soundEnabled ? 'كتم المؤثرات الصوتية' : 'تفعيل المؤثرات الصوتية'}
              className={`hidden sm:inline-flex min-w-[40px] min-h-[40px] items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                soundEnabled
                  ? 'bg-[#EAF2EE] border-[#14543D]/20 text-[#14543D] hover:bg-[#DDECE4]'
                  : 'bg-[#F3F5E9] border-[#E5E8DD] text-[#52574E] hover:text-[#1B1F1C]'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            {/* Primary Play Now CTA — Directly visible on phones and desktop */}
            <button
              type="button"
              onClick={() =>
                handleSelect(hasActiveGame ? 'board' : 'categories')
              }
              data-testid="navbar-play-cta"
              className="flex items-center justify-center min-h-[44px] sm:min-h-[40px] px-3 sm:px-5 text-xs font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] active:scale-[0.98] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
            >
              {hasActiveGame ? 'كمل التحدي' : 'العب الآن'}
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
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  aria-expanded={userDropdownOpen}
                  aria-haspopup="menu"
                  aria-label="حساب المستخدم"
                  onClick={() => setUserDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 min-w-[44px] min-h-[44px] sm:min-h-[40px] justify-center rounded-xl bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#E5E8DD] text-xs font-bold text-[#1B1F1C] cursor-pointer transition-colors"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'المستخدم'}
                      className="w-5 h-5 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-lg bg-[#14543D] text-white flex items-center justify-center text-[10px] font-bold">
                      {(user.displayName || user.email || 'ن')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline-block max-w-[100px] truncate">
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                  {isAdmin && (
                    <span className="hidden lg:inline-block px-1.5 py-0.5 rounded-md text-[10px] bg-[#F07842] text-white font-bold leading-none">
                      مشرف
                    </span>
                  )}
                  <ChevronDown className={`hidden sm:block w-3.5 h-3.5 text-[#52574E] transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {userDropdownOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 mt-2 w-56 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] shadow-xl p-2 z-50 text-right space-y-1"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <div className="px-3 py-2 border-b border-[#E5E8DD] space-y-0.5">
                      <div className="text-xs font-bold text-[#1B1F1C] truncate">
                        {user.displayName || 'لاعب نِزال'}
                      </div>
                      <div className="text-[11px] text-[#52574E] truncate" dir="ltr">
                        {user.email}
                      </div>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelect('my_lists')}
                      className="w-full text-right flex items-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                    >
                      <Bookmark className="w-4 h-4 text-[#F07842]" />
                      <span>قائمتي الخاصة</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelect('my_matches')}
                      className="w-full text-right flex items-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-[#F07842]" />
                      <span>سجل مبارياتي</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelect('friends')}
                      className="w-full text-right flex items-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-[#F07842]" />
                      <span>الأصدقاء</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleSelect('admin')}
                        className="w-full text-right flex items-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#F07842]" />
                        <span>لوحة تحكم المشرف</span>
                      </button>
                    )}

                    {onLogout && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={onLogout}
                        className="w-full text-right flex items-center gap-2 min-h-[44px] px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
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
                  className="flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] sm:min-h-[40px] px-2.5 sm:px-3.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E7EAD8] border border-[#E5E8DD] text-xs font-bold text-[#14543D] cursor-pointer transition-colors"
                >
                  <UserIcon className="w-4 h-4 text-[#F07842]" />
                  <span className="hidden sm:inline-block">تسجيل الدخول</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
              aria-expanded={mobileOpen}
              data-testid="mobile-menu-toggle"
              className="xl:hidden min-w-[44px] min-h-[44px] p-2 text-[#1B1F1C] hover:bg-[#F3F5E9] rounded-xl border border-[#E5E8DD] flex items-center justify-center cursor-pointer transition-colors"
            >
              {mobileOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile & Tablet Clean Slide-Over Navigation Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 xl:hidden flex justify-start"
          role="dialog"
          aria-modal="true"
          aria-label="قائمة التنقل الرئيسية"
          data-testid="mobile-nav-drawer"
        >
          <div
            className="fixed inset-0 bg-[#1B1F1C]/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />

          <aside className="relative z-10 w-[300px] max-w-[86vw] h-full bg-[#FFFFFF] border-l border-[#E5E8DD] shadow-2xl flex flex-col">
            {/* Drawer Header */}
            <div className="px-4 h-14 border-b border-[#E5E8DD] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-11 rounded-lg bg-[#124833] overflow-hidden flex items-center justify-center shrink-0">
                  <img
                    src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                    alt={`شعار ${brandName || 'نِزال'}`}
                    className="w-full h-full object-contain p-1 select-none"
                  />
                </span>
                <span className="font-display text-lg font-bold text-[#14543D]">
                  {brandName || 'نِزال'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="إغلاق القائمة"
                className="min-w-[44px] min-h-[44px] rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-[#1B1F1C] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Drawer Content */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* Account Box */}
              {user ? (
                <div className="p-3 rounded-2xl bg-[#F7F8F1] border border-[#E5E8DD] flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#14543D] text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {(user.displayName || user.email || 'ن')[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#1B1F1C] truncate">
                        {user.displayName || 'لاعب نِزال'}
                      </div>
                      <div className="text-[11px] text-[#52574E] truncate" dir="ltr">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        onLogout();
                      }}
                      className="min-w-[44px] min-h-[44px] rounded-xl text-rose-600 hover:bg-white border border-transparent hover:border-[#E5E8DD] flex items-center justify-center cursor-pointer transition-colors shrink-0"
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
                    className="w-full min-h-[46px] py-2.5 px-3.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <UserIcon className="w-4 h-4 text-[#F07842]" />
                    <span>تسجيل الدخول / حساب جديد</span>
                  </button>
                )
              )}

              {/* Primary Play Action inside Drawer */}
              <button
                type="button"
                onClick={() =>
                  handleSelect(hasActiveGame ? 'board' : 'categories')
                }
                className="w-full min-h-[48px] py-3 px-4 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-sm font-bold flex items-center justify-center cursor-pointer transition-colors shadow-xs"
              >
                {hasActiveGame ? 'كمل التحدي' : 'العب الآن'}
              </button>

              {/* Grouped Navigation */}
              {[
                { key: 'play' as const, title: 'اللعب والمنافسات' },
                { key: 'account' as const, title: 'حسابي والأصدقاء' },
                { key: 'other' as const, title: 'معلومات ودعم' },
              ].map((group) => {
                const items = navLinks.filter((l) => l.group === group.key);
                if (items.length === 0) return null;
                return (
                  <div key={group.key} className="space-y-1">
                    <div className="px-2 pb-1 text-[11px] font-bold text-[#666B62]">
                      {group.title}
                    </div>
                    {items.map((link) => {
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
                              ? 'bg-[#EAF2EE] text-[#14543D] font-bold border border-[#14543D]/15'
                              : 'text-[#1B1F1C] hover:bg-[#F3F5E9]/80 border border-transparent'
                          }`}
                        >
                          <span>{link.label}</span>
                          {link.badge && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#EAF2EE] text-[#14543D] border border-[#14543D]/15">
                              {link.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Preferences & PWA Install */}
              <div className="pt-2 border-t border-[#E5E8DD] space-y-2">
                <button
                  type="button"
                  onClick={() => soundFX.toggle()}
                  className="w-full text-right flex items-center justify-between min-h-[44px] py-2.5 px-3.5 rounded-xl text-sm font-medium text-[#1B1F1C] bg-[#F7F8F1] hover:bg-[#F3F5E9] border border-[#E5E8DD] cursor-pointer transition-colors"
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
                        <VolumeX className="w-4 h-4 text-[#52574E]" />
                        <span className="text-[#52574E]">مكتومة</span>
                      </>
                    )}
                  </span>
                </button>

                <PWAInstallButton
                  variant="drawer"
                  onAction={() => setMobileOpen(false)}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
};
