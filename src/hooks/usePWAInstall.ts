import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt: () => Promise<void>;
}

const DISMISS_STORAGE_KEY = 'nizal_pwa_install_dismissed_at_v1';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Capture early beforeinstallprompt events even before React components mount
let earlyDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<(e: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    earlyDeferredPrompt = e as BeforeInstallPromptEvent;
    promptSubscribers.forEach((cb) => cb(earlyDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    earlyDeferredPrompt = null;
    promptSubscribers.forEach((cb) => cb(null));
  });
}

function checkStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)')?.matches === true ||
    nav.standalone === true
  );
}

function checkIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isAppleMobile = /iphone|ipad|ipod/i.test(ua);
  const isIPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isAppleMobile || isIPadOS;
}

function checkIsInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isBannerDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(() => earlyDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(checkStandaloneMode);
  const [isIOS] = useState<boolean>(checkIsIOS);
  const [isInIframe] = useState<boolean>(checkIsInIframe);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(
    isBannerDismissedRecently
  );
  const [showIOSModal, setShowIOSModal] = useState<boolean>(false);
  const [showBrowserGuideModal, setShowBrowserGuideModal] =
    useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const mediaQuery = window.matchMedia?.('(display-mode: standalone)');

    const handleDisplayChange = () => {
      if (mounted) {
        setIsInstalled(checkStandaloneMode());
      }
    };

    const handlePromptUpdate = (evt: BeforeInstallPromptEvent | null) => {
      if (!mounted) return;
      setDeferredPrompt(evt);
      if (evt && !checkStandaloneMode()) {
        setIsInstalled(false);
      }
    };

    const handleAppInstalled = () => {
      if (!mounted) return;
      earlyDeferredPrompt = null;
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowIOSModal(false);
      setShowBrowserGuideModal(false);
    };

    promptSubscribers.add(handlePromptUpdate);
    if (earlyDeferredPrompt) {
      setDeferredPrompt((prev) => prev ?? earlyDeferredPrompt);
    }

    // Check installed related apps on supporting browsers (Chrome/Android)
    const navWithRelated = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
    };
    if (typeof navWithRelated.getInstalledRelatedApps === 'function') {
      navWithRelated
        .getInstalledRelatedApps()
        .then((apps) => {
          if (mounted && Array.isArray(apps) && apps.length > 0) {
            setIsInstalled(true);
          }
        })
        .catch(() => {
          // ignore if unsupported or blocked
        });
    }

    mediaQuery?.addEventListener?.('change', handleDisplayChange);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      mounted = false;
      promptSubscribers.delete(handlePromptUpdate);
      mediaQuery?.removeEventListener?.('change', handleDisplayChange);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const canPromptNative = Boolean(deferredPrompt) && !isInstalled;
  const shouldShowHeaderButton = !isInstalled;
  const canShowInstallOption = !isInstalled && (canPromptNative || isIOS);
  const shouldShowBanner = canShowInstallOption && !bannerDismissed;

  const triggerInstall = useCallback(async (): Promise<
    'accepted' | 'dismissed' | 'ios-guide' | 'browser-guide' | 'already-installed'
  > => {
    if (isInstalled) return 'already-installed';

    const activePrompt = deferredPrompt || earlyDeferredPrompt;
    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const { outcome } = await activePrompt.userChoice;
        earlyDeferredPrompt = null;
        setDeferredPrompt(null);
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setShowBrowserGuideModal(false);
        }
        return outcome;
      } catch {
        // Fall through to helpful guide modal if browser rejected prompt call
      }
    }

    if (isIOS) {
      setShowIOSModal(true);
      return 'ios-guide';
    }

    setShowBrowserGuideModal(true);
    return 'browser-guide';
  }, [deferredPrompt, isInstalled, isIOS]);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
  }, []);

  return {
    isInstalled,
    isIOS,
    isInIframe,
    canPromptNative,
    shouldShowHeaderButton,
    canShowInstallOption,
    shouldShowBanner,
    showIOSModal,
    setShowIOSModal,
    showBrowserGuideModal,
    setShowBrowserGuideModal,
    triggerInstall,
    dismissBanner,
  };
}
