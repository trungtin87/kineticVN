export type SoundscapeCategory = 'nature' | 'music';

export interface SoundscapeLayerMeta {
  id: string;
  name: string;
  desc: string;
  category: SoundscapeCategory;
  badge: string;
}

export interface SoundscapeComboPreset {
  id: string;
  name: string;
  desc: string;
  layers: Record<string, number>;
}

export const SOUNDSCAPE_LAYERS: SoundscapeLayerMeta[] = [
  {
    id: 'oceanWaves',
    name: 'Sóng biển vỗ bờ',
    desc: 'Nhịp sóng rì rào chậm rãi, thư thái',
    category: 'nature',
    badge: 'Biển',
  },
  {
    id: 'streamWater',
    name: 'Suối chảy róc rách',
    desc: 'Tiếng nước suối trong veo luồn khe đá',
    category: 'nature',
    badge: 'Nước',
  },
  {
    id: 'morningBirds',
    name: 'Chim hót rừng sáng',
    desc: 'Tiếng chim lảnh lót nhẹ giữa không gian thoáng',
    category: 'nature',
    badge: 'Chim',
  },
  {
    id: 'gentleRain',
    name: 'Mưa rơi bên hiên',
    desc: 'Hạt mưa đều dịu, ấm áp cho giọng kể',
    category: 'nature',
    badge: 'Mưa',
  },
  {
    id: 'forestWind',
    name: 'Gió qua tán lá',
    desc: 'Làn gió nhẹ xào xạc qua rặng trúc thông',
    category: 'nature',
    badge: 'Gió',
  },
  {
    id: 'warmFireplace',
    name: 'Lửa trại tí tách',
    desc: 'Tiếng củi nổ ấm cúng cho truyện đêm khuya',
    category: 'nature',
    badge: 'Lửa',
  },
  {
    id: 'nightCrickets',
    name: 'Đêm quê & Dế kêu',
    desc: 'Không gian đồng nội tĩnh lặng về đêm',
    category: 'nature',
    badge: 'Đêm',
  },
  {
    id: 'zenChimes',
    name: 'Chuông Gió Cổ Phong',
    desc: 'Âm hưởng ngũ cung thanh tịnh, thiền vị',
    category: 'music',
    badge: 'Cổ phong',
  },
  {
    id: 'warmPianoPad',
    name: 'Piano & Pad Ấm',
    desc: 'Hợp âm nhẹ nhàng chữa lành, tâm sự',
    category: 'music',
    badge: 'Healing',
  },
  {
    id: 'lofiVinyl',
    name: 'Đĩa Than Lo-fi',
    desc: 'Hơi ấm đĩa than cổ điển cho Vlog / Review',
    category: 'music',
    badge: 'Lo-fi',
  },
  {
    id: 'cinemaDrone',
    name: 'Sub Drone Điện Ảnh',
    desc: 'Nền trầm sâu lắng cho phim tài liệu, kịch tính',
    category: 'music',
    badge: 'Cinema',
  },
  {
    id: 'cosmicShimmer',
    name: 'Tinh Tú Không Gian',
    desc: 'Dải hòa âm bay bổng truyền cảm hứng',
    category: 'music',
    badge: 'Inspire',
  },
];

