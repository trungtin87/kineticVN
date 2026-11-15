export type AspectRatioId = '16:9' | '9:16' | '1:1' | '4:5';

export type AnimationPresetId =
  | 'wordPop'
  | 'slideUp'
  | 'karaokeSweep'
  | 'typewriter'
  | 'glitchSplit'
  | 'waveBounce'
  | 'zoomSlam'
  | 'blurFocus'
  | 'flip3d'
  | 'scatterAssemble'
  | 'elasticDrop'
  | 'neonPulse'
  | 'swingReveal'
  | 'splitCurtain'
  | 'kineticOrbit'
  | 'squashPop';

export type EmphasisStyle =
  | 'color'
  | 'scaleColor'
  | 'highlightBox'
  | 'underlineSweep'
  | 'glow'
  | 'outlineBadge'
  | 'doubleShadow'
  | 'gradientFill';

export type TextAlignMode = 'left' | 'center' | 'right';
export type TextTransformMode = 'none' | 'uppercase' | 'titlecase';

export type BackgroundMode = 'transparent' | 'preset' | 'solid' | 'video';

export type DynamicBgPresetId =
  | 'aurora'
  | 'kineticGrid'
  | 'particles'
  | 'radialPulse'
  | 'filmWash'
  | 'diagonalStripes'
  | 'midnightInk'
  | 'neonTunnel'
  | 'starfieldWarp'
  | 'matrixRain'
  | 'sunsetSynth'
  | 'prismShards'
  | 'audioBars';

export interface WordStyleOverride {
  emphasized?: boolean;
  color?: string;
  style?: EmphasisStyle;
  scale?: number; // 0.7..2.2 per-word size multiplier
  fontFamily?: string | null;
  fontWeight?: number | null;
  offsetY?: number; // -30..30 px vertical nudge
  rotateDeg?: number; // -20..20 deg tilt
  bgColor?: string; // custom box/badge/shadow accent color
  uppercase?: boolean;
}

export interface SubtitleCue {
  id: string;
  index: number;
  startSec: number;
  endSec: number;
  /** Raw editable text with manual line breaks (\n) */
  text: string;
  /** Word-level emphasis keyed by flat word index across lines */
  wordStyles: Record<number, WordStyleOverride>;
  /** Optional per-cue overrides */
  customPos?: { x: number; y: number } | null; // normalized 0..1
  customAlign?: TextAlignMode | null;
  customAnimation?: AnimationPresetId | null;
  customFont?: string | null;
  customScale?: number | null;
}

export interface TypographyConfig {
  fontFamily: string;
  fontWeight: number;
  fontSize: number; // reference px at 1080p landscape, auto-proportioned for portrait
  lineHeight: number;
  letterSpacing: number; // px
  textTransform: TextTransformMode;
  textAlign: TextAlignMode;
  baseColor: string;
  emphasisColor: string;
  emphasisStyle: EmphasisStyle;
  emphasisScale: number; // 1.0 - 1.4
  strokeWidth: number;
  strokeColor: string;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetY: number;
  maxWidthPercent: number; // 40 - 94%
  posX: number; // 0..1 (default 0.5)
  posY: number; // 0..1 (default 0.5)
}

export interface MotionConfig {
  preset: AnimationPresetId;
  inSpeed: number; // 0.3..2.5
  outFadeSec: number; // 0..0.5
  staggerAmount: number; // 0..1
  audioReactiveBounce: boolean;
}

export type VideoLoopMode = 'crossfade' | 'pingpong' | 'cut';

export interface BackgroundConfig {
  mode: BackgroundMode;
  solidColor: string;
  presetId: DynamicBgPresetId;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  speed: number; // 0.2..2.5
  intensity: number; // 0.1..1.5
  audioReactive: boolean;
  videoDimmer: number; // 0..0.9
  videoBlur: number; // 0..30
  videoLoop: boolean;
  videoLoopMode: VideoLoopMode;
  videoCrossfadeSec: number; // 0.2..3.0
  videoPlaybackRate: number; // 0.5..1.5
  voiceVolume: number; // 0..1
  bgAudioVolume: number; // 0..1
  bgAudioSource: 'video' | 'custom';
}

