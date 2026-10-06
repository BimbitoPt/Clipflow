import React from "react";
import { interpolate, spring } from "remotion";
import type { SceneSegment } from "../../lib/scene-plan";
import type { ResolvedMotionIntent } from "../../lib/domain";

const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

function sceneProgress(frame: number, fps: number, sceneIndex: number) {
  const ranges = [[0, .22], [.22, .78], [.78, 1], [.78, 1]];
  const [start, end] = ranges[Math.min(sceneIndex, ranges.length - 1)];
  return interpolate(frame, [8, Math.max(28, fps * 2.25)], [start, end], clamp);
}

function Filmstrip({ accent, progress }: { accent: string; progress: number }) {
  const centers = Array.from({ length: 5 }, (_, index) => 84 + index * 175);
  const glowX = centers[0] + (centers.at(-1)! - centers[0]) * progress;
  return <svg viewBox="0 0 900 170" width="900" height="170" aria-hidden="true">
    <line x1={centers[0]} y1="83" x2={centers.at(-1)} y2="83" stroke="#ffffff46" strokeWidth="4" />
    <line x1={centers[0]} y1="83" x2={glowX} y2="83" stroke={accent} strokeWidth="5" style={{ filter: `drop-shadow(0 0 10px ${accent})` }} />
    {centers.map((center, index) => {
      const active = progress >= index / 5 + .04;
      return <g key={index}>
        <rect x={center - 56} y="28" width="112" height="110" rx="12" fill="#05080bc9" stroke={accent} strokeWidth={active ? 4 : 2} opacity={active ? 1 : .5} />
        <rect x={center - 40} y="43" width="80" height="80" rx="5" fill={active ? `${accent}26` : "#ffffff0d"} stroke={active ? accent : "#ffffff55"} strokeWidth="2" />
        {[-42, -21, 0, 21, 42].map((offset) => <React.Fragment key={offset}>
          <circle cx={center + offset} cy="34" r="2.5" fill={active ? accent : "#ffffff88"} />
          <circle cx={center + offset} cy="132" r="2.5" fill={active ? accent : "#ffffff88"} />
        </React.Fragment>)}
      </g>;
    })}
    <circle cx={glowX} cy="83" r="10" fill={accent} style={{ filter: `drop-shadow(0 0 14px ${accent})` }} />
  </svg>;
}

function SiteNetwork({ accent, progress }: { accent: string; progress: number }) {
  const paths = [
    "M 95 107 C 245 107, 235 72, 575 72",
    "M 245 39 C 355 39, 405 91, 575 91",
    "M 370 145 C 460 145, 490 111, 575 111",
  ];
  const nodes = [{ x: 95, y: 107, threshold: .15 }, { x: 245, y: 39, threshold: .4 }, { x: 370, y: 145, threshold: .65 }];
  return <svg viewBox="0 0 900 175" width="900" height="175" aria-hidden="true">
    {paths.map((d, index) => <g key={d}>
      <path d={d} fill="none" stroke="#ffffff40" strokeWidth="4" />
      <path d={d} fill="none" stroke={accent} strokeWidth="5" pathLength={100} strokeDasharray="100" strokeDashoffset={100 * (1 - Math.max(0, Math.min(1, (progress - index * .2) / .58)))} style={{ filter: `drop-shadow(0 0 9px ${accent})` }} />
    </g>)}
    {nodes.map((node) => <g key={node.x}>
      <circle cx={node.x} cy={node.y} r="23" fill="#05080bd9" stroke={accent} strokeWidth="3" />
      <circle cx={node.x} cy={node.y} r="10" fill={progress >= node.threshold ? accent : "#ffffff6b"} style={progress >= node.threshold ? { filter: `drop-shadow(0 0 12px ${accent})` } : undefined} />
    </g>)}
    <rect x="574" y="22" width="270" height="138" rx="12" fill="#05080bd9" stroke={accent} strokeWidth="3" />
    <line x1="574" y1="54" x2="844" y2="54" stroke={accent} strokeWidth="2" opacity=".7" />
    {[598, 616, 634].map((x) => <circle key={x} cx={x} cy="39" r="4" fill={accent} opacity=".9" />)}
    <rect x="596" y="72" width="98" height="65" rx="5" fill={accent} opacity={.08 + progress * .25} />
    <line x1="712" y1="79" x2="821" y2="79" stroke={accent} strokeWidth="7" opacity={.25 + progress * .65} />
    <line x1="712" y1="101" x2="803" y2="101" stroke="#ffffffa0" strokeWidth="5" />
    <line x1="712" y1="121" x2="784" y2="121" stroke="#ffffff70" strokeWidth="5" />
  </svg>;
}

