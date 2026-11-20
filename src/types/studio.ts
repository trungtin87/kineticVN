import { CURATED_GOOGLE_FONTS } from '../utils/googleFonts';

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
  | 'squashPop'
  | 'marqueeRun'
  | 'cascadeFall'
  | 'stretchSnap'
  | 'stampImpact'
  | 'horizonSkew'
  | 'heartbeatBeat'
  | 'revealWipe'
  | 'spiralTwist'
  | 'dominoTilt'
  | 'floatDrift'
  | 'inkReveal'
  | 'cinemaFade'
  | 'whisperRise'
  | 'bookTurn'
  | 'spotlightWord';

export type EmphasisStyle =
  | 'color'
  | 'scaleColor'
  | 'highlightBox'
  | 'underlineSweep'
  | 'glow'
  | 'outlineBadge'
  | 'doubleShadow'
  | 'gradientFill'
  | 'markerHighlight'
  | 'neonTube'
  | 'brushUnderline'
  | 'doubleUnderline'
  | 'wavyUnderline'
  | 'strikeEmphasis'
  | 'bracketTag'
  | 'cornerFrame'
  | 'pillSolid'
  | 'skewBadge'
  | 'tapeSticker'
  | 'hollowStroke'
  | 'chromaticSplit'
  | 'goldFoil'
  | 'silverChrome'
  | 'fireAura'
  | 'comicPop'
  | 'retroLongShadow'
  | 'pulseHalo'
  | 'shimmerSweep'
  | 'topBarAccent'
  | 'circleLoop';

export type TransitionPresetId =
  | 'fade'
  | 'slideUpOut'
  | 'slideDownOut'
  | 'slideLeftOut'
  | 'slideRightOut'
  | 'zoomOutShrink'
  | 'zoomInBurst'
  | 'blurDissolve'
  | 'glitchCut'
  | 'wipeLeft'
  | 'wipeRight'
  | 'splitCurtainOut'
  | 'flipOut'
  | 'scatterBlow'
  | 'dropGravity'
  | 'spinShrink'
  | 'flashCut'
  | 'none';

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
  | 'audioBars'
  | 'rainyNight'
  | 'warmEmbers'
  | 'noirSpotlight'
  | 'goldenMist';

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