export interface EffectsConfig {
  vignette: number; // 0..0.85
  filmGrain: number; // 0..0.5
  scanlines: number; // 0..0.6
  chromaticAberration: number; // 0..1
  cameraFloat: boolean;
  textCardOpacity: number; // 0..0.85
  textCardColor: string;
}

export interface StudioProject {
  name: string;
  aspectRatio: AspectRatioId;
  cues: SubtitleCue[];
  typography: TypographyConfig;
  motion: MotionConfig;
  background: BackgroundConfig;
  effects?: EffectsConfig;
}

export type ExportFormat = 'mp4' | 'prores4444';
export type ExportResolution = '720p' | '1080p' | '4k';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: 24 | 30 | 60;
  includeBackground: boolean;
  rangeMode: 'full' | 'cues';
}

export const ASPECT_RATIOS: Record<
  AspectRatioId,
  { label: string; width: number; height: number; ratio: number }
> = {
  '16:9': { label: '16:9 Landscape', width: 1920, height: 1080, ratio: 16 / 9 },
  '9:16': { label: '9:16 Vertical', width: 1080, height: 1920, ratio: 9 / 16 },
  '1:1': { label: '1:1 Square', width: 1080, height: 1080, ratio: 1 },
  '4:5': { label: '4:5 Portrait', width: 1080, height: 1350, ratio: 4 / 5 },
};

