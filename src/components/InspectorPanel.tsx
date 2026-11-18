import React, { useEffect, useMemo, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BookmarkCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Combine,
  Film,
  Highlighter,
  ImagePlus,
  Layers,
  Music,
  Palette,
  Play,
  RotateCcw,
  Scissors,
  Sparkles,
  Square,
  Trees,
  Type,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import {
  ANIMATION_PRESETS,
  AnimationPresetId,
  BackgroundConfig,
  DYNAMIC_BG_PRESETS,
  EffectsConfig,
  EmphasisStyle,
  MotionConfig,
  ProgressBarConfig,
  SoundscapeConfig,
  SubtitleCue,
  TextAlignMode,
  TextTransformMode,
  TypographyConfig,
  WatermarkConfig,
  WatermarkPosition,
  WordStyleOverride,
} from '../types/studio';
import { preloadWatermarkImage } from '../engine/kineticRenderer';
import {
  CURATED_GOOGLE_FONTS,
  ensureGoogleFontLoaded,
  FontOption,
  getStoredCustomFonts,
  removeCustomGoogleFont,
  saveCustomGoogleFont,
} from '../utils/googleFonts';
import {
  SOUNDSCAPE_COMBOS,
  SOUNDSCAPE_LAYERS,
  SoundscapeCategory,
} from '../utils/soundscapeLibrary';
import {
  loadLastEmphasisPreset,
  resolveEmphasisTemplate,
  saveLastEmphasisPreset,
} from '../utils/emphasisPreset';
import {
  autoWrapCueText,
  balanceTwoLines,
  distributeWordTimingsEvenly,
  findWordIndicesInTextRange,
  formatTimecodeShort,
  tokenizeCueText,
} from '../utils/srtParser';
import { STYLE_TEMPLATES, StyleTemplate } from '../utils/styleTemplates';
import { InspectorTab } from './TopBar';

interface InspectorPanelProps {
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  selectedCue: SubtitleCue | null;
  cues?: SubtitleCue[];
  currentTimeSec?: number;
  onQuickSelectCue?: (cueId: string) => void;
  sharedEmphasisPreset?: WordStyleOverride | null;
  onChangeSharedEmphasisPreset?: (preset: WordStyleOverride | null) => void;
  typography: TypographyConfig;
  motion: MotionConfig;
  background: BackgroundConfig;
  soundscape?: SoundscapeConfig;
  effects?: EffectsConfig;
  watermark?: WatermarkConfig;
  progressBar?: ProgressBarConfig;
  bgVideoName: string | null;
  bgVideoDurationSec?: number;
  totalDurationSec?: number;
  bgAudioName?: string | null;
  isPreviewingSoundscape?: boolean;
  canMergeNextCue?: boolean;
  onUpdateCue: (cueId: string, patch: Partial<SubtitleCue>, coalesceKey?: string) => void;
  onSplitCue?: (cueId: string) => void;
  onMergeNextCue?: (cueId: string) => void;
  onUpdateTypography: (patch: Partial<TypographyConfig>, coalesceKey?: string) => void;
  onUpdateMotion: (patch: Partial<MotionConfig>, coalesceKey?: string) => void;
  onUpdateBackground: (patch: Partial<BackgroundConfig>, coalesceKey?: string) => void;
  onUpdateSoundscape?: (patch: Partial<SoundscapeConfig>, coalesceKey?: string) => void;
  onTogglePreviewSoundscape?: () => void;
  onUpdateEffects?: (patch: Partial<EffectsConfig>, coalesceKey?: string) => void;
  onUpdateWatermark?: (patch: Partial<WatermarkConfig>, coalesceKey?: string) => void;
  onUpdateProgressBar?: (patch: Partial<ProgressBarConfig>, coalesceKey?: string) => void;
  onApplyTemplate?: (template: StyleTemplate) => void;
  onUploadBgVideo: (file: File) => void;
  onClearBgVideo: () => void;
  onUploadBgAudio?: (file: File) => void;
  onClearBgAudio?: () => void;
  className?: string;
}

const EMPHASIS_SWATCHES = [
  '#FF5A1F',
  '#FACC15',
  '#38BDF8',
  '#34D399',
  '#F43F5E',
  '#A78BFA',
  '#FFFFFF',
];

const EMPHASIS_STYLES: { id: EmphasisStyle; label: string }[] = [
  { id: 'color', label: 'Đổi màu' },
  { id: 'scaleColor', label: 'Phóng to + Màu' },
  { id: 'highlightBox', label: 'Khối Highlight' },
  { id: 'underlineSweep', label: 'Gạch chân chạy' },
  { id: 'glow', label: 'Phát sáng Glow' },
  { id: 'outlineBadge', label: 'Khung viền Pill' },
  { id: 'doubleShadow', label: 'Bóng nổi 3D' },
  { id: 'gradientFill', label: 'Chuyển sắc Gradient' },
];

const ANCHOR_POINTS: { x: number; y: number; label: string }[] = [
  { x: 0.14, y: 0.18, label: 'Trên Trái' },
  { x: 0.5, y: 0.18, label: 'Trên Giữa' },
  { x: 0.86, y: 0.18, label: 'Trên Phải' },
  { x: 0.14, y: 0.5, label: 'Giữa Trái' },
  { x: 0.5, y: 0.5, label: 'Chính Giữa' },
  { x: 0.86, y: 0.5, label: 'Giữa Phải' },
  { x: 0.14, y: 0.82, label: 'Dưới Trái' },
  { x: 0.5, y: 0.82, label: 'Dưới Giữa' },
  { x: 0.86, y: 0.82, label: 'Dưới Phải' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  activeTab,
  onTabChange,
  selectedCue,
  cues = [],
  currentTimeSec = 0,
  onQuickSelectCue,
  sharedEmphasisPreset,
  onChangeSharedEmphasisPreset,
  typography,
  motion,
  background,
  soundscape,
  effects,
  watermark,
  progressBar,
  bgVideoName,
  bgVideoDurationSec = 0,
  totalDurationSec = 0,
  bgAudioName = null,
  isPreviewingSoundscape = false,
  canMergeNextCue = false,
  onUpdateCue,
  onSplitCue,
  onMergeNextCue,
  onUpdateTypography,
  onUpdateMotion,
  onUpdateBackground,
  onUpdateSoundscape,
  onTogglePreviewSoundscape,
  onUpdateEffects,
  onUpdateWatermark,
  onUpdateProgressBar,
  onApplyTemplate,
  onUploadBgVideo,
  onClearBgVideo,
  onUploadBgAudio,
  onClearBgAudio,
  className = '',
}) => {
  const [activeWordIdx, setActiveWordIdx] = useState<number | null>(null);
  const [showWordTimings, setShowWordTimings] = useState(false);
  const [textSelection, setTextSelection] = useState<{ start: number; end: number } | null>(null);
  const [localEmphasisPreset, setLocalEmphasisPreset] = useState<WordStyleOverride | null>(() =>
    loadLastEmphasisPreset()
  );
  const lastEmphasisPreset =
    sharedEmphasisPreset !== undefined ? sharedEmphasisPreset : localEmphasisPreset;
  const [chipDragRange, setChipDragRange] = useState<{ start: number; end: number } | null>(null);
  const [soundCategory, setSoundCategory] = useState<'ALL' | SoundscapeCategory>('ALL');

  const [customFonts, setCustomFonts] = useState<FontOption[]>(() => getStoredCustomFonts());
  const [fontCategory, setFontCategory] = useState<'ALL' | FontOption['category']>('ALL');
  const [fontQuery, setFontQuery] = useState('');
  const [customFontInput, setCustomFontInput] = useState('');
  const [fontLoadingMsg, setFontLoadingMsg] = useState<string | null>(null);
  const [fontErrorMsg, setFontErrorMsg] = useState<string | null>(null);
  const [motionQuery, setMotionQuery] = useState('');

  useEffect(() => {
    setTextSelection(null);
    setActiveWordIdx(null);
    setChipDragRange(null);
  }, [selectedCue?.id]);

  const resolvedEmphasisTemplate = useMemo<WordStyleOverride>(
    () => resolveEmphasisTemplate(lastEmphasisPreset, typography),
    [lastEmphasisPreset, typography]
  );

  const rememberEmphasisPreset = (nextStyle: WordStyleOverride | null) => {
    const clean: WordStyleOverride | null = nextStyle ? { ...nextStyle, emphasized: true } : null;
    if (onChangeSharedEmphasisPreset) {
      onChangeSharedEmphasisPreset(clean);
    } else {
      setLocalEmphasisPreset(clean);
      saveLastEmphasisPreset(clean);
    }
  };

  const selectedTextWordIndices = useMemo(() => {
    if (!selectedCue || !textSelection || textSelection.end <= textSelection.start) return [];
    return findWordIndicesInTextRange(selectedCue.text, textSelection.start, textSelection.end);
  }, [selectedCue, textSelection]);

  const allFonts: FontOption[] = [
    ...customFonts,
    ...CURATED_GOOGLE_FONTS.filter(
      (cf) => !customFonts.some((u) => u.id.toLowerCase() === cf.id.toLowerCase())
    ),
  ];

  const handleSelectGlobalFont = async (fontName: string) => {
    onUpdateTypography({ fontFamily: fontName });
    await ensureGoogleFontLoaded(fontName);
  };

  const handleLoadCustomGoogleFont = async () => {
    const clean = customFontInput.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    setFontErrorMsg(null);
    setFontLoadingMsg(`Đang tải "${clean}" từ Google Fonts...`);
    const ok = await ensureGoogleFontLoaded(clean);
    setFontLoadingMsg(null);
    if (!ok) {
      setFontErrorMsg(
        `Không tìm thấy font "${clean}" trên Google Fonts. Hãy kiểm tra đúng tên font (VD: Syne, Lobster, Paytone One).`
      );
      return;
    }
    const updated = saveCustomGoogleFont(clean);
    setCustomFonts(updated);
    onUpdateTypography({ fontFamily: clean });
    setCustomFontInput('');
  };

  const applyRememberedEmphasisToIndices = (cue: SubtitleCue, indices: number[]) => {
    if (indices.length === 0) return;
    const nextStyles = { ...cue.wordStyles };
    for (const idx of indices) {
      nextStyles[idx] = { ...resolvedEmphasisTemplate, emphasized: true };
    }
    onUpdateCue(cue.id, { wordStyles: nextStyles });
    setActiveWordIdx(indices[0]);
    rememberEmphasisPreset(resolvedEmphasisTemplate);
  };

  const clearEmphasisFromIndices = (cue: SubtitleCue, indices: number[]) => {
    if (indices.length === 0) return;
    const nextStyles = { ...cue.wordStyles };
    for (const idx of indices) {
      delete nextStyles[idx];
    }
    onUpdateCue(cue.id, { wordStyles: nextStyles });
    if (activeWordIdx !== null && indices.includes(activeWordIdx)) {
      setActiveWordIdx(null);
    }
  };

  const toggleWordEmphasis = (
    cue: SubtitleCue,
    wordIdx: number,
    e?: React.MouseEvent<HTMLButtonElement>
  ) => {
    // Shift+Click: quickly emphasize contiguous range from activeWordIdx to clicked word
    if (e?.shiftKey && activeWordIdx !== null) {
      const from = Math.min(activeWordIdx, wordIdx);
      const to = Math.max(activeWordIdx, wordIdx);
      const range: number[] = [];
      for (let i = from; i <= to; i++) range.push(i);
      applyRememberedEmphasisToIndices(cue, range);
      return;
    }

    const existing = cue.wordStyles[wordIdx];
    const nextStyles = { ...cue.wordStyles };
    if (existing?.emphasized) {
      // If another word was focused (or none), focus this word first so user can edit it; clicking again turns it off
      if (activeWordIdx !== wordIdx) {
        setActiveWordIdx(wordIdx);
        return;
      }
      delete nextStyles[wordIdx];
      setActiveWordIdx(null);
    } else {
      const applied = { ...resolvedEmphasisTemplate, emphasized: true };
      nextStyles[wordIdx] = applied;
      setActiveWordIdx(wordIdx);
      rememberEmphasisPreset(applied);
    }
    onUpdateCue(cue.id, { wordStyles: nextStyles });
  };

  const updateWordStyle = (
    cue: SubtitleCue,
    wordIdx: number,
    patch: Partial<WordStyleOverride>
  ) => {
    const existing = cue.wordStyles[wordIdx] || { emphasized: true };
    const merged: WordStyleOverride = { ...existing, emphasized: true, ...patch };
    onUpdateCue(cue.id, {
      wordStyles: {
        ...cue.wordStyles,
        [wordIdx]: merged,
      },
    });
    rememberEmphasisPreset(merged);
  };

  const applyPatchToTargetWords = (
    cue: SubtitleCue,
    patch: Partial<WordStyleOverride>
  ) => {
    if (activeWordIdx !== null && cue.wordStyles[activeWordIdx]) {
      updateWordStyle(cue, activeWordIdx, patch);
    } else {
      const updated = { ...cue.wordStyles };
      let sampleMerged: WordStyleOverride | null = null;
      for (const k of Object.keys(updated)) {
        const merged = { ...updated[Number(k)], emphasized: true, ...patch };
        updated[Number(k)] = merged;
        if (!sampleMerged) sampleMerged = merged;
      }
      onUpdateCue(cue.id, { wordStyles: updated });
      if (sampleMerged) {
        rememberEmphasisPreset(sampleMerged);
      } else {
        rememberEmphasisPreset({ ...resolvedEmphasisTemplate, ...patch });
      }
    }
  };

  return (
    <aside
      className={`w-full lg:w-[368px] bg-[#111318] lg:border-l border-white/8 flex flex-col shrink-0 min-h-0 ${className}`}
    >
      {/* Inspector Tab Switcher */}
      <div className="p-2 border-b border-white/8 grid grid-cols-3 gap-1 bg-[#0E1015] shrink-0">
        <button
          type="button"
          onClick={() => onTabChange('cue')}
          className={`px-2 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'cue'
              ? 'bg-[#1D212B] text-[#F4F5F7]'
              : 'text-[#8E95A5] hover:text-[#F4F5F7]'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Câu &amp; Từ</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('typography')}
          className={`px-2 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'typography'
              ? 'bg-[#1D212B] text-[#F4F5F7]'
              : 'text-[#8E95A5] hover:text-[#F4F5F7]'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          <span>Font &amp; Motion</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('background')}
          className={`px-2 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'background'
              ? 'bg-[#1D212B] text-[#F4F5F7]'
              : 'text-[#8E95A5] hover:text-[#F4F5F7]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Nền động</span>
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0">
        {activeTab === 'cue' && (
          <>
            {/* Quick Cue Switcher inside Câu & Từ so users never need to switch back to Phụ đề tab */}
            {cues.length > 0 && onQuickSelectCue && (() => {
              const selIdx = selectedCue ? cues.findIndex((c) => c.id === selectedCue.id) : -1;
              const prevCue = selIdx > 0 ? cues[selIdx - 1] : null;
              const nextCue =
                selIdx >= 0 && selIdx < cues.length - 1 ? cues[selIdx + 1] : null;
              const playheadIdx = cues.findIndex(
                (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
              );
              const playheadCue = playheadIdx >= 0 ? cues[playheadIdx] : null;
              const showFollowPlayhead = Boolean(
                playheadCue && playheadCue.id !== selectedCue?.id
              );

              return (
                <div className="p-2 bg-[#0E1015] border border-white/10 rounded-md space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!prevCue}
                      onClick={() => prevCue && onQuickSelectCue(prevCue.id)}
                      title="Câu trước"
                      className="p-1.5 bg-[#171A21] hover:bg-[#20242E] disabled:opacity-30 border border-white/8 rounded text-[#D5D9E2] cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <select
                      value={selectedCue?.id || ''}
                      onChange={(e) => {
                        if (e.target.value) onQuickSelectCue(e.target.value);
                      }}
                      aria-label="Chuyển nhanh câu phụ đề"
                      className="flex-1 min-w-0 bg-[#171A21] border border-white/10 rounded px-2 py-1 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F] truncate"
                    >
                      {!selectedCue && <option value="">Chọn câu để sửa...</option>}
                      {cues.map((c, idx) => (
                        <option key={c.id} value={c.id}>
                          #{String(idx + 1).padStart(2, '0')} ({formatTimecodeShort(c.startSec)}) —{' '}
                          {c.text.replace(/\n+/g, ' ').slice(0, 32)}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!nextCue}
                      onClick={() => nextCue && onQuickSelectCue(nextCue.id)}
                      title="Câu tiếp theo"
                      className="p-1.5 bg-[#171A21] hover:bg-[#20242E] disabled:opacity-30 border border-white/8 rounded text-[#D5D9E2] cursor-pointer disabled:cursor-not-allowed shrink-0"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showFollowPlayhead && playheadCue && (
                    <button
                      type="button"
                      onClick={() => onQuickSelectCue(playheadCue.id)}
                      className="w-full py-1 px-2 text-[10.5px] font-medium text-[#38BDF8] bg-[#38BDF8]/10 hover:bg-[#38BDF8]/18 border border-[#38BDF8]/30 rounded cursor-pointer transition-colors truncate"
                    >
                      Nhảy tới câu đang phát trên màn hình (#{String(playheadIdx + 1).padStart(2, '0')})
                    </button>
                  )}
                </div>
              );
            })()}

            {!selectedCue ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm font-medium text-[#D5D9E2]">Chưa chọn câu phụ đề</p>
                <p className="text-xs text-[#8E95A5]">
                  Chọn một câu ngay ở danh sách trên hoặc trên timeline để sửa và nhấn màu từ.
                </p>
              </div>
            ) : (
              <>
                {/* 1. Text & Line Breaks */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#E2E5EC]">
                      Nội dung &amp; Xuống dòng (Enter)
                    </label>
                    <span className="text-[11px] font-mono-tabular text-[#8E95A5]">
                      {(selectedCue.endSec - selectedCue.startSec).toFixed(2)}s
                    </span>
                  </div>

                  <textarea
                    rows={3}
                    value={selectedCue.text}
                    onChange={(e) => onUpdateCue(selectedCue.id, { text: e.target.value })}
                    onSelect={(e) => {
                      const s = e.currentTarget.selectionStart ?? 0;
                      const end = e.currentTarget.selectionEnd ?? 0;
                      setTextSelection(end > s ? { start: s, end } : null);
                    }}
                    onMouseUp={(e) => {
                      const s = e.currentTarget.selectionStart ?? 0;
                      const end = e.currentTarget.selectionEnd ?? 0;
                      setTextSelection(end > s ? { start: s, end } : null);
                    }}
                    onKeyUp={(e) => {
                      const s = e.currentTarget.selectionStart ?? 0;
                      const end = e.currentTarget.selectionEnd ?? 0;
                      setTextSelection(end > s ? { start: s, end } : null);
                    }}
                    onKeyDown={(e) => {
                      if (
                        (e.ctrlKey || e.metaKey) &&
                        (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'b') &&
                        selectedTextWordIndices.length > 0
                      ) {
                        e.preventDefault();
                        applyRememberedEmphasisToIndices(selectedCue, selectedTextWordIndices);
                      }
                    }}
                    className="w-full bg-[#171A21] border border-white/10 focus:border-[#FF5A1F] rounded-md p-2.5 text-sm text-[#F4F5F7] leading-relaxed focus:outline-none resize-y"
                    placeholder="Nhập chữ, bôi đen cụm từ để nhấn nhanh, hoặc Enter để xuống dòng..."
                  />

                  {selectedTextWordIndices.length > 0 && (
                    <div className="px-2.5 py-2 bg-[#1B1715] border border-[#FF5A1F]/45 rounded-md flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          applyRememberedEmphasisToIndices(selectedCue, selectedTextWordIndices)
                        }
                        className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2 bg-[#FF5A1F] hover:bg-[#FF7340] text-white text-[11px] font-semibold rounded cursor-pointer transition-colors"
                      >
                        <Highlighter className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Nhấn nhanh {selectedTextWordIndices.length} từ đã bôi
                        </span>
                      </button>
                      {selectedTextWordIndices.some((i) => selectedCue.wordStyles[i]?.emphasized) && (
                        <button
                          type="button"
                          onClick={() =>
                            clearEmphasisFromIndices(selectedCue, selectedTextWordIndices)
                          }
                          className="py-1 px-2 bg-[#171A21] hover:bg-[#232734] border border-white/15 text-[#D5D9E2] text-[11px] rounded cursor-pointer"
                        >
                          Bỏ nhấn
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCue(selectedCue.id, { text: balanceTwoLines(selectedCue.text) })
                      }
                      className="px-2 py-1.5 bg-[#171A21] hover:bg-[#20242E] border border-white/8 rounded text-[11px] text-[#D5D9E2] cursor-pointer whitespace-nowrap"
                    >
                      2 dòng đều
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCue(selectedCue.id, { text: autoWrapCueText(selectedCue.text, 2) })
                      }
                      className="px-2 py-1.5 bg-[#171A21] hover:bg-[#20242E] border border-white/8 rounded text-[11px] text-[#D5D9E2] cursor-pointer whitespace-nowrap"
                    >
                      2 từ/dòng
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCue(selectedCue.id, { text: autoWrapCueText(selectedCue.text, 3) })
                      }
                      className="px-2 py-1.5 bg-[#171A21] hover:bg-[#20242E] border border-white/8 rounded text-[11px] text-[#D5D9E2] cursor-pointer whitespace-nowrap"
                    >
                      3 từ/dòng
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCue(selectedCue.id, {
                          text: selectedCue.text.replace(/\n+/g, ' ').trim(),
                        })
                      }
                      className="px-2 py-1.5 bg-[#171A21] hover:bg-[#20242E] border border-white/8 rounded text-[11px] text-[#D5D9E2] cursor-pointer whitespace-nowrap"
                    >
                      1 dòng
                    </button>
                  </div>

                  {(onSplitCue || onMergeNextCue) && (
                    <div className="grid grid-cols-2 gap-1.5">
                      {onSplitCue && (
                        <button
                          type="button"
                          disabled={selectedCue.endSec - selectedCue.startSec < 0.35}
                          onClick={() => onSplitCue(selectedCue.id)}
                          className="px-2.5 py-1.5 bg-[#171A21] hover:bg-[#20242E] disabled:opacity-35 border border-white/10 rounded text-[11px] text-[#E2E5EC] flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Scissors className="w-3 h-3 text-[#FF5A1F]" />
                          <span>Tách câu tại con trỏ</span>
                        </button>
                      )}
                      {onMergeNextCue && (
                        <button
                          type="button"
                          disabled={!canMergeNextCue}
                          onClick={() => onMergeNextCue(selectedCue.id)}
                          className="px-2.5 py-1.5 bg-[#171A21] hover:bg-[#20242E] disabled:opacity-35 border border-white/10 rounded text-[11px] text-[#E2E5EC] flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <Combine className="w-3 h-3 text-[#38BDF8]" />
                          <span>Gộp với câu sau</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Timing Fine Tuning */}
                <div className="space-y-3 pt-2 border-t border-white/8">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#8E95A5]">Bắt đầu (giây)</label>
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        value={Number(selectedCue.startSec.toFixed(2))}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          onUpdateCue(
                            selectedCue.id,
                            {
                              startSec: val,
                              endSec: Math.max(val + 0.15, selectedCue.endSec),
                            },
                            `cue-start-${selectedCue.id}`
                          );
                        }}
                        className="w-full bg-[#171A21] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#8E95A5]">Kết thúc (giây)</label>
                      <input
                        type="number"
                        step={0.05}
                        min={selectedCue.startSec + 0.15}
                        value={Number(selectedCue.endSec.toFixed(2))}
                        onChange={(e) => {
                          const val = Math.max(
                            selectedCue.startSec + 0.15,
                            Number(e.target.value) || selectedCue.startSec + 0.15
                          );
                          onUpdateCue(
                            selectedCue.id,
                            { endSec: val },
                            `cue-end-${selectedCue.id}`
                          );
                        }}
                        className="w-full bg-[#171A21] border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono-tabular text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
                      />
                    </div>
                  </div>

                  {/* Per-Word Exact Timestamps Editor */}
                  <div className="bg-[#0E1015] border border-white/8 rounded-md p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowWordTimings((v) => !v)}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-[#D5D9E2] hover:text-white cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-[#34D399]" />
                        <span>
                          Timing từng từ ({selectedCue.wordTimings ? 'Đang bật' : 'Tự động'})
                        </span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const timings = distributeWordTimingsEvenly(selectedCue);
                            onUpdateCue(selectedCue.id, { wordTimings: timings });
                            setShowWordTimings(true);
                          }}
                          className="text-[10px] font-medium text-[#34D399] hover:underline cursor-pointer"
                        >
                          Chia đều từng từ
                        </button>
                        {selectedCue.wordTimings && (
                          <button
                            type="button"
                            onClick={() => onUpdateCue(selectedCue.id, { wordTimings: null })}
                            className="text-[10px] text-[#8E95A5] hover:text-red-400 cursor-pointer"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>

                    {showWordTimings && selectedCue.wordTimings && (
                      <div className="max-h-40 overflow-y-auto space-y-1.5 pt-1 border-t border-white/6">
                        {tokenizeCueText(selectedCue.text).flatWords.map((tok) => {
                          const wt = selectedCue.wordTimings?.[tok.wordIndex] ?? {
                            startSec: selectedCue.startSec,
                            endSec: selectedCue.endSec,
                          };
                          return (
                            <div
                              key={tok.wordIndex}
                              className="grid grid-cols-[1fr_68px_68px] items-center gap-1.5 text-[11px]"
                            >
                              <span className="truncate text-[#E2E5EC]" title={tok.word}>
                                {tok.word}
                              </span>
                              <input
                                type="number"
                                step={0.02}
                                min={0}
                                value={Number(wt.startSec.toFixed(2))}
                                onChange={(e) => {
                                  const nextVal = Math.max(0, Number(e.target.value) || 0);
                                  const nextArr = [...(selectedCue.wordTimings || [])];
                                  nextArr[tok.wordIndex] = {
                                    startSec: nextVal,
                                    endSec: Math.max(nextVal + 0.05, wt.endSec),
                                  };
                                  onUpdateCue(
                                    selectedCue.id,
                                    { wordTimings: nextArr },
                                    `wt-s-${selectedCue.id}-${tok.wordIndex}`
                                  );
                                }}
                                className="bg-[#171A21] border border-white/10 rounded px-1.5 py-0.5 text-[11px] font-mono-tabular text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
                              />
                              <input
                                type="number"
                                step={0.02}
                                min={wt.startSec + 0.05}
                                value={Number(wt.endSec.toFixed(2))}
                                onChange={(e) => {
                                  const nextVal = Math.max(
                                    wt.startSec + 0.05,
                                    Number(e.target.value) || wt.startSec + 0.05
                                  );
                                  const nextArr = [...(selectedCue.wordTimings || [])];
                                  nextArr[tok.wordIndex] = {
                                    startSec: wt.startSec,
                                    endSec: nextVal,
                                  };
                                  onUpdateCue(
                                    selectedCue.id,
                                    { wordTimings: nextArr },
                                    `wt-e-${selectedCue.id}-${tok.wordIndex}`
                                  );
                                }}
                                className="bg-[#171A21] border border-white/10 rounded px-1.5 py-0.5 text-[11px] font-mono-tabular text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Word-by-Word Emphasis Selector */}
                <div className="space-y-3 pt-3 border-t border-white/8">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#E2E5EC]">
                      Nhấn mạnh &amp; Đổi màu từng từ
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateCue(selectedCue.id, { wordStyles: {} });
                        setActiveWordIdx(null);
                      }}
                      className="text-[11px] text-[#8E95A5] hover:text-[#F4F5F7] cursor-pointer"
                    >
                      Bỏ chọn hết
                    </button>
                  </div>
                  <p className="text-[11px] text-[#8E95A5] leading-relaxed">
                    Bôi đen chữ ở ô trên để nhấn nhanh, kéo chuột qua các thẻ từ, hoặc{' '}
                    <span className="text-[#D5D9E2]">Shift+Click</span> chọn cả cụm.
                  </p>

                  {/* Remembered Last Emphasis Preset Status Bar */}
                  <div className="px-2.5 py-1.5 bg-[#151821] border border-white/8 rounded-md flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <BookmarkCheck className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-white/25 shrink-0"
                        style={{ backgroundColor: resolvedEmphasisTemplate.color || typography.emphasisColor }}
                      />
                      <span className="text-[#D5D9E2] truncate">
                        Mẫu nhớ:{' '}
                        <strong className="text-white font-medium">
                          {EMPHASIS_STYLES.find((s) => s.id === resolvedEmphasisTemplate.style)?.label ||
                            'Đổi màu'}
                        </strong>
                        {resolvedEmphasisTemplate.scale
                          ? ` • ${Math.round(resolvedEmphasisTemplate.scale * 100)}%`
                          : ''}
                        {resolvedEmphasisTemplate.uppercase ? ' • IN HOA' : ''}
                      </span>
                    </div>
                    {lastEmphasisPreset && (
                      <button
                        type="button"
                        onClick={() => {
                          rememberEmphasisPreset(null);
                        }}
                        title="Quay lại mẫu nhấn mặc định của kiểu chữ"
                        className="text-[#8E95A5] hover:text-white shrink-0 cursor-pointer"
                      >
                        Đặt lại
                      </button>
                    )}
                  </div>

                  <div
                    onMouseLeave={() => {
                      if (chipDragRange && chipDragRange.end !== chipDragRange.start) {
                        const from = Math.min(chipDragRange.start, chipDragRange.end);
                        const to = Math.max(chipDragRange.start, chipDragRange.end);
                        const range: number[] = [];
                        for (let i = from; i <= to; i++) range.push(i);
                        applyRememberedEmphasisToIndices(selectedCue, range);
                      }
                      setChipDragRange(null);
                    }}
                    onMouseUp={() => {
                      if (chipDragRange && chipDragRange.end !== chipDragRange.start) {
                        const from = Math.min(chipDragRange.start, chipDragRange.end);
                        const to = Math.max(chipDragRange.start, chipDragRange.end);
                        const range: number[] = [];
                        for (let i = from; i <= to; i++) range.push(i);
                        applyRememberedEmphasisToIndices(selectedCue, range);
                      }
                      setChipDragRange(null);
                    }}
                    className="flex flex-wrap gap-1.5 p-2.5 bg-[#0E1015] border border-white/8 rounded-md select-none"
                  >
                    {tokenizeCueText(selectedCue.text).flatWords.map((tok) => {
                      const ws = selectedCue.wordStyles[tok.wordIndex];
                      const isEmph = Boolean(ws?.emphasized);
                      const isFocused = activeWordIdx === tok.wordIndex && isEmph;
                      const wordColor = ws?.color || typography.emphasisColor;
                      const inDragRange =
                        chipDragRange !== null &&
                        tok.wordIndex >= Math.min(chipDragRange.start, chipDragRange.end) &&
                        tok.wordIndex <= Math.max(chipDragRange.start, chipDragRange.end);

                      return (
                        <button
                          key={tok.wordIndex}
                          type="button"
                          onMouseDown={() =>
                            setChipDragRange({ start: tok.wordIndex, end: tok.wordIndex })
                          }
                          onMouseEnter={() => {
                            if (chipDragRange) {
                              setChipDragRange((prev) =>
                                prev ? { ...prev, end: tok.wordIndex } : null
                              );
                            }
                          }}
                          onClick={(e) => toggleWordEmphasis(selectedCue, tok.wordIndex, e)}
                          style={
                            isEmph
                              ? {
                                  borderColor: wordColor,
                                  color: wordColor,
                                }
                              : undefined
                          }
                          className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer ${
                            inDragRange && chipDragRange.start !== chipDragRange.end
                              ? 'bg-[#FF5A1F]/25 border-[#FF5A1F] text-white'
                              : isEmph
                              ? `bg-white/8 ${isFocused ? 'ring-1 ring-white/50' : ''}`
                              : 'bg-[#171A21] border-white/10 text-[#D5D9E2] hover:border-white/25'
                          }`}
                        >
                          {tok.word}
                        </button>
                      );
                    })}
                  </div>

                  {/* Per-word Color, Size & Style Controls if any word is emphasized */}
                  {Object.keys(selectedCue.wordStyles).length > 0 && (() => {
                    const focusedStyle: WordStyleOverride | undefined =
                      activeWordIdx !== null ? selectedCue.wordStyles[activeWordIdx] : undefined;
                    const firstKey = Number(Object.keys(selectedCue.wordStyles)[0]);
                    const refStyle = focusedStyle || selectedCue.wordStyles[firstKey];
                    const currentScale = refStyle?.scale ?? typography.emphasisScale;
                    const currentRotate = refStyle?.rotateDeg ?? 0;
                    const currentOffsetY = refStyle?.offsetY ?? 0;
                    const currentFont = refStyle?.fontFamily || '';
                    const currentWeight = refStyle?.fontWeight ?? 0;
                    const currentUppercase = Boolean(refStyle?.uppercase);
                    const currentColor = refStyle?.color || typography.emphasisColor;
                    const currentBgColor = refStyle?.bgColor || currentColor;
                    const currentStyle = refStyle?.style || typography.emphasisStyle;

                    return (
                      <div className="p-3 bg-[#161921] border border-white/8 rounded-md space-y-3">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-[#D5D9E2] font-medium truncate">
                            {focusedStyle && activeWordIdx !== null
                              ? `Tùy chỉnh từ #${activeWordIdx + 1}`
                              : 'Áp dụng cho các từ đang nhấn'}
                          </span>
                          {focusedStyle && activeWordIdx !== null && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...selectedCue.wordStyles };
                                delete next[activeWordIdx];
                                onUpdateCue(selectedCue.id, { wordStyles: next });
                                setActiveWordIdx(null);
                              }}
                              className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer shrink-0"
                            >
                              Bỏ nhấn từ này
                            </button>
                          )}
                        </div>

                        {/* Color Swatches */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-[#8E95A5] block">Màu chữ / Điểm nhấn</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {EMPHASIS_SWATCHES.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                aria-label={`Chọn màu ${hex}`}
                                onClick={() => applyPatchToTargetWords(selectedCue, { color: hex })}
                                style={{ backgroundColor: hex }}
                                className={`w-6 h-6 rounded border hover:scale-110 transition-transform cursor-pointer ${
                                  currentColor.toLowerCase() === hex.toLowerCase()
                                    ? 'border-white ring-1 ring-white/60'
                                    : 'border-white/20'
                                }`}
                              />
                            ))}
                            <input
                              type="color"
                              value={currentColor}
                              onChange={(e) =>
                                applyPatchToTargetWords(selectedCue, { color: e.target.value })
                              }
                              title="Chọn màu tùy chỉnh"
                              className="w-7 h-6 bg-transparent border-0 cursor-pointer rounded"
                            />
                          </div>
                        </div>

                        {/* Emphasis Style Grid */}
                        <div className="grid grid-cols-2 gap-1.5">
                          {EMPHASIS_STYLES.map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() =>
                                applyPatchToTargetWords(selectedCue, { style: st.id })
                              }
                              className={`px-2 py-1.5 text-[11px] rounded border transition-colors cursor-pointer text-left truncate ${
                                currentStyle === st.id
                                  ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                                  : 'bg-[#111318] border-white/8 text-[#9BA3B4] hover:text-white'
                              }`}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>

                        {/* Font Size Scale Slider (Per-Word) */}
                        <div className="space-y-1 pt-2 border-t border-white/8">
                          <div className="flex justify-between text-[11px] text-[#8E95A5]">
                            <span>Phóng to / Cỡ chữ riêng</span>
                            <span className="font-mono-tabular text-[#E2E5EC]">
                              {Math.round(currentScale * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.7}
                            max={2.2}
                            step={0.05}
                            value={currentScale}
                            onChange={(e) =>
                              applyPatchToTargetWords(selectedCue, {
                                scale: Number(e.target.value),
                              })
                            }
                            className="w-full"
                          />
                        </div>

                        {/* Custom Font & Weight per Word */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] text-[#8E95A5]">Font riêng từ này</label>
                            <select
                              value={currentFont}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val) ensureGoogleFontLoaded(val);
                                applyPatchToTargetWords(selectedCue, {
                                  fontFamily: val || null,
                                });
                              }}
                              className="w-full bg-[#111318] border border-white/10 rounded px-2 py-1.5 text-[11px] text-[#E2E5EC] focus:outline-none focus:border-[#FF5A1F]"
                            >
                              <option value="">Theo câu</option>
                              {allFonts.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-[#8E95A5]">Độ đậm từ này</label>
                            <select
                              value={currentWeight}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                applyPatchToTargetWords(selectedCue, {
                                  fontWeight: v > 0 ? v : null,
                                });
                              }}
                              className="w-full bg-[#111318] border border-white/10 rounded px-2 py-1.5 text-[11px] text-[#E2E5EC] focus:outline-none focus:border-[#FF5A1F]"
                            >
                              <option value={0}>Mặc định</option>
                              <option value={400}>400 Regular</option>
                              <option value={600}>600 SemiBold</option>
                              <option value={700}>700 Bold</option>
                              <option value={800}>800 ExtraBold</option>
                              <option value={900}>900 Black</option>
                            </select>
                          </div>
                        </div>

                        {/* Tilt Angle & Vertical Nudge */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8E95A5]">
                              <span>Góc nghiêng</span>
                              <span className="font-mono-tabular">{currentRotate}°</span>
                            </div>
                            <input
                              type="range"
                              min={-20}
                              max={20}
                              step={1}
                              value={currentRotate}
                              onChange={(e) =>
                                applyPatchToTargetWords(selectedCue, {
                                  rotateDeg: Number(e.target.value),
                                })
                              }
                              className="w-full"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8E95A5]">
                              <span>Đẩy cao / thấp</span>
                              <span className="font-mono-tabular">{currentOffsetY}px</span>
                            </div>
                            <input
                              type="range"
                              min={-30}
                              max={30}
                              step={1}
                              value={currentOffsetY}
                              onChange={(e) =>
                                applyPatchToTargetWords(selectedCue, {
                                  offsetY: Number(e.target.value),
                                })
                              }
                              className="w-full"
                            />
                          </div>
                        </div>

                        {/* Effect Accent Color & Uppercase Toggle */}
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <label className="flex items-center gap-1.5 text-[11px] text-[#D5D9E2] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={currentUppercase}
                              onChange={(e) =>
                                applyPatchToTargetWords(selectedCue, {
                                  uppercase: e.target.checked,
                                })
                              }
                              className="w-3.5 h-3.5 accent-[#FF5A1F]"
                            />
                            <span>IN HOA từ này</span>
                          </label>

                          <label className="flex items-center gap-1.5 text-[11px] text-[#8E95A5] cursor-pointer">
                            <span>Màu khung/bóng</span>
                            <input
                              type="color"
                              value={currentBgColor}
                              onChange={(e) =>
                                applyPatchToTargetWords(selectedCue, {
                                  bgColor: e.target.value,
                                })
                              }
                              className="w-6 h-5 bg-transparent border-0 cursor-pointer rounded"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 3. Per-Cue Position & Style Overrides */}
                <div className="space-y-3 pt-3 border-t border-white/8">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#E2E5EC]">
                      Vị trí &amp; Ghi đè riêng câu này
                    </label>
                    {(selectedCue.customPos ||
                      selectedCue.customAnimation ||
                      selectedCue.customFont ||
                      selectedCue.customAlign ||
                      selectedCue.customScale) && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCue(selectedCue.id, {
                            customPos: null,
                            customAlign: null,
                            customAnimation: null,
                            customFont: null,
                            customScale: null,
                          })
                        }
                        className="text-[11px] text-[#FF5A1F] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Theo toàn cục</span>
                      </button>
                    )}
                  </div>

                  {/* Quick 9-point anchor for cue */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {ANCHOR_POINTS.map((pt) => {
                      const activeX = selectedCue.customPos?.x ?? typography.posX;
                      const activeY = selectedCue.customPos?.y ?? typography.posY;
                      const isClose =
                        Math.abs(activeX - pt.x) < 0.04 && Math.abs(activeY - pt.y) < 0.04;
                      return (
                        <button
                          key={pt.label}
                          type="button"
                          onClick={() =>
                            onUpdateCue(selectedCue.id, {
                              customPos: { x: pt.x, y: pt.y },
                            })
                          }
                          className={`py-1.5 text-[11px] rounded border transition-colors cursor-pointer ${
                            isClose && selectedCue.customPos
                              ? 'bg-[#FF5A1F]/20 border-[#FF5A1F] text-white'
                              : 'bg-[#171A21] border-white/8 text-[#9BA3B4] hover:text-white'
                          }`}
                        >
                          {pt.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Fine X/Y sliders */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#8E95A5]">
                        <span>Vị trí X</span>
                        <span className="font-mono-tabular">
                          {Math.round((selectedCue.customPos?.x ?? typography.posX) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.08}
                        max={0.92}
                        step={0.01}
                        value={selectedCue.customPos?.x ?? typography.posX}
                        onChange={(e) =>
                          onUpdateCue(selectedCue.id, {
                            customPos: {
                              x: Number(e.target.value),
                              y: selectedCue.customPos?.y ?? typography.posY,
                            },
                          })
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#8E95A5]">
                        <span>Vị trí Y</span>
                        <span className="font-mono-tabular">
                          {Math.round((selectedCue.customPos?.y ?? typography.posY) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.08}
                        max={0.92}
                        step={0.01}
                        value={selectedCue.customPos?.y ?? typography.posY}
                        onChange={(e) =>
                          onUpdateCue(selectedCue.id, {
                            customPos: {
                              x: selectedCue.customPos?.x ?? typography.posX,
                              y: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Per-cue Effect & Font Override */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11px] text-[#8E95A5]">Hiệu ứng câu này</label>
                      <select
                        value={selectedCue.customAnimation || ''}
                        onChange={(e) =>
                          onUpdateCue(selectedCue.id, {
                            customAnimation: (e.target.value || null) as AnimationPresetId | null,
                          })
                        }
                        className="w-full bg-[#171A21] border border-white/10 rounded px-2 py-1.5 text-xs text-[#E2E5EC] focus:outline-none focus:border-[#FF5A1F]"
                      >
                        <option value="">Theo mặc định</option>
                        {ANIMATION_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-[#8E95A5]">Font câu này</label>
                      <select
                        value={selectedCue.customFont || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) ensureGoogleFontLoaded(val);
                          onUpdateCue(selectedCue.id, {
                            customFont: val || null,
                          });
                        }}
                        className="w-full bg-[#171A21] border border-white/10 rounded px-2 py-1.5 text-xs text-[#E2E5EC] focus:outline-none focus:border-[#FF5A1F]"
                      >
                        <option value="">Theo mặc định</option>
                        {allFonts.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'typography' && (
          <>
            {/* 0. 1-Click Creator Style Templates */}
            {onApplyTemplate && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#E2E5EC] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#FF5A1F]" />
                    <span>Style Template 1-Click</span>
                  </label>
                  <span className="text-[10px] text-[#8E95A5]">{STYLE_TEMPLATES.length} mẫu</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                  {STYLE_TEMPLATES.map((tpl) => {
                    const isMatching =
                      typography.fontFamily === tpl.typography.fontFamily &&
                      motion.preset === tpl.motion.preset &&
                      background.presetId === tpl.background.presetId;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => {
                          if (tpl.typography.fontFamily) {
                            ensureGoogleFontLoaded(tpl.typography.fontFamily);
                          }
                          onApplyTemplate(tpl);
                        }}
                        className={`p-2 rounded-md border text-left transition-colors cursor-pointer ${
                          isMatching
                            ? 'bg-[#FF5A1F]/16 border-[#FF5A1F] text-white'
                            : 'bg-[#171A21] border-white/8 text-[#D5D9E2] hover:bg-[#1D212B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[11px] font-semibold truncate">{tpl.name}</span>
                          <span className="flex items-center gap-0.5 shrink-0">
                            {tpl.swatch.map((hex, sIdx) => (
                              <span
                                key={sIdx}
                                style={{ backgroundColor: hex }}
                                className="w-2 h-2 rounded-xs border border-white/20"
                              />
                            ))}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#8E95A5] truncate">{tpl.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 1. Kinetic Animation Presets */}
            <div className={`space-y-2.5 ${onApplyTemplate ? 'pt-4 border-t border-white/8' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[#E2E5EC]">
                  Hiệu ứng chuyển động chữ
                </label>
                <span className="text-[11px] text-[#8E95A5]">{ANIMATION_PRESETS.length} kiểu</span>
              </div>

              <input
                type="text"
                value={motionQuery}
                onChange={(e) => setMotionQuery(e.target.value)}
                placeholder="Tìm hiệu ứng (VD: marquee, skew, stamp, twist...)"
                className="w-full bg-[#171A21] border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-[#E2E5EC] placeholder-[#6B7280] focus:outline-none focus:border-[#FF5A1F]"
              />

              <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
                {ANIMATION_PRESETS.filter((preset) => {
                  const q = motionQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    preset.name.toLowerCase().includes(q) ||
                    preset.desc.toLowerCase().includes(q)
                  );
                }).map((preset) => {
                  const active = motion.preset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateMotion({ preset: preset.id })}
                      className={`p-2 rounded-md border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#FF5A1F]/16 border-[#FF5A1F] text-white'
                          : 'bg-[#171A21] border-white/8 text-[#D5D9E2] hover:bg-[#1D212B]'
                      }`}
                    >
                      <div className="text-xs font-semibold truncate">{preset.name}</div>
                      <div className="text-[10px] text-[#8E95A5] truncate">{preset.desc}</div>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Tốc độ vào</span>
                    <span className="font-mono-tabular">{motion.inSpeed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={2.4}
                    step={0.05}
                    value={motion.inSpeed}
                    onChange={(e) => onUpdateMotion({ inSpeed: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Độ trễ từng từ</span>
                    <span className="font-mono-tabular">
                      {Math.round(motion.staggerAmount * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={motion.staggerAmount}
                    onChange={(e) => onUpdateMotion({ staggerAmount: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between pt-1 cursor-pointer">
                <span className="text-xs text-[#D5D9E2]">Nhún nhẹ theo nhịp Audio</span>
                <input
                  type="checkbox"
                  checked={motion.audioReactiveBounce}
                  onChange={(e) => onUpdateMotion({ audioReactiveBounce: e.target.checked })}
                  className="w-4 h-4 accent-[#FF5A1F]"
                />
              </label>
            </div>

            {/* 2. Font & Google Fonts Integration */}
            <div className="space-y-3 pt-4 border-t border-white/8">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#E2E5EC]">
                  Google Fonts &amp; Kiểu chữ ({allFonts.length} font)
                </label>
                <span
                  style={{ fontFamily: typography.fontFamily }}
                  className="text-xs text-[#FF5A1F] font-semibold truncate max-w-[140px]"
                >
                  {typography.fontFamily}
                </span>
              </div>

              {/* Category Chips */}
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: 'ALL', label: 'Tất cả' },
                    { id: 'Display', label: 'Poster' },
                    { id: 'Sans', label: 'Sans' },
                    { id: 'Serif', label: 'Serif' },
                    { id: 'Script', label: 'Viết tay' },
                    { id: 'Mono', label: 'Tech/Mono' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFontCategory(cat.id)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                      fontCategory === cat.id
                        ? 'bg-[#FF5A1F] text-white'
                        : 'bg-[#171A21] text-[#9BA3B4] hover:text-white border border-white/8'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Font Search */}
              <input
                type="text"
                value={fontQuery}
                onChange={(e) => setFontQuery(e.target.value)}
                placeholder="Lọc font có sẵn..."
                className="w-full bg-[#171A21] border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-[#E2E5EC] placeholder-[#6B7280] focus:outline-none focus:border-[#FF5A1F]"
              />

              {/* Visual Font Picker Grid */}
              <div className="max-h-44 overflow-y-auto space-y-1 p-1.5 bg-[#0E1015] border border-white/8 rounded-md">
                {allFonts
                  .filter((f) => {
                    if (fontCategory !== 'ALL' && f.category !== fontCategory) return false;
                    const q = fontQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      f.label.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
                    );
                  })
                  .map((f) => {
                    const active = typography.fontFamily.toLowerCase() === f.id.toLowerCase();
                    const isCustom = customFonts.some(
                      (cf) => cf.id.toLowerCase() === f.id.toLowerCase()
                    );
                    return (
                      <div
                        key={f.id}
                        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border transition-colors ${
                          active
                            ? 'bg-[#FF5A1F]/16 border-[#FF5A1F] text-white'
                            : 'bg-[#161921] border-white/6 text-[#D5D9E2] hover:bg-[#1D212B]'
                        }`}
                      >
                        <button
                          type="button"
                          onMouseEnter={() => ensureGoogleFontLoaded(f.id)}
                          onClick={() => handleSelectGlobalFont(f.id)}
                          className="flex-1 text-left flex items-center justify-between gap-2 cursor-pointer min-w-0"
                        >
                          <span
                            style={{ fontFamily: `"${f.id}", sans-serif` }}
                            className="text-xs font-semibold truncate"
                          >
                            {f.label}
                          </span>
                          <span className="text-[10px] text-[#8E95A5] shrink-0">
                            {isCustom ? 'Tự thêm' : f.category}
                          </span>
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => setCustomFonts(removeCustomGoogleFont(f.id))}
                            title="Xóa font tự thêm"
                            className="p-0.5 text-[#8E95A5] hover:text-red-400 cursor-pointer shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Dynamic Custom Google Font Loader */}
              <div className="p-2.5 bg-[#151821] border border-white/8 rounded-md space-y-1.5">
                <label className="text-[11px] font-medium text-[#D5D9E2] block">
                  Tải thêm font bất kỳ từ Google Fonts
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customFontInput}
                    onChange={(e) => setCustomFontInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLoadCustomGoogleFont();
                      }
                    }}
                    placeholder="VD: Syne, Lobster, Sedgwick Ave..."
                    className="flex-1 min-w-0 bg-[#0E1015] border border-white/10 rounded px-2.5 py-1.5 text-xs text-[#F4F5F7] placeholder-[#6B7280] focus:outline-none focus:border-[#FF5A1F]"
                  />
                  <button
                    type="button"
                    onClick={handleLoadCustomGoogleFont}
                    className="px-2.5 py-1.5 bg-[#FF5A1F] hover:bg-[#E84D14] text-white text-[11px] font-semibold rounded cursor-pointer shrink-0"
                  >
                    Tải font
                  </button>
                </div>
                {fontLoadingMsg && <p className="text-[10px] text-[#38BDF8]">{fontLoadingMsg}</p>}
                {fontErrorMsg && <p className="text-[10px] text-red-400">{fontErrorMsg}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Cỡ chữ</span>
                    <span className="font-mono-tabular">{typography.fontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={32}
                    max={150}
                    step={2}
                    value={typography.fontSize}
                    onChange={(e) => onUpdateTypography({ fontSize: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Độ đậm</span>
                    <span className="font-mono-tabular">{typography.fontWeight}</span>
                  </div>
                  <input
                    type="range"
                    min={400}
                    max={900}
                    step={100}
                    value={typography.fontWeight}
                    onChange={(e) => onUpdateTypography({ fontWeight: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Giãn dòng</span>
                    <span className="font-mono-tabular">{typography.lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.95}
                    max={1.8}
                    step={0.05}
                    value={typography.lineHeight}
                    onChange={(e) => onUpdateTypography({ lineHeight: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Giãn chữ</span>
                    <span className="font-mono-tabular">{typography.letterSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min={-6}
                    max={18}
                    step={0.5}
                    value={typography.letterSpacing}
                    onChange={(e) => onUpdateTypography({ letterSpacing: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Alignment & Case */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex bg-[#171A21] border border-white/8 rounded-md p-0.5">
                  {(['left', 'center', 'right'] as TextAlignMode[]).map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => onUpdateTypography({ textAlign: align })}
                      className={`flex-1 py-1.5 flex items-center justify-center rounded transition-colors cursor-pointer ${
                        typography.textAlign === align
                          ? 'bg-[#262B38] text-white'
                          : 'text-[#8E95A5] hover:text-white'
                      }`}
                    >
                      {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                      {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                      {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>

                <select
                  value={typography.textTransform}
                  onChange={(e) =>
                    onUpdateTypography({ textTransform: e.target.value as TextTransformMode })
                  }
                  className="bg-[#171A21] border border-white/8 rounded-md px-2 text-xs text-[#E2E5EC] focus:outline-none"
                >
                  <option value="none">Chữ nguyên bản</option>
                  <option value="uppercase">IN HOA TOÀN BỘ</option>
                  <option value="titlecase">Viết Hoa Đầu Từ</option>
                </select>
              </div>

              {/* Global Position 9-point */}
              <div className="space-y-2 pt-1">
                <div className="flex justify-between text-[11px] text-[#8E95A5]">
                  <span>Vị trí khối chữ mặc định</span>
                  <span className="font-mono-tabular">
                    {Math.round(typography.posX * 100)}%, {Math.round(typography.posY * 100)}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {ANCHOR_POINTS.map((pt) => {
                    const active =
                      Math.abs(typography.posX - pt.x) < 0.04 &&
                      Math.abs(typography.posY - pt.y) < 0.04;
                    return (
                      <button
                        key={pt.label}
                        type="button"
                        onClick={() => onUpdateTypography({ posX: pt.x, posY: pt.y })}
                        className={`py-1 text-[11px] rounded border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#FF5A1F]/20 border-[#FF5A1F] text-white'
                            : 'bg-[#171A21] border-white/8 text-[#9BA3B4] hover:text-white'
                        }`}
                      >
                        {pt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Colors, Stroke & Shadow */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center justify-between bg-[#171A21] border border-white/8 rounded px-2.5 py-1.5 cursor-pointer">
                  <span className="text-xs text-[#D5D9E2]">Màu chữ chính</span>
                  <input
                    type="color"
                    value={typography.baseColor}
                    onChange={(e) => onUpdateTypography({ baseColor: e.target.value })}
                    className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between bg-[#171A21] border border-white/8 rounded px-2.5 py-1.5 cursor-pointer">
                  <span className="text-xs text-[#D5D9E2]">Màu nhấn mặc định</span>
                  <input
                    type="color"
                    value={typography.emphasisColor}
                    onChange={(e) => onUpdateTypography({ emphasisColor: e.target.value })}
                    className="w-6 h-5 bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Viền chữ (Stroke)</span>
                    <span className="font-mono-tabular">{typography.strokeWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={typography.strokeWidth}
                    onChange={(e) => onUpdateTypography({ strokeWidth: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Độ mờ bóng</span>
                    <span className="font-mono-tabular">{typography.shadowBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={typography.shadowBlur}
                    onChange={(e) => onUpdateTypography({ shadowBlur: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#8E95A5]">
                  <span>Chiều rộng tối đa dòng chữ</span>
                  <span className="font-mono-tabular">{typography.maxWidthPercent}%</span>
                </div>
                <input
                  type="range"
                  min={45}
                  max={94}
                  step={1}
                  value={typography.maxWidthPercent}
                  onChange={(e) =>
                    onUpdateTypography({ maxWidthPercent: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
            </div>

            {/* 3. Extra Text & Camera Effects */}
            {effects && onUpdateEffects && (
              <div className="space-y-3 pt-4 border-t border-white/8">
                <label className="text-xs font-semibold text-[#E2E5EC] block">
                  Hiệu ứng chữ &amp; Camera phụ trợ
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-[#D5D9E2]">
                    Camera trôi nhẹ điện ảnh (Float)
                  </span>
                  <input
                    type="checkbox"
                    checked={effects.cameraFloat}
                    onChange={(e) => onUpdateEffects({ cameraFloat: e.target.checked })}
                    className="w-4 h-4 accent-[#FF5A1F]"
                  />
                </label>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Tách kênh RGB (Chromatic Aberration)</span>
                    <span className="font-mono-tabular">
                      {Math.round(effects.chromaticAberration * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={effects.chromaticAberration}
                    onChange={(e) =>
                      onUpdateEffects({ chromaticAberration: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Khung nền sau chữ (Backdrop Card)</span>
                      <span className="font-mono-tabular">
                        {Math.round(effects.textCardOpacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.85}
                      step={0.05}
                      value={effects.textCardOpacity}
                      onChange={(e) =>
                        onUpdateEffects({ textCardOpacity: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                  <input
                    type="color"
                    value={effects.textCardColor}
                    onChange={(e) => onUpdateEffects({ textCardColor: e.target.value })}
                    title="Màu khung nền chữ"
                    className="w-8 h-7 bg-[#171A21] border border-white/10 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'background' && (
          <>
            {/* Mode Switch */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-[#E2E5EC] block">Chế độ nền</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'preset', label: 'Nền động có sẵn' },
                  { id: 'video', label: 'Video tải lên' },
                  { id: 'transparent', label: 'Trong suốt (Alpha)' },
                  { id: 'solid', label: 'Màu đơn sắc' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() =>
                      onUpdateBackground({ mode: m.id as BackgroundConfig['mode'] })
                    }
                    className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                      background.mode === m.id
                        ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                        : 'bg-[#171A21] border-white/8 text-[#9BA3B4] hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {background.mode === 'transparent' && (
              <div className="p-3.5 bg-[#161922] border border-[#34D399]/30 rounded-md space-y-1.5">
                <div className="text-xs font-semibold text-[#34D399]">
                  Nền trong suốt Alpha đã bật
                </div>
                <p className="text-xs text-[#A1A8B8] leading-relaxed">
                  Phù hợp để xuất file <strong>MOV Apple ProRes 4444</strong> kèm Alpha Channel đưa
                  vào Premiere, After Effects, DaVinci Resolve hoặc CapCut hậu kỳ.
                </p>
              </div>
            )}

            {background.mode === 'solid' && (
              <div className="space-y-2.5 pt-2 border-t border-white/8">
                <label className="flex items-center justify-between bg-[#171A21] border border-white/8 rounded-md px-3 py-2 cursor-pointer">
                  <span className="text-xs text-[#E2E5EC]">Chọn màu nền</span>
                  <input
                    type="color"
                    value={background.solidColor}
                    onChange={(e) => onUpdateBackground({ solidColor: e.target.value })}
                    className="w-8 h-6 bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>
            )}

            {background.mode === 'preset' && (
              <div className="space-y-4 pt-2 border-t border-white/8">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[#E2E5EC] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF5A1F]" />
                    <span>{DYNAMIC_BG_PRESETS.length} Hiệu ứng nền động</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DYNAMIC_BG_PRESETS.map((p) => {
                      const active = background.presetId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            onUpdateBackground({
                              presetId: p.id,
                              primaryColor: p.defaults.primary,
                              secondaryColor: p.defaults.secondary,
                              accentColor: p.defaults.accent,
                            })
                          }
                          className={`p-2 rounded-md border flex flex-col justify-between gap-1.5 transition-colors cursor-pointer text-left ${
                            active
                              ? 'bg-[#FF5A1F]/16 border-[#FF5A1F]'
                              : 'bg-[#171A21] border-white/8 hover:bg-[#1D212B]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <div className="text-[11px] font-semibold text-[#F4F5F7] truncate">
                              {p.name}
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <span
                                style={{ backgroundColor: p.defaults.primary }}
                                className="w-2.5 h-2.5 rounded-xs border border-white/20"
                              />
                              <span
                                style={{ backgroundColor: p.defaults.accent }}
                                className="w-2.5 h-2.5 rounded-xs border border-white/20"
                              />
                            </div>
                          </div>
                          <div className="text-[10px] text-[#8E95A5] truncate w-full">
                            {p.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Background Palette */}
                <div className="grid grid-cols-3 gap-2">
                  <label className="bg-[#171A21] border border-white/8 rounded p-2 flex flex-col items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={background.primaryColor}
                      onChange={(e) => onUpdateBackground({ primaryColor: e.target.value })}
                      className="w-full h-6 bg-transparent border-0 cursor-pointer"
                    />
                    <span className="text-[10px] text-[#9BA3B4]">Chính</span>
                  </label>
                  <label className="bg-[#171A21] border border-white/8 rounded p-2 flex flex-col items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={background.secondaryColor}
                      onChange={(e) => onUpdateBackground({ secondaryColor: e.target.value })}
                      className="w-full h-6 bg-transparent border-0 cursor-pointer"
                    />
                    <span className="text-[10px] text-[#9BA3B4]">Phụ</span>
                  </label>
                  <label className="bg-[#171A21] border border-white/8 rounded p-2 flex flex-col items-center gap-1 cursor-pointer">
                    <input
                      type="color"
                      value={background.accentColor}
                      onChange={(e) => onUpdateBackground({ accentColor: e.target.value })}
                      className="w-full h-6 bg-transparent border-0 cursor-pointer"
                    />
                    <span className="text-[10px] text-[#9BA3B4]">Điểm nhấn</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Tốc độ nền</span>
                      <span className="font-mono-tabular">{background.speed.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={2.5}
                      step={0.1}
                      value={background.speed}
                      onChange={(e) => onUpdateBackground({ speed: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Cường độ</span>
                      <span className="font-mono-tabular">
                        {Math.round(background.intensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.2}
                      max={1.5}
                      step={0.05}
                      value={background.intensity}
                      onChange={(e) => onUpdateBackground({ intensity: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>

                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-[#D5D9E2]">Phản ứng theo nhịp Audio</span>
                  <input
                    type="checkbox"
                    checked={background.audioReactive}
                    onChange={(e) => onUpdateBackground({ audioReactive: e.target.checked })}
                    className="w-4 h-4 accent-[#FF5A1F]"
                  />
                </label>
              </div>
            )}

            {background.mode === 'video' && (
              <div className="space-y-4 pt-2 border-t border-white/8">
                <label className="flex flex-col items-center justify-center gap-2 p-5 bg-[#171A21] hover:bg-[#1D212B] border border-dashed border-white/20 rounded-md cursor-pointer transition-colors">
                  <Film className="w-6 h-6 text-[#FF5A1F]" />
                  <div className="text-xs font-medium text-[#E2E5EC] text-center">
                    {bgVideoName ? `Đã chọn: ${bgVideoName}` : 'Nhấn để tải lên Video nền'}
                  </div>
                  <div className="text-[11px] text-[#8E95A5] flex items-center gap-1">
                    <Upload className="w-3 h-3" />
                    <span>Hỗ trợ MP4, MOV, WebM</span>
                  </div>
                  <input
                    type="file"
                    accept="video/*,.mp4,.mov,.webm"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadBgVideo(file);
                      e.target.value = '';
                    }}
                  />
                </label>

                {bgVideoName && (
                  <div className="space-y-2">
                    {bgVideoDurationSec > 0 && (
                      <div className="px-3 py-2 bg-[#161922] border border-white/8 rounded-md flex items-center justify-between text-[11px] font-mono-tabular text-[#A1A8B8]">
                        <span>Clip gốc: {bgVideoDurationSec.toFixed(1)}s</span>
                        <span aria-hidden="true">→</span>
                        <span className="text-[#34D399]">
                          Kéo dài {totalDurationSec.toFixed(1)}s
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={onClearBgVideo}
                      className="w-full py-1.5 text-xs text-red-400 hover:bg-red-500/10 border border-red-400/20 rounded-md transition-colors cursor-pointer"
                    >
                      Gỡ video nền
                    </button>
                  </div>
                )}

                {/* Seamless Loop & Hidden Transition Controls */}
                <div className="space-y-3 pt-2 border-t border-white/8">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[#E2E5EC] block">
                      Nối vòng lặp ẩn chuyển tiếp (kéo dài vừa Audio)
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'crossfade', label: 'Hòa trộn mờ' },
                        { id: 'pingpong', label: 'Xuôi - Ngược' },
                        { id: 'cut', label: 'Nối thẳng' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onUpdateBackground({
                              videoLoop: true,
                              videoLoopMode: opt.id as BackgroundConfig['videoLoopMode'],
                            })
                          }
                          className={`py-2 px-1.5 text-[11px] font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                            background.videoLoopMode === opt.id
                              ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                              : 'bg-[#171A21] border-white/8 text-[#9BA3B4] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#8E95A5] leading-relaxed">
                      {background.videoLoopMode === 'crossfade' &&
                        'Làm mờ giao thoa giữa đoạn cuối và đoạn đầu để giấu vết cắt khi lặp lại.'}
                      {background.videoLoopMode === 'pingpong' &&
                        'Phát xuôi rồi đảo ngược liên tục (Boomerang) giúp điểm nối liền mạch 100%.'}
                      {background.videoLoopMode === 'cut' &&
                        'Lặp trực tiếp từ đầu khi hết clip.'}
                    </p>
                  </div>

                  {background.videoLoopMode === 'crossfade' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#8E95A5]">
                        <span>Thời lượng chuyển tiếp ẩn vết nối</span>
                        <span className="font-mono-tabular">
                          {background.videoCrossfadeSec.toFixed(1)}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={2.5}
                        step={0.1}
                        value={background.videoCrossfadeSec}
                        onChange={(e) =>
                          onUpdateBackground({ videoCrossfadeSec: Number(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Tốc độ phát video nền</span>
                      <span className="font-mono-tabular">
                        {background.videoPlaybackRate.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={background.videoPlaybackRate}
                      onChange={(e) =>
                        onUpdateBackground({ videoPlaybackRate: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-white/8">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Làm tối nền (Scrim tương phản chữ)</span>
                      <span className="font-mono-tabular">
                        {Math.round(background.videoDimmer * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.9}
                      step={0.05}
                      value={background.videoDimmer}
                      onChange={(e) =>
                        onUpdateBackground({ videoDimmer: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Làm mờ hậu cảnh (Blur)</span>
                      <span className="font-mono-tabular">{background.videoBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={25}
                      step={1}
                      value={background.videoBlur}
                      onChange={(e) => onUpdateBackground({ videoBlur: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>

              </div>
            )}

            {/* Ambient Soundscape Library, Multi-Layer Nature Mixer & Background Audio Balance */}
            {background.mode !== 'transparent' && (
              <div className="space-y-3 pt-3 border-t border-white/8">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#E2E5EC] flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Âm thanh nền &amp; Phối âm Tự nhiên</span>
                  </label>

                  {onTogglePreviewSoundscape && (bgAudioName || soundscape?.enabled) && (
                    <button
                      type="button"
                      onClick={onTogglePreviewSoundscape}
                      className={`px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 cursor-pointer transition-colors ${
                        isPreviewingSoundscape
                          ? 'bg-[#FF5A1F]/20 border-[#FF5A1F] text-[#FF8C66]'
                          : 'bg-[#171A21] border-white/10 text-[#D5D9E2] hover:text-white'
                      }`}
                    >
                      {isPreviewingSoundscape ? (
                        <>
                          <Square className="w-2.5 h-2.5 fill-current" />
                          <span>Dừng nghe thử</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Nghe thử nền</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {background.mode === 'video' && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateBackground({ bgAudioSource: 'video' })}
                      className={`py-2 px-2 text-[11px] font-medium rounded-md border transition-colors cursor-pointer truncate ${
                        background.bgAudioSource === 'video'
                          ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                          : 'bg-[#171A21] border-white/8 text-[#9BA3B4] hover:text-white'
                      }`}
                    >
                      Âm thanh gốc Video
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateBackground({ bgAudioSource: 'custom' })}
                      className={`py-2 px-2 text-[11px] font-medium rounded-md border transition-colors cursor-pointer truncate ${
                        background.bgAudioSource === 'custom'
                          ? 'bg-[#38BDF8]/18 border-[#38BDF8] text-white'
                          : 'bg-[#171A21] border-white/8 text-[#9BA3B4] hover:text-white'
                      }`}
                    >
                      Thư viện / File riêng
                    </button>
                  </div>
                )}

                {onUpdateSoundscape && (
                  <div className="space-y-3">
                    {/* Curated Storytelling Combos */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[#A1A8B8]">
                          Gợi ý phối âm Storytelling
                        </span>
                        {(soundscape?.enabled || bgAudioName) && onClearBgAudio && (
                          <button
                            type="button"
                            onClick={onClearBgAudio}
                            className="text-[10px] text-[#8E95A5] hover:text-red-400 cursor-pointer"
                          >
                            Tắt nhạc nền
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        {SOUNDSCAPE_COMBOS.map((combo) => {
                          const isComboActive =
                            soundscape?.enabled && soundscape.presetId === combo.id;
                          return (
                            <button
                              key={combo.id}
                              type="button"
                              onClick={() => {
                                onUpdateSoundscape({
                                  enabled: true,
                                  presetId: combo.id,
                                  layers: { ...combo.layers },
                                });
                                if (background.mode === 'video' && background.bgAudioSource !== 'custom') {
                                  onUpdateBackground({ bgAudioSource: 'custom' });
                                }
                              }}
                              className={`p-2 rounded-md border text-left transition-colors cursor-pointer ${
                                isComboActive
                                  ? 'bg-[#38BDF8]/16 border-[#38BDF8] text-white'
                                  : 'bg-[#171A21] border-white/8 hover:bg-[#1D212B] text-[#E2E5EC]'
                              }`}
                            >
                              <div className="text-[11px] font-semibold truncate">
                                {combo.name}
                              </div>
                              <div className="text-[10px] text-[#8E95A5] truncate mt-0.5">
                                {combo.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Multi-Layer Custom Mixer */}
                    <div className="p-2.5 bg-[#0E1015] border border-white/8 rounded-md space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-[#D5D9E2] flex items-center gap-1.5">
                          <Trees className="w-3.5 h-3.5 text-[#34D399]" />
                          <span>Tự ghép âm thanh nhiều lớp</span>
                        </span>
                        <div className="flex items-center gap-1">
                          {(
                            [
                              { id: 'ALL', label: 'Tất cả' },
                              { id: 'nature', label: 'Thiên nhiên' },
                              { id: 'music', label: 'Nhạc nền' },
                            ] as const
                          ).map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => setSoundCategory(cat.id)}
                              className={`px-1.5 py-0.5 text-[10px] rounded cursor-pointer ${
                                soundCategory === cat.id
                                  ? 'bg-[#1D212B] text-white font-medium'
                                  : 'text-[#8E95A5] hover:text-white'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                        {SOUNDSCAPE_LAYERS.filter(
                          (l) => soundCategory === 'ALL' || l.category === soundCategory
                        ).map((layer) => {
                          const layerVol = soundscape?.enabled
                            ? soundscape.layers?.[layer.id] ?? 0
                            : 0;
                          const isLayerActive = layerVol > 0.01;
                          return (
                            <div
                              key={layer.id}
                              className={`px-2 py-1.5 rounded border transition-colors space-y-1.5 ${
                                isLayerActive
                                  ? 'bg-[#161B24] border-[#38BDF8]/40'
                                  : 'bg-[#14171F] border-white/6'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextLayers = { ...(soundscape?.layers || {}) };
                                    if (isLayerActive) {
                                      delete nextLayers[layer.id];
                                    } else {
                                      nextLayers[layer.id] = 0.5;
                                    }
                                    const hasAny = Object.values(nextLayers).some((v) => v > 0.01);
                                    onUpdateSoundscape({
                                      enabled: hasAny,
                                      presetId: null,
                                      layers: nextLayers,
                                    });
                                    if (
                                      hasAny &&
                                      background.mode === 'video' &&
                                      background.bgAudioSource !== 'custom'
                                    ) {
                                      onUpdateBackground({ bgAudioSource: 'custom' });
                                    }
                                  }}
                                  className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full shrink-0 ${
                                      isLayerActive ? 'bg-[#34D399]' : 'bg-white/20'
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-medium text-[#E2E5EC] truncate">
                                      {layer.name}
                                    </div>
                                    <div className="text-[9.5px] text-[#7C8496] truncate">
                                      {layer.desc}
                                    </div>
                                  </div>
                                </button>
                                <span className="text-[10px] font-mono-tabular text-[#8E95A5] shrink-0">
                                  {isLayerActive ? `${Math.round(layerVol * 100)}%` : layer.badge}
                                </span>
                              </div>

                              {isLayerActive && (
                                <input
                                  type="range"
                                  min={0.05}
                                  max={1}
                                  step={0.05}
                                  value={layerVol}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    const nextLayers = {
                                      ...(soundscape?.layers || {}),
                                      [layer.id]: val,
                                    };
                                    onUpdateSoundscape(
                                      {
                                        enabled: true,
                                        presetId: null,
                                        layers: nextLayers,
                                      },
                                      `sc-layer-${layer.id}`
                                    );
                                  }}
                                  className="w-full"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload Custom BGM File + Active File Banner */}
                <div className="flex items-center gap-2">
                  <label className="flex-1 py-2 px-2.5 text-[11px] font-medium rounded-md border bg-[#171A21] hover:bg-[#1D212B] border-white/10 text-[#E2E5EC] cursor-pointer flex items-center justify-center gap-1.5 truncate">
                    <Upload className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0" />
                    <span className="truncate">
                      {bgAudioName && !soundscape?.enabled
                        ? `Đang dùng: ${bgAudioName}`
                        : 'Hoặc tải nhạc nền riêng (.mp3/.wav)'}
                    </span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && onUploadBgAudio) onUploadBgAudio(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {bgAudioName && onClearBgAudio && (
                    <button
                      type="button"
                      onClick={onClearBgAudio}
                      title="Gỡ âm thanh nền"
                      className="p-2 text-[#8E95A5] hover:text-red-400 bg-[#171A21] border border-white/10 rounded-md cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Background Audio Volume */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#8E95A5]">
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateBackground({
                            bgAudioVolume: background.bgAudioVolume > 0 ? 0 : 0.28,
                          })
                        }
                        title={background.bgAudioVolume > 0 ? 'Tắt tiếng nền' : 'Bật tiếng nền'}
                        className="text-[#9BA3B4] hover:text-white cursor-pointer"
                      >
                        {background.bgAudioVolume <= 0.005 ? (
                          <VolumeX className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5 text-[#38BDF8]" />
                        )}
                      </button>
                      <span>Âm lượng nhạc nền</span>
                    </span>
                    <span className="font-mono-tabular">
                      {Math.round(background.bgAudioVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={background.bgAudioVolume}
                    onChange={(e) =>
                      onUpdateBackground({ bgAudioVolume: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>

                {/* Main Voice Volume */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#8E95A5]">
                    <span>Âm lượng Voice / Audio chính</span>
                    <span className="font-mono-tabular">
                      {Math.round(background.voiceVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={background.voiceVolume}
                    onChange={(e) =>
                      onUpdateBackground({ voiceVolume: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Global Post-FX Overlay Filters (Vignette, Grain, Scanlines) */}
            {background.mode !== 'transparent' && effects && onUpdateEffects && (
              <div className="space-y-3 pt-3 border-t border-white/8">
                <label className="text-xs font-semibold text-[#E2E5EC] block">
                  Hiệu ứng hậu kỳ &amp; Bộ lọc khung hình
                </label>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-[#8E95A5]">
                    <span>Tối viền điện ảnh (Vignette)</span>
                    <span className="font-mono-tabular">
                      {Math.round(effects.vignette * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.85}
                    step={0.05}
                    value={effects.vignette}
                    onChange={(e) => onUpdateEffects({ vignette: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Hạt phim (Grain)</span>
                      <span className="font-mono-tabular">
                        {Math.round(effects.filmGrain * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.5}
                      step={0.02}
                      value={effects.filmGrain}
                      onChange={(e) => onUpdateEffects({ filmGrain: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-[#8E95A5]">
                      <span>Scanlines Retro</span>
                      <span className="font-mono-tabular">
                        {Math.round(effects.scanlines * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.6}
                      step={0.04}
                      value={effects.scanlines}
                      onChange={(e) => onUpdateEffects({ scanlines: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Brand Watermark / Logo PNG & Video Progress Bar */}
            {(onUpdateWatermark || onUpdateProgressBar) && (
              <div className="space-y-4 pt-4 border-t border-white/8">
                {onUpdateWatermark && watermark && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#E2E5EC]">
                        Logo / Watermark kênh
                      </label>
                      <input
                        type="checkbox"
                        checked={watermark.enabled}
                        onChange={(e) => onUpdateWatermark({ enabled: e.target.checked })}
                        className="w-4 h-4 accent-[#FF5A1F]"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-[#171A21] hover:bg-[#1D212B] border border-white/10 rounded-md cursor-pointer text-xs text-[#E2E5EC] truncate">
                        <ImagePlus className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0" />
                        <span className="truncate">
                          {watermark.name || (watermark.imageDataUrl ? 'Đổi Logo PNG' : 'Tải Logo PNG / SVG')}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/webp,image/svg+xml,image/jpeg"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const dataUrl = typeof reader.result === 'string' ? reader.result : null;
                                if (dataUrl) {
                                  preloadWatermarkImage(dataUrl);
                                  onUpdateWatermark({
                                    enabled: true,
                                    imageDataUrl: dataUrl,
                                    name: f.name,
                                  });
                                }
                              };
                              reader.readAsDataURL(f);
                            }
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(
                              `${import.meta.env.BASE_URL}assets/aistudio/file_00000000bf188211bf463903466f8fc8_93b63c53.png`
                            );
                            const blob = await res.blob();
                            const reader = new FileReader();
                            reader.onload = () => {
                              const dataUrl = typeof reader.result === 'string' ? reader.result : null;
                              if (dataUrl) {
                                preloadWatermarkImage(dataUrl);
                                onUpdateWatermark({
                                  enabled: true,
                                  imageDataUrl: dataUrl,
                                  name: 'Logo Hoạt Tự',
                                });
                              }
                            };
                            reader.readAsDataURL(blob);
                          } catch {
                            // Ignore asset load failure
                          }
                        }}
                        title="Dùng logo Hoạt Tự mặc định"
                        className="py-2 px-2.5 bg-[#171A21] hover:bg-[#1D212B] border border-white/10 rounded-md text-[11px] font-medium text-[#D5D9E2] hover:text-white cursor-pointer shrink-0"
                      >
                        Logo Hoạt Tự
                      </button>
                      {watermark.imageDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateWatermark({ enabled: false, imageDataUrl: null, name: null })
                          }
                          title="Xóa Logo"
                          className="p-2 text-[#8E95A5] hover:text-red-400 bg-[#171A21] border border-white/10 rounded-md cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {watermark.imageDataUrl && watermark.enabled && (
                      <div className="space-y-2.5 p-2.5 bg-[#151821] border border-white/8 rounded-md">
                        <div className="grid grid-cols-2 gap-1.5">
                          {(
                            [
                              { id: 'top-left', label: 'Trên Trái' },
                              { id: 'top-right', label: 'Trên Phải' },
                              { id: 'bottom-left', label: 'Dưới Trái' },
                              { id: 'bottom-right', label: 'Dưới Phải' },
                            ] as { id: WatermarkPosition; label: string }[]
                          ).map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => onUpdateWatermark({ position: pos.id })}
                              className={`py-1 px-2 text-[11px] rounded border transition-colors cursor-pointer ${
                                watermark.position === pos.id
                                  ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                                  : 'bg-[#111318] border-white/8 text-[#9BA3B4] hover:text-white'
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8E95A5]">
                              <span>Kích thước</span>
                              <span className="font-mono-tabular">
                                {Math.round(watermark.scale * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.05}
                              max={0.28}
                              step={0.01}
                              value={watermark.scale}
                              onChange={(e) =>
                                onUpdateWatermark({ scale: Number(e.target.value) }, 'wm-scale')
                              }
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8E95A5]">
                              <span>Độ mờ</span>
                              <span className="font-mono-tabular">
                                {Math.round(watermark.opacity * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.1}
                              max={1}
                              step={0.05}
                              value={watermark.opacity}
                              onChange={(e) =>
                                onUpdateWatermark({ opacity: Number(e.target.value) }, 'wm-opacity')
                              }
                              className="w-full"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {onUpdateProgressBar && progressBar && (
                  <div className="space-y-2.5 pt-3 border-t border-white/8">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#E2E5EC]">
                        Thanh tiến trình Video (Progress Bar)
                      </label>
                      <input
                        type="checkbox"
                        checked={progressBar.enabled}
                        onChange={(e) => onUpdateProgressBar({ enabled: e.target.checked })}
                        className="w-4 h-4 accent-[#FF5A1F]"
                      />
                    </div>

                    {progressBar.enabled && (
                      <div className="space-y-2.5 p-2.5 bg-[#151821] border border-white/8 rounded-md">
                        <div className="grid grid-cols-2 gap-1.5">
                          {(['top', 'bottom'] as const).map((pos) => (
                            <button
                              key={pos}
                              type="button"
                              onClick={() => onUpdateProgressBar({ position: pos })}
                              className={`py-1 text-[11px] rounded border cursor-pointer ${
                                progressBar.position === pos
                                  ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                                  : 'bg-[#111318] border-white/8 text-[#9BA3B4]'
                              }`}
                            >
                              {pos === 'top' ? 'Mép trên' : 'Mép dưới'}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              { id: 'bar', label: 'Thanh phẳng' },
                              { id: 'pill', label: 'Bo tròn' },
                              { id: 'glow', label: 'Phát sáng' },
                            ] as const
                          ).map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => onUpdateProgressBar({ style: st.id })}
                              className={`py-1 text-[10px] rounded border cursor-pointer ${
                                progressBar.style === st.id
                                  ? 'bg-[#FF5A1F]/18 border-[#FF5A1F] text-white'
                                  : 'bg-[#111318] border-white/8 text-[#9BA3B4]'
                              }`}
                            >
                              {st.label}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8E95A5]">
                              <span>Độ dày</span>
                              <span className="font-mono-tabular">{progressBar.heightPx}px</span>
                            </div>
                            <input
                              type="range"
                              min={4}
                              max={20}
                              step={1}
                              value={progressBar.heightPx}
                              onChange={(e) =>
                                onUpdateProgressBar(
                                  { heightPx: Number(e.target.value) },
                                  'pb-height'
                                )
                              }
                              className="w-full"
                            />
                          </div>
                          <input
                            type="color"
                            value={progressBar.color}
                            onChange={(e) =>
                              onUpdateProgressBar({ color: e.target.value }, 'pb-color')
                            }
                            title="Màu thanh tiến trình"
                            className="w-7 h-6 bg-transparent border-0 cursor-pointer rounded"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
