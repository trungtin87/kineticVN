import React, { useState } from 'react';
import { Download, FileText, Music, X } from 'lucide-react';
import { exportSrt } from '../utils/srtParser';
import { SubtitleCue } from '../types/studio';

interface ImportSrtModalProps {
  isOpen: boolean;
  cues: SubtitleCue[];
  onClose: () => void;
  onImportSrtText: (srtText: string) => void;
  onUploadAudio: (file: File) => void;
}

export const ImportSrtModal: React.FC<ImportSrtModalProps> = ({
  isOpen,
  cues,
  onClose,
  onImportSrtText,
  onUploadAudio,
}) => {
  const [text, setText] = useState(() => exportSrt(cues));

  if (!isOpen) return null;

  const handleDownloadSrt = () => {
    const content = exportSrt(cues);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'subtitles_edited.srt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#14171F] border border-white/12 rounded-lg overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-[#F4F5F7]">
            Nhập / Chỉnh sửa mã nguồn SRT &amp; Audio
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8E95A5] hover:text-white rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
              <FileText className="w-4 h-4 text-[#FF5A1F]" />
              <span>Chọn file .SRT từ máy</span>
              <input
                type="file"
                accept=".srt,.txt"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const raw = await f.text();
                    setText(raw);
                  }
                  e.target.value = '';
                }}
              />
            </label>

            <label className="flex items-center justify-center gap-2 py-2.5 px-3 bg-[#1A1E28] hover:bg-[#222735] border border-white/10 rounded-md cursor-pointer text-xs font-medium text-[#E2E5EC]">
              <Music className="w-4 h-4 text-[#38BDF8]" />
              <span>Chọn file Audio (.mp3, .wav, .m4a)</span>
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#9BA3B4]">
              <span>
                Mẹo: Bọc từ trong dấu ngoặc vuông <code className="text-[#FF5A1F]">[nhấn mạnh]</code>{' '}
                để tự động tô màu nhấn khi nhập.
              </span>
              <button
                type="button"
                onClick={handleDownloadSrt}
                className="text-[#38BDF8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải về .SRT đã sửa</span>
              </button>
            </div>
            <textarea
              rows={11}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-[#0D0F14] border border-white/10 focus:border-[#FF5A1F] rounded-md p-3 text-xs font-mono-tabular text-[#E2E5EC] focus:outline-none leading-relaxed"
              placeholder={`1\n00:00:00,500 --> 00:00:03,000\nNhập nội dung [SRT] tại đây`}
            />
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-white/8 flex items-center justify-end gap-2.5 bg-[#111318]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#A1A8B8] hover:text-white rounded-md cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => {
              onImportSrtText(text);
              onClose();
            }}
            className="px-4 py-2 bg-[#FF5A1F] hover:bg-[#E84D14] text-white text-xs font-semibold rounded-md cursor-pointer"
          >
            Áp dụng SRT vào Timeline
          </button>
        </div>
      </div>
    </div>
  );
};
