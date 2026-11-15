import React, { useEffect, useRef, useState } from 'react';
import {
  Grid,
  Move,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ASPECT_RATIOS, StudioProject } from '../types/studio';
import { renderKineticScene, RenderedCueBounds } from '../engine/kineticRenderer';
import { formatTimecodeShort } from '../utils/srtParser';

interface PreviewStageProps {
  project: StudioProject;
  currentTimeSec: number;
  totalDurationSec: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMuted: boolean;
  audioEnergy: number;
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
}

export const PreviewStage: React.FC<PreviewStageProps> = ({
  project,
  currentTimeSec,
  totalDurationSec,
  isPlaying,
  isLooping,
  isMuted,
  audioEnergy,
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastBoundsRef = useRef<RenderedCueBounds | null>(null);

  const [showGuides, setShowGuides] = useState(true);
  const [dragState, setDragState] = useState<{
    startX: number;
    startY: number;
    origPosX: number;
    origPosY: number;
    cueId: string | null;
  } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 450 });

  const aspect = ASPECT_RATIOS[project.aspectRatio];

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
      project,
      audioEnergy,
      bgVideo: bgVideoElement,
      bgVideoSecondary,
      bgVideoBlendAlpha,
      showSafeGuides: showGuides,
      selectedCueId,
    });
    lastBoundsRef.current = bounds;
  }, [
    project,
    aspect.ratio,
    currentTimeSec,
    audioEnergy,
    bgVideoElement,
    bgVideoSecondary,
    bgVideoBlendAlpha,
    showGuides,
    selectedCueId,
    displayW,
    displayH,
  ]);

  // Pointer drag-to-position directly on canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const activeCue = project.cues.find(
      (c) => currentTimeSec >= c.startSec && currentTimeSec <= c.endSec
    );
    const targetCue = activeCue || project.cues.find((c) => c.id === selectedCueId) || null;
    const origPosX = targetCue?.customPos?.x ?? project.typography.posX;
    const origPosY = targetCue?.customPos?.y ?? project.typography.posY;

    canvas.setPointerCapture(e.pointerId);
    setDragState({
      startX: e.clientX,
      startY: e.clientY,
      origPosX,
      origPosY,
      cueId: targetCue ? targetCue.id : null,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    const dxNorm = (e.clientX - dragState.startX) / Math.max(1, displayW);
    const dyNorm = (e.clientY - dragState.startY) / Math.max(1, displayH);

    const nextX = Math.max(0.05, Math.min(0.95, dragState.origPosX + dxNorm));
    const nextY = Math.max(0.05, Math.min(0.95, dragState.origPosY + dyNorm));

    // If active cue already has custom position, update cue; otherwise update global or cue
    if (dragState.cueId && project.cues.find((c) => c.id === dragState.cueId)?.customPos) {
      onUpdateCuePosition(dragState.cueId, nextX, nextY);
    } else {
      onUpdateGlobalPosition(nextX, nextY);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState) return;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    setDragState(null);
  };

  return (
    <section className="h-[34vh] min-h-[210px] lg:h-auto lg:flex-1 bg-[#0B0C0F] flex flex-col min-w-0 shrink-0 lg:shrink border-b lg:border-b-0 border-white/8">
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

          <div className="hidden sm:flex absolute bottom-2.5 right-3 pointer-events-none items-center gap-1.5 text-[11px] text-white/50 bg-black/40 px-2 py-0.5 rounded">
            <Move className="w-3 h-3" />
            <span>Kéo chữ để đổi vị trí</span>
          </div>
        </div>
      </div>

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
