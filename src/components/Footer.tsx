import React, { useState } from 'react';
import { Edit3, Check } from 'lucide-react';
import { PageView } from '../types/game';

interface FooterProps {
  brandName: string;
  onUpdateBrandName: (newName: string) => void;
  onNavigate: (page: PageView) => void;
  isAdmin?: boolean;
}

export const Footer: React.FC<FooterProps> = ({
  brandName,
  onUpdateBrandName,
  onNavigate,
  isAdmin = false,
}) => {
  const [editingBrand, setEditingBrand] = useState(false);
  const [draftBrand, setDraftBrand] = useState(brandName);

  const handleSaveBrand = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = draftBrand.trim();
    if (cleaned) {
      onUpdateBrandName(cleaned);
    }
    setEditingBrand(false);
  };

  const goTo = (page: PageView) => {
    onNavigate(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#FFFFFF] border-t border-[#E5E8DD] mt-16">
      <div className="max-w-[1320px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-8 border-b border-[#E5E8DD] items-start">
          {/* Configurable Logo, Brand Name & Short Description */}
          <div className="md:col-span-7 space-y-3">
            <div className="flex items-center gap-3">
              {/* Nizal Brand Logo */}
              <button
                type="button"
                onClick={() => goTo('home')}
                className="w-12 h-10 rounded-xl bg-[#14543D] overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-[#14543D]/15 hover:ring-[#F07842] transition-all cursor-pointer"
                aria-label={brandName}
              >
                <img
                  src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                  alt={`شعار ${brandName || 'نِزال'}`}
                  className="w-full h-full object-contain p-1"
                />
              </button>

              {!editingBrand ? (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => goTo('home')}
                    className="font-display text-xl font-bold text-[#252824] hover:text-[#14543D] transition-colors cursor-pointer"
                  >
                    {brandName}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraftBrand(brandName);
                        setEditingBrand(true);
                      }}
                      title="تعديل اسم المنصة"
                      className="text-xs text-[#777B73] hover:text-[#252824] flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E5E8DD] bg-[#F3F5E9]/70 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>تغيير الاسم</span>
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSaveBrand} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draftBrand}
                    onChange={(e) => setDraftBrand(e.target.value)}
                    maxLength={40}
                    className="px-3 py-1.5 text-sm bg-[#F3F5E9] border border-[#14543D] rounded-lg text-[#252824] focus:outline-none"
                    aria-label="اسم المنصة"
                  />
                  <button
                    type="submit"
                    className="p-1.5 bg-[#14543D] text-white rounded-lg hover:bg-[#0E3F2D] cursor-pointer"
                    aria-label="حفظ الاسم"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>

            <p className="text-sm text-[#777B73] leading-relaxed max-w-lg">
              منصة تحدي المعلومات الجماعية للجمعات والأصحاب. كوّنوا فرقكم، اختاروا فئاتكم المفضلة، وتنافسوا في جولات حماسية.
            </p>
          </div>

          {/* Basic Navigation Links */}
          <div className="md:col-span-5 flex flex-wrap md:justify-end gap-x-6 gap-y-3 text-sm font-semibold text-[#777B73]">
            <button
              type="button"
              onClick={() => goTo('home')}
              className="hover:text-[#14543D] transition-colors cursor-pointer"
            >
              الرئيسية
            </button>
            <button
              type="button"
              onClick={() => goTo('categories')}
              className="hover:text-[#14543D] transition-colors cursor-pointer"
            >
              إعداد اللعبة
            </button>
            <button
              type="button"
              onClick={() => goTo('board')}
              className="hover:text-[#14543D] transition-colors cursor-pointer"
            >
              لوحة التحدي
            </button>
            <button
              type="button"
              onClick={() => goTo('contact')}
              className="hover:text-[#14543D] transition-colors cursor-pointer"
            >
              تواصل معنا
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => goTo('admin')}
                className="hover:text-[#14543D] text-[#F07842] font-bold transition-colors cursor-pointer"
              >
                لوحة المشرف
              </button>
            )}
          </div>
        </div>

        {/* Copyright Information */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#777B73]">
          <p>© {new Date().getFullYear()} {brandName}. جميع الحقوق محفوظة.</p>
          <p>تحدي المعلومات الجماعي بالفرق</p>
        </div>
      </div>
    </footer>
  );
};
