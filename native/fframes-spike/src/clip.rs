//! SVG port of src/lib/render.ts drawFrame, parameterized by cues + theme.

use fframes::{
    AudioMap, Color, Duration, FFramesContext, FontQuery, Frame, Svgr, Transform, Video,
};

pub const W: f32 = 720.0;
pub const H: f32 = 1280.0;
const CREDIT_SECS: f32 = 2.0;
const HOOK_CARD_SECS: f32 = 4.0;
const HOOK_CARD_WORDS: usize = 8;
pub const FONT: &str = "Segoe UI";

const BG0_HEX: &str = "#080A0D";
const INK: Color = Color::hex("#F7F8FA");
const BG0: Color = Color::hex("#080A0D");

#[derive(Clone, Copy)]
pub struct Theme {
    pub accent_hex: &'static str,
    pub bg1_hex: &'static str,
}

/// mstudio pack theme 0.
pub const MSTUDIO: Theme = Theme {
    accent_hex: "#246BFD",
    bg1_hex: "#12306e",
};
/// clipflow pack theme 1 (lime).
pub const CLIPFLOW: Theme = Theme {
    accent_hex: "#CFFF47",
    bg1_hex: "#0d3b2e",
};

pub struct Cue {
    pub kind: CueKind,
    pub text: &'static str,
    pub start: f32,
    pub end: f32,
}

#[derive(Clone, Copy, PartialEq)]
pub enum CueKind {
    Hook,
    Beat,
    Cta,
}

/// The Phase 4 single-clip cue list (45s).
pub const DEFAULT_CUES: &[Cue] = &[
    Cue {
        kind: CueKind::Hook,
        text: "Slow sites cost you sales every single week.",
        start: 0.0,
        end: 10.0,
    },
    Cue {
        kind: CueKind::Beat,
        text: "MSTUDIO ships brand and web builds in 1 to 2 weeks, documented, code you own.",
        start: 10.0,
        end: 20.0,
    },
    Cue {
        kind: CueKind::Beat,
        text: "Every build ships with proof. Real sites, real checkout buttons, real loading speed.",
        start: 20.0,
        end: 30.0,
    },
    Cue {
        kind: CueKind::Cta,
        text: "Book MSTUDIO. Your site ships while you keep selling.",
        start: 30.0,
        end: 43.0,
    },
];

/// 15s hook+cta cuts used by the Phase 5 batch (pack hook/cta bank lines).
pub const MINI_MSTUDIO_A: &[Cue] = &[
    Cue {
        kind: CueKind::Hook,
        text: "Your website should sell while you sleep.",
        start: 0.0,
        end: 8.0,
    },
    Cue {
        kind: CueKind::Cta,
        text: "Book MSTUDIO. Your site ships in two weeks.",
        start: 8.0,
        end: 13.0,
    },
];
pub const MINI_MSTUDIO_B: &[Cue] = &[
    Cue {
        kind: CueKind::Hook,
        text: "Templates lose deals. Custom builds close them.",
        start: 0.0,
        end: 8.0,
    },
    Cue {
        kind: CueKind::Cta,
        text: "Book MSTUDIO. Fixed price, fixed timeline.",
        start: 8.0,
        end: 13.0,
    },
];
pub const MINI_CLIPFLOW: &[Cue] = &[
    Cue {
        kind: CueKind::Hook,
        text: "Type your idea. Clipflow makes the video.",
        start: 0.0,
        end: 8.0,
    },
    Cue {
        kind: CueKind::Cta,
        text: "Try Clipflow. Your first clip ships in minutes.",
        start: 8.0,
        end: 13.0,
    },
];

pub struct HookClip {
    pub cues: &'static [Cue],
    pub theme: Theme,
    pub secs: f32,
}

impl Default for HookClip {
    fn default() -> Self {
        Self {
            cues: DEFAULT_CUES,
            theme: MSTUDIO,
            secs: 45.0,
        }
    }
}

fn clamp01(v: f32) -> f32 {
    v.clamp(0.0, 1.0)
}

fn active_cue(cues: &[Cue], t: f32) -> Option<&Cue> {
    cues.iter().find(|c| t >= c.start && t < c.end)
}

