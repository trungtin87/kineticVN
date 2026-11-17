import { SubtitleCue, WordStyleOverride, WordTiming } from '../types/studio';

function parseSrtTimestamp(ts: string): number {
  const cleaned = ts.trim().replace(',', '.');
  const parts = cleaned.split(':');
  if (parts.length === 3) {
    const h = Number(parts[0]) || 0;
    const m = Number(parts[1]) || 0;
    const s = Number(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = Number(parts[0]) || 0;
    const s = Number(parts[1]) || 0;
    return m * 60 + s;
  }
  return Number(cleaned) || 0;
}

export function formatSrtTimestamp(sec: number): string {
  const safe = Math.max(0, sec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const pad3 = (n: number) => String(n).padStart(3, '0');
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

export function formatTimecodeShort(sec: number): string {
  const safe = Math.max(0, sec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe - Math.floor(safe)) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export interface ParsedWordToken {
  word: string;
  wordIndex: number;
  lineIndex: number;
}

/**
 * Splits cue text by explicit line breaks (\n), then extracts word tokens
 * preserving a deterministic flat wordIndex across the cue.
 */
export function tokenizeCueText(text: string): {
  lines: ParsedWordToken[][];
  flatWords: ParsedWordToken[];
} {
  const rawLines = text.split('\n');
  const lines: ParsedWordToken[][] = [];
  const flatWords: ParsedWordToken[] = [];
  let wordIndex = 0;

  rawLines.forEach((rawLine, lineIndex) => {
    const tokens = rawLine
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const lineTokens: ParsedWordToken[] = tokens.map((word) => {
      const token: ParsedWordToken = { word, wordIndex, lineIndex };
      flatWords.push(token);
      wordIndex++;
      return token;
    });

    lines.push(lineTokens);
  });

  return { lines, flatWords };
}

/**
 * Automatically inserts clean line breaks into cue text every N words
 * or balances into two lines.
 */
export function autoWrapCueText(text: string, maxWordsPerLine: number): string {
  const words = text.replace(/\n+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWordsPerLine) return words.join(' ');
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWordsPerLine) {
    chunks.push(words.slice(i, i + maxWordsPerLine).join(' '));
  }
  return chunks.join('\n');
}

export function balanceTwoLines(text: string): string {
  const words = text.replace(/\n+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words.join(' ');
  const totalChars = words.reduce((acc, w) => acc + w.length, 0) + words.length - 1;
  const target = totalChars / 2;
  let bestSplit = 1;
  let bestDiff = Infinity;
  let running = 0;
  for (let i = 0; i < words.length - 1; i++) {
    running += words[i].length + (i > 0 ? 1 : 0);
    const diff = Math.abs(running - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i + 1;
    }
  }
  return `${words.slice(0, bestSplit).join(' ')}\n${words.slice(bestSplit).join(' ')}`;
}

/**
 * Parses an SRT string into SubtitleCue[].
 * Also supports inline [word] or *word* syntax to auto-mark emphasis on import!
 */
export function parseSrt(srtContent: string): SubtitleCue[] {
  const normalized = srtContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd());
    if (lines.length === 0) continue;

    let timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    const indexLine = timeLineIdx > 0 ? lines[timeLineIdx - 1].trim() : '';
    const parsedIndex = Number(indexLine) || cues.length + 1;

    const [startRaw, endRaw] = lines[timeLineIdx].split('-->').map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    // Strip any trailing cue settings after timestamp (e.g. "00:00:02,000 align:center")
    const startSec = parseSrtTimestamp(startRaw.split(/\s+/)[0]);
    const endSec = Math.max(startSec + 0.15, parseSrtTimestamp(endRaw.split(/\s+/)[0]));

    const textLines = lines
      .slice(timeLineIdx + 1)
      .map((l) => l.replace(/<\/?[^>]+(>|$)/g, '').trim())
      .filter((l, idx, arr) => l.length > 0 || (idx > 0 && idx < arr.length - 1));

    const wordStyles: Record<number, WordStyleOverride> = {};
    let flatIdx = 0;

    const cleanedLines = textLines.map((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      const cleanedWords = words.map((w) => {
        // Support *word* or [word] emphasis markers in imported SRT
        const bracketMatch = w.match(/^\[(.+)\]$/);
        const starMatch = w.match(/^\*(.+)\*$/);
        if (bracketMatch || starMatch) {
          wordStyles[flatIdx] = { emphasized: true };
          flatIdx++;
          return (bracketMatch?.[1] ?? starMatch?.[1]) || w;
        }
        flatIdx++;
        return w;
      });
      return cleanedWords.join(' ');
    });

    cues.push({
      id: `cue-${Date.now()}-${cues.length}-${Math.random().toString(36).slice(2, 6)}`,
      index: parsedIndex,
      startSec,
      endSec,
      text: cleanedLines.join('\n') || '...',
      wordStyles,
    });
  }

  return cues.sort((a, b) => a.startSec - b.startSec);
}

export function exportSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, idx) => {
      return `${idx + 1}\n${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}\n${cue.text}`;
    })
    .join('\n\n');
}

