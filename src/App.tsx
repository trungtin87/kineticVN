import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioWaveform, Captions, SlidersHorizontal, Sparkles } from 'lucide-react';
import { CueListPanel } from './components/CueListPanel';
import { ExportModal } from './components/ExportModal';
import { ImportSrtModal } from './components/ImportSrtModal';
import { InspectorPanel } from './components/InspectorPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PreviewStage } from './components/PreviewStage';
import { TimelineDock } from './components/TimelineDock';
import { InspectorTab, TopBar } from './components/TopBar';
import {
  AspectRatioId,
  BackgroundConfig,
  EffectsConfig,
  MotionConfig,
  ProgressBarConfig,
  SoundscapeConfig,
  StudioProject,
  SubtitleCue,
  TypographyConfig,
  WatermarkConfig,
  WordStyleOverride,
} from './types/studio';
import { preloadWatermarkImage } from './engine/kineticRenderer';
import {
  loadLastEmphasisPreset,
  resolveEmphasisTemplate,
  saveLastEmphasisPreset,
} from './utils/emphasisPreset';
import {
  renderSoundscapeMixWavFile,
  SOUNDSCAPE_COMBOS,
} from './utils/soundscapeLibrary';
import {
  buildAudioEnvelope,
  buildWaveformPeaks,
  sampleAudioEnergy,
} from './utils/audioEnvelope';
import { createDefaultProject, generateDemoAudioWavBlob } from './utils/demoProject';
import { ensureGoogleFontLoaded, onFontLoaded, preloadProjectFonts } from './utils/googleFonts';
import { useProjectHistory } from './hooks/useProjectHistory';
import {
  clearAutosaveSnapshot,
  exportProjectJsonBlob,
  loadAutosaveSnapshot,
  parseProjectJsonText,
  saveAutosaveSnapshot,
} from './utils/projectStorage';
import {
  exportSrt,
  mergeCues,
  parseSrt,
  parseWordTimestampsJson,
  splitCueAtTime,
} from './utils/srtParser';
import { StyleTemplate } from './utils/styleTemplates';

type MobileSection = 'cues' | 'cueEdit' | 'style' | 'timeline';

const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: false,
  imageDataUrl: null,
  name: null,
  position: 'top-right',
  scale: 0.12,
  opacity: 0.85,
  marginPx: 36,
};

const DEFAULT_PROGRESS_BAR: ProgressBarConfig = {
  enabled: false,
  position: 'bottom',
  style: 'glow',
  heightPx: 8,
  color: '#FF5A1F',
  trackColor: 'rgba(255,255,255,0.18)',
  opacity: 0.9,
};

const DEFAULT_SOUNDSCAPE: SoundscapeConfig = {
  enabled: false,
  presetId: null,
  layers: {},
};

function autoCoalesceKey(
  prefix: string,
  patch: Record<string, unknown>,
  explicit?: string
): string | undefined {
  if (explicit) return explicit;
  const keys = Object.keys(patch);
  if (keys.length === 1) {
    return `${prefix}:${keys[0]}`;
  }
  return undefined;
}

