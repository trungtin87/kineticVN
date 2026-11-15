import {
  AnimationPresetId,
  BackgroundConfig,
  EffectsConfig,
  EmphasisStyle,
  MotionConfig,
  StudioProject,
  SubtitleCue,
  TextTransformMode,
  TypographyConfig,
} from '../types/studio';
import { tokenizeCueText } from '../utils/srtParser';

export interface RenderOptions {
  width: number;
  height: number;
  timeSec: number;
  project: StudioProject;
  audioEnergy: number;
  bgVideo?: HTMLVideoElement | null;
  bgVideoSecondary?: HTMLVideoElement | null;
  bgVideoBlendAlpha?: number;
  forceTransparentBg?: boolean;
  skipPostFx?: boolean;
  showSafeGuides?: boolean;
  selectedCueId?: string | null;
}

export interface RenderedCueBounds {
  cueId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t: number, overshoot = 1.65): number {
  const x = clamp01(t);
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function hashFloat(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  if (clean.length >= 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16) || 0,
      g: parseInt(clean.slice(2, 4), 16) || 0,
      b: parseInt(clean.slice(4, 6), 16) || 0,
    };
  }
  return { r: 255, g: 90, b: 31 };
}

function rgbaStr(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha)})`;
}

function getContrastInk(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.58 ? '#0B0C0F' : '#FFFFFF';
}

function applyTextTransform(word: string, mode: TextTransformMode): string {
  if (mode === 'uppercase') return word.toLocaleUpperCase('vi-VN');
  if (mode === 'titlecase') {
    return word.charAt(0).toLocaleUpperCase('vi-VN') + word.slice(1);
  }
  return word;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function renderDynamicBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSec: number,
  bg: BackgroundConfig,
  audioEnergy: number,
  bgVideo?: HTMLVideoElement | null,
  bgVideoSecondary?: HTMLVideoElement | null,
  bgVideoBlendAlpha = 0
) {
  if (bg.mode === 'transparent') {
    ctx.clearRect(0, 0, width, height);
    return;
  }

  if (bg.mode === 'solid') {
    ctx.fillStyle = bg.solidColor;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (bg.mode === 'video' && bgVideo && bgVideo.readyState >= 2) {
    const drawCoverVideo = (vid: HTMLVideoElement, alpha: number) => {
      const vw = vid.videoWidth || width;
      const vh = vid.videoHeight || height;
      const scale = Math.max(width / vw, height / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;

      ctx.save();
      ctx.globalAlpha = clamp01(alpha);
      if (bg.videoBlur > 0.2) {
        ctx.filter = `blur(${(bg.videoBlur * (Math.min(width, height) / 1080)).toFixed(1)}px)`;
      }
      ctx.drawImage(vid, dx, dy, dw, dh);
      ctx.restore();
    };

    const blend = clamp01(bgVideoBlendAlpha);
    drawCoverVideo(bgVideo, 1);
    if (bgVideoSecondary && bgVideoSecondary.readyState >= 2 && blend > 0.005) {
      drawCoverVideo(bgVideoSecondary, blend);
    }

    if (bg.videoDimmer > 0.01) {
      ctx.fillStyle = `rgba(0, 0, 0, ${clamp01(bg.videoDimmer)})`;
      ctx.fillRect(0, 0, width, height);
    }
    return;
  }

  // Procedural dynamic presets
  const t = timeSec * bg.speed;
  const energyBoost = bg.audioReactive ? audioEnergy * 0.35 * bg.intensity : 0;

  ctx.fillStyle = bg.primaryColor;
  ctx.fillRect(0, 0, width, height);

  if (bg.presetId === 'aurora') {
    const blobs = [
      {
        cx: width * (0.28 + 0.18 * Math.sin(t * 0.42)),
        cy: height * (0.35 + 0.16 * Math.cos(t * 0.31)),
        r: Math.max(width, height) * (0.55 + energyBoost * 0.25),
        color: bg.secondaryColor,
        alpha: 0.72,
      },
      {
        cx: width * (0.72 + 0.16 * Math.cos(t * 0.37)),
        cy: height * (0.62 + 0.18 * Math.sin(t * 0.49)),
        r: Math.max(width, height) * (0.48 + energyBoost * 0.3),
        color: bg.accentColor,
        alpha: 0.28 * bg.intensity + energyBoost * 0.2,
      },
      {
        cx: width * (0.5 + 0.22 * Math.sin(t * 0.23 + 2)),
        cy: height * (0.25 + 0.2 * Math.cos(t * 0.28 + 1)),
        r: Math.max(width, height) * 0.44,
        color: bg.secondaryColor,
        alpha: 0.55,
      },
    ];

    for (const blob of blobs) {
      const grad = ctx.createRadialGradient(blob.cx, blob.cy, 0, blob.cx, blob.cy, blob.r);
      grad.addColorStop(0, rgbaStr(blob.color, blob.alpha));
      grad.addColorStop(1, rgbaStr(blob.color, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
  } else if (bg.presetId === 'kineticGrid') {
    const horizonY = height * 0.44;
    // Sky glow
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, bg.primaryColor);
    skyGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY);

    // Horizon line glow
    const glow = ctx.createRadialGradient(width / 2, horizonY, 0, width / 2, horizonY, width * 0.6);
    glow.addColorStop(0, rgbaStr(bg.accentColor, 0.35 * bg.intensity + energyBoost * 0.35));
    glow.addColorStop(1, rgbaStr(bg.accentColor, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = rgbaStr(bg.accentColor, 0.35 * bg.intensity + energyBoost * 0.25);
    ctx.lineWidth = Math.max(1, width / 960);

    // Perspective vertical lines
    const numCols = 18;
    for (let i = -numCols; i <= numCols; i++) {
      const topX = width / 2 + i * (width * 0.03);
      const botX = width / 2 + i * (width * 0.22);
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(botX, height);
      ctx.stroke();
    }

    // Scrolling horizontal perspective lines
    const numRows = 14;
    const scrollOffset = (t * 0.85) % 1;
    for (let r = 0; r < numRows; r++) {
      const norm = (r + scrollOffset) / numRows;
      const eased = Math.pow(norm, 2.2);
      const y = horizonY + eased * (height - horizonY);
      ctx.globalAlpha = clamp01(eased * 1.4) * clamp01(0.45 * bg.intensity + energyBoost * 0.3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  } else if (bg.presetId === 'particles') {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, bg.primaryColor);
    bgGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const count = 72;
    const minDim = Math.min(width, height);
    for (let i = 0; i < count; i++) {
      const seedX = hashFloat(i * 3.1);
      const seedY = hashFloat(i * 7.3);
      const speedY = 0.04 + hashFloat(i * 11.7) * 0.09;
      const size = (0.004 + hashFloat(i * 19.3) * 0.022) * minDim * (1 + energyBoost * 0.6);

      const x = ((seedX + Math.sin(t * 0.3 + i) * 0.03) % 1) * width;
      const y = ((seedY - t * speedY + 100) % 1) * height;
      const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.8 + i * 2.1));
      const color = i % 3 === 0 ? bg.accentColor : '#FFFFFF';
      const alpha = twinkle * (0.14 + 0.28 * bg.intensity);

      const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, rgbaStr(color, alpha));
      grad.addColorStop(1, rgbaStr(color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (bg.presetId === 'radialPulse') {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(width, height) * 0.58;

    const baseGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    baseGrad.addColorStop(0, bg.secondaryColor);
    baseGrad.addColorStop(1, bg.primaryColor);
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, width, height);

    const ringCount = 7;
    for (let i = 0; i < ringCount; i++) {
      const phase = ((t * 0.32 + i / ringCount) % 1);
      const radius = phase * maxR * (1 + energyBoost * 0.16);
      const alpha = (1 - phase) * (0.38 * bg.intensity + energyBoost * 0.35);

      ctx.strokeStyle = rgbaStr(bg.accentColor, alpha);
      ctx.lineWidth = Math.max(1.5, (width / 640) * (1 - phase * 0.5) * (1 + energyBoost * 2));
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (bg.presetId === 'filmWash') {
    const angle = t * 0.18;
    const x1 = width * (0.5 + 0.4 * Math.cos(angle));
    const y1 = height * (0.5 + 0.4 * Math.sin(angle));
    const grad = ctx.createRadialGradient(x1, y1, 0, width / 2, height / 2, Math.max(width, height) * 0.9);
    grad.addColorStop(0, bg.secondaryColor);
    grad.addColorStop(0.55, bg.primaryColor);
    grad.addColorStop(1, '#050608');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Warm/accent flare edge
    const flare = ctx.createRadialGradient(
      width * 0.15,
      height * 0.85,
      0,
      width * 0.15,
      height * 0.85,
      Math.max(width, height) * 0.55
    );
    flare.addColorStop(0, rgbaStr(bg.accentColor, 0.22 * bg.intensity + energyBoost * 0.18));
    flare.addColorStop(1, rgbaStr(bg.accentColor, 0));
    ctx.fillStyle = flare;
    ctx.fillRect(0, 0, width, height);

    // Deterministic animated film specks/grain
    const speckCount = 160;
    const frameStep = Math.floor(timeSec * 24);
    for (let i = 0; i < speckCount; i++) {
      const sx = hashFloat(i * 1.9 + frameStep * 7.1) * width;
      const sy = hashFloat(i * 4.3 + frameStep * 13.7) * height;
      const alpha = hashFloat(i + frameStep) * 0.09 * bg.intensity;
      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.fillRect(sx, sy, Math.max(1.5, width / 900), Math.max(1.5, width / 900));
    }
  } else if (bg.presetId === 'diagonalStripes') {
    ctx.fillStyle = bg.primaryColor;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6);
    const diag = Math.hypot(width, height) * 1.2;
    const stripeWidth = Math.max(40, width * 0.065);
    const gap = stripeWidth * 2;
    const offset = (t * stripeWidth * 1.4) % gap;

    for (let x = -diag; x < diag; x += gap) {
      ctx.fillStyle = bg.secondaryColor;
      ctx.fillRect(x + offset, -diag, stripeWidth, diag * 2);
    }

    // Accent sweeping beam
    const beamX = (((t * 0.22) % 1) * 2 - 1) * diag;
    const beamGrad = ctx.createLinearGradient(beamX - stripeWidth * 2, 0, beamX + stripeWidth * 2, 0);
    beamGrad.addColorStop(0, rgbaStr(bg.accentColor, 0));
    beamGrad.addColorStop(0.5, rgbaStr(bg.accentColor, 0.28 * bg.intensity + energyBoost * 0.25));
    beamGrad.addColorStop(1, rgbaStr(bg.accentColor, 0));
    ctx.fillStyle = beamGrad;
    ctx.fillRect(beamX - stripeWidth * 2, -diag, stripeWidth * 4, diag * 2);
    ctx.restore();
  } else if (bg.presetId === 'midnightInk') {
    ctx.fillStyle = bg.primaryColor;
    ctx.fillRect(0, 0, width, height);

    const layers = 4;
    for (let l = 0; l < layers; l++) {
      ctx.beginPath();
      const baseY = height * (0.38 + l * 0.14);
      ctx.moveTo(0, height);
      ctx.lineTo(0, baseY);
      const steps = 16;
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * width;
        const wave =
          Math.sin(s * 0.55 + t * (0.6 + l * 0.15) + l * 1.7) *
          (height * 0.06 * bg.intensity * (1 + energyBoost));
        ctx.lineTo(x, baseY + wave);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle =
        l === layers - 1
          ? rgbaStr(bg.accentColor, 0.12 * bg.intensity + energyBoost * 0.15)
          : rgbaStr(bg.secondaryColor, 0.28 + l * 0.12);
      ctx.fill();
    }
  } else if (bg.presetId === 'neonTunnel') {
    const cx = width / 2;
    const cy = height / 2;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) * 0.65);
    bgGrad.addColorStop(0, bg.secondaryColor);
    bgGrad.addColorStop(1, bg.primaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const ringCount = 12;
    for (let i = 0; i < ringCount; i++) {
      const z = (i / ringCount + t * 0.38) % 1;
      const scale = Math.pow(z, 1.85) * (1 + energyBoost * 0.12);
      const rw = width * 1.15 * scale;
      const rh = height * 1.15 * scale;
      const alpha = Math.sin(z * Math.PI) * clamp01(0.55 * bg.intensity + energyBoost * 0.35);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(t * 0.3 + z * 1.5) * 0.08);
      ctx.strokeStyle = rgbaStr(bg.accentColor, alpha);
      ctx.lineWidth = Math.max(1.5, Math.min(width, height) * 0.005 * (0.4 + z));
      ctx.shadowColor = rgbaStr(bg.accentColor, alpha * 0.9);
      ctx.shadowBlur = 18 * z;
      drawRoundedRect(ctx, -rw / 2, -rh / 2, rw, rh, Math.min(rw, rh) * 0.08);
      ctx.stroke();
      ctx.restore();
    }
  } else if (bg.presetId === 'starfieldWarp') {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(width, height) * 0.65;
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    bgGrad.addColorStop(0, bg.secondaryColor);
    bgGrad.addColorStop(1, bg.primaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const starCount = 110;
    const minDim = Math.min(width, height);
    for (let i = 0; i < starCount; i++) {
      const angle = hashFloat(i * 4.7) * Math.PI * 2;
      const speedMul = 0.45 + hashFloat(i * 9.3) * 0.85;
      const z = (hashFloat(i * 13.1) + t * 0.45 * speedMul) % 1;
      const zPrev = Math.max(0.01, z - 0.055 * (1 + energyBoost * 1.4));
      const r1 = Math.pow(zPrev, 2.1) * maxR;
      const r2 = Math.pow(z, 2.1) * maxR;
      const x1 = cx + Math.cos(angle) * r1;
      const y1 = cy + Math.sin(angle) * r1;
      const x2 = cx + Math.cos(angle) * r2;
      const y2 = cy + Math.sin(angle) * r2;

      const color = i % 4 === 0 ? bg.accentColor : '#FFFFFF';
      const alpha = clamp01(z * 1.2) * clamp01(0.35 + 0.55 * bg.intensity);
      ctx.strokeStyle = rgbaStr(color, alpha);
      ctx.lineWidth = Math.max(1, (0.0018 + z * 0.0035) * minDim);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  } else if (bg.presetId === 'matrixRain') {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, bg.primaryColor);
    bgGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const cols = 38;
    const colW = width / cols;
    for (let c = 0; c < cols; c++) {
      const speedMul = 0.32 + hashFloat(c * 5.9) * 0.65;
      const phase = hashFloat(c * 11.3);
      const headY = ((phase + t * 0.45 * speedMul) % 1.35) * height - height * 0.15;
      const tailLen = height * (0.18 + hashFloat(c * 17.1) * 0.28);
      const x = (c + 0.5) * colW;
      const alpha = (0.25 + 0.55 * bg.intensity) * (0.7 + energyBoost * 0.4);

      const grad = ctx.createLinearGradient(x, headY - tailLen, x, headY);
      grad.addColorStop(0, rgbaStr(bg.accentColor, 0));
      grad.addColorStop(0.75, rgbaStr(bg.accentColor, alpha * 0.65));
      grad.addColorStop(1, '#FFFFFF');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(1.5, colW * 0.16);
      ctx.beginPath();
      ctx.moveTo(x, headY - tailLen);
      ctx.lineTo(x, headY);
      ctx.stroke();

      ctx.fillStyle = rgbaStr('#FFFFFF', clamp01(alpha));
      ctx.beginPath();
      ctx.arc(x, headY, Math.max(1.5, colW * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (bg.presetId === 'sunsetSynth') {
    const horizonY = height * 0.56;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, bg.primaryColor);
    skyGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, horizonY);

    // Synthwave segmented sun
    const sunR = Math.min(width, height) * (0.22 + energyBoost * 0.03);
    const sunCx = width / 2;
    const sunCy = horizonY - sunR * 0.18;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2);
    ctx.clip();
    const sunGrad = ctx.createLinearGradient(0, sunCy - sunR, 0, sunCy + sunR);
    sunGrad.addColorStop(0, '#FDE047');
    sunGrad.addColorStop(0.55, bg.accentColor);
    sunGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunCx - sunR, sunCy - sunR, sunR * 2, sunR * 2);

    // Horizontal cut slices moving down the sun
    const sliceOffset = (t * 0.3) % 1;
    ctx.fillStyle = bg.secondaryColor;
    for (let s = 0; s < 6; s++) {
      const norm = (s + sliceOffset) / 6;
      const sy = sunCy + norm * sunR;
      const sh = sunR * 0.035 * (0.4 + norm * 1.4);
      ctx.fillRect(sunCx - sunR, sy, sunR * 2, sh);
    }
    ctx.restore();

    // Water / grid reflection below horizon
    const floorGrad = ctx.createLinearGradient(0, horizonY, 0, height);
    floorGrad.addColorStop(0, bg.secondaryColor);
    floorGrad.addColorStop(1, bg.primaryColor);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizonY, width, height - horizonY);

    const reflBars = 24;
    for (let b = 0; b < reflBars; b++) {
      const p = b / reflBars;
      const y = horizonY + Math.pow(p, 1.7) * (height - horizonY);
      const shimmer = 0.5 + 0.5 * Math.sin(t * 3 + b * 0.9);
      const bw = sunR * (2.2 - p * 1.2) * (0.65 + 0.35 * shimmer);
      ctx.fillStyle = rgbaStr(bg.accentColor, (1 - p * 0.6) * 0.25 * bg.intensity * shimmer);
      ctx.fillRect(width / 2 - bw / 2, y, bw, Math.max(2, height * 0.008));
    }
  } else if (bg.presetId === 'prismShards') {
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, bg.primaryColor);
    bgGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const shardCount = 24;
    const minDim = Math.min(width, height);
    for (let i = 0; i < shardCount; i++) {
      const bx = hashFloat(i * 2.3) * width;
      const by = ((hashFloat(i * 6.7) - t * (0.04 + hashFloat(i * 3.9) * 0.06) + 100) % 1.2 - 0.1) * height;
      const size = (0.045 + hashFloat(i * 12.1) * 0.09) * minDim * (1 + energyBoost * 0.2);
      const angle = hashFloat(i * 8.1) * Math.PI * 2 + t * (0.25 + hashFloat(i * 15.7) * 0.45);
      const alpha = (0.08 + 0.18 * hashFloat(i * 4.1)) * bg.intensity;

      ctx.save();
      ctx.translate(bx + Math.sin(t * 0.5 + i) * minDim * 0.03, by);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.85, size * 0.65);
      ctx.lineTo(-size * 0.75, size * 0.45);
      ctx.closePath();
      ctx.fillStyle = rgbaStr(i % 2 === 0 ? bg.accentColor : '#FFFFFF', alpha);
      ctx.fill();
      ctx.strokeStyle = rgbaStr(i % 2 === 0 ? bg.accentColor : '#FFFFFF', alpha * 1.8);
      ctx.lineWidth = Math.max(1, minDim * 0.002);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // audioBars (Spectrum Bars)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, bg.primaryColor);
    bgGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const barCount = 44;
    const gap = width / barCount;
    const barW = gap * 0.58;
    const centerY = height * 0.5;
    const maxBarH = height * 0.36 * clamp01(0.4 + 0.6 * bg.intensity);

    for (let i = 0; i < barCount; i++) {
      const distCenter = Math.abs(i - (barCount - 1) / 2) / (barCount / 2);
      const wave1 = 0.5 + 0.5 * Math.sin(t * 4.5 + i * 0.42);
      const wave2 = 0.5 + 0.5 * Math.cos(t * 2.7 - i * 0.25);
      const env = (0.22 + 0.78 * (1 - distCenter * 0.6)) * (0.35 + 0.65 * wave1 * wave2 + energyBoost * 1.35);
      const bh = Math.min(maxBarH, maxBarH * env);
      const x = i * gap + (gap - barW) / 2;

      const grad = ctx.createLinearGradient(x, centerY - bh, x, centerY + bh);
      grad.addColorStop(0, rgbaStr(bg.accentColor, 0.75 * bg.intensity));
      grad.addColorStop(0.5, rgbaStr('#FFFFFF', 0.22 * bg.intensity));
      grad.addColorStop(1, rgbaStr(bg.accentColor, 0.75 * bg.intensity));
      ctx.fillStyle = grad;
      drawRoundedRect(ctx, x, centerY - bh, barW, bh * 2, barW / 2);
      ctx.fill();
    }
  }
}

interface LayoutWord {
  rawWord: string;
  displayText: string;
  wordIndex: number;
  width: number;
  height: number;
  emphasized: boolean;
  color: string;
  bgColor: string;
  style: EmphasisStyle;
  scaleMult: number;
  fontFamily: string;
  fontWeight: number;
  offsetY: number;
  rotateDeg: number;
}

interface LayoutLine {
  words: LayoutWord[];
  lineWidth: number;
  lineHeightPx: number;
}

function measureAndLayoutCue(
  ctx: CanvasRenderingContext2D,
  cue: SubtitleCue,
  typo: TypographyConfig,
  canvasW: number,
  canvasH: number
): {
  lines: LayoutLine[];
  totalWidth: number;
  totalHeight: number;
  baseFontPx: number;
  spaceWidth: number;
  fontFamily: string;
  effectiveScale: number;
} {
  const shortEdge = Math.min(canvasW, canvasH);
  const aspectRatio = canvasW / Math.max(1, canvasH);
  // Proportionally scale typography down when switching from 16:9 landscape to portrait (9:16, 4:5) or square (1:1)
  const aspectTextFactor =
    aspectRatio < 1.5
      ? Math.max(0.56, Math.pow(aspectRatio / (16 / 9), 0.45))
      : 1;

  const baseScaleFactor = (shortEdge / 1080) * aspectTextFactor;
  const cueScale = cue.customScale ?? 1;
  const initialFontPx = Math.max(14, typo.fontSize * baseScaleFactor * cueScale);
  const fontFamily = cue.customFont || typo.fontFamily;
  const maxWidthPx = canvasW * (typo.maxWidthPercent / 100);
  const maxHeightPx = canvasH * 0.8;

  const { lines: tokenizedLines } = tokenizeCueText(cue.text);

  const buildLayout = (candidateFontPx: number, spacingScale: number) => {
    ctx.save();
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(
        typo.letterSpacing * spacingScale
      ).toFixed(2)}px`;
    }
    ctx.font = `${typo.fontWeight} ${candidateFontPx}px "${fontFamily}", sans-serif`;
    const spaceWidth = ctx.measureText(' ').width;

    const finalLines: LayoutLine[] = [];

    for (const lineTokens of tokenizedLines) {
      if (lineTokens.length === 0) {
        finalLines.push({
          words: [],
          lineWidth: 0,
          lineHeightPx: candidateFontPx * typo.lineHeight,
        });
        continue;
      }

      let currentWords: LayoutWord[] = [];
      let currentWidth = 0;

      const calcLineHeight = (words: LayoutWord[]) => {
        const maxWordH = words.reduce((m, w) => Math.max(m, w.height), candidateFontPx);
        return Math.max(candidateFontPx, maxWordH * 0.92) * typo.lineHeight;
      };

      for (const token of lineTokens) {
        const override = cue.wordStyles[token.wordIndex];
        const emphasized = Boolean(override?.emphasized);
        const wordColor = emphasized
          ? override?.color || typo.emphasisColor
          : typo.baseColor;
        const wordBgColor = emphasized
          ? override?.bgColor || wordColor
          : wordColor;
        const wordStyle = emphasized
          ? override?.style || typo.emphasisStyle
          : 'color';
        const baseStyleScale =
          emphasized && (wordStyle === 'scaleColor' || wordStyle === 'glow')
            ? typo.emphasisScale
            : 1;
        const scaleMult =
          emphasized && typeof override?.scale === 'number'
            ? override.scale
            : baseStyleScale;

        const wordFontFamily = (emphasized && override?.fontFamily) || fontFamily;
        const weight = emphasized
          ? override?.fontWeight ?? Math.min(900, typo.fontWeight + 100)
          : typo.fontWeight;
        const wordFontPx = candidateFontPx * scaleMult;
        ctx.font = `${weight} ${wordFontPx}px "${wordFontFamily}", sans-serif`;

        const rawWordText =
          emphasized && override?.uppercase
            ? token.word.toLocaleUpperCase('vi-VN')
            : token.word;
        const displayText = applyTextTransform(rawWordText, typo.textTransform);
        const metrics = ctx.measureText(displayText);
        const boxPad =
          emphasized && (wordStyle === 'highlightBox' || wordStyle === 'outlineBadge')
            ? wordFontPx * 0.26
            : 0;
        const wordWidth = metrics.width + boxPad;

        const addedWidth = currentWords.length > 0 ? spaceWidth + wordWidth : wordWidth;

        if (currentWords.length > 0 && currentWidth + addedWidth > maxWidthPx) {
          finalLines.push({
            words: currentWords,
            lineWidth: currentWidth,
            lineHeightPx: calcLineHeight(currentWords),
          });
          currentWords = [];
          currentWidth = 0;
        }

        currentWords.push({
          rawWord: token.word,
          displayText,
          wordIndex: token.wordIndex,
          width: wordWidth,
          height: wordFontPx,
          emphasized,
          color: wordColor,
          bgColor: wordBgColor,
          style: wordStyle,
          scaleMult,
          fontFamily: wordFontFamily,
          fontWeight: weight,
          offsetY: emphasized ? override?.offsetY ?? 0 : 0,
          rotateDeg: emphasized ? override?.rotateDeg ?? 0 : 0,
        });

        currentWidth += currentWords.length > 1 ? spaceWidth + wordWidth : wordWidth;
      }

      if (currentWords.length > 0) {
        finalLines.push({
          words: currentWords,
          lineWidth: currentWidth,
          lineHeightPx: calcLineHeight(currentWords),
        });
      }
    }

    ctx.restore();

    const totalWidth = finalLines.reduce((max, l) => Math.max(max, l.lineWidth), 0);
    const totalHeight = finalLines.reduce((sum, l) => sum + l.lineHeightPx, 0);

    return {
      lines: finalLines,
      totalWidth,
      totalHeight,
      baseFontPx: candidateFontPx,
      spaceWidth,
      fontFamily,
      effectiveScale: spacingScale,
    };
  };

  let layout = buildLayout(initialFontPx, baseScaleFactor);

  // Overflow fit guard: if an unbroken word or tall block exceeds bounds in narrow ratios, scale down proportionally
  if (layout.totalWidth > maxWidthPx || layout.totalHeight > maxHeightPx) {
    const fitW = layout.totalWidth > 0 ? (maxWidthPx / layout.totalWidth) * 0.98 : 1;
    const fitH = layout.totalHeight > 0 ? maxHeightPx / layout.totalHeight : 1;
    const fitRatio = Math.max(0.45, Math.min(1, fitW, fitH));
    if (fitRatio < 0.99) {
      layout = buildLayout(initialFontPx * fitRatio, baseScaleFactor * fitRatio);
    }
  }

  return layout;
}

