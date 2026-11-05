import React, { useState } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  signInWithGooglePopup,
  signInWithEmail,
  registerWithEmail,
  resetUserPassword,
} from '../lib/firebase';
import { User } from 'firebase/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const user = await signInWithGooglePopup();
      if (onSuccess) onSuccess(user);
      onClose();
    } catch (err: any) {
      console.error('Google Sign in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('تم إغلاق نافذة تسجيل الدخول قبل الاكتمال.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(
          'هذا النطاق غير مصرح به في Firebase Console -> Authentication -> Settings -> Authorized Domains.'
        );
      } else {
        setError(err.message || 'حدث خطأ أثناء تسجيل الدخول عبر Google.');
      }
    } finally {
      setGoogleLoading(false);
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
      console.error('Auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('هذا البريد مسجل مسبقاً، يمكنك تسجيل الدخول به.');
      } else if (err.code === 'auth/invalid-email') {
        setError('صيغة البريد الإلكتروني غير صالحة.');
      } else {
        setError(err.message || 'حدث خطأ أثناء المصادقة.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#131614]/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#FFFFFF] border border-[#E5E8DD] rounded-3xl max-w-md w-full p-6 md:p-8 space-y-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E8DD] pb-4">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-[#F07842]">
              منصة نِزال للتحدي
            </div>
            <h2 className="font-display text-xl font-bold text-[#252824]">
              {mode === 'login'
                ? 'تسجيل الدخول'
                : mode === 'register'
                ? 'إنشاء حساب جديد'
                : 'استعادة كلمة المرور'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F3F5E9] hover:bg-[#E5E8DD] flex items-center justify-center text-[#777B73] cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
              className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'login'
                  ? 'bg-white text-[#14543D] shadow-xs'
                  : 'text-[#777B73] hover:text-[#252824]'
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
              className={`py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-white text-[#14543D] shadow-xs'
                  : 'text-[#777B73] hover:text-[#252824]'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>حساب جديد</span>
            </button>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="p-3.5 rounded-xl bg-[#FEF2EC] border border-[#F07842] text-xs font-bold text-[#D9602B] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-xl bg-[#EAF2EE] border border-[#14543D] text-xs font-bold text-[#14543D] flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#F07842]" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 1-Click Google Sign In */}
        {mode !== 'forgot' && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={googleLoading || loading}
              onClick={handleGoogleSignIn}
              className="w-full py-3 px-4 rounded-xl border border-[#E5E8DD] bg-[#FFFFFF] hover:bg-[#F3F5E9] text-xs font-bold text-[#252824] flex items-center justify-center gap-3 transition-colors shadow-xs cursor-pointer disabled:opacity-60"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#14543D]" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>متابعة بحساب Google</span>
            </button>

            <div className="relative flex items-center justify-center py-1">
              <span className="w-full border-t border-[#E5E8DD]" />
              <span className="bg-white px-3 text-[11px] text-[#777B73] font-medium absolute">
                أو بالبريد الإلكتروني
              </span>
            </div>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-[#252824]">
                الاسم أو اسم اللاعب
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="مثال: تركي الشمري"
                  maxLength={40}
                  className="w-full pr-10 pl-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-semibold text-[#252824] focus:outline-none focus:border-[#14543D]"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-xs font-bold text-[#252824]">
              البريد الإلكتروني
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                dir="ltr"
                className="w-full pr-10 pl-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-semibold text-[#252824] focus:outline-none focus:border-[#14543D] text-left"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#252824]">
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
                    className="text-[11px] font-bold text-[#F07842] hover:underline cursor-pointer"
                  >
                    نسيت كلمة المرور؟
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#777B73] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  dir="ltr"
                  className="w-full pr-10 pl-3.5 py-2.5 rounded-xl bg-[#F3F5E9] border border-[#E5E8DD] text-xs font-semibold text-[#252824] focus:outline-none focus:border-[#14543D] text-left"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-3 rounded-xl bg-[#14543D] hover:bg-[#0E3F2D] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
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
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-xs font-bold text-[#14543D] hover:underline cursor-pointer"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
