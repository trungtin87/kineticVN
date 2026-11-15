import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, ExternalLink, Film, Layers, Loader2, X } from 'lucide-react';
import {
  ASPECT_RATIOS,
  ExportFormat,
  ExportResolution,
  StudioProject,
} from '../types/studio';
import { renderKineticScene } from '../engine/kineticRenderer';
import { exportWithBrowserWasm } from '../engine/clientWasmExport';
import { exportMp4WithWebCodecs } from '../engine/webCodecsMp4Export';
import { sampleAudioEnergy } from '../utils/audioEnvelope';

interface ExportModalProps {
  isOpen: boolean;
  project: StudioProject;
  audioFile: Blob | null;
  bgVideoFile: File | null;
  bgAudioFile?: File | null;
  totalDurationSec: number;
  audioEnvelope: Float32Array | null;
  onClose: () => void;
}

function getExportDimensions(
  aspectRatio: StudioProject['aspectRatio'],
  res: ExportResolution
): { width: number; height: number } {
  const base = ASPECT_RATIOS[aspectRatio];
  const scale = res === '720p' ? 2 / 3 : res === '4k' ? 2 : 1;
  // Ensure even dimensions for H.264 / yuv420p
  const width = Math.round((base.width * scale) / 2) * 2;
  const height = Math.round((base.height * scale) / 2) * 2;
  return { width, height };
}

const INLINE_ASSET_LIMIT_BYTES = 8 * 1024 * 1024;
const ASSET_CHUNK_BYTES = 4 * 1024 * 1024;
const DOWNLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_FRAME_BATCH_BYTES = 4 * 1024 * 1024;

function getAudioFilename(blob: Blob): string {
  const maybeFile = blob as File;
  if (typeof maybeFile.name === 'string' && maybeFile.name.trim()) {
    return maybeFile.name;
  }
  const mime = blob.type.toLowerCase();
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'audio.mp3';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'audio.m4a';
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('flac')) return 'audio.flac';
  return 'audio.wav';
}

function canvasToFrameBuffer(
  canvas: HTMLCanvasElement,
  frameFormat: 'png' | 'jpg'
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const mime = frameFormat === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = frameFormat === 'jpg' ? 0.95 : undefined;
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Không thể mã hóa khung hình từ Canvas'));
          return;
        }
        const arr = await blob.arrayBuffer();
        resolve(new Uint8Array(arr));
      },
      mime,
      quality
    );
  });
}

