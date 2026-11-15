import React, { useEffect, useRef, useState } from 'react';
import { SubtitleCue } from '../types/studio';
import { formatTimecodeShort } from '../utils/srtParser';

interface TimelineDockProps {
  cues: SubtitleCue[];
  selectedCueId: string | null;
  currentTimeSec: number;
  totalDurationSec: number;
  waveformPeaks: Float32Array | null;
  onSeek: (timeSec: number) => void;
  onSelectCue: (cueId: string) => void;
  onUpdateCueTiming: (cueId: string, startSec: number, endSec: number) => void;
  className?: string;
}

export const TimelineDock: React.FC<TimelineDockProps> = ({
  cues,
  selectedCueId,
  currentTimeSec,
  totalDurationSec,
  waveformPeaks,
  onSeek,
  onSelectCue,
  onUpdateCueTiming,
  className = '',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [dragCue, setDragCue] = useState<{
    cueId: string;
    mode: 'move' | 'start' | 'end';
    originX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const safeDur = Math.max(1, totalDurationSec);

  // Draw audio waveform on canvas
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    const container = trackRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = 48;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!waveformPeaks || waveformPeaks.length === 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      return;
    }

    const barCount = Math.min(width / 2.5, waveformPeaks.length);
    const step = width / barCount;
    const midY = height / 2;

    for (let i = 0; i < barCount; i++) {
      const peakIdx = Math.floor((i / barCount) * waveformPeaks.length);
      const amp = waveformPeaks[peakIdx] || 0;
      const barH = Math.max(2, amp * (height - 6));
      const x = i * step;
      const timeAtBar = (i / barCount) * safeDur;
      ctx.fillStyle = timeAtBar <= currentTimeSec ? 'rgba(255, 90, 31, 0.72)' : 'rgba(148, 163, 184, 0.35)';
      ctx.fillRect(x, midY - barH / 2, Math.max(1.5, step - 1), barH);
    }
  }, [waveformPeaks, currentTimeSec, safeDur]);

  const timeFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return norm * safeDur;
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragCue) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubbing(true);
    onSeek(timeFromClientX(e.clientX));
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragCue) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const deltaSec = ((e.clientX - dragCue.originX) / rect.width) * safeDur;
      const dur = dragCue.origEnd - dragCue.origStart;

      if (dragCue.mode === 'move') {
        const nextStart = Math.max(0, Math.min(safeDur - dur, dragCue.origStart + deltaSec));
        onUpdateCueTiming(dragCue.cueId, nextStart, nextStart + dur);
      } else if (dragCue.mode === 'start') {
        const nextStart = Math.max(0, Math.min(dragCue.origEnd - 0.2, dragCue.origStart + deltaSec));
        onUpdateCueTiming(dragCue.cueId, nextStart, dragCue.origEnd);
      } else if (dragCue.mode === 'end') {
        const nextEnd = Math.min(safeDur, Math.max(dragCue.origStart + 0.2, dragCue.origEnd + deltaSec));
        onUpdateCueTiming(dragCue.cueId, dragCue.origStart, nextEnd);
      }
      return;
    }

    if (scrubbing) {
      onSeek(timeFromClientX(e.clientX));
    }
  };

  const handleTrackPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbing) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      setScrubbing(false);
    }
    if (dragCue) {
      setDragCue(null);
    }
  };

  // Generate ruler ticks
  const tickStep = safeDur > 60 ? 10 : safeDur > 20 ? 5 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= safeDur; t += tickStep) {
    ticks.push(t);
  }

  const playheadPct = Math.max(0, Math.min(100, (currentTimeSec / safeDur) * 100));

  return (
    <footer
      className={`h-44 lg:h-36 bg-[#111318] lg:border-t border-white/8 px-3 lg:px-4 py-2.5 flex flex-col justify-between shrink-0 select-none ${className}`}
    >
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={handleTrackPointerUp}
        onPointerCancel={handleTrackPointerUp}
        className="relative flex-1 flex flex-col justify-between cursor-pointer touch-none"
      >
        {/* Time Ruler */}
        <div className="h-5 relative border-b border-white/8 text-[10px] font-mono-tabular text-[#6F7685]">
          {ticks.map((t) => (
            <div
              key={t}
              style={{ left: `${(t / safeDur) * 100}%` }}
              className="absolute top-0 flex flex-col items-start -translate-x-0.5 pointer-events-none"
            >
              <span className="leading-none">{formatTimecodeShort(t)}</span>
              <span className="w-px h-1.5 bg-white/15 mt-0.5" />
            </div>
          ))}
        </div>

        {/* Subtitle Cue Blocks Track */}
        <div className="h-10 relative my-1 bg-[#16181F] rounded border border-white/6 overflow-hidden">
          {cues.map((cue, idx) => {
            const leftPct = (cue.startSec / safeDur) * 100;
            const widthPct = Math.max(0.8, ((cue.endSec - cue.startSec) / safeDur) * 100);
            const isSelected = cue.id === selectedCueId;
            return (
              <div
                key={cue.id}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectCue(cue.id);
                  trackRef.current?.setPointerCapture(e.pointerId);
                  setDragCue({
                    cueId: cue.id,
                    mode: 'move',
                    originX: e.clientX,
                    origStart: cue.startSec,
                    origEnd: cue.endSec,
                  });
                }}
                className={`absolute top-1 bottom-1 rounded text-[11px] px-2 flex items-center overflow-hidden transition-colors cursor-grab active:cursor-grabbing ${
                  isSelected
                    ? 'bg-[#FF5A1F]/25 border border-[#FF5A1F] text-white z-10'
                    : 'bg-[#232733] border border-white/12 text-[#D5D9E2] hover:bg-[#2B303E]'
                }`}
              >
                {/* Left trim handle */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectCue(cue.id);
                    trackRef.current?.setPointerCapture(e.pointerId);
                    setDragCue({
                      cueId: cue.id,
                      mode: 'start',
                      originX: e.clientX,
                      origStart: cue.startSec,
                      origEnd: cue.endSec,
                    });
                  }}
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[#FF5A1F]"
                />
                <span className="truncate pointer-events-none">
                  <span className="font-mono-tabular text-[10px] opacity-60 mr-1">
                    {idx + 1}.
                  </span>
                  {cue.text.replace(/\n/g, ' / ')}
                </span>
                {/* Right trim handle */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelectCue(cue.id);
                    trackRef.current?.setPointerCapture(e.pointerId);
                    setDragCue({
                      cueId: cue.id,
                      mode: 'end',
                      originX: e.clientX,
                      origStart: cue.startSec,
                      origEnd: cue.endSec,
                    });
                  }}
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-[#FF5A1F]"
                />
              </div>
            );
          })}
        </div>

        {/* Audio Waveform Track */}
        <div className="h-12 relative bg-[#0E1015] rounded border border-white/6 overflow-hidden">
          <canvas ref={waveCanvasRef} className="w-full h-full block" />
        </div>

        {/* Playhead Scrubber */}
        <div
          style={{ left: `${playheadPct}%` }}
          className="absolute top-0 bottom-0 w-px bg-[#FF5A1F] pointer-events-none z-20"
        >
          <div className="w-2.5 h-2.5 bg-[#FF5A1F] -translate-x-[4.5px] rounded-xs rotate-45 -mt-0.5" />
        </div>
      </div>
    </footer>
  );
};