export default function App() {
  const {
    state: project,
    setState: setProject,
    resetHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useProjectHistory<StudioProject>(() => createDefaultProject());

  const [selectedCueId, setSelectedCueId] = useState<string | null>('demo-1');
  const [activeTab, setActiveTab] = useState<InspectorTab>('cue');
  const [mobileSection, setMobileSection] = useState<MobileSection>('cues');
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [statusError, setStatusError] = useState<string | null>(null);

  const [currentTimeSec, setCurrentTimeSec] = useState(0.95);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState(15.6);
  const [audioEnvelope, setAudioEnvelope] = useState<Float32Array | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);

  const [bgVideoFile, setBgVideoFile] = useState<File | null>(null);
  const [bgVideoName, setBgVideoName] = useState<string | null>(null);
  const [bgVideoEl, setBgVideoEl] = useState<HTMLVideoElement | null>(null);
  const [bgVideoEl2, setBgVideoEl2] = useState<HTMLVideoElement | null>(null);
  const [bgVideoDurationSec, setBgVideoDurationSec] = useState(0);

  const [bgAudioFile, setBgAudioFile] = useState<File | null>(null);
  const [bgAudioName, setBgAudioName] = useState<string | null>(null);
  const [isPreviewingSoundscape, setIsPreviewingSoundscape] = useState(false);
  const [sharedEmphasisPreset, setSharedEmphasisPreset] = useState<WordStyleOverride | null>(() =>
    loadLastEmphasisPreset()
  );

  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fontsTick, setFontsTick] = useState(0);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const bgAudioElRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioUrlRef = useRef<string | null>(null);
  const userUploadedBgAudioRef = useRef(false);
  const isPreviewingSoundscapeRef = useRef(false);
  const videoUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);
  const autosaveReadyRef = useRef(false);

  useEffect(() => {
    isPreviewingSoundscapeRef.current = isPreviewingSoundscape;
  }, [isPreviewingSoundscape]);

  const loadAudioBlob = useCallback(async (blob: Blob, name: string | null) => {
    setAudioBlob(blob);
    setAudioName(name);

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;

    if (audioElRef.current) {
      audioElRef.current.src = url;
      audioElRef.current.load();
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const arrayBuf = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setAudioDurationSec(decoded.duration);
      setAudioEnvelope(buildAudioEnvelope(decoded, 60));
      setWaveformPeaks(buildWaveformPeaks(decoded, 650));
      await ctx.close();
    } catch {
      // Fallback duration if browser cannot decode exotic codec in WebAudio
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const snap = await loadAutosaveSnapshot();
      if (cancelled) return;

      if (snap) {
        resetHistory(snap.project);
        setSelectedCueId(snap.project.cues[0]?.id ?? null);
        if (snap.project.watermark?.imageDataUrl) {
          preloadWatermarkImage(snap.project.watermark.imageDataUrl);
        }
        if (snap.audioBlob) {
          await loadAudioBlob(snap.audioBlob, snap.audioName ?? null);
        } else {
          await loadAudioBlob(generateDemoAudioWavBlob(15.6), null);
        }
        if (!cancelled) {
          setAutosaveStatus('saved');
        }
      } else {
        await loadAudioBlob(generateDemoAudioWavBlob(15.6), null);
      }

      if (!cancelled) {
        autosaveReadyRef.current = true;
      }
    };

    init();

    document.fonts.ready.then(() => {
      setFontsTick((t) => t + 1);
    });

    const unsubFont = onFontLoaded(() => {
      setFontsTick((t) => t + 1);
    });

    return () => {
      cancelled = true;
      unsubFont();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (bgAudioUrlRef.current) URL.revokeObjectURL(bgAudioUrlRef.current);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, [loadAudioBlob, resetHistory]);

  // Debounced IndexedDB Autosave
  useEffect(() => {
    if (!autosaveReadyRef.current) return;
    setAutosaveStatus('saving');
    const timer = window.setTimeout(async () => {
      await saveAutosaveSnapshot({
        project,
        audioBlob,
        audioName,
        savedAt: Date.now(),
      });
      setAutosaveStatus('saved');
    }, 600);
    return () => window.clearTimeout(timer);
  }, [project, audioBlob, audioName]);

  useEffect(() => {
    const fontsToLoad: (string | null | undefined)[] = [project.typography.fontFamily];
    for (const cue of project.cues) {
      if (cue.customFont) fontsToLoad.push(cue.customFont);
      for (const ws of Object.values(cue.wordStyles)) {
        if (ws?.fontFamily) fontsToLoad.push(ws.fontFamily);
      }
    }
    preloadProjectFonts(fontsToLoad).then(() => {
      setFontsTick((t) => t + 1);
    });
  }, [project.typography.fontFamily, project.cues]);

  const totalDurationSec = useMemo(() => {
    const lastCue = project.cues.reduce((max, c) => Math.max(max, c.endSec), 0);
    return Math.max(2, audioDurationSec, lastCue + 0.5);
  }, [audioDurationSec, project.cues]);

  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.muted = isMuted;
      audioElRef.current.volume = isMuted
        ? 0
        : Math.max(0, Math.min(1, project.background.voiceVolume));
    }
  }, [isMuted, project.background.voiceVolume]);

  const computeBgLoopFrame = useCallback(
    (t: number) => {
      if (!bgVideoEl || bgVideoDurationSec <= 0.1) {
        return {
          primary: bgVideoEl,
          secondary: null as HTMLVideoElement | null,
          blendAlpha: 0,
          primaryTime: 0,
          secondaryTime: 0,
          isReverse: false,
        };
      }

      const rate = Math.max(0.5, Math.min(1.5, project.background.videoPlaybackRate || 1));
      const mode = project.background.videoLoopMode;
      const effD = bgVideoDurationSec / rate;

      if (mode === 'crossfade' && bgVideoDurationSec > 0.6 && bgVideoEl2) {
        const fadeDur = Math.max(0.25, Math.min(project.background.videoCrossfadeSec, effD * 0.4));
        const period = Math.max(0.25, effD - fadeDur);
        const k = Math.floor(t / period);
        const local = t - k * period;

        const currEl = k % 2 === 0 ? bgVideoEl : bgVideoEl2;
        const prevEl = k % 2 === 0 ? bgVideoEl2 : bgVideoEl;
        const currSrcTime = Math.min(bgVideoDurationSec - 0.02, local * rate);

        if (k >= 1 && local < fadeDur) {
          const prevSrcTime = Math.min(bgVideoDurationSec - 0.02, (period + local) * rate);
          const u = Math.max(0, Math.min(1, local / fadeDur));
          const smooth = u * u * (3 - 2 * u);
          return {
            primary: prevEl,
            secondary: currEl,
            blendAlpha: smooth,
            primaryTime: prevSrcTime,
            secondaryTime: currSrcTime,
            isReverse: false,
          };
        }

        return {
          primary: currEl,
          secondary: null,
          blendAlpha: 0,
          primaryTime: currSrcTime,
          secondaryTime: 0,
          isReverse: false,
        };
      }

      if (mode === 'pingpong' && bgVideoDurationSec > 0.2) {
        const period = effD * 2;
        const mod = t % period;
        if (mod <= effD) {
          return {
            primary: bgVideoEl,
            secondary: null,
            blendAlpha: 0,
            primaryTime: Math.min(bgVideoDurationSec - 0.02, mod * rate),
            secondaryTime: 0,
            isReverse: false,
          };
        }
        return {
          primary: bgVideoEl,
          secondary: null,
          blendAlpha: 0,
          primaryTime: Math.max(0, (period - mod) * rate),
          secondaryTime: 0,
          isReverse: true,
        };
      }

      return {
        primary: bgVideoEl,
        secondary: null,
        blendAlpha: 0,
        primaryTime: (t % effD) * rate,
        secondaryTime: 0,
        isReverse: false,
      };
    },
    [
      bgVideoEl,
      bgVideoEl2,
      bgVideoDurationSec,
      project.background.videoPlaybackRate,
      project.background.videoLoopMode,
      project.background.videoCrossfadeSec,
    ]
  );

  const syncBgVideosAtTime = useCallback(
    (t: number, playing: boolean) => {
      if (!bgVideoEl || bgVideoDurationSec <= 0.1) return;
      const rate = Math.max(0.5, Math.min(1.5, project.background.videoPlaybackRate || 1));
      const state = computeBgLoopFrame(t);
      const bgVol = Math.max(0, Math.min(1, project.background.bgAudioVolume));
      const useVideoAudio =
        project.background.mode === 'video' &&
        project.background.bgAudioSource === 'video' &&
        !isMuted &&
        bgVol > 0.005;

      if (!playing) {
        bgVideoEl.muted = true;
        bgVideoEl.pause();
        if (bgVideoEl2) {
          bgVideoEl2.muted = true;
          bgVideoEl2.pause();
        }
        if (state.primary) {
          state.primary.currentTime = state.primaryTime;
        }
        if (state.secondary) {
          state.secondary.currentTime = state.secondaryTime;
        }
        return;
      }

      if (state.isReverse && state.primary) {
        // Browser HTMLVideoElement cannot play backwards natively; step cleanly during reverse half
        state.primary.muted = true;
        state.primary.pause();
        state.primary.currentTime = state.primaryTime;
        if (bgVideoEl2) bgVideoEl2.muted = true;
        return;
      }

      if (state.primary) {
        state.primary.playbackRate = rate;
        if (useVideoAudio) {
          state.primary.muted = false;
          state.primary.volume = state.secondary
            ? Math.max(0, Math.min(1, bgVol * (1 - state.blendAlpha)))
            : bgVol;
        } else {
          state.primary.muted = true;
        }
        if (Math.abs(state.primary.currentTime - state.primaryTime) > 0.25) {
          state.primary.currentTime = state.primaryTime;
        }
        if (state.primary.paused) {
          state.primary.play().catch(() => {});
        }
      }

      if (state.secondary) {
        state.secondary.playbackRate = rate;
        if (useVideoAudio) {
          state.secondary.muted = false;
          state.secondary.volume = Math.max(0, Math.min(1, bgVol * state.blendAlpha));
        } else {
          state.secondary.muted = true;
        }
        if (Math.abs(state.secondary.currentTime - state.secondaryTime) > 0.25) {
          state.secondary.currentTime = state.secondaryTime;
        }
        if (state.secondary.paused) {
          state.secondary.play().catch(() => {});
        }
      } else {
        // Park the idle video at 0 so next loop transition starts cleanly with zero seek lag
        const idle = state.primary === bgVideoEl ? bgVideoEl2 : bgVideoEl;
        if (idle) {
          idle.muted = true;
          if (!idle.paused) idle.pause();
          if (Math.abs(idle.currentTime) > 0.05) {
            idle.currentTime = 0;
          }
        }
      }
    },
    [
      bgVideoEl,
      bgVideoEl2,
      bgVideoDurationSec,
      project.background.videoPlaybackRate,
      project.background.mode,
      project.background.bgAudioSource,
      project.background.bgAudioVolume,
      isMuted,
      computeBgLoopFrame,
    ]
  );

  const syncBgAudioAtTime = useCallback(
    (t: number, playing: boolean) => {
      const bgAudio = bgAudioElRef.current;
      if (!bgAudio) return;

      const isCustomActive =
        project.background.mode !== 'transparent' &&
        (project.background.mode !== 'video' || project.background.bgAudioSource === 'custom') &&
        Boolean(bgAudioFile);
      const bgVol = Math.max(0, Math.min(1, project.background.bgAudioVolume));
      const standalonePreview = !playing && isPreviewingSoundscapeRef.current;

      bgAudio.muted = isMuted || !isCustomActive || bgVol <= 0.005;
      bgAudio.volume = isCustomActive && !isMuted ? bgVol : 0;

      if (!isCustomActive || bgVol <= 0.005) {
        if (!bgAudio.paused) bgAudio.pause();
        return;
      }

      if (!playing) {
        if (standalonePreview) {
          if (bgAudio.paused) {
            bgAudio.play().catch(() => {});
          }
          return;
        }
        if (!bgAudio.paused) bgAudio.pause();
        if (Number.isFinite(bgAudio.duration) && bgAudio.duration > 0.05) {
          bgAudio.currentTime = t % bgAudio.duration;
        }
        return;
      }

      if (Number.isFinite(bgAudio.duration) && bgAudio.duration > 0.05) {
        const target = t % bgAudio.duration;
        if (Math.abs(bgAudio.currentTime - target) > 0.25) {
          bgAudio.currentTime = target;
        }
      }
      if (bgAudio.paused) {
        bgAudio.play().catch(() => {});
      }
    },
    [
      bgAudioFile,
      isMuted,
      project.background.mode,
      project.background.bgAudioSource,
      project.background.bgAudioVolume,
    ]
  );

  useEffect(() => {
    syncBgVideosAtTime(currentTimeSec, isPlaying);
    syncBgAudioAtTime(currentTimeSec, isPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isMuted,
    project.background.mode,
    project.background.bgAudioSource,
    project.background.bgAudioVolume,
    bgAudioFile,
    isPreviewingSoundscape,
  ]);

  // Synthesize seamless multi-layer ambient WAV when Soundscape mixer changes
  const soundscapeSerialized = JSON.stringify(project.soundscape ?? DEFAULT_SOUNDSCAPE);
  useEffect(() => {
    const sc = project.soundscape;
    const hasActiveLayers =
      Boolean(sc?.enabled) &&
      Object.values(sc?.layers || {}).some((v) => v > 0.01);

    if (!hasActiveLayers) {
      if (!userUploadedBgAudioRef.current && bgAudioFile) {
        if (bgAudioElRef.current) {
          bgAudioElRef.current.pause();
          bgAudioElRef.current.removeAttribute('src');
          bgAudioElRef.current.load();
        }
        if (bgAudioUrlRef.current) {
          URL.revokeObjectURL(bgAudioUrlRef.current);
          bgAudioUrlRef.current = null;
        }
        setBgAudioFile(null);
        setBgAudioName(null);
        setIsPreviewingSoundscape(false);
      }
      return;
    }

    const timer = window.setTimeout(() => {
      const comboName = sc?.presetId
        ? SOUNDSCAPE_COMBOS.find((c) => c.id === sc.presetId)?.name
        : null;
      const activeCount = Object.values(sc!.layers).filter((v) => v > 0.01).length;
      const label = comboName || `Phối âm Thiên nhiên (${activeCount} lớp)`;
      const wavFile = renderSoundscapeMixWavFile(sc!.layers, comboName || 'hoattu_soundscape');
      if (!wavFile) return;

      userUploadedBgAudioRef.current = false;
      if (bgAudioUrlRef.current) URL.revokeObjectURL(bgAudioUrlRef.current);
      const url = URL.createObjectURL(wavFile);
      bgAudioUrlRef.current = url;

      if (bgAudioElRef.current) {
        bgAudioElRef.current.src = url;
        bgAudioElRef.current.load();
        if (isPreviewingSoundscapeRef.current || isPlaying) {
          bgAudioElRef.current.play().catch(() => {});
        }
      }
      setBgAudioFile(wavFile);
      setBgAudioName(label);
    }, 160);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundscapeSerialized]);

  const seekTo = useCallback(
    (nextTime: number) => {
      const clamped = Math.max(0, Math.min(totalDurationSec, nextTime));
      setCurrentTimeSec(clamped);
      if (audioElRef.current && clamped < audioDurationSec) {
        audioElRef.current.currentTime = clamped;
      }
      syncBgVideosAtTime(clamped, isPlaying);
      syncBgAudioAtTime(clamped, isPlaying);
    },
    [totalDurationSec, audioDurationSec, isPlaying, syncBgVideosAtTime, syncBgAudioAtTime]
  );

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioElRef.current?.pause();
      if (!isPreviewingSoundscapeRef.current) {
        bgAudioElRef.current?.pause();
      }
      if (bgVideoEl) {
        bgVideoEl.muted = true;
        bgVideoEl.pause();
      }
      if (bgVideoEl2) {
        bgVideoEl2.muted = true;
        bgVideoEl2.pause();
      }
      return;
    }

    if (isPreviewingSoundscapeRef.current) {
      setIsPreviewingSoundscape(false);
    }

    const audio = audioElRef.current;
    if (audio && currentTimeSec < audioDurationSec) {
      audio.currentTime = currentTimeSec;
      audio.play().catch(() => {});
    }
    syncBgVideosAtTime(currentTimeSec, true);
    syncBgAudioAtTime(currentTimeSec, true);

    lastFrameTsRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastFrameTsRef.current) / 1000;
      lastFrameTsRef.current = now;

      setCurrentTimeSec((prev) => {
        let next = prev + dt;
        if (audio && !audio.paused && !audio.ended && next < audioDurationSec) {
          next = audio.currentTime;
        }
        if (next >= totalDurationSec) {
          if (isLooping) {
            if (audio) {
              audio.currentTime = 0;
              audio.play().catch(() => {});
            }
            syncBgVideosAtTime(0, true);
            syncBgAudioAtTime(0, true);
            return 0;
          } else {
            setIsPlaying(false);
            return totalDurationSec;
          }
        }
        syncBgVideosAtTime(next, true);
        syncBgAudioAtTime(next, true);
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, isLooping, totalDurationSec, audioDurationSec, syncBgVideosAtTime, syncBgAudioAtTime]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }
        if ((key === 'z' && e.shiftKey) || key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        seekTo(currentTimeSec - 1 / 30);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        seekTo(currentTimeSec + 1 / 30);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentTimeSec, seekTo, undo, redo]);

  const handleUploadSrtFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseSrt(text);
    if (parsed.length > 0) {
      setProject((p) => ({ ...p, cues: parsed }));
      setSelectedCueId(parsed[0].id);
      seekTo(parsed[0].startSec + 0.05);
    }
  };

  const handleImportSrtText = (srtText: string) => {
    const parsed = parseSrt(srtText);
    if (parsed.length > 0) {
      setProject((p) => ({ ...p, cues: parsed }));
      setSelectedCueId(parsed[0].id);
      seekTo(parsed[0].startSec + 0.05);
    }
  };

  const handleImportWordJson = (jsonText: string) => {
    const parsed = parseWordTimestampsJson(jsonText);
    if (parsed.length > 0) {
      setProject((p) => ({ ...p, cues: parsed }));
      setSelectedCueId(parsed[0].id);
      seekTo(parsed[0].startSec + 0.05);
    }
  };

  const handleUploadAudioFile = (file: File) => {
    setIsPlaying(false);
    loadAudioBlob(file, file.name);
  };

  const handleUploadBgVideo = (file: File) => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;

    const makeVideoEl = () => {
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.loop = false;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.load();
      return v;
    };

    const vid1 = makeVideoEl();
    const vid2 = makeVideoEl();
    vid1.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(vid1.duration) && vid1.duration > 0) {
        setBgVideoDurationSec(vid1.duration);
      }
    });

    setBgVideoFile(file);
    setBgVideoName(file.name);
    setBgVideoEl(vid1);
    setBgVideoEl2(vid2);
    setProject((p) => ({
      ...p,
      background: { ...p.background, mode: 'video', videoLoop: true },
    }));
  };

  const handleClearBgVideo = () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    bgVideoEl?.pause();
    bgVideoEl2?.pause();
    setBgVideoFile(null);
    setBgVideoName(null);
    setBgVideoEl(null);
    setBgVideoEl2(null);
    setBgVideoDurationSec(0);
    setProject((p) => ({
      ...p,
      background: { ...p.background, mode: 'preset' },
    }));
  };

  const handleUploadBgAudio = (file: File) => {
    userUploadedBgAudioRef.current = true;
    if (bgAudioUrlRef.current) URL.revokeObjectURL(bgAudioUrlRef.current);
    const url = URL.createObjectURL(file);
    bgAudioUrlRef.current = url;

    if (bgAudioElRef.current) {
      bgAudioElRef.current.src = url;
      bgAudioElRef.current.load();
    }
    setBgAudioFile(file);
    setBgAudioName(file.name);
    setProject((p) => ({
      ...p,
      background: { ...p.background, bgAudioSource: 'custom' },
      soundscape: { ...DEFAULT_SOUNDSCAPE, enabled: false },
    }));
  };

  const handleClearBgAudio = () => {
    userUploadedBgAudioRef.current = false;
    setIsPreviewingSoundscape(false);
    if (bgAudioElRef.current) {
      bgAudioElRef.current.pause();
      bgAudioElRef.current.removeAttribute('src');
      bgAudioElRef.current.load();
    }
    if (bgAudioUrlRef.current) {
      URL.revokeObjectURL(bgAudioUrlRef.current);
      bgAudioUrlRef.current = null;
    }
    setBgAudioFile(null);
    setBgAudioName(null);
    setProject((p) => ({
      ...p,
      background: {
        ...p.background,
        bgAudioSource: p.background.mode === 'video' ? 'video' : 'custom',
      },
      soundscape: { ...DEFAULT_SOUNDSCAPE, enabled: false },
    }));
  };

  const handleTogglePreviewSoundscape = () => {
    if (isPreviewingSoundscape) {
      setIsPreviewingSoundscape(false);
      bgAudioElRef.current?.pause();
      return;
    }
    setIsPlaying(false);
    if (project.background.bgAudioVolume <= 0.005) {
      setProject((p) => ({
        ...p,
        background: { ...p.background, bgAudioVolume: 0.3 },
      }));
    }
    setIsPreviewingSoundscape(true);
    const el = bgAudioElRef.current;
    if (el && bgAudioFile) {
      el.muted = isMuted;
      el.volume = isMuted ? 0 : Math.max(0.05, Math.min(1, project.background.bgAudioVolume || 0.3));
      el.play().catch(() => {});
    }
  };

  const handleUpdateCue = (cueId: string, patch: Partial<SubtitleCue>, coalesceKey?: string) => {
    const key = autoCoalesceKey(`cue-${cueId}`, patch as Record<string, unknown>, coalesceKey);
    setProject(
      (p) => ({
        ...p,
        cues: p.cues.map((c) => (c.id === cueId ? { ...c, ...patch } : c)),
      }),
      key ? { coalesceKey: key } : undefined
    );
  };

  const handleSplitCue = (cueId: string) => {
    const idx = project.cues.findIndex((c) => c.id === cueId);
    if (idx < 0) return;
    const res = splitCueAtTime(project.cues[idx], currentTimeSec);
    if (!res) return;
    const [first, second] = res;
    setProject((p) => {
      const nextCues = [...p.cues];
      const currentIdx = nextCues.findIndex((c) => c.id === cueId);
      if (currentIdx < 0) return p;
      nextCues.splice(currentIdx, 1, first, second);
      return {
        ...p,
        cues: nextCues.map((c, i) => ({ ...c, index: i + 1 })),
      };
    });
    setSelectedCueId(second.id);
  };

  const handleMergeNextCue = (cueId: string) => {
    const idx = project.cues.findIndex((c) => c.id === cueId);
    if (idx < 0 || idx >= project.cues.length - 1) return;
    const merged = mergeCues(project.cues[idx], project.cues[idx + 1]);
    setProject((p) => {
      const nextCues = [...p.cues];
      const currentIdx = nextCues.findIndex((c) => c.id === cueId);
      if (currentIdx < 0 || currentIdx >= nextCues.length - 1) return p;
      nextCues.splice(currentIdx, 2, merged);
      return {
        ...p,
        cues: nextCues.map((c, i) => ({ ...c, index: i + 1 })),
      };
    });
    setSelectedCueId(merged.id);
  };

  const handleApplyTemplate = (tpl: StyleTemplate) => {
    if (tpl.typography.fontFamily) {
      ensureGoogleFontLoaded(tpl.typography.fontFamily);
    }
    setProject((p) => ({
      ...p,
      typography: { ...p.typography, ...tpl.typography },
      motion: { ...p.motion, ...tpl.motion },
      background: { ...p.background, ...tpl.background },
      effects: {
        vignette: 0.22,
        filmGrain: 0.06,
        scanlines: 0,
        chromaticAberration: 0,
        cameraFloat: false,
        textCardOpacity: 0,
        textCardColor: '#0B0C0F',
        ...p.effects,
        ...tpl.effects,
      },
      progressBar: tpl.progressBar
        ? { ...DEFAULT_PROGRESS_BAR, ...p.progressBar, ...tpl.progressBar }
        : p.progressBar,
    }));
  };

  const handleExportProjectJson = () => {
    const { blob, filename } = exportProjectJsonBlob(project);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProjectJson = async (file: File) => {
    try {
      const raw = await file.text();
      const loaded = parseProjectJsonText(raw);
      setProject(loaded);
      setSelectedCueId(loaded.cues[0]?.id ?? null);
      if (loaded.cues[0]) {
        seekTo(loaded.cues[0].startSec + 0.05);
      }
      if (loaded.watermark?.imageDataUrl) {
        preloadWatermarkImage(loaded.watermark.imageDataUrl);
      }
      setStatusError(null);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : 'Không thể mở file dự án .kinetik.json.'
      );
      window.setTimeout(() => setStatusError(null), 4500);
    }
  };

  const handleExportSrt = () => {
    const content = exportSrt(project.cues);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (project.name || 'subtitles').trim().replace(/\s+/g, '_');
    a.download = `${baseName}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddCue = () => {
    const lastEnd = project.cues.reduce((max, c) => Math.max(max, c.endSec), 0);
    const startSec = Number((lastEnd + 0.2).toFixed(2));
    const endSec = Number((startSec + 2.5).toFixed(2));
    const newCue: SubtitleCue = {
      id: `cue-${Date.now()}`,
      index: project.cues.length + 1,
      startSec,
      endSec,
      text: 'Câu phụ đề mới\nnhấn để chỉnh sửa',
      wordStyles: {},
    };
    setProject((p) => ({ ...p, cues: [...p.cues, newCue] }));
    setSelectedCueId(newCue.id);
    setActiveTab('cue');
    setMobileSection('cueEdit');
    seekTo(startSec + 0.1);
  };

  const handleDeleteCue = (cueId: string) => {
    setProject((p) => ({
      ...p,
      cues: p.cues.filter((c) => c.id !== cueId),
    }));
    if (selectedCueId === cueId) {
      setSelectedCueId(null);
    }
  };

  const handleResetDemo = () => {
    setIsPlaying(false);
    clearAutosaveSnapshot();
    const demo = createDefaultProject();
    resetHistory(demo);
    setSelectedCueId(demo.cues[0]?.id ?? null);
    const demoWav = generateDemoAudioWavBlob(15.6);
    loadAudioBlob(demoWav, null);
    seekTo(0.95);
  };

  const selectedCue = useMemo(
    () => project.cues.find((c) => c.id === selectedCueId) || null,
    [project.cues, selectedCueId]
  );

  const canMergeSelectedCue = useMemo(() => {
    if (!selectedCueId) return false;
    const idx = project.cues.findIndex((c) => c.id === selectedCueId);
    return idx >= 0 && idx < project.cues.length - 1;
  }, [project.cues, selectedCueId]);

  const audioEnergy = useMemo(
    () => sampleAudioEnergy(audioEnvelope, currentTimeSec) + fontsTick * 0,
    [audioEnvelope, currentTimeSec, fontsTick]
  );

  const handleChangeSharedEmphasisPreset = useCallback(
    (preset: WordStyleOverride | null) => {
      const clean = preset ? { ...preset, emphasized: true } : null;
      setSharedEmphasisPreset(clean);
      saveLastEmphasisPreset(clean);
    },
    []
  );

  const handleQuickSelectCue = useCallback(
    (cueId: string) => {
      setSelectedCueId(cueId);
      const target = project.cues.find((c) => c.id === cueId);
      if (target) {
        seekTo(target.startSec + Math.min(0.35, (target.endSec - target.startSec) * 0.4));
      }
    },
    [project.cues, seekTo]
  );

  const handleQuickToggleWord = useCallback(
    (cueId: string, wordIdx: number) => {
      const target = project.cues.find((c) => c.id === cueId);
      if (!target) return;

      const existing = target.wordStyles[wordIdx];
      const nextStyles = { ...target.wordStyles };
      if (existing?.emphasized) {
        delete nextStyles[wordIdx];
      } else {
        const applied = resolveEmphasisTemplate(sharedEmphasisPreset, project.typography);
        nextStyles[wordIdx] = applied;
        handleChangeSharedEmphasisPreset(applied);
      }

      handleUpdateCue(cueId, { wordStyles: nextStyles });
      setSelectedCueId(cueId);
      if (currentTimeSec < target.startSec || currentTimeSec > target.endSec) {
        seekTo(target.startSec + Math.min(0.35, (target.endSec - target.startSec) * 0.4));
      }
    },
    [
      project.cues,
      project.typography,
      sharedEmphasisPreset,
      handleChangeSharedEmphasisPreset,
      currentTimeSec,
      seekTo,
    ]
  );

  const handleMobileTabSelect = (section: MobileSection) => {
    setMobileSection(section);
    if (section === 'cueEdit') {
      setActiveTab('cue');
    } else if (section === 'style' && activeTab === 'cue') {
      setActiveTab('typography');
    }
  };

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#0B0C0F] text-[#F4F5F7] flex flex-col">
      <audio ref={audioElRef} preload="auto" />
      <audio ref={bgAudioElRef} loop preload="auto" />

      <TopBar
        projectName={project.name}
        onProjectNameChange={(name) =>
          setProject((p) => ({ ...p, name }), { coalesceKey: 'project-name' })
        }
        activeTab={activeTab}
        onTabChange={setActiveTab}
        aspectRatio={project.aspectRatio}
        onAspectRatioChange={(aspectRatio: AspectRatioId) =>
          setProject((p) => ({ ...p, aspectRatio }))
        }
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        autosaveStatus={autosaveStatus}
        onExportProjectJson={handleExportProjectJson}
        onImportProjectJson={handleImportProjectJson}
        onOpenImport={() => setImportOpen(true)}
        onResetDemo={handleResetDemo}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportOpen(true);
        }}
      />

      {statusError && (
        <div className="bg-red-500/15 border-b border-red-400/30 px-4 py-1.5 text-xs text-red-300 flex items-center justify-between">
          <span>{statusError}</span>
          <button
            type="button"
            onClick={() => setStatusError(null)}
            className="text-red-200 hover:text-white underline cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Responsive Studio Workspace: 3-column on desktop (lg+), stacked preview + tabbed drawer on mobile */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <CueListPanel
          cues={project.cues}
          selectedCueId={selectedCueId}
          currentTimeSec={currentTimeSec}
          audioName={audioName}
          audioDurationSec={audioDurationSec}
          emphasisDefaultColor={project.typography.emphasisColor}
          onSelectCue={(id, shouldSeek) => {
            setSelectedCueId(id);
            setActiveTab('cue');
            setMobileSection('cueEdit');
            if (shouldSeek) {
              const target = project.cues.find((c) => c.id === id);
              if (target) {
                seekTo(target.startSec + Math.min(0.35, (target.endSec - target.startSec) * 0.4));
              }
            }
          }}
          onQuickToggleWord={handleQuickToggleWord}
          onAddCue={handleAddCue}
          onDeleteCue={handleDeleteCue}
          onSplitCue={handleSplitCue}
          onMergeNextCue={handleMergeNextCue}
          onExportSrt={handleExportSrt}
          onOpenImport={() => setImportOpen(true)}
          onQuickUploadSrt={handleUploadSrtFile}
          onQuickUploadAudio={handleUploadAudioFile}
          className={mobileSection === 'cues' ? 'flex-1 lg:flex-none' : 'hidden lg:flex'}
        />

        <PreviewStage
          project={project}
          currentTimeSec={currentTimeSec}
          totalDurationSec={totalDurationSec}
          isPlaying={isPlaying}
          isLooping={isLooping}
          isMuted={isMuted}
          audioEnergy={audioEnergy}
          fontLoadTick={fontsTick}
          selectedCueId={selectedCueId}
          bgVideoElement={computeBgLoopFrame(currentTimeSec).primary}
          bgVideoSecondary={computeBgLoopFrame(currentTimeSec).secondary}
          bgVideoBlendAlpha={computeBgLoopFrame(currentTimeSec).blendAlpha}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onStepFrame={(delta) => {
            setIsPlaying(false);
            seekTo(currentTimeSec + delta / 30);
          }}
          onToggleLoop={() => setIsLooping((l) => !l)}
          onToggleMute={() => setIsMuted((m) => !m)}
          onUpdateCuePosition={(cueId, posX, posY) =>
            handleUpdateCue(cueId, { customPos: { x: posX, y: posY } }, `drag-cue-${cueId}`)
          }
          onUpdateGlobalPosition={(posX, posY) =>
            setProject(
              (p) => ({
                ...p,
                typography: { ...p.typography, posX, posY },
              }),
              { coalesceKey: 'drag-global-pos' }
            )
          }
          onQuickToggleWord={handleQuickToggleWord}
          onQuickSelectCue={handleQuickSelectCue}
          onOpenCueEditor={(cueId) => {
            handleQuickSelectCue(cueId);
            setActiveTab('cue');
            setMobileSection('cueEdit');
          }}
        />

        <InspectorPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedCue={selectedCue}
          cues={project.cues}
          currentTimeSec={currentTimeSec}
          onQuickSelectCue={handleQuickSelectCue}
          sharedEmphasisPreset={sharedEmphasisPreset}
          onChangeSharedEmphasisPreset={handleChangeSharedEmphasisPreset}
          typography={project.typography}
          motion={project.motion}
          background={project.background}
          soundscape={project.soundscape ?? DEFAULT_SOUNDSCAPE}
          effects={project.effects}
          watermark={project.watermark ?? DEFAULT_WATERMARK}
          progressBar={project.progressBar ?? DEFAULT_PROGRESS_BAR}
          bgVideoName={bgVideoName}
          bgVideoDurationSec={bgVideoDurationSec}
          totalDurationSec={totalDurationSec}
          bgAudioName={bgAudioName}
          isPreviewingSoundscape={isPreviewingSoundscape}
          canMergeNextCue={canMergeSelectedCue}
          onUpdateCue={handleUpdateCue}
          onSplitCue={handleSplitCue}
          onMergeNextCue={handleMergeNextCue}
          onUpdateTypography={(patch: Partial<TypographyConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('typo', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({ ...p, typography: { ...p.typography, ...patch } }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onUpdateMotion={(patch: Partial<MotionConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('motion', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({ ...p, motion: { ...p.motion, ...patch } }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onUpdateBackground={(patch: Partial<BackgroundConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('bg', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({ ...p, background: { ...p.background, ...patch } }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onUpdateSoundscape={(patch: Partial<SoundscapeConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('sc', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({
                ...p,
                soundscape: {
                  ...DEFAULT_SOUNDSCAPE,
                  ...p.soundscape,
                  ...patch,
                },
              }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onTogglePreviewSoundscape={handleTogglePreviewSoundscape}
          onUpdateEffects={(patch: Partial<EffectsConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('fx', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({
                ...p,
                effects: {
                  vignette: 0.22,
                  filmGrain: 0.06,
                  scanlines: 0,
                  chromaticAberration: 0,
                  cameraFloat: false,
                  textCardOpacity: 0,
                  textCardColor: '#0B0C0F',
                  ...p.effects,
                  ...patch,
                },
              }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onUpdateWatermark={(patch: Partial<WatermarkConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('wm', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({
                ...p,
                watermark: {
                  ...DEFAULT_WATERMARK,
                  ...p.watermark,
                  ...patch,
                },
              }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onUpdateProgressBar={(patch: Partial<ProgressBarConfig>, coalesceKey?: string) => {
            const key = autoCoalesceKey('pb', patch as Record<string, unknown>, coalesceKey);
            setProject(
              (p) => ({
                ...p,
                progressBar: {
                  ...DEFAULT_PROGRESS_BAR,
                  ...p.progressBar,
                  ...patch,
                },
              }),
              key ? { coalesceKey: key } : undefined
            );
          }}
          onApplyTemplate={handleApplyTemplate}
          onUploadBgVideo={handleUploadBgVideo}
          onClearBgVideo={handleClearBgVideo}
          onUploadBgAudio={handleUploadBgAudio}
          onClearBgAudio={handleClearBgAudio}
          className={
            mobileSection === 'cueEdit' || mobileSection === 'style'
              ? 'flex-1 lg:flex-none'
              : 'hidden lg:flex'
          }
        />

        {/* Mobile Timeline Tab Container */}
        {mobileSection === 'timeline' && (
          <div className="flex-1 flex flex-col justify-center bg-[#111318] lg:hidden min-h-0">
            <TimelineDock
              cues={project.cues}
              selectedCueId={selectedCueId}
              currentTimeSec={currentTimeSec}
              totalDurationSec={totalDurationSec}
              waveformPeaks={waveformPeaks}
              onSeek={(t) => {
                setIsPlaying(false);
                seekTo(t);
              }}
              onSelectCue={(id) => {
                setSelectedCueId(id);
                setActiveTab('cue');
              }}
              onUpdateCueTiming={(cueId, startSec, endSec) =>
                handleUpdateCue(cueId, { startSec, endSec }, `tl-drag-${cueId}`)
              }
              onSplitCue={handleSplitCue}
              onMergeNextCue={handleMergeNextCue}
              className="flex-1 h-auto"
            />
          </div>
        )}
      </main>

      {/* Desktop Bottom Timeline Dock */}
      <TimelineDock
        cues={project.cues}
        selectedCueId={selectedCueId}
        currentTimeSec={currentTimeSec}
        totalDurationSec={totalDurationSec}
        waveformPeaks={waveformPeaks}
        onSeek={(t) => {
          setIsPlaying(false);
          seekTo(t);
        }}
        onSelectCue={(id) => {
          setSelectedCueId(id);
          setActiveTab('cue');
        }}
        onUpdateCueTiming={(cueId, startSec, endSec) =>
          handleUpdateCue(cueId, { startSec, endSec }, `tl-drag-${cueId}`)
        }
        onSplitCue={handleSplitCue}
        onMergeNextCue={handleMergeNextCue}
        className="hidden lg:flex"
      />

      {/* Mobile Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Mobile studio tabs"
        className="lg:hidden h-14 bg-[#111318] border-t border-white/10 grid grid-cols-4 shrink-0"
      >
        <button
          type="button"
          onClick={() => handleMobileTabSelect('cues')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[10px] font-medium transition-colors cursor-pointer ${
            mobileSection === 'cues' ? 'text-[#FF5A1F]' : 'text-[#8E95A5]'
          }`}
        >
          <Captions className="w-5 h-5" />
          <span>Phụ đề</span>
        </button>

        <button
          type="button"
          onClick={() => handleMobileTabSelect('cueEdit')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[10px] font-medium transition-colors cursor-pointer ${
            mobileSection === 'cueEdit' ? 'text-[#FF5A1F]' : 'text-[#8E95A5]'
          }`}
        >
          <SlidersHorizontal className="w-5 h-5" />
          <span>Sửa từ</span>
        </button>

        <button
          type="button"
          onClick={() => handleMobileTabSelect('style')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[10px] font-medium transition-colors cursor-pointer ${
            mobileSection === 'style' ? 'text-[#FF5A1F]' : 'text-[#8E95A5]'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <span>Font &amp; Nền</span>
        </button>

        <button
          type="button"
          onClick={() => handleMobileTabSelect('timeline')}
          className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] text-[10px] font-medium transition-colors cursor-pointer ${
            mobileSection === 'timeline' ? 'text-[#FF5A1F]' : 'text-[#8E95A5]'
          }`}
        >
          <AudioWaveform className="w-5 h-5" />
          <span>Timeline</span>
        </button>
      </nav>

      <OfflineIndicator />

      {importOpen && (
        <ImportSrtModal
          isOpen={importOpen}
          cues={project.cues}
          onClose={() => setImportOpen(false)}
          onImportSrtText={handleImportSrtText}
          onImportWordJson={handleImportWordJson}
          onUploadAudio={handleUploadAudioFile}
        />
      )}

      {exportOpen && (
        <ExportModal
          isOpen={exportOpen}
          project={project}
          audioFile={audioBlob}
          bgVideoFile={bgVideoFile}
          bgAudioFile={bgAudioFile}
          totalDurationSec={totalDurationSec}
          audioEnvelope={audioEnvelope}
          onClose={() => setExportOpen(false)}
        />
      )}
    </div>
  );
}