function packFrameBatch(frames: { index: number; data: Uint8Array }[]): Uint8Array {
  let totalBytes = 0;
  for (const f of frames) totalBytes += 8 + f.data.byteLength;
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const f of frames) {
    view.setUint32(offset, f.index, true);
    view.setUint32(offset + 4, f.data.byteLength, true);
    out.set(f.data, offset + 8);
    offset += 8 + f.data.byteLength;
  }
  return out;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  project,
  audioFile,
  bgVideoFile,
  bgAudioFile = null,
  totalDurationSec,
  audioEnvelope,
  onClose,
}) => {
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [resolution, setResolution] = useState<ExportResolution>('1080p');
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [includeBackground, setIncludeBackground] = useState(
    project.background.mode !== 'transparent'
  );
  const [rangeMode, setRangeMode] = useState<'full' | 'cues'>('full');

  const [phase, setPhase] = useState<'idle' | 'rendering' | 'encoding' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<{
    jobId: string;
    url: string;
    filename: string;
    fileSize: number;
    mime: string;
  } | null>(null);
  const [cachedBlobUrl, setCachedBlobUrl] = useState<string | null>(null);
  const [isDownloadingFile, setIsDownloadingFile] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const [codecNote, setCodecNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (cachedBlobUrl) {
        URL.revokeObjectURL(cachedBlobUrl);
      }
    };
  }, [cachedBlobUrl]);

  if (!isOpen) return null;

  const { width, height } = getExportDimensions(project.aspectRatio, resolution);
  const lastCueEnd = project.cues.reduce((max, c) => Math.max(max, c.endSec), 2);
  const renderDuration =
    rangeMode === 'cues'
      ? Math.max(0.5, Math.min(totalDurationSec, lastCueEnd + 0.5))
      : Math.max(0.5, totalDurationSec);
  const totalFrames = Math.max(1, Math.ceil(renderDuration * fps));

  const isAlphaExport = format === 'prores4444' && !includeBackground;

  const handleFormatChange = (nextFmt: ExportFormat) => {
    setFormat(nextFmt);
    if (nextFmt === 'prores4444') {
      // ProRes 4444 defaults to transparent alpha channel for post-production
      setIncludeBackground(false);
    } else {
      setIncludeBackground(true);
    }
  };

  const uploadLargeAsset = async (
    jobId: string,
    field: 'audio' | 'bgVideo' | 'bgAudio',
    file: Blob,
    filename: string,
    humanLabel: string
  ) => {
    const totalChunks = Math.max(1, Math.ceil(file.size / ASSET_CHUNK_BYTES));
    for (let idx = 0; idx < totalChunks; idx++) {
      const start = idx * ASSET_CHUNK_BYTES;
      const end = Math.min(file.size, start + ASSET_CHUNK_BYTES);
      const slice = await file.slice(start, end).arrayBuffer();
      const res = await fetch(`/api/export/${jobId}/asset/${field}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-filename': encodeURIComponent(filename),
          'x-chunk-index': String(idx),
        },
        body: slice,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.error || `Không thể tải lên ${humanLabel} (HTTP ${res.status})`
        );
      }
      const pct = Math.round(((idx + 1) / totalChunks) * 100);
      setStatusLabel(`Đang tải lên ${humanLabel}... ${pct}%`);
    }
  };

  const triggerBlobSave = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 1000);
  };

  const handleDownloadResult = async () => {
    if (!downloadInfo || isDownloadingFile) return;

    if (cachedBlobUrl) {
      triggerBlobSave(cachedBlobUrl, downloadInfo.filename);
      return;
    }

    try {
      setIsDownloadingFile(true);
      setDownloadPct(0);
      setErrorMsg(null);

      let totalSize = downloadInfo.fileSize;
      let offset = 0;
      const chunks: BlobPart[] = [];

      while (true) {
        const res = await fetch(
          `/api/export/${downloadInfo.jobId}/chunk?offset=${offset}&length=${DOWNLOAD_CHUNK_BYTES}`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Không thể tải file video (HTTP ${res.status})`);
        }

        const headerSize = Number(res.headers.get('x-total-size'));
        if (Number.isFinite(headerSize) && headerSize > 0) {
          totalSize = headerSize;
        }

        const buf = await res.arrayBuffer();
        if (buf.byteLength === 0) break;

        chunks.push(buf);
        offset += buf.byteLength;

        if (totalSize > 0) {
          setDownloadPct(Math.min(100, Math.round((offset / totalSize) * 100)));
        }
        if (totalSize > 0 && offset >= totalSize) {
          break;
        }
      }

      const blob = new Blob(chunks, { type: downloadInfo.mime });
      const blobUrl = URL.createObjectURL(blob);
      setCachedBlobUrl(blobUrl);
      setDownloadPct(100);
      fetch(`/api/export/${downloadInfo.jobId}/downloaded`, { method: 'POST' }).catch(() => {});
      triggerBlobSave(blobUrl, downloadInfo.filename);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Không thể tải dữ liệu file video từ máy chủ.'
      );
    } finally {
      setIsDownloadingFile(false);
    }
  };

  const checkServerAvailable = async (): Promise<boolean> => {
    if (import.meta.env.VITE_STATIC_HOST === 'true') return false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  };

  const startExport = async () => {
    try {
      if (cachedBlobUrl) {
        URL.revokeObjectURL(cachedBlobUrl);
        setCachedBlobUrl(null);
      }
      setPhase('rendering');
      setProgress(0);
      setErrorMsg(null);
      setCodecNote(null);
      setDownloadInfo(null);
      setStatusLabel('Đang khởi tạo tiến trình render...');

      await document.fonts.ready;

      const serverReady = await checkServerAvailable();
      if (!serverReady) {
        if (format === 'mp4') {
          try {
            const wcResult = await exportMp4WithWebCodecs({
              project,
              width,
              height,
              fps,
              totalFrames,
              renderDuration,
              includeBackground,
              audioFile,
              bgVideoFile,
              bgAudioFile,
              audioEnvelope,
              onPhaseChange: (p) => setPhase(p),
              onProgress: (pct) => setProgress(pct),
              onStatus: (label) => setStatusLabel(label),
            });

            if (wcResult.supported) {
              const blobUrl = URL.createObjectURL(wcResult.blob);
              setCachedBlobUrl(blobUrl);
              setCodecNote(
                wcResult.usedHardware
                  ? 'Đã dùng bộ mã hóa phần cứng H.264 (WebCodecs) giúp xuất nhanh trên trình duyệt.'
                  : null
              );
              setPhase('done');
              setProgress(100);
              setStatusLabel('Xuất video hoàn tất (WebCodecs)!');
              setDownloadInfo({
                jobId: 'local-wasm',
                url: blobUrl,
                filename: wcResult.filename,
                fileSize: wcResult.blob.size,
                mime: wcResult.blob.type,
              });
              return;
            }
          } catch (wcErr) {
            console.warn('WebCodecs MP4 fallback to FFmpeg.wasm:', wcErr);
          }
        }

        const result = await exportWithBrowserWasm({
          project,
          format,
          width,
          height,
          fps,
          totalFrames,
          renderDuration,
          includeBackground,
          audioFile,
          bgVideoFile,
          bgAudioFile,
          audioEnvelope,
          onPhaseChange: (p) => setPhase(p),
          onProgress: (pct) => setProgress(pct),
          onStatus: (label) => setStatusLabel(label),
        });

        const blobUrl = URL.createObjectURL(result.blob);
        setCachedBlobUrl(blobUrl);
        setCodecNote(result.usedFallbackCodecNote ?? null);
        setPhase('done');
        setProgress(100);
        setStatusLabel('Xuất video hoàn tất (trình duyệt)!');
        setDownloadInfo({
          jobId: 'local-wasm',
          url: blobUrl,
          filename: result.filename,
          fileSize: result.blob.size,
          mime: result.blob.type,
        });
        return;
      }

      const useServerVideoComposite =
        includeBackground && project.background.mode === 'video' && Boolean(bgVideoFile);
      const forceTransparentCanvas = !includeBackground || useServerVideoComposite;
      const frameFormat: 'png' | 'jpg' = forceTransparentCanvas ? 'png' : 'jpg';

      const form = new FormData();
      form.append('format', format);
      form.append('frameFormat', frameFormat);
      form.append('width', String(width));
      form.append('height', String(height));
      form.append('fps', String(fps));
      form.append('totalFrames', String(totalFrames));
      form.append('durationSec', renderDuration.toFixed(3));
      form.append('includeBackground', String(includeBackground));
      form.append('bgDimmer', String(project.background.videoDimmer));
      form.append('bgBlur', String(project.background.videoBlur));
      form.append('bgLoopMode', project.background.videoLoopMode);
      form.append('bgCrossfadeSec', String(project.background.videoCrossfadeSec));
      form.append('bgPlaybackRate', String(project.background.videoPlaybackRate));
      form.append('voiceVolume', String(project.background.voiceVolume));
      form.append('bgAudioVolume', String(project.background.bgAudioVolume));
      form.append('bgAudioSource', project.background.bgAudioSource);
      form.append('projectName', project.name);

      const largeUploads: {
        field: 'audio' | 'bgVideo' | 'bgAudio';
        file: Blob;
        filename: string;
        label: string;
      }[] = [];

      if (audioFile) {
        const audioName = getAudioFilename(audioFile);
        if (audioFile.size <= INLINE_ASSET_LIMIT_BYTES) {
          form.append('audio', audioFile, audioName);
        } else {
          largeUploads.push({
            field: 'audio',
            file: audioFile,
            filename: audioName,
            label: 'file âm thanh',
          });
        }
      }
      if (useServerVideoComposite && bgVideoFile) {
        if (bgVideoFile.size <= INLINE_ASSET_LIMIT_BYTES) {
          form.append('bgVideo', bgVideoFile, bgVideoFile.name);
        } else {
          largeUploads.push({
            field: 'bgVideo',
            file: bgVideoFile,
            filename: bgVideoFile.name,
            label: 'video nền',
          });
        }
      }
      if (
        useServerVideoComposite &&
        project.background.bgAudioSource === 'custom' &&
        bgAudioFile
      ) {
        if (bgAudioFile.size <= INLINE_ASSET_LIMIT_BYTES) {
          form.append('bgAudio', bgAudioFile, bgAudioFile.name);
        } else {
          largeUploads.push({
            field: 'bgAudio',
            file: bgAudioFile,
            filename: bgAudioFile.name,
            label: 'nhạc nền thay thế',
          });
        }
      }

      const initRes = await fetch('/api/export/init', {
        method: 'POST',
        body: form,
      });
      if (!initRes.ok) {
        const errBody = await initRes.json().catch(() => ({}));
        throw new Error(
          errBody.error || `Không thể khởi tạo phiên xuất video (HTTP ${initRes.status})`
        );
      }
      const { jobId, outputFilename } = await initRes.json();

      for (const item of largeUploads) {
        await uploadLargeAsset(jobId, item.field, item.file, item.filename, item.label);
      }

      // Offscreen high-res canvas for exact frame-by-frame rendering
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) throw new Error('Không khởi tạo được Canvas 2D');

      const MAX_BATCH_FRAMES = frameFormat === 'jpg' ? 20 : 8;
      let batch: { index: number; data: Uint8Array }[] = [];
      let batchBytes = 0;

      const flushBatch = async () => {
        if (batch.length === 0) return;
        const packed = packFrameBatch(batch);
        const chunkRes = await fetch(`/api/export/${jobId}/frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: packed.buffer as ArrayBuffer,
        });
        if (!chunkRes.ok) {
          const errBody = await chunkRes.json().catch(() => ({}));
          throw new Error(
            errBody.error ||
              `Lỗi gửi dữ liệu khung hình lên máy chủ (HTTP ${chunkRes.status})`
          );
        }
        batch = [];
        batchBytes = 0;
      };

      for (let i = 0; i < totalFrames; i++) {
        const t = i / fps;
        const energy = sampleAudioEnergy(audioEnvelope, t);

        renderKineticScene(ctx, {
          width,
          height,
          timeSec: t,
          project,
          audioEnergy: energy,
          forceTransparentBg: forceTransparentCanvas,
          skipPostFx: !includeBackground,
          showSafeGuides: false,
          selectedCueId: null,
        });

        const frameBytes = await canvasToFrameBuffer(canvas, frameFormat);
        const frameChunkSize = 8 + frameBytes.byteLength;

        if (
          batch.length > 0 &&
          (batch.length >= MAX_BATCH_FRAMES ||
            batchBytes + frameChunkSize > MAX_FRAME_BATCH_BYTES)
        ) {
          await flushBatch();
        }

        batch.push({ index: i, data: frameBytes });
        batchBytes += frameChunkSize;

        if (i === totalFrames - 1) {
          await flushBatch();
        }

        const pct = Math.round(((i + 1) / totalFrames) * 100);
        setProgress(pct);
        setStatusLabel(`Đang kết xuất khung hình ${i + 1} / ${totalFrames}`);

        // Yield briefly on desktop to keep UI responsive during heavy 1080p/4K loops
        if (i % 4 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      }

      // Trigger FFmpeg encode
      setPhase('encoding');
      setProgress(0);
      setStatusLabel(
        format === 'prores4444'
          ? 'FFmpeg đang mã hóa Apple ProRes 4444 (yuva444p10le Alpha)...'
          : 'FFmpeg đang mã hóa MP4 H.264 + AAC...'
      );

      const finRes = await fetch(`/api/export/${jobId}/finalize`, { method: 'POST' });
      if (!finRes.ok) {
        const errBody = await finRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Không thể bắt đầu mã hóa FFmpeg (HTTP ${finRes.status})`);
      }

      // Poll status until done
      while (true) {
        await new Promise((r) => setTimeout(r, 600));
        const statusRes = await fetch(`/api/export/${jobId}/status`, { cache: 'no-store' });
        if (!statusRes.ok) {
          throw new Error(`Mất kết nối khi theo dõi tiến trình (HTTP ${statusRes.status})`);
        }
        const st = await statusRes.json();

        if (st.status === 'error') {
          throw new Error(st.error || 'FFmpeg gặp lỗi trong quá trình xuất video');
        }
        setProgress(st.progress || 0);

        if (st.status === 'done') {
          setPhase('done');
          setProgress(100);
          setStatusLabel('Xuất video hoàn tất!');
          setDownloadInfo({
            jobId,
            url: `/api/export/${jobId}/download`,
            filename: st.filename || outputFilename,
            fileSize: st.fileSize || 0,
            mime: format === 'prores4444' ? 'video/quicktime' : 'video/mp4',
          });
          break;
        }
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định');
    }
  };

  const isBusy = phase === 'rendering' || phase === 'encoding';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#14171F] border border-white/12 rounded-lg overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-white/8 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-[#F4F5F7]">
            Xuất Video Thành Phẩm
          </h3>
          {!isBusy && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#8E95A5] hover:text-white rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Format Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#E2E5EC] block">
              Định dạng &amp; Codec đầu ra
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleFormatChange('mp4')}
                className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                  format === 'mp4'
                    ? 'bg-[#FF5A1F]/16 border-[#FF5A1F]'
                    : 'bg-[#171A21] border-white/8 hover:bg-[#1D212B]'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Film className="w-4 h-4 text-[#FF5A1F]" />
                  <span>MP4 (H.264 + AAC)</span>
                </div>
                <p className="text-[11px] text-[#8E95A5] mt-1">
                  Nhẹ, sắc nét, phát trực tiếp trên YouTube, TikTok, Reels.
                </p>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleFormatChange('prores4444')}
                className={`p-3 rounded-md border text-left transition-colors cursor-pointer ${
                  format === 'prores4444'
                    ? 'bg-[#FF5A1F]/16 border-[#FF5A1F]'
                    : 'bg-[#171A21] border-white/8 hover:bg-[#1D212B]'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Layers className="w-4 h-4 text-[#34D399]" />
                  <span>MOV ProRes 4444</span>
                </div>
                <p className="text-[11px] text-[#8E95A5] mt-1">
                  10-bit kèm Alpha Channel tách nền để dựng Premiere / AE / Resolve.
                </p>
              </button>
            </div>
          </div>

          {/* Alpha Channel Option */}
          {format === 'prores4444' && (
            <label className="flex items-start gap-3 p-3 bg-[#171A21] border border-white/8 rounded-md cursor-pointer">
              <input
                type="checkbox"
                disabled={isBusy}
                checked={!includeBackground}
                onChange={(e) => setIncludeBackground(!e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-[#34D399]"
              />
              <div>
                <div className="text-xs font-semibold text-[#34D399]">
                  Xuất nền trong suốt (Alpha Channel 16-bit)
                </div>
                <div className="text-[11px] text-[#9BA3B4] mt-0.5">
                  Chỉ giữ lại Kinetic Typography trên kênh Alpha (yuva444p10le) để ghép đè lên footage
                  của bạn ở phần mềm hậu kỳ.
                </div>
              </div>
            </label>
          )}

          {/* Resolution, FPS, Range */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-[#8E95A5]">Độ phân giải</label>
              <select
                disabled={isBusy}
                value={resolution}
                onChange={(e) => setResolution(e.target.value as ExportResolution)}
                className="w-full bg-[#171A21] border border-white/10 rounded px-2.5 py-2 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
              >
                <option value="720p">720p HD</option>
                <option value="1080p">1080p Full HD</option>
                <option value="4k">4K UHD</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-[#8E95A5]">Tốc độ khung hình</label>
              <select
                disabled={isBusy}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value) as 24 | 30 | 60)}
                className="w-full bg-[#171A21] border border-white/10 rounded px-2.5 py-2 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
              >
                <option value={24}>24 fps (Cinema)</option>
                <option value={30}>30 fps (Chuẩn)</option>
                <option value={60}>60 fps (Mượt)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-[#8E95A5]">Phạm vi xuất</label>
              <select
                disabled={isBusy}
                value={rangeMode}
                onChange={(e) => setRangeMode(e.target.value as 'full' | 'cues')}
                className="w-full bg-[#171A21] border border-white/10 rounded px-2.5 py-2 text-xs text-[#F4F5F7] focus:outline-none focus:border-[#FF5A1F]"
              >
                <option value="full">Toàn bộ Audio</option>
                <option value="cues">Hết câu phụ đề</option>
              </select>
            </div>
          </div>

          {/* Technical Summary Strip */}
          <div className="px-3.5 py-2.5 bg-[#0E1015] border border-white/8 rounded-md flex items-center justify-between text-[11px] font-mono-tabular text-[#9BA3B4]">
            <span>
              {width}×{height} · {fps}fps
            </span>
            <span>
              {totalFrames} frames · {renderDuration.toFixed(1)}s
            </span>
            <span>{isAlphaExport ? 'Alpha RGBA' : 'Opaque Composite'}</span>
          </div>

          {/* Progress / Error / Download Result */}
          {phase !== 'idle' && (
            <div className="p-3.5 bg-[#171A21] border border-white/10 rounded-md space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#E2E5EC] font-medium flex items-center gap-2">
                  {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5A1F]" />}
                  {phase === 'done' && <CheckCircle2 className="w-4 h-4 text-[#34D399]" />}
                  <span>{statusLabel}</span>
                </span>
                <span className="font-mono-tabular text-[#9BA3B4]">{progress}%</span>
              </div>

              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  style={{ width: `${progress}%` }}
                  className={`h-full transition-all duration-150 ${
                    phase === 'done'
                      ? 'bg-[#34D399]'
                      : phase === 'error'
                      ? 'bg-red-500'
                      : 'bg-[#FF5A1F]'
                  }`}
                />
              </div>

              {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}
              {codecNote && <p className="text-[11px] text-amber-300/90">{codecNote}</p>}

              {downloadInfo && (
                <div className="mt-2 space-y-1.5">
                  <button
                    type="button"
                    disabled={isDownloadingFile}
                    onClick={handleDownloadResult}
                    className="w-full py-2.5 px-4 bg-[#34D399] hover:bg-[#2CC28B] disabled:opacity-80 text-[#0B0C0F] text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {isDownloadingFile ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>
                          Đang tải xuống từng phần... {downloadPct}% (
                          {(downloadInfo.fileSize / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>
                          {cachedBlobUrl ? 'Lưu xuống máy ngay' : 'Tải xuống'}{' '}
                          {downloadInfo.filename} (
                          {(downloadInfo.fileSize / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                      </>
                    )}
                  </button>
                  {cachedBlobUrl && (
                    <p className="text-[11px] text-[#34D399]/90">
                      File đã tải xong vào trình duyệt. Nếu hộp thoại lưu chưa tự bật, bấm nút Lưu
                      xuống máy ngay ở trên.
                    </p>
                  )}
                  {downloadInfo.jobId !== 'local-wasm' &&
                    downloadInfo.fileSize <= 28 * 1024 * 1024 && (
                      <div className="flex justify-end">
                        <a
                          href={downloadInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#9BA3B4] hover:text-white underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Mở link tải trực tiếp nếu trình duyệt chặn</span>
                        </a>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-white/8 flex items-center justify-end gap-2.5 bg-[#111318]">
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-[#A1A8B8] hover:text-white rounded-md cursor-pointer disabled:opacity-40"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={startExport}
            className="px-5 py-2 bg-[#FF5A1F] hover:bg-[#E84D14] disabled:opacity-50 text-white text-xs font-semibold rounded-md flex items-center gap-2 cursor-pointer"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xuất...</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Bắt đầu xuất {format === 'prores4444' ? 'MOV ProRes 4444' : 'MP4'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
