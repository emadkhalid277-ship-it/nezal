import React, { useState } from 'react';
import { Menu, X, User as UserIcon, LogOut, ShieldCheck, ChevronDown } from 'lucide-react';
import { PageView } from '../types/game';
import { User } from 'firebase/auth';

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
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const navLinks: { id: PageView; label: string; locked?: boolean }[] = [
    { id: 'home', label: 'الرئيسية' },
    {
      id: 'categories',
      label: isGameLocked
        ? `الفئات (${selectedSubcategoriesCount} - مقفلة)`
        : selectedSubcategoriesCount > 0
        ? `اختر الفئات (${selectedSubcategoriesCount})`
        : 'اختر الفئات',
      locked: isGameLocked,
    },
    {
      id: 'setup',
      label: isGameLocked ? 'الفرق (مقفلة)' : 'سوّ فريقك',
      locked: isGameLocked,
    },
    { id: 'contact', label: 'تواصل معنا' },
    ...(isAdmin ? [{ id: 'admin' as PageView, label: 'لوحة المشرف' }] : []),
  ];

  const handleSelect = (page: PageView) => {
    onNavigate(page);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-sm border-b border-[#E5E8DD]">
      <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-6 px-6 py-3.5">
        {/* Zone 1: Nizal Brand Logo & Name + Direct Contact Us Link */}
        <div className="flex items-center gap-4 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelect('home');
            }}
            className="flex items-center gap-3 group"
          >
            <span className="w-11 h-9 rounded-xl bg-[#14543D] overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-[#14543D]/15 group-hover:ring-[#F07842] transition-all">
              <img
                src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                alt={`شعار ${brandName || 'نِزال'}`}
                className="w-full h-full object-contain p-1"
              />
            </span>
            <span className="font-display text-2xl font-bold tracking-tight text-[#14543D] group-hover:text-[#F07842] transition-colors whitespace-nowrap">
              {brandName || 'نِزال'}
            </span>
          </a>

          <span
            className="hidden sm:inline-block h-5 w-px bg-[#E5E8DD]"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={() => handleSelect('contact')}
            className={`hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activePage === 'contact'
                ? 'bg-[#EAF2EE] text-[#14543D]'
                : 'text-[#777B73] hover:text-[#14543D] hover:bg-[#F3F5E9]'
            }`}
          >
            تواصل معنا
          </button>
        </div>

        {/* Zone 2: Top Navigation Links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden md:flex items-center gap-6 text-sm font-medium"
        >
          {navLinks.map((link) => {
            const isActive = activePage === link.id;
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
                {link.label}
                {isActive && (
                  <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-[#F07842] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: User Auth & Primary CTA Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* User Profile / Login Button */}
          {user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] cursor-pointer transition-colors"
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
                  className="absolute left-0 mt-2 w-52 rounded-2xl bg-[#FFFFFF] border border-[#E5E8DD] shadow-xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-right space-y-1"
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

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleSelect('admin')}
                      className="w-full text-right flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#14543D] hover:bg-[#EAF2EE] rounded-xl transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#F07842]" />
                      <span>لوحة تحكم المشرف</span>
                    </button>
                  )}

                  {onLogout && (
                    <button
                      type="button"
                      onClick={onLogout}
                      className="w-full text-right flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
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
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#14543D] cursor-pointer transition-colors"
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
            className="px-4 sm:px-5 py-2 text-xs font-bold text-[#FFFFFF] bg-[#F07842] hover:bg-[#D9632E] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
          >
            {hasActiveGame ? 'كمل التحدي' : 'يلا نلعب'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            className="md:hidden p-2 text-[#252824] hover:bg-[#F3F5E9] rounded-xl border border-[#E5E8DD]"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[#FFFFFF] border-t border-[#E5E8DD] px-6 py-4 space-y-2">
          {user ? (
            <div className="p-3 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#14543D] text-white flex items-center justify-center text-xs font-bold shrink-0">
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
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-white text-xs font-bold"
                  title="تسجيل الخروج"
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
                className="w-full py-2.5 px-3 rounded-xl bg-[#14543D] text-white text-xs font-bold flex items-center justify-center gap-2 mb-2"
              >
                <UserIcon className="w-4 h-4 text-[#F07842]" />
                <span>تسجيل الدخول / حساب جديد</span>
              </button>
            )
          )}

          {navLinks.map((link) => {
            const isActive = activePage === link.id;
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => handleSelect(link.id)}
                className={`w-full text-right block py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[#F3F5E9] text-[#14543D] font-bold'
                    : 'text-[#777B73] hover:bg-[#F3F5E9]/60 hover:text-[#252824]'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