export function distributeWordTimingsEvenly(cue: SubtitleCue): WordTiming[] {
  const { flatWords } = tokenizeCueText(cue.text);
  const count = flatWords.length;
  if (count === 0) return [];
  const dur = Math.max(0.15, cue.endSec - cue.startSec);
  const step = dur / count;
  return flatWords.map((_, idx) => ({
    startSec: Number((cue.startSec + idx * step).toFixed(3)),
    endSec: Number((cue.startSec + (idx + 1) * step).toFixed(3)),
  }));
}

export function splitCueAtTime(
  cue: SubtitleCue,
  playheadSec: number
): [SubtitleCue, SubtitleCue] | null {
  const dur = cue.endSec - cue.startSec;
  if (dur < 0.35) return null;

  const { flatWords } = tokenizeCueText(cue.text);
  const minBoundary = cue.startSec + 0.15;
  const maxBoundary = cue.endSec - 0.15;
  const splitTime =
    playheadSec > minBoundary && playheadSec < maxBoundary
      ? Number(playheadSec.toFixed(2))
      : Number((cue.startSec + dur * 0.5).toFixed(2));

  if (flatWords.length < 2) {
    const first: SubtitleCue = {
      ...cue,
      endSec: splitTime,
      wordTimings: null,
    };
    const second: SubtitleCue = {
      ...cue,
      id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startSec: splitTime,
      endSec: cue.endSec,
      wordStyles: {},
      wordTimings: null,
    };
    return [first, second];
  }

  let splitWordCount = Math.round(((splitTime - cue.startSec) / dur) * flatWords.length);
  if (cue.wordTimings && cue.wordTimings.length === flatWords.length) {
    const foundIdx = cue.wordTimings.findIndex((wt) => wt.startSec >= splitTime);
    if (foundIdx >= 1 && foundIdx < flatWords.length) {
      splitWordCount = foundIdx;
    }
  }
  splitWordCount = Math.max(1, Math.min(flatWords.length - 1, splitWordCount));

  const firstText = flatWords
    .slice(0, splitWordCount)
    .map((w) => w.word)
    .join(' ');
  const secondText = flatWords
    .slice(splitWordCount)
    .map((w) => w.word)
    .join(' ');

  const firstStyles: Record<number, WordStyleOverride> = {};
  const secondStyles: Record<number, WordStyleOverride> = {};
  for (const [kStr, style] of Object.entries(cue.wordStyles)) {
    const k = Number(kStr);
    if (k < splitWordCount) {
      firstStyles[k] = style;
    } else {
      secondStyles[k - splitWordCount] = style;
    }
  }

  const firstTimings =
    cue.wordTimings && cue.wordTimings.length === flatWords.length
      ? cue.wordTimings.slice(0, splitWordCount)
      : null;
  const secondTimings =
    cue.wordTimings && cue.wordTimings.length === flatWords.length
      ? cue.wordTimings.slice(splitWordCount)
      : null;

  const firstCue: SubtitleCue = {
    ...cue,
    endSec: splitTime,
    text: firstText,
    wordStyles: firstStyles,
    wordTimings: firstTimings,
  };
  const secondCue: SubtitleCue = {
    ...cue,
    id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    index: cue.index + 1,
    startSec: splitTime,
    endSec: cue.endSec,
    text: secondText,
    wordStyles: secondStyles,
    wordTimings: secondTimings,
  };

  return [firstCue, secondCue];
}

