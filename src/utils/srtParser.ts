import { SubtitleCue, WordStyleOverride } from '../types/studio';

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
