import React, { useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="px-3 py-1.5 min-h-[36px] bg-[#1C202B] hover:bg-[#252A38] border border-white/15 text-[#F4F5F7] text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-3.5 h-3.5 text-[#FF5A1F]" />
        <span>Cài App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="px-3 py-1.5 min-h-[36px] bg-[#1C202B] hover:bg-[#252A38] border border-white/15 text-[#F4F5F7] text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#FF5A1F]" />
          <span>Cài App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-sm bg-[#14171F] border border-white/12 rounded-lg p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-[#F4F5F7]">
                  Cài đặt trên iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-[#8E95A5] hover:text-white rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="text-xs text-[#C7CCD6] space-y-2 leading-relaxed list-decimal pl-4">
                <li>
                  Nhấn nút <strong>Chia sẻ (Share)</strong> trên thanh công cụ trình duyệt Safari.
                </li>
                <li>
                  Cuộn xuống và chọn <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] bg-[#FF5A1F] hover:bg-[#E84D14] text-white text-xs font-semibold rounded-md cursor-pointer"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
