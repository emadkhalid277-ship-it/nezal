import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const { isOnline } = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowReconnected(false);
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      setShowReconnected(true);
      const timer = window.setTimeout(() => setShowReconnected(false), 3500);
      return () => window.clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-[65px] z-30 w-full px-4 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b transition-colors"
      style={{
        backgroundColor: isOnline ? '#EAF2EE' : '#FEF2EC',
        borderColor: isOnline ? 'rgba(20, 84, 61, 0.2)' : 'rgba(240, 120, 66, 0.35)',
        color: isOnline ? '#14543D' : '#9A3412',
      }}
    >
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4 text-[#14543D]" />
          <span>تمت استعادة الاتصال بالإنترنت — اللعب عن بُعد ومزامنة البيانات متاحان الآن</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-[#F07842]" />
          <span>
            أنت غير متصل بالإنترنت — وضع «اللعب المحلي دون إنترنت» متاح، بينما يتطلب اللعب عن بُعد اتصالاً بالإنترنت
          </span>
        </>
      )}
    </div>
  );
};
