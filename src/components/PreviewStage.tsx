import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Expand,
  Grid,
  Maximize2,
  Minimize2,
  Move,
  Pause,
  Play,
  Repeat,
  ShieldAlert,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ASPECT_RATIOS, StudioProject } from '../types/studio';
import {
  renderKineticScene,
  RenderedCueBounds,
  TIKTOK_SAFE_ZONE,
} from '../engine/kineticRenderer';
import { formatTimecodeShort, tokenizeCueText } from '../utils/srtParser';

interface PreviewStageProps {
  project: StudioProject;
  projectName?: string;
  currentTimeSec: number;
  totalDurationSec: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMuted: boolean;
  audioEnergy: number;
  fontLoadTick?: number;
  selectedCueId: string | null;
  bgVideoElement: HTMLVideoElement | null;
  bgVideoSecondary?: HTMLVideoElement | null;
  bgVideoBlendAlpha?: number;
  onTogglePlay: () => void;
  onStepFrame: (deltaFrames: number) => void;
  onSeek?: (timeSec: number) => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onUpdateCuePosition: (cueId: string, posX: number, posY: number) => void;
  onUpdateGlobalPosition: (posX: number, posY: number) => void;
  onQuickToggleWord?: (cueId: string, wordIdx: number) => void;
  onQuickSelectCue?: (cueId: string) => void;
  onOpenCueEditor?: (cueId: string) => void;
  showGuides?: boolean;
  onToggleGuides?: () => void;
  onCenterSafeZone?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

type SnapKind = 'none' | 'frame' | 'tiktok';

export const PreviewStage: React.FC<PreviewStageProps> = ({
  project,
  projectName,
  currentTimeSec,
  totalDurationSec,
  isPlaying,
  isLooping,
  isMuted,
  audioEnergy,
  fontLoadTick = 0,
  selectedCueId,
  bgVideoElement,
  bgVideoSecondary = null,
  bgVideoBlendAlpha = 0,
  onTogglePlay,
  onStepFrame,
  onSeek,
  onToggleLoop,
  onToggleMute,
  onUpdateCuePosition,
  onUpdateGlobalPosition,
  onQuickToggleWord,
  onQuickSelectCue,
  onOpenCueEditor,
  showGuides: controlledShowGuides,
  onToggleGuides,
  onCenterSafeZone,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBoundsRef = useRef<RenderedCueBounds | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const hudWasVisibleAtDownRef = useRef<boolean>(true);
  const dragMovedRef = useRef(false);

  const [localShowGuides, setLocalShowGuides] = useState(true);
  const [fullscreenGuides, setFullscreenGuides] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const [nativeFsActive, setNativeFsActive] = useState(false);

  const showGuides = controlledShowGuides !== undefined ? controlledShowGuides : localShowGuides;
  const effectiveShowGuides = isFullscreen ? fullscreenGuides : showGuides;

  const toggleGuides = () => {
    if (isFullscreen) {
      setFullscreenGuides((v) => !v);
      return;
    }
    if (onToggleGuides) {
      onToggleGuides();
    } else {
      setLocalShowGuides((v) => !v);
    }
  };

  const [showSocialSafe, setShowSocialSafe] = useState(true);
  const [dragCueOnly, setDragCueOnly] = useState(false);
  const [snapActive, setSnapActive] = useState<{ x: SnapKind; y: SnapKind }>({
    x: 'none',
    y: 'none',
  });
  const [dragState, setDragState] = useState<{
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
    cueId: string | null;
    forCueOnly: boolean;
  } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });

  const aspect = ASPECT_RATIOS[project.aspectRatio];
  const isVerticalRatio = project.aspectRatio === '9:16' || project.aspectRatio === '4:5';

  // Auto-hide theater HUD smoothly during fullscreen playback
  const bumpHudVisibility = useCallback(() => {
    setHudVisible(true);
    if (hudTimerRef.current) {
      window.clearTimeout(hudTimerRef.current);
      hudTimerRef.current = null;
    }
    if (isFullscreen && isPlaying) {
      hudTimerRef.current = window.setTimeout(() => {
        setHudVisible(false);
      }, 2600);
    }
  }, [isFullscreen, isPlaying]);

