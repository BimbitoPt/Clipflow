import { escText } from "./graph";
import type { BuildParams, FxCtx } from "./types";

/**
 * Pure-FFmpeg effect primitives. Every fragment positions relative to the
 * output resolution (iw/ih/w/h) — never hardcoded pixels — and gates itself
 * with between()/alpha expressions so chains are no-ops outside their
 * window. Font sizes use h-relative expressions.
 */

export interface Prim {
  p: BuildParams;
  ctx: FxCtx;
}

/** between(t, start, start+duration). */
export const win = (p: Pick<BuildParams, "start" | "duration">): string =>
  `between(t,${p.start},${p.start + p.duration})`;

/** 0→1→0 triangle pulse over the window (for punches/shakes). */
export const tri = (p: Pick<BuildParams, "start" | "duration">): string =>
  `${win(p)}*sin(PI*(t-${p.start})/${p.duration})`;

/** Accent or fallback lime. */
const acc = (p: BuildParams, ctx: FxCtx): string => p.accent ?? ctx.accent;

const AMP = { subtle: 0.3, medium: 0.5, hype: 0.75 } as const;

/** Punch-in zoom burst (always-on chain, motion gated by the window). */
export function punchZoom({ p, ctx }: Prim): string[] {
  const a = AMP[p.intensity];
  const P = `${a}*${tri(p)}`;
  return [
    `crop=w='iw/(1+${P})':h='ih/(1+${P})':x='(iw-ow)/2':y='(ih-oh)/2',scale=${ctx.W}:${ctx.H}`,
  ];
}

/** Screen shake burst. Scale headroom then animated crop offsets. */
export function shake({ p, ctx }: Prim, hz = 14): string[] {
  const a = { subtle: 6, medium: 12, hype: 22 }[p.intensity];
  const G = win(p);
  const W2 = Math.round(ctx.W * 1.12);
  const H2 = Math.round(ctx.H * 1.12);
  return [
    `scale=${W2}:${H2},crop=w=${ctx.W}:h=${ctx.H}:x='(iw-ow)/2+${a}*sin(2*PI*${hz}*t)*${G}':y='(ih-oh)/2+${a}*cos(2*PI*${hz}*1.3*t)*${G}',setsar=1`,
  ];
}

/** Whip-pan: fast lateral swing and back (0.35s typical). */
export function whipPan({ p }: Prim, dir = 1): string[] {
  const G = win(p);
  const swing = `${dir}*(iw-ow)/2*sin(PI*(t-${p.start})/${p.duration})*${G}`;
  return [`scale=iw*1.15:ih*1.15,crop=w='iw/1.15':h='ih/1.15':x='(iw-ow)/2+${swing}':y='(ih-oh)/2',setsar=1`];
}

/** White flash in+out (transition). */
export function flashCut({ p }: Prim): string[] {
  return [
    `fade=t=in:st=${p.start}:d=0.07:alpha=1,fade=t=out:st=${p.start + p.duration - 0.07}:d=0.07:alpha=1`,
  ];
}

/** Single short beat flash (sfx-sync). */
export function beatFlash({ p }: Prim): string[] {
  return [`fade=t=in:st=${p.start}:d=0.04:alpha=1,fade=t=out:st=${p.start + p.duration - 0.04}:d=0.04:alpha=1`];
}

/** Slow fade in+out (soft transition). */
export function softFade({ p }: Prim): string[] {
  const h = p.duration / 2;
  return [`fade=t=in:st=${p.start}:d=${h}:alpha=1,fade=t=out:st=${p.start + h}:d=${h}:alpha=1`];
}

/** Slow push-in for the whole clip (grade-like camera drift). */
export function slowPush({ p, ctx }: Prim): string[] {
  return [
    `zoompan=z='1+0.08*(time-${p.start})/${p.duration}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${ctx.W}x${ctx.H}:fps=${ctx.fps},setsar=1`,
  ];
}

/** Bottom progress bar over the full clip. */
export function progressBar({ p, ctx }: Prim, total: number): string[] {
  void p;
  return [`drawbox=x=0:y='h-14':w='iw*t/${total}':h=14:c=${acc(p, ctx)}:t=fill`];
}

/** Blinking REC dot + label, top-right. */
export function recDot({ p, ctx }: Prim): string[] {
  const blink = `${win(p)}*lt(mod(t,1),0.6)`;
  return [
    `drawbox=x='w-110':y=36:w=20:h=20:c=red:t=fill:enable='${blink}'`,
    `drawtext=fontfile=${ctx.fontFile}:text='REC':fontsize=h/36:fontcolor=white:x='w-82':y=32:enable='${blink}'`,
  ];
}

/** Vignette (full-duration look). */
export function vignette({ p }: Prim, angle = "PI/5"): string[] {
  void p;
  return [`vignette=${angle}`];
}

