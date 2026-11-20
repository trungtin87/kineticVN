import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Braces,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code2,
  CornerDownLeft,
  Download,
  FileText,
  FolderOpen,
  Highlighter,
  Music,
  Scissors,
  Sparkles,
  X,
} from 'lucide-react';
import { SubtitleCue, WordStyleOverride } from '../types/studio';
import {
  buildTimedCuesFromScript,
  cuesToScriptText,
  exportSrt,
  formatTimecodeShort,
  getCursorLineInfo,
  parseSrt,
  previewScriptSplitAtCursor,
  splitScriptAtCursor,
  stepScriptCursorByWord,
  toggleBracketAtCursor,
} from '../utils/srtParser';

type EditorMode = 'script' | 'srt';
type ChipActionMode = 'bracket' | 'split';

interface ImportSrtModalProps {
  isOpen: boolean;
  cues: SubtitleCue[];
  audioName?: string | null;
  audioDurationSec: number;
  audioEnvelope?: Float32Array | null;
  emphasisTemplate?: WordStyleOverride;
  onClose: () => void;
  onImportCues: (cues: SubtitleCue[]) => void;
  onImportSrtText: (srtText: string) => void;
  onImportWordJson?: (jsonText: string) => void;
  onUploadAudio: (file: File) => void;
}

