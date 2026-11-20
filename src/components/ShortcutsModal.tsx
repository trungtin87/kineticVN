import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { SHORTCUT_GROUPS } from '../utils/keyboardShortcuts';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#14171F] border border-white/12 rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-5 py-3 border-b border-white/8 flex items-center justify-between bg-[#111318] shrink-0">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-[#FF5A1F]" />
            <h3 className="font-display text-sm font-semibold text-[#F4F5F7]">
              Hệ thống phím tắt Hoạt Tự
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng phím tắt"
            className="p-1 text-[#8E95A5] hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {SHORTCUT_GROUPS.map((group) => (
            <section
              key={group.id}
              className="bg-[#0E1015] border border-white/8 rounded-md p-3.5 space-y-2.5"
            >
              <h4
                className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
                style={{ color: group.accent }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.accent }}
                />
                <span>{group.title}</span>
              </h4>

              <ul className="space-y-2">
                {group.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between gap-3 text-xs text-[#D5D9E2]"
                  >
                    <span className="leading-snug">{item.description}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => (
                        <React.Fragment key={kIdx}>
                          <kbd className="px-1.5 py-0.5 min-w-[24px] text-center bg-[#181C25] border border-white/15 rounded text-[10.5px] font-mono-tabular text-[#F4F5F7] shadow-inner">
                            {k}
                          </kbd>
                          {kIdx < item.keys.length - 1 && (
                            <span className="text-[10px] text-[#6B7280]">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-4 sm:px-5 py-2.5 border-t border-white/8 bg-[#111318] flex items-center justify-between text-[11px] text-[#8E95A5] shrink-0">
          <span>Phím tắt đơn chữ tự động tạm dừng khi bạn đang gõ trong ô nhập liệu.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#1D222D] hover:bg-[#272D3B] text-white rounded text-xs font-medium cursor-pointer shrink-0 ml-3"
          >
            Đóng (Esc)
          </button>
        </div>
      </div>
    </div>
  );
};