export function mergeCues(first: SubtitleCue, second: SubtitleCue): SubtitleCue {
  const { flatWords: firstWords } = tokenizeCueText(first.text);
  const { flatWords: secondWords } = tokenizeCueText(second.text);
  const offset = firstWords.length;

  const mergedStyles: Record<number, WordStyleOverride> = { ...first.wordStyles };
  for (const [kStr, style] of Object.entries(second.wordStyles)) {
    mergedStyles[Number(kStr) + offset] = style;
  }

  let mergedTimings: WordTiming[] | null = null;
  if (first.wordTimings || second.wordTimings) {
    const a =
      first.wordTimings && first.wordTimings.length === firstWords.length
        ? first.wordTimings
        : distributeWordTimingsEvenly(first);
    const b =
      second.wordTimings && second.wordTimings.length === secondWords.length
        ? second.wordTimings
        : distributeWordTimingsEvenly(second);
    mergedTimings = [...a, ...b];
  }

  return {
    ...first,
    startSec: Math.min(first.startSec, second.startSec),
    endSec: Math.max(first.endSec, second.endSec),
    text: `${first.text.trim()}\n${second.text.trim()}`.trim(),
    wordStyles: mergedStyles,
    wordTimings: mergedTimings,
  };
}

interface RawWordItem {
  word?: string;
  text?: string;
  start?: number;
  end?: number;
  startSec?: number;
  endSec?: number;
}

/**
 * Parses Whisper / AssemblyAI / flat word-timestamp JSON into SubtitleCue[]
 * preserving exact per-word startSec/endSec inside `wordTimings`.
 */
export function parseWordTimestampsJson(rawJson: string): SubtitleCue[] {
  const data = JSON.parse(rawJson);

  const normalizeWord = (w: RawWordItem): { word: string; start: number; end: number } | null => {
    const text = String(w.word ?? w.text ?? '').trim();
    if (!text) return null;
    let start = Number(w.startSec ?? w.start ?? 0);
    let end = Number(w.endSec ?? w.end ?? start + 0.25);
    // Support AssemblyAI millisecond timestamps heuristic
    if (start > 10000 || end > 10000) {
      start /= 1000;
      end /= 1000;
    }
    return { word: text, start: Math.max(0, start), end: Math.max(start + 0.05, end) };
  };

  // Case 1: Whisper segments [{ start, end, text, words: [...] }]
  if (data && Array.isArray(data.segments)) {
    const cues: SubtitleCue[] = [];
    for (let i = 0; i < data.segments.length; i++) {
      const seg = data.segments[i];
      const rawWords: RawWordItem[] = Array.isArray(seg.words) ? seg.words : [];
      const normWords = rawWords.map(normalizeWord).filter((x): x is NonNullable<typeof x> => Boolean(x));

      if (normWords.length > 0) {
        cues.push({
          id: `cue-wt-${Date.now()}-${i}`,
          index: i + 1,
          startSec: Number((seg.start ?? normWords[0].start).toFixed(3)),
          endSec: Number((seg.end ?? normWords[normWords.length - 1].end).toFixed(3)),
          text: autoWrapCueText(normWords.map((w) => w.word).join(' '), 4),
          wordStyles: {},
          wordTimings: normWords.map((w) => ({
            startSec: Number(w.start.toFixed(3)),
            endSec: Number(w.end.toFixed(3)),
          })),
        });
      } else if (typeof seg.text === 'string' && seg.text.trim()) {
        cues.push({
          id: `cue-wt-${Date.now()}-${i}`,
          index: i + 1,
          startSec: Number(seg.start ?? 0),
          endSec: Math.max(Number(seg.start ?? 0) + 0.2, Number(seg.end ?? 2)),
          text: seg.text.trim(),
          wordStyles: {},
        });
      }
    }
    if (cues.length > 0) return cues;
  }

  // Case 2: Flat word list ({ words: [...] } or [...])
  const flatInput: RawWordItem[] = Array.isArray(data?.words)
    ? data.words
    : Array.isArray(data)
    ? data
    : [];

  const normAll = flatInput.map(normalizeWord).filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (normAll.length > 0) {
    const cues: SubtitleCue[] = [];
    const CHUNK_SIZE = 5;
    for (let i = 0; i < normAll.length; i += CHUNK_SIZE) {
      const group = normAll.slice(i, i + CHUNK_SIZE);
      cues.push({
        id: `cue-wt-${Date.now()}-${cues.length}`,
        index: cues.length + 1,
        startSec: Number(group[0].start.toFixed(3)),
        endSec: Number(group[group.length - 1].end.toFixed(3)),
        text: balanceTwoLines(group.map((w) => w.word).join(' ')),
        wordStyles: {},
        wordTimings: group.map((w) => ({
          startSec: Number(w.start.toFixed(3)),
          endSec: Number(w.end.toFixed(3)),
        })),
      });
    }
    return cues;
  }

  throw new Error('Không tìm thấy dữ liệu word timestamps hợp lệ trong JSON.');
}

