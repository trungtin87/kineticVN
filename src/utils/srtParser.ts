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
 * Maps a character selection range [selStart, selEnd] inside cue.text
 * to the matching flat word indices produced by tokenizeCueText.
 */
export function findWordIndicesInTextRange(
  text: string,
  selStart: number,
  selEnd: number
): number[] {
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);
  if (end <= start) return [];

  const matched: number[] = [];
  const lines = text.split('\n');
  let charOffset = 0;
  let wordIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const regex = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      const tokStart = charOffset + m.index;
      const tokEnd = tokStart + m[0].length;
      if (tokEnd > start && tokStart < end) {
        matched.push(wordIndex);
      }
      wordIndex++;
    }
    charOffset += line.length + 1;
  }
  return matched;
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

function parseLineInlineEmphasis(
  rawLine: string,
  emphasisTemplate?: WordStyleOverride
): { cleanedLine: string; emphasizedIndices: number[] } {
  // Normalize whitespace just inside brackets: "[ từ ]" -> "[từ]"
  const norm = rawLine.replace(/\[\s*([^\[\]]*?)\s*\]/g, '[$1]');
  const bracketSpans: { start: number; end: number }[] = [];
  const bracketRe = /\[([^\[\]]+)\]/g;
  let bm: RegExpExecArray | null;
  while ((bm = bracketRe.exec(norm)) !== null) {
    bracketSpans.push({ start: bm.index, end: bm.index + bm[0].length });
  }

  const emphasizedIndices: number[] = [];
  const tokenRe = /\S+/g;
  let tm: RegExpExecArray | null;
  let localWordIdx = 0;
  const cleanedTokens: string[] = [];

  while ((tm = tokenRe.exec(norm)) !== null) {
    const tok = tm[0];
    const tokStart = tm.index;
    const tokEnd = tokStart + tok.length;

    const inBracket = bracketSpans.some(
      (sp) => tokEnd > sp.start && tokStart < sp.end
    );
    const starMatch = !inBracket ? tok.match(/^([("'“‘]*)\*([^*]+)\*([)"'”’,.;:!?…]*)$/) : null;

    let cleanTok = tok;
    if (inBracket) {
      cleanTok = tok.replace(/[\[\]]/g, '');
      if (cleanTok.length > 0) {
        emphasizedIndices.push(localWordIdx);
      }
    } else if (starMatch) {
      cleanTok = `${starMatch[1]}${starMatch[2]}${starMatch[3]}`;
      emphasizedIndices.push(localWordIdx);
    }

    if (cleanTok.length > 0) {
      cleanedTokens.push(cleanTok);
      localWordIdx++;
    }
  }

  void emphasisTemplate;
  return {
    cleanedLine: cleanedTokens.join(' '),
    emphasizedIndices,
  };
}

/**
 * Parses an SRT string into SubtitleCue[].
 * Also supports inline [word], [multi word], or *word* syntax to auto-mark emphasis on import!
 */
export function parseSrt(
  srtContent: string,
  emphasisTemplate?: WordStyleOverride
): SubtitleCue[] {
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

    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
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
      const { cleanedLine, emphasizedIndices } = parseLineInlineEmphasis(line, emphasisTemplate);
      const tokenCount = cleanedLine ? cleanedLine.split(/\s+/).filter(Boolean).length : 0;
      for (const localIdx of emphasizedIndices) {
        wordStyles[flatIdx + localIdx] = {
          ...(emphasisTemplate || {}),
          emphasized: true,
        };
      }
      flatIdx += tokenCount;
      return cleanedLine;
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

export function exportSrt(
  cues: SubtitleCue[],
  includeEmphasisBrackets = false
): string {
  return cues
    .map((cue, idx) => {
      const body = includeEmphasisBrackets
        ? cuesToScriptText([cue]) || cue.text
        : cue.text;
      return `${idx + 1}\n${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}\n${body}`;
    })
    .join('\n\n');
}

/**
 * Converts existing SubtitleCue[] into plain-text script lines (1 cue per line),
 * wrapping contiguous emphasized words in [brackets] for fast editing.
 */
export function cuesToScriptText(cues: SubtitleCue[]): string {
  return cues
    .map((cue) => {
      const { flatWords } = tokenizeCueText(cue.text);
      if (flatWords.length === 0) return cue.text.replace(/\n+/g, ' ').trim();

      const parts: string[] = [];
      let i = 0;
      while (i < flatWords.length) {
        const isEmph = Boolean(cue.wordStyles[flatWords[i].wordIndex]?.emphasized);
        if (!isEmph) {
          parts.push(flatWords[i].word);
          i++;
        } else {
          const group: string[] = [];
          while (
            i < flatWords.length &&
            Boolean(cue.wordStyles[flatWords[i].wordIndex]?.emphasized)
          ) {
            group.push(flatWords[i].word);
            i++;
          }
          parts.push(`[${group.join(' ')}]`);
        }
      }
      return parts.join(' ');
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

export interface CursorLineToken {
  word: string;
  absStart: number;
  absEnd: number;
  emphasized: boolean;
}

export interface CursorLineInfo {
  lineIndex: number;
  totalLines: number;
  lineText: string;
  lineStart: number;
  lineEnd: number;
  activeTokenIdx: number;
  tokens: CursorLineToken[];
}

export function getCursorLineInfo(text: string, cursorPos: number): CursorLineInfo {
  const clamped = Math.max(0, Math.min(text.length, cursorPos));
  const before = text.slice(0, clamped);
  const lineIndex = before.split('\n').length - 1;
  const lineStart = before.lastIndexOf('\n') + 1;
  const nextNl = text.indexOf('\n', clamped);
  const lineEnd = nextNl === -1 ? text.length : nextNl;
  const lineText = text.slice(lineStart, lineEnd);
  const totalLines = text.split('\n').length;

  const bracketSpans: { start: number; end: number }[] = [];
  const bracketRe = /\[([^\[\]]+)\]/g;
  let bm: RegExpExecArray | null;
  while ((bm = bracketRe.exec(lineText)) !== null) {
    bracketSpans.push({
      start: lineStart + bm.index,
      end: lineStart + bm.index + bm[0].length,
    });
  }

  const tokens: CursorLineToken[] = [];
  const tokenRe = /\S+/g;
  let tm: RegExpExecArray | null;
  while ((tm = tokenRe.exec(lineText)) !== null) {
    const absStart = lineStart + tm.index;
    const absEnd = absStart + tm[0].length;
    const emphasized = bracketSpans.some((sp) => absEnd > sp.start && absStart < sp.end);
    tokens.push({
      word: tm[0].replace(/[\[\]]/g, '') || tm[0],
      absStart,
      absEnd,
      emphasized,
    });
  }

  let activeTokenIdx = tokens.findIndex((t) => clamped >= t.absStart && clamped <= t.absEnd);
  if (activeTokenIdx === -1 && tokens.length > 0) {
    const nextIdx = tokens.findIndex((t) => t.absStart > clamped);
    activeTokenIdx = nextIdx !== -1 ? nextIdx : tokens.length - 1;
  }

  return {
    lineIndex,
    totalLines,
    lineText,
    lineStart,
    lineEnd,
    activeTokenIdx,
    tokens,
  };
}

/**
 * Wraps or unwraps the word at cursor (or highlighted phrase) in [square brackets].
 * Keeps caret / selection focused cleanly so users can keep typing or toggling rapidly.
 */
export function toggleBracketAtCursor(
  text: string,
  selStart: number,
  selEnd: number
): {
  nextText: string;
  nextSelStart: number;
  nextSelEnd: number;
  action: 'wrapped' | 'unwrapped' | 'none';
  targetText: string;
} {
  const start = Math.max(0, Math.min(text.length, Math.min(selStart, selEnd)));
  const end = Math.max(0, Math.min(text.length, Math.max(selStart, selEnd)));

  const lineStart = text.slice(0, start).lastIndexOf('\n') + 1;
  const nextNl = text.indexOf('\n', start);
  const lineEnd = nextNl === -1 ? text.length : nextNl;
  const lineText = text.slice(lineStart, lineEnd);

  const bracketSpans: { start: number; end: number }[] = [];
  const bracketRe = /\[([^\[\]]+)\]/g;
  let bm: RegExpExecArray | null;
  while ((bm = bracketRe.exec(lineText)) !== null) {
    bracketSpans.push({
      start: lineStart + bm.index,
      end: lineStart + bm.index + bm[0].length,
    });
  }

  // Case A: User highlighted a range of text
  if (end > start) {
    // Clamp selection to the starting line if it accidentally crossed newline
    const effectiveEnd = Math.min(end, lineEnd);
    let trimStart = start;
    let trimEnd = effectiveEnd;
    while (trimStart < trimEnd && /\s/.test(text[trimStart])) trimStart++;
    while (trimEnd > trimStart && /\s/.test(text[trimEnd - 1])) trimEnd--;

    if (trimEnd <= trimStart) {
      return {
        nextText: text,
        nextSelStart: start,
        nextSelEnd: end,
        action: 'none',
        targetText: '',
      };
    }

    // Expand partial word selection cleanly to whole token boundaries (unless it's [ or ])
    while (trimStart > lineStart && /\S/.test(text[trimStart - 1]) && text[trimStart - 1] !== '[') {
      trimStart--;
    }
    while (trimEnd < lineEnd && /\S/.test(text[trimEnd]) && text[trimEnd] !== ']') {
      trimEnd++;
    }

    // Check if selection sits inside or wraps an existing [bracketed] span
    const containingSpan = bracketSpans.find(
      (sp) => trimEnd > sp.start && trimStart < sp.end
    );
    if (containingSpan) {
      const inner = text.slice(containingSpan.start + 1, containingSpan.end - 1);
      const nextText =
        text.slice(0, containingSpan.start) + inner + text.slice(containingSpan.end);
      return {
        nextText,
        nextSelStart: containingSpan.start,
        nextSelEnd: containingSpan.start + inner.length,
        action: 'unwrapped',
        targetText: inner,
      };
    }

    const rawSlice = text.slice(trimStart, trimEnd).replace(/[\[\]]/g, '');
    if (!rawSlice.trim()) {
      return {
        nextText: text,
        nextSelStart: start,
        nextSelEnd: end,
        action: 'none',
        targetText: '',
      };
    }
    const punctMatch = rawSlice.match(/^([("'“‘«]*)(.+?)([)"'”’».,;:!?…]*)$/);
    const lead = punctMatch?.[1] || '';
    const core = punctMatch?.[2] || rawSlice;
    const trail = punctMatch?.[3] || '';
    const wrapped = `${lead}[${core}]${trail}`;
    const nextText = text.slice(0, trimStart) + wrapped + text.slice(trimEnd);
    return {
      nextText,
      nextSelStart: trimStart + wrapped.length,
      nextSelEnd: trimStart + wrapped.length,
      action: 'wrapped',
      targetText: core,
    };
  }

  // Case B: Collapsed cursor -> detect word at cursor
  const info = getCursorLineInfo(text, start);
  if (info.tokens.length === 0 || info.activeTokenIdx < 0) {
    return {
      nextText: text,
      nextSelStart: start,
      nextSelEnd: end,
      action: 'none',
      targetText: '',
    };
  }

  const tok = info.tokens[info.activeTokenIdx];
  // Check if token belongs to an existing [span]
  const span = bracketSpans.find((sp) => tok.absEnd > sp.start && tok.absStart < sp.end);
  if (span) {
    const inner = text.slice(span.start + 1, span.end - 1);
    const nextText = text.slice(0, span.start) + inner + text.slice(span.end);
    const cursorOut = Math.min(nextText.length, Math.max(span.start, start - 1));
    return {
      nextText,
      nextSelStart: cursorOut,
      nextSelEnd: cursorOut,
      action: 'unwrapped',
      targetText: inner,
    };
  }

  // Wrap token while preserving leading/trailing quotes & punctuation outside brackets
  const rawTok = text.slice(tok.absStart, tok.absEnd);
  const punctMatch = rawTok.match(/^([("'“‘«]*)(.+?)([)"'”’».,;:!?…]*)$/);
  const lead = punctMatch?.[1] || '';
  const core = punctMatch?.[2] || rawTok;
  const trail = punctMatch?.[3] || '';
  const wrapped = `${lead}[${core}]${trail}`;

  const nextText = text.slice(0, tok.absStart) + wrapped + text.slice(tok.absEnd);
  const nextCursor = tok.absStart + wrapped.length;
  return {
    nextText,
    nextSelStart: nextCursor,
    nextSelEnd: nextCursor,
    action: 'wrapped',
    targetText: core,
  };
}

export interface CueCursorSplitInfo {
  canSplit: boolean;
  reason: 'ready' | 'too-short' | 'at-start' | 'at-end';
  splitWordCount: number;
  totalWords: number;
  beforeWord: string;
  afterWord: string;
  snappedCursorPos: number;
  words: { word: string; start: number; end: number }[];
}

export function getCueSplitPointFromCursor(
  text: string,
  cursorPos: number
): CueCursorSplitInfo {
  const words: { word: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    words.push({
      word: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  const totalWords = words.length;
  const clamped = Math.max(0, Math.min(text.length, cursorPos));

  if (totalWords < 2) {
    return {
      canSplit: false,
      reason: 'too-short',
      splitWordCount: 0,
      totalWords,
      beforeWord: words[0]?.word || '',
      afterWord: '',
      snappedCursorPos: clamped,
      words,
    };
  }

  if (clamped <= words[0].start) {
    return {
      canSplit: false,
      reason: 'at-start',
      splitWordCount: 0,
      totalWords,
      beforeWord: '',
      afterWord: words[0].word,
      snappedCursorPos: words[0].end,
      words,
    };
  }

  if (clamped >= words[totalWords - 1].end) {
    return {
      canSplit: false,
      reason: 'at-end',
      splitWordCount: 0,
      totalWords,
      beforeWord: words[totalWords - 1].word,
      afterWord: '',
      snappedCursorPos: words[totalWords - 2].end,
      words,
    };
  }

  // Check if cursor sits in a whitespace/newline gap between two words
  for (let i = 0; i < totalWords - 1; i++) {
    if (clamped >= words[i].end && clamped <= words[i + 1].start) {
      return {
        canSplit: true,
        reason: 'ready',
        splitWordCount: i + 1,
        totalWords,
        beforeWord: words[i].word,
        afterWord: words[i + 1].word,
        snappedCursorPos: words[i].end,
        words,
      };
    }
  }

  // Cursor sits strictly inside a word: snap cleanly to the nearest word boundary without slicing any word
  for (let i = 0; i < totalWords; i++) {
    const w = words[i];
    if (clamped > w.start && clamped < w.end) {
      let splitWordCount: number;
      if (i === 0) {
        splitWordCount = 1;
      } else if (i === totalWords - 1) {
        splitWordCount = totalWords - 1;
      } else {
        const distToStart = clamped - w.start;
        const distToEnd = w.end - clamped;
        splitWordCount = distToStart < distToEnd ? i : i + 1;
      }
      return {
        canSplit: true,
        reason: 'ready',
        splitWordCount,
        totalWords,
        beforeWord: words[splitWordCount - 1].word,
        afterWord: words[splitWordCount].word,
        snappedCursorPos: words[splitWordCount - 1].end,
        words,
      };
    }
  }

  return {
    canSplit: false,
    reason: 'at-end',
    splitWordCount: 0,
    totalWords,
    beforeWord: words[totalWords - 1].word,
    afterWord: '',
    snappedCursorPos: words[totalWords - 2].end,
    words,
  };
}

/**
 * Steps the cursor cleanly between word split boundaries inside a cue textarea.
 */
export function stepCueWordBoundaryCursor(
  text: string,
  cursorPos: number,
  direction: -1 | 1
): number {
  const info = getCueSplitPointFromCursor(text, cursorPos);
  if (info.words.length < 2) {
    return direction < 0 ? 0 : text.length;
  }
  const maxSplit = info.words.length - 1;

  if (!info.canSplit) {
    if (info.reason === 'at-start') {
      return info.words[0].end;
    }
    if (info.reason === 'at-end') {
      return info.words[maxSplit - 1].end;
    }
    return cursorPos;
  }

  const nextSplit = Math.max(1, Math.min(maxSplit, info.splitWordCount + direction));
  return info.words[nextSplit - 1].end;
}

/**
 * Steps the cursor cleanly word-by-word in script / SRT textareas
 * (targeting the end of each word token so both [wrapping] and splitting align deterministically).
 */
export function stepScriptCursorByWord(
  text: string,
  cursorPos: number,
  direction: -1 | 1
): number {
  const tokens: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ start: m.index, end: m.index + m[0].length });
  }
  if (tokens.length === 0) return 0;

  const clamped = Math.max(0, Math.min(text.length, cursorPos));

  if (direction > 0) {
    // Find first token whose end is strictly after cursorPos
    const next = tokens.find((t) => t.end > clamped);
    return next ? next.end : tokens[tokens.length - 1].end;
  } else {
    // Find last token whose end is strictly before cursorPos; if inside a token, jump to previous token's end (or start of first)
    const insideIdx = tokens.findIndex((t) => clamped > t.start && clamped <= t.end);
    if (insideIdx > 0) {
      return tokens[insideIdx - 1].end;
    }
    if (insideIdx === 0) {
      return tokens[0].start;
    }
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i].end < clamped) {
        return tokens[i].end;
      }
    }
    return tokens[0].start;
  }
}

export interface ScriptSplitPreview {
  canSplitSentence: boolean;
  atLineEdge: 'start' | 'end' | 'empty' | 'middle';
  beforeWord: string;
  afterWord: string;
  splitPos: number;
}

export function previewScriptSplitAtCursor(
  text: string,
  selStart: number,
  selEnd: number
): ScriptSplitPreview {
  const start = Math.max(0, Math.min(text.length, Math.min(selStart, selEnd)));
  const info = getCursorLineInfo(text, start);
  if (info.tokens.length === 0) {
    return {
      canSplitSentence: false,
      atLineEdge: 'empty',
      beforeWord: '',
      afterWord: '',
      splitPos: start,
    };
  }

  const first = info.tokens[0];
  const last = info.tokens[info.tokens.length - 1];

  if (start <= first.absStart) {
    return {
      canSplitSentence: false,
      atLineEdge: 'start',
      beforeWord: '',
      afterWord: first.word,
      splitPos: start,
    };
  }

  if (start >= last.absEnd) {
    return {
      canSplitSentence: false,
      atLineEdge: 'end',
      beforeWord: last.word,
      afterWord: '',
      splitPos: start,
    };
  }

  // Between two tokens
  for (let i = 0; i < info.tokens.length - 1; i++) {
    const curr = info.tokens[i];
    const next = info.tokens[i + 1];
    if (start >= curr.absEnd && start <= next.absStart) {
      return {
        canSplitSentence: true,
        atLineEdge: 'middle',
        beforeWord: curr.word,
        afterWord: next.word,
        splitPos: curr.absEnd,
      };
    }
  }

  // Strictly inside a token on this line -> snap to nearest word boundary
  for (let i = 0; i < info.tokens.length; i++) {
    const tok = info.tokens[i];
    if (start > tok.absStart && start < tok.absEnd) {
      if (info.tokens.length === 1) {
        return {
          canSplitSentence: false,
          atLineEdge: 'end',
          beforeWord: tok.word,
          afterWord: '',
          splitPos: tok.absEnd,
        };
      }
      let afterIdx: number;
      if (i === 0) {
        afterIdx = 0;
      } else if (i === info.tokens.length - 1) {
        afterIdx = info.tokens.length - 2;
      } else {
        const distStart = start - tok.absStart;
        const distEnd = tok.absEnd - start;
        afterIdx = distStart < distEnd ? i - 1 : i;
      }
      return {
        canSplitSentence: true,
        atLineEdge: 'middle',
        beforeWord: info.tokens[afterIdx].word,
        afterWord: info.tokens[afterIdx + 1].word,
        splitPos: info.tokens[afterIdx].absEnd,
      };
    }
  }

  return {
    canSplitSentence: false,
    atLineEdge: 'end',
    beforeWord: last.word,
    afterWord: '',
    splitPos: start,
  };
}

/**
 * Splits a script line into 2 sentences cleanly at the cursor's word boundary:
 * - Never slices a word in half on imprecise mobile taps
 * - Automatically closes/reopens [emphasis brackets] if splitting inside a bracketed phrase
 * - Trims extra whitespace around the newline and places cursor at start of the new line
 */
export function splitScriptAtCursor(
  text: string,
  selStart: number,
  selEnd: number
): {
  nextText: string;
  nextCursor: number;
  didSplitSentence: boolean;
} {
  const start = Math.max(0, Math.min(text.length, Math.min(selStart, selEnd)));
  const end = Math.max(0, Math.min(text.length, Math.max(selStart, selEnd)));

  if (end > start) {
    const before = text.slice(0, start).replace(/[ \t]+$/, '');
    const after = text.slice(end).replace(/^[ \t]+/, '');
    const nextText = `${before}\n${after}`;
    return {
      nextText,
      nextCursor: before.length + 1,
      didSplitSentence: true,
    };
  }

  const preview = previewScriptSplitAtCursor(text, start, end);
  if (!preview.canSplitSentence) {
    // At start or end of line: insert a clean newline for adding a new line
    const before = text.slice(0, start).replace(/[ \t]+$/, '');
    const after = text.slice(start).replace(/^[ \t]+/, '');
    const nextText = `${before}\n${after}`;
    return {
      nextText,
      nextCursor: before.length + 1,
      didSplitSentence: false,
    };
  }

  const splitPos = preview.splitPos;
  const lineStart = text.slice(0, splitPos).lastIndexOf('\n') + 1;
  const nextNl = text.indexOf('\n', splitPos);
  const lineEnd = nextNl === -1 ? text.length : nextNl;
  const lineText = text.slice(lineStart, lineEnd);

  // Check if splitPos lands strictly inside a [bracketed multi-word phrase]
  const bracketRe = /\[([^\[\]]+)\]/g;
  let bm: RegExpExecArray | null;
  let insideBracket = false;
  while ((bm = bracketRe.exec(lineText)) !== null) {
    const bStart = lineStart + bm.index;
    const bEnd = bStart + bm[0].length;
    if (splitPos > bStart && splitPos < bEnd) {
      insideBracket = true;
      break;
    }
  }

  const rawBefore = text.slice(0, splitPos).replace(/[ \t]+$/, '');
  const rawAfter = text.slice(splitPos).replace(/^[ \t]+/, '');

  const closedBefore = insideBracket && !rawBefore.endsWith(']') ? `${rawBefore}]` : rawBefore;
  const openedAfter = insideBracket && !rawAfter.startsWith('[') ? `[${rawAfter}` : rawAfter;

  const nextText = `${closedBefore}\n${openedAfter}`;
  return {
    nextText,
    nextCursor: closedBefore.length + 1,
    didSplitSentence: true,
  };
}


/**
 * Automatically splits plain-text script lines (1 Enter = 1 cue) and calibrates
 * cue timestamps to match the project's audio duration and energy envelope.
 */
export function buildTimedCuesFromScript(
  scriptText: string,
  audioDurationSec: number,
  audioEnvelope?: Float32Array | null,
  emphasisTemplate?: WordStyleOverride
): SubtitleCue[] {
  const rawLines = scriptText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) return [];

  const parsedLines = rawLines.map((line) => {
    const { cleanedLine, emphasizedIndices } = parseLineInlineEmphasis(line, emphasisTemplate);
    const words = cleanedLine.split(/\s+/).filter(Boolean);
    const wordCount = Math.max(1, words.length);
    const charCount = cleanedLine.replace(/\s+/g, '').length;
    const pauseMarks = (cleanedLine.match(/[,.!?;:…]/g) || []).length;
    // Natural speech weight (base lead + syllables/words + characters + punctuation breaths)
    const weight = 0.42 + wordCount * 0.24 + charCount * 0.045 + pauseMarks * 0.22;
    return {
      cleanedLine: cleanedLine || line,
      emphasizedIndices,
      weight,
    };
  });

  const safeAudioDur = Math.max(2.0, Number.isFinite(audioDurationSec) ? audioDurationSec : 12.0);
  let activeStartSec = Math.min(0.15, safeAudioDur * 0.05);
  let activeEndSec = Math.max(activeStartSec + 1.0, safeAudioDur - Math.min(0.15, safeAudioDur * 0.05));

  const ENV_FPS = 60;
  if (audioEnvelope && audioEnvelope.length > ENV_FPS) {
    let peak = 0;
    for (let i = 0; i < audioEnvelope.length; i++) {
      if (audioEnvelope[i] > peak) peak = audioEnvelope[i];
    }
    if (peak > 0.02) {
      const thresh = Math.max(0.02, peak * 0.08);
      let firstIdx = 0;
      while (firstIdx < audioEnvelope.length && audioEnvelope[firstIdx] < thresh) {
        firstIdx++;
      }
      let lastIdx = audioEnvelope.length - 1;
      while (lastIdx > firstIdx && audioEnvelope[lastIdx] < thresh) {
        lastIdx--;
      }

      const detectedStart = Math.max(0, firstIdx / ENV_FPS - 0.12);
      const detectedEnd = Math.min(safeAudioDur, lastIdx / ENV_FPS + 0.28);
      if (detectedEnd - detectedStart >= Math.max(1.2, safeAudioDur * 0.35)) {
        activeStartSec = Math.min(detectedStart, safeAudioDur * 0.4);
        activeEndSec = Math.max(activeStartSec + 1.0, detectedEnd);
      }
    }
  }

  const totalSpan = Math.max(rawLines.length * 0.35, activeEndSec - activeStartSec);
  const totalWeight = parsedLines.reduce((sum, item) => sum + item.weight, 0) || parsedLines.length;
  const gapSec = totalSpan / parsedLines.length > 0.9 ? 0.05 : 0.0;

  // Initial proportional split boundaries
  const boundaries: number[] = [activeStartSec];
  let accWeight = 0;
  for (let i = 0; i < parsedLines.length - 1; i++) {
    accWeight += parsedLines[i].weight;
    const rawBound = activeStartSec + (accWeight / totalWeight) * totalSpan;
    boundaries.push(rawBound);
  }
  boundaries.push(activeStartSec + totalSpan);

  // Subtle energy-valley snapping so cue transitions fall cleanly between spoken phrases
  if (audioEnvelope && audioEnvelope.length > ENV_FPS * 2) {
    const minCueDur = Math.min(0.45, (totalSpan / parsedLines.length) * 0.55);
    for (let i = 1; i < boundaries.length - 1; i++) {
      const b = boundaries[i];
      const leftBound = boundaries[i - 1] + minCueDur;
      const rightBound = boundaries[i + 1] - minCueDur;
      if (rightBound <= leftBound) continue;

      const searchFrom = Math.max(leftBound, b - 0.25);
      const searchTo = Math.min(rightBound, b + 0.25);
      const idxStart = Math.max(0, Math.floor(searchFrom * ENV_FPS));
      const idxEnd = Math.min(audioEnvelope.length - 1, Math.ceil(searchTo * ENV_FPS));

      let bestIdx = -1;
      let bestScore = Infinity;
      for (let k = idxStart; k <= idxEnd; k++) {
        // Lightly prefer staying near proportional center while preferring low energy valleys
        const distPenalty = Math.abs(k / ENV_FPS - b) * 0.08;
        const score = audioEnvelope[k] + distPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestIdx = k;
        }
      }
      if (bestIdx !== -1) {
        boundaries[i] = Math.max(leftBound, Math.min(rightBound, bestIdx / ENV_FPS));
      }
    }
  }

  const now = Date.now();
  return parsedLines.map((item, idx) => {
    const rawStart = boundaries[idx];
    const rawEnd = boundaries[idx + 1] - (idx < parsedLines.length - 1 ? gapSec : 0);
    const startSec = Number(rawStart.toFixed(2));
    const endSec = Number(Math.max(rawStart + 0.25, rawEnd).toFixed(2));

    const wordStyles: Record<number, WordStyleOverride> = {};
    for (const wIdx of item.emphasizedIndices) {
      wordStyles[wIdx] = {
        ...(emphasisTemplate || {}),
        emphasized: true,
      };
    }

    return {
      id: `cue-script-${now}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      index: idx + 1,
      startSec,
      endSec,
      text: item.cleanedLine,
      wordStyles,
    };
  });
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

function splitCueTextPreservingLineBreaks(
  text: string,
  splitWordCount: number
): { firstText: string; secondText: string } {
  const spans: { start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  if (spans.length < 2) {
    return { firstText: text.trim(), secondText: '' };
  }
  const clamped = Math.max(1, Math.min(spans.length - 1, splitWordCount));
  const firstEnd = spans[clamped - 1].end;
  const secondStart = spans[clamped].start;
  return {
    firstText: text.slice(0, firstEnd).trim(),
    secondText: text.slice(secondStart).trim(),
  };
}

export function splitCueAtWordBoundary(
  cue: SubtitleCue,
  splitWordCount: number,
  customSplitTimeSec?: number
): [SubtitleCue, SubtitleCue] | null {
  const dur = cue.endSec - cue.startSec;
  if (dur < 0.24) return null;

  const { flatWords } = tokenizeCueText(cue.text);
  if (flatWords.length < 2) return null;

  const clampedSplit = Math.max(1, Math.min(flatWords.length - 1, splitWordCount));
  const { firstText, secondText } = splitCueTextPreservingLineBreaks(cue.text, clampedSplit);
  if (!firstText || !secondText) return null;

  const minBoundary = cue.startSec + 0.12;
  const maxBoundary = cue.endSec - 0.12;

  let splitTime: number;
  if (
    customSplitTimeSec !== undefined &&
    customSplitTimeSec > minBoundary &&
    customSplitTimeSec < maxBoundary
  ) {
    splitTime = Number(customSplitTimeSec.toFixed(2));
  } else if (cue.wordTimings && cue.wordTimings.length === flatWords.length) {
    const prevEnd = cue.wordTimings[clampedSplit - 1]?.endSec ?? cue.startSec;
    const nextStart = cue.wordTimings[clampedSplit]?.startSec ?? prevEnd;
    const rawMid = (prevEnd + nextStart) * 0.5;
    splitTime = Number(Math.max(minBoundary, Math.min(maxBoundary, rawMid)).toFixed(2));
  } else {
    const firstWeight = firstText.replace(/\s+/g, '').length + clampedSplit * 1.6;
    const secondWeight = secondText.replace(/\s+/g, '').length + (flatWords.length - clampedSplit) * 1.6;
    const ratio = firstWeight / Math.max(1, firstWeight + secondWeight);
    splitTime = Number(
      Math.max(minBoundary, Math.min(maxBoundary, cue.startSec + dur * ratio)).toFixed(2)
    );
  }

  const firstStyles: Record<number, WordStyleOverride> = {};
  const secondStyles: Record<number, WordStyleOverride> = {};
  for (const [kStr, style] of Object.entries(cue.wordStyles)) {
    const k = Number(kStr);
    if (k < clampedSplit) {
      firstStyles[k] = style;
    } else {
      secondStyles[k - clampedSplit] = style;
    }
  }

  const firstTimings =
    cue.wordTimings && cue.wordTimings.length === flatWords.length
      ? cue.wordTimings.slice(0, clampedSplit)
      : null;
  const secondTimings =
    cue.wordTimings && cue.wordTimings.length === flatWords.length
      ? cue.wordTimings.slice(clampedSplit)
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

  return splitCueAtWordBoundary(cue, splitWordCount, splitTime);
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