  useEffect(() => {
    lastTapRef.current = null;
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
    }

    if (!isFullscreen) {
      setHudVisible(true);
      if (hudTimerRef.current) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }
    setFullscreenGuides(false);
    bumpHudVisibility();
    return () => {
      if (hudTimerRef.current) {
        window.clearTimeout(hudTimerRef.current);
        hudTimerRef.current = null;
      }
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
    };
  }, [isFullscreen, isPlaying, bumpHudVisibility]);

  useEffect(() => {
    const onFsChange = () => {
      setNativeFsActive(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const handleToggleNativeFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Ignore on browsers / iOS Safari / restricted iframes; CSS theater fullscreen remains active
    }
  };

  // Observe viewport wrapper dimensions for crisp aspect-ratio fitting
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isFullscreen]);

  // Compute fitted display box inside available center stage
  const pad = isFullscreen
    ? containerSize.w < 500
      ? 4
      : 16
    : containerSize.w < 500
    ? 12
    : 28;
  const availW = Math.max(180, containerSize.w - pad * 2);
  const availH = Math.max(120, containerSize.h - pad * 2);
  let displayW = availW;
  let displayH = displayW / aspect.ratio;
  if (displayH > availH) {
    displayH = availH;
    displayW = displayH * aspect.ratio;
  }

  // Render preview frame cleanly whenever state or time updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const minSide = Math.max(1, Math.min(displayW, displayH));
    const minTarget = isFullscreen ? 720 : 540;
    const renderScale = Math.min(4, Math.max(dpr, minTarget / minSide));
    const targetW = Math.max(2, Math.round(displayW * renderScale));
    const targetH = Math.max(2, Math.round(targetW / aspect.ratio));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bounds = renderKineticScene(ctx, {
      width: targetW,
      height: targetH,
      timeSec: currentTimeSec,
      totalDurationSec,
      project,
      audioEnergy,
      bgVideo: bgVideoElement,
      bgVideoSecondary,
      bgVideoBlendAlpha,
      showSafeGuides: effectiveShowGuides,
      showSocialSafeZones: effectiveShowGuides && showSocialSafe && isVerticalRatio,
      selectedCueId: isFullscreen ? null : selectedCueId,
    });
    lastBoundsRef.current = bounds;
  }, [
    project,
    aspect.ratio,
    currentTimeSec,
    totalDurationSec,
    audioEnergy,
    fontLoadTick,
    bgVideoElement,
    bgVideoSecondary,
    bgVideoBlendAlpha,
    effectiveShowGuides,
    showSocialSafe,
    isVerticalRatio,
    selectedCueId,
    isFullscreen,
    displayW,
    displayH,
  ]);

  // Pointer drag-to-position + reliable touch/mouse double-tap to toggle fullscreen
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    dragMovedRef.current = false;
    hudWasVisibleAtDownRef.current = hudVisible;

    const activeCue = project.cues.find(
      (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
    );
    const targetCue = activeCue || project.cues.find((c) => c.id === selectedCueId) || null;
    const origPosX = targetCue?.customPos?.x ?? project.typography.posX;
    const origPosY = targetCue?.customPos?.y ?? project.typography.posY;
    const forCueOnly = Boolean(targetCue && (dragCueOnly || targetCue.customPos));

    canvas.setPointerCapture(e.pointerId);
    setDragState({
      startX: e.clientX,
      startY: e.clientY,
      origPosX,
      origPosY,
      cueId: targetCue ? targetCue.id : null,
      forCueOnly,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    const TAP_SLOP_PX = 8;
    const distPx = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    if (!dragMovedRef.current) {
      if (distPx <= TAP_SLOP_PX) return;
      dragMovedRef.current = true;
    }
    if (isFullscreen) {
      bumpHudVisibility();
    }

    const dxNorm = (e.clientX - dragState.startX) / Math.max(1, displayW);
    const dyNorm = (e.clientY - dragState.startY) / Math.max(1, displayH);

    let nextX = Math.max(0.05, Math.min(0.95, dragState.origPosX + dxNorm));
    let nextY = Math.max(0.05, Math.min(0.95, dragState.origPosY + dyNorm));

    const tiktokGuidesVisible = isVerticalRatio && effectiveShowGuides && showSocialSafe;
    const snapThreshold = 0.018;

    let snapX: SnapKind = 'none';
    if (tiktokGuidesVisible && Math.abs(nextX - TIKTOK_SAFE_ZONE.centerX) < snapThreshold) {
      nextX = TIKTOK_SAFE_ZONE.centerX;
      snapX = 'tiktok';
    } else if (Math.abs(nextX - 0.5) < snapThreshold) {
      nextX = 0.5;
      snapX = 'frame';
    }

    let snapY: SnapKind = 'none';
    if (tiktokGuidesVisible && Math.abs(nextY - TIKTOK_SAFE_ZONE.centerY) < snapThreshold) {
      nextY = TIKTOK_SAFE_ZONE.centerY;
      snapY = 'tiktok';
    } else if (Math.abs(nextY - 0.5) < snapThreshold) {
      nextY = 0.5;
      snapY = 'frame';
    }

    setSnapActive({ x: snapX, y: snapY });

    if (dragState.forCueOnly && dragState.cueId) {
      onUpdateCuePosition(dragState.cueId, Number(nextX.toFixed(3)), Number(nextY.toFixed(3)));
    } else {
      onUpdateGlobalPosition(Number(nextX.toFixed(3)), Number(nextY.toFixed(3)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    const wasTap = !dragMovedRef.current;
    setDragState(null);
    setSnapActive({ x: 'none', y: 'none' });

    if (!wasTap) {
      lastTapRef.current = null;
      return;
    }

    const now = Date.now();
    const prevTap = lastTapRef.current;
    const isDoubleTap =
      prevTap !== null &&
      now - prevTap.time <= 320 &&
      Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) <= 44;

    if (isDoubleTap) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = null;
      onToggleFullscreen?.();
      return;
    }

    lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };

    if (isFullscreen) {
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current);
      }
      const nextHudVisible = !hudWasVisibleAtDownRef.current;
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null;
        setHudVisible(nextHudVisible);
        if (hudTimerRef.current) {
          window.clearTimeout(hudTimerRef.current);
          hudTimerRef.current = null;
        }
        if (nextHudVisible && isPlaying) {
          hudTimerRef.current = window.setTimeout(() => setHudVisible(false), 2600);
        }
      }, 240);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    setDragState(null);
    setSnapActive({ x: 'none', y: 'none' });
    dragMovedRef.current = false;
  };

  const handleCenterTikTokSafeZone = () => {
    if (isFullscreen) {
      setFullscreenGuides(true);
    } else if (!showGuides) {
      toggleGuides();
    }
    setShowSocialSafe(true);
    if (onCenterSafeZone) {
      onCenterSafeZone();
      return;
    }
    const activeCue = project.cues.find(
      (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
    );
    const targetCue = activeCue || project.cues.find((c) => c.id === selectedCueId) || null;
    if (targetCue && (dragCueOnly || targetCue.customPos)) {
      onUpdateCuePosition(targetCue.id, TIKTOK_SAFE_ZONE.centerX, TIKTOK_SAFE_ZONE.centerY);
    } else {
      onUpdateGlobalPosition(TIKTOK_SAFE_ZONE.centerX, TIKTOK_SAFE_ZONE.centerY);
    }
  };

  const activeCueIndex = (() => {
    const atPlayhead = project.cues.findIndex(
      (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
    );
    if (atPlayhead >= 0) return atPlayhead;
    const sel = project.cues.findIndex((c) => c.id === selectedCueId);
    if (sel >= 0) return sel;
    return project.cues.length > 0 ? 0 : -1;
  })();
  const stageCue = activeCueIndex >= 0 ? project.cues[activeCueIndex] : null;
  const prevStageCue = activeCueIndex > 0 ? project.cues[activeCueIndex - 1] : null;
  const nextStageCue =
    activeCueIndex >= 0 && activeCueIndex < project.cues.length - 1
      ? project.cues[activeCueIndex + 1]
      : null;

  const canUseNativeFs =
    typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  return (
    <section
      onMouseMove={isFullscreen ? bumpHudVisibility : undefined}
      onTouchStart={
        isFullscreen
          ? (e) => {
              if (e.target !== canvasRef.current) bumpHudVisibility();
            }
          : undefined
      }
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#050608] w-screen h-[100dvh] flex flex-col select-none'
          : 'h-[38vh] min-h-[235px] lg:h-auto lg:flex-1 bg-[#0B0C0F] flex flex-col min-w-0 shrink-0 lg:shrink border-b lg:border-b-0 border-white/8'
      }
    >
      {/* Canvas Stage */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0"
      >
        <div
          style={{ width: `${Math.round(displayW)}px`, height: `${Math.round(displayH)}px` }}
          className={`relative overflow-hidden shadow-2xl ${
            isFullscreen ? 'rounded-sm border border-white/10' : 'rounded-md border border-white/12'
          } ${project.background.mode === 'transparent' ? 'alpha-checkerboard' : 'bg-black'}`}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className={`w-full h-full block touch-none ${
              isFullscreen ? 'cursor-pointer' : 'cursor-move'
            }`}
          />

          {/* Snap-to-center alignment overlay during drag (frame center & TikTok Safe Zone center) */}
          {dragState && snapActive.x === 'frame' && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#FF5A1F] pointer-events-none shadow-[0_0_8px_#FF5A1F]" />
          )}
          {dragState && snapActive.y === 'frame' && (
            <div className="absolute left-0 right-0 top-1/2 h-px bg-[#FF5A1F] pointer-events-none shadow-[0_0_8px_#FF5A1F]" />
          )}
          {dragState && snapActive.x === 'tiktok' && (
            <div
              style={{ left: `${TIKTOK_SAFE_ZONE.centerX * 100}%` }}
              className="absolute top-0 bottom-0 w-px bg-[#38BDF8] pointer-events-none shadow-[0_0_8px_#38BDF8]"
            />
          )}
          {dragState && snapActive.y === 'tiktok' && (
            <div
              style={{ top: `${TIKTOK_SAFE_ZONE.centerY * 100}%` }}
              className="absolute left-0 right-0 h-px bg-[#38BDF8] pointer-events-none shadow-[0_0_8px_#38BDF8]"
            />
          )}

          {/* Subtle corner resolution indicator & always-visible fullscreen trigger */}
          {!isFullscreen && (
            <>
              <div className="absolute top-2 left-2.5 pointer-events-none flex items-center gap-2 text-[10px] lg:text-[11px] font-mono-tabular text-white/55 bg-black/45 px-2 py-0.5 rounded">
                <span>
                  {aspect.width}×{aspect.height}
                </span>
                {project.background.mode === 'transparent' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#34D399]">Alpha RGBA</span>
                  </>
                )}
              </div>

              {onToggleFullscreen && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onToggleFullscreen}
                  title="Xem toàn màn hình (hoặc chạm đúp vào khung hình)"
                  aria-label="Mở toàn màn hình"
                  className="absolute top-2 right-2 min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-md bg-black/60 hover:bg-black/85 active:scale-95 border border-white/15 text-white/85 hover:text-white shadow-md backdrop-blur-xs transition-all cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}

              <div className="hidden sm:flex absolute bottom-2.5 right-3 items-center gap-1.5 text-[11px] text-white/75 bg-black/55 px-2 py-0.5 rounded border border-white/10">
                <Move className="w-3 h-3 text-[#FF5A1F]" />
                <button
                  type="button"
                  onClick={() => setDragCueOnly((v) => !v)}
                  title="Chuyển chế độ kéo vị trí toàn cục hoặc riêng câu đang hiển thị"
                  className="hover:text-white cursor-pointer"
                >
                  Kéo: <strong className="text-[#FF5A1F]">{dragCueOnly ? 'Riêng câu' : 'Toàn cục'}</strong>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Fullscreen Overlay Top HUD */}
        {isFullscreen && (
          <div
            className={`absolute top-0 left-0 right-0 px-3 sm:px-6 pt-3 pb-8 bg-gradient-to-b from-black/85 via-black/45 to-transparent flex items-center justify-between gap-2 transition-opacity duration-200 ${
              hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display text-xs sm:text-sm font-semibold text-white truncate max-w-[160px] sm:max-w-xs">
                {projectName || project.name}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono-tabular text-[#D5D9E2] shrink-0">
                {project.aspectRatio}
              </span>
              <span className="hidden sm:inline text-[11px] font-mono-tabular text-[#9BA3B4] shrink-0">
                {aspect.width}×{aspect.height}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isVerticalRatio && (
                <button
                  type="button"
                  onClick={handleCenterTikTokSafeZone}
                  title="Định tâm chữ vào vùng an toàn TikTok (T)"
                  className="min-h-[38px] px-2.5 rounded-md bg-black/60 hover:bg-black/80 border border-[#38BDF8]/40 text-[#38BDF8] text-xs font-medium flex items-center gap-1 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tâm Safe</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleGuides}
                title="Bật/tắt lưới an toàn trong toàn màn hình"
                className={`min-h-[38px] px-2.5 rounded-md border text-xs font-medium flex items-center gap-1 cursor-pointer ${
                  effectiveShowGuides
                    ? 'bg-white/15 border-white/30 text-white'
                    : 'bg-black/60 hover:bg-black/80 border-white/15 text-[#D5D9E2]'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lưới</span>
              </button>

              {canUseNativeFs && (
                <button
                  type="button"
                  onClick={handleToggleNativeFullscreen}
                  title={nativeFsActive ? 'Thoát toàn màn hình trình duyệt' : 'Phóng to tràn màn hình trình duyệt'}
                  className="min-h-[38px] min-w-[38px] px-2 rounded-md bg-black/60 hover:bg-black/80 border border-white/15 text-[#D5D9E2] hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <Expand className="w-4 h-4" />
                </button>
              )}

              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  title="Thu nhỏ lại Studio (Esc / F)"
                  className="min-h-[38px] px-3 rounded-md bg-[#FF5A1F] hover:bg-[#E84D14] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Thoát</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Fullscreen Overlay Bottom HUD (Interactive Scrubber + Touch-friendly Controls) */}
        {isFullscreen && (
          <div
            className={`absolute bottom-0 left-0 right-0 px-3 sm:px-6 pt-10 pb-[max(0.85rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/90 via-black/65 to-transparent space-y-2.5 transition-opacity duration-200 ${
              hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {stageCue && (
              <div className="flex items-center justify-center">
                <span className="px-2.5 py-0.5 rounded-full bg-black/60 border border-white/10 text-[11px] text-[#D5D9E2] max-w-[90vw] sm:max-w-lg truncate">
                  <strong className="text-[#FF5A1F] font-mono-tabular mr-1.5">
                    #{String(activeCueIndex + 1).padStart(2, '0')}
                  </strong>
                  {stageCue.text.replace(/\n+/g, ' ')}
                </span>
              </div>
            )}

            {/* Seek Scrubber */}
            <div className="flex items-center gap-2.5 max-w-4xl mx-auto w-full">
              <span className="text-[11px] font-mono-tabular text-[#F4F5F7] shrink-0 w-14 text-right">
                {formatTimecodeShort(currentTimeSec)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, totalDurationSec)}
                step={0.02}
                value={Math.min(totalDurationSec, currentTimeSec)}
                onChange={(e) => {
                  bumpHudVisibility();
                  onSeek?.(Number(e.target.value));
                }}
                aria-label="Tua thời gian video"
                className="flex-1 accent-[#FF5A1F] cursor-pointer h-2"
              />
              <span className="text-[11px] font-mono-tabular text-[#9BA3B4] shrink-0 w-14">
                {formatTimecodeShort(totalDurationSec)}
              </span>
            </div>

            {/* Touch-optimized Playback Controls */}
            <div className="flex items-center justify-between max-w-4xl mx-auto w-full gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!prevStageCue}
                  onClick={() => prevStageCue && onQuickSelectCue?.(prevStageCue.id)}
                  title="Câu trước ([)"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-white/8 hover:bg-white/15 text-white disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  disabled={!nextStageCue}
                  onClick={() => nextStageCue && onQuickSelectCue?.(nextStageCue.id)}
                  title="Câu tiếp theo (])"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-white/8 hover:bg-white/15 text-white disabled:opacity-25 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStepFrame(-1)}
                  title="Lùi 1 frame (←)"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-white/8 hover:bg-white/15 text-[#E2E5EC] cursor-pointer"
                >
                  <SkipBack className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onTogglePlay}
                  title="Phát / Tạm dừng (Space)"
                  className="w-12 h-11 bg-[#FF5A1F] hover:bg-[#E84D14] text-white rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => onStepFrame(1)}
                  title="Tới 1 frame (→)"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-white/8 hover:bg-white/15 text-[#E2E5EC] cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleLoop}
                  title="Lặp lại (L)"
                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                    isLooping
                      ? 'bg-[#FF5A1F]/25 text-[#FF5A1F]'
                      : 'bg-white/8 text-[#D5D9E2] hover:bg-white/15'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onToggleMute}
                  title={isMuted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-white/8 hover:bg-white/15 text-[#D5D9E2] cursor-pointer"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Inline Quick Word-Emphasis & Cue Stepper Bar (hidden in fullscreen theater mode) */}
      {!isFullscreen && stageCue && onQuickToggleWord && (
        <div className="h-9 px-2 lg:px-3 bg-[#0E1015] border-t border-white/8 flex items-center gap-1.5 shrink-0 min-w-0">
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              disabled={!prevStageCue}
              onClick={() => prevStageCue && onQuickSelectCue?.(prevStageCue.id)}
              title="Câu trước"
              className="p-1 text-[#9BA3B4] hover:text-white disabled:opacity-25 rounded hover:bg-white/5 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 py-0.5 rounded bg-[#171A21] border border-white/10 text-[10px] font-mono-tabular text-[#FF5A1F] font-semibold shrink-0">
              #{String(activeCueIndex + 1).padStart(2, '0')}
            </span>
            <button
              type="button"
              disabled={!nextStageCue}
              onClick={() => nextStageCue && onQuickSelectCue?.(nextStageCue.id)}
              title="Câu tiếp theo"
              className="p-1 text-[#9BA3B4] hover:text-white disabled:opacity-25 rounded hover:bg-white/5 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0 py-0.5">
            {tokenizeCueText(stageCue.text).flatWords.map((tok) => {
              const ws = stageCue.wordStyles[tok.wordIndex];
              const isEmph = Boolean(ws?.emphasized);
              const color = ws?.color || project.typography.emphasisColor;
              return (
                <button
                  key={tok.wordIndex}
                  type="button"
                  onClick={() => onQuickToggleWord(stageCue.id, tok.wordIndex)}
                  style={
                    isEmph
                      ? {
                          color,
                          borderColor: `${color}88`,
                          backgroundColor: `${color}1C`,
                        }
                      : undefined
                  }
                  className={`px-2 py-0.5 text-[11px] rounded border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isEmph
                      ? 'font-bold'
                      : 'bg-[#171A21] border-white/10 text-[#D5D9E2] hover:border-white/30 hover:text-white'
                  }`}
                >
                  {tok.word}
                </button>
              );
            })}
          </div>

          {onOpenCueEditor && (
            <button
              type="button"
              onClick={() => onOpenCueEditor(stageCue.id)}
              title="Mở bảng tùy chỉnh màu & cỡ chữ câu này"
              className="px-2 py-1 text-[10px] font-medium text-[#9BA3B4] hover:text-white bg-[#171A21] hover:bg-[#20242E] border border-white/10 rounded flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3 text-[#FF5A1F]" />
              <span className="hidden sm:inline">Tùy chỉnh</span>
            </button>
          )}
        </div>
      )}

      {/* Docked Transport Bar */}
      {!isFullscreen && (
        <div className="h-12 px-2 sm:px-3 lg:px-4 bg-[#111318] border-t border-white/8 flex items-center justify-between gap-1 sm:gap-2 lg:gap-4 shrink-0 min-w-0">
          <div className="flex items-center gap-1 lg:gap-2 font-mono-tabular text-[11px] lg:text-xs shrink-0">
            <span className="text-[#F4F5F7] font-semibold">
              {formatTimecodeShort(currentTimeSec)}
            </span>
            <span className="hidden sm:inline text-[#5B6270]">/</span>
            <span className="hidden sm:inline text-[#8E95A5]">
              {formatTimecodeShort(totalDurationSec)}
            </span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onStepFrame(-1)}
              title="Lùi 1 frame"
              className="min-h-[36px] min-w-[32px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center text-[#9BA3B4] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              title="Phát / Tạm dừng (Space)"
              className="w-9 h-8 sm:w-10 sm:h-9 bg-[#FF5A1F] hover:bg-[#E84D14] text-white rounded-md flex items-center justify-center transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => onStepFrame(1)}
              title="Tới 1 frame"
              className="min-h-[36px] min-w-[32px] sm:min-h-[40px] sm:min-w-[40px] flex items-center justify-center text-[#9BA3B4] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
            {isVerticalRatio && (
              <>
                <button
                  type="button"
                  onClick={handleCenterTikTokSafeZone}
                  title="Định tâm chữ vào giữa vùng an toàn TikTok (T)"
                  className="px-1.5 sm:px-2 min-h-[34px] sm:min-h-[36px] text-xs font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap bg-[#38BDF8]/12 hover:bg-[#38BDF8]/22 text-[#38BDF8] border border-[#38BDF8]/30"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">Tâm Safe</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!showGuides) toggleGuides();
                    setShowSocialSafe((v) => !v);
                  }}
                  title="Hiện vùng bị che bởi nút TikTok / Reels / Shorts"
                  className={`px-1.5 sm:px-2 min-h-[34px] sm:min-h-[36px] text-xs font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                    showGuides && showSocialSafe
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">TikTok Safe</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={toggleGuides}
              title="Bật/tắt khung lưới an toàn (G)"
              className={`px-1.5 sm:px-2 lg:px-2.5 min-h-[34px] sm:min-h-[36px] text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                showGuides
                  ? 'bg-white/10 text-[#F4F5F7]'
                  : 'text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lưới an toàn</span>
            </button>

            <button
              type="button"
              onClick={onToggleLoop}
              title="Lặp lại (L)"
              className={`min-h-[34px] min-w-[30px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center rounded-md transition-colors cursor-pointer ${
                isLooping
                  ? 'bg-white/10 text-[#FF5A1F]'
                  : 'text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5'
              }`}
            >
              <Repeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'}
              className="min-h-[34px] min-w-[30px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>

            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                title="Xem toàn màn hình tối ưu (F hoặc chạm đúp)"
                aria-label="Xem toàn màn hình"
                className="min-h-[34px] min-w-[32px] sm:min-h-[36px] sm:min-w-[36px] flex items-center justify-center text-[#D5D9E2] hover:text-white bg-white/8 hover:bg-white/15 rounded-md transition-colors cursor-pointer shrink-0"
              >
                <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