/** Soft vignette for lifestyle. */
export function softVignette(prim: Prim): string[] {
  return vignette(prim, "PI/6");
}

/** Film grain burst. */
export function grain({ p }: Prim): string[] {
  const s = { subtle: 4, medium: 8, hype: 14 }[p.intensity];
  return [`noise=alls=${s}:allf=t:enable='${win(p)}'`];
}

/** CRT scanlines (full-duration look). */
export function crtLines({ p }: Prim): string[] {
  void p;
  return [`drawgrid=x=0:y=0:w=iw:h=3:t=1:c=black@0.16`];
}

/** Tech grid overlay (full-duration, faint). */
export function gridOverlay({ p }: Prim): string[] {
  void p;
  return [`drawgrid=x=0:y=0:w='iw/6':h='ih/12':t=1:c=white@0.06`];
}

/** EQ grade. */
export function gradeEq(_prim: Prim, eq: string): string[] {
  return [`eq=${eq}`];
}

/** Warm lifestyle grade. */
export function warmGrade(prim: Prim): string[] {
  return [`colorbalance=rs=.25:gs=.08:bs=-.18:rm=.1:bm=-.1,eq=saturation=1.12`, ...vignette(prim, "PI/6")];
}

/** RGB-split / chromatic aberration burst. */
export function rgbSplit({ p }: Prim): { filters: string[]; requires: string[] } {
  const px = { subtle: 4, medium: 8, hype: 16 }[p.intensity];
  return {
    filters: [`rgbashift=rh=${px}:rv=0:gh=0:bh=${-px}:bv=0:enable='${win(p)}'`],
    requires: ["rgbashift"],
  };
}

/** Glitch burst: rgb split + noise + sharpness jitter. */
export function glitchBurst(prim: Prim): { filters: string[]; requires: string[] } {
  const { p } = prim;
  const rgb = rgbSplit(prim);
  return {
    filters: [...rgb.filters, `noise=alls=22:allf=t:enable='${win(p)}'`],
    requires: rgb.requires,
  };
}

/** Scanline sweep: accent bar travelling top→bottom. */
export function scanlineSweep({ p, ctx }: Prim): string[] {
  const y = `(h+20)*(t-${p.start})/${p.duration}-10`;
  return [`drawbox=x=0:y='${y}':w=iw:h=6:c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`];
}

/** Razor-cut flash: full flash + vertical line sweep. */
export function razorFlash({ p, ctx }: Prim): string[] {
  const mid = p.start + p.duration / 2;
  return [
    `drawbox=x=0:y=0:w=iw:h=ih:c=white:t=fill:enable='between(t,${mid},${mid + 0.06})'`,
    `drawbox=x='iw*(t-${p.start})/${p.duration}':y=0:w=4:h=ih:c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`,
  ];
}

/** Mock editing timeline: track + fill + playhead + cut ticks (ambient). */
export function timelineBar({ p, ctx }: Prim, total: number): string[] {
  void p;
  const y = "h-150";
  return [
    `drawbox=x='w*0.06':y=${y}:w='w*0.88':h=54:c=black@0.72:t=fill`,
    `drawbox=x='w*0.06':y='${y}+20':w='w*0.88*t/${total}':h=14:c=${acc(p, ctx)}:t=fill`,
    `drawbox=x='w*0.06+w*0.88*t/${total}-2':y=${y}:w=4:h=54:c=white:t=fill`,
    `drawbox=x='w*0.30':y=${y}:w=3:h=54:c=white@0.6:t=fill`,
    `drawbox=x='w*0.62':y=${y}:w=3:h=54:c=white@0.6:t=fill`,
    `drawtext=fontfile=${ctx.fontFile}:text='TIMELINE':fontsize=h/44:fontcolor=white@0.8:x='w*0.06':y='${y}-34'`,
  ];
}

/** Cursor click ripple: expanding double ring at a seeded position. */
export function clickRipple({ p, ctx }: Prim): string[] {
  const cx = `w*${(0.25 + p.variant * 0.5).toFixed(2)}`;
  const cy = `h*${(0.3 + ((p.variant * 7) % 1) * 0.4).toFixed(2)}`;
  const k = `(t-${p.start})/${p.duration}`;
  const A = ctx.accent;
  return [
    `drawbox=x='${cx}-(30+260*${k})/2':y='${cy}-(30+260*${k})/2':w='30+260*${k}':h='30+260*${k}':c=${A}:t=4:enable='${win(p)}'`,
    `drawbox=x='${cx}-(30+160*${k})/2':y='${cy}-(30+160*${k})/2':w='30+160*${k}':h='30+160*${k}':c=white:t=3:enable='${win(p)}'`,
  ];
}

