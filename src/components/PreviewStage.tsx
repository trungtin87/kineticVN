import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Grid,
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
import { renderKineticScene, RenderedCueBounds } from '../engine/kineticRenderer';
import { formatTimecodeShort, tokenizeCueText } from '../utils/srtParser';

interface PreviewStageProps {
  project: StudioProject;
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
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onUpdateCuePosition: (cueId: string, posX: number, posY: number) => void;
  onUpdateGlobalPosition: (posX: number, posY: number) => void;
  onQuickToggleWord?: (cueId: string, wordIdx: number) => void;
  onQuickSelectCue?: (cueId: string) => void;
  onOpenCueEditor?: (cueId: string) => void;
}

export const PreviewStage: React.FC<PreviewStageProps> = ({
  project,
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
  onToggleLoop,
  onToggleMute,
  onUpdateCuePosition,
  onUpdateGlobalPosition,
  onQuickToggleWord,
  onQuickSelectCue,
  onOpenCueEditor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBoundsRef = useRef<RenderedCueBounds | null>(null);

  const [showGuides, setShowGuides] = useState(true);
  const [showSocialSafe, setShowSocialSafe] = useState(true);
  const [dragCueOnly, setDragCueOnly] = useState(false);
  const [snapActive, setSnapActive] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
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
  }, []);

  // Compute fitted display box inside available center stage
  const pad = containerSize.w < 500 ? 12 : 28;
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
    const renderScale = Math.min(4, Math.max(dpr, 540 / minSide));
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
      showSafeGuides: showGuides,
      showSocialSafeZones: showGuides && showSocialSafe && isVerticalRatio,
      selectedCueId,
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
    showGuides,
    showSocialSafe,
    isVerticalRatio,
    selectedCueId,
    displayW,
    displayH,
  ]);

  // Pointer drag-to-position directly on canvas with snap-to-center guides
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

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
    const dxNorm = (e.clientX - dragState.startX) / Math.max(1, displayW);
    const dyNorm = (e.clientY - dragState.startY) / Math.max(1, displayH);

    let nextX = Math.max(0.05, Math.min(0.95, dragState.origPosX + dxNorm));
    let nextY = Math.max(0.05, Math.min(0.95, dragState.origPosY + dyNorm));

    const snapX = Math.abs(nextX - 0.5) < 0.018;
    const snapY = Math.abs(nextY - 0.5) < 0.018;
    if (snapX) nextX = 0.5;
    if (snapY) nextY = 0.5;
    setSnapActive({ x: snapX, y: snapY });

    if (dragState.forCueOnly && dragState.cueId) {
      onUpdateCuePosition(dragState.cueId, Number(nextX.toFixed(3)), Number(nextY.toFixed(3)));
    } else {
      onUpdateGlobalPosition(Number(nextX.toFixed(3)), Number(nextY.toFixed(3)));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    setDragState(null);
    setSnapActive({ x: false, y: false });
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

  return (
    <section className="h-[38vh] min-h-[235px] lg:h-auto lg:flex-1 bg-[#0B0C0F] flex flex-col min-w-0 shrink-0 lg:shrink border-b lg:border-b-0 border-white/8">
      {/* Canvas Stage */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0"
      >
        <div
          style={{ width: `${Math.round(displayW)}px`, height: `${Math.round(displayH)}px` }}
          className={`relative rounded-md overflow-hidden border border-white/12 shadow-2xl ${
            project.background.mode === 'transparent' ? 'alpha-checkerboard' : 'bg-black'
          }`}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full h-full block cursor-move touch-none"
          />

          {/* Snap-to-center alignment overlay during drag */}
          {dragState && snapActive.x && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#FF5A1F] pointer-events-none shadow-[0_0_8px_#FF5A1F]" />
          )}
          {dragState && snapActive.y && (
            <div className="absolute left-0 right-0 top-1/2 h-px bg-[#FF5A1F] pointer-events-none shadow-[0_0_8px_#FF5A1F]" />
          )}

          {/* Subtle corner resolution indicator */}
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
        </div>
      </div>

      {/* Inline Quick Word-Emphasis & Cue Stepper Bar (no tab switching needed!) */}
      {stageCue && onQuickToggleWord && (
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

      {/* Transport Bar */}
      <div className="h-12 px-3 lg:px-4 bg-[#111318] border-t border-white/8 flex items-center justify-between gap-2 lg:gap-4 shrink-0">
        <div className="flex items-center gap-1.5 lg:gap-3 font-mono-tabular text-[11px] lg:text-xs">
          <span className="text-[#F4F5F7] font-semibold">
            {formatTimecodeShort(currentTimeSec)}
          </span>
          <span className="text-[#5B6270]">/</span>
          <span className="text-[#8E95A5]">{formatTimecodeShort(totalDurationSec)}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onStepFrame(-1)}
            title="Lùi 1 frame"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#9BA3B4] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title="Phát / Tạm dừng (Space)"
            className="w-10 h-9 bg-[#FF5A1F] hover:bg-[#E84D14] text-white rounded-md flex items-center justify-center transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(1)}
            title="Tới 1 frame"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#9BA3B4] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {isVerticalRatio && (
            <button
              type="button"
              onClick={() => {
                setShowGuides(true);
                setShowSocialSafe((v) => !v);
              }}
              title="Hiện vùng bị che bởi nút TikTok / Reels / Shorts"
              className={`px-2 min-h-[36px] text-xs font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                showGuides && showSocialSafe
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="hidden md:inline">TikTok Safe</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGuides((v) => !v)}
            title="Bật/tắt khung lưới an toàn"
            className={`px-2 lg:px-2.5 min-h-[36px] text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
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
            title="Lặp lại"
            className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors cursor-pointer ${
              isLooping
                ? 'bg-white/10 text-[#FF5A1F]'
                : 'text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            title={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-[#8E95A5] hover:text-[#F4F5F7] hover:bg-white/5 rounded-md transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </section>
  );
};

