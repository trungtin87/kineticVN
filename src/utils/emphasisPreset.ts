import { TypographyConfig, WordStyleOverride } from '../types/studio';

export const LAST_EMPHASIS_STORAGE_KEY = 'hoattu_last_emphasis_preset_v1';

export function loadLastEmphasisPreset(): WordStyleOverride | null {
  try {
    const raw = localStorage.getItem(LAST_EMPHASIS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WordStyleOverride;
    if (parsed && typeof parsed === 'object') {
      return { ...parsed, emphasized: true };
    }
  } catch {
    // Ignore storage read issues
  }
  return null;
}

export function saveLastEmphasisPreset(preset: WordStyleOverride | null) {
  try {
    if (!preset) {
      localStorage.removeItem(LAST_EMPHASIS_STORAGE_KEY);
    } else {
      localStorage.setItem(
        LAST_EMPHASIS_STORAGE_KEY,
        JSON.stringify({ ...preset, emphasized: true })
      );
    }
  } catch {
    // Ignore storage write issues
  }
}

export function resolveEmphasisTemplate(
  preset: WordStyleOverride | null,
  typography: Pick<TypographyConfig, 'emphasisColor' | 'emphasisStyle'>
): WordStyleOverride {
  return {
    emphasized: true,
    color: preset?.color || typography.emphasisColor,
    style: preset?.style || typography.emphasisStyle,
    ...(preset?.scale !== undefined ? { scale: preset.scale } : {}),
    ...(preset?.fontFamily ? { fontFamily: preset.fontFamily } : {}),
    ...(preset?.fontWeight ? { fontWeight: preset.fontWeight } : {}),
    ...(preset?.rotateDeg !== undefined ? { rotateDeg: preset.rotateDeg } : {}),
    ...(preset?.offsetY !== undefined ? { offsetY: preset.offsetY } : {}),
    ...(preset?.bgColor ? { bgColor: preset.bgColor } : {}),
    ...(preset?.uppercase !== undefined ? { uppercase: preset.uppercase } : {}),
  };
}
