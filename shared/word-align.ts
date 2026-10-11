/**
 * Real word timings from Kokoro's timestamped ONNX export. Shared by the
 * remotion-studio Node pipeline and the browser PWA — both drive the same
 * timestamped checkpoint (staged by both model installers) through the same
 * per-word phonemization, so this module is the single source of alignment
 * truth for the whole repo.
 *
 * The timestamped model (onnx-community/Kokoro-82M-v1.0-ONNX-timestamped)
 * emits one predicted duration per input token alongside the waveform.
 * Input tokens are per-character of the espeak phoneme string (spaces
 * included), so word spans fall out of a single synthesis pass once the
 * phoneme string is built word-by-word — each word's characters are known
 * by construction, which sidesteps the fuzzy full-string alignment the
 * community gists struggle with.
 *
 * Frames convert at 1 unit = 1/40 s (600 samples at 24 kHz — see the
 * onnx-community discussion #2 magic-divisor derivation). We do not trust
 * that absolutely: the whole timeline is rescaled onto the measured audio
 * duration, so any systematic offset cancels and the last word always ends
 * exactly at the audio end.
 */

/** pred_dur frame rate: 24000 Hz / 600 samples per frame. */
export const DURATION_UNITS_PER_SECOND = 40;

/** One word span in seconds (structurally identical to the studio's WordTiming). */
export interface WordSpan {
  word: string;
  start: number;
  end: number;
}

/** One word of the script plus the phoneme characters the model will speak for it. */
export interface PhonemeGroup {
  word: string;
  /** Phoneme chars for this word (no separators). May be empty for punctuation-only tokens. */
  phonemes: string;
}

/**
 * Split a whitespace token into (leading punctuation, espeak core, trailing
 * punctuation). Apostrophes inside the core stay with it so contractions
 * ("tomorrow's") reach espeak intact; punctuation is re-appended literally
 * because the model was trained with it as its own tokens.
 */
export function splitToken(token: string): { lead: string; core: string; trail: string } {
  const match = /^(\W*)([\s\S]*?)(\W*)$/.exec(token);
  if (!match) return { lead: "", core: token, trail: "" };
  return { lead: match[1] ?? "", core: match[2] ?? "", trail: match[3] ?? "" };
}

/**
 * Derive per-word spans from predicted durations.
 *
 * @param groups  one entry per whitespace token of the script, in order
 * @param durations  the model's flat per-token duration array
 * @param audioSeconds  measured waveform length — the timeline is rescaled onto it
 *
 * Guarantees (same contract estimateWordTimings provides): one timing per
 * group in script order, contiguous spans, first start at 0, last end exactly
 * at audioSeconds. Punctuation-only tokens get a zero-width span at the
 * current cursor so caption alignment never loses a token.
 */
export function wordSpansFromDurations(
  groups: readonly PhonemeGroup[],
  durations: ArrayLike<number>,
  audioSeconds: number,
): WordSpan[] {
  if (!groups.length) return [];
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) {
    throw new Error("E_AUDIO_DURATION: cannot align word timings without positive audio duration");
  }

  // Flat char list mirroring the tokenizer input: nonempty groups joined by
  // single spaces; separators belong to the group on their left.
  const chars: Array<{ group: number }> = [];
  let sawNonempty = false;
  groups.forEach((group, index) => {
    if (!group.phonemes) return;
    if (sawNonempty) chars.push({ group: index - 1 });
    for (const _ of group.phonemes) chars.push({ group: index });
    sawNonempty = true;
  });

  const n = chars.length;
  // The tokenizer may wrap the sequence with BOS/EOS (0) pads — accept both
  // shapes so a tokenizer config change fails loudly instead of shifting
  // every word by one duration.
  let start = 0;
  if (durations.length === n + 2) start = 1;
  else if (durations.length !== n) {
    throw new Error(
      `E_DURATION_SHAPE: ${durations.length} durations for ${n} phoneme chars (expected ${n} or ${n + 2})`,
    );
  }

  // Walk chars accumulating frame cursor; each group records its span, with
  // trailing-separator frames folding into the left group for contiguity.
  const spans = new Map<number, { s: number; e: number }>();
  let cursor = start === 1 ? Math.max(0, durations[0]) : 0;
  const leadIn = cursor;
  for (let k = 0; k < n; k++) {
    const frames = Math.max(0, durations[start + k]);
    const group = chars[k]!.group;
    const entry = spans.get(group) ?? { s: cursor, e: cursor };
    entry.e = cursor + frames;
    spans.set(group, entry);
    cursor += frames;
  }
  // Trailing EOS pad (if any) is tail silence — attribute it to the last
  // speaking word so the final span reaches the audio end after rescaling.
  const eos = start + n < durations.length ? Math.max(0, durations[start + n]) : 0;
  const lastGroup = groups.reduce((last, group, index) => (group.phonemes ? index : last), -1);
  if (lastGroup >= 0 && eos > 0) {
    const entry = spans.get(lastGroup)!;
    entry.e += eos;
  }
  const totalFrames = cursor + eos;

  // Sanity: predicted frames must roughly match the real audio. A large gap
  // means the phoneme string desynced from the model input — fail loudly
  // rather than hand caption alignment a fiction.
  const predictedSeconds = totalFrames / DURATION_UNITS_PER_SECOND;
  if (Math.abs(predictedSeconds - audioSeconds) > Math.max(0.2, 0.2 * audioSeconds)) {
    throw new Error(
      `E_DURATION_MISMATCH: durations predict ${predictedSeconds.toFixed(2)}s but audio is ${audioSeconds.toFixed(2)}s`,
    );
  }
  const scale = audioSeconds / (totalFrames || 1);

  // Fill punctuation-only groups at the cursor of their position so every
  // script token keeps a timing entry.
  const out: WordSpan[] = [];
  let filledTo = 0;
  groups.forEach((group, index) => {
    let span = spans.get(index);
    if (!span) {
      const boundary = filledTo || leadIn;
      span = { s: boundary, e: boundary };
    }
    filledTo = span.e;
    out.push({
      word: group.word,
      start: Math.max(0, Math.min(audioSeconds, span.s * scale)),
      end: Math.max(0, Math.min(audioSeconds, span.e * scale)),
    });
  });
  return out;
}
