export interface FontOption {
  id: string;
  label: string;
  category: 'Display' | 'Sans' | 'Serif' | 'Script' | 'Mono';
  weights?: string;
}

/**
 * Curated Google Fonts verified to support Vietnamese diacritics cleanly.
 */
export const CURATED_GOOGLE_FONTS: FontOption[] = [
  // Display / Poster Impact
  { id: 'Anton', label: 'Anton', category: 'Display', weights: '400' },
  { id: 'Archivo Black', label: 'Archivo Black', category: 'Display', weights: '400' },
  { id: 'Oswald', label: 'Oswald', category: 'Display', weights: '400;500;600;700' },
  { id: 'Saira Condensed', label: 'Saira Condensed', category: 'Display', weights: '400;600;700;800;900' },
  { id: 'Barlow Condensed', label: 'Barlow Condensed', category: 'Display', weights: '500;600;700;800;900' },
  { id: 'Bungee', label: 'Bungee', category: 'Display', weights: '400' },
  { id: 'Phudu', label: 'Phudu', category: 'Display', weights: '400;600;700;800;900' },
  { id: 'Rowdies', label: 'Rowdies', category: 'Display', weights: '400;700' },
  { id: 'Paytone One', label: 'Paytone One', category: 'Display', weights: '400' },
  { id: 'Tilt Warp', label: 'Tilt Warp', category: 'Display', weights: '400' },

  // Modern & Kinetic Sans
  { id: 'Be Vietnam Pro', label: 'Be Vietnam Pro', category: 'Sans', weights: '400;500;600;700;800;900' },
  { id: 'Montserrat', label: 'Montserrat', category: 'Sans', weights: '400;500;600;700;800;900' },
  { id: 'Bricolage Grotesque', label: 'Bricolage Grotesque', category: 'Sans', weights: '400;600;700;800' },
  { id: 'Archivo', label: 'Archivo', category: 'Sans', weights: '400;500;600;700;800;900' },
  { id: 'Manrope', label: 'Manrope', category: 'Sans', weights: '400;600;700;800' },
  { id: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', category: 'Sans', weights: '400;500;600;700;800' },
  { id: 'Space Grotesk', label: 'Space Grotesk', category: 'Sans', weights: '400;500;600;700' },
  { id: 'Kanit', label: 'Kanit', category: 'Sans', weights: '400;500;600;700;800;900' },
  { id: 'Lexend', label: 'Lexend', category: 'Sans', weights: '400;500;600;700;800;900' },
  { id: 'Quicksand', label: 'Quicksand', category: 'Sans', weights: '400;500;600;700' },
  { id: 'Comfortaa', label: 'Comfortaa', category: 'Sans', weights: '400;600;700' },
  { id: 'Nunito', label: 'Nunito', category: 'Sans', weights: '400;600;700;800;900' },
  { id: 'Unbounded', label: 'Unbounded', category: 'Sans', weights: '400;600;700;800;900' },

  // Editorial Serif
  { id: 'Playfair Display', label: 'Playfair Display', category: 'Serif', weights: '400;600;700;800;900' },
  { id: 'Fraunces', label: 'Fraunces', category: 'Serif', weights: '400;600;700;800;900' },
  { id: 'Lora', label: 'Lora', category: 'Serif', weights: '400;600;700' },
  { id: 'Merriweather', label: 'Merriweather', category: 'Serif', weights: '400;700;900' },
  { id: 'Cormorant Garamond', label: 'Cormorant Garamond', category: 'Serif', weights: '500;600;700' },
  { id: 'Yeseva One', label: 'Yeseva One', category: 'Serif', weights: '400' },

  // Script & Handwritten
  { id: 'Dancing Script', label: 'Dancing Script', category: 'Script', weights: '400;600;700' },
  { id: 'Pacifico', label: 'Pacifico', category: 'Script', weights: '400' },
  { id: 'Caveat', label: 'Caveat', category: 'Script', weights: '400;600;700' },
  { id: 'Patrick Hand', label: 'Patrick Hand', category: 'Script', weights: '400' },
  { id: 'Pangolin', label: 'Pangolin', category: 'Script', weights: '400' },

  // Tech & Monospace
  { id: 'Chakra Petch', label: 'Chakra Petch', category: 'Mono', weights: '400;500;600;700' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono', category: 'Mono', weights: '400;500;600;700;800' },
  { id: 'Space Mono', label: 'Space Mono', category: 'Mono', weights: '400;700' },
  { id: 'VT323', label: 'VT323', category: 'Mono', weights: '400' },
];

const CUSTOM_FONTS_STORAGE_KEY = 'kinetik_custom_google_fonts_v1';
const loadedFontPromises = new Map<string, Promise<boolean>>();
const fontReadyListeners = new Set<() => void>();

export function onFontLoaded(cb: () => void): () => void {
  fontReadyListeners.add(cb);
  return () => {
    fontReadyListeners.delete(cb);
  };
}

function notifyFontsUpdated() {
  for (const cb of fontReadyListeners) {
    try {
      cb();
    } catch {
      // ignore listener errors
    }
  }
}

export function getStoredCustomFonts(): FontOption[] {
  try {
    const raw = localStorage.getItem(CUSTOM_FONTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((name) => ({ id: name, label: name, category: 'Sans' as const }));
  } catch {
    return [];
  }
}

export function saveCustomGoogleFont(fontName: string): FontOption[] {
  const clean = fontName.trim().replace(/\s+/g, ' ');
  if (!clean) return getStoredCustomFonts();
  const existing = getStoredCustomFonts().map((f) => f.id);
  if (!existing.some((n) => n.toLowerCase() === clean.toLowerCase())) {
    const next = [clean, ...existing].slice(0, 30);
    try {
      localStorage.setItem(CUSTOM_FONTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return getStoredCustomFonts();
}

export function removeCustomGoogleFont(fontName: string): FontOption[] {
  const next = getStoredCustomFonts()
    .map((f) => f.id)
    .filter((n) => n.toLowerCase() !== fontName.toLowerCase());
  try {
    localStorage.setItem(CUSTOM_FONTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return getStoredCustomFonts();
}

function injectStylesheet(id: string, href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      resolve(true);
      return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    document.head.appendChild(link);
  });
}

/**
 * Dynamically loads a Google Font family into document.fonts so Canvas 2D
 * and React UI render it cleanly without bloating initial page load.
 */
export function ensureGoogleFontLoaded(fontFamily: string): Promise<boolean> {
  const clean = fontFamily.trim();
  if (!clean || clean === 'sans-serif' || clean === 'serif' || clean === 'monospace') {
    return Promise.resolve(true);
  }

  const key = clean.toLowerCase();
  const cached = loadedFontPromises.get(key);
  if (cached) return cached;

  const task = (async () => {
    try {
      const curated = CURATED_GOOGLE_FONTS.find((f) => f.id.toLowerCase() === key);
      const encodedName = encodeURIComponent(clean).replace(/%20/g, '+');
      const linkId = `gf-${key.replace(/[^a-z0-9]+/g, '-')}`;

      // Try curated weights or standard weight axis first, fall back to plain family query
      const weights = curated?.weights ?? '400;500;600;700;800;900';
      const weightedUrl =
        weights === '400'
          ? `https://fonts.googleapis.com/css2?family=${encodedName}&display=swap`
          : `https://fonts.googleapis.com/css2?family=${encodedName}:wght@${weights}&display=swap`;

      let ok = await injectStylesheet(linkId, weightedUrl);
      if (!ok && weights !== '400') {
        ok = await injectStylesheet(
          `${linkId}-base`,
          `https://fonts.googleapis.com/css2?family=${encodedName}&display=swap`
        );
      }

      if (!ok || !('fonts' in document)) return false;

      // Trigger browser download of common weights used in Canvas 2D
      await Promise.allSettled([
        document.fonts.load(`400 48px "${clean}"`),
        document.fonts.load(`700 48px "${clean}"`),
        document.fonts.load(`900 48px "${clean}"`),
      ]);
      await document.fonts.ready;
      notifyFontsUpdated();
      return true;
    } catch {
      return false;
    }
  })();

  loadedFontPromises.set(key, task);
  return task;
}

export async function preloadProjectFonts(fontNames: (string | null | undefined)[]): Promise<void> {
  const unique = new Set<string>();
  for (const name of fontNames) {
    if (name && name.trim()) unique.add(name.trim());
  }
  await Promise.allSettled(Array.from(unique).map((f) => ensureGoogleFontLoaded(f)));
}
