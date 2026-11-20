import React, { useMemo, useState } from 'react';
import {
  Combine,
  Download,
  FileText,
  Highlighter,
  Music,
  Plus,
  Scissors,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { SubtitleCue } from '../types/studio';
import { formatTimecodeShort, tokenizeCueText } from '../utils/srtParser';

interface CueListPanelProps {
  cues: SubtitleCue[];
  selectedCueId: string | null;
  currentTimeSec: number;
  audioName: string | null;
  audioDurationSec: number;
  emphasisDefaultColor: string;
  onSelectCue: (cueId: string, seek?: boolean) => void;
  onQuickToggleWord?: (cueId: string, wordIdx: number) => void;
  onAddCue: () => void;
  onDeleteCue: (cueId: string) => void;
  onSplitCue?: (cueId: string) => void;
  onMergeNextCue?: (cueId: string) => void;
  onExportSrt?: () => void;
  onOpenImport: () => void;
  onQuickUploadSrt: (file: File) => void;
  onQuickUploadAudio: (file: File) => void;
  className?: string;
}

export const CueListPanel: React.FC<CueListPanelProps> = ({
  cues,
  selectedCueId,
  currentTimeSec,
  audioName,
  audioDurationSec,
  emphasisDefaultColor,
  onSelectCue,
  onQuickToggleWord,
  onAddCue,
  onDeleteCue,
  onSplitCue,
  onMergeNextCue,
  onExportSrt,
  onOpenImport,
  onQuickUploadSrt,
  onQuickUploadAudio,
  className = '',
}) => {
  const [query, setQuery] = useState('');
  const [quickEmphasizeMode, setQuickEmphasizeMode] = useState(true);

  const filteredCues = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cues;
    return cues.filter((c) => c.text.toLowerCase().includes(q));
  }, [cues, query]);

  return (
    <aside
      className={`w-full lg:w-80 bg-[#111318] lg:border-r border-white/8 flex flex-col shrink-0 min-h-0 ${className}`}
    >
      {/* Media Sources Strip */}
      <div className="p-3.5 border-b border-white/8 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold text-[#E2E5EC]">Nguồn dữ liệu</h2>
          <div className="flex items-center gap-2.5">
            {onExportSrt && cues.length > 0 && (
              <button
                type="button"
                onClick={onExportSrt}
                title="Tải xuống file phụ đề .SRT hiện tại"
                className="text-[11px] font-medium text-[#38BDF8] hover:text-[#7DD3FC] transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Xuất .SRT</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenImport}
              className="px-2 py-0.5 rounded bg-[#FF5A1F]/15 hover:bg-[#FF5A1F]/25 border border-[#FF5A1F]/40 text-xs font-semibold text-[#FF7A48] hover:text-[#FF9670] transition-colors cursor-pointer whitespace-nowrap"
            >
              Soạn nhanh / SRT
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 px-2.5 py-2 bg-[#171A21] hover:bg-[#1D212B] border border-white/8 rounded-md cursor-pointer transition-colors min-w-0">
            <FileText className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0" />
            <span className="text-xs text-[#D5D9E2] truncate">Tải file .SRT</span>
            <input
              type="file"
              accept=".srt,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onQuickUploadSrt(file);
                e.target.value = '';
              }}
            />
          </label>

          <label className="flex items-center gap-2 px-2.5 py-2 bg-[#171A21] hover:bg-[#1D212B] border border-white/8 rounded-md cursor-pointer transition-colors min-w-0">
            <Music className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
            <span className="text-xs text-[#D5D9E2] truncate">Tải Audio</span>
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onQuickUploadAudio(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#8E95A5] pt-0.5">
          <span className="truncate max-w-[180px]" title={audioName || 'Nhạc mẫu tổng hợp'}>
            {audioName || 'Audio mẫu (112 BPM)'}
          </span>
          <span className="font-mono-tabular shrink-0">
            {cues.length} câu · {formatTimecodeShort(audioDurationSec)}
          </span>
        </div>
      </div>

      {/* Search & Add Header */}
      <div className="px-3.5 py-2.5 border-b border-white/8 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[#6F7685] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm lời phụ đề..."
              className="w-full bg-[#171A21] text-xs text-[#F4F5F7] placeholder:text-[#6F7685] pl-8 pr-2.5 py-1.5 rounded-md border border-white/8 focus:outline-none focus:border-[#FF5A1F]"
            />
          </div>
          <button
            type="button"
            onClick={onAddCue}
            title="Thêm câu mới"
            className="px-2.5 py-1.5 bg-[#171A21] hover:bg-[#20242E] border border-white/10 text-xs font-medium text-[#E2E5EC] rounded-md flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm</span>
          </button>
        </div>

        {onQuickToggleWord && (
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <span className="text-[#8E95A5] truncate">
              {quickEmphasizeMode
                ? 'Chạm thẳng vào từ bất kỳ để nhấn nhanh'
                : 'Chạm câu để mở trình sửa chi tiết'}
            </span>
            <button
              type="button"
              onClick={() => setQuickEmphasizeMode((v) => !v)}
              className={`px-2 py-0.5 rounded border flex items-center gap-1 font-medium cursor-pointer shrink-0 transition-colors ${
                quickEmphasizeMode
                  ? 'bg-[#FF5A1F]/16 border-[#FF5A1F]/45 text-[#FF8C66]'
                  : 'bg-[#171A21] border-white/10 text-[#9BA3B4] hover:text-white'
              }`}
            >
              <Highlighter className="w-3 h-3" />
              <span>{quickEmphasizeMode ? 'Nhấn nhanh: BẬT' : 'Nhấn nhanh: TẮT'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Cue List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/6 min-h-0">
        {filteredCues.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <Upload className="w-6 h-6 text-[#5B6270] mx-auto" />
            <p className="text-xs text-[#8E95A5]">
              {cues.length === 0
                ? 'Chưa có câu phụ đề nào. Hãy tải file .srt hoặc dán nội dung.'
                : 'Không tìm thấy câu phụ đề phù hợp.'}
            </p>
          </div>
        ) : (
          filteredCues.map((cue) => {
            const realIndex = cues.findIndex((c) => c.id === cue.id);
            const isSelected = cue.id === selectedCueId;
            const isActiveAtPlayhead =
              currentTimeSec >= cue.startSec && currentTimeSec <= cue.endSec;
            const canSplit = cue.endSec - cue.startSec >= 0.35;
            const hasNext = realIndex >= 0 && realIndex < cues.length - 1;
            const hasWordTimings = Boolean(cue.wordTimings && cue.wordTimings.length > 0);
            const { lines } = tokenizeCueText(cue.text);

            return (
              <div
                key={cue.id}
                onClick={() => onSelectCue(cue.id, true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCue(cue.id, true);
                  }
                }}
                className={`group px-3.5 py-3 transition-colors cursor-pointer focus:outline-none ${
                  isSelected
                    ? 'bg-[#1B1F29]'
                    : isActiveAtPlayhead
                    ? 'bg-[#161922]'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <div className="flex items-center gap-1.5 font-mono-tabular min-w-0">
                    <span
                      className={`font-semibold ${
                        isSelected
                          ? 'text-[#FF5A1F]'
                          : isActiveAtPlayhead
                          ? 'text-[#38BDF8]'
                          : 'text-[#7C8496]'
                      }`}
                    >
                      #{String((realIndex >= 0 ? realIndex : 0) + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[#5B6270]">·</span>
                    <span className="text-[#9BA3B4] truncate">
                      {formatTimecodeShort(cue.startSec)} → {formatTimecodeShort(cue.endSec)}
                    </span>
                    {hasWordTimings && (
                      <span
                        title="Có timing chi tiết từng từ"
                        className="px-1 py-px text-[9px] font-semibold bg-[#34D399]/15 text-[#34D399] border border-[#34D399]/30 rounded"
                      >
                        WT
                      </span>
                    )}
                  </div>

                  <div
                    className={`flex items-center gap-0.5 transition-opacity shrink-0 ${
                      isSelected ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCue(cue.id, true);
                      }}
                      title="Mở bảng sửa chi tiết câu & màu nhấn"
                      className="px-1.5 py-0.5 text-[10px] text-[#D5D9E2] hover:text-white bg-white/5 hover:bg-white/10 rounded flex items-center gap-1 cursor-pointer mr-0.5"
                    >
                      <SlidersHorizontal className="w-3 h-3 text-[#FF5A1F]" />
                      <span>Sửa</span>
                    </button>
                    {onSplitCue && canSplit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSplitCue(cue.id);
                        }}
                        title="Tách câu tại kim phát / chia đôi"
                        className="p-1 text-[#7C8496] hover:text-[#FF5A1F] cursor-pointer"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {onMergeNextCue && hasNext && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMergeNextCue(cue.id);
                        }}
                        title="Gộp với câu tiếp theo"
                        className="p-1 text-[#7C8496] hover:text-[#38BDF8] cursor-pointer"
                      >
                        <Combine className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteCue(cue.id);
                      }}
                      title="Xóa câu"
                      className="p-1 text-[#7C8496] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-xs leading-relaxed text-[#E7E9EE] space-y-1">
                  {lines.map((line, lIdx) => (
                    <div key={lIdx} className="flex flex-wrap gap-x-1 gap-y-1">
                      {line.length === 0 ? (
                        <span className="text-[#5B6270] italic">(dòng trống)</span>
                      ) : (
                        line.map((tok) => {
                          const ws = cue.wordStyles[tok.wordIndex];
                          const isEmph = Boolean(ws?.emphasized);
                          const emphColor = ws?.color || emphasisDefaultColor;

                          if (quickEmphasizeMode && onQuickToggleWord) {
                            return (
                              <button
                                key={tok.wordIndex}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onQuickToggleWord(cue.id, tok.wordIndex);
                                }}
                                style={
                                  isEmph
                                    ? {
                                        color: emphColor,
                                        borderColor: `${emphColor}66`,
                                        backgroundColor: `${emphColor}18`,
                                      }
                                    : undefined
                                }
                                className={`px-1.5 py-0.5 rounded border text-xs transition-colors cursor-pointer ${
                                  isEmph
                                    ? 'font-bold'
                                    : 'border-transparent hover:border-white/20 hover:bg-white/6 text-[#E7E9EE]'
                                }`}
                              >
                                {tok.word}
                              </button>
                            );
                          }

                          return (
                            <span
                              key={tok.wordIndex}
                              style={
                                isEmph
                                  ? {
                                      color: emphColor,
                                      fontWeight: 700,
                                    }
                                  : undefined
                              }
                            >
                              {tok.word}
                            </span>
                          );
                        })
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
