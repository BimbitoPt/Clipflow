import React from "react";
import { interpolate, spring } from "remotion";
import type { SceneSegment } from "../../lib/scene-plan";

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

export function MotionGraphic({ kind, accent, frame, fps, sceneIndex }: { kind: NonNullable<SceneSegment["motionGraphic"]>; accent: string; frame: number; fps: number; sceneIndex: number }) {
  const reveal = spring({ frame: frame - 10, fps, config: { damping: 19, stiffness: 95 } });
  const progress = sceneProgress(frame, fps, sceneIndex);
  return <div style={{ position: "absolute", left: 90, top: 840, width: 900, height: 175, opacity: reveal, transform: `translateY(${(1 - reveal) * 28}px)` }}>
    {kind === "filmstrip" ? <Filmstrip accent={accent} progress={progress} /> : <SiteNetwork accent={accent} progress={progress} />}
  </div>;
}