/// First HOOK_CARD_WORDS words of the hook, as a slice of the input.
fn hook_headline(text: &str) -> &str {
    let b = text.as_bytes();
    let mut count = 0usize;
    let mut end = 0usize;
    let mut i = 0usize;
    while i < b.len() {
        while i < b.len() && (b[i] as char).is_ascii_whitespace() {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        while i < b.len() && !(b[i] as char).is_ascii_whitespace() {
            i += 1;
        }
        count += 1;
        end = i;
        if count >= HOOK_CARD_WORDS {
            break;
        }
    }
    &text[..end]
}

fn measure_text<'a>(
    frame: &mut Frame,
    ctx: &FFramesContext<'a, '_>,
    size: f32,
    s: &'a str,
) -> f32 {
    let font = FontQuery {
        family: FONT,
        size: size as usize,
        weight: 700,
        ..Default::default()
    };
    match frame.text_width(ctx, font, s) {
        Some(w) => w as f32,
        None => (s.len() as f32) * size * 0.55,
    }
}

/// Greedy wrap as byte ranges into `text` (words keep original single-space joins).
fn wrap_ranges<'a>(
    frame: &mut Frame,
    ctx: &FFramesContext<'a, '_>,
    text: &'a str,
    max_w: f32,
    size: f32,
) -> Vec<(usize, usize)> {
    let b = text.as_bytes();
    let mut ranges: Vec<(usize, usize)> = Vec::new();
    let mut line_start = 0usize;
    let mut line_end = 0usize;
    let mut i = 0usize;
    while i < b.len() {
        while i < b.len() && (b[i] as char).is_ascii_whitespace() {
            i += 1;
        }
        if i >= b.len() {
            break;
        }
        let w_start = i;
        while i < b.len() && !(b[i] as char).is_ascii_whitespace() {
            i += 1;
        }
        let w_end = i;
        if line_start == line_end {
            line_start = w_start;
            line_end = w_end;
            continue;
        }
        let cand = &text[line_start..w_end];
        if measure_text(frame, ctx, size, cand) <= max_w {
            line_end = w_end;
        } else {
            ranges.push((line_start, line_end));
            line_start = w_start;
            line_end = w_end;
        }
    }
    if line_start < line_end {
        ranges.push((line_start, line_end));
    }
    ranges
}

/// Fallback caption layout: shrink from 96px, greedy wrap, left at x=48.
fn caption_lines<'a>(
    frame: &mut Frame,
    ctx: &FFramesContext<'a, '_>,
    text: &'a str,
) -> (f32, Vec<(usize, usize)>) {
    let fit_w = (W - 96.0) / 1.15;
    let base = 96.0f32;
    let min = 28.0f32;
    let mut lo = min;
    let mut top = base;
    let mut size = min;
    while lo <= top {
        let mid = ((lo + top) / 2.0).floor();
        let wrapped = wrap_ranges(frame, ctx, text, fit_w, mid);
        if wrapped
            .iter()
            .all(|&(s, e)| measure_text(frame, ctx, mid, &text[s..e]) <= fit_w)
        {
            size = mid;
            lo = mid + 1.0;
        } else {
            top = mid - 1.0;
        }
    }
    let ranges = wrap_ranges(frame, ctx, text, fit_w, size);
    (size, ranges)
}

/// Hook-card layout (drawHookCard): shrink by 2, then spill to two lines.
fn hook_card_layout<'a>(
    frame: &mut Frame,
    ctx: &FFramesContext<'a, '_>,
    headline: &'a str,
) -> (f32, Vec<(usize, usize)>) {
    let max_w = W * 0.86;
    let min_size = (W * 0.03).round().max(12.0);
    let mut size = (W * 0.052).round();
    loop {
        if size <= min_size || measure_text(frame, ctx, size, headline) <= max_w {
            break;
        }
        size -= 2.0;
    }
    size = size.max(min_size);
    let mut ranges = vec![(0usize, headline.len())];
    if measure_text(frame, ctx, size, headline) > max_w {
        let mut words: Vec<(usize, usize)> = Vec::new();
        let b = headline.as_bytes();
        let mut i = 0usize;
        while i < b.len() {
            while i < b.len() && (b[i] as char).is_ascii_whitespace() {
                i += 1;
            }
            if i >= b.len() {
                break;
            }
            let w_start = i;
            while i < b.len() && !(b[i] as char).is_ascii_whitespace() {
                i += 1;
            }
            words.push((w_start, i));
        }
        let half = (words.len() + 1) / 2;
        ranges = vec![
            (0, words[half - 1].1),
            (words[half].0, words.last().unwrap().1),
        ];
    }
    (size, ranges)
}

