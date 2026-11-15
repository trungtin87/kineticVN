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
  StudioProject,
  SubtitleCue,
  TypographyConfig,
} from './types/studio';
import {
  buildAudioEnvelope,
  buildWaveformPeaks,
  sampleAudioEnergy,
} from './utils/audioEnvelope';
import { createDefaultProject, generateDemoAudioWavBlob } from './utils/demoProject';
import { parseSrt } from './utils/srtParser';

type MobileSection = 'cues' | 'cueEdit' | 'style' | 'timeline';

export default function App() {
  const [project, setProject] = useState<StudioProject>(() => createDefaultProject());
  const [selectedCueId, setSelectedCueId] = useState<string | null>('demo-1');
  const [activeTab, setActiveTab] = useState<InspectorTab>('cue');
  const [mobileSection, setMobileSection] = useState<MobileSection>('cues');

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

  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fontsTick, setFontsTick] = useState(0);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const bgAudioElRef = useRef<HTMLAudioElement | null>(null);
  const bgAudioUrlRef = useRef<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);

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
    const demoWav = generateDemoAudioWavBlob(15.6);
    loadAudioBlob(demoWav, null);

    document.fonts.ready.then(() => {
      setFontsTick((t) => t + 1);
    });

    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (bgAudioUrlRef.current) URL.revokeObjectURL(bgAudioUrlRef.current);
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, [loadAudioBlob]);

  useEffect(() => {
    const fontName = project.typography.fontFamily;
    document.fonts.load(`800 48px "${fontName}"`).then(() => {
      setFontsTick((t) => t + 1);
    });
  }, [project.typography.fontFamily]);

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
        project.background.mode === 'video' &&
        project.background.bgAudioSource === 'custom' &&
        Boolean(bgAudioFile);
      const bgVol = Math.max(0, Math.min(1, project.background.bgAudioVolume));

      bgAudio.muted = isMuted || !isCustomActive || bgVol <= 0.005;
      bgAudio.volume = isCustomActive && !isMuted ? bgVol : 0;

      if (!isCustomActive || !playing || bgVol <= 0.005) {
        if (!bgAudio.paused) bgAudio.pause();
        if (isCustomActive && !playing && Number.isFinite(bgAudio.duration) && bgAudio.duration > 0.05) {
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
  ]);

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
      bgAudioElRef.current?.pause();
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
  }, [currentTimeSec, seekTo]);

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
    }));
  };

  const handleClearBgAudio = () => {
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
      background: { ...p.background, bgAudioSource: 'video' },
    }));
  };

  const handleUpdateCue = (cueId: string, patch: Partial<SubtitleCue>) => {
    setProject((p) => ({
      ...p,
      cues: p.cues.map((c) => (c.id === cueId ? { ...c, ...patch } : c)),
    }));
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
    const demo = createDefaultProject();
    setProject(demo);
    setSelectedCueId(demo.cues[0]?.id ?? null);
    const demoWav = generateDemoAudioWavBlob(15.6);
    loadAudioBlob(demoWav, null);
    seekTo(0.95);
  };

  const selectedCue = useMemo(
    () => project.cues.find((c) => c.id === selectedCueId) || null,
    [project.cues, selectedCueId]
  );

  const audioEnergy = useMemo(
    () => sampleAudioEnergy(audioEnvelope, currentTimeSec) + fontsTick * 0,
    [audioEnvelope, currentTimeSec, fontsTick]
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
        onProjectNameChange={(name) => setProject((p) => ({ ...p, name }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        aspectRatio={project.aspectRatio}
        onAspectRatioChange={(aspectRatio: AspectRatioId) =>
          setProject((p) => ({ ...p, aspectRatio }))
        }
        onOpenImport={() => setImportOpen(true)}
        onResetDemo={handleResetDemo}
        onOpenExport={() => {
          setIsPlaying(false);
          setExportOpen(true);
        }}
      />

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
          onAddCue={handleAddCue}
          onDeleteCue={handleDeleteCue}
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
            handleUpdateCue(cueId, { customPos: { x: posX, y: posY } })
          }
          onUpdateGlobalPosition={(posX, posY) =>
            setProject((p) => ({
              ...p,
              typography: { ...p.typography, posX, posY },
            }))
          }
        />

        <InspectorPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedCue={selectedCue}
          typography={project.typography}
          motion={project.motion}
          background={project.background}
          effects={project.effects}
          bgVideoName={bgVideoName}
          bgVideoDurationSec={bgVideoDurationSec}
          totalDurationSec={totalDurationSec}
          bgAudioName={bgAudioName}
          onUpdateCue={handleUpdateCue}
          onUpdateTypography={(patch: Partial<TypographyConfig>) =>
            setProject((p) => ({ ...p, typography: { ...p.typography, ...patch } }))
          }
          onUpdateMotion={(patch: Partial<MotionConfig>) =>
            setProject((p) => ({ ...p, motion: { ...p.motion, ...patch } }))
          }
          onUpdateBackground={(patch: Partial<BackgroundConfig>) =>
            setProject((p) => ({ ...p, background: { ...p.background, ...patch } }))
          }
          onUpdateEffects={(patch: Partial<EffectsConfig>) =>
            setProject((p) => ({
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
            }))
          }
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
                handleUpdateCue(cueId, { startSec, endSec })
              }
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
          handleUpdateCue(cueId, { startSec, endSec })
        }
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
