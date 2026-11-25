import React, { useState } from 'react';
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User as UserIcon,
  Loader2,
} from 'lucide-react';
import {
  signInWithEmail,
  registerWithEmail,
  resetUserPassword,
  signInWithGooglePopup,
} from '../lib/firebase';
import { User } from 'firebase/auth';
import { AlertBanner, ModalShell, UI_CLASSES } from './ui';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: User) => void;
  requireAuthMessage?: string | null;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  requireAuthMessage,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await signInWithGooglePopup();
      if (user && onSuccess) {
        onSuccess(user);
      }
      onClose();
    } catch (err: any) {
      console.warn('Google sign in error:', err);
      setError('تعذر تسجيل الدخول بواسطة Google، يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('يرجى إدخال البريد الإلكتروني.');
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await resetUserPassword(cleanEmail);
        setSuccessMessage('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.');
      } catch (err: any) {
        setError(
          err.code === 'auth/user-not-found'
            ? 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.'
            : 'تعذر إرسال الرابط، يرجى التأكد من صحة البريد.'
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password || password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await signInWithEmail(cleanEmail, password);
        if (onSuccess) onSuccess(user);
        onClose();
      } else {
        const user = await registerWithEmail(
          cleanEmail,
          password,
          displayName.trim() || cleanEmail.split('@')[0]
        );
        if (onSuccess) onSuccess(user);
        onClose();
      }
    } catch (err: any) {
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        console.warn('Authentication note: invalid credentials provided');
        setError('بيانات الدخول غير صحيحة، يرجى التحقق من البريد الإلكتروني وكلمة المرور.');
      } else if (err.code === 'auth/email-already-in-use') {
        console.warn('Authentication note: email already registered');
        setError('هذا البريد مسجل مسبقاً، يمكنك تسجيل الدخول به.');
      } else if (err.code === 'auth/invalid-email') {
        setError('صيغة البريد الإلكتروني غير صالحة.');
      } else {
        console.error('Unexpected auth error:', err);
        setError(err.message || 'حدث خطأ أثناء المصادقة، يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'login'
      ? 'تسجيل الدخول'
      : mode === 'register'
      ? 'إنشاء حساب جديد'
      : 'استعادة كلمة المرور';

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle="منصة نِزال للتحدي"
      icon={<LogIn className="w-4 h-4 text-[#F07842]" />}
      headerTone="light"
      maxWidth="md"
      closeDisabled={loading}
      bodyClassName="p-5 sm:p-6 md:p-7 overflow-y-auto flex-1 space-y-5"
    >
      {/* Require Auth Message Banner */}
      {requireAuthMessage && (
        <AlertBanner tone="success">{requireAuthMessage}</AlertBanner>
      )}

      {/* Google Sign-in Button */}
      {mode !== 'forgot' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full min-h-[44px] py-3 px-4 rounded-xl border border-[#E5E8DD] hover:bg-[#F7F8F1] hover:border-[#F07842]/45 bg-[#FFFFFF] text-xs font-bold text-[#1B1F1C] flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.665-5.17 3.665-9.09z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.09C3.29 21.43 7.37 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.13-1.6.38-2.32V6.59H1.27C.46 8.21 0 10.05 0 12s.46 3.79 1.27 5.41l4.01-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.29 2.57 1.27 6.59l4.01 3.09c.95-2.83 3.6-4.93 6.72-4.93z"
              />
            </svg>
            <span>المتابعة السريعة باستخدام Google</span>
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#E5E8DD]" />
            <span className="text-[11px] text-[#52574E]">أو عبر البريد الإلكتروني</span>
            <div className="flex-1 h-px bg-[#E5E8DD]" />
          </div>
        </div>
      )}

      {/* Tab switch between Login & Register */}
      {mode !== 'forgot' && (
        <div className="grid grid-cols-2 p-1 bg-[#F3F5E9] rounded-xl border border-[#E5E8DD]">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`min-h-[44px] py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-white text-[#14543D] shadow-xs'
                : 'text-[#52574E] hover:text-[#1B1F1C]'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>تسجيل الدخول</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
              setSuccessMessage(null);
            }}
            className={`min-h-[44px] py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              mode === 'register'
                ? 'bg-white text-[#14543D] shadow-xs'
                : 'text-[#52574E] hover:text-[#1B1F1C]'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>حساب جديد</span>
          </button>
        </div>
      )}

      {/* Messages */}
      {error && (
        <AlertBanner tone="warning" onDismiss={() => setError(null)}>
          {error}
        </AlertBanner>
      )}

      {successMessage && (
        <AlertBanner tone="success">{successMessage}</AlertBanner>
      )}

      {/* Email & Password Form */}
      <form onSubmit={handleEmailSubmit} className="space-y-3.5">
        {mode === 'register' && (
          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#1B1F1C]">
              الاسم أو اسم اللاعب
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-[#52574E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="مثال: تركي الشمري"
                maxLength={40}
                className={`${UI_CLASSES.inputSoft} pr-10 text-xs font-semibold`}
              />
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-bold text-[#1B1F1C]">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#52574E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              dir="ltr"
              className={`${UI_CLASSES.inputSoft} pr-10 text-xs font-semibold text-left`}
            />
          </div>
        </div>

        {mode !== 'forgot' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#1B1F1C]">
                كلمة المرور
              </label>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="min-h-[44px] sm:min-h-[36px] px-2 inline-flex items-center text-[11px] font-bold text-[#F07842] hover:underline cursor-pointer"
                >
                  نسيت كلمة المرور؟
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#52574E] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                dir="ltr"
                className={`${UI_CLASSES.inputSoft} pr-10 text-xs font-semibold text-left`}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`${UI_CLASSES.btnGreen} w-full min-h-[48px] shadow-sm`}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>
            {mode === 'login'
              ? 'دخول'
              : mode === 'register'
              ? 'إنشاء الحساب'
              : 'إرسال رابط الاستعادة'}
          </span>
        </button>
      </form>

      {/* Footer links */}
      {mode === 'forgot' && (
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setSuccessMessage(null);
            }}
            className="min-h-[44px] px-4 text-xs font-bold text-[#14543D] hover:text-[#F07842] hover:underline cursor-pointer"
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      )}
    </ModalShell>
  );
};
