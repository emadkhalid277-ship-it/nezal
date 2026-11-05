import React from 'react';
import {
  MessageCircle,
  Mail,
  Globe,
  ArrowRight,
  Settings,
  ExternalLink,
} from 'lucide-react';
import { ContactSettings, PageView } from '../types/game';

interface ContactPageProps {
  contactSettings: ContactSettings;
  isAdmin: boolean;
  onNavigate: (page: PageView) => void;
}

function formatWhatsAppHref(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned;
  }
  const digits = cleaned.replace(/[^0-9]/g, '');
  if (digits.length > 0) {
    return `https://wa.me/${digits}`;
  }
  return '';
}

export const ContactPage: React.FC<ContactPageProps> = ({
  contactSettings,
  isAdmin,
  onNavigate,
}) => {
  const whatsappHref = formatWhatsAppHref(contactSettings.whatsappUrl);
  const emailHref = contactSettings.emailAddress.trim()
    ? `mailto:${contactSettings.emailAddress.trim()}`
    : '';

  const socialLinks = [
    {
      id: 'twitter',
      label: 'منصة X (تويتر)',
      url: contactSettings.twitterUrl.trim(),
    },
    {
      id: 'instagram',
      label: 'إنستغرام (Instagram)',
      url: contactSettings.instagramUrl.trim(),
    },
    {
      id: 'tiktok',
      label: 'تيك توك (TikTok)',
      url: contactSettings.tiktokUrl.trim(),
    },
    {
      id: 'snapchat',
      label: 'سناب شات (Snapchat)',
      url: contactSettings.snapchatUrl.trim(),
    },
  ];

  const activeSocials = socialLinks.filter((s) => s.url.length > 0);

  return (
    <div className="max-w-[920px] mx-auto px-6 py-10 md:py-14 space-y-8">
      {/* Top Back Bar */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="px-4 py-2.5 rounded-xl bg-[#FFFFFF] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs sm:text-sm font-bold text-[#252824] flex items-center gap-2 transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4 text-[#14543D]" />
          <span>الرجوع للرئيسية</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className="px-4 py-2.5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>تعديل بيانات التواصل من لوحة المشرف</span>
          </button>
        )}
      </div>

      {/* Main Contact Card */}
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl p-8 md:p-12 space-y-10">
        {/* Heading & Short Inviting Message */}
        <div className="space-y-3 text-right max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#F07842]">
            <span className="w-2 h-2 rounded-full bg-[#F07842]" />
            <span>تواصل معنا · نِزال</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#252824]">
            {contactSettings.heading || 'حنا هنا لمساعدتك!'}
          </h1>
          <p className="text-base md:text-lg text-[#777B73] leading-relaxed">
            {contactSettings.message ||
              'يسعدنا في «نِزال» استقبال استفساراتكم وملاحظاتكم واقتراحاتكم في أي وقت. تواصلوا معنا مباشرة عبر القنوات التالية:'}
          </p>
        </div>

        {/* Primary Contact Channels: WhatsApp & Email */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* WhatsApp Card */}
          <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#EAF2EE] border border-[#C5DDD1] text-[#14543D] flex items-center justify-center">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-[#252824]">
                  تواصل عبر واتساب
                </h2>
                <p className="text-xs text-[#777B73]">
                  للدعم المباشر والرد السريع على استفساراتكم
                </p>
              </div>
            </div>

            {whatsappHref ? (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-5 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white font-display text-sm font-bold flex items-center justify-between transition-colors"
              >
                <span>
                  {contactSettings.whatsappDisplay.trim() ||
                    'مراسلة عبر واتساب'}
                </span>
                <ExternalLink className="w-4 h-4" />
              </a>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-dashed border-[#E5E8DD] flex items-center justify-between gap-2 text-xs text-[#777B73]">
                <span>رابط الواتساب (يُضبط من لوحة المشرف)</span>
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="font-bold text-[#14543D] hover:text-[#F07842] cursor-pointer shrink-0"
                >
                  إعداد الرابط
                </button>
              </div>
            )}
          </div>

          {/* Email Card */}
          <div className="bg-[#F3F5E9] border border-[#E5E8DD] rounded-2xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#FEF2EC] border border-[#F7D4C4] text-[#F07842] flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-xl font-bold text-[#252824]">
                  البريد الإلكتروني
                </h2>
                <p className="text-xs text-[#777B73]">
                  للاقتراحات، الشراكات، والرسائل التفصيلية
                </p>
              </div>
            </div>

            {emailHref ? (
              <a
                href={emailHref}
                className="w-full py-3.5 px-5 rounded-xl bg-[#F07842] hover:bg-[#D9632E] text-white font-display text-sm font-bold flex items-center justify-between transition-colors"
              >
                <span className="font-mono text-xs sm:text-sm truncate">
                  {contactSettings.emailAddress.trim()}
                </span>
                <ExternalLink className="w-4 h-4 shrink-0" />
              </a>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#FFFFFF] border border-dashed border-[#E5E8DD] flex items-center justify-between gap-2 text-xs text-[#777B73]">
                <span>البريد الإلكتروني (يُضبط من لوحة المشرف)</span>
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="font-bold text-[#F07842] hover:text-[#14543D] cursor-pointer shrink-0"
                >
                  إعداد البريد
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Optional Social Media Links Section */}
        <div className="pt-6 border-t border-[#E5E8DD] space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#252824]">
            <Globe className="w-4 h-4 text-[#14543D]" />
            <span>حسابات التواصل الاجتماعي</span>
          </div>

          {activeSocials.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              {activeSocials.map((social) => (
                <a
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-[#F3F5E9] hover:bg-[#E5E8DD] border border-[#E5E8DD] text-xs font-bold text-[#252824] flex items-center gap-2 transition-colors"
                >
                  <span>{social.label}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#14543D]" />
                </a>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#F3F5E9]/70 border border-dashed border-[#E5E8DD] flex flex-wrap items-center justify-between gap-3 text-xs text-[#777B73]">
              <span>
                روابط حسابات التواصل الاجتماعي اختيارية ويمكن إضافتها أو تعديلها في أي وقت من لوحة تحكم المشرف.
              </span>
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="font-bold text-[#14543D] hover:text-[#F07842] cursor-pointer"
              >
                إدارة حسابات التواصل
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