export interface WordTiming {
  startSec: number;
  endSec: number;
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
  /** Optional per-word exact timeline timestamps (seconds) */
  wordTimings?: WordTiming[] | null;
  /** Optional per-cue overrides */
  customPos?: { x: number; y: number } | null; // normalized 0..1
  customAlign?: TextAlignMode | null;
  customAnimation?: AnimationPresetId | null;
  customTransition?: TransitionPresetId | null;
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
  transition?: TransitionPresetId;
  inSpeed: number; // 0.3..2.5
  outFadeSec: number; // 0..0.7
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

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface WatermarkConfig {
  enabled: boolean;
  imageDataUrl: string | null;
  name?: string | null;
  position: WatermarkPosition;
  scale: number; // 0.06..0.28 fraction of canvas short edge
  opacity: number; // 0.1..1
  marginPx: number; // 16..96 ref px at 1080
}

export interface ProgressBarConfig {
  enabled: boolean;
  position: 'top' | 'bottom';
  style: 'bar' | 'pill' | 'glow';
  heightPx: number; // 4..20 ref px at 1080
  color: string;
  trackColor: string;
  opacity: number; // 0.2..1
}

export interface SoundscapeConfig {
  enabled: boolean;
  presetId?: string | null;
  layers: Record<string, number>;
}

export interface StudioProject {
  name: string;
  aspectRatio: AspectRatioId;
  cues: SubtitleCue[];
  typography: TypographyConfig;
  motion: MotionConfig;
  background: BackgroundConfig;
  effects?: EffectsConfig;
  watermark?: WatermarkConfig;
  progressBar?: ProgressBarConfig;
  soundscape?: SoundscapeConfig;
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

export const VIDEO_FONTS: { id: string; label: string; category: string }[] =
  CURATED_GOOGLE_FONTS.map((f) => ({
    id: f.id,
    label: f.label,
    category: f.category,
  }));

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
  { id: 'marqueeRun', name: 'Marquee Ticker', desc: 'Chữ chạy băng chuyền ngang liên tục' },
  { id: 'cascadeFall', name: 'Matrix Cascade', desc: 'Thác đổ trượt dọc nối đuôi nhau' },
  { id: 'stretchSnap', name: 'Whip Stretch', desc: 'Kéo giãn tốc độ cao giật khựng sắc' },
  { id: 'stampImpact', name: 'Heavy Stamp', desc: 'Đóng dấu mộc mạnh kèm rung chấn' },
  { id: 'horizonSkew', name: 'Speed Skew', desc: 'Nghiêng tốc độ lao ngang phanh gấp' },
  { id: 'heartbeatBeat', name: 'Heartbeat Pulse', desc: 'Phóng nhịp tim đập hòa theo Beat' },
  { id: 'revealWipe', name: 'Laser Wipe', desc: 'Quét tia sáng mở dần từng từ sắc nét' },
  { id: 'spiralTwist', name: '3D Twist', desc: 'Xoay vặn trục 3D thu phóng tiến vào' },
  { id: 'dominoTilt', name: 'Domino Knock', desc: 'Đổ domino nối tiếp rồi đứng thẳng' },
  { id: 'floatDrift', name: 'Cinema Drift', desc: 'Trôi bồng bềnh điện ảnh nhẹ nhàng' },
  { id: 'inkReveal', name: 'Ink Blossom', desc: 'Thấm mực mềm mại kiểu cổ phong, thơ ca' },
  { id: 'cinemaFade', name: 'Cinema Fade', desc: 'Hiện chậm điện ảnh tinh tế, trang trọng' },
  { id: 'whisperRise', name: 'Whisper Float', desc: 'Nổi nhẹ thì thầm cho tâm sự, chữa lành' },
  { id: 'bookTurn', name: 'Page Unfold', desc: 'Mở trang sách lịch lãm cho sách nói' },
  { id: 'spotlightWord', name: 'Word Spotlight', desc: 'Rọi sáng từng từ theo nhịp kể chuyện' },
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
  {
    id: 'rainyNight',
    name: 'Mưa Đêm Tâm Sự',
    desc: 'Hạt mưa rơi chéo kèm ánh đèn bokeh đêm',
    defaults: { primary: '#070B14', secondary: '#132033', accent: '#38BDF8' },
  },
  {
    id: 'warmEmbers',
    name: 'Đom Đóm & Lửa Ấm',
    desc: 'Đom đóm vàng ấm bay bổng truyện đêm khuya',
    defaults: { primary: '#120A07', secondary: '#2B160C', accent: '#F59E0B' },
  },
  {
    id: 'noirSpotlight',
    name: 'Đèn Điều Tra Noir',
    desc: 'Luồng đèn sân khấu quét bụi mờ bí ẩn',
    defaults: { primary: '#06070A', secondary: '#181B22', accent: '#EF4444' },
  },
  {
    id: 'goldenMist',
    name: 'Sương Mù Cổ Phong',
    desc: 'Làn sương bình minh trôi nhẹ thanh tịnh',
    defaults: { primary: '#14110E', secondary: '#2E251B', accent: '#EAB308' },
  },
];

export type EmphasisCategory = 'colorFx' | 'badge' | 'lineDraw' | 'dimension';

export const EMPHASIS_STYLE_PRESETS: {
  id: EmphasisStyle;
  label: string;
  category: EmphasisCategory;
}[] = [
  { id: 'color', label: 'Đổi màu', category: 'colorFx' },
  { id: 'scaleColor', label: 'Phóng to + Màu', category: 'colorFx' },
  { id: 'glow', label: 'Phát sáng Glow', category: 'colorFx' },
  { id: 'neonTube', label: 'Đèn Neon kép', category: 'colorFx' },
  { id: 'pulseHalo', label: 'Nhịp đập hào quang', category: 'colorFx' },
  { id: 'fireAura', label: 'Hào quang rực cháy', category: 'colorFx' },
  { id: 'gradientFill', label: 'Chuyển sắc Gradient', category: 'colorFx' },
  { id: 'shimmerSweep', label: 'Tia sáng lướt chữ', category: 'colorFx' },
  { id: 'highlightBox', label: 'Khối Highlight', category: 'badge' },
  { id: 'pillSolid', label: 'Thẻ Pill bo tròn', category: 'badge' },
  { id: 'outlineBadge', label: 'Khung viền Pill', category: 'badge' },
  { id: 'skewBadge', label: 'Nhãn nghiêng tốc độ', category: 'badge' },
  { id: 'tapeSticker', label: 'Miếng dán Sticker', category: 'badge' },
  { id: 'markerHighlight', label: 'Bút dạ quang', category: 'badge' },
  { id: 'topBarAccent', label: 'Thanh nhấn đỉnh đầu', category: 'badge' },
  { id: 'underlineSweep', label: 'Gạch chân chạy', category: 'lineDraw' },
  { id: 'brushUnderline', label: 'Nét cọ gạch chân', category: 'lineDraw' },
  { id: 'doubleUnderline', label: 'Gạch chân kép', category: 'lineDraw' },
  { id: 'wavyUnderline', label: 'Gạch sóng uốn', category: 'lineDraw' },
  { id: 'strikeEmphasis', label: 'Gạch ngang kịch tính', category: 'lineDraw' },
  { id: 'bracketTag', label: 'Ngoặc vuông [Tag]', category: 'lineDraw' },
  { id: 'cornerFrame', label: 'Khung ngắm Focus', category: 'lineDraw' },
  { id: 'circleLoop', label: 'Khoanh tròn bút mực', category: 'lineDraw' },
  { id: 'doubleShadow', label: 'Bóng nổi 3D', category: 'dimension' },
  { id: 'retroLongShadow', label: 'Bóng dài Retro 45°', category: 'dimension' },
  { id: 'comicPop', label: 'Truyện tranh Pop', category: 'dimension' },
  { id: 'hollowStroke', label: 'Chữ rỗng viền sáng', category: 'dimension' },
  { id: 'chromaticSplit', label: 'Tách kênh RGB', category: 'dimension' },
  { id: 'goldFoil', label: 'Vàng ánh kim', category: 'dimension' },
  { id: 'silverChrome', label: 'Kim loại Chrome', category: 'dimension' },
];

export type TransitionCategory = 'smooth' | 'directional' | 'kinetic' | 'fx';

export const TRANSITION_PRESETS: {
  id: TransitionPresetId;
  name: string;
  desc: string;
  category: TransitionCategory;
}[] = [
  { id: 'fade', name: 'Mờ dần mượt', desc: 'Chuyển cảnh tan mờ tự nhiên', category: 'smooth' },
  { id: 'blurDissolve', name: 'Tan mờ điện ảnh', desc: 'Làm mờ ống kính trước khi chuyển câu', category: 'smooth' },
  { id: 'none', name: 'Cắt dứt khoát', desc: 'Chuyển câu tức thì không trễ nhịp', category: 'smooth' },
  { id: 'slideUpOut', name: 'Trượt lên trên', desc: 'Lướt nhẹ lên trên biến mất', category: 'directional' },
  { id: 'slideDownOut', name: 'Hạ xuống dưới', desc: 'Chìm nhẹ xuống dưới gọn gàng', category: 'directional' },
  { id: 'slideLeftOut', name: 'Vút sang trái', desc: 'Lao ngang sang trái tốc độ cao', category: 'directional' },
  { id: 'slideRightOut', name: 'Vút sang phải', desc: 'Lao ngang sang phải tốc độ cao', category: 'directional' },
  { id: 'wipeLeft', name: 'Quét màn che trái', desc: 'Màn chắn quét xóa sắc nét từ phải qua trái', category: 'directional' },
  { id: 'wipeRight', name: 'Quét màn che phải', desc: 'Màn chắn quét xóa sắc nét từ trái qua phải', category: 'directional' },
  { id: 'zoomOutShrink', name: 'Thu nhỏ vào tâm', desc: 'Thu gọn mượt về tâm khung hình', category: 'kinetic' },
  { id: 'zoomInBurst', name: 'Phóng xuyên camera', desc: 'Phóng to bứt phá qua ống kính', category: 'kinetic' },
  { id: 'splitCurtainOut', name: 'Khép rèm hai bên', desc: 'Tách chữ dạt sang hai phía khung hình', category: 'kinetic' },
  { id: 'flipOut', name: 'Lật thẻ biến mất', desc: 'Gập phẳng 3D theo trục ngang', category: 'kinetic' },
  { id: 'dropGravity', name: 'Rơi tự do trọng lực', desc: 'Từng từ rơi nhanh dần theo trọng lực', category: 'kinetic' },
  { id: 'spinShrink', name: 'Xoay vòng thu nhỏ', desc: 'Xoay nghiêng và thu nhỏ biến mất', category: 'kinetic' },
  { id: 'scatterBlow', name: 'Thổi tan nhiều hướng', desc: 'Các từ bay tản mát theo nhiều góc', category: 'fx' },
  { id: 'glitchCut', name: 'Nhiễu tách kênh RGB', desc: 'Rung giật tách kênh trước khi cắt cảnh', category: 'fx' },
  { id: 'flashCut', name: 'Chớp sáng chuyển cảnh', desc: 'Bừng sáng nhẹ một nhịp rồi chuyển câu', category: 'fx' },
];