export const SOUNDSCAPE_COMBOS: SoundscapeComboPreset[] = [
  {
    id: 'ancient-hoattu',
    name: 'Cổ Phong Hoạt Tự',
    desc: 'Chuông gió + suối nguồn + gió lá',
    layers: { zenChimes: 0.52, streamWater: 0.42, forestWind: 0.28 },
  },
  {
    id: 'sunset-ocean',
    name: 'Biển Hoàng Hôn',
    desc: 'Sóng biển rì rào + Piano ấm áp',
    layers: { oceanWaves: 0.65, warmPianoPad: 0.48 },
  },
  {
    id: 'morning-forest',
    name: 'Rừng Sáng Bình Yên',
    desc: 'Chim hót + suối chảy + gió nhẹ',
    layers: { morningBirds: 0.56, streamWater: 0.48, forestWind: 0.3 },
  },
  {
    id: 'rainy-story',
    name: 'Đêm Mưa Tâm Sự',
    desc: 'Mưa rơi + lửa trại + đĩa than Lo-fi',
    layers: { gentleRain: 0.58, warmFireplace: 0.45, lofiVinyl: 0.42 },
  },
  {
    id: 'cinema-doc',
    name: 'Kịch Tính Điện Ảnh',
    desc: 'Sub drone sâu + mưa nhẹ + gió đêm',
    layers: { cinemaDrone: 0.68, gentleRain: 0.32, forestWind: 0.32 },
  },
  {
    id: 'country-night',
    name: 'Đồng Quê Đêm Trăng',
    desc: 'Dế kêu + suối nhỏ + chuông dịu',
    layers: { nightCrickets: 0.48, streamWater: 0.34, zenChimes: 0.36 },
  },
  {
    id: 'cosmic-inspire',
    name: 'Truyền Cảm Hứng',
    desc: 'Pad tinh tú + Piano dịu nhẹ',
    layers: { cosmicShimmer: 0.62, warmPianoPad: 0.45 },
  },
];

const SAMPLE_RATE = 44100;
const LOOP_SEC = 12.0;
const CROSSFADE_SEC = 1.2;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * LOOP_SEC);
const FADE_SAMPLES = Math.floor(SAMPLE_RATE * CROSSFADE_SEC);
const GEN_SAMPLES = TOTAL_SAMPLES + FADE_SAMPLES;

interface StereoTrackBuffer {
  left: Float32Array;
  right: Float32Array;
}

const layerCache = new Map<string, StereoTrackBuffer>();
const MAX_CACHED_LAYERS = 8;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

class PinkNoiseGen {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private b3 = 0;
  private b4 = 0;
  private b5 = 0;
  private b6 = 0;

  next(white: number): number {
    this.b0 = 0.99886 * this.b0 + white * 0.0555179;
    this.b1 = 0.99332 * this.b1 + white * 0.0750759;
    this.b2 = 0.96900 * this.b2 + white * 0.1538520;
    this.b3 = 0.86650 * this.b3 + white * 0.3104856;
    this.b4 = 0.55000 * this.b4 + white * 0.5329522;
    this.b5 = -0.7616 * this.b5 - white * 0.0168980;
    const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
    this.b6 = white * 0.115926;
    return out * 0.11;
  }
}

function finalizeSeamlessLoop(rawL: Float32Array, rawR: Float32Array): StereoTrackBuffer {
  const left = new Float32Array(TOTAL_SAMPLES);
  const right = new Float32Array(TOTAL_SAMPLES);

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    left[i] = rawL[i];
    right[i] = rawR[i];
  }

  for (let i = 0; i < FADE_SAMPLES; i++) {
    const fadeOut = 1 - i / FADE_SAMPLES;
    const fadeIn = i / FADE_SAMPLES;
    left[i] = rawL[i] * fadeIn + rawL[TOTAL_SAMPLES + i] * fadeOut;
    right[i] = rawR[i] * fadeIn + rawR[TOTAL_SAMPLES + i] * fadeOut;
  }

  return { left, right };
}

function addResonantBurst(
  bufL: Float32Array,
  bufR: Float32Array,
  startSample: number,
  durSamples: number,
  freqHz: number,
  amp: number,
  pan: number,
  glideEndHz?: number
) {
  const end = Math.min(bufL.length, startSample + durSamples);
  const panL = Math.cos(((pan + 1) * Math.PI) / 4);
  const panR = Math.sin(((pan + 1) * Math.PI) / 4);
  let phase = 0;
  for (let i = Math.max(0, startSample); i < end; i++) {
    const u = (i - startSample) / durSamples;
    const env = Math.sin(Math.min(1, u * 6) * (Math.PI / 2)) * Math.exp(-u * 4.5);
    const f = glideEndHz !== undefined ? freqHz + (glideEndHz - freqHz) * u : freqHz;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    const s = Math.sin(phase) * env * amp;
    bufL[i] += s * panL;
    bufR[i] += s * panR;
  }
}