function Transformation({ accent, progress, labels }: { accent: string; progress: number; labels: string[] }) {
  const p = Math.max(0, Math.min(1, progress));
  const x = 130 + 640 * p;
  return <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true">
    <line x1="130" y1="150" x2="770" y2="150" stroke="#ffffff44" strokeWidth="3" />
    <line x1="130" y1="150" x2={x} y2="150" stroke={accent} strokeWidth="5" style={{ filter: `drop-shadow(0 0 10px ${accent})` }} />
    {[130, 450, 770].map((center, index) => {
      const phase = index === 0 ? 1 - Math.min(1, p * 1.25) * 0.45 : index === 1 ? Math.min(1, p * 2.3) : Math.max(0, (p - 0.42) * 1.72);
      return <g key={center} opacity={0.35 + phase * 0.65} transform={`translate(${center - 95},95)`}>
        <rect width="190" height="110" rx="10" fill="#080d09" stroke={accent} strokeWidth="3" />
        <rect x="18" y="23" width="105" height="8" rx="4" fill="#f4f7ef" opacity=".8" />
        <rect x="18" y="44" width={65 + phase * 45} height="6" rx="3" fill={accent} />
        <rect x="18" y="62" width="132" height="5" rx="3" fill="#b1bcad" opacity=".6" />
        {index === 2 && <path d="M132 77l13 13 25-30" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="50" strokeDashoffset={50 * (1 - phase)} />}
        <text x="20" y="102" fill={index === 1 ? accent : "#e7eee2"} fontSize="13" fontWeight="800" letterSpacing="1">{(labels[index] ?? ["INPUT", "PROCESS", "RESULT"][index])?.slice(0, 18)}</text>
      </g>;
    })}
    <circle cx={x} cy="150" r="12" fill={accent} style={{ filter: `drop-shadow(0 0 12px ${accent})` }} />
  </svg>;
}

function Sequence({ accent, progress, fps, labels }: { accent: string; progress: number; fps: number; labels: string[] }) {
  const p = Math.max(0, Math.min(1, progress));
  const count = labels.length >= 2 ? Math.min(4, labels.length) : 4;
  const nodes = Array.from({ length: count }, (_, index) => 120 + 660 * index / (count - 1));
  return <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true">
    <line x1={nodes[0]} y1="150" x2={nodes.at(-1)} y2="150" stroke="#ffffff40" strokeWidth="5" />
    <line x1={nodes[0]} y1="150" x2={nodes[0]! + (nodes.at(-1)! - nodes[0]!) * p} y2="150" stroke={accent} strokeWidth="6" style={{ filter: `drop-shadow(0 0 9px ${accent})` }} />
    {nodes.map((cx, index) => {
      const active = p >= index / nodes.length;
      const scale = spring({ frame: progress * fps * 2 - index * 7, fps, config: { damping: 16, stiffness: 115 } });
      return <g key={cx} opacity={active ? 1 : 0.45} transform={`translate(${cx},150) scale(${0.72 + scale * 0.28})`}>
        <circle r="28" fill={active ? accent : "#172016"} stroke={accent} strokeWidth="3" />
        <circle r="8" fill={active ? "#11170c" : "#c8d2c0"} />
        <text x="0" y="58" textAnchor="middle" fill={active ? "#f1f4ed" : "#9da998"} fontSize="13" fontWeight="800" letterSpacing=".8">{(labels[index] ?? `STEP ${index + 1}`).slice(0, 15)}</text>
      </g>;
    })}
  </svg>;
}

function Comparison({ accent, progress, labels }: { accent: string; progress: number; labels: string[] }) {
  const p = Math.max(0, Math.min(1, progress));
  const split = interpolate(p, [0, 1], [400, 500]);
  return <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true">
    <rect x="70" y="75" width="330" height="150" rx="12" fill="#0b100d" stroke="#859080" strokeWidth="3" />
    <rect x="500" y="75" width="330" height="150" rx="12" fill="#0b100d" stroke={accent} strokeWidth="3" />
    <text x="94" y="101" fill="#aeb9a6" fontSize="13" fontWeight="800" letterSpacing="1">{(labels[0] ?? "START").slice(0, 22)}</text>
    <text x="524" y="101" fill={accent} fontSize="13" fontWeight="800" letterSpacing="1">{(labels[1] ?? labels[0] ?? "SHIFT").slice(0, 22)}</text>
    {[0, 1, 2].map((row) => <React.Fragment key={row}>
      <rect x="98" y={108 + row * 32} width={190 - row * 28} height="8" rx="4" fill="#b5c0ad" opacity=".62" />
      <rect x="528" y={108 + row * 32} width={160 + p * 90 - row * 20} height="8" rx="4" fill={accent} opacity=".75" />
    </React.Fragment>)}
    <line x1={split} y1="55" x2={split} y2="245" stroke="#f2f5ec" strokeWidth="2" opacity=".35" />
    <line x1="500" y1="243" x2={500 + 330 * p} y2="243" stroke={accent} strokeWidth="5" />
  </svg>;
}

