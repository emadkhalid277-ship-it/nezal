import React, { useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronLeft,
  Edit3,
  FileText,
  Flag,
  Flame,
  HelpCircle,
  Info,
  Mail,
  MessageCircle,
  Send,
  Shield,
  X,
} from 'lucide-react';
import { ContactSettings, PageView } from '../types/game';

interface FooterProps {
  brandName: string;
  onUpdateBrandName: (newName: string) => void;
  onNavigate: (page: PageView) => void;
  isAdmin?: boolean;
  contactSettings?: ContactSettings;
}

type FooterModalType = 'about' | 'faq' | 'privacy' | 'terms' | 'report' | null;

function formatWhatsAppHref(raw?: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  const digits = cleaned.replace(/[^0-9]/g, '');
  return digits.length > 0 ? `https://wa.me/${digits}` : '';
}

function normalizeExternalUrl(raw?: string): string {
  const cleaned = (raw || '').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  return `https://${cleaned}`;
}

export const Footer: React.FC<FooterProps> = ({
  brandName,
  onUpdateBrandName,
  onNavigate,
  isAdmin = false,
  contactSettings,
}) => {
  const [editingBrand, setEditingBrand] = useState(false);
  const [draftBrand, setDraftBrand] = useState(brandName);
  const [activeModal, setActiveModal] = useState<FooterModalType>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);

  // Report modal state
  const [reportType, setReportType] = useState<'question' | 'bug' | 'suggestion'>(
    'question'
  );
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

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

  const goToHowToPlay = () => {
    goTo('how_to_play');
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const whatsappHref = formatWhatsAppHref(contactSettings?.whatsappUrl);
  const emailAddress = (contactSettings?.emailAddress || '').trim();
  const emailHref = emailAddress ? `mailto:${emailAddress}` : '';

  const socialChannels = [
    {
      id: 'twitter',
      label: 'إكس (تويتر)',
      shortLabel: 'X',
      url: normalizeExternalUrl(contactSettings?.twitterUrl),
      svg: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      id: 'instagram',
      label: 'إنستغرام',
      shortLabel: 'IG',
      url: normalizeExternalUrl(contactSettings?.instagramUrl),
      svg: (
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 stroke-current fill-none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      ),
    },
    {
      id: 'tiktok',
      label: 'تيك توك',
      shortLabel: 'TT',
      url: normalizeExternalUrl(contactSettings?.tiktokUrl),
      svg: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.87a8.16 8.16 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.3z" />
        </svg>
      ),
    },
    {
      id: 'snapchat',
      label: 'سناب شات',
      shortLabel: 'SC',
      url: normalizeExternalUrl(contactSettings?.snapchatUrl),
      svg: (
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
          <path d="M12.2 2c2.8 0 5.1 2 5.3 4.8.1 1 .1 1.8.1 2.5.4.1.9.1 1.4.4.4.2.6.6.5 1-.1.5-.6.8-1.1 1-.3.1-.5.2-.7.4.3.9.9 1.8 1.9 2.5.6.4 1.1.7 1.1 1.3 0 .6-.6 1-1.3 1.2-.5.2-1 .3-1.4.6-.3.3-.4.7-.7 1.1-.4.5-1 .6-1.7.4-.9-.2-1.8-.5-2.8-.5s-1.9.3-2.8.5c-.7.2-1.3.1-1.7-.4-.3-.4-.4-.8-.7-1.1-.4-.3-.9-.4-1.4-.6-.7-.2-1.3-.6-1.3-1.2 0-.6.5-.9 1.1-1.3 1-.7 1.6-1.6 1.9-2.5-.2-.2-.4-.3-.7-.4-.5-.2-1-.5-1.1-1-.1-.4.1-.8.5-1 .5-.3 1-.3 1.4-.4 0-.7 0-1.5.1-2.5C7.1 4 9.4 2 12.2 2z" />
        </svg>
      ),
    },
  ];

  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDetails.trim()) return;
    setReportSubmitted(true);
  };

  const reportTypeLabel =
    reportType === 'question'
      ? 'بلاغ عن سؤال'
      : reportType === 'bug'
      ? 'بلاغ عن مشكلة تقنية'
      : 'اقتراح تطوير';
  const formattedReportText = `[${reportTypeLabel} - ${brandName || 'نِزال'}]\n${reportDetails.trim()}`;
  const reportWhatsappLink = whatsappHref
    ? `${whatsappHref}${whatsappHref.includes('?') ? '&' : '?'}text=${encodeURIComponent(
        formattedReportText
      )}`
    : '';
  const reportEmailLink = emailHref
    ? `${emailHref}?subject=${encodeURIComponent(
        `${reportTypeLabel} - نِزال`
      )}&body=${encodeURIComponent(formattedReportText)}`
    : '';

  const faqItems = [
    {
      q: 'ما الفرق بين اللعب المحلي والأونلاين في نِزال؟',
      a: 'اللعب المحلي يتيح لفريقين حتى 4 فرق التنافس على نفس الجهاز بالتناوب، بينما يتيح اللعب عن بُعد (أونلاين) إنشاء غرفة خاصة برمز فريد لدعوة الأصدقاء والمنافسين والمشاهدين من أجهزتهم.',
    },
    {
      q: 'كيف يتم اختيار الفئات قبل بداية المباراة؟',
      a: 'يختار كل فريق 3 فئات فرعية مستقلة من التصنيفات المتاحة دون تكرار، ثم تبدأ لوحة التحدي بمستويات نقاط من 100 إلى 500 نقطة.',
    },
    {
      q: 'هل يمكنني إضافة أسئلتي الخاصة أو مشاركتها؟',
      a: 'نعم، بعد تسجيل الدخول يمكنك إنشاء قوائم أسئلة خاصة من صفحة «قائمتي الخاصة» وإرسال مساهماتك لمراجعتها ونشرها في بنك نِزال.',
    },
    {
      q: 'كيف أدعو صديقاً للعب أو المشاهدة؟',
      a: 'من صفحة «الأصدقاء» أضف أصدقاءك باسم المستخدم، وبمجرد قبول الطلب يمكنك إرسال دعوة لعب أو دعوة مشاهدة مباشرة لأي غرفة نشطة.',
    },
  ];

  const displayYear = Math.max(2026, new Date().getFullYear());

  return (
    <>
      <footer className="relative bg-[#1B1F1C] text-[#F3F5E9] border-t-2 border-[#F07842] mt-16 overflow-hidden">
        {/* Subtle decorative top glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#F07842]/10 to-transparent"
        />

        <div className="relative max-w-[1320px] mx-auto px-6 pt-12 pb-8">
          {/* Main 3-Column Responsive Grid (Logo centered on desktop, first on mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-10 border-b border-white/10 items-start">
            {/* Column 1 (Right in RTL): روابط مهمة */}
            <div className="lg:col-span-4 order-2 lg:order-1 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-5 rounded-full bg-[#F07842]" />
                <h2 className="font-display text-base font-bold text-[#FFFFFF]">
                  روابط مهمة
                </h2>
              </div>

              <ul className="space-y-2.5 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => goTo('home')}
                    className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-[#F07842]/70 group-hover:text-[#F07842] transition-colors" />
                    <span>الرئيسية</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={goToHowToPlay}
                    className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-[#F07842]/70 group-hover:text-[#F07842] transition-colors" />
                    <span>طريقة اللعب</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveModal('faq')}
                    className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-[#F07842]/70 group-hover:text-[#F07842] transition-colors" />
                    <span>الأسئلة الشائعة</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => goTo('contact')}
                    className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-[#F07842]/70 group-hover:text-[#F07842] transition-colors" />
                    <span>تواصل معنا</span>
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 2 (Center): شعار نِزال + التحدي يبدأ هنا! + الوصف + التواصل الاجتماعي */}
            <div className="md:col-span-2 lg:col-span-4 order-1 lg:order-2 flex flex-col items-center text-center space-y-4">
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => goTo('home')}
                  aria-label={brandName || 'نِزال'}
                  className="w-16 h-14 rounded-2xl bg-[#14543D] overflow-hidden flex items-center justify-center ring-2 ring-[#F07842]/60 shadow-lg shadow-black/30 hover:scale-105 hover:ring-[#F07842] transition-all duration-200 cursor-pointer"
                >
                  <img
                    src="/assets/aistudio/Screenshot_2026-11-03_192625_a95ae528.png"
                    alt={`شعار ${brandName || 'نِزال'}`}
                    className="w-full h-full object-contain p-1.5"
                  />
                </button>

                {!editingBrand ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => goTo('home')}
                      className="font-display text-2xl font-bold text-[#FFFFFF] hover:text-[#F07842] transition-colors cursor-pointer"
                    >
                      {brandName || 'نِزال'}
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftBrand(brandName);
                          setEditingBrand(true);
                        }}
                        title="تعديل اسم المنصة"
                        className="text-[11px] text-[#B8BDB3] hover:text-white flex items-center gap-1 px-2 py-0.5 rounded-lg border border-white/15 bg-white/5 cursor-pointer transition-colors"
                      >
                        <Edit3 className="w-3 h-3 text-[#F07842]" />
                        <span>تغيير</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={handleSaveBrand}
                    className="flex items-center justify-center gap-2"
                  >
                    <input
                      type="text"
                      value={draftBrand}
                      onChange={(e) => setDraftBrand(e.target.value)}
                      maxLength={40}
                      className="px-3 py-1.5 text-sm bg-[#252824] border border-[#F07842] rounded-lg text-white focus:outline-none"
                      aria-label="اسم المنصة"
                    />
                    <button
                      type="submit"
                      className="p-1.5 bg-[#F07842] text-white rounded-lg hover:bg-[#D9632E] cursor-pointer"
                      aria-label="حفظ الاسم"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </form>
                )}
              </div>

              <div className="space-y-1.5 max-w-xs">
                <p className="font-display text-base font-bold text-[#F07842]">
                  التحدي يبدأ هنا!
                </p>
                <p className="text-xs sm:text-sm text-[#D5D9CE] leading-relaxed">
                  اجمع فريقك، اختر فئاتك، واثبت إنك الأفضل
                </p>
              </div>

              {/* Social Media Links */}
              <div className="pt-1 space-y-2 w-full flex flex-col items-center">
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {socialChannels.map((ch) =>
                    ch.url ? (
                      <a
                        key={ch.id}
                        href={ch.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={ch.label}
                        aria-label={ch.label}
                        className="w-10 h-10 rounded-xl bg-[#252824] border border-white/15 text-[#F3F5E9] hover:bg-[#F07842] hover:border-[#F07842] hover:text-white hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center shadow-xs"
                      >
                        {ch.svg}
                      </a>
                    ) : (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          setSocialNotice(
                            `حساب ${ch.label} جاهز للربط عبر لوحة التحكم أو صفحة تواصل معنا.`
                          );
                          window.setTimeout(() => setSocialNotice(null), 4000);
                        }}
                        title={`${ch.label} — متاح للربط قريباً`}
                        aria-label={`${ch.label} — متاح للربط`}
                        className="w-10 h-10 rounded-xl bg-[#252824]/70 border border-white/10 text-[#9FA599] hover:border-[#F07842]/70 hover:text-[#F07842] hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center cursor-pointer"
                      >
                        {ch.svg}
                      </button>
                    )
                  )}

                  {whatsappHref ? (
                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="واتساب نِزال"
                      aria-label="واتساب نِزال"
                      className="w-10 h-10 rounded-xl bg-[#252824] border border-white/15 text-[#F3F5E9] hover:bg-[#14543D] hover:border-[#14543D] hover:text-white hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center shadow-xs"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => goTo('contact')}
                      title="قنوات التواصل المباشر"
                      aria-label="قنوات التواصل المباشر"
                      className="w-10 h-10 rounded-xl bg-[#252824]/70 border border-white/10 text-[#9FA599] hover:border-[#14543D] hover:text-white hover:bg-[#14543D] hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}

                  {emailHref && (
                    <a
                      href={emailHref}
                      title="البريد الإلكتروني"
                      aria-label="البريد الإلكتروني"
                      className="w-10 h-10 rounded-xl bg-[#252824] border border-white/15 text-[#F3F5E9] hover:bg-[#F07842] hover:border-[#F07842] hover:text-white hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center shadow-xs"
                    >
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {socialNotice && (
                  <p className="text-[11px] text-[#FFB088] font-medium px-3 py-1 rounded-lg bg-[#252824] border border-[#F07842]/30">
                    {socialNotice}
                  </p>
                )}
              </div>
            </div>

            {/* Column 3 (Left in RTL): عن نِزال + الإبلاغ عن سؤال أو مشكلة */}
            <div className="lg:col-span-4 order-3 lg:order-3 lg:flex lg:flex-col lg:items-end space-y-4">
              <div className="w-full lg:max-w-[260px] space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-5 rounded-full bg-[#14543D]" />
                  <h2 className="font-display text-base font-bold text-[#FFFFFF]">
                    عن نِزال
                  </h2>
                </div>

                <ul className="space-y-2.5 text-sm">
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveModal('about')}
                      className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-[#14543D] group-hover:text-[#F07842] transition-colors" />
                      <span>عن المنصة</span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveModal('privacy')}
                      className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5 text-[#14543D] group-hover:text-[#F07842] transition-colors" />
                      <span>سياسة الخصوصية</span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveModal('terms')}
                      className="group inline-flex items-center gap-2 text-[#B8BDB3] hover:text-[#F07842] transition-all duration-200 hover:-translate-x-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#14543D] group-hover:text-[#F07842] transition-colors" />
                      <span>شروط الاستخدام</span>
                    </button>
                  </li>
                </ul>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setReportSubmitted(false);
                      setReportDetails('');
                      setActiveModal('report');
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#F07842]/15 hover:bg-[#F07842] border border-[#F07842]/40 hover:border-[#F07842] text-[#FFB088] hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer"
                  >
                    <Flag className="w-3.5 h-3.5 shrink-0" />
                    <span>الإبلاغ عن سؤال أو مشكلة</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Copyright + Signature + Back to Top */}
          <div className="pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#9FA599]">
            <p className="font-medium text-center md:text-right" dir="rtl">
              © {displayYear} NIZAL — جميع الحقوق محفوظة.
            </p>

            <p className="inline-flex items-center gap-1.5 text-[#D5D9CE] font-semibold">
              <Flame className="w-3.5 h-3.5 text-[#F07842]" />
              <span>صُنع بشغف لعشاق التحدي</span>
            </p>

            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#252824] hover:bg-[#F07842] border border-white/15 hover:border-[#F07842] text-[#F3F5E9] hover:text-white font-bold transition-all duration-200 cursor-pointer group"
            >
              <span>العودة إلى أعلى الصفحة</span>
              <ArrowUp className="w-3.5 h-3.5 text-[#F07842] group-hover:text-white group-hover:-translate-y-0.5 transition-all" />
            </button>
          </div>
        </div>
      </footer>

      {/* Contextual Footer Info / FAQ / Legal / Report Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#181C19]/75 backdrop-blur-xs"
          onClick={() => setActiveModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-xl bg-[#FFFFFF] border border-[#E5E8DD] rounded-2xl p-6 sm:p-7 space-y-5 text-[#252824] shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E8DD] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#FEF2EC] border border-[#F07842]/30 text-[#F07842] flex items-center justify-center">
                  {activeModal === 'faq' && <HelpCircle className="w-5 h-5" />}
                  {activeModal === 'about' && <Info className="w-5 h-5" />}
                  {activeModal === 'privacy' && <Shield className="w-5 h-5" />}
                  {activeModal === 'terms' && <FileText className="w-5 h-5" />}
                  {activeModal === 'report' && <Flag className="w-5 h-5" />}
                </div>
                <h3 className="font-display text-lg font-bold text-[#252824]">
                  {activeModal === 'faq' && 'الأسئلة الشائعة'}
                  {activeModal === 'about' && `عن منصة ${brandName || 'نِزال'}`}
                  {activeModal === 'privacy' && 'سياسة الخصوصية'}
                  {activeModal === 'terms' && 'شروط الاستخدام'}
                  {activeModal === 'report' && 'الإبلاغ عن سؤال أو مشكلة'}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label="إغلاق النافذة"
                className="p-1.5 rounded-lg text-[#777B73] hover:text-[#252824] hover:bg-[#F3F5E9] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {activeModal === 'faq' && (
              <div className="space-y-3">
                {faqItems.map((item) => (
                  <div
                    key={item.q}
                    className="p-4 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] space-y-1.5"
                  >
                    <h4 className="font-display text-sm font-bold text-[#14543D]">
                      {item.q}
                    </h4>
                    <p className="text-xs sm:text-sm text-[#252824]/85 leading-relaxed">
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeModal === 'about' && (
              <div className="space-y-3 text-sm text-[#252824]/90 leading-relaxed">
                <p>
                  <strong>{brandName || 'نِزال'} (NIZAL)</strong> منصة عربية تفاعلية لتحدي المعلومات الجماعية، صُممت لتجمع الأصدقاء والعائلة في منافسات حماسية سواءً على جهاز واحد محلياً أو عن بُعد عبر غرف الأونلاين المباشرة.
                </p>
                <p>
                  تضم المنصة عشرات الفئات المتنوعة، وآلية عادلة لاختيار 3 فئات لكل فريق، ونظام أصدقاء ودعوات، وقوائم أسئلة مخصصة يصنعها اللاعبون بأنفسهم.
                </p>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="space-y-3 text-sm text-[#252824]/90 leading-relaxed">
                <p>
                  نحترم خصوصية لاعبي <strong>{brandName || 'نِزال'}</strong> ونلتزم بحماية بيانات الحسابات والمباريات:
                </p>
                <ul className="list-disc pr-5 space-y-1.5 text-xs sm:text-sm text-[#777B73]">
                  <li>يُستخدم البريد الإلكتروني واسم العرض لإدارة حسابك وحفظ سجل مبارياتك وقوائمك فقط.</li>
                  <li>لا يتم مشاركة بريدك الإلكتروني مع اللاعبين الآخرين في البحث أو قائمة الأصدقاء.</li>
                  <li>يمكنك التحكم في استقبال دعوات اللعب والمشاهدة أو حظر أي مستخدم في أي وقت من صفحة الأصدقاء.</li>
                </ul>
              </div>
            )}

            {activeModal === 'terms' && (
              <div className="space-y-3 text-sm text-[#252824]/90 leading-relaxed">
                <p>
                  باستخدامك منصة <strong>{brandName || 'نِزال'}</strong> فإنك توافق على الالتزام بالضوابط التالية:
                </p>
                <ul className="list-disc pr-5 space-y-1.5 text-xs sm:text-sm text-[#777B73]">
                  <li>الالتزام باللعب النظيف واحترام جميع اللاعبين داخل الغرف والمنافسات.</li>
                  <li>عند إرسال مساهمات أو أسئلة جديدة، يجب أن يكون المحتوى دقيقاً وخالياً من أي إساءة.</li>
                  <li>تخضع الأسئلة المقترحة لمراجعة فريق الإشراف قبل اعتمادها في بنك الأسئلة العام.</li>
                </ul>
              </div>
            )}

            {activeModal === 'report' && (
              <form onSubmit={handleSubmitReport} className="space-y-4">
                {reportSubmitted ? (
                  <div className="p-4 rounded-xl bg-[#EAF2EE] border border-[#14543D]/30 text-sm font-bold text-[#14543D] space-y-3">
                    <p>تم تجهيز بلاغك بنجاح! شكراً لمساعدتنا في تحسين منصة نِزال.</p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {reportWhatsappLink && (
                        <a
                          href={reportWhatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>إرسال عبر واتساب</span>
                        </a>
                      )}
                      {reportEmailLink && (
                        <a
                          href={reportEmailLink}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs font-bold transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>إرسال عبر البريد الإلكتروني</span>
                        </a>
                      )}
                      {!reportWhatsappLink && !reportEmailLink && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            goTo('contact');
                          }}
                          className="px-4 py-2 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold cursor-pointer"
                        >
                          الانتقال لصفحة تواصل معنا
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <span className="block text-xs font-bold text-[#252824]">
                        نوع البلاغ:
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'question' as const, label: 'بلاغ عن سؤال' },
                          { id: 'bug' as const, label: 'مشكلة تقنية' },
                          { id: 'suggestion' as const, label: 'اقتراح تحسين' },
                        ].map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setReportType(opt.id)}
                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              reportType === opt.id
                                ? 'bg-[#14543D] text-white border-[#14543D]'
                                : 'bg-[#F3F5E9] text-[#252824] border-[#E5E8DD] hover:border-[#14543D]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="footer-report-details"
                        className="block text-xs font-bold text-[#252824]"
                      >
                        تفاصيل البلاغ أو اسم الفئة / السؤال:
                      </label>
                      <textarea
                        id="footer-report-details"
                        rows={4}
                        required
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        placeholder="اكتب نص السؤال أو وصف المشكلة بوضوح لنتمكن من معالجتها سريعاً..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs sm:text-sm text-[#252824] focus:outline-none focus:border-[#14543D]"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModal(null);
                          goTo('contact');
                        }}
                        className="text-xs font-bold text-[#14543D] hover:text-[#F07842] cursor-pointer"
                      >
                        أو عرض جميع قنوات التواصل →
                      </button>

                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>إرسال البلاغ</span>
                      </button>
                    </div>
                  </>
                )}
              </form>
            )}

            <div className="pt-2 border-t border-[#E5E8DD] flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] text-xs font-bold text-[#252824] cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