/** Pulsing UI highlight box at a seeded position. */
export function pulseBox({ p, ctx }: Prim): string[] {
  const blink = `${win(p)}*lt(mod(t-${p.start},0.9),0.55)`;
  return [
    `drawbox=x='w*0.14':y='h*0.30':w='w*0.72':h='h*0.16':c=${acc(p, ctx)}:t=5:enable='${blink}'`,
  ];
}

/** Neon glow title pop. */
export function neonTitle({ p, ctx }: Prim): string[] {
  const A = acc(p, ctx);
  const alpha = `if(lt(t-${p.start},0.15),(t-${p.start})/0.15,if(lt(${p.start + p.duration}-t,0.2),(${p.start + p.duration}-t)/0.2,1))`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(p.text ?? "WATCH THIS")}:fontsize=h/13:fontcolor=white:borderw=3:bordercolor=${A}:shadowcolor=${A}@0.9:shadowx=0:shadowy=0:x='(w-text_w)/2':y='h*0.30':alpha='${alpha}':enable='${win(p)}'`,
  ];
}

/** Typewriter line: text fades in fast behind a shrinking cover bar. */
export function typewriter({ p, ctx }: Prim): string[] {
  const text = p.text ?? "console.log(idea)";
  const est = text.length * 0.55;
  const fs = `h/24`;
  const wEst = `${est}*${fs}`;
  const cx = `(w-(${wEst}))/2`;
  const k = `(t-${p.start})/${Math.max(0.3, p.duration * 0.5)}`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=${fs}:fontcolor=${acc(p, ctx)}:x='${cx}':y='h*0.44':alpha='if(lt(${k},1),${k},1)':enable='${win(p)}'`,
    `drawbox=x='${cx}+(${wEst})*if(lt(${k},1),${k},1)':y='h*0.44':w='(${wEst})*(1-if(lt(${k},1),${k},1))+4':h=${fs}:c=${ctx.bg}:t=fill:enable='${win(p)}*lt(${k},1)'`,
  ];
}

/** Lower-third: plate + title text. */
export function lowerThird({ p, ctx }: Prim): string[] {
  const text = p.text ?? "KEY STAT";
  const alpha = `if(lt(t-${p.start},0.2),(t-${p.start})/0.2,if(lt(${p.start + p.duration}-t,0.25),(${p.start + p.duration}-t)/0.25,1))`;
  return [
    `drawbox=x='w*0.06':y='h*0.72':w='w*0.56':h='h*0.11':c=black@0.72:t=fill:enable='${win(p)}'`,
    `drawbox=x='w*0.06':y='h*0.72':w=8:h='h*0.11':c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=h/26:fontcolor=white:x='w*0.06+28':y='h*0.72+h*0.025':alpha='${alpha}':enable='${win(p)}'`,
  ];
}

/** Animated number counter. */
export function counterUp({ p, ctx }: Prim, from: number, to: number, prefix = ""): string[] {
  const expr = `${from}+(${(to - from)})*(t-${p.start})/${p.duration}`;
  // eif needs literal \: separators: escText would double-escape them, so
  // escape %, ', : manually then restore the eif separators.
  const raw = `${prefix}%{eif\\:${expr}\\:d}`;
  const text = `'${raw.replace(/%/g, "\\%").replace(/'/g, "\\'")}'`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${text}:fontsize=h/12:fontcolor=${acc(p, ctx)}:borderw=2:bordercolor=black@0.8:x='(w-text_w)/2':y='h*0.30':enable='${win(p)}'`,
  ];
}

/** Rising staircase bars (finance trend). */
export function trendSteps({ p, ctx }: Prim, steps = 5): string[] {
  const out: string[] = [];
  const baseY = "h*0.62";
  for (let i = 0; i < steps; i++) {
    const on = p.start + (p.duration / steps) * i;
    const h = 30 + i * 34;
    out.push(
      `drawbox=x='w*0.12+${i}*w*0.13':y='${baseY}-${h}':w='w*0.10':h=${h}:c=${acc(p, ctx)}@0.9:t=fill:enable='between(t,${on},${p.start + p.duration})'`,
    );
  }
  out.push(`drawbox=x='w*0.10':y='${baseY}':w='w*0.72':h=4:c=white@0.7:t=fill:enable='${win(p)}'`);
  return out;
}

/** Hitmarker: big × + flash (gaming). Arial carries U+00D7. */
export function hitmarker({ p, ctx }: Prim): string[] {
  return [
    `drawtext=fontfile=${ctx.fontFile}:text='×':fontsize=h/8:fontcolor=red:borderw=4:bordercolor=white:x='(w-text_w)/2':y='h*0.34':enable='${win(p)}'`,
    `drawbox=x=0:y=0:w=iw:h=ih:c=white:t=fill:enable='between(t,${p.start},${p.start + 0.05})'`,
  ];
}

/** Score pop-up: growing, rising number. */
export function scorePop({ p, ctx }: Prim): string[] {
  const text = p.text ?? "+100";
  const k = `(t-${p.start})/${p.duration}`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize='h/18*(1+0.9*(1-${k}))':fontcolor=${acc(p, ctx)}:borderw=3:bordercolor=black:x='(w-text_w)/2':y='h*0.30-60*${k}':alpha='1-${k}*0.7':enable='${win(p)}'`,
  ];
}

