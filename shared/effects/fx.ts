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

/**
 * Punch-in zoom burst via zoompan (per-frame z; crop w/h are config-time
 * only, so animated crop windows are invalid — zoompan is the tool).
 * d=1 keeps the 1:1 frame mapping on a live stream; on/30 is the clock.
 */
export function punchZoom({ p, ctx }: Prim): string[] {
  const a = AMP[p.intensity];
  const tn = `(on/${ctx.fps})`;
  const P = `${a}*between(${tn},${p.start},${p.start + p.duration})*sin(PI*(${tn}-${p.start})/${p.duration})`;
  return [
    `zoompan=z='1+${P}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${ctx.W}x${ctx.H}:fps=${ctx.fps},setsar=1`,
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
export function flashCut({ p }: { p: BuildParams }): string[] {
  return [
    `fade=t=in:st=${p.start}:d=0.07:alpha=1,fade=t=out:st=${p.start + p.duration - 0.07}:d=0.07:alpha=1`,
  ];
}

/** Single short beat flash (sfx-sync). */
export function beatFlash({ p }: { p: BuildParams }): string[] {
  return [`fade=t=in:st=${p.start}:d=0.04:alpha=1,fade=t=out:st=${p.start + p.duration - 0.04}:d=0.04:alpha=1`];
}

/** Slow fade in+out (soft transition). */
export function softFade({ p }: { p: BuildParams }): string[] {
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
  return [`drawbox=x=0:y='ih-14':w='iw*t/${total}':h=14:c=${acc(p, ctx)}:t=fill`];
}

/** Blinking REC dot + label, top-right. */
export function recDot({ p, ctx }: Prim): string[] {
  const blink = `${win(p)}*lt(mod(t,1),0.6)`;
  return [
    `drawbox=x='iw*0.847':y='ih*0.028':w='iw*0.028':h='iw*0.028':c=red:t=fill:enable='${blink}'`,
    `drawtext=fontfile=${ctx.fontFile}:text='REC':fontsize=h/36:fontcolor=white:x='w*0.886':y='h*0.025':enable='${blink}'`,
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
  const noise = { subtle: 10, medium: 16, hype: 22 }[p.intensity];
  return {
    filters: [...rgb.filters, `noise=alls=${noise}:allf=t:enable='${win(p)}'`],
    requires: rgb.requires,
  };
}

/** Scanline sweep: accent bar travelling top→bottom. */
export function scanlineSweep({ p, ctx }: Prim): string[] {
  const y = `(ih+20)*(t-${p.start})/${p.duration}-10`;
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
  const y = "ih-150";
  return [
    `drawbox=x='iw*0.06':y=${y}:w='iw*0.88':h=54:c=black@0.72:t=fill`,
    `drawbox=x='iw*0.06':y='${y}+20':w='iw*0.88*t/${total}':h=14:c=${acc(p, ctx)}:t=fill`,
    `drawbox=x='iw*0.06+iw*0.88*t/${total}-2':y=${y}:w=4:h=54:c=white:t=fill`,
    `drawbox=x='iw*0.30':y=${y}:w=3:h=54:c=white@0.6:t=fill`,
    `drawbox=x='iw*0.62':y=${y}:w=3:h=54:c=white@0.6:t=fill`,
    `drawtext=fontfile=${ctx.fontFile}:text='TIMELINE':fontsize=h/44:fontcolor=white@0.8:x='w*0.06':y='h-184'`,
  ];
}

/** Cursor click ripple: expanding double ring at a seeded position. */
export function clickRipple({ p, ctx }: Prim): string[] {
  const cx = `iw*${(0.25 + p.variant * 0.5).toFixed(2)}`;
  const cy = `ih*${(0.3 + ((p.variant * 7) % 1) * 0.4).toFixed(2)}`;
  const k = `(t-${p.start})/${p.duration}`;
  const A = ctx.accent;
  const r1 = `(iw*0.04+iw*0.36*${k})`;
  const r2 = `(iw*0.04+iw*0.22*${k})`;
  return [
    `drawbox=x='${cx}-${r1}/2':y='${cy}-${r1}/2':w='${r1}':h='${r1}':c=${A}:t=4:enable='${win(p)}'`,
    `drawbox=x='${cx}-${r2}/2':y='${cy}-${r2}/2':w='${r2}':h='${r2}':c=white:t=3:enable='${win(p)}'`,
  ];
}

/** Pulsing UI highlight box at a seeded position. */
export function pulseBox({ p, ctx }: Prim): string[] {
  const blink = `${win(p)}*lt(mod(t-${p.start},0.9),0.55)`;
  return [
    `drawbox=x='iw*0.14':y='ih*0.30':w='iw*0.72':h='ih*0.16':c=${acc(p, ctx)}:t=5:enable='${blink}'`,
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
  // drawtext sees w/h, drawbox sees iw/ih — size the same line twice.
  const fsT = `h/24`;
  const fsB = `ih/24`;
  const wEstT = `${est}*${fsT}`;
  const wEstB = `${est}*${fsB}`;
  const cxT = `(w-(${wEstT}))/2`;
  const cxB = `(iw-(${wEstB}))/2`;
  const k = `(t-${p.start})/${Math.max(0.3, p.duration * 0.5)}`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=${fsT}:fontcolor=${acc(p, ctx)}:x='${cxT}':y='h*0.44':alpha='if(lt(${k},1),${k},1)':enable='${win(p)}'`,
    `drawbox=x='${cxB}+(${wEstB})*if(lt(${k},1),${k},1)':y='ih*0.44':w='(${wEstB})*(1-if(lt(${k},1),${k},1))+4':h=${fsB}:c=${ctx.bg}:t=fill:enable='${win(p)}*lt(${k},1)'`,
  ];
}

/** Lower-third: plate + title text. */
export function lowerThird({ p, ctx }: Prim): string[] {
  const text = p.text ?? "KEY STAT";
  const alpha = `if(lt(t-${p.start},0.2),(t-${p.start})/0.2,if(lt(${p.start + p.duration}-t,0.25),(${p.start + p.duration}-t)/0.25,1))`;
  return [
    `drawbox=x='iw*0.06':y='ih*0.72':w='iw*0.56':h='ih*0.11':c=black@0.72:t=fill:enable='${win(p)}'`,
    `drawbox=x='iw*0.06':y='ih*0.72':w=8:h='ih*0.11':c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=h/26:fontcolor=white:x='w*0.06+w*0.04':y='h*0.72+h*0.025':alpha='${alpha}':enable='${win(p)}'`,
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
  const baseY = "ih*0.62";
  for (let i = 0; i < steps; i++) {
    const on = p.start + (p.duration / steps) * i;
    const h = `ih*${(0.023 + i * 0.026).toFixed(3)}`;
    out.push(
      `drawbox=x='iw*0.12+${i}*iw*0.13':y='${baseY}-${h}':w='iw*0.10':h=${h}:c=${acc(p, ctx)}@0.9:t=fill:enable='between(t,${on},${p.start + p.duration})'`,
    );
  }
  out.push(`drawbox=x='iw*0.10':y='${baseY}':w='iw*0.72':h=4:c=white@0.7:t=fill:enable='${win(p)}'`);
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
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize='h/18*(1+0.9*(1-${k}))':fontcolor=${acc(p, ctx)}:borderw=3:bordercolor=black:x='(w-text_w)/2':y='h*0.30-h*0.05*${k}':alpha='1-${k}*0.7':enable='${win(p)}'`,
  ];
}

/** Kinetic caption: big bold pop with a bounce. */
export function kineticCaption({ p, ctx }: Prim): string[] {
  const text = p.text ?? "DO THIS";
  const y = `h*0.60-h*0.02*sin(PI*(t-${p.start})/${p.duration})`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize='h/16*(0.7+0.3*sin(PI*min(1,(t-${p.start})/0.18)))':fontcolor=white:borderw=4:bordercolor=black:x='(w-text_w)/2':y='${y}':enable='${win(p)}'`,
  ];
}

/** Keyword pop-in: accent plate + word. */
export function keyPop({ p, ctx }: Prim): string[] {
  const text = (p.text ?? "KEY").toUpperCase();
  const fsB = `ih/20`;
  return [
    `drawbox=x='(iw-(${text.length}*0.62*${fsB}+40))/2':y='ih*0.56':w='(${text.length}*0.62*${fsB}+40)':h='1.7*${fsB}':c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize=h/20:fontcolor=black:x='(w-text_w)/2':y='h*0.56+0.32*h/20':enable='${win(p)}'`,
  ];
}

/** Sticker-style word pop (food/lifestyle): accent sticker, dark text. */
export function stickerPop({ p, ctx }: Prim): string[] {
  const text = (p.text ?? "YUM!").toUpperCase();
  const k = `(t-${p.start})/${Math.min(0.22, p.duration / 2)}`;
  const pop = `0.6+0.4*sin(PI*min(1,${k}))`;
  const y = `h*${(0.3 + p.variant * 0.2).toFixed(2)}`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize='h/16*${pop}':fontcolor=${acc(p, ctx)}:borderw=5:bordercolor=white:x='(w-text_w)/2':y='${y}':enable='${win(p)}'`,
  ];
}

/** Stat pop: big quantified claim ("10x", "$0 to $10k") with plate. */
export function statPop({ p, ctx }: Prim): string[] {
  const text = (p.text ?? "10x FASTER").toUpperCase();
  const fs = `h/13`;
  const k = `(t-${p.start})/${Math.min(0.25, p.duration / 2)}`;
  const pop = `0.6+0.4*sin(PI*min(1,${k}))`;
  return [
    `drawbox=x='(iw-(${text.length}*0.6*${fs}+60))/2':y='ih*0.30':w='(${text.length}*0.6*${fs}+60)':h='2.0*${fs}':c=black@0.78:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(text)}:fontsize='${fs}*${pop}':fontcolor=${acc(p, ctx)}:x='(w-text_w)/2':y='h*0.30+0.42*${fs}':enable='${win(p)}'`,
  ];
}

/** End card: full-cover CTA held to the end (pinned by the composer). */
export function ctaCard({ p, ctx }: Prim): string[] {
  const title = p.text ?? "TRY IT NOW";
  const alpha = `if(lt(t-${p.start},0.3),(t-${p.start})/0.3,1)`;
  return [
    `drawbox=x=0:y=0:w=iw:h=ih:c=${ctx.bg}:t=fill:enable='${win(p)}'`,
    `drawbox=x=0:y=0:w=iw:h=12:c=${acc(p, ctx)}:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText(title)}:fontsize=h/14:fontcolor=white:x='(w-text_w)/2':y='h*0.38':alpha='${alpha}':enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text=${escText("One click. Thirty seconds.")}:fontsize=h/28:fontcolor=${acc(p, ctx)}:x='(w-text_w)/2':y='h*0.52':alpha='${alpha}':enable='${win(p)}'`,
  ];
}

/** VHS camcorder stamp: PLAY + running timecode, top-left. */
export function vhsStamp({ p, ctx }: Prim): string[] {
  const raw = `PLAY %{pts\\:hms}`;
  const text = `'${raw.replace(/%/g, "\\%")}'`;
  return [
    `drawtext=fontfile=${ctx.fontFile}:text=${text}:fontsize=h/36:fontcolor=white@0.85:x='w*0.033':y='h*0.019':enable='${win(p)}'`,
    `drawbox=x='iw*0.022':y='ih*0.0125':w=10:h=10:c=red:t=fill:enable='${win(p)}*lt(mod(t,1),0.7)'`,
  ];
}

/** Editorial corner framing (brief §4): hairline inset border + accent
 * corner ticks. Static full-clip overlay — structure, not motion. */
export function cornerTicks({ p, ctx }: Prim): string[] {
  void p;
  const m = "iw*0.045";
  const L = "iw*0.085";
  const A = acc(p, ctx);
  const corners: Array<[string, string]> = [
    [m, m],
    [`iw-${m}-${L}`, m],
    [m, `ih-${m}-3`],
    [`iw-${m}-${L}`, `ih-${m}-3`],
  ];
  const out = [`drawbox=x='${m}':y='${m}':w='iw-2*${m}':h='ih-2*${m}':c=white@0.22:t=2`];
  for (const [cx, cy] of corners) {
    out.push(`drawbox=x='${cx}':y='${cy}':w='${L}':h=3:c=${A}@0.85:t=fill`);
    out.push(`drawbox=x='${cx}':y='${cy}':w=3:h='ih*0.045':c=${A}@0.85:t=fill`);
  }
  return out;
}
/** Highlight-box callout (edu): stroked box, blinking while active. */
export function calloutBox({ p, ctx }: Prim): string[] {
  const blink = `${win(p)}*lt(mod(t-${p.start},1.0),0.7)`;
  return [
    `drawbox=x='iw*0.10':y='ih*0.34':w='iw*0.80':h='ih*0.18':c=${acc(p, ctx)}:t=6:enable='${blink}'`,
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
    `drawbox=x='iw*0.06':y='ih*0.10':w='iw*0.30':h='ih*0.055':c=black@0.72:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text='STEP ${cur}/${total}':fontsize=h/30:fontcolor=${acc(p, ctx)}:x='w*0.06+w*0.025':y='h*0.10+h*0.008':enable='${win(p)}'`,
  ];
}

/** Code-rain columns drifting down (tech, faint). */
export function codeRain({ p, ctx }: Prim): string[] {
  const cols = ["01</>{}$", "=>{_};#", "AI*42||"];
  return cols.map((col, i) => {
    const x = `w*${(0.08 + i * 0.36).toFixed(2)}`;
    const y = `-h*0.2+mod(${(160 + i * 60)}*(t-${p.start}),h*1.4)-h*0.08`;
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

/** Follow-zoom: smooth zoom into a seeded point with a slow drift, then
 * hold. Procedural stand-in for cursor-follow zoom (no tracking data).
 * NOTE: zoompan expressions use `time`, not `t`. */
export function followZoom({ p, ctx }: Prim): string[] {
  const px = (0.3 + p.variant * 0.4).toFixed(2);
  const ramp = `min(1,(time-${p.start})/1.2)`;
  const z = `1+0.6*${ramp}`;
  return [
    `zoompan=z='${z}':x='(iw-iw/zoom)*${px}+20*sin(2*PI*0.3*time)':y='(ih-ih/zoom)*0.45':d=1:s=${ctx.W}x${ctx.H}:fps=${ctx.fps},setsar=1`,
  ];
}

/** Device-frame mockup: shrink onto black with nested accent borders.
 * (True 3D tilt needs the perspective filter; this 2.5D frame is the
 * safe primitive.) */
export function deviceFrame({ p, ctx }: Prim): string[] {
  const k = 0.86;
  const sw = Math.round(ctx.W * k);
  const sh = Math.round(ctx.H * k);
  return [
    `scale=${sw}:${sh},pad=${ctx.W}:${ctx.H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
    `drawbox=x='(iw-iw*${k})/2+18':y='(ih-ih*${k})/2+22':w='iw*${k}':h='ih*${k}':c=black@0.55:t=fill`,
    `drawbox=x='(iw-iw*${k})/2-3':y='(ih-ih*${k})/2-3':w='iw*${k}+6':h='ih*${k}+6':c=${acc(p, ctx)}:t=3`,
  ];
}

/** Before/after split: left region desaturated via a single geq (no stream
 * split needed), animated divider wipe, BEFORE/AFTER labels. */
export function beforeAfter({ p, ctx }: Prim): string[] {
  // NOTE: geq's expression evaluator in static ffmpeg builds chokes on nested
  // functions (min/clip/nested-if all probed failing 2026-10-07). The wipe ramp
  // is plain arithmetic over the effect's own window, so no clamp is needed:
  // enable gates evaluation to t in [start, start+duration].
  // Inside geq, the timestamp variable is T (not t) — probed 2026-10-07.
  const ramp = Math.max(0.05, p.duration);
  const Sg = `0.5*(T-${p.start})/${ramp}`; // geq evaluator: timestamp is T
  const Sx = `0.5*(t-${p.start})/${ramp}`; // drawbox/drawtext evaluators: t
  const L = `(0.3*r(X,Y)+0.6*g(X,Y)+0.1*b(X,Y))*0.55`;
  const geq =
    `geq=r='if(lt(X,W*${Sg}),${L},r(X,Y))':` +
    `g='if(lt(X,W*${Sg}),${L},g(X,Y))':` +
    `b='if(lt(X,W*${Sg}),${L},b(X,Y))':enable='${win(p)}'`;
  return [
    geq,
    `drawbox=x='iw*(${Sx})-2':y=0:w=4:h=ih:c=white:t=fill:enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text='BEFORE':fontsize=h/34:fontcolor=white@0.9:x='(w*(${Sx})-text_w)/2':y='h*0.06':enable='${win(p)}'`,
    `drawtext=fontfile=${ctx.fontFile}:text='AFTER':fontsize=h/34:fontcolor=white@0.9:x='w*(${Sx})+(w*(1-(${Sx}))-text_w)/2':y='h*0.06':enable='${win(p)}'`,
  ];
}
