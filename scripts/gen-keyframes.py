"""
Product-demo keyframes — local Stable Diffusion 1.5, pure text-to-image.

Five story beats, concrete photographic subjects, brandkit-anchored II
(charcoal #080A0D, lime #CFFF47, off-white #F7F8FA). Two seeds per keyframe,
darker wins; every winner gets a caption-safe crush (contrast + vignette).

Usage: python scripts/gen-keyframes.py [--only=kf-hook] [--steps=25]
Output: .fx-tmp/keyframes/{id}.png @ 720x1280 + .fx-tmp/kf-sheet.png.
Staged only — manifest wiring happens on approval.
"""
import argparse
import os
import re
import subprocess
import sys

import torch
from diffusers import StableDiffusionPipeline

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, ".fx-tmp", "keyframes-raw")
OUT = os.path.join(ROOT, ".fx-tmp", "keyframes")
TMP = os.path.join(ROOT, ".fx-tmp")
FFMPEG = os.path.join(ROOT, "node_modules", "ffmpeg-static", "ffmpeg.exe")

BRAND = ("brand colors charcoal black #080A0D with lime green #CFFF47 accents, "
         "off-white details, dark mode, Inter-style clean shapes")
STYLE = "night photograph, cinematic, minimalist, faint film grain"
NEG = ("text, watermark, logo, words, letters, caption, subtitle, people, faces, hands, "
       "busy, cluttered, daylight, oversaturated, blurry, low quality")

# (id, seed, subject)
KEYFRAMES = [
    ("kf-hook", 501,
     "overwhelming video editing timeline interface closeup at night, dozens of tracks and panels, stressful complexity"),
    ("kf-oneline", 502,
     "a single glowing lime-green text cursor line on pure black, vast emptiness around it"),
    ("kf-local", 503,
     "laptop on a dark desk at night, screen glowing lime-green with video frames, black room"),
    ("kf-proof", 504,
     "hand holding a vertical phone playing a video with glowing captions, dark surroundings at night"),
    ("kf-cta", 505,
     "a glowing lime-green doorway ajar in a black wall, light spilling out, forward motion feel"),
]

POST = ("scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,"
        "eq=brightness=-0.05:saturation=0.9:contrast=1.1,vignette=PI/5,format=yuv420p")


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def mean_luma(png):
    r = run([FFMPEG, "-hide_banner", "-i", png, "-vf", "signalstats,metadata=print:file=-",
             "-f", "null", "-"])
    m = re.findall(r"lavfi\.signalstats\.YAVG=([\d.]+)", r.stderr)
    vals = [float(v) for v in m]
    return sum(vals) / len(vals) if vals else 1e9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    ap.add_argument("--steps", type=int, default=25)
    args = ap.parse_args()

    targets = [k for k in KEYFRAMES if args.only is None or k[0] == args.only]
    if args.only and not targets:
        print(f"unknown id {args.only}")
        return 2
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    pipe = StableDiffusionPipeline.from_pretrained(
        "runwayml/stable-diffusion-v1-5", torch_dtype=torch.float16).to("cuda")
    pipe.enable_attention_slicing()
    try:
        pipe.vae.enable_slicing()
    except Exception:
        pass

    for sid, seed, subject in targets:
        cands = []
        for k in range(2):
            gen = torch.Generator("cuda").manual_seed(seed + k * 1000)
            img = pipe(f"{subject}, {BRAND}, {STYLE}", negative_prompt=NEG,
                       width=512, height=768, num_inference_steps=args.steps,
                       guidance_scale=6.5, generator=gen).images[0]
            raw = os.path.join(RAW, f"{sid}-c{k}.png")
            img.save(raw)
            final = os.path.join(OUT, f"{sid}-c{k}.png")
            r = run([FFMPEG, "-y", "-i", raw, "-vf", POST, "-frames:v", "1", final])
            if r.returncode != 0:
                print(f"[kf] post failed for {sid}-c{k}\n{r.stderr[-400:]}")
                return 1
            cands.append((mean_luma(final), f"{sid}-c{k}.png"))
        cands.sort()
        os.replace(os.path.join(OUT, cands[0][1]), os.path.join(OUT, f"{sid}.png"))
        for _, name in cands[1:]:
            os.remove(os.path.join(OUT, name))
        print(f"[kf] {sid}: kept {cands[0][1]} (YAVG {cands[0][0]:.1f} vs {cands[1][0]:.1f})", flush=True)

    # Contact sheet (single target: plain scaled copy).
    if len(targets) == 1:
        r = run([FFMPEG, "-y", "-i", os.path.join(OUT, f"{targets[0][0]}.png"),
                 "-vf", "scale=288:512", "-frames:v", "1", os.path.join(TMP, "kf-sheet.png")])
    else:
        inputs, chains = [], []
        for i, (sid, _, _) in enumerate(targets):
            inputs += ["-i", os.path.join(OUT, f"{sid}.png")]
            chains.append(f"[{i}:v]scale=288:512[s{i}]")
        alls = "".join(f"[s{i}]" for i in range(len(targets)))
        layout = "|".join(f"{(i % 5) * 288}_{(i // 5) * 512}" for i in range(len(targets)))
        r = run([FFMPEG, "-y", *inputs, "-filter_complex",
                 f"{';'.join(chains)};{alls}xstack=inputs={len(targets)}:layout={layout}[vout]",
                 "-map", "[vout]", "-frames:v", "1", os.path.join(TMP, "kf-sheet.png")])
    if r.returncode != 0:
        print(f"[kf] sheet failed\n{r.stderr[-400:]}")
        return 1
    print("[kf] wrote .fx-tmp/kf-sheet.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