/** Kinetic caption: big bold pop with a bounce. */
export function kineticCaption({ p, ctx }: Prim): string[] {
  const text = p.text ?? "DO THIS";
  const y = `h*0.60-24*sin(PI*(t-${p.start})/${p.duration})`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize='h/16*(0.7+0.3*sin(PI*min(1,(t-${p.start})/0.18)))':fontcolor=white:borderw=4:bordercolor=black:x='(w-text_w)/2':y='${y}':enable='${win(p)}'`,
  ];
}

/** Keyword pop-in: accent plate + word. */
export function keyPop({ p, ctx }: Prim): string[] {
  const text = (p.text ?? "KEY").toUpperCase();
  const fs = `h/20`;
  return [
    `drawbox=x='(w-(${text.length}*0.62*${fs}+40))/2':y='h*0.56':w='(${text.length}*0.62*${fs}+40)':h='1.7*${fs}':c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=${fs}:fontcolor=black:x='(w-text_w)/2':y='h*0.56+0.32*${fs}':enable='${win(p)}'`,
  ];
}

/** Sticker-style word pop (food/lifestyle): accent sticker, dark text. */
export function stickerPop({ p, ctx }: Prim): string[] {
  const text = (p.text ?? "YUM!").toUpperCase();
  const k = `(t-${p.start})/${Math.min(0.22, p.duration / 2)}`;
  const pop = `0.6+0.4*sin(PI*min(1,${k}))`;
  const y = `h*${(0.3 + p.variant * 0.2).toFixed(2)}`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(`★ ${text} ★`)}:fontsize='h/16*${pop}':fontcolor=${acc(p, ctx)}:borderw=5:bordercolor=white:x='(w-text_w)/2':y='${y}':enable='${win(p)}'`,
  ];
}

/** Highlight-box callout (edu): stroked box, blinking while active. */
export function calloutBox({ p, ctx }: Prim): string[] {
  const blink = `${win(p)}*lt(mod(t-${p.start},1.0),0.7)`;
  return [
    `drawbox=x='w*0.10':y='h*0.34':w='w*0.80':h='h*0.18':c=${acc(p, ctx)}:t=6:enable='${blink}'`,
  ];
}

/** Arrow annotation (edu). Arial carries U+2192. */
export function arrowNote({ p, ctx }: Prim): string[] {
  const alpha = `if(lt(t-${p.start},0.15),(t-${p.start})/0.15,1)`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text='→ ${escText(p.text ?? "look here").slice(1, -1)}':fontsize=h/17:fontcolor=${acc(p, ctx)}:borderw=3:bordercolor=black:x='w*0.10':y='h*0.24':alpha='${alpha}':enable='${win(p)}'`,
  ];
}

/** Step counter chip, e.g. STEP 2/5 (edu). */
export function stepCounter({ p, ctx }: Prim, cur = 1, total = 3): string[] {
  return [
    `drawbox=x='w*0.06':y='h*0.10':w='w*0.30':h='h*0.055':c=black@0.72:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text='STEP ${cur}/${total}':fontsize=h/30:fontcolor=${acc(p, ctx)}:x='w*0.06+18':y='h*0.10+h*0.008':enable='${win(p)}'`,
  ];
}

/** Code-rain columns drifting down (tech, faint). */
export function codeRain({ p, ctx }: Prim): string[] {
  const cols = ["01</>{}$", "=>{_};#", "AI*42||"];
  return cols.map((col, i) => {
    const x = `w*${(0.08 + i * 0.36).toFixed(2)}`;
    const y = `-260+mod(${(160 + i * 60)}*(t-${p.start}),h+520)-160`;
    return `drawtext=fontfile=${ctx.fontFile}:text='${col}':fontsize=h/40:fontcolor=${acc(p, ctx)}@0.30:x='${x}':y='${y}':enable='${win(p)}'`;
  });
}

/** Caption-zone word pop (universal animated caption helper). */
export function captionPop({ p, ctx }: Prim): string[] {
  const text = (p.text ?? "WATCH").toUpperCase();
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=h/19:fontcolor=white:borderw=4:bordercolor=black:x='(w-text_w)/2':y='h*0.62':alpha='if(lt(t-${p.start},0.12),(t-${p.start})/0.12,1)':enable='${win(p)}'`,
  ];
}
