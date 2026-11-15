import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 lg:bottom-4 left-4 right-4 lg:right-auto z-50 flex items-center gap-2 rounded-md bg-amber-600/95 px-3 py-2 text-xs font-medium text-white shadow-lg border border-amber-400/30">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>Đang ngoại tuyến — Chỉnh sửa &amp; xem trước vẫn hoạt động, xuất video cần mạng.</span>
    </div>
  );
};
