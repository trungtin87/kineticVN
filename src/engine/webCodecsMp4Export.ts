import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { renderKineticScene } from './kineticRenderer';
import { sampleAudioEnergy } from '../utils/audioEnvelope';
import { StudioProject } from '../types/studio';

export interface WebCodecsMp4Params {
  project: StudioProject;
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

export type WebCodecsMp4Outcome =
  | { supported: false }
  | {
      supported: true;
      blob: Blob;
      filename: string;
      usedHardware: boolean;
    };

async function findSupportedVideoConfig(
  width: number,
  height: number,
  fps: number
): Promise<{ config: VideoEncoderConfig; usedHardware: boolean } | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return null;
  }

  const pixels = width * height;
  const baseBitrate =
    pixels > 2_500_000 ? 14_000_000 : pixels > 1_200_000 ? 7_500_000 : 4_000_000;
  const bitrate = Math.round(baseBitrate * (fps >= 50 ? 1.35 : 1));

  const codecs =
    width > 1920 || height > 1920
      ? ['avc1.640033', 'avc1.4d0033', 'avc1.640032', 'avc1.420032']
      : ['avc1.64002a', 'avc1.4d002a', 'avc1.640028', 'avc1.4d001f', 'avc1.42001f'];

  const hwModes: HardwareAcceleration[] = ['prefer-hardware', 'no-preference'];

  for (const hardwareAcceleration of hwModes) {
    for (const codec of codecs) {
      const candidate: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration,
        avc: { format: 'avc' },
      };
      try {
        const res = await VideoEncoder.isConfigSupported(candidate);
        if (res.supported) {
          return {
            config: res.config ?? candidate,
            usedHardware: hardwareAcceleration === 'prefer-hardware',
          };
        }
      } catch {
        // try next codec candidate
      }
    }
  }

  return null;
}

async function isAacAudioEncoderSupported(): Promise<AudioEncoderConfig | null> {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined') {
    return null;
  }
  const config: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    numberOfChannels: 2,
    sampleRate: 48000,
    bitrate: 192_000,
  };
  try {
    const res = await AudioEncoder.isConfigSupported(config);
    return res.supported ? (res.config ?? config) : null;
  } catch {
    return null;
  }
}

async function safeDecodeAudio(
  ctx: OfflineAudioContext,
  blob: Blob | null
): Promise<AudioBuffer | null> {
  if (!blob) return null;
  try {
    const arr = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arr);
  } catch {
    return null;
  }
}

async function mixAudioTracksForExport(params: {
  renderDuration: number;
  includeBackground: boolean;
  project: StudioProject;
  audioFile: Blob | null;
  bgVideoFile: File | null;
  bgAudioFile: File | null;
}): Promise<AudioBuffer | null> {
  const { renderDuration, includeBackground, project, audioFile, bgVideoFile, bgAudioFile } =
    params;

  const voiceActive = Boolean(audioFile && project.background.voiceVolume > 0.005);
  const customBgActive = Boolean(
    includeBackground &&
      bgAudioFile &&
      project.background.bgAudioVolume > 0.005 &&
      (project.background.mode !== 'video' || project.background.bgAudioSource === 'custom')
  );
  const videoBgActive = Boolean(
    includeBackground &&
      project.background.mode === 'video' &&
      project.background.bgAudioSource === 'video' &&
      bgVideoFile &&
      project.background.bgAudioVolume > 0.005
  );

  if (!voiceActive && !customBgActive && !videoBgActive) {
    return null;
  }

  const sampleRate = 48000;
  const totalSamples = Math.max(1, Math.ceil(renderDuration * sampleRate));
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtx) return null;

  const offlineCtx = new OfflineCtx(2, totalSamples, sampleRate);

  const [voiceBuf, bgBuf] = await Promise.all([
    voiceActive ? safeDecodeAudio(offlineCtx, audioFile) : Promise.resolve(null),
    customBgActive
      ? safeDecodeAudio(offlineCtx, bgAudioFile)
      : videoBgActive
      ? safeDecodeAudio(offlineCtx, bgVideoFile)
      : Promise.resolve(null),
  ]);

  if (!voiceBuf && !bgBuf) return null;

  if (voiceBuf) {
    const src = offlineCtx.createBufferSource();
    src.buffer = voiceBuf;
    const gain = offlineCtx.createGain();
    gain.gain.value = project.background.voiceVolume;
    src.connect(gain);
    gain.connect(offlineCtx.destination);
    src.start(0);
  }

  if (bgBuf) {
    const src = offlineCtx.createBufferSource();
    src.buffer = bgBuf;
    src.loop = true;
    if (videoBgActive) {
      src.playbackRate.value = Math.max(
        0.5,
        Math.min(1.5, project.background.videoPlaybackRate || 1)
      );
    }
    const gain = offlineCtx.createGain();
    gain.gain.value = project.background.bgAudioVolume;
    src.connect(gain);
    gain.connect(offlineCtx.destination);
    src.start(0);
  }

  return await offlineCtx.startRendering();
}