export function renderKineticFrame(options: RenderOptions): RenderedCueBounds | null {
  const {
    width,
    height,
    timeSec,
    project,
    audioEnergy,
    bgVideo,
    forceTransparentBg,
    showSafeGuides,
    selectedCueId,
  } = options;

  // We need caller's ctx — wait: let's export renderKineticScene(ctx, options) instead,
  // or accept ctx directly! Let's provide renderKineticScene(ctx, options).
  return null;
}

export function renderKineticScene(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions
): RenderedCueBounds | null {
  const {
    width,
    height,
    timeSec,
    project,
    audioEnergy,
    bgVideo,
    bgVideoSecondary,
    bgVideoBlendAlpha = 0,
    forceTransparentBg,
    skipPostFx,
    showSafeGuides,
    selectedCueId,
  } = options;

  // 1. Background Layer
  if (forceTransparentBg) {
    ctx.clearRect(0, 0, width, height);
  } else {
    renderDynamicBackground(
      ctx,
      width,
      height,
      timeSec,
      project.background,
      audioEnergy,
      bgVideo,
      bgVideoSecondary,
      bgVideoBlendAlpha
    );
  }

  const fx: EffectsConfig = project.effects || {
    vignette: 0.22,
    filmGrain: 0.06,
    scanlines: 0,
    chromaticAberration: 0,
    cameraFloat: false,
    textCardOpacity: 0,
    textCardColor: '#0B0C0F',
  };

  // 2. Find Active Cue
  const activeCue = project.cues.find(
    (c) => timeSec >= c.startSec && timeSec <= c.endSec
  );

  let bounds: RenderedCueBounds | null = null;

  if (activeCue) {
    const typo = project.typography;
    const motion = project.motion;
    const preset: AnimationPresetId = activeCue.customAnimation || motion.preset;
    const align = activeCue.customAlign || typo.textAlign;
    const posXNorm = activeCue.customPos?.x ?? typo.posX;
    const posYNorm = activeCue.customPos?.y ?? typo.posY;

    const layout = measureAndLayoutCue(ctx, activeCue, typo, width, height);
    const scaleFactor = layout.effectiveScale;
    const cueDur = Math.max(0.15, activeCue.endSec - activeCue.startSec);
    const elapsed = timeSec - activeCue.startSec;
    const remaining = activeCue.endSec - timeSec;

    // Exit fade
    const outOpacity =
      motion.outFadeSec > 0.01 ? clamp01(remaining / motion.outFadeSec) : 1;

    // Global audio-reactive subtle bounce + optional camera float drift
    const audioBounceScale = motion.audioReactiveBounce ? 1 + audioEnergy * 0.045 : 1;
    const floatX = fx.cameraFloat ? Math.sin(timeSec * 0.95) * 10 * scaleFactor : 0;
    const floatY = fx.cameraFloat ? Math.cos(timeSec * 0.72) * 8 * scaleFactor : 0;
    const floatRot = fx.cameraFloat ? Math.sin(timeSec * 0.6) * 0.012 : 0;

    const anchorX = posXNorm * width + floatX;
    const anchorY = posYNorm * height + floatY;

    // Compute top-left bounding box based on alignment around anchorX, anchorY
    let boxLeft = anchorX - layout.totalWidth / 2;
    if (align === 'left') boxLeft = anchorX;
    if (align === 'right') boxLeft = anchorX - layout.totalWidth;
    const boxTop = anchorY - layout.totalHeight / 2;

    bounds = {
      cueId: activeCue.id,
      x: boxLeft,
      y: boxTop,
      width: Math.max(80, layout.totalWidth),
      height: Math.max(40, layout.totalHeight),
    };

    const totalWords = layout.lines.reduce((s, l) => s + l.words.length, 0);

    ctx.save();
    if ('letterSpacing' in ctx) {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(
        typo.letterSpacing * scaleFactor
      ).toFixed(2)}px`;
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // Subtle global bounce + camera float around block center
    const centerX = boxLeft + layout.totalWidth / 2;
    const centerY = boxTop + layout.totalHeight / 2;
    ctx.translate(centerX, centerY);
    if (floatRot !== 0) ctx.rotate(floatRot);
    ctx.scale(audioBounceScale, audioBounceScale);
    ctx.translate(-centerX, -centerY);

    // Optional Backdrop Card behind Cue Block
    if (fx.textCardOpacity > 0.01 && layout.totalWidth > 0 && layout.totalHeight > 0) {
      const padX = layout.baseFontPx * 0.48;
      const padY = layout.baseFontPx * 0.3;
      const cardAlpha = fx.textCardOpacity * clamp01(elapsed / 0.16) * outOpacity;
      ctx.save();
      ctx.fillStyle = rgbaStr(fx.textCardColor || '#0B0C0F', cardAlpha);
      drawRoundedRect(
        ctx,
        boxLeft - padX,
        boxTop - padY,
        layout.totalWidth + padX * 2,
        layout.totalHeight + padY * 2,
        layout.baseFontPx * 0.28
      );
      ctx.fill();
      ctx.restore();
    }

    // Typewriter progress across entire cue
    const totalChars = layout.lines.reduce(
      (sum, l) => sum + l.words.reduce((ws, w) => ws + w.displayText.length, 0),
      0
    );
    const typewriterBudget = Math.max(0.25, cueDur * (0.72 / motion.inSpeed));
    const visibleCharCount = Math.floor(
      clamp01(elapsed / typewriterBudget) * (totalChars + 1)
    );
    let charsSoFar = 0;

    let currentY = boxTop;

    for (let lineIdx = 0; lineIdx < layout.lines.length; lineIdx++) {
      const line = layout.lines[lineIdx];
      const lineCenterY = currentY + line.lineHeightPx / 2;

      let lineStartX = anchorX - line.lineWidth / 2;
      if (align === 'left') lineStartX = anchorX;
      if (align === 'right') lineStartX = anchorX - line.lineWidth;

      let cursorX = lineStartX;

      for (let wIdx = 0; wIdx < line.words.length; wIdx++) {
        const word = line.words[wIdx];
        const wordCenterX = cursorX + word.width / 2;

        // Per-word normalized stagger timing
        const staggerSpan = Math.min(cueDur * 0.65, (0.55 * motion.staggerAmount) / motion.inSpeed);
        const wordDelay =
          totalWords > 1 ? (word.wordIndex / (totalWords - 1)) * staggerSpan : 0;
        const wordAnimDur = Math.max(0.18, 0.36 / motion.inSpeed);
        const rawProgress = clamp01((elapsed - wordDelay) / wordAnimDur);

        // Compute preset-specific transform & styling
        let alpha = outOpacity;
        let offsetX = 0;
        let offsetY = 0;
        let scaleX = 1;
        let scaleY = 1;
        let rotRad = 0;
        let skewX = 0;
        let wipeProgress = -1;
        let blurPx = 0;
        let clipLine = false;
        let drawTextStr = word.displayText;
        let isKaraokeActive = true;
        let rgbSplitPx = fx.chromaticAberration * 7 * scaleFactor;
        let extraGlow = false;

        if (preset === 'wordPop') {
          const s = easeOutBack(rawProgress, 1.85);
          scaleX = Math.max(0.001, s);
          scaleY = Math.max(0.001, s);
          alpha *= clamp01(rawProgress * 2.5);
        } else if (preset === 'slideUp') {
          const e = easeOutCubic(rawProgress);
          offsetY = (1 - e) * line.lineHeightPx * 0.9;
          alpha *= clamp01(rawProgress * 2.2);
          clipLine = true;
        } else if (preset === 'karaokeSweep') {
          const wordActiveAt = (word.wordIndex / Math.max(1, totalWords)) * (cueDur * 0.82);
          isKaraokeActive = elapsed >= wordActiveAt;
          const activeElapsed = elapsed - wordActiveAt;
          if (isKaraokeActive) {
            const bump = Math.exp(-Math.max(0, activeElapsed) * 7) * 0.14;
            scaleX = 1 + bump;
            scaleY = 1 + bump;
          } else {
            alpha *= 0.38;
          }
        } else if (preset === 'zoomSlam') {
          const e = easeOutCubic(rawProgress);
          const s = 2.35 - 1.35 * e;
          scaleX = s;
          scaleY = s;
          alpha *= clamp01(rawProgress * 2.8);
          blurPx = (1 - e) * 10 * scaleFactor;
        } else if (preset === 'typewriter') {
          const wordStartChar = charsSoFar;
          const wordLen = word.displayText.length;
          charsSoFar += wordLen;
          if (visibleCharCount <= wordStartChar) {
            drawTextStr = '';
            alpha = 0;
          } else if (visibleCharCount < wordStartChar + wordLen) {
            const count = visibleCharCount - wordStartChar;
            drawTextStr = word.displayText.slice(0, count);
          }
        } else if (preset === 'glitchSplit') {
          const e = easeOutCubic(rawProgress);
          alpha *= clamp01(rawProgress * 3);
          if (rawProgress < 0.85) {
            const jitter = (hashFloat(Math.floor(timeSec * 30) + word.wordIndex) - 0.5) * 2;
            offsetX = jitter * (1 - e) * 26 * scaleFactor;
            rgbSplitPx += (1 - e) * 14 * scaleFactor;
          }
        } else if (preset === 'waveBounce') {
          const e = easeOutCubic(rawProgress);
          alpha *= e;
          const wavePhase = timeSec * 4.2 * motion.inSpeed - word.wordIndex * 0.55;
          offsetY = Math.sin(wavePhase) * 12 * scaleFactor;
          rotRad = Math.cos(wavePhase) * 0.045;
        } else if (preset === 'blurFocus') {
          const e = easeOutCubic(rawProgress);
          alpha *= e;
          blurPx = (1 - e) * 18 * scaleFactor;
          const s = 1.18 - 0.18 * e;
          scaleX = s;
          scaleY = s;
        } else if (preset === 'flip3d') {
          const e = easeOutBack(rawProgress, 1.2);
          alpha *= clamp01(rawProgress * 2.2);
          scaleY = Math.max(0.02, e);
          rotRad = (1 - clamp01(rawProgress)) * -0.18;
        } else if (preset === 'scatterAssemble') {
          const e = easeOutCubic(rawProgress);
          alpha *= e;
          const dirX = (hashFloat(word.wordIndex * 5.3) - 0.5) * 240 * scaleFactor;
          const dirY = (hashFloat(word.wordIndex * 9.7) - 0.5) * 160 * scaleFactor;
          offsetX = (1 - e) * dirX;
          offsetY = (1 - e) * dirY;
          rotRad = (1 - e) * (hashFloat(word.wordIndex * 2.1) - 0.5) * 0.55;
        } else if (preset === 'elasticDrop') {
          const dropPhase = clamp01(rawProgress / 0.55);
          const settlePhase = clamp01((rawProgress - 0.55) / 0.45);
          const fall = Math.pow(dropPhase, 2);
          offsetY = (1 - fall) * -110 * scaleFactor;
          if (rawProgress >= 0.55) {
            const squash = Math.sin(settlePhase * Math.PI * 2) * Math.exp(-settlePhase * 3.5) * 0.24;
            scaleX = 1 + squash;
            scaleY = Math.max(0.5, 1 - squash * 0.85);
            offsetY += Math.max(0, squash) * 14 * scaleFactor;
          }
          alpha *= clamp01(rawProgress * 3.2);
        } else if (preset === 'neonPulse') {
          extraGlow = true;
          if (rawProgress < 0.55) {
            const flicker = hashFloat(Math.floor(timeSec * 36) + word.wordIndex * 3.7);
            alpha *= flicker > 0.35 ? 1 : 0.18;
          } else {
            const pulse = 0.88 + 0.12 * Math.sin(timeSec * 5 + word.wordIndex);
            alpha *= pulse;
          }
        } else if (preset === 'swingReveal') {
          const e = easeOutCubic(rawProgress);
          const swing = Math.cos(rawProgress * Math.PI * 2.5) * (1 - e) * 0.48;
          rotRad = swing;
          offsetY = (1 - e) * -28 * scaleFactor;
          alpha *= clamp01(rawProgress * 2.4);
        } else if (preset === 'splitCurtain') {
          const e = easeOutCubic(rawProgress);
          const centerRel = wordCenterX - centerX;
          const dir = centerRel >= 0 ? -1 : 1;
          offsetX = dir * (1 - e) * 90 * scaleFactor;
          scaleX = 0.4 + 0.6 * e;
          alpha *= clamp01(rawProgress * 2.2);
        } else if (preset === 'kineticOrbit') {
          const e = easeOutCubic(rawProgress);
          const inv = 1 - e;
          const theta = inv * Math.PI * 0.85 + word.wordIndex * 0.35;
          const radius = inv * 110 * scaleFactor;
          offsetX = Math.cos(theta) * radius;
          offsetY = Math.sin(theta) * radius * 0.7;
          rotRad = inv * 0.35;
          scaleX = 0.6 + 0.4 * e;
          scaleY = 0.6 + 0.4 * e;
          alpha *= clamp01(rawProgress * 2.2);
        } else if (preset === 'squashPop') {
          const e = rawProgress;
          const env = Math.exp(-e * 5.2) * Math.sin(e * Math.PI * 3.5);
          scaleX = Math.max(0.05, easeOutCubic(Math.min(1, e * 2.5)) + env * 0.38);
          scaleY = Math.max(0.05, easeOutCubic(Math.min(1, e * 2.5)) - env * 0.32);
          alpha *= clamp01(rawProgress * 3);
        } else if (preset === 'marqueeRun') {
          const e = easeOutCubic(clamp01(elapsed / 0.2));
          alpha *= e;
          const speedPx = 220 * motion.inSpeed;
          const span = width + line.lineWidth + 140;
          const halfSpan = span * 0.5;
          const shifted = ((elapsed * speedPx + halfSpan) % span) - halfSpan;
          offsetX = (lineIdx % 2 === 0 ? -1 : 1) * shifted;
          offsetY = Math.sin(timeSec * 3.5 + word.wordIndex * 0.45) * 4 * scaleFactor;
        } else if (preset === 'cascadeFall') {
          const e = easeOutCubic(rawProgress);
          offsetY = (1 - e) * -140 * scaleFactor;
          scaleY = 1 + (1 - e) * 0.55;
          alpha *= clamp01(rawProgress * 2.5);
          extraGlow = rawProgress < 0.7;
        } else if (preset === 'stretchSnap') {
          const e = easeOutBack(rawProgress, 1.35);
          const inv = 1 - clamp01(rawProgress);
          scaleX = 1 + inv * 1.45;
          scaleY = Math.max(0.4, 1 - inv * 0.35);
          skewX = inv * -0.45;
          offsetX = (1 - e) * -95 * scaleFactor;
          alpha *= clamp01(rawProgress * 3);
        } else if (preset === 'stampImpact') {
          const slam = clamp01(rawProgress / 0.45);
          const e = Math.pow(slam, 3);
          const s = 2.6 - 1.6 * e;
          scaleX = s;
          scaleY = s;
          alpha *= clamp01(rawProgress * 4);
          if (rawProgress > 0.45 && rawProgress < 0.85) {
            const shake = Math.sin(rawProgress * 65) * Math.exp(-(rawProgress - 0.45) * 9);
            offsetX = shake * 8 * scaleFactor;
            offsetY = shake * 5 * scaleFactor;
          }
        } else if (preset === 'horizonSkew') {
          const e = easeOutCubic(rawProgress);
          const dir = lineIdx % 2 === 0 ? -1 : 1;
          offsetX = (1 - e) * dir * 240 * scaleFactor;
          skewX = (1 - e) * -dir * 0.55;
          alpha *= clamp01(rawProgress * 2.4);
        } else if (preset === 'heartbeatBeat') {
          const e = easeOutCubic(rawProgress);
          alpha *= e;
          const beatCycle = (timeSec * 1.5 * motion.inSpeed) % 1;
          const thump1 = Math.exp(-Math.pow((beatCycle - 0.14) * 14, 2));
          const thump2 = Math.exp(-Math.pow((beatCycle - 0.32) * 16, 2)) * 0.65;
          const pulse = 1 + (thump1 + thump2) * (0.16 + audioEnergy * 0.18);
          scaleX = pulse;
          scaleY = pulse;
        } else if (preset === 'revealWipe') {
          wipeProgress = easeOutCubic(rawProgress);
          alpha *= rawProgress > 0.01 ? 1 : 0;
        } else if (preset === 'spiralTwist') {
          const e = easeOutBack(rawProgress, 1.3);
          alpha *= clamp01(rawProgress * 2.4);
          const spin = (1 - clamp01(rawProgress)) * Math.PI;
          scaleX = Math.max(0.05, Math.abs(Math.cos(spin)) * (0.5 + 0.5 * e));
          scaleY = 0.65 + 0.35 * e;
          rotRad = (1 - e) * -0.35;
        } else if (preset === 'dominoTilt') {
          const e = easeOutBack(rawProgress, 1.5);
          alpha *= clamp01(rawProgress * 2.8);
          rotRad = (1 - e) * -0.68;
          skewX = (1 - e) * 0.32;
          offsetY = (1 - clamp01(rawProgress)) * 18 * scaleFactor;
        } else if (preset === 'floatDrift') {
          const e = easeOutCubic(rawProgress);
          alpha *= e;
          blurPx = (1 - e) * 10 * scaleFactor;
          const driftY = Math.sin(timeSec * 1.4 + word.wordIndex * 0.7) * 6 * scaleFactor;
          const driftX = Math.cos(timeSec * 0.9 + word.wordIndex * 0.5) * 4 * scaleFactor;
          offsetY = (1 - e) * 24 * scaleFactor + driftY;
          offsetX = driftX;
        }

        if (alpha > 0.01 && drawTextStr.length > 0) {
          ctx.save();

          if (clipLine) {
            ctx.beginPath();
            ctx.rect(
              0,
              currentY - line.lineHeightPx * 0.12,
              width,
              line.lineHeightPx * 1.24
            );
            ctx.clip();
          }

          ctx.globalAlpha = clamp01(alpha);
          ctx.translate(
            wordCenterX + offsetX,
            lineCenterY + offsetY + word.offsetY * scaleFactor
          );
          const totalRot = rotRad + (word.rotateDeg * Math.PI) / 180;
          if (totalRot !== 0) ctx.rotate(totalRot);
          ctx.scale(scaleX, scaleY);
          if (skewX !== 0) ctx.transform(1, 0, skewX, 1, 0, 0);

          if (wipeProgress >= 0 && wipeProgress < 0.995) {
            const clipLeft = -word.width * 0.65;
            const clipWidth = word.width * 1.3 * wipeProgress;
            ctx.beginPath();
            ctx.rect(clipLeft, -word.height * 0.85, clipWidth, word.height * 1.7);
            ctx.clip();
          }

          const fontPx = word.height;
          ctx.font = `${word.fontWeight} ${fontPx}px "${word.fontFamily}", sans-serif`;

          // Karaoke sweep fills active words in emphasisColor if not already custom colored
          const effectiveColor =
            preset === 'karaokeSweep' && isKaraokeActive && !word.emphasized
              ? typo.emphasisColor
              : word.color;
          const effectiveAccent = word.emphasized ? word.bgColor : effectiveColor;

          // Highlight Box or Outline Badge behind emphasized word
          if (word.emphasized && word.style === 'highlightBox') {
            const boxW = word.width;
            const boxH = fontPx * 1.18;
            ctx.save();
            ctx.fillStyle = effectiveAccent;
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 10 * scaleFactor;
            drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, fontPx * 0.16);
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'outlineBadge') {
            const boxW = word.width;
            const boxH = fontPx * 1.16;
            ctx.save();
            ctx.fillStyle = rgbaStr(effectiveAccent, 0.16);
            ctx.strokeStyle = effectiveAccent;
            ctx.lineWidth = Math.max(2, fontPx * 0.055);
            drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, fontPx * 0.22);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }

          // RGB Glitch / Chromatic Aberration Ghost Layers
          if (rgbSplitPx > 0.5) {
            ctx.save();
            ctx.globalAlpha = clamp01(alpha * 0.6);
            ctx.fillStyle = '#00F0FF';
            ctx.fillText(drawTextStr, -rgbSplitPx, 0);
            ctx.fillStyle = '#FF0055';
            ctx.fillText(drawTextStr, rgbSplitPx, 0);
            ctx.restore();
          }

          // Double 3D Hard Shadow behind emphasized word
          if (word.emphasized && word.style === 'doubleShadow') {
            ctx.save();
            ctx.fillStyle = effectiveAccent;
            const off = Math.max(3, fontPx * 0.075);
            ctx.fillText(drawTextStr, off, off);
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillText(drawTextStr, off * 1.7, off * 1.7);
            ctx.restore();
          }

          // Shadow / Glow / Blur
          if (blurPx > 0.4) {
            ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
          }

          if ((word.emphasized && word.style === 'glow') || extraGlow) {
            ctx.shadowColor = effectiveAccent;
            ctx.shadowBlur = 28 * scaleFactor;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          } else if (typo.shadowBlur > 0) {
            ctx.shadowColor = typo.shadowColor;
            ctx.shadowBlur = typo.shadowBlur * scaleFactor;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = typo.shadowOffsetY * scaleFactor;
          }

          // Stroke outline
          if (typo.strokeWidth > 0 && !(word.emphasized && word.style === 'highlightBox')) {
            ctx.lineJoin = 'round';
            ctx.lineWidth = typo.strokeWidth * 2 * scaleFactor;
            ctx.strokeStyle = typo.strokeColor;
            ctx.strokeText(drawTextStr, 0, 0);
          }

          // Fill text
          if (word.emphasized && word.style === 'highlightBox') {
            ctx.fillStyle =
              word.color !== word.bgColor ? word.color : getContrastInk(effectiveAccent);
          } else if (word.emphasized && word.style === 'doubleShadow') {
            ctx.fillStyle = word.color !== word.bgColor ? word.color : '#FFFFFF';
          } else if (word.emphasized && word.style === 'gradientFill') {
            const grad = ctx.createLinearGradient(-word.width / 2, -fontPx / 2, word.width / 2, fontPx / 2);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.45, effectiveColor);
            grad.addColorStop(1, word.bgColor !== word.color ? word.bgColor : '#FACC15');
            ctx.fillStyle = grad;
          } else {
            ctx.fillStyle = effectiveColor;
          }
          ctx.fillText(drawTextStr, 0, 0);

          // Underline Sweep
          if (word.emphasized && word.style === 'underlineSweep') {
            const underlineProgress = clamp01((elapsed - wordDelay) / Math.max(0.2, wordAnimDur * 1.1));
            const uw = word.width * easeOutCubic(underlineProgress);
            const uh = Math.max(3, fontPx * 0.085);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.fillStyle = effectiveAccent;
            drawRoundedRect(ctx, -word.width / 2, fontPx * 0.52, uw, uh, uh / 2);
            ctx.fill();
            ctx.restore();
          }

          // Typewriter blinking cursor on active last char
          if (
            preset === 'typewriter' &&
            visibleCharCount >= charsSoFar - word.displayText.length &&
            visibleCharCount <= charsSoFar &&
            Math.floor(timeSec * 3) % 2 === 0
          ) {
            const partialW = ctx.measureText(drawTextStr).width;
            ctx.fillStyle = typo.emphasisColor;
            ctx.fillRect(
              partialW / 2 + 4 * scaleFactor,
              -fontPx * 0.45,
              Math.max(3, fontPx * 0.08),
              fontPx * 0.9
            );
          }

          // Laser edge highlight for revealWipe
          if (wipeProgress >= 0 && wipeProgress > 0.02 && wipeProgress < 0.98) {
            const edgeX = -word.width * 0.65 + word.width * 1.3 * wipeProgress - 2 * scaleFactor;
            ctx.save();
            ctx.fillStyle = typo.emphasisColor;
            ctx.shadowColor = typo.emphasisColor;
            ctx.shadowBlur = 14 * scaleFactor;
            ctx.fillRect(edgeX, -fontPx * 0.55, Math.max(2, 3.5 * scaleFactor), fontPx * 1.1);
            ctx.restore();
          }

          ctx.restore();
        }

        cursorX += word.width + layout.spaceWidth;
      }

      currentY += line.lineHeightPx;
    }

    ctx.restore();
  }

  // 2.5 Global Post-FX (Vignette, Scanlines, Film Grain) — skipped on transparent alpha export
  const shouldSkipPostFx = skipPostFx ?? forceTransparentBg;
  if (!shouldSkipPostFx) {
    if (fx.scanlines > 0.01) {
      ctx.save();
      const step = Math.max(3, Math.round(Math.min(width, height) / 220));
      ctx.fillStyle = `rgba(0, 0, 0, ${clamp01(fx.scanlines * 0.55).toFixed(3)})`;
      for (let y = 0; y < height; y += step * 2) {
        ctx.fillRect(0, y, width, step);
      }
      ctx.restore();
    }

    if (fx.vignette > 0.01) {
      const cx = width / 2;
      const cy = height / 2;
      const rInner = Math.min(width, height) * 0.34;
      const rOuter = Math.hypot(cx, cy);
      const vigGrad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
      vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vigGrad.addColorStop(1, `rgba(0, 0, 0, ${clamp01(fx.vignette).toFixed(3)})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, width, height);
    }

    if (fx.filmGrain > 0.01) {
      const speckCount = Math.round(180 * clamp01(fx.filmGrain * 2));
      const frameStep = Math.floor(timeSec * 24);
      const sz = Math.max(1.5, Math.min(width, height) / 680);
      for (let i = 0; i < speckCount; i++) {
        const sx = hashFloat(i * 2.3 + frameStep * 7.1) * width;
        const sy = hashFloat(i * 5.7 + frameStep * 13.7) * height;
        const a = hashFloat(i + frameStep * 1.9) * fx.filmGrain * 0.38;
        ctx.fillStyle = i % 2 === 0 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${a.toFixed(3)})`;
        ctx.fillRect(sx, sy, sz, sz);
      }
    }
  }

  // 3. Preview-only Safe Guides & Selection Outline (NEVER drawn during export)
  if (showSafeGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    // Action Safe 90%
    ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
    // Title Safe 80%
    ctx.strokeStyle = 'rgba(255, 90, 31, 0.28)';
    ctx.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);
    // Center crosshairs
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
  }

  if (bounds && selectedCueId === bounds.cueId && showSafeGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 90, 31, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(bounds.x - 14, bounds.y - 10, bounds.width + 28, bounds.height + 20);
    ctx.restore();
  }

  return bounds;
}