function synthesizeLayer(layerId: string): StereoTrackBuffer {
  const cached = layerCache.get(layerId);
  if (cached) return cached;

  const rand = mulberry32(hashId(layerId) + 1337);
  const rawL = new Float32Array(GEN_SAMPLES);
  const rawR = new Float32Array(GEN_SAMPLES);
  const pinkL = new PinkNoiseGen();
  const pinkR = new PinkNoiseGen();

  if (layerId === 'oceanWaves') {
    let lpL = 0;
    let lpR = 0;
    let foamL = 0;
    let foamR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      // 3 organic wave surges per 12s loop
      const swell1 = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 6.0), 1.4);
      const swell2 = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * (t + 1.4)) / 4.0), 1.7);
      const waveEnv = 0.22 + 0.78 * (0.65 * swell1 + 0.35 * swell2);

      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);

      lpL = lpL * 0.972 + nL * 0.028;
      lpR = lpR * 0.972 + nR * 0.028;

      const foamCutoff = 0.06 + 0.22 * waveEnv;
      foamL = foamL * (1 - foamCutoff) + nL * foamCutoff;
      foamR = foamR * (1 - foamCutoff) + nR * foamCutoff;

      const panDrift = 0.08 * Math.sin(t * 0.52);
      rawL[i] = (lpL * (0.9 + waveEnv * 0.5) + foamL * waveEnv * 0.52) * (0.85 - panDrift);
      rawR[i] = (lpR * (0.9 + waveEnv * 0.5) + foamR * waveEnv * 0.52) * (0.85 + panDrift);
    }
  } else if (layerId === 'streamWater') {
    let bpL = 0;
    let bpR = 0;
    let prevL = 0;
    let prevR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);
      const hpL = nL - prevL * 0.86;
      const hpR = nR - prevR * 0.86;
      prevL = nL;
      prevR = nR;
      bpL = bpL * 0.82 + hpL * 0.18;
      bpR = bpR * 0.82 + hpR * 0.18;
      rawL[i] = bpL * 0.42;
      rawR[i] = bpR * 0.42;
    }
    // Babble water droplets
    for (let b = 0; b < 240; b++) {
      const pos = Math.floor(rand() * (GEN_SAMPLES - 3000));
      const dur = Math.floor((0.025 + rand() * 0.06) * SAMPLE_RATE);
      const f0 = 420 + rand() * 1950;
      const f1 = f0 * (1.12 + rand() * 0.35);
      const pan = (rand() - 0.5) * 1.4;
      addResonantBurst(rawL, rawR, pos, dur, f0, 0.06 + rand() * 0.07, pan, f1);
    }
  } else if (layerId === 'morningBirds') {
    // Soft forest air bed
    let airL = 0;
    let airR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);
      airL = airL * 0.96 + nL * 0.04;
      airR = airR * 0.96 + nR * 0.04;
      rawL[i] = airL * 0.08;
      rawR[i] = airR * 0.08;
    }
    // Natural melodic woodland bird phrases
    for (let c = 0; c < 18; c++) {
      const basePos = Math.floor((0.25 + (c / 18) * (LOOP_SEC - 0.8) + rand() * 0.4) * SAMPLE_RATE);
      const pan = (rand() - 0.5) * 1.5;
      const notes = 2 + Math.floor(rand() * 3);
      const baseFreq = 2300 + rand() * 1900;
      for (let n = 0; n < notes; n++) {
        const start = basePos + n * Math.floor((0.09 + rand() * 0.07) * SAMPLE_RATE);
        const dur = Math.floor((0.08 + rand() * 0.11) * SAMPLE_RATE);
        const end = Math.min(GEN_SAMPLES, start + dur);
        const fStart = baseFreq * (0.9 + rand() * 0.25);
        const fEnd = fStart * (rand() > 0.45 ? 1.24 : 0.78);
        const panL = Math.cos(((pan + 1) * Math.PI) / 4);
        const panR = Math.sin(((pan + 1) * Math.PI) / 4);
        let phase = 0;
        for (let i = Math.max(0, start); i < end; i++) {
          const u = (i - start) / dur;
          const env = Math.sin(u * Math.PI) * (0.7 + 0.3 * Math.sin(u * 26));
          const freq = fStart + (fEnd - fStart) * Math.pow(u, 0.75);
          phase += (2 * Math.PI * freq) / SAMPLE_RATE;
          const val = Math.sin(phase) * env * 0.14;
          rawL[i] += val * panL;
          rawR[i] += val * panR;
        }
      }
    }
  } else if (layerId === 'gentleRain') {
    let lpL = 0;
    let lpR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);
      lpL = lpL * 0.68 + nL * 0.32;
      lpR = lpR * 0.68 + nR * 0.32;
      rawL[i] = lpL * 0.45;
      rawR[i] = lpR * 0.45;
    }
    for (let d = 0; d < 320; d++) {
      const pos = Math.floor(rand() * (GEN_SAMPLES - 900));
      const dur = Math.floor((0.008 + rand() * 0.014) * SAMPLE_RATE);
      const pan = (rand() - 0.5) * 1.6;
      addResonantBurst(rawL, rawR, pos, dur, 1100 + rand() * 2400, 0.04 + rand() * 0.04, pan);
    }
  } else if (layerId === 'forestWind') {
    let lpL = 0;
    let lpR = 0;
    let prevL = 0;
    let prevR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const gustL = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 6.0 + 0.4), 1.4);
      const gustR = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 6.0 + 1.3), 1.4);

      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);
      const cL = 0.02 + 0.09 * gustL;
      const cR = 0.02 + 0.09 * gustR;

      lpL = lpL * (1 - cL) + nL * cL;
      lpR = lpR * (1 - cR) + nR * cR;

      const bandL = lpL - prevL * 0.92;
      const bandR = lpR - prevR * 0.92;
      prevL = lpL;
      prevR = lpR;

      rawL[i] = bandL * (1.2 + gustL * 1.1);
      rawR[i] = bandR * (1.2 + gustR * 1.1);
    }
  } else if (layerId === 'warmFireplace') {
    let emberL = 0;
    let emberR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const flicker = 0.75 + 0.25 * Math.sin(t * 2.1) * Math.cos(t * 3.7);
      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);
      emberL = emberL * 0.985 + nL * 0.015;
      emberR = emberR * 0.985 + nR * 0.015;
      rawL[i] = emberL * 0.95 * flicker;
      rawR[i] = emberR * 0.95 * flicker;
    }
    // Crisp fireplace crackles & pops
    for (let p = 0; p < 150; p++) {
      const pos = Math.floor(rand() * (GEN_SAMPLES - 1200));
      const len = Math.floor((0.004 + rand() * 0.016) * SAMPLE_RATE);
      const amp = 0.14 + rand() * 0.28;
      const pan = (rand() - 0.5) * 1.4;
      const panL = Math.cos(((pan + 1) * Math.PI) / 4);
      const panR = Math.sin(((pan + 1) * Math.PI) / 4);
      let prev = 0;
      for (let k = 0; k < len && pos + k < GEN_SAMPLES; k++) {
        const u = k / len;
        const env = Math.exp(-u * 6.5);
        const w = rand() * 2 - 1;
        const hp = w - prev * 0.85;
        prev = w;
        const v = hp * env * amp;
        rawL[pos + k] += v * panL;
        rawR[pos + k] += v * panR;
      }
    }
  } else if (layerId === 'nightCrickets') {
    let nightL = 0;
    let nightR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const nL = pinkL.next(rand() * 2 - 1);
      const nR = pinkR.next(rand() * 2 - 1);
      nightL = nightL * 0.96 + nL * 0.04;
      nightR = nightR * 0.96 + nR * 0.04;
      rawL[i] = nightL * 0.14;
      rawR[i] = nightR * 0.14;
    }
    // Soft cricket chirps in natural phrases
    for (let g = 0; g < 14; g++) {
      const phraseStart = Math.floor((0.2 + (g / 14) * LOOP_SEC) * SAMPLE_RATE);
      const pan = g % 2 === 0 ? -0.55 : 0.55;
      const panL = Math.cos(((pan + 1) * Math.PI) / 4);
      const panR = Math.sin(((pan + 1) * Math.PI) / 4);
      const f1 = 4050 + rand() * 280;
      const f2 = f1 + 310;
      const chirps = 3 + (g % 2);
      for (let c = 0; c < chirps; c++) {
        const start = phraseStart + c * Math.floor(0.18 * SAMPLE_RATE);
        const dur = Math.floor(0.11 * SAMPLE_RATE);
        for (let k = 0; k < dur && start + k < GEN_SAMPLES; k++) {
          const u = k / dur;
          const pulse = Math.max(0, Math.sin(u * Math.PI * 6));
          const env = Math.sin(u * Math.PI) * pulse * 0.055;
          const t = k / SAMPLE_RATE;
          const sig = (Math.sin(2 * Math.PI * f1 * t) + 0.6 * Math.sin(2 * Math.PI * f2 * t)) * env;
          rawL[start + k] += sig * panL;
          rawR[start + k] += sig * panR;
        }
      }
    }
  } else if (layerId === 'warmPianoPad') {
    // Cmaj9 -> Am9 -> Fmaj9 -> G6 across 12s (3s per bar)
    const chords: number[][] = [
      [130.81, 196.0, 246.94, 293.66, 329.63],
      [110.0, 164.81, 246.94, 261.63, 329.63],
      [87.31, 174.61, 220.0, 261.63, 329.63],
      [98.0, 196.0, 246.94, 293.66, 329.63],
    ];
    for (let cIdx = 0; cIdx < chords.length; cIdx++) {
      const barStart = Math.floor(cIdx * 3.0 * SAMPLE_RATE);
      const notes = chords[cIdx];
      notes.forEach((freq, nIdx) => {
        const delay = Math.floor(nIdx * 0.09 * SAMPLE_RATE);
        const start = barStart + delay;
        const dur = Math.floor(3.4 * SAMPLE_RATE);
        const pan = ((nIdx / Math.max(1, notes.length - 1)) - 0.5) * 0.8;
        const panL = Math.cos(((pan + 1) * Math.PI) / 4);
        const panR = Math.sin(((pan + 1) * Math.PI) / 4);
        for (let k = 0; k < dur && start + k < GEN_SAMPLES; k++) {
          const t = k / SAMPLE_RATE;
          const atk = Math.min(1, t / 0.035);
          const dec = Math.exp(-t * 1.15);
          const env = atk * dec * (0.11 / Math.sqrt(notes.length));
          const tone =
            Math.sin(2 * Math.PI * freq * t) +
            0.25 * Math.sin(2 * Math.PI * freq * 2 * t) * Math.exp(-t * 2.5) +
            0.08 * Math.sin(2 * Math.PI * freq * 3 * t) * Math.exp(-t * 4.0);
          rawL[start + k] += tone * env * panL;
          rawR[start + k] += tone * env * panR;
        }
      });
    }
    // Silky background warmth
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const swell = 0.65 + 0.35 * Math.sin((2 * Math.PI * t) / 6.0);
      const pad =
        (Math.sin(2 * Math.PI * 130.81 * t) +
          0.7 * Math.sin(2 * Math.PI * 196.0 * t + 0.5)) *
        0.045 *
        swell;
      rawL[i] += pad;
      rawR[i] += pad;
    }
  } else if (layerId === 'zenChimes') {
    // Pentatonic D minor / D major pentatonic: D4, E4, G4, A4, B4, D5, E5, A5
    const scale = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.25, 880.0];
    // Deep singing bowl root
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const env = 0.55 + 0.45 * Math.sin((2 * Math.PI * t) / 6.0);
      const bowl =
        (Math.sin(2 * Math.PI * 146.83 * t) +
          0.35 * Math.sin(2 * Math.PI * 293.66 * t + 0.4) +
          0.12 * Math.sin(2 * Math.PI * 440.0 * t)) *
        0.055 *
        env;
      rawL[i] += bowl;
      rawR[i] += bowl;
    }
    // Delicate wind chime strikes
    for (let k = 0; k < 14; k++) {
      const start = Math.floor((0.2 + (k / 14) * (LOOP_SEC - 0.5) + rand() * 0.25) * SAMPLE_RATE);
      const freq = scale[Math.floor(rand() * scale.length)];
      const dur = Math.floor((1.8 + rand() * 1.4) * SAMPLE_RATE);
      const pan = (rand() - 0.5) * 1.4;
      const panL = Math.cos(((pan + 1) * Math.PI) / 4);
      const panR = Math.sin(((pan + 1) * Math.PI) / 4);
      for (let i = 0; i < dur && start + i < GEN_SAMPLES; i++) {
        const t = i / SAMPLE_RATE;
        const env = Math.min(1, t / 0.008) * Math.exp(-t * 2.1) * 0.11;
        const chime =
          Math.sin(2 * Math.PI * freq * t) +
          0.28 * Math.sin(2 * Math.PI * freq * 2.003 * t) * Math.exp(-t * 3.4);
        rawL[start + i] += chime * env * panL;
        rawR[start + i] += chime * env * panR;
      }
    }
  } else if (layerId === 'lofiVinyl') {
    const chords: number[][] = [
      [146.83, 220.0, 261.63, 329.63],
      [130.81, 196.0, 246.94, 293.66],
      [110.0, 164.81, 220.0, 261.63],
      [130.81, 174.61, 220.0, 293.66],
    ];
    for (let cIdx = 0; cIdx < chords.length; cIdx++) {
      const start = Math.floor(cIdx * 3.0 * SAMPLE_RATE);
      const dur = Math.floor(3.0 * SAMPLE_RATE);
      for (let k = 0; k < dur && start + k < GEN_SAMPLES; k++) {
        const t = k / SAMPLE_RATE;
        const env = Math.min(1, t / 0.04) * Math.exp(-t * 0.75) * 0.05;
        // Subtle tape wow pitch drift
        const wow = 1 + 0.002 * Math.sin(2 * Math.PI * 0.65 * t);
        let sum = 0;
        for (const f of chords[cIdx]) {
          sum += Math.sin(2 * Math.PI * f * wow * t);
        }
        rawL[start + k] += sum * env;
        rawR[start + k] += sum * env;
      }
    }
    // Vinyl dust & surface warmth
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const hiss = pinkL.next(rand() * 2 - 1) * 0.055;
      rawL[i] += hiss;
      rawR[i] += pinkR.next(rand() * 2 - 1) * 0.055;
    }
    for (let p = 0; p < 180; p++) {
      const pos = Math.floor(rand() * (GEN_SAMPLES - 250));
      const pop = (rand() * 2 - 1) * (0.04 + rand() * 0.07);
      rawL[pos] += pop;
      rawR[pos + 1] += pop * 0.8;
    }
  } else if (layerId === 'cinemaDrone') {
    let lpL = 0;
    let lpR = 0;
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      const mod = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 6.0);
      const s1 = Math.sin(2 * Math.PI * 55.0 * t); // A1 sub
      const s2 = Math.sin(2 * Math.PI * 55.25 * t + 0.3);
      const s3 = Math.sin(2 * Math.PI * 82.41 * t); // E2 fifth
      const s4 = Math.sin(2 * Math.PI * 110.0 * t) * 0.5;
      const grit = pinkL.next(rand() * 2 - 1) * 0.06;
      const rawSig = (s1 + s2 * 0.8 + s3 * 0.55 + s4 * mod + grit) * 0.14;
      const cutoff = 0.03 + 0.05 * mod;
      lpL = lpL * (1 - cutoff) + rawSig * cutoff * 3.5;
      lpR = lpR * (1 - cutoff) + (rawSig + pinkR.next(rand() * 2 - 1) * 0.02) * cutoff * 3.5;
      rawL[i] = lpL;
      rawR[i] = lpR;
    }
  } else {
    // cosmicShimmer
    const freqs = [130.81, 196.0, 246.94, 293.66, 392.0, 523.25, 659.25];
    for (let i = 0; i < GEN_SAMPLES; i++) {
      const t = i / SAMPLE_RATE;
      let accL = 0;
      let accR = 0;
      for (let fIdx = 0; fIdx < freqs.length; fIdx++) {
        const f = freqs[fIdx];
        const lfo = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 6.0 + fIdx * 0.85);
        const sL = Math.sin(2 * Math.PI * f * t + 0.2 * lfo) * lfo;
        const sR = Math.sin(2 * Math.PI * (f * 1.0018) * t + 0.5) * lfo;
        const weight = 0.08 / (1 + fIdx * 0.32);
        accL += sL * weight;
        accR += sR * weight;
      }
      rawL[i] = accL;
      rawR[i] = accR;
    }
  }

  const finalized = finalizeSeamlessLoop(rawL, rawR);

  if (layerCache.size >= MAX_CACHED_LAYERS) {
    const oldestKey = layerCache.keys().next().value;
    if (oldestKey) layerCache.delete(oldestKey);
  }
  layerCache.set(layerId, finalized);
  return finalized;
}