function EvidenceReveal({ accent, progress }: { accent: string; progress: number }) {
  const y = interpolate(progress, [0, 1], [55, 245], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true">
    <path d="M100 115V65h70 M730 65h70v50 M100 185v50h70 M730 235h70v-50" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" />
    <line x1="104" y1={y} x2="796" y2={y} stroke={accent} strokeWidth="3" opacity=".8" />
    <circle cx="104" cy={y} r="8" fill={accent} style={{ filter: `drop-shadow(0 0 10px ${accent})` }} />
    <rect x="99" y="64" width="702" height="172" rx="7" fill="none" stroke="#ffffff55" strokeWidth="1" />
  </svg>;
}

function Payoff({ accent, progress, labels }: { accent: string; progress: number; labels: string[] }) {
  const p = Math.max(0, Math.min(1, progress));
  const center = { x: 450, y: 150 };
  return <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true">
    {Array.from({ length: 5 }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5;
      const radius = 105 * (1 - p * 0.62);
      const cx = center.x + Math.cos(angle) * radius;
      const cy = center.y + Math.sin(angle) * radius;
      return <circle key={index} cx={cx} cy={cy} r="8" fill={accent} opacity={.45 + p * .55} />;
    })}
    <circle cx={center.x} cy={center.y} r={22 + p * 26} fill="none" stroke={accent} strokeWidth="4" opacity={.45 + p * .5} />
    <path d="M438 151l9 9 18-21" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="45" strokeDashoffset={45 * (1 - p)} />
    <text x="450" y="255" textAnchor="middle" fill="#f1f4ed" fontSize="15" fontWeight="800" letterSpacing="1">{(labels[0] ?? "NEXT").slice(0, 20)}</text>
  </svg>;
}

type MotionGraphicProps = {
  kind?: NonNullable<SceneSegment["motionGraphic"]>;
  intent?: ResolvedMotionIntent;
  accent: string;
  frame: number;
  fps: number;
  sceneIndex: number;
  sceneDurationInFrames?: number;
  hasScreen?: boolean;
  labels?: string[];
};

export function MotionGraphic({ kind, intent, accent, frame, fps, sceneIndex, sceneDurationInFrames = fps * 4, hasScreen = false, labels = [] }: MotionGraphicProps) {
  const reveal = spring({ frame: frame - 8, fps, config: { damping: 19, stiffness: 95 } });
  if (intent === "none") return null;
  if (intent) {
    const progress = interpolate(frame, [0, Math.max(1, sceneDurationInFrames)], [0, 1], clamp);
    const top = intent === "evidence-reveal" && hasScreen ? 500 : 620;
    return <div style={{ position: "absolute", left: 90, top, width: 900, height: 300, opacity: reveal, transform: `translateY(${(1 - reveal) * 24}px)`, zIndex: intent === "evidence-reveal" ? 3 : 1 }}>
      {intent === "kinetic-type" && <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true"><rect x="0" y="12" width={220 * Math.min(1, progress * 7)} height="5" fill={accent} opacity={Math.min(1, (1 - progress) * 8)} /></svg>}
      {intent === "focus" && <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true" opacity={Math.sin(progress * Math.PI) * .7}><path d="M0 20v70 M900 190v70" stroke={accent} strokeWidth="4" fill="none" /></svg>}
      {intent === "metric" && <svg viewBox="0 0 900 300" width="900" height="300" aria-hidden="true"><text x="0" y="150" fill={accent} fontSize="120" fontWeight="800" textLength={(labels[0]?.length ?? 0) > 10 ? 850 : undefined} lengthAdjust="spacingAndGlyphs">{labels[0]}</text><rect x="0" y="200" width={900 * Math.min(1, progress * 3)} height="4" fill={accent} opacity=".6" /></svg>}
      {intent === "transform" && <Transformation accent={accent} progress={progress} labels={labels} />}
      {intent === "sequence" && <Sequence accent={accent} progress={progress} fps={fps} labels={labels} />}
      {intent === "comparison" && <Comparison accent={accent} progress={progress} labels={labels} />}
      {intent === "evidence-reveal" && <EvidenceReveal accent={accent} progress={progress} />}
      {intent === "payoff" && <Payoff accent={accent} progress={progress} labels={labels} />}
    </div>;
  }
  if (!kind) return null;
  const progress = sceneProgress(frame, fps, sceneIndex);
  return <div style={{ position: "absolute", left: 90, top: 840, width: 900, height: 175, opacity: reveal, transform: `translateY(${(1 - reveal) * 28}px)` }}>
    {kind === "filmstrip" ? <Filmstrip accent={accent} progress={progress} /> : <SiteNetwork accent={accent} progress={progress} />}
  </div>;
}