export const VIDEO_FONTS: { id: string; label: string; category: string }[] = [
  { id: 'Be Vietnam Pro', label: 'Be Vietnam Pro', category: 'Geometric Sans' },
  { id: 'Montserrat', label: 'Montserrat', category: 'Kinetic Sans' },
  { id: 'Anton', label: 'Anton', category: 'Poster Impact' },
  { id: 'Oswald', label: 'Oswald', category: 'Condensed Sans' },
  { id: 'Bricolage Grotesque', label: 'Bricolage Grotesque', category: 'Expressive Sans' },
  { id: 'Archivo', label: 'Archivo', category: 'Neo-Grotesque' },
  { id: 'Manrope', label: 'Manrope', category: 'Modern Sans' },
  { id: 'Playfair Display', label: 'Playfair Display', category: 'Editorial Serif' },
  { id: 'Fraunces', label: 'Fraunces', category: 'Soft Display Serif' },
  { id: 'Lora', label: 'Lora', category: 'Classic Serif' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono', category: 'Technical Mono' },
];

export const ANIMATION_PRESETS: {
  id: AnimationPresetId;
  name: string;
  desc: string;
}[] = [
  { id: 'wordPop', name: 'Word Pop', desc: 'Nảy đàn hồi từng từ' },
  { id: 'slideUp', name: 'Mask Slide Up', desc: 'Trượt từ dưới lên gọn sắc' },
  { id: 'karaokeSweep', name: 'Beat Sweep', desc: 'Quét màu theo từng nhịp' },
  { id: 'zoomSlam', name: 'Zoom Slam', desc: 'Thu phóng dập mạnh vào khung' },
  { id: 'typewriter', name: 'Typewriter', desc: 'Đánh máy kèm con trỏ nhấp nháy' },
  { id: 'glitchSplit', name: 'RGB Glitch', desc: 'Nhiễu tách kênh RGB kỹ thuật số' },
  { id: 'waveBounce', name: 'Wave Float', desc: 'Sóng nhấp nhô liên tục theo nhịp' },
  { id: 'blurFocus', name: 'Focus Pull', desc: 'Lấy nét điện ảnh từ mờ sang rõ' },
  { id: 'flip3d', name: 'Card Flip', desc: 'Lật thẻ 3D từng từ vào vị trí' },
  { id: 'scatterAssemble', name: 'Scatter Lock', desc: 'Các từ hội tụ từ nhiều hướng' },
  { id: 'elasticDrop', name: 'Elastic Drop', desc: 'Rơi từ trên xuống nảy nén dẻo' },
  { id: 'neonPulse', name: 'Neon Flicker', desc: 'Bật sáng nhấp nháy kiểu đèn Neon' },
  { id: 'swingReveal', name: 'Pendulum Swing', desc: 'Đu đưa con lắc quanh trục trên' },
  { id: 'splitCurtain', name: 'Center Split', desc: 'Tách đôi mở rèm từ tâm chữ' },
  { id: 'kineticOrbit', name: 'Spiral Arc', desc: 'Lượn vòng cung xoáy vào hàng' },
  { id: 'squashPop', name: 'Jelly Pop', desc: 'Co giãn khối dẻo vui nhộn' },
];

export const DYNAMIC_BG_PRESETS: {
  id: DynamicBgPresetId;
  name: string;
  desc: string;
  defaults: { primary: string; secondary: string; accent: string };
}[] = [
  {
    id: 'aurora',
    name: 'Aurora Mesh',
    desc: 'Dải cực quang chuyển sắc mượt mà',
    defaults: { primary: '#0D111A', secondary: '#1B2D48', accent: '#FF5A1F' },
  },
  {
    id: 'kineticGrid',
    name: 'Perspective Grid',
    desc: 'Lưới chân trời 3D chạy vô tận',
    defaults: { primary: '#090A0F', secondary: '#171C28', accent: '#3B82F6' },
  },
  {
    id: 'particles',
    name: 'Studio Bokeh',
    desc: 'Hạt sáng lơ lửng đa tầng chiều sâu',
    defaults: { primary: '#0B0C10', secondary: '#1C1F2B', accent: '#F59E0B' },
  },
  {
    id: 'radialPulse',
    name: 'Audio Halo',
    desc: 'Vòng sóng đồng tâm đập theo nhạc',
    defaults: { primary: '#0A0B0E', secondary: '#191D26', accent: '#FF5A1F' },
  },
  {
    id: 'filmWash',
    name: 'Analog Film Wash',
    desc: 'Ánh sáng phim nhựa kèm hạt grain',
    defaults: { primary: '#131110', secondary: '#2A221D', accent: '#E07A5F' },
  },
  {
    id: 'diagonalStripes',
    name: 'Kinetic Stripes',
    desc: 'Dải sọc đồ họa chuyển động chéo',
    defaults: { primary: '#0E1015', secondary: '#181C24', accent: '#10B981' },
  },
  {
    id: 'midnightInk',
    name: 'Midnight Ink',
    desc: 'Sóng mực tối giản mượt sâu',
    defaults: { primary: '#07080B', secondary: '#141720', accent: '#94A3B8' },
  },
  {
    id: 'neonTunnel',
    name: 'Cyber Tunnel',
    desc: 'Đường hầm khung Neon lao tới trước',
    defaults: { primary: '#070812', secondary: '#161233', accent: '#00F0FF' },
  },
  {
    id: 'starfieldWarp',
    name: 'Starfield Warp',
    desc: 'Tia sao du hành không gian tốc độ cao',
    defaults: { primary: '#04060D', secondary: '#0F172A', accent: '#38BDF8' },
  },
  {
    id: 'matrixRain',
    name: 'Digital Rain',
    desc: 'Mưa vệt sáng kỹ thuật số rơi dọc',
    defaults: { primary: '#050A08', secondary: '#0B1F17', accent: '#22C55E' },
  },
  {
    id: 'sunsetSynth',
    name: 'Retro Horizon',
    desc: 'Mặt trời Synthwave & sóng chân trời',
    defaults: { primary: '#12071F', secondary: '#3B0F4C', accent: '#FF3E8A' },
  },
  {
    id: 'prismShards',
    name: 'Glass Prisms',
    desc: 'Mảnh pha lê xoay phản chiếu ánh sáng',
    defaults: { primary: '#0A0D14', secondary: '#1E293B', accent: '#A78BFA' },
  },
  {
    id: 'audioBars',
    name: 'Spectrum Bars',
    desc: 'Thanh tần số Equalizer nhảy theo Audio',
    defaults: { primary: '#090B10', secondary: '#151B26', accent: '#FF5A1F' },
  },
];
