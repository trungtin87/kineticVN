import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { renderKineticScene } from './kineticRenderer';
import { sampleAudioEnergy } from '../utils/audioEnvelope';
import { ExportFormat, StudioProject } from '../types/studio';

let cachedFFmpeg: FFmpeg | null = null;
let ffmpegLoadingPromise: Promise<FFmpeg> | null = null;

async function loadBrowserFFmpeg(onStatus: (msg: string) => void): Promise<FFmpeg> {
  if (cachedFFmpeg && cachedFFmpeg.loaded) return cachedFFmpeg;
  if (ffmpegLoadingPromise) return ffmpegLoadingPromise;

  ffmpegLoadingPromise = (async () => {
    onStatus('Đang tải bộ mã hóa FFmpeg WebAssembly (~30 MB lần đầu)...');
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);

    const ffmpeg = new FFmpeg();
    const cdnBases = [
      'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm',
      'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm',
    ];

    let lastErr: unknown = null;
    for (const baseURL of cdnBases) {
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        cachedFFmpeg = ffmpeg;
        return ffmpeg;
      } catch (err) {
        lastErr = err;
      }
    }

    throw new Error(
      lastErr instanceof Error
        ? `Không thể tải FFmpeg WebAssembly: ${lastErr.message}`
        : 'Không thể tải FFmpeg WebAssembly từ CDN'
    );
  })();

  try {
    return await ffmpegLoadingPromise;
  } catch (err) {
    ffmpegLoadingPromise = null;
    throw err;
  }
}

function getSafeExt(file: Blob | null, fallbackExt: string): string {
  if (!file) return fallbackExt;
  const maybeName = (file as File).name;
  if (typeof maybeName === 'string' && maybeName.includes('.')) {
    const ext = maybeName.slice(maybeName.lastIndexOf('.')).replace(/[^.a-zA-Z0-9]/g, '');
    if (ext.length > 1) return ext.toLowerCase();
  }
  const mime = file.type.toLowerCase();
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return '.m4a';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('flac')) return '.flac';
  return fallbackExt;
}

function canvasToBytes(canvas: HTMLCanvasElement, mime: 'image/png' | 'image/jpeg'): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Không thể chụp khung hình từ Canvas'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      mime,
      mime === 'image/jpeg' ? 0.94 : undefined
    );
  });
}

function createVideoElementFromFile(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không thể đọc video nền trên trình duyệt'));
    };
    video.src = url;
  });
}

function seekVideoTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve) => {
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const clamped = Math.max(0, Math.min(dur - 0.01, timeSec));
    if (Math.abs(video.currentTime - clamped) < 0.005) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = clamped;
  });
}

function mapVideoLoopTime(tSec: number, duration: number, project: StudioProject): number {
  const rate = project.background.videoPlaybackRate || 1;
  const scaled = Math.max(0, tSec * rate);
  if (duration <= 0.1) return 0;

  if (project.background.videoLoopMode === 'pingpong') {
    const cycle = duration * 2;
    const pos = scaled % cycle;
    return pos <= duration ? pos : cycle - pos;
  }
  return scaled % duration;
}

export interface BrowserWasmExportParams {
  project: StudioProject;
  format: ExportFormat;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  renderDuration: number;
  includeBackground: boolean;
  audioFile: Blob | null;
  bgVideoFile: File | null;
  bgAudioFile: File | null;
  audioEnvelope: Float32Array | null;
  onPhaseChange: (phase: 'rendering' | 'encoding') => void;
  onProgress: (pct: number) => void;
  onStatus: (label: string) => void;
  signal?: AbortSignal;
}

export interface BrowserWasmExportResult {
  blob: Blob;
  filename: string;
  usedFallbackCodecNote?: string;
}