fn rays_group(t: f32, accent: Color) -> Svgr<'static> {
    const WEDGE: &str = "M 360 1280 L 1640 1280 A 1280 1280 0 0 1 1629.049 1467.074 Z";
    const STEP: f32 = std::f32::consts::TAU / 12.0;
    let base = t * 0.1;
    let wedge = |i: f32| -> Svgr<'static> {
        fframes::svgr!(
            <path d={WEDGE} fill={accent} transform={Transform::rotate(base + i * STEP)} opacity={0.06} />
        )
    };
    fframes::svgr!(
        <g>
            {wedge(0.0)}{wedge(1.0)}{wedge(2.0)}{wedge(3.0)}
            {wedge(4.0)}{wedge(5.0)}{wedge(6.0)}{wedge(7.0)}
            {wedge(8.0)}{wedge(9.0)}{wedge(10.0)}{wedge(11.0)}
        </g>
    )
}

impl Video for HookClip {
    const FPS: usize = 30;
    const WIDTH: usize = 720;
    const HEIGHT: usize = 1280;

    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(self.secs)
    }

    fn audio(&self) -> AudioMap<'_> {
        AudioMap::none()
    }

    fn render_frame<'a>(
        &'a self,
        mut frame: Frame,
        ctx: &FFramesContext<'a, '_>,
    ) -> Svgr<'a> {
        let t = frame.seconds();
        let total = self.secs;
        let accent = Color::hex(self.theme.accent_hex);
        let bg1 = Color::hex(self.theme.bg1_hex);

        if t >= total - CREDIT_SECS {
            let mark_size = (W * 0.11).round();
            let over_size = (W * 0.032).round();
            let bar_w = W * 0.2;
            return fframes::svgr!(
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280"
                    width={ctx.current_video_size.width} height={ctx.current_video_size.height}>
                    <rect x="0" y="0" width={W} height={H} fill={BG0} />
                    <rect x="0" y="0" width={W} height="12" fill={accent} />
                    <rect x="0" y={H - 14.0} width={W} height="14" fill={accent} />
                    <text x={W / 2.0} y={H * 0.46} text-anchor="middle"
                        font-family="Consolas" font-size={over_size} font-weight="700" fill="#9BAC9B">"MADE WITH"</text>
                    <text x={W / 2.0} y={H * 0.53} text-anchor="middle"
                        font-family={FONT} font-size={mark_size} font-weight="700" fill="#F2F5ED">"CLIPFLOW"</text>
                    <rect x={(W - bar_w) / 2.0} y={H * 0.57} width={bar_w} height="6" fill={accent} />
                </svg>
            );
        }

        let cue = active_cue(self.cues, t);
        let progress = cue
            .map(|c| clamp01((t - c.start) / (c.end - c.start).max(0.001)))
            .unwrap_or(0.0);

        let z = 1.0 + 0.08 * (t / total);
        let scene = fframes::svgr!(
            <g transform={Transform::translate(W / 2.0 * (1.0 - z), H / 2.0 * (1.0 - z))}>
                <g transform={Transform::scale(z)}>
                    <defs>
                        <linearGradient id="bg" x1="0" y1="0" x2="0" y2={H}>
                            <stop offset="0" stop-color={BG0_HEX} />
                            <stop offset="1" stop-color={bg1} />
                        </linearGradient>
                    </defs>
                    <rect x="0" y="0" width={W} height={H} fill="url(#bg)" />
                    {rays_group(t, accent)}
                </g>
            </g>
        );

        let motion = {
            let p = progress;
            let bar_w = (W * 0.23 * (p * 7.0).min(1.0)).max(0.5);
            let bar_h = 2.0f32.max(W * 0.006);
            let bar_a = ((1.0 - p) * 8.0).min(1.0);
            let edge_h = H * 0.055;
            let edge_w = 2.0f32.max(W * 0.005);
            let edge_a = (p * std::f32::consts::PI).sin() * 0.7;
            fframes::svgr!(
                <g>
                    <rect x={W * 0.07} y={H * 0.60} width={bar_w} height={bar_h} fill={accent} opacity={bar_a} />
                    <rect x={W * 0.045} y={H * 0.21} width={edge_w} height={edge_h} fill={accent} opacity={edge_a} />
                    <rect x={W * 0.95} y={H * 0.62} width={edge_w} height={edge_h} fill={accent} opacity={edge_a} />
                </g>
            )
        };

        let dip = cue
            .map(|c| {
                let edge = (t - c.start).min(c.end - t);
                if edge < 0.15 && edge >= 0.0 {
                    let k = 1.0 - edge / 0.15;
                    0.7 * k * k
                } else {
                    0.0
                }
            })
            .unwrap_or(0.0);

        let caption = cue.map(|c| {
            let text: &'a str = c.text;
            let (size, ranges) = caption_lines(&mut frame, ctx, text);
            let y0 = H / 2.0;
            let texts = ranges
                .iter()
                .enumerate()
                .map(|(i, &(s, e))| {
                    let y = y0 + (i as f32) * 110.0;
                    let line_ref: &'a str = &text[s..e];
                    fframes::svgr!(
                        <text x="48" y={y} font-family={FONT} font-size={size} font-weight="700" fill={INK}>{line_ref}</text>
                    )
                })
                .collect::<Vec<_>>();
            (size, texts)
        });

        let hook_card = cue.and_then(|c| {
            if c.kind != CueKind::Hook {
                return None;
            }
            let elapsed = t - c.start;
            if !(0.0..HOOK_CARD_SECS).contains(&elapsed) {
                return None;
            }
            let headline: &'a str = hook_headline(c.text);
            if headline.is_empty() {
                return None;
            }
            let fade = clamp01((elapsed / 0.25).min((HOOK_CARD_SECS - elapsed) / 0.5));
            let (size, ranges) = hook_card_layout(&mut frame, ctx, headline);
            let pad_x = W * 0.035;
            let mut max_line = 0.0f32;
            for &(s, e) in &ranges {
                let w = measure_text(&mut frame, ctx, size, &headline[s..e]);
                if w > max_line {
                    max_line = w;
                }
            }
            let box_w = (W * 0.9).min(max_line + pad_x * 2.0);
            let line_h = size * 1.35;
            let box_h = line_h * (ranges.len() as f32) + size * 0.5;
            let y = H * 0.16 - box_h / 2.0;
            let texts = ranges
                .iter()
                .enumerate()
                .map(|(i, &(s, e))| {
                    let baseline = y + size * 0.5 + (i as f32) * line_h + size * 0.35;
                    let line_ref: &'a str = &headline[s..e];
                    fframes::svgr!(
                        <text x={W / 2.0} y={baseline} text-anchor="middle"
                            font-family={FONT} font-size={size} font-weight="700" fill={INK}>{line_ref}</text>
                    )
                })
                .collect::<Vec<_>>();
            Some(fframes::svgr!(
                <g opacity={fade}>
                    <rect x={(W - box_w) / 2.0} y={y} width={box_w} height={box_h} fill={BG0} opacity={0.85} />
                    <rect x={(W - box_w) / 2.0} y={y + box_h - 4.0} width={box_w} height="4" fill={accent} />
                    {texts}
                </g>
            ))
        });

        let progress_w = ((W * t) / total).max(0.5);

        fframes::svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1280"
                width={ctx.current_video_size.width} height={ctx.current_video_size.height}>
                {scene}
                {motion}
                {if dip > 0.0 {
                    fframes::svgr!(<rect x="0" y="0" width={W} height={H} fill={BG0} opacity={dip} />)
                } else {
                    Svgr::empty()
                }}
                <rect x="0" y="0" width={W} height="12" fill={accent} />
                {caption.map(|(_, texts)| {
                    fframes::svgr!(<g>{texts}</g>)
                }).unwrap_or_else(Svgr::empty)}
                {hook_card.unwrap_or_else(Svgr::empty)}
                <rect x="0" y={H - 14.0} width={progress_w} height="14" fill={accent} />
            </svg>
        )
    }
}
