import React, { useMemo, useRef, useState } from 'react';
import {
  AlignLeft,
  Braces,
  Code2,
  Download,
  FileText,
  Highlighter,
  Music,
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
  toggleBracketAtCursor,
} from '../utils/srtParser';

type EditorMode = 'script' | 'srt';

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
  const [scriptText, setScriptText] = useState(() => cuesToScriptText(cues));
  const [srtText, setSrtText] = useState(() => exportSrt(cues, true));
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [jsonError, setJsonError] = useState<string | null>(null);

  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const srtTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeText = mode === 'script' ? scriptText : srtText;
  const cursorLineInfo = useMemo(
    () => getCursorLineInfo(activeText, selection.start),
    [activeText, selection.start]
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

  if (!isOpen) return null;

  const syncSelectionFromEl = (el: HTMLTextAreaElement) => {
    setSelection({
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? 0,
    });
  };

  const applyToggleBracket = (customStart?: number, customEnd?: number) => {
    const isScript = mode === 'script';
    const currentText = isScript ? scriptText : srtText;
    const refEl = isScript ? scriptTextareaRef.current : srtTextareaRef.current;

    const s = customStart !== undefined ? customStart : refEl?.selectionStart ?? selection.start;
    const e = customEnd !== undefined ? customEnd : refEl?.selectionEnd ?? selection.end;

    const res = toggleBracketAtCursor(currentText, s, e);
    if (res.action === 'none') return;

    if (isScript) {
      setScriptText(res.nextText);
    } else {
      setSrtText(res.nextText);
    }
    setSelection({ start: res.nextSelStart, end: res.nextSelEnd });

    window.requestAnimationFrame(() => {
      const target = isScript ? scriptTextareaRef.current : srtTextareaRef.current;
      if (target) {
        target.focus();
        target.setSelectionRange(res.nextSelStart, res.nextSelEnd);
      }
    });
  };

  const handleSwitchMode = (nextMode: EditorMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'srt') {
      // Sync calibrated cues (preserving [brackets]) into full SRT preview
      if (calibratedCues.length > 0) {
        setSrtText(exportSrt(calibratedCues, true));
      }
    } else {
      // Convert edited SRT back into plain script lines
      const parsed = parseSrt(srtText, emphasisTemplate);
      if (parsed.length > 0) {
        setScriptText(cuesToScriptText(parsed));
      }
    }
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
    ? 'Bọc / Bỏ [cụm đã bôi]'
    : activeWordToken
    ? activeWordToken.emphasized
      ? `Bỏ [${activeWordToken.word}]`
      : `Bọc [${activeWordToken.word}]`
    : 'Nhấn [từ] tại con trỏ';

  const avgCueDuration =
    calibratedCues.length > 0
      ? audioDurationSec / calibratedCues.length
      : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl bg-[#14171F] border border-white/12 rounded-lg overflow-hidden shadow-2xl flex flex-col max-h-[92dvh]">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/8 flex items-center justify-between shrink-0">
          <h3 className="font-display text-sm font-semibold text-[#F4F5F7]">
            Soạn thảo nội dung &amp; Nhận dạng SRT trực tiếp
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8E95A5] hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-4 sm:px-5 pt-3 pb-0 border-b border-white/8 bg-[#10131A] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchMode('script')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'script'
                ? 'border-[#FF5A1F] text-white'
                : 'border-transparent text-[#8E95A5] hover:text-white'
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5 text-[#FF5A1F]" />
            <span>Soạn nội dung nhanh (1 dòng = 1 câu)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('srt')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'srt'
                ? 'border-[#38BDF8] text-white'
                : 'border-transparent text-[#8E95A5] hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Mã nguồn .SRT đầy đủ</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto min-h-0 flex-1">
          {/* File Pickers Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
              <FileText className="w-4 h-4 text-[#FF5A1F]" />
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
                  }
                  e.target.value = '';
                }}
              />
            </label>

            {onImportWordJson && (
              <label className="flex items-center justify-center gap-2 py-2 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
                <Braces className="w-4 h-4 text-[#34D399]" />
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
              <Music className="w-4 h-4 text-[#38BDF8]" />
              <span className="truncate">
                {audioName ? `Audio: ${audioName}` : 'Chọn Audio'}
              </span>
              <input
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadAudio(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          {jsonError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-400/25 rounded px-3 py-2">
              {jsonError}
            </p>
          )}

          {/* Cursor-aware Quick Emphasis Action Bar */}
          <div className="p-2.5 bg-[#0E1015] border border-white/10 rounded-md flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyToggleBracket()}
                className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                  activeWordToken?.emphasized
                    ? 'bg-[#262B38] hover:bg-[#313849] text-[#FF8C66] border border-[#FF5A1F]/45'
                    : 'bg-[#FF5A1F] hover:bg-[#FF703B] text-white'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5 shrink-0" />
                <span>{bracketButtonLabel}</span>
              </button>
              <span className="text-[11px] text-[#8E95A5]">
                Phím tắt: <kbd className="px-1.5 py-0.5 bg-[#171A21] border border-white/10 rounded text-[10px] text-[#D5D9E2]">Ctrl+E</kbd>
              </span>
            </div>

            <button
              type="button"
              onClick={handleDownloadSrt}
              className="text-xs text-[#38BDF8] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất tải .SRT</span>
            </button>
          </div>

          {/* Editor Area */}
          {mode === 'script' ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-[#9BA3B4] flex-wrap gap-2">
                <span>
                  Chỉ hiển thị nội dung chữ — mỗi lần bấm <strong>Enter</strong> xuống dòng sẽ tách thành 1 câu riêng.
                </span>
                <span className="font-mono-tabular text-[#34D399]">
                  {calibratedCues.length} câu · Audio {formatTimecodeShort(audioDurationSec)}
                  {avgCueDuration > 0 ? ` (~${avgCueDuration.toFixed(1)}s/câu)` : ''}
                </span>
              </div>

              <textarea
                ref={scriptTextareaRef}
                rows={9}
                value={scriptText}
                onChange={(e) => {
                  setScriptText(e.target.value);
                  syncSelectionFromEl(e.currentTarget);
                }}
                onSelect={(e) => syncSelectionFromEl(e.currentTarget)}
                onClick={(e) => syncSelectionFromEl(e.currentTarget)}
                onKeyUp={(e) => syncSelectionFromEl(e.currentTarget)}
                onKeyDown={(e) => {
                  if (
                    (e.ctrlKey || e.metaKey) &&
                    (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'b')
                  ) {
                    e.preventDefault();
                    applyToggleBracket(
                      e.currentTarget.selectionStart ?? 0,
                      e.currentTarget.selectionEnd ?? 0
                    );
                  }
                }}
                className="w-full bg-[#0D0F14] border border-white/12 focus:border-[#FF5A1F] rounded-md p-3 text-sm text-[#F4F5F7] focus:outline-none leading-7 resize-y"
                placeholder={`Gõ hoặc dán lời thoại tại đây...\nMỗi dòng (Enter) là 1 câu phụ đề\nĐặt con trỏ vào từ bất kỳ rồi bấm "Bọc [từ]" để nhấn mạnh`}
              />

              {/* Interactive Word Chips for the Line Under Cursor */}
              {cursorLineInfo.tokens.length > 0 && (
                <div className="p-2.5 bg-[#0E1015] border border-white/8 rounded-md space-y-1.5">
                  <div className="flex items-center justify-between text-[10.5px] text-[#8E95A5]">
                    <span>
                      Chọn nhanh từ trên <strong className="text-[#D5D9E2]">Dòng #{cursorLineInfo.lineIndex + 1}</strong> để bọc <code className="text-[#FF5A1F]">[ ]</code>:
                    </span>
                    {calibratedCues[cursorLineInfo.lineIndex] && (
                      <span className="font-mono-tabular text-[#38BDF8]">
                        Dự kiến: {formatTimecodeShort(calibratedCues[cursorLineInfo.lineIndex].startSec)} →{' '}
                        {formatTimecodeShort(calibratedCues[cursorLineInfo.lineIndex].endSec)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cursorLineInfo.tokens.map((tok, idx) => {
                      const isCursorHere = idx === cursorLineInfo.activeTokenIdx;
                      return (
                        <button
                          key={`${tok.absStart}-${idx}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyToggleBracket(tok.absStart, tok.absEnd)}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors cursor-pointer ${
                            tok.emphasized
                              ? 'bg-[#FF5A1F]/20 border-[#FF5A1F] text-[#FF9B76] font-semibold'
                              : isCursorHere
                              ? 'bg-[#1F2430] border-white/35 text-white'
                              : 'bg-[#171A21] border-white/10 text-[#D5D9E2] hover:border-white/30'
                          }`}
                        >
                          {tok.emphasized ? `[${tok.word}]` : tok.word}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-xs text-[#9BA3B4]">
                Mẹo: Bọc từ trong ngoặc vuông <code className="text-[#FF5A1F]">[nhấn mạnh]</code> hoặc đặt con trỏ rồi bấm nút Bọc bên trên.
              </div>
              <textarea
                ref={srtTextareaRef}
                rows={10}
                value={srtText}
                onChange={(e) => {
                  setSrtText(e.target.value);
                  syncSelectionFromEl(e.currentTarget);
                }}
                onSelect={(e) => syncSelectionFromEl(e.currentTarget)}
                onClick={(e) => syncSelectionFromEl(e.currentTarget)}
                onKeyUp={(e) => syncSelectionFromEl(e.currentTarget)}
                onKeyDown={(e) => {
                  if (
                    (e.ctrlKey || e.metaKey) &&
                    (e.key.toLowerCase() === 'e' || e.key.toLowerCase() === 'b')
                  ) {
                    e.preventDefault();
                    applyToggleBracket(
                      e.currentTarget.selectionStart ?? 0,
                      e.currentTarget.selectionEnd ?? 0
                    );
                  }
                }}
                className="w-full bg-[#0D0F14] border border-white/12 focus:border-[#38BDF8] rounded-md p-3 text-xs font-mono-tabular text-[#E2E5EC] focus:outline-none leading-relaxed resize-y"
                placeholder={`1\n00:00:00,500 --> 00:00:03,000\nNhập nội dung [SRT] tại đây`}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-white/8 flex flex-wrap items-center justify-between gap-2 bg-[#111318] shrink-0">
          <div className="text-[11px] text-[#8E95A5] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#34D399] shrink-0" />
            <span>
              {mode === 'script'
                ? 'Tự động chia thời lượng theo độ dài câu & nhịp âm thanh'
                : 'Giữ nguyên mã thời gian SRT bạn đã nhập'}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
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
              className="px-4 py-2 bg-[#FF5A1F] hover:bg-[#E84D14] disabled:opacity-40 text-white text-xs font-semibold rounded-md cursor-pointer disabled:cursor-not-allowed"
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