export async function exportWithBrowserWasm(
  params: BrowserWasmExportParams
): Promise<BrowserWasmExportResult> {
  const {
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
    onPhaseChange,
    onProgress,
    onStatus,
    signal,
  } = params;

  const assertNotAborted = () => {
    if (signal?.aborted) {
      throw new DOMException('Đã hủy xuất video.', 'AbortError');
    }
  };
  assertNotAborted();

  onPhaseChange('rendering');
  onProgress(0);

  const ffmpeg = await loadBrowserFFmpeg(onStatus);
  assertNotAborted();
  const { fetchFile } = await import('@ffmpeg/util');

  const isAlphaTransparent = !includeBackground;
  const hasVideoBg = includeBackground && project.background.mode === 'video' && Boolean(bgVideoFile);
  const frameExt = isAlphaTransparent ? 'png' : 'jpg';
  const frameMime = isAlphaTransparent ? 'image/png' : 'image/jpeg';

  let bgVideoObj: { video: HTMLVideoElement; url: string } | null = null;
  if (hasVideoBg && bgVideoFile) {
    onStatus('Đang chuẩn bị video nền trên trình duyệt...');
    bgVideoObj = await createVideoElementFromFile(bgVideoFile);
  }

  const createdFiles: string[] = [];
  const registerProgress = ({ progress }: { progress: number }) => {
    const pct = Math.min(99, Math.max(1, Math.round(progress * 100)));
    onProgress(pct);
  };

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Không khởi tạo được Canvas 2D');

    for (let i = 0; i < totalFrames; i++) {
      assertNotAborted();
      const t = i / fps;
      const energy = sampleAudioEnergy(audioEnvelope, t);

      if (bgVideoObj) {
        const { video } = bgVideoObj;
        const vDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
        const targetTime = mapVideoLoopTime(t, vDur, project);
        await seekVideoTo(video, targetTime);
      }

      renderKineticScene(ctx, {
        width,
        height,
        timeSec: t,
        totalDurationSec: renderDuration,
        project,
        audioEnergy: energy,
        bgVideo: bgVideoObj?.video ?? null,
        forceTransparentBg: isAlphaTransparent,
        skipPostFx: !includeBackground,
        showSafeGuides: false,
        selectedCueId: null,
      });

      const bytes = await canvasToBytes(canvas, frameMime);
      const frameName = `frame_${String(i).padStart(6, '0')}.${frameExt}`;
      await ffmpeg.writeFile(frameName, bytes);
      createdFiles.push(frameName);

      onProgress(Math.round(((i + 1) / totalFrames) * 100));
      onStatus(`Đang kết xuất khung hình ${i + 1} / ${totalFrames}`);

      if (i % 4 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (bgVideoObj) {
      URL.revokeObjectURL(bgVideoObj.url);
      bgVideoObj = null;
    }

    assertNotAborted();
    onPhaseChange('encoding');
    onProgress(5);
    onStatus(
      format === 'prores4444'
        ? 'FFmpeg WebAssembly đang mã hóa MOV kèm Alpha...'
        : 'FFmpeg WebAssembly đang mã hóa MP4 H.264...'
    );

    const args: string[] = [
      '-framerate',
      String(fps),
      '-start_number',
      '0',
      '-i',
      `frame_%06d.${frameExt}`,
    ];

    let nextInputIdx = 1;
    let voiceInputIdx = -1;
    let bgAudioInputIdx = -1;

    if (audioFile && project.background.voiceVolume > 0.005) {
      const voiceName = `voice${getSafeExt(audioFile, '.wav')}`;
      await ffmpeg.writeFile(voiceName, await fetchFile(audioFile));
      createdFiles.push(voiceName);
      args.push('-i', voiceName);
      voiceInputIdx = nextInputIdx++;
    }

    if (
      hasVideoBg &&
      project.background.bgAudioSource === 'custom' &&
      bgAudioFile &&
      project.background.bgAudioVolume > 0.005
    ) {
      const bgAudioName = `bgaudio${getSafeExt(bgAudioFile, '.mp3')}`;
      await ffmpeg.writeFile(bgAudioName, await fetchFile(bgAudioFile));
      createdFiles.push(bgAudioName);
      args.push('-stream_loop', '-1', '-i', bgAudioName);
      bgAudioInputIdx = nextInputIdx++;
    }

    const audioFilters: string[] = [];
    const audioLabels: string[] = [];
    if (voiceInputIdx >= 0) {
      audioFilters.push(
        `[${voiceInputIdx}:a]aresample=48000,volume=${project.background.voiceVolume.toFixed(3)}[avoice]`
      );
      audioLabels.push('[avoice]');
    }
    if (bgAudioInputIdx >= 0) {
      audioFilters.push(
        `[${bgAudioInputIdx}:a]aresample=48000,volume=${project.background.bgAudioVolume.toFixed(3)}[abg]`
      );
      audioLabels.push('[abg]');
    }

    let audioMap: string | null = null;
    if (audioLabels.length === 2) {
      audioFilters.push(
        `${audioLabels[0]}${audioLabels[1]}amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`
      );
      audioMap = '[aout]';
    } else if (audioLabels.length === 1) {
      audioMap = audioLabels[0];
    }

    if (audioFilters.length > 0) {
      args.push('-filter_complex', audioFilters.join(';'));
    }

    args.push('-map', '0:v');
    if (audioMap) {
      args.push('-map', audioMap);
    }

    const rawName = (project.name || 'kinetic-typography')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

    ffmpeg.on('progress', registerProgress);

    let outFile = 'output.mp4';
    let outMime = 'video/mp4';
    let downloadName = `${rawName || 'kinetic-typography'}_h264.mp4`;
    let usedFallbackCodecNote: string | undefined;

    if (format === 'prores4444') {
      outFile = 'output.mov';
      outMime = 'video/quicktime';
      downloadName = `${rawName || 'kinetic-typography'}_alpha.mov`;
      createdFiles.push(outFile);

      const proresArgs = [
        ...args,
        '-c:v',
        'prores_ks',
        '-profile:v',
        '4444',
        '-pix_fmt',
        'yuva444p10le',
        ...(audioMap ? ['-c:a', 'pcm_s16le', '-ar', '48000'] : []),
        '-r',
        String(fps),
        '-t',
        renderDuration.toFixed(3),
        outFile,
      ];

      const exitCode = await ffmpeg.exec(proresArgs);
      if (exitCode !== 0) {
        // Fallback to lossless QuickTime PNG RGBA (100% supported in wasm + full Alpha channel)
        onStatus('Đang chuyển sang MOV PNG RGBA (giữ nguyên Alpha Channel)...');
        usedFallbackCodecNote =
          'Trên bản web tĩnh GitHub Pages, file MOV sử dụng codec PNG RGBA trong suốt (hỗ trợ đầy đủ Alpha trên Premiere / AE / Resolve).';
        const pngMovArgs = [
          ...args,
          '-c:v',
          'png',
          '-pix_fmt',
          'rgba',
          ...(audioMap ? ['-c:a', 'pcm_s16le', '-ar', '48000'] : []),
          '-r',
          String(fps),
          '-t',
          renderDuration.toFixed(3),
          outFile,
        ];
        const fallbackExit = await ffmpeg.exec(pngMovArgs);
        if (fallbackExit !== 0) {
          throw new Error('FFmpeg WebAssembly không thể xuất MOV Alpha trong trình duyệt');
        }
      }
    } else {
      createdFiles.push(outFile);
      const mp4Args = [
        ...args,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'zerolatency',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        ...(audioMap ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000'] : []),
        '-r',
        String(fps),
        '-t',
        renderDuration.toFixed(3),
        outFile,
      ];
      const exitCode = await ffmpeg.exec(mp4Args);
      if (exitCode !== 0) {
        throw new Error('FFmpeg WebAssembly không thể mã hóa MP4');
      }
    }

    const rawOut = await ffmpeg.readFile(outFile);
    const outBytes =
      rawOut instanceof Uint8Array
        ? new Uint8Array(rawOut)
        : new TextEncoder().encode(String(rawOut));
    const blob = new Blob([outBytes], { type: outMime });

    return {
      blob,
      filename: downloadName,
      usedFallbackCodecNote,
    };
  } finally {
    ffmpeg.off('progress', registerProgress);
    if (bgVideoObj) {
      URL.revokeObjectURL(bgVideoObj.url);
    }
    for (const fname of createdFiles) {
      await ffmpeg.deleteFile(fname).catch(() => {});
    }
  }
}

export async function remuxMp4WithWavAudioWasm(
  videoBytes: Uint8Array,
  wavBytes: Uint8Array,
  renderDuration: number
): Promise<Blob> {
  const ffmpeg = await loadBrowserFFmpeg(() => {});
  const tempFiles = ['wc_video.mp4', 'wc_audio.wav', 'wc_final.mp4'];
  try {
    await ffmpeg.writeFile('wc_video.mp4', videoBytes);
    await ffmpeg.writeFile('wc_audio.wav', wavBytes);

    const code = await ffmpeg.exec([
      '-i',
      'wc_video.mp4',
      '-i',
      'wc_audio.wav',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-movflags',
      '+faststart',
      '-t',
      renderDuration.toFixed(3),
      '-shortest',
      'wc_final.mp4',
    ]);

    if (code !== 0) {
      throw new Error('Không thể ghép âm thanh vào file MP4');
    }

    const out = await ffmpeg.readFile('wc_final.mp4');
    const outBytes =
      out instanceof Uint8Array ? new Uint8Array(out) : new TextEncoder().encode(String(out));
    return new Blob([outBytes], { type: 'video/mp4' });
  } finally {
    for (const f of tempFiles) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }
  }
}