export const ImportSrtModal: React.FC<ImportSrtModalProps> = ({
  isOpen,
  cues,
  audioName = null,
  audioDurationSec,
  audioEnvelope = null,
  emphasisTemplate,
  onClose,
  onImportCues,
  onImportSrtText,
  onImportWordJson,
  onUploadAudio,
}) => {
  const [mode, setMode] = useState<EditorMode>('script');
  const [chipMode, setChipMode] = useState<ChipActionMode>('bracket');
  const [scriptText, setScriptText] = useState(() => cuesToScriptText(cues));
  const [srtText, setSrtText] = useState(() => exportSrt(cues, true));
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [cursorBump, setCursorBump] = useState(0);
  const [showMobileFiles, setShowMobileFiles] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const srtTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Persists the most recent valid caret/selection across touch blurs on mobile
  const lastValidSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  // Queues synchronous selection restoration immediately after React commits text/mode changes
  const pendingSelectionRef = useRef<{ start: number; end: number; focus?: boolean } | null>(null);

  const activeText = mode === 'script' ? scriptText : srtText;

  const updateSelectionSafe = (start: number, end: number, textLen: number) => {
    const s = Math.max(0, Math.min(textLen, start));
    const e = Math.max(0, Math.min(textLen, end));
    lastValidSelectionRef.current = { start: s, end: e };
    setSelection((prev) => (prev.start === s && prev.end === e ? prev : { start: s, end: e }));
  };

  const syncSelectionFromEl = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    updateSelectionSafe(s, e, el.value.length);
  };

  // Track native selectionchange so mobile touch caret drags (Android/iOS) update React live
  useEffect(() => {
    if (!isOpen) return;
    const onSelectionChange = () => {
      const target = mode === 'script' ? scriptTextareaRef.current : srtTextareaRef.current;
      if (target && document.activeElement === target) {
        syncSelectionFromEl(target);
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [isOpen, mode]);

  // Synchronously restore selection range right after DOM commit so caret never jumps to 0 or end
  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    pendingSelectionRef.current = null;
    const target = mode === 'script' ? scriptTextareaRef.current : srtTextareaRef.current;
    if (!target) return;
    if (pending.focus !== false && document.activeElement !== target) {
      target.focus({ preventScroll: true });
    }
    const maxLen = target.value.length;
    const s = Math.max(0, Math.min(maxLen, pending.start));
    const e = Math.max(0, Math.min(maxLen, pending.end));
    try {
      target.setSelectionRange(s, e);
    } catch {
      // Ignore if textarea is not selectable in current browser state
    }
    lastValidSelectionRef.current = { start: s, end: e };
  }, [scriptText, srtText, mode, selection, cursorBump]);

  const cursorLineInfo = useMemo(
    () => getCursorLineInfo(activeText, selection.start),
    [activeText, selection.start]
  );

  const splitPreview = useMemo(
    () =>
      mode === 'script'
        ? previewScriptSplitAtCursor(scriptText, selection.start, selection.end)
        : null,
    [mode, scriptText, selection.start, selection.end]
  );

  const calibratedCues = useMemo(
    () =>
      buildTimedCuesFromScript(
        scriptText,
        audioDurationSec,
        audioEnvelope,
        emphasisTemplate
      ),
    [scriptText, audioDurationSec, audioEnvelope, emphasisTemplate]
  );

  // Map current lineIndex to calibratedCue index (skipping any blank lines above cursor)
  const activeCalibratedCueIdx = useMemo(() => {
    if (mode !== 'script') return -1;
    const lines = scriptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if ((lines[cursorLineInfo.lineIndex] ?? '').trim().length === 0) return -1;
    let nonEmptyBefore = 0;
    for (let i = 0; i < cursorLineInfo.lineIndex; i++) {
      if ((lines[i] ?? '').trim().length > 0) nonEmptyBefore++;
    }
    return nonEmptyBefore;
  }, [mode, scriptText, cursorLineInfo.lineIndex]);

  if (!isOpen) return null;

  const getCurrentRange = (): { start: number; end: number } => {
    const isScript = mode === 'script';
    const currentText = isScript ? scriptText : srtText;
    const refEl = isScript ? scriptTextareaRef.current : srtTextareaRef.current;

    if (refEl && document.activeElement === refEl) {
      const s = refEl.selectionStart ?? lastValidSelectionRef.current.start;
      const e = refEl.selectionEnd ?? lastValidSelectionRef.current.end;
      return {
        start: Math.max(0, Math.min(currentText.length, s)),
        end: Math.max(0, Math.min(currentText.length, e)),
      };
    }

    return {
      start: Math.max(0, Math.min(currentText.length, lastValidSelectionRef.current.start)),
      end: Math.max(0, Math.min(currentText.length, lastValidSelectionRef.current.end)),
    };
  };

  const applyCursorMove = (nextPos: number, endPos = nextPos) => {
    const isScript = mode === 'script';
    const currentText = isScript ? scriptText : srtText;
    const s = Math.max(0, Math.min(currentText.length, nextPos));
    const e = Math.max(0, Math.min(currentText.length, endPos));
    pendingSelectionRef.current = { start: s, end: e, focus: true };
    updateSelectionSafe(s, e, currentText.length);
    setCursorBump((v) => v + 1);
  };

  const handleStepWord = (direction: -1 | 1) => {
    const isScript = mode === 'script';
    const currentText = isScript ? scriptText : srtText;
    const { start } = getCurrentRange();
    const nextPos = stepScriptCursorByWord(currentText, start, direction);
    applyCursorMove(nextPos);
  };

  const applyToggleBracket = (customStart?: number, customEnd?: number) => {
    const isScript = mode === 'script';
    const currentText = isScript ? scriptText : srtText;
    const fallback = getCurrentRange();

    const s = customStart !== undefined ? customStart : fallback.start;
    const e = customEnd !== undefined ? customEnd : fallback.end;

    const res = toggleBracketAtCursor(currentText, s, e);
    if (res.action === 'none') return;

    pendingSelectionRef.current = {
      start: res.nextSelStart,
      end: res.nextSelEnd,
      focus: true,
    };
    if (isScript) {
      setScriptText(res.nextText);
    } else {
      setSrtText(res.nextText);
    }
    updateSelectionSafe(res.nextSelStart, res.nextSelEnd, res.nextText.length);
  };

  const handleInsertSplitNewline = (customStart?: number, customEnd?: number) => {
    const isScript = mode === 'script';
    const currentText = isScript ? scriptText : srtText;
    const fallback = getCurrentRange();
    const start = customStart !== undefined ? customStart : fallback.start;
    const end = customEnd !== undefined ? customEnd : fallback.end;

    if (isScript) {
      const res = splitScriptAtCursor(currentText, start, end);
      pendingSelectionRef.current = {
        start: res.nextCursor,
        end: res.nextCursor,
        focus: true,
      };
      setScriptText(res.nextText);
      updateSelectionSafe(res.nextCursor, res.nextCursor, res.nextText.length);
    } else {
      const nextText = currentText.slice(0, start) + '\n' + currentText.slice(end);
      const nextPos = start + 1;
      pendingSelectionRef.current = {
        start: nextPos,
        end: nextPos,
        focus: true,
      };
      setSrtText(nextText);
      updateSelectionSafe(nextPos, nextPos, nextText.length);
    }
  };

  const handleSwitchMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'srt') {
      if (calibratedCues.length > 0) {
        setSrtText(exportSrt(calibratedCues, true));
      }
    } else {
      const parsed = parseSrt(srtText, emphasisTemplate);
      if (parsed.length > 0) {
        setScriptText(cuesToScriptText(parsed));
      }
    }
    pendingSelectionRef.current = { start: 0, end: 0, focus: false };
    lastValidSelectionRef.current = { start: 0, end: 0 };
    setSelection({ start: 0, end: 0 });
    setMode(nextMode);
  };

  const handleDownloadSrt = () => {
    const cuesToSave =
      mode === 'script'
        ? calibratedCues
        : parseSrt(srtText, emphasisTemplate);
    const content =
      cuesToSave.length > 0 ? exportSrt(cuesToSave, false) : srtText;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hoattu_subtitles.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeWordToken =
    cursorLineInfo.activeTokenIdx >= 0
      ? cursorLineInfo.tokens[cursorLineInfo.activeTokenIdx]
      : null;

  const hasRangeSelection = selection.end > selection.start;
  const bracketButtonLabel = hasRangeSelection
    ? 'Bọc [cụm]'
    : activeWordToken
    ? activeWordToken.emphasized
      ? `Bỏ [${activeWordToken.word}]`
      : `Bọc [${activeWordToken.word}]`
    : 'Bọc [từ]';

  const splitButtonLabel =
    mode === 'script' && splitPreview?.canSplitSentence
      ? `Tách sau "${splitPreview.beforeWord}"`
      : 'Tách câu';

  const avgCueDuration =
    calibratedCues.length > 0
      ? audioDurationSec / calibratedCues.length
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-[#14171F] sm:border border-white/12 rounded-none sm:rounded-lg overflow-hidden shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh]">
        {/* Modal Header */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-white/8 flex items-center justify-between shrink-0 bg-[#111318]">
          <h3 className="font-display text-sm font-semibold text-[#F4F5F7] truncate pr-2">
            Soạn thảo nội dung &amp; SRT trực tiếp
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="p-1.5 text-[#8E95A5] hover:text-white rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher + Mobile Files Toggle */}
        <div className="px-3 sm:px-5 pt-1.5 sm:pt-2.5 pb-0 border-b border-white/8 bg-[#10131A] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              type="button"
              onClick={() => handleSwitchMode('script')}
              className={`px-2.5 sm:px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'script'
                  ? 'border-[#FF5A1F] text-white'
                  : 'border-transparent text-[#8E95A5] hover:text-white'
              }`}
            >
              <AlignLeft className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0" />
              <span className="sm:hidden">Soạn nhanh</span>
              <span className="hidden sm:inline">Soạn nội dung nhanh (1 dòng = 1 câu)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode('srt')}
              className={`px-2.5 sm:px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'srt'
                  ? 'border-[#38BDF8] text-white'
                  : 'border-transparent text-[#8E95A5] hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
              <span className="sm:hidden">Mã .SRT</span>
              <span className="hidden sm:inline">Mã nguồn .SRT đầy đủ</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowMobileFiles((v) => !v)}
            className="sm:hidden mb-1 px-2 py-1 rounded bg-[#1A1E28] border border-white/10 text-[11px] text-[#D5D9E2] flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <FolderOpen className="w-3 h-3 text-[#38BDF8]" />
            <span>Tệp</span>
            {showMobileFiles ? (
              <ChevronUp className="w-3 h-3 text-[#8E95A5]" />
            ) : (
              <ChevronDown className="w-3 h-3 text-[#8E95A5]" />
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-2.5 sm:p-5 flex flex-col gap-2 sm:gap-3 min-h-0 flex-1 overflow-y-auto">
          {/* File Pickers Row */}
          <div className={`${showMobileFiles ? 'grid' : 'hidden'} sm:grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 shrink-0`}>
            <label className="flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
              <FileText className="w-4 h-4 text-[#FF5A1F] shrink-0" />
              <span>Chọn file .SRT / .TXT</span>
              <input
                type="file"
                accept=".srt,.txt"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const raw = await f.text();
                    setJsonError(null);
                    if (raw.includes('-->')) {
                      setSrtText(raw);
                      const parsed = parseSrt(raw, emphasisTemplate);
                      setScriptText(parsed.length > 0 ? cuesToScriptText(parsed) : raw);
                    } else {
                      setScriptText(raw);
                      setMode('script');
                    }
                    lastValidSelectionRef.current = { start: 0, end: 0 };
                    setSelection({ start: 0, end: 0 });
                    setShowMobileFiles(false);
                  }
                  e.target.value = '';
                }}
              />
            </label>

            {onImportWordJson && (
              <label className="flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
                <Braces className="w-4 h-4 text-[#34D399] shrink-0" />
                <span>JSON Word-Timing</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        setJsonError(null);
                        const raw = await f.text();
                        onImportWordJson(raw);
                        onClose();
                      } catch (err) {
                        setJsonError(
                          err instanceof Error ? err.message : 'Không thể đọc JSON word timestamps'
                        );
                      }
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            )}

            <label className="flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
              <Music className="w-4 h-4 text-[#38BDF8] shrink-0" />
              <span className="truncate">
                {audioName ? `Audio: ${audioName}` : 'Chọn Audio'}
              </span>
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    onUploadAudio(f);
                    setShowMobileFiles(false);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {jsonError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-400/25 rounded px-3 py-2 shrink-0">
              {jsonError}
            </p>
          )}

          {/* Cursor-aware Quick Emphasis, Word-Step & Split Action Bar */}
          <div className="p-1.5 sm:p-2.5 bg-[#0E1015] border border-white/10 rounded-md flex flex-wrap items-center justify-between gap-1.5 shrink-0">
            <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-wrap">
              {/* Word-by-word cursor control buttons (crucial on phone & great on PC) */}
              <div className="flex items-center bg-[#171A21] border border-white/10 rounded overflow-hidden shrink-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleStepWord(-1)}
                  title="Lùi con trỏ sang từ trước"
                  className="px-1.5 sm:px-2 py-1.5 text-[11px] font-medium text-[#D5D9E2] hover:bg-[#222733] hover:text-white flex items-center gap-0.5 cursor-pointer border-r border-white/8"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span className="hidden xs:inline">Từ</span>
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleStepWord(1)}
                  title="Tiến con trỏ sang từ tiếp theo"
                  className="px-1.5 sm:px-2 py-1.5 text-[11px] font-medium text-[#D5D9E2] hover:bg-[#222733] hover:text-white flex items-center gap-0.5 cursor-pointer"
                >
                  <span className="hidden xs:inline">Từ</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#38BDF8]" />
                </button>
              </div>

              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyToggleBracket()}
                className={`px-2 sm:px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  activeWordToken?.emphasized
                    ? 'bg-[#262B38] hover:bg-[#313849] text-[#FF8C66] border border-[#FF5A1F]/45'
                    : 'bg-[#FF5A1F] hover:bg-[#FF703B] text-white'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 shrink-0" />
                <span className="max-w-[125px] sm:max-w-[180px] truncate">{bracketButtonLabel}</span>
              </button>

              {mode === 'script' && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleInsertSplitNewline()}
                  title="Xuống dòng tách thành câu mới tại con trỏ (tự căn theo ranh giới từ)"
                  className="px-2 sm:px-2.5 py-1.5 rounded text-xs font-medium bg-[#171A21] hover:bg-[#222733] border border-[#34D399]/35 text-[#E2E5EC] flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <CornerDownLeft className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
                  <span className="max-w-[130px] sm:max-w-none truncate">{splitButtonLabel}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {mode === 'script' && (
                <span className="sm:hidden text-[10.5px] font-mono-tabular text-[#34D399] whitespace-nowrap">
                  {calibratedCues.length} câu · {formatTimecodeShort(audioDurationSec)}
                </span>
              )}
              <button
                type="button"
                onClick={handleDownloadSrt}
                title="Xuất tải .SRT"
                className="p-1.5 sm:p-0 text-xs text-[#38BDF8] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Xuất tải .SRT</span>
              </button>
            </div>
          </div>

          {/* Editor Area */}
          {mode === 'script' ? (
            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <div className="hidden sm:flex items-center justify-between text-[11px] text-[#9BA3B4] flex-wrap gap-2 shrink-0">
                <span>
                  Mỗi dòng (<strong>Enter</strong>) là 1 câu. Dùng <strong className="text-[#38BDF8]">◀ Từ / Từ ▶</strong> hoặc chạm dãy từ bên dưới để chọn chỗ ngắt chính xác.
                </span>
                <span className="font-mono-tabular text-[#34D399]">
                  {calibratedCues.length} câu · Audio {formatTimecodeShort(audioDurationSec)}
                  {avgCueDuration > 0 ? ` (~${avgCueDuration.toFixed(1)}s/câu)` : ''}
                </span>
              </div>

              <textarea
                ref={scriptTextareaRef}
                rows={7}
                value={scriptText}
                onChange={(e) => {
                  const el = e.currentTarget;
                  lastValidSelectionRef.current = {
                    start: el.selectionStart ?? 0,
                    end: el.selectionEnd ?? 0,
                  };
                  setScriptText(el.value);
                  syncSelectionFromEl(el);
                }}
                onSelect={(e) => syncSelectionFromEl(e.currentTarget)}
                onClick={(e) => syncSelectionFromEl(e.currentTarget)}
                onKeyUp={(e) => syncSelectionFromEl(e.currentTarget)}
                onMouseUp={(e) => syncSelectionFromEl(e.currentTarget)}
                onTouchEnd={(e) => {
                  const el = e.currentTarget;
                  syncSelectionFromEl(el);
                  window.requestAnimationFrame(() => syncSelectionFromEl(el));
                }}
                onKeyDown={(e) => {
                  if (
                    (e.ctrlKey || e.metaKey) &&
                    (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'b')
                  ) {
                    e.preventDefault();
                    applyToggleBracket(
                      e.currentTarget.selectionStart ?? lastValidSelectionRef.current.start,
                      e.currentTarget.selectionEnd ?? lastValidSelectionRef.current.end
                    );
                  }
                }}
                className="w-full flex-1 min-h-[135px] sm:min-h-[205px] bg-[#0D0F14] border border-white/12 focus:border-[#FF5A1F] rounded-md p-2.5 sm:p-3 text-base sm:text-sm text-[#F4F5F7] focus:outline-none leading-6 sm:leading-7 resize-none sm:resize-y"
                placeholder={`Gõ hoặc dán lời thoại tại đây...\nMỗi dòng (Enter) là 1 câu phụ đề\nChạm vào từ bất kỳ rồi bấm "Bọc [từ]" hoặc "Tách câu"`}
              />

              {/* Interactive Word & Split Strip for Line Under Cursor */}
              {cursorLineInfo.tokens.length > 0 && (
                <div className="p-2 bg-[#0E1015] border border-white/10 rounded-md space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between gap-2 text-[10.5px] text-[#8E95A5] flex-wrap">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="shrink-0">
                        Dòng <strong className="text-[#D5D9E2]">#{cursorLineInfo.lineIndex + 1}</strong>
                      </span>
                      {splitPreview?.canSplitSentence ? (
                        <span className="text-[#34D399] truncate">
                          · Điểm ngắt: «{splitPreview.beforeWord}» ✂ «{splitPreview.afterWord}»
                        </span>
                      ) : (
                        <span className="text-[#8E95A5] truncate">
                          {cursorLineInfo.tokens.length >= 2
                            ? chipMode === 'split'
                              ? '· Chạm nút ✂ để tách câu ngay'
                              : '· Chạm từ để nhảy con trỏ / bọc [ ]'
                            : '· Dòng chỉ có 1 từ'}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {activeCalibratedCueIdx >= 0 && calibratedCues[activeCalibratedCueIdx] && (
                        <span className="font-mono-tabular text-[#38BDF8]">
                          {formatTimecodeShort(calibratedCues[activeCalibratedCueIdx].startSec)} →{' '}
                          {formatTimecodeShort(calibratedCues[activeCalibratedCueIdx].endSec)}
                        </span>
                      )}

                      {cursorLineInfo.tokens.length >= 2 && (
                        <div className="flex items-center bg-[#171A21] border border-white/10 rounded overflow-hidden">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setChipMode('bracket')}
                            className={`px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                              chipMode === 'bracket'
                                ? 'bg-[#FF5A1F] text-white'
                                : 'text-[#9BA3B4] hover:text-white'
                            }`}
                          >
                            Bọc [ ]
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setChipMode('split')}
                            className={`px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors flex items-center gap-0.5 ${
                              chipMode === 'split'
                                ? 'bg-[#34D399] text-[#0B0C0F] font-semibold'
                                : 'text-[#9BA3B4] hover:text-white'
                            }`}
                          >
                            <Scissors className="w-2.5 h-2.5" />
                            <span>Tách câu</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-nowrap sm:flex-wrap items-center overflow-x-auto sm:overflow-visible gap-1.5 pb-0.5">
                    {cursorLineInfo.tokens.map((tok, idx) => {
                      const isCursorHere = idx === cursorLineInfo.activeTokenIdx;
                      const showSplitAfter =
                        chipMode === 'split' && idx < cursorLineInfo.tokens.length - 1;
                      const isActiveSplitBoundary =
                        splitPreview?.canSplitSentence && splitPreview.splitPos === tok.absEnd;

                      return (
                        <React.Fragment key={`${tok.absStart}-${idx}`}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              if (chipMode === 'bracket') {
                                applyToggleBracket(tok.absStart, tok.absEnd);
                              } else {
                                // In split mode, tapping a word places caret cleanly right after it
                                applyCursorMove(tok.absEnd);
                              }
                            }}
                            className={`px-2.5 py-1 sm:py-0.5 text-xs rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[30px] sm:min-h-0 ${
                              tok.emphasized
                                ? 'bg-[#FF5A1F]/20 border-[#FF5A1F] text-[#FF9B76] font-semibold'
                                : isCursorHere
                                ? 'bg-[#1F2430] border-[#38BDF8]/70 text-white'
                                : 'bg-[#171A21] border-white/10 text-[#D5D9E2] hover:border-white/30'
                            }`}
                          >
                            {tok.emphasized ? `[${tok.word}]` : tok.word}
                          </button>

                          {showSplitAfter && (
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleInsertSplitNewline(tok.absEnd, tok.absEnd)}
                              title={`Tách câu ngay sau "${tok.word}"`}
                              className={`px-1.5 py-1 sm:py-0.5 rounded border text-[11px] flex items-center justify-center cursor-pointer shrink-0 min-h-[30px] sm:min-h-0 transition-colors ${
                                isActiveSplitBoundary
                                  ? 'bg-[#34D399] border-[#34D399] text-[#0B0C0F] font-bold shadow-sm'
                                  : 'bg-[#16221E] border-[#34D399]/40 text-[#34D399] hover:bg-[#34D399] hover:text-[#0B0C0F]'
                              }`}
                            >
                              <Scissors className="w-3 h-3" />
                            </button>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 flex-1 min-h-0">
              <div className="text-[11px] sm:text-xs text-[#9BA3B4] shrink-0">
                Bọc từ trong ngoặc vuông <code className="text-[#FF5A1F]">[nhấn mạnh]</code> hoặc dùng <strong className="text-[#38BDF8]">◀ Từ / Từ ▶</strong> rồi bấm Bọc [từ].
              </div>
              <textarea
                ref={srtTextareaRef}
                rows={9}
                value={srtText}
                onChange={(e) => {
                  const el = e.currentTarget;
                  lastValidSelectionRef.current = {
                    start: el.selectionStart ?? 0,
                    end: el.selectionEnd ?? 0,
                  };
                  setSrtText(el.value);
                  syncSelectionFromEl(el);
                }}
                onSelect={(e) => syncSelectionFromEl(e.currentTarget)}
                onClick={(e) => syncSelectionFromEl(e.currentTarget)}
                onKeyUp={(e) => syncSelectionFromEl(e.currentTarget)}
                onMouseUp={(e) => syncSelectionFromEl(e.currentTarget)}
                onTouchEnd={(e) => {
                  const el = e.currentTarget;
                  syncSelectionFromEl(el);
                  window.requestAnimationFrame(() => syncSelectionFromEl(el));
                }}
                onKeyDown={(e) => {
                  if (
                    (e.ctrlKey || e.metaKey) &&
                    (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'b')
                  ) {
                    e.preventDefault();
                    applyToggleBracket(
                      e.currentTarget.selectionStart ?? lastValidSelectionRef.current.start,
                      e.currentTarget.selectionEnd ?? lastValidSelectionRef.current.end
                    );
                  }
                }}
                className="w-full flex-1 min-h-[160px] sm:min-h-[220px] bg-[#0D0F14] border border-white/12 focus:border-[#38BDF8] rounded-md p-2.5 sm:p-3 text-sm sm:text-xs font-mono-tabular text-[#E2E5EC] focus:outline-none leading-relaxed resize-none sm:resize-y"
                placeholder={`1\n00:00:00,500 --> 00:00:03,000\nNhập nội dung [SRT] tại đây`}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-t border-white/8 flex items-center justify-between gap-2 bg-[#111318] shrink-0">
          <div className="hidden sm:flex text-[11px] text-[#8E95A5] items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
            <span>
              {mode === 'script'
                ? 'Tự động chia thời lượng theo độ dài câu & nhịp âm thanh'
                : 'Giữ nguyên mã thời gian SRT bạn đã nhập'}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-[#A1A8B8] hover:text-white rounded-md cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={mode === 'script' ? calibratedCues.length === 0 : !srtText.trim()}
              onClick={() => {
                if (mode === 'script') {
                  if (calibratedCues.length > 0) {
                    onImportCues(calibratedCues);
                    onClose();
                  }
                } else {
                  onImportSrtText(srtText);
                  onClose();
                }
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-[#FF5A1F] hover:bg-[#E84D14] disabled:opacity-40 text-white text-xs font-semibold rounded-md cursor-pointer disabled:cursor-not-allowed text-center"
            >
              {mode === 'script'
                ? 'Cân Audio & Lưu vào Dự án'
                : 'Áp dụng SRT vào Timeline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
