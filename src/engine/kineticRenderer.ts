import {
  AnimationPresetId,
  BackgroundConfig,
  EffectsConfig,
  EmphasisStyle,
  MotionConfig,
  StudioProject,
  SubtitleCue,
  TextTransformMode,
  TransitionPresetId,
  TypographyConfig,
} from '../types/studio';
import { tokenizeCueText } from '../utils/srtParser';

export interface RenderOptions {
  width: number;
  height: number;
  timeSec: number;
  totalDurationSec?: number;
  project: StudioProject;
  audioEnergy: number;
  bgVideo?: HTMLVideoElement | null;
  bgVideoSecondary?: HTMLVideoElement | null;
  bgVideoBlendAlpha?: number;
  forceTransparentBg?: boolean;
  skipPostFx?: boolean;
  showSafeGuides?: boolean;
  showSocialSafeZones?: boolean;
  selectedCueId?: string | null;
}

export interface RenderedCueBounds {
  cueId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const TIKTOK_SAFE_ZONE = {
  left: 0.05,
  right: 0.84, // leaves 16% on right for Like/Comment/Share buttons
  top: 0.12,   // leaves 12% on top for Following/For You header
  bottom: 0.76, // leaves 24% on bottom for caption & audio marquee
  centerX: 0.445, // (0.05 + 0.84) / 2
  centerY: 0.44,  // (0.12 + 0.76) / 2
} as const;

const watermarkImageCache = new Map<string, HTMLImageElement>();
let grainTileCanvas: HTMLCanvasElement | null = null;

function getGrainTileCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (grainTileCanvas) return grainTileCanvas;
  const tile = document.createElement('canvas');
  tile.width = 256;
  tile.height = 256;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;
  const img = tctx.createImageData(256, 256);
  const d = img.data;
  for (let i = 0; i < 256 * 256; i++) {
    const v = hashFloat(i * 1.37 + 19.3);
    const offset = i * 4;
    const isBright = v > 0.5;
    const lum = isBright ? 255 : 0;
    const alpha = Math.round(Math.abs(v - 0.5) * 2 * 110);
    d[offset] = lum;
    d[offset + 1] = lum;
    d[offset + 2] = lum;
    d[offset + 3] = alpha;
  }
  tctx.putImageData(img, 0, 0);
  grainTileCanvas = tile;
  return grainTileCanvas;
}