export function encodeAudioBufferToWav(audioBuffer: AudioBuffer): Uint8Array {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const dataBytes = numFrames * numChannels * 2;
  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const s0 = Math.max(-1, Math.min(1, ch0[i]));
    view.setInt16(offset, s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff, true);
    offset += 2;
    if (numChannels > 1) {
      const s1 = Math.max(-1, Math.min(1, ch1[i]));
      view.setInt16(offset, s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(out);
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

export async function exportMp4WithWebCodecs(
  params: WebCodecsMp4Params
): Promise<WebCodecsMp4Outcome> {
  const {
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

  const videoSupport = await findSupportedVideoConfig(width, height, fps);
  if (!videoSupport) {
    return { supported: false };
  }
  assertNotAborted();

  onPhaseChange('rendering');
  onProgress(0);
  onStatus('Đang chuẩn bị bộ mã hóa phần cứng H.264 (WebCodecs)...');

  const mixedAudio = await mixAudioTracksForExport({
    renderDuration,
    includeBackground,
    project,
    audioFile,
    bgVideoFile,
    bgAudioFile,
  });

  const aacConfig = mixedAudio ? await isAacAudioEncoderSupported() : null;
  const canMuxAudioNatively = Boolean(mixedAudio && aacConfig);

  const hasVideoBg =
    includeBackground && project.background.mode === 'video' && Boolean(bgVideoFile);
  let bgVideoObj: { video: HTMLVideoElement; url: string } | null = null;
  if (hasVideoBg && bgVideoFile) {
    onStatus('Đang chuẩn bị video nền...');
    bgVideoObj = await createVideoElementFromFile(bgVideoFile);
  }

  let encoderError: Error | null = null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width,
      height,
      frameRate: fps,
    },
    audio: canMuxAudioNatively
      ? {
          codec: 'aac',
          numberOfChannels: 2,
          sampleRate: 48000,
        }
      : undefined,
    fastStart: 'in-memory',
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  let audioEncoder: AudioEncoder | null = null;
  if (canMuxAudioNatively && aacConfig) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (err) => {
        encoderError = err instanceof Error ? err : new Error(String(err));
      },
    });
  }

  try {
    videoEncoder.configure(videoSupport.config);
    if (audioEncoder && aacConfig) {
      audioEncoder.configure(aacConfig);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Không khởi tạo được Canvas 2D');
    }

    const frameDurationUs = Math.round(1_000_000 / fps);
    const keyInterval = Math.max(1, fps * 2);

    for (let i = 0; i < totalFrames; i++) {
      assertNotAborted();
      if (encoderError) throw encoderError;

      while (videoEncoder.encodeQueueSize > 6) {
        await new Promise((r) => setTimeout(r, 4));
        assertNotAborted();
        if (encoderError) throw encoderError;
      }

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
        forceTransparentBg: false,
        skipPostFx: !includeBackground,
        showSafeGuides: false,
        selectedCueId: null,
      });

      const timestampUs = Math.round(t * 1_000_000);
      const videoFrame = new VideoFrame(canvas, {
        timestamp: timestampUs,
        duration: frameDurationUs,
      });
      videoEncoder.encode(videoFrame, { keyFrame: i % keyInterval === 0 });
      videoFrame.close();

      const pct = Math.round(((i + 1) / totalFrames) * 100);
      onProgress(pct);
      onStatus(`Đang mã hóa phần cứng H.264: ${i + 1} / ${totalFrames} khung hình`);

      if (i % 6 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (bgVideoObj) {
      URL.revokeObjectURL(bgVideoObj.url);
      bgVideoObj = null;
    }

    onPhaseChange('encoding');
    onProgress(50);
    onStatus('Đang hoàn tất luồng H.264 & âm thanh...');

    if (audioEncoder && mixedAudio) {
      const sampleRate = mixedAudio.sampleRate;
      const totalSamples = mixedAudio.length;
      const ch0 = mixedAudio.getChannelData(0);
      const ch1 =
        mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : mixedAudio.getChannelData(0);
      const CHUNK_SAMPLES = 4096;

      for (let start = 0; start < totalSamples; start += CHUNK_SAMPLES) {
        assertNotAborted();
        if (encoderError) throw encoderError;
        const count = Math.min(CHUNK_SAMPLES, totalSamples - start);
        const planar = new Float32Array(count * 2);
        planar.set(ch0.subarray(start, start + count), 0);
        planar.set(ch1.subarray(start, start + count), count);

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: count,
          numberOfChannels: 2,
          timestamp: Math.round((start / sampleRate) * 1_000_000),
          data: planar,
        });
        audioEncoder.encode(audioData);
        audioData.close();
      }
      await audioEncoder.flush();
    }

    await videoEncoder.flush();
    if (encoderError) throw encoderError;

    muxer.finalize();
    const rawMp4Bytes = new Uint8Array(muxer.target.buffer);

    const rawName = (project.name || 'kinetic-typography')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    const filename = `${rawName || 'kinetic-typography'}_h264.mp4`;

    // If audio is present but AudioEncoder wasn't supported (e.g., older iOS Safari),
    // copy video bitstream untouched (-c:v copy) and encode only the audio track with FFmpeg.wasm.
    if (mixedAudio && !canMuxAudioNatively) {
      onProgress(75);
      onStatus('Đang ghép âm thanh AAC (giữ nguyên video H.264)...');
      const { remuxMp4WithWavAudioWasm } = await import('./clientWasmExport');
      const wavBytes = encodeAudioBufferToWav(mixedAudio);
      const finalBlob = await remuxMp4WithWavAudioWasm(rawMp4Bytes, wavBytes, renderDuration);
      return {
        supported: true,
        blob: finalBlob,
        filename,
        usedHardware: videoSupport.usedHardware,
      };
    }

    return {
      supported: true,
      blob: new Blob([rawMp4Bytes], { type: 'video/mp4' }),
      filename,
      usedHardware: videoSupport.usedHardware,
    };
  } finally {
    if (bgVideoObj) {
      URL.revokeObjectURL(bgVideoObj.url);
    }
    try {
      if (videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // ignore
    }
  }
}