export function encodeStereoFloatToWavFile(
  left: Float32Array,
  right: Float32Array,
  filename = 'hoattu_soundscape.wav'
): File {
  const numFrames = left.length;
  const numChannels = 2;
  const dataBytes = numFrames * numChannels * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

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
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    // Soft-clip limiter via tanh to guarantee warm headroom when mixing multiple layers
    const l = Math.tanh(left[i]);
    const r = Math.tanh(right[i]);
    view.setInt16(offset, Math.max(-32767, Math.min(32767, Math.round(l * 32767))), true);
    view.setInt16(offset + 2, Math.max(-32767, Math.min(32767, Math.round(r * 32767))), true);
    offset += 4;
  }

  return new File([buffer], filename, { type: 'audio/wav' });
}

export function renderSoundscapeMixWavFile(
  layers: Record<string, number>,
  label = 'Nhạc nền Phối âm'
): File | null {
  const activeEntries = Object.entries(layers).filter(([, vol]) => vol > 0.01);
  if (activeEntries.length === 0) return null;

  const mixL = new Float32Array(TOTAL_SAMPLES);
  const mixR = new Float32Array(TOTAL_SAMPLES);

  for (const [id, vol] of activeEntries) {
    const buf = synthesizeLayer(id);
    const gain = Math.max(0, Math.min(1.5, vol));
    for (let i = 0; i < TOTAL_SAMPLES; i++) {
      mixL[i] += buf.left[i] * gain;
      mixR[i] += buf.right[i] * gain;
    }
  }

  // Gentle auto-headroom scaling if sum is loud
  let peak = 0;
  for (let i = 0; i < TOTAL_SAMPLES; i += 8) {
    const a = Math.abs(mixL[i]);
    const b = Math.abs(mixR[i]);
    if (a > peak) peak = a;
    if (b > peak) peak = b;
  }
  if (peak > 0.88) {
    const norm = 0.88 / peak;
    for (let i = 0; i < TOTAL_SAMPLES; i++) {
      mixL[i] *= norm;
      mixR[i] *= norm;
    }
  }

  const safeLabel = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return encodeStereoFloatToWavFile(
    mixL,
    mixR,
    `${safeLabel || 'hoattu_soundscape'}.wav`
  );
}
