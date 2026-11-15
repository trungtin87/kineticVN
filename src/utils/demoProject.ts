import { StudioProject } from '../types/studio';

export const DEMO_SRT_CONTENT = `1
00:00:00,250 --> 00:00:02,600
Mỗi khung hình
đều mang [nhịp điệu]

2
00:00:02,750 --> 00:00:05,400
Biến phụ đề SRT thành
[Kinetic Typography] sống động

3
00:00:05,600 --> 00:00:08,500
Tùy chỉnh xuống dòng
và [nhấn màu] từng từ

4
00:00:08,700 --> 00:00:11,600
Hiệu ứng nền động
hoặc ghép [video] của bạn

5
00:00:11,800 --> 00:00:15,200
Xuất MP4 sắc nét hoặc
[ProRes 4444] tách nền Alpha`;

export function createDefaultProject(): StudioProject {
  return {
    name: 'Kinetik Demo Reel',
    aspectRatio: '16:9',
    cues: [
      {
        id: 'demo-1',
        index: 1,
        startSec: 0.25,
        endSec: 2.6,
        text: 'Mỗi khung hình\nđều mang nhịp điệu',
        wordStyles: {
          5: { emphasized: true, color: '#FF5A1F', style: 'scaleColor' },
          6: { emphasized: true, color: '#FF5A1F', style: 'scaleColor' },
        },
      },
      {
        id: 'demo-2',
        index: 2,
        startSec: 2.75,
        endSec: 5.4,
        text: 'Biến phụ đề SRT thành\nKinetic Typography sống động',
        wordStyles: {
          5: { emphasized: true, color: '#FACC15', style: 'highlightBox' },
          6: { emphasized: true, color: '#FACC15', style: 'highlightBox' },
        },
      },
      {
        id: 'demo-3',
        index: 3,
        startSec: 5.6,
        endSec: 8.5,
        text: 'Tùy chỉnh xuống dòng\nvà nhấn màu từng từ',
        wordStyles: {
          5: { emphasized: true, color: '#38BDF8', style: 'underlineSweep' },
          6: { emphasized: true, color: '#38BDF8', style: 'underlineSweep' },
        },
      },
      {
        id: 'demo-4',
        index: 4,
        startSec: 8.7,
        endSec: 11.6,
        text: 'Hiệu ứng nền động\nhoặc ghép video của bạn',
        wordStyles: {
          6: { emphasized: true, color: '#FF5A1F', style: 'glow' },
        },
      },
      {
        id: 'demo-5',
        index: 5,
        startSec: 11.8,
        endSec: 15.2,
        text: 'Xuất MP4 sắc nét hoặc\nProRes 4444 tách nền Alpha',
        wordStyles: {
          5: { emphasized: true, color: '#34D399', style: 'highlightBox' },
          6: { emphasized: true, color: '#34D399', style: 'highlightBox' },
          9: { emphasized: true, color: '#FF5A1F', style: 'scaleColor' },
        },
      },
    ],
    typography: {
      fontFamily: 'Be Vietnam Pro',
      fontWeight: 800,
      fontSize: 78,
      lineHeight: 1.22,
      letterSpacing: -1,
      textTransform: 'none',
      textAlign: 'center',
      baseColor: '#F8FAFC',
      emphasisColor: '#FF5A1F',
      emphasisStyle: 'scaleColor',
      emphasisScale: 1.12,
      strokeWidth: 0,
      strokeColor: '#000000',
      shadowBlur: 18,
      shadowColor: 'rgba(0,0,0,0.55)',
      shadowOffsetY: 6,
      maxWidthPercent: 84,
      posX: 0.5,
      posY: 0.5,
    },
    motion: {
      preset: 'wordPop',
      inSpeed: 1.15,
      outFadeSec: 0.18,
      staggerAmount: 0.55,
      audioReactiveBounce: true,
    },
    background: {
      mode: 'preset',
      solidColor: '#0B0C0F',
      presetId: 'aurora',
      primaryColor: '#0D111A',
      secondaryColor: '#1B2D48',
      accentColor: '#FF5A1F',
      speed: 1.0,
      intensity: 0.85,
      audioReactive: true,
      videoDimmer: 0.35,
      videoBlur: 0,
      videoLoop: true,
      videoLoopMode: 'crossfade',
      videoCrossfadeSec: 1.0,
      videoPlaybackRate: 1.0,
      voiceVolume: 1.0,
      bgAudioVolume: 0.25,
      bgAudioSource: 'video',
    },
    effects: {
      vignette: 0.22,
      filmGrain: 0.06,
      scanlines: 0,
      chromaticAberration: 0,
      cameraFloat: false,
      textCardOpacity: 0,
      textCardColor: '#0B0C0F',
    },
  };
}

/**
 * Generates a clean 15.6s rhythmic ambient electronic WAV file in memory
 * so the demo project has real audio, real waveform, and works with MP4/ProRes export immediately.
 */
export function generateDemoAudioWavBlob(durationSec = 15.6): Blob {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const bpm = 112;
  const beatDur = 60 / bpm;
  const chordRoots = [110, 130.81, 98, 146.83]; // A2, C3, G2, D3

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatPos = t / beatDur;
    const beatFrac = beatPos - Math.floor(beatPos);
    const barIdx = Math.floor(beatPos / 4) % chordRoots.length;
    const root = chordRoots[barIdx];

    // Warm kick on every beat
    const kickEnv = Math.exp(-beatFrac * 16);
    const kickFreq = 46 + 90 * Math.exp(-beatFrac * 28);
    const kick = Math.sin(2 * Math.PI * kickFreq * beatFrac * beatDur) * kickEnv * 0.42;

    // Subtle offbeat hi-hat tick
    const eighthFrac = (beatPos * 2) - Math.floor(beatPos * 2);
    const hatEnv = Math.floor(beatPos * 2) % 2 === 1 ? Math.exp(-eighthFrac * 35) : 0;
    const hat = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * hatEnv * 0.08;

    // Warm synth pad chord (root + fifth + minor third)
    const padEnv = Math.min(1, t * 2) * Math.min(1, (durationSec - t) * 2.5);
    const sidechain = 0.45 + 0.55 * Math.min(1, beatFrac * 2.2);
    const pad =
      (Math.sin(2 * Math.PI * root * t) * 0.22 +
        Math.sin(2 * Math.PI * root * 1.5 * t) * 0.14 +
        Math.sin(2 * Math.PI * root * 2.378 * t) * 0.1) *
      padEnv *
      sidechain;

    // Gentle pluck arpeggio on 16th notes
    const sixteenthIdx = Math.floor(beatPos * 4);
    const sixteenthFrac = beatPos * 4 - sixteenthIdx;
    const arpMults = [2, 2.378, 3, 4];
    const arpFreq = root * arpMults[sixteenthIdx % arpMults.length];
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * Math.exp(-sixteenthFrac * 10) * 0.12 * padEnv;

    const sample = Math.max(-0.95, Math.min(0.95, kick + hat + pad + arp));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