export function preloadWatermarkImage(dataUrl: string | null | undefined): Promise<void> {
  if (!dataUrl || typeof Image === 'undefined') return Promise.resolve();
  const cached = watermarkImageCache.get(dataUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      watermarkImageCache.set(dataUrl, img);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

function getWatermarkImageSync(dataUrl: string): HTMLImageElement | null {
  const existing = watermarkImageCache.get(dataUrl);
  if (existing) {
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.src = dataUrl;
    watermarkImageCache.set(dataUrl, img);
  }
  return null;
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
  } else if (bg.presetId === 'rainyNight') {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, bg.primaryColor);
    bgGrad.addColorStop(1, bg.secondaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const minDim = Math.min(width, height);
    // Soft distant night bokeh lights
    for (let b = 0; b < 18; b++) {
      const bx = hashFloat(b * 4.1) * width;
      const by = (0.25 + hashFloat(b * 8.7) * 0.65) * height;
      const br = (0.028 + hashFloat(b * 12.3) * 0.055) * minDim * (1 + energyBoost * 0.25);
      const col = b % 3 === 0 ? bg.accentColor : '#94A3B8';
      const alpha = (0.06 + 0.1 * hashFloat(b * 3.3)) * bg.intensity;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, rgbaStr(col, alpha));
      g.addColorStop(1, rgbaStr(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // Slanted falling rain streaks
    const drops = 95;
    const slant = width * 0.055;
    for (let i = 0; i < drops; i++) {
      const layerSpeed = 0.75 + hashFloat(i * 6.1) * 1.15;
      const prog = (hashFloat(i * 9.9) + t * 0.95 * layerSpeed) % 1.2 - 0.1;
      const xTop = ((hashFloat(i * 2.7) + prog * 0.06) % 1.1) * width - width * 0.05;
      const yTop = prog * height;
      const len = height * (0.045 + hashFloat(i * 15.1) * 0.075);
      const alpha = (0.12 + 0.26 * hashFloat(i * 7.7)) * bg.intensity * (1 + energyBoost * 0.35);

      ctx.strokeStyle = rgbaStr(i % 5 === 0 ? bg.accentColor : '#E2E8F0', alpha);
      ctx.lineWidth = Math.max(1, minDim * 0.0014);
      ctx.beginPath();
      ctx.moveTo(xTop, yTop);
      ctx.lineTo(xTop - slant * 0.18, yTop + len);
      ctx.stroke();
    }
  } else if (bg.presetId === 'warmEmbers') {
    const glowGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.95,
      0,
      width * 0.5,
      height * 0.65,
      Math.hypot(width, height) * 0.75
    );
    glowGrad.addColorStop(0, bg.secondaryColor);
    glowGrad.addColorStop(0.65, bg.primaryColor);
    glowGrad.addColorStop(1, '#050303');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, width, height);

    const minDim = Math.min(width, height);
    const emberCount = 64;
    for (let i = 0; i < emberCount; i++) {
      const seedX = hashFloat(i * 3.9);
      const speedY = 0.05 + hashFloat(i * 11.3) * 0.11;
      const yNorm = ((hashFloat(i * 5.7) - t * speedY + 100) % 1.15) - 0.07;
      const sway = Math.sin(t * (1.2 + hashFloat(i * 8.1)) + i * 1.9) * width * 0.035;
      const x = seedX * width + sway;
      const y = yNorm * height;
      const pulse = 0.45 + 0.55 * Math.sin(t * 2.8 + i * 2.3);
      const radius = (0.004 + hashFloat(i * 17.7) * 0.014) * minDim * (1 + energyBoost * 0.45);
      const alpha = clamp01((0.25 + 0.55 * bg.intensity) * pulse);
      const col = i % 3 === 0 ? '#FDE68A' : bg.accentColor;

      const g = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
      g.addColorStop(0, rgbaStr('#FFFFFF', alpha * 0.85));
      g.addColorStop(0.35, rgbaStr(col, alpha));
      g.addColorStop(1, rgbaStr(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (bg.presetId === 'noirSpotlight') {
    ctx.fillStyle = bg.primaryColor;
    ctx.fillRect(0, 0, width, height);

    // Sweeping dramatic spotlight cone
    const sweepX = width * (0.5 + 0.28 * Math.sin(t * 0.42));
    const originX = width * (0.5 - 0.14 * Math.sin(t * 0.42));
    const originY = -height * 0.12;
    const coneHalfW = width * (0.28 + energyBoost * 0.08);

    const beamGrad = ctx.createLinearGradient(originX, originY, sweepX, height);
    beamGrad.addColorStop(0, rgbaStr('#FFFFFF', 0.24 * bg.intensity));
    beamGrad.addColorStop(0.45, rgbaStr(bg.secondaryColor, 0.45 * bg.intensity));
    beamGrad.addColorStop(0.85, rgbaStr(bg.accentColor, 0.14 * bg.intensity + energyBoost * 0.14));
    beamGrad.addColorStop(1, rgbaStr(bg.primaryColor, 0));

    ctx.save();
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(originX - width * 0.05, originY);
    ctx.lineTo(originX + width * 0.05, originY);
    ctx.lineTo(sweepX + coneHalfW, height);
    ctx.lineTo(sweepX - coneHalfW, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Floating noir dust motes inside the beam
    const minDim = Math.min(width, height);
    for (let i = 0; i < 42; i++) {
      const mx = ((hashFloat(i * 5.1) + Math.sin(t * 0.25 + i) * 0.04) % 1) * width;
      const my = ((hashFloat(i * 9.3) + t * 0.025 * (0.5 + hashFloat(i * 2.1))) % 1) * height;
      const r = (0.0018 + hashFloat(i * 13.7) * 0.0032) * minDim;
      const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.9 + i));
      ctx.fillStyle = rgbaStr(i % 6 === 0 ? bg.accentColor : '#E2E8F0', twinkle * 0.28 * bg.intensity);
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (bg.presetId === 'goldenMist') {
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, bg.primaryColor);
    bgGrad.addColorStop(0.55, bg.secondaryColor);
    bgGrad.addColorStop(1, bg.primaryColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Warm dawn/ancient mist ribbons drifting horizontally
    for (let m = 0; m < 5; m++) {
      const cx = width * ((0.2 + m * 0.18 + Math.sin(t * 0.22 + m * 1.3) * 0.18));
      const cy = height * (0.28 + m * 0.13 + Math.cos(t * 0.18 + m) * 0.06);
      const rx = Math.max(width, height) * (0.45 + 0.08 * m);
      const col = m % 2 === 0 ? bg.accentColor : '#FDE68A';
      const alpha = (0.07 + 0.05 * Math.sin(t * 0.5 + m)) * bg.intensity + energyBoost * 0.08;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      grad.addColorStop(0, rgbaStr(col, alpha));
      grad.addColorStop(1, rgbaStr(col, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
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
          emphasized &&
          (wordStyle === 'scaleColor' ||
            wordStyle === 'glow' ||
            wordStyle === 'pulseHalo' ||
            wordStyle === 'comicPop' ||
            wordStyle === 'fireAura')
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
        let boxPad = 0;
        if (emphasized) {
          if (wordStyle === 'highlightBox' || wordStyle === 'outlineBadge') {
            boxPad = wordFontPx * 0.26;
          } else if (
            wordStyle === 'pillSolid' ||
            wordStyle === 'skewBadge' ||
            wordStyle === 'tapeSticker' ||
            wordStyle === 'circleLoop' ||
            wordStyle === 'cornerFrame' ||
            wordStyle === 'markerHighlight' ||
            wordStyle === 'topBarAccent'
          ) {
            boxPad = wordFontPx * 0.3;
          } else if (wordStyle === 'bracketTag') {
            boxPad = wordFontPx * 0.44;
          }
        }
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
    totalDurationSec,
    project,
    audioEnergy,
    bgVideo,
    bgVideoSecondary,
    bgVideoBlendAlpha = 0,
    forceTransparentBg,
    skipPostFx,
    showSafeGuides,
    showSocialSafeZones,
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
    const transitionPreset: TransitionPresetId =
      activeCue.customTransition || motion.transition || 'fade';
    const align = activeCue.customAlign || typo.textAlign;
    const posXNorm = activeCue.customPos?.x ?? typo.posX;
    const posYNorm = activeCue.customPos?.y ?? typo.posY;

    const layout = measureAndLayoutCue(ctx, activeCue, typo, width, height);
    const scaleFactor = layout.effectiveScale;
    const cueDur = Math.max(0.15, activeCue.endSec - activeCue.startSec);
    const elapsed = timeSec - activeCue.startSec;
    const remaining = activeCue.endSec - timeSec;

    // Exit transition window
    const outDur =
      transitionPreset === 'none'
        ? 0
        : Math.min(cueDur * 0.65, Math.max(0.06, motion.outFadeSec));
    const outProgress = outDur > 0.005 ? clamp01(1 - remaining / outDur) : 0;
    const outOpacity = transitionPreset === 'none' ? 1 : clamp01(1 - outProgress);

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
      ctx.strokeStyle = rgbaStr('#FFFFFF', cardAlpha * 0.18);
      ctx.lineWidth = Math.max(1, scaleFactor * 1.2);
      ctx.stroke();
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

        // Per-word timing: use exact wordTimings if available, else normalized stagger
        const explicitWordTiming =
          activeCue.wordTimings && word.wordIndex < activeCue.wordTimings.length
            ? activeCue.wordTimings[word.wordIndex]
            : null;
        const staggerSpan = Math.min(cueDur * 0.65, (0.55 * motion.staggerAmount) / motion.inSpeed);
        const wordDelay = explicitWordTiming
          ? Math.max(0, explicitWordTiming.startSec - activeCue.startSec)
          : totalWords > 1
          ? (word.wordIndex / (totalWords - 1)) * staggerSpan
          : 0;
        const wordAnimDur = explicitWordTiming
          ? Math.max(0.14, Math.min(0.4, (explicitWordTiming.endSec - explicitWordTiming.startSec) / motion.inSpeed))
          : Math.max(0.18, 0.36 / motion.inSpeed);
        const rawProgress = clamp01((elapsed - wordDelay) / wordAnimDur);

        // Compute preset-specific transform & styling
        let alpha = 1;
        let offsetX = 0;
        let offsetY = 0;
        let scaleX = 1;
        let scaleY = 1;
        let rotRad = 0;
        let skewX = 0;
        let wipeProgress = -1;
        let outWipeDir: 'none' | 'left' | 'right' = 'none';
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
          const wordActiveAt = explicitWordTiming
            ? Math.max(0, explicitWordTiming.startSec - activeCue.startSec)
            : (word.wordIndex / Math.max(1, totalWords)) * (cueDur * 0.82);
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
          if (explicitWordTiming) {
            const wp = clamp01(
              (timeSec - explicitWordTiming.startSec) /
                Math.max(0.08, explicitWordTiming.endSec - explicitWordTiming.startSec)
            );
            if (timeSec < explicitWordTiming.startSec) {
              drawTextStr = '';
              alpha = 0;
            } else {
              const charsShown = Math.max(1, Math.ceil(wp * wordLen));
              drawTextStr = word.displayText.slice(0, charsShown);
            }
          } else if (visibleCharCount <= wordStartChar) {
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
        } else if (preset === 'inkReveal') {
          const e = easeOutCubic(rawProgress);
          alpha *= e;
          blurPx = (1 - e) * 14 * scaleFactor;
          const s = 0.86 + 0.14 * e;
          scaleX = s;
          scaleY = s;
          offsetY = (1 - e) * 14 * scaleFactor;
        } else if (preset === 'cinemaFade') {
          const e = easeOutCubic(rawProgress);
          const blockE = easeOutCubic(clamp01(elapsed / Math.max(0.35, 0.75 / motion.inSpeed)));
          alpha *= e;
          const centerRel = wordCenterX - centerX;
          offsetX = centerRel * (1 - blockE) * -0.06;
          blurPx = (1 - e) * 4 * scaleFactor;
        } else if (preset === 'whisperRise') {
          const e = easeOutCubic(rawProgress);
          alpha *= e * (0.94 + 0.06 * Math.sin(timeSec * 1.6 + word.wordIndex * 0.5));
          offsetY = (1 - e) * 30 * scaleFactor + Math.sin(timeSec * 1.1 + word.wordIndex) * 3 * scaleFactor;
        } else if (preset === 'bookTurn') {
          const e = easeOutCubic(rawProgress);
          alpha *= clamp01(rawProgress * 2.2);
          scaleX = Math.max(0.05, 0.15 + 0.85 * e);
          skewX = (1 - e) * 0.28;
          offsetX = (1 - e) * -28 * scaleFactor;
        } else if (preset === 'spotlightWord') {
          const wordActiveAt = explicitWordTiming
            ? Math.max(0, explicitWordTiming.startSec - activeCue.startSec)
            : (word.wordIndex / Math.max(1, totalWords)) * (cueDur * 0.78);
          const isLit = elapsed >= wordActiveAt;
          if (isLit) {
            const litAge = Math.max(0, elapsed - wordActiveAt);
            const settle = easeOutCubic(clamp01(litAge / 0.25));
            const pulse = 1 + Math.exp(-litAge * 5) * 0.11;
            scaleX = pulse;
            scaleY = pulse;
            alpha *= 0.65 + 0.35 * settle;
            extraGlow = litAge < 0.45;
          } else {
            alpha *= 0.34;
          }
        }

        // Apply Exit / Cue Transition Effect
        if (outProgress > 0 && transitionPreset !== 'none') {
          if (transitionPreset === 'fade') {
            alpha *= 1 - outProgress;
          } else if (transitionPreset === 'slideUpOut') {
            const oe = outProgress * outProgress;
            offsetY -= oe * line.lineHeightPx * 1.1;
            alpha *= clamp01(1 - outProgress * 1.1);
          } else if (transitionPreset === 'slideDownOut') {
            const oe = outProgress * outProgress;
            offsetY += oe * line.lineHeightPx * 1.1;
            alpha *= clamp01(1 - outProgress * 1.1);
          } else if (transitionPreset === 'slideLeftOut') {
            const oe = outProgress * outProgress;
            offsetX -= oe * 280 * scaleFactor;
            skewX += oe * 0.35;
            alpha *= clamp01(1 - outProgress * 1.15);
          } else if (transitionPreset === 'slideRightOut') {
            const oe = outProgress * outProgress;
            offsetX += oe * 280 * scaleFactor;
            skewX -= oe * 0.35;
            alpha *= clamp01(1 - outProgress * 1.15);
          } else if (transitionPreset === 'zoomOutShrink') {
            const oe = outProgress * outProgress;
            const os = Math.max(0.02, 1 - oe * 0.85);
            scaleX *= os;
            scaleY *= os;
            alpha *= clamp01(1 - outProgress * 1.1);
          } else if (transitionPreset === 'zoomInBurst') {
            const oe = outProgress * outProgress;
            const os = 1 + oe * 1.55;
            scaleX *= os;
            scaleY *= os;
            blurPx += oe * 14 * scaleFactor;
            alpha *= clamp01(1 - outProgress * 1.2);
          } else if (transitionPreset === 'blurDissolve') {
            blurPx += outProgress * 20 * scaleFactor;
            alpha *= 1 - outProgress;
          } else if (transitionPreset === 'glitchCut') {
            const jitter =
              (hashFloat(Math.floor(timeSec * 36) + word.wordIndex * 7.1) - 0.5) * 2;
            offsetX += jitter * outProgress * 32 * scaleFactor;
            rgbSplitPx += outProgress * 22 * scaleFactor;
            alpha *=
              outProgress > 0.78
                ? (1 - outProgress) * 4.5
                : hashFloat(Math.floor(timeSec * 40) + word.wordIndex) > 0.25
                ? 1
                : 0.22;
          } else if (transitionPreset === 'wipeLeft') {
            outWipeDir = 'left';
          } else if (transitionPreset === 'wipeRight') {
            outWipeDir = 'right';
          } else if (transitionPreset === 'splitCurtainOut') {
            const oe = outProgress * outProgress;
            const dir = wordCenterX >= centerX ? 1 : -1;
            offsetX += dir * oe * 150 * scaleFactor;
            alpha *= clamp01(1 - outProgress * 1.1);
          } else if (transitionPreset === 'flipOut') {
            const oe = outProgress * outProgress;
            scaleY *= Math.max(0.02, 1 - oe);
            alpha *= clamp01(1 - outProgress * 1.15);
          } else if (transitionPreset === 'scatterBlow') {
            const wordOutP = clamp01(
              outProgress * 1.25 - (word.wordIndex / Math.max(1, totalWords)) * 0.22
            );
            const oe = wordOutP * wordOutP;
            const dirX = (hashFloat(word.wordIndex * 5.3) - 0.5) * 260 * scaleFactor;
            const dirY = (hashFloat(word.wordIndex * 9.7) - 0.5) * 180 * scaleFactor;
            offsetX += oe * dirX;
            offsetY += oe * dirY;
            rotRad += oe * (hashFloat(word.wordIndex * 2.1) - 0.5) * 0.65;
            alpha *= 1 - wordOutP;
          } else if (transitionPreset === 'dropGravity') {
            const wordOutP = clamp01(
              outProgress * 1.25 - (word.wordIndex / Math.max(1, totalWords)) * 0.22
            );
            const oe = wordOutP * wordOutP;
            offsetY += oe * 165 * scaleFactor;
            rotRad += oe * (word.wordIndex % 2 === 0 ? 0.25 : -0.25);
            alpha *= clamp01(1 - wordOutP * 1.08);
          } else if (transitionPreset === 'spinShrink') {
            const os = Math.max(0.02, 1 - outProgress);
            scaleX *= os;
            scaleY *= os;
            rotRad += outProgress * 0.95;
            alpha *= 1 - outProgress;
          } else if (transitionPreset === 'flashCut') {
            const flashBump = 1 + Math.sin(outProgress * Math.PI) * 0.14;
            scaleX *= flashBump;
            scaleY *= flashBump;
            extraGlow = extraGlow || outProgress > 0.08;
            alpha *= outProgress < 0.7 ? 1 : clamp01((1 - outProgress) * 3.3);
          }
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

          if (outWipeDir !== 'none' && outProgress > 0.005) {
            const keepFrac = Math.max(0, 1 - easeOutCubic(outProgress));
            const totalW = word.width * 1.3;
            const keepW = totalW * keepFrac;
            const clipX =
              outWipeDir === 'left'
                ? -word.width * 0.65
                : -word.width * 0.65 + (totalW - keepW);
            ctx.beginPath();
            ctx.rect(clipX, -word.height * 0.85, keepW, word.height * 1.7);
            ctx.clip();
          }

          const fontPx = word.height;
          ctx.font = `${word.fontWeight} ${fontPx}px "${word.fontFamily}", sans-serif`;

          const emphProgress = clamp01(
            (elapsed - wordDelay) / Math.max(0.2, wordAnimDur * 1.15)
          );
          const easeEmph = easeOutCubic(emphProgress);

          if (word.emphasized && word.style === 'pulseHalo') {
            const breathe = 1 + 0.055 * Math.sin(timeSec * 5.2 + word.wordIndex);
            ctx.scale(breathe, breathe);
          }

          // Karaoke sweep fills active words in emphasisColor if not already custom colored
          const effectiveColor =
            preset === 'karaokeSweep' && isKaraokeActive && !word.emphasized
              ? typo.emphasisColor
              : word.color;
          const effectiveAccent = word.emphasized ? word.bgColor : effectiveColor;

          // Backdrops, Badges, Frames & Marker Highlights behind emphasized word
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
          } else if (word.emphasized && word.style === 'pillSolid') {
            const boxW = word.width;
            const boxH = fontPx * 1.18;
            ctx.save();
            ctx.fillStyle = effectiveAccent;
            ctx.shadowColor = 'rgba(0,0,0,0.28)';
            ctx.shadowBlur = 12 * scaleFactor;
            drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, boxH / 2);
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'skewBadge') {
            const boxW = word.width;
            const boxH = fontPx * 1.16;
            ctx.save();
            ctx.transform(1, 0, -0.22, 1, 0, 0);
            ctx.fillStyle = effectiveAccent;
            ctx.shadowColor = 'rgba(0,0,0,0.28)';
            ctx.shadowBlur = 10 * scaleFactor;
            drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, fontPx * 0.1);
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'tapeSticker') {
            const boxW = word.width * 1.03;
            const boxH = fontPx * 1.18;
            ctx.save();
            ctx.rotate(-0.042);
            ctx.fillStyle = effectiveAccent;
            ctx.shadowColor = 'rgba(0,0,0,0.32)';
            ctx.shadowBlur = 10 * scaleFactor;
            ctx.shadowOffsetY = 4 * scaleFactor;
            ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = Math.max(1, fontPx * 0.025);
            ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);
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
          } else if (word.emphasized && word.style === 'markerHighlight') {
            const sweepW = word.width * easeEmph;
            const markH = fontPx * 0.56;
            const markY = -fontPx * 0.02;
            ctx.save();
            ctx.transform(1, 0, -0.14, 1, 0, 0);
            ctx.fillStyle = rgbaStr(effectiveAccent, 0.58);
            drawRoundedRect(ctx, -word.width / 2, markY, sweepW, markH, fontPx * 0.08);
            ctx.fill();
            ctx.fillStyle = rgbaStr(effectiveAccent, 0.35);
            drawRoundedRect(
              ctx,
              -word.width / 2 + fontPx * 0.04,
              markY + markH * 0.15,
              Math.max(0, sweepW - fontPx * 0.08),
              markH * 0.55,
              fontPx * 0.05
            );
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'topBarAccent') {
            const boxW = word.width;
            const boxH = fontPx * 1.18;
            const topY = -boxH / 2;
            ctx.save();
            const wash = ctx.createLinearGradient(0, topY, 0, topY + boxH);
            wash.addColorStop(0, rgbaStr(effectiveAccent, 0.28));
            wash.addColorStop(1, rgbaStr(effectiveAccent, 0.0));
            ctx.fillStyle = wash;
            ctx.fillRect(-boxW / 2, topY, boxW, boxH);
            const barH = Math.max(3, fontPx * 0.09);
            ctx.fillStyle = effectiveAccent;
            drawRoundedRect(ctx, -boxW / 2, topY, boxW * easeEmph, barH, barH / 2);
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'pulseHalo') {
            const ringPulse = 0.5 + 0.5 * Math.sin(timeSec * 5.2 + word.wordIndex);
            const ringScale = 1 + ringPulse * 0.14;
            const boxW = word.width * ringScale;
            const boxH = fontPx * 1.24 * ringScale;
            ctx.save();
            ctx.strokeStyle = rgbaStr(effectiveAccent, 0.45 + 0.35 * (1 - ringPulse));
            ctx.lineWidth = Math.max(2, fontPx * 0.045);
            ctx.shadowColor = effectiveAccent;
            ctx.shadowBlur = 16 * scaleFactor;
            drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, boxH / 2);
            ctx.stroke();
            ctx.restore();
          } else if (word.emphasized && word.style === 'cornerFrame') {
            const expand = 1 + (1 - easeEmph) * 0.28;
            const halfW = (word.width / 2) * expand;
            const halfH = fontPx * 0.6 * expand;
            const arm = Math.min(word.width * 0.22, fontPx * 0.34);
            ctx.save();
            ctx.strokeStyle = effectiveAccent;
            ctx.lineWidth = Math.max(2.2, fontPx * 0.065);
            ctx.lineCap = 'square';
            ctx.beginPath();
            // Top-left
            ctx.moveTo(-halfW, -halfH + arm);
            ctx.lineTo(-halfW, -halfH);
            ctx.lineTo(-halfW + arm, -halfH);
            // Top-right
            ctx.moveTo(halfW - arm, -halfH);
            ctx.lineTo(halfW, -halfH);
            ctx.lineTo(halfW, -halfH + arm);
            // Bottom-right
            ctx.moveTo(halfW, halfH - arm);
            ctx.lineTo(halfW, halfH);
            ctx.lineTo(halfW - arm, halfH);
            // Bottom-left
            ctx.moveTo(-halfW + arm, halfH);
            ctx.lineTo(-halfW, halfH);
            ctx.lineTo(-halfW, halfH - arm);
            ctx.stroke();
            ctx.restore();
          } else if (word.emphasized && word.style === 'bracketTag') {
            const slide = (1 - easeEmph) * fontPx * 0.2;
            const halfW = word.width / 2 - fontPx * 0.05 + slide;
            const halfH = fontPx * 0.56;
            const serif = fontPx * 0.16;
            ctx.save();
            ctx.strokeStyle = effectiveAccent;
            ctx.lineWidth = Math.max(2.4, fontPx * 0.075);
            ctx.lineCap = 'square';
            ctx.beginPath();
            // Left bracket [
            ctx.moveTo(-halfW + serif, -halfH);
            ctx.lineTo(-halfW, -halfH);
            ctx.lineTo(-halfW, halfH);
            ctx.lineTo(-halfW + serif, halfH);
            // Right bracket ]
            ctx.moveTo(halfW - serif, -halfH);
            ctx.lineTo(halfW, -halfH);
            ctx.lineTo(halfW, halfH);
            ctx.lineTo(halfW - serif, halfH);
            ctx.stroke();
            ctx.restore();
          }

          // RGB Glitch / Chromatic Aberration Ghost Layers
          const activeChromaticSplit = word.emphasized && word.style === 'chromaticSplit';
          const effectiveSplit = activeChromaticSplit
            ? Math.max(rgbSplitPx, Math.max(2.5, fontPx * 0.055))
            : rgbSplitPx;
          if (effectiveSplit > 0.5) {
            ctx.save();
            ctx.globalAlpha = clamp01(alpha * (activeChromaticSplit ? 0.85 : 0.6));
            ctx.fillStyle = '#00F0FF';
            ctx.fillText(
              drawTextStr,
              -effectiveSplit,
              activeChromaticSplit ? -effectiveSplit * 0.35 : 0
            );
            ctx.fillStyle =
              activeChromaticSplit && word.bgColor !== word.color ? word.bgColor : '#FF0055';
            ctx.fillText(
              drawTextStr,
              effectiveSplit,
              activeChromaticSplit ? effectiveSplit * 0.35 : 0
            );
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
          } else if (word.emphasized && word.style === 'retroLongShadow') {
            ctx.save();
            const step = Math.max(1.2, fontPx * 0.018);
            const steps = 8;
            for (let s = steps; s >= 1; s--) {
              ctx.fillStyle =
                s > steps - 2 ? 'rgba(0,0,0,0.55)' : rgbaStr(effectiveAccent, 0.35 + (1 - s / steps) * 0.55);
              ctx.fillText(drawTextStr, s * step, s * step);
            }
            ctx.restore();
          } else if (word.emphasized && word.style === 'comicPop') {
            ctx.save();
            const off = Math.max(4, fontPx * 0.085);
            ctx.fillStyle = '#090B10';
            ctx.fillText(drawTextStr, off, off);
            ctx.restore();
          }

          // Shadow / Glow / Blur
          if (blurPx > 0.4) {
            ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
          }

          if (word.emphasized && word.style === 'neonTube') {
            const flicker = 0.86 + 0.14 * Math.sin(timeSec * 11 + word.wordIndex * 1.7);
            ctx.shadowColor = effectiveAccent;
            ctx.shadowBlur = 32 * scaleFactor * flicker;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          } else if (word.emphasized && word.style === 'fireAura') {
            const flame = 0.8 + 0.2 * Math.sin(timeSec * 9.5 + word.wordIndex * 1.3);
            ctx.shadowColor = '#FF4500';
            ctx.shadowBlur = 28 * scaleFactor * flame;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = -3 * scaleFactor;
          } else if (word.emphasized && word.style === 'pulseHalo') {
            ctx.shadowColor = effectiveAccent;
            ctx.shadowBlur = 22 * scaleFactor;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          } else if ((word.emphasized && word.style === 'glow') || extraGlow) {
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
          const skipDefaultStroke =
            word.emphasized &&
            (word.style === 'highlightBox' ||
              word.style === 'pillSolid' ||
              word.style === 'skewBadge' ||
              word.style === 'tapeSticker' ||
              word.style === 'hollowStroke' ||
              word.style === 'comicPop');
          if (typo.strokeWidth > 0 && !skipDefaultStroke) {
            ctx.lineJoin = 'round';
            ctx.lineWidth = typo.strokeWidth * 2 * scaleFactor;
            ctx.strokeStyle = typo.strokeColor;
            ctx.strokeText(drawTextStr, 0, 0);
          }

          if (word.emphasized && word.style === 'comicPop') {
            ctx.save();
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(3, fontPx * 0.12);
            ctx.strokeStyle = '#090B10';
            ctx.strokeText(drawTextStr, 0, 0);
            ctx.restore();
          } else if (word.emphasized && word.style === 'neonTube') {
            ctx.save();
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2.5, fontPx * 0.085);
            ctx.strokeStyle = effectiveAccent;
            ctx.strokeText(drawTextStr, 0, 0);
            ctx.restore();
          }

          // Fill text
          if (word.emphasized && word.style === 'hollowStroke') {
            ctx.save();
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2.4, fontPx * 0.075);
            ctx.strokeStyle = effectiveColor;
            ctx.shadowColor = effectiveColor;
            ctx.shadowBlur = 12 * scaleFactor;
            ctx.strokeText(drawTextStr, 0, 0);
            ctx.fillStyle = rgbaStr(effectiveColor, 0.08);
            ctx.fillText(drawTextStr, 0, 0);
            ctx.restore();
          } else {
            const isSolidFillBadge =
              word.emphasized &&
              (word.style === 'highlightBox' ||
                word.style === 'pillSolid' ||
                word.style === 'skewBadge' ||
                word.style === 'tapeSticker');
            if (isSolidFillBadge) {
              ctx.fillStyle =
                word.color !== word.bgColor ? word.color : getContrastInk(effectiveAccent);
            } else if (
              word.emphasized &&
              (word.style === 'doubleShadow' ||
                word.style === 'retroLongShadow' ||
                word.style === 'chromaticSplit')
            ) {
              ctx.fillStyle = word.color !== word.bgColor ? word.color : '#FFFFFF';
            } else if (word.emphasized && word.style === 'neonTube') {
              ctx.fillStyle = '#FFFFFF';
            } else if (word.emphasized && word.style === 'gradientFill') {
              const grad = ctx.createLinearGradient(
                -word.width / 2,
                -fontPx / 2,
                word.width / 2,
                fontPx / 2
              );
              grad.addColorStop(0, '#FFFFFF');
              grad.addColorStop(0.45, effectiveColor);
              grad.addColorStop(1, word.bgColor !== word.color ? word.bgColor : '#FACC15');
              ctx.fillStyle = grad;
            } else if (word.emphasized && word.style === 'goldFoil') {
              const cycle = (timeSec * 0.7 + word.wordIndex * 0.16) % 1.8;
              const glint = clamp01(cycle / 1.1);
              const grad = ctx.createLinearGradient(
                -word.width / 2,
                -fontPx / 2,
                word.width / 2,
                fontPx / 2
              );
              grad.addColorStop(0, '#D97706');
              grad.addColorStop(Math.max(0.05, glint * 0.65), '#FACC15');
              grad.addColorStop(clamp01(0.15 + glint * 0.7), '#FFFBEB');
              grad.addColorStop(Math.min(0.95, 0.3 + glint * 0.65), '#F59E0B');
              grad.addColorStop(1, '#92400E');
              ctx.fillStyle = grad;
            } else if (word.emphasized && word.style === 'silverChrome') {
              const cycle = (timeSec * 0.65 + word.wordIndex * 0.14) % 1.8;
              const glint = clamp01(cycle / 1.1);
              const grad = ctx.createLinearGradient(
                -word.width / 2,
                -fontPx * 0.5,
                word.width / 2,
                fontPx * 0.5
              );
              grad.addColorStop(0, '#475569');
              grad.addColorStop(Math.max(0.05, glint * 0.6), '#CBD5E1');
              grad.addColorStop(clamp01(0.14 + glint * 0.72), '#FFFFFF');
              grad.addColorStop(Math.min(0.95, 0.32 + glint * 0.63), '#94A3B8');
              grad.addColorStop(1, '#1E293B');
              ctx.fillStyle = grad;
            } else if (word.emphasized && word.style === 'fireAura') {
              const grad = ctx.createLinearGradient(0, -fontPx * 0.5, 0, fontPx * 0.5);
              grad.addColorStop(0, '#FFFBEB');
              grad.addColorStop(0.35, '#FACC15');
              grad.addColorStop(0.75, effectiveColor);
              grad.addColorStop(1, '#DC2626');
              ctx.fillStyle = grad;
            } else if (word.emphasized && word.style === 'shimmerSweep') {
              const sweepPhase = (timeSec * 0.9 + word.wordIndex * 0.18) % 1.9;
              if (sweepPhase <= 1.0) {
                const pos = sweepPhase;
                const grad = ctx.createLinearGradient(
                  -word.width * 0.6,
                  -fontPx * 0.4,
                  word.width * 0.6,
                  fontPx * 0.4
                );
                const lo = clamp01(pos - 0.16);
                const hi = clamp01(pos + 0.16);
                grad.addColorStop(0, effectiveColor);
                if (lo > 0.02) grad.addColorStop(lo, effectiveColor);
                grad.addColorStop(clamp01(pos), '#FFFFFF');
                if (hi < 0.98) grad.addColorStop(hi, effectiveColor);
                grad.addColorStop(1, effectiveColor);
                ctx.fillStyle = grad;
              } else {
                ctx.fillStyle = effectiveColor;
              }
            } else if (word.emphasized && word.style === 'strikeEmphasis') {
              ctx.save();
              ctx.globalAlpha = clamp01(alpha * 0.74);
              ctx.fillStyle = effectiveColor;
              ctx.fillText(drawTextStr, 0, 0);
              ctx.restore();
            } else {
              ctx.fillStyle = effectiveColor;
            }

            if (!(word.emphasized && word.style === 'strikeEmphasis')) {
              ctx.fillText(drawTextStr, 0, 0);
            }
          }

          // Underlines, Strikes, Overlines & Circle Loops
          if (word.emphasized && word.style === 'underlineSweep') {
            const uw = word.width * easeEmph;
            const uh = Math.max(3, fontPx * 0.085);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.fillStyle = effectiveAccent;
            drawRoundedRect(ctx, -word.width / 2, fontPx * 0.52, uw, uh, uh / 2);
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'brushUnderline') {
            const uw = word.width * easeEmph;
            const yBase = fontPx * 0.54;
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = effectiveAccent;
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(3.5, fontPx * 0.1);
            ctx.beginPath();
            ctx.moveTo(-word.width / 2, yBase + fontPx * 0.03);
            ctx.quadraticCurveTo(
              -word.width / 2 + uw * 0.5,
              yBase - fontPx * 0.06,
              -word.width / 2 + uw,
              yBase + fontPx * 0.01
            );
            ctx.stroke();
            ctx.restore();
          } else if (word.emphasized && word.style === 'doubleUnderline') {
            const uw1 = word.width * easeEmph;
            const uw2 = word.width * easeOutCubic(clamp01((emphProgress - 0.15) / 0.85));
            const uh = Math.max(2, fontPx * 0.055);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.fillStyle = effectiveAccent;
            drawRoundedRect(ctx, -word.width / 2, fontPx * 0.48, uw1, uh, uh / 2);
            ctx.fill();
            if (uw2 > 1) {
              drawRoundedRect(ctx, -word.width / 2, fontPx * 0.6, uw2, uh, uh / 2);
              ctx.fill();
            }
            ctx.restore();
          } else if (word.emphasized && word.style === 'wavyUnderline') {
            const uw = word.width * easeEmph;
            const startX = -word.width / 2;
            const yBase = fontPx * 0.54;
            const amp = Math.max(2, fontPx * 0.055);
            const freq = (Math.PI * 2) / Math.max(12, fontPx * 0.34);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = effectiveAccent;
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(2.2, fontPx * 0.065);
            ctx.beginPath();
            const stepPx = Math.max(2, fontPx * 0.05);
            for (let dx = 0; dx <= uw; dx += stepPx) {
              const y = yBase + Math.sin(dx * freq - timeSec * 6) * amp;
              if (dx === 0) ctx.moveTo(startX + dx, y);
              else ctx.lineTo(startX + dx, y);
            }
            ctx.stroke();
            ctx.restore();
          } else if (word.emphasized && word.style === 'strikeEmphasis') {
            const sw = word.width * 1.06 * easeEmph;
            const sh = Math.max(3.5, fontPx * 0.1);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.rotate(-0.035);
            ctx.fillStyle = word.bgColor !== word.color ? word.bgColor : '#EF4444';
            drawRoundedRect(ctx, -word.width * 0.53, -sh / 2 + fontPx * 0.02, sw, sh, sh / 2);
            ctx.fill();
            ctx.restore();
          } else if (word.emphasized && word.style === 'circleLoop') {
            const rx = word.width * 0.51;
            const ry = fontPx * 0.6;
            const startAng = -Math.PI * 0.62;
            const endAng = startAng + Math.PI * 2.1 * easeEmph;
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.rotate(-0.035);
            ctx.strokeStyle = effectiveAccent;
            ctx.lineCap = 'round';
            ctx.lineWidth = Math.max(2.4, fontPx * 0.065);
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, startAng, endAng);
            ctx.stroke();
            ctx.restore();
          }

          // Typewriter blinking cursor on active last char
          const isWordBeingTyped = explicitWordTiming
            ? timeSec >= explicitWordTiming.startSec && timeSec <= explicitWordTiming.endSec
            : visibleCharCount >= charsSoFar - word.displayText.length &&
              visibleCharCount <= charsSoFar;
          if (
            preset === 'typewriter' &&
            isWordBeingTyped &&
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

  // 2.5 Global Post-FX (Vignette, Scanlines, Film Grain) + Branding Overlays
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
      const tile = getGrainTileCanvas();
      if (tile) {
        const frameStep = Math.floor(timeSec * 24);
        const shiftX = Math.floor(hashFloat(frameStep * 3.17) * 256);
        const shiftY = Math.floor(hashFloat(frameStep * 7.91) * 256);
        ctx.save();
        ctx.globalAlpha = clamp01(fx.filmGrain * 1.45);
        const pat = ctx.createPattern(tile, 'repeat');
        if (pat) {
          ctx.translate(-shiftX, -shiftY);
          ctx.fillStyle = pat;
          ctx.fillRect(shiftX, shiftY, width + 256, height + 256);
        }
        ctx.restore();
      }
    }

    // Branding: Watermark / Logo
    const wm = project.watermark;
    if (wm?.enabled && wm.imageDataUrl) {
      const img = getWatermarkImageSync(wm.imageDataUrl);
      if (img) {
        const shortEdge = Math.min(width, height);
        const targetW = Math.max(24, shortEdge * clamp01(wm.scale || 0.12));
        const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
        const targetH = targetW * ratio;
        const margin = (wm.marginPx ?? 36) * (shortEdge / 1080);

        let wx = margin;
        let wy = margin;
        if (wm.position === 'top-right') {
          wx = width - targetW - margin;
          wy = margin;
        } else if (wm.position === 'bottom-left') {
          wx = margin;
          wy = height - targetH - margin;
        } else if (wm.position === 'bottom-right') {
          wx = width - targetW - margin;
          wy = height - targetH - margin;
        }

        ctx.save();
        ctx.globalAlpha = clamp01(wm.opacity ?? 0.85);
        ctx.drawImage(img, wx, wy, targetW, targetH);
        ctx.restore();
      }
    }

    // Branding: Video Progress Bar
    const pb = project.progressBar;
    if (pb?.enabled) {
      const fallbackDur = project.cues.reduce((m, c) => Math.max(m, c.endSec), 2);
      const effDur = Math.max(0.5, totalDurationSec || fallbackDur);
      const pct = clamp01(timeSec / effDur);
      const shortEdge = Math.min(width, height);
      const barH = Math.max(3, (pb.heightPx || 8) * (shortEdge / 1080));
      const padX = pb.style === 'pill' ? shortEdge * 0.04 : 0;
      const barW = width - padX * 2;
      const y =
        pb.position === 'top'
          ? pb.style === 'pill'
            ? shortEdge * 0.025
            : 0
          : pb.style === 'pill'
          ? height - barH - shortEdge * 0.025
          : height - barH;
      const radius = pb.style === 'pill' ? barH / 2 : 0;

      ctx.save();
      ctx.globalAlpha = clamp01(pb.opacity ?? 0.92);
      ctx.fillStyle = pb.trackColor || 'rgba(255,255,255,0.18)';
      if (radius > 0) {
        drawRoundedRect(ctx, padX, y, barW, barH, radius);
        ctx.fill();
      } else {
        ctx.fillRect(padX, y, barW, barH);
      }

      const fillW = Math.max(0, barW * pct);
      if (fillW > 0.5) {
        if (pb.style === 'glow') {
          ctx.shadowColor = pb.color || '#FF5A1F';
          ctx.shadowBlur = barH * 2.2;
        }
        ctx.fillStyle = pb.color || '#FF5A1F';
        if (radius > 0) {
          drawRoundedRect(ctx, padX, y, fillW, barH, radius);
          ctx.fill();
        } else {
          ctx.fillRect(padX, y, fillW, barH);
        }
      }
      ctx.restore();
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

    // TikTok / Reels / Shorts Safe Zone Overlay (for vertical / 9:16 & 4:5)
    if (showSocialSafeZones && width < height) {
      const topZoneH = height * TIKTOK_SAFE_ZONE.top;
      const botZoneH = height * (1 - TIKTOK_SAFE_ZONE.bottom);
      const rightColW = width * (1 - TIKTOK_SAFE_ZONE.right);
      const safeLeft = width * TIKTOK_SAFE_ZONE.left;
      const safeW = width * (TIKTOK_SAFE_ZONE.right - TIKTOK_SAFE_ZONE.left);
      const safeH = height * (TIKTOK_SAFE_ZONE.bottom - TIKTOK_SAFE_ZONE.top);
      const safeCx = width * TIKTOK_SAFE_ZONE.centerX;
      const safeCy = height * TIKTOK_SAFE_ZONE.centerY;

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(244, 63, 94, 0.12)';
      // Top UI bar (Following / For You / Search)
      ctx.fillRect(0, 0, width, topZoneH);
      // Bottom caption / audio marquee area
      ctx.fillRect(0, height - botZoneH, width, botZoneH);
      // Right vertical action icons stack (Like, Comment, Share)
      ctx.fillRect(width - rightColW, height * 0.42, rightColW, height - height * 0.42 - botZoneH);

      ctx.strokeStyle = 'rgba(244, 63, 94, 0.5)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(safeLeft, topZoneH, safeW, safeH);

      // TikTok Safe Zone Center Crosshairs & Target Bullseye
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(safeCx, topZoneH);
      ctx.lineTo(safeCx, height - botZoneH);
      ctx.moveTo(safeLeft, safeCy);
      ctx.lineTo(safeLeft + safeW, safeCy);
      ctx.stroke();

      ctx.setLineDash([]);
      const ringR = Math.max(5, Math.min(11, width * 0.016));
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(safeCx, safeCy, ringR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(56, 189, 248, 0.95)';
      ctx.beginPath();
      ctx.arc(safeCx, safeCy, Math.max(2, ringR * 0.3), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.font = `600 ${Math.max(11, Math.round(width * 0.024))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Vùng an toàn TikTok / Reels', safeLeft + 6, topZoneH + 6);

      ctx.fillStyle = 'rgba(125, 211, 252, 0.88)';
      ctx.font = `500 ${Math.max(9, Math.round(width * 0.019))}px sans-serif`;
      ctx.fillText('Tâm Safe Zone', safeCx + ringR + 5, safeCy + 4);
    }

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
