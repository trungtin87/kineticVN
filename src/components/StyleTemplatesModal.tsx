import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Palette,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import {
  ANIMATION_PRESETS,
  BackgroundConfig,
  DYNAMIC_BG_PRESETS,
  MotionConfig,
  TRANSITION_PRESETS,
  TypographyConfig,
} from '../types/studio';
import {
  STYLE_TEMPLATE_CATEGORIES,
  STYLE_TEMPLATES,
  StyleTemplate,
  StyleTemplateCategory,
} from '../utils/styleTemplates';
import { ensureGoogleFontLoaded } from '../utils/googleFonts';

interface StyleTemplatesModalProps {
  isOpen: boolean;
  typography: TypographyConfig;
  motion: MotionConfig;
  background: BackgroundConfig;
  onApplyTemplate: (template: StyleTemplate) => void;
  onClose: () => void;
}

export const StyleTemplatesModal: React.FC<StyleTemplatesModalProps> = ({
  isOpen,
  typography,
  motion,
  background,
  onApplyTemplate,
  onClose,
}) => {
  const [category, setCategory] = useState<'ALL' | StyleTemplateCategory>('ALL');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STYLE_TEMPLATES.filter((tpl) => {
      if (category !== 'ALL' && tpl.category !== category) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.desc.toLowerCase().includes(q) ||
        (tpl.typography.fontFamily || '').toLowerCase().includes(q) ||
        (tpl.motion.preset || '').toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  // Preload template specimen Google Fonts smoothly when gallery opens
  useEffect(() => {
    if (!isOpen) return;
    const uniqueFonts = Array.from(
      new Set(STYLE_TEMPLATES.map((t) => t.typography.fontFamily).filter(Boolean))
    ) as string[];
    uniqueFonts.forEach((fontName) => {
      ensureGoogleFontLoaded(fontName);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Thư viện Style Template 1-Click"
        className="w-full max-w-5xl max-h-[90dvh] bg-[#111318] border border-white/12 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#0E1015] border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#FF5A1F]/18 border border-[#FF5A1F]/35 flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4 text-[#FF5A1F]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm sm:text-base font-bold text-white truncate">
                Thư viện Style Template 1-Click ({STYLE_TEMPLATES.length} mẫu)
              </h2>
              <p className="text-[11px] text-[#8E95A5] truncate">
                Áp dụng đồng thời Font chữ, Bảng màu, Hiệu ứng vào, Transition thoát &amp; Nền động chỉ với 1 lần chạm
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thư viện mẫu"
            className="p-2 text-[#8E95A5] hover:text-white hover:bg-white/8 rounded-md transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter & Search Bar */}
        <div className="px-4 sm:px-5 py-2.5 bg-[#13161E] border-b border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {STYLE_TEMPLATE_CATEGORIES.map((cat) => {
              const count =
                cat.id === 'ALL'
                  ? STYLE_TEMPLATES.length
                  : STYLE_TEMPLATES.filter((t) => t.category === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    category === cat.id
                      ? 'bg-[#FF5A1F] text-white'
                      : 'bg-[#191D27] text-[#9BA3B4] hover:text-white border border-white/8'
                  }`}
                >
                  {cat.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="relative sm:w-60 shrink-0">
            <Search className="w-3.5 h-3.5 text-[#7C8496] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm tên mẫu, font, hiệu ứng..."
              className="w-full bg-[#0E1015] border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-[#E2E5EC] placeholder-[#6B7280] focus:outline-none focus:border-[#FF5A1F]"
            />
          </div>
        </div>

        {/* Visual Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 min-h-0">
          {filtered.map((tpl) => {
            const isMatching =
              typography.fontFamily === tpl.typography.fontFamily &&
              motion.preset === tpl.motion.preset &&
              background.presetId === tpl.background.presetId &&
              typography.emphasisColor === tpl.typography.emphasisColor;

            const animLabel =
              ANIMATION_PRESETS.find((a) => a.id === tpl.motion.preset)?.name || tpl.motion.preset;
            const transLabel =
              TRANSITION_PRESETS.find((tr) => tr.id === (tpl.motion.transition || 'fade'))?.name ||
              'Mờ dần mượt';
            const bgLabel =
              DYNAMIC_BG_PRESETS.find((b) => b.id === tpl.background.presetId)?.name ||
              tpl.background.presetId;

            const bg1 = tpl.background.primaryColor || tpl.swatch[0];
            const bg2 = tpl.background.secondaryColor || tpl.swatch[0];
            const accent = tpl.typography.emphasisColor || tpl.swatch[2];
            const baseInk = tpl.typography.baseColor || tpl.swatch[1];

            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  onApplyTemplate(tpl);
                  onClose();
                }}
                className={`group rounded-lg border text-left overflow-hidden flex flex-col transition-all cursor-pointer ${
                  isMatching
                    ? 'border-[#FF5A1F] ring-1 ring-[#FF5A1F]/50 bg-[#1A1D26]'
                    : 'border-white/10 hover:border-white/28 bg-[#161922] hover:bg-[#1B1F2A]'
                }`}
              >
                {/* Live Visual Specimen Banner */}
                <div
                  style={{
                    background: `radial-gradient(circle at 80% 25%, ${accent}33, transparent 58%), linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%)`,
                  }}
                  className="h-24 px-3.5 py-2.5 relative flex flex-col justify-between border-b border-white/8 overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-black/45 border border-white/10 text-[10px] font-mono-tabular text-white/80 truncate">
                      {tpl.typography.fontFamily}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {tpl.swatch.map((hex, i) => (
                        <span
                          key={i}
                          style={{ backgroundColor: hex }}
                          className="w-2.5 h-2.5 rounded-full border border-white/25"
                        />
                      ))}
                    </span>
                  </div>

                  <div
                    style={{
                      fontFamily: `"${tpl.typography.fontFamily || 'Be Vietnam Pro'}", sans-serif`,
                      fontWeight: tpl.typography.fontWeight || 700,
                      color: baseInk,
                      textTransform:
                        tpl.typography.textTransform === 'uppercase'
                          ? 'uppercase'
                          : tpl.typography.textTransform === 'titlecase'
                          ? 'capitalize'
                          : 'none',
                    }}
                    className="text-base sm:text-lg leading-tight truncate tracking-tight drop-shadow"
                  >
                    Tạo{' '}
                    <span
                      style={{
                        color:
                          tpl.typography.emphasisStyle === 'highlightBox' ||
                          tpl.typography.emphasisStyle === 'pillSolid' ||
                          tpl.typography.emphasisStyle === 'skewBadge' ||
                          tpl.typography.emphasisStyle === 'tapeSticker'
                            ? '#0B0C0F'
                            : accent,
                        backgroundColor:
                          tpl.typography.emphasisStyle === 'highlightBox' ||
                          tpl.typography.emphasisStyle === 'pillSolid' ||
                          tpl.typography.emphasisStyle === 'skewBadge' ||
                          tpl.typography.emphasisStyle === 'tapeSticker'
                            ? accent
                            : 'transparent',
                        padding:
                          tpl.typography.emphasisStyle === 'highlightBox' ||
                          tpl.typography.emphasisStyle === 'pillSolid' ||
                          tpl.typography.emphasisStyle === 'skewBadge' ||
                          tpl.typography.emphasisStyle === 'tapeSticker'
                            ? '0 6px'
                            : '0',
                        borderRadius:
                          tpl.typography.emphasisStyle === 'pillSolid' ? '999px' : '4px',
                        textDecoration:
                          tpl.typography.emphasisStyle === 'underlineSweep' ||
                          tpl.typography.emphasisStyle === 'brushUnderline' ||
                          tpl.typography.emphasisStyle === 'doubleUnderline'
                            ? `underline ${accent}`
                            : tpl.typography.emphasisStyle === 'strikeEmphasis'
                            ? `line-through ${accent}`
                            : 'none',
                      }}
                    >
                      Nhịp Điệu
                    </span>{' '}
                    Riêng
                  </div>

                  {isMatching && (
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-[#FF5A1F] text-white text-[10px] font-semibold flex items-center gap-0.5 shadow">
                      <Check className="w-3 h-3" />
                      Đang dùng
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-[#F4F5F7] group-hover:text-white truncate">
                        {tpl.name}
                      </h3>
                      {tpl.soundscapePresetId && (
                        <span
                          title="Kèm âm thanh nền gợi ý"
                          className="text-[10px] text-[#34D399] flex items-center gap-0.5 shrink-0"
                        >
                          <Volume2 className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#8E95A5] mt-0.5 line-clamp-2">{tpl.desc}</p>
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-[10px] text-[#D5D9E2]">
                      Vào: {animLabel}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#38BDF8]/10 border border-[#38BDF8]/25 text-[10px] text-[#7DD3FC]">
                      Chuyển: {transLabel}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-[10px] text-[#9BA3B4]">
                      Nền: {bgLabel}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-xs text-[#8E95A5] flex flex-col items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FF5A1F]/70" />
              <span>Không tìm thấy Style Template phù hợp với từ khóa "{query}".</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
