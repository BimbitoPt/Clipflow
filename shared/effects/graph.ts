import { spawnSync } from "node:child_process";

/**
 * Small filter-graph builder. Chains are appended to labeled streams so
 * callers never concatenate filter strings ad hoc; `script()` joins the
 * node list with `;` and `validate()` checks label balance before render.
 *
 * Intended shape (mirrors native/src/render.rs):
 *   inputs ─per-segment chains─► [v0..vn] ─concat─► [vcat] ─fx chain─► [vout]
 */
export class FilterGraph {
  /** Extra `-i` args (values only, e.g. lavfi specs or file paths). */
  readonly inputs: string[] = [];
  private nodes: { in: string; filters: string[]; out: string }[] = [];
  private produced = new Set<string>();
  private seq = 0;

  /** Declare an input; index 0 is the caller's first `-i`. Returns index. */
  addInput(_label = "input"): number {
    const index = this.inputs.length;
    this.inputs.push(_label);
    return index;
  }

  /** Append a linear chain `in ─filters─► out`. Returns the out label. */
  chain(from: string, filters: string[], to?: string): string {
    const out = to ?? `fx${this.seq++}`;
    this.nodes.push({ in: from, filters: [...filters], out });
    this.produced.add(out);
    return out;
  }

  /** Render the `-filter_complex` script (use `-filter_complex_script`
   * with this content on Windows to dodge the 32k argv limit).
   * NOTE: no comma may follow an input label (`[0:v]scale=…`, never
   * `[0:v],scale=…`) — the parser reads that comma as an empty filter. */
  script(): string {
    return this.nodes
      .map((n) => `${n.in}${n.filters.length ? n.filters.join(",") : "null"}[${n.out}]`)
      .join(";");
  }

  /**
   * Validate label balance and chain sanity. Returns error strings
   * (empty = valid). Input stream labels like `0:v` count as producers.
   */
  validate(inputCount = 1): string[] {
    const errors: string[] = [];
    const produced = new Set<string>();
    for (let i = 0; i < inputCount + this.inputs.length; i++) {
      produced.add(`${i}:v`);
      produced.add(`${i}:a`);
    }
    const labelRe = /\[([A-Za-z0-9_:]+)\]/g;
    for (const node of this.nodes) {
      if (node.filters.some((f) => f.trim().length === 0)) {
        errors.push(`empty filter in chain -> [${node.out}]`);
      }
      const stripIn = node.in.replace(/^\[(.+)\]$/, "$1");
      // `in` may be a single label or a concat-style multi-label prefix.
      const multi = node.in.match(/^(?:\[[^\]]+\])+$/) ? [...node.in.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]) : [];
      const ins = multi.length > 0 ? [] : [stripIn];
      for (const l of [...ins, ...multi]) {
        if (l && !produced.has(l) && !/^\d+:[va]$/.test(l)) {
          errors.push(`chain reads undefined label [${l}] (-> [${node.out}])`);
        }
      }
      // Refs inside filter bodies must resolve too.
      for (const m of node.filters.join(",").matchAll(labelRe)) {
        const l = m[1];
        if (!produced.has(l) && l !== node.out && !/^\d+:[va]$/.test(l)) {
          errors.push(`filter references undefined label [${l}] (-> [${node.out}])`);
        }
      }
      if (produced.has(node.out)) errors.push(`duplicate producer for [${node.out}]`);
      produced.add(node.out);
    }
    // Bracket sanity over the whole script.
    const script = this.script();
    const open = (script.match(/\[/g) ?? []).length;
    const close = (script.match(/\]/g) ?? []).length;
    if (open !== close) errors.push(`unbalanced brackets: ${open} [ vs ${close} ]`);
    if (/\],/.test(script)) errors.push("comma after input label (parses as an empty filter)");
    return errors;
  }
}

/** Escape a drawtext text= value (this ffmpeg build rejects textfile). */
export function escText(content: string): string {
  return `'${content
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")}'`;
}

/** Escape an ass/subtitles file path for filter use. */
export function escAssPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/'/g, "\\'").replace(/:/g, "\\:");
}

/** Quote argv for logging (log the full ffmpeg command on failure). */
export function formatCommand(bin: string, args: string[]): string {
  const q = (a: string) => (/[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  return [bin, ...args.map(q)].join(" ");
}

/**
 * Check required filters exist in the local FFmpeg build
 * (`ffmpeg -filters`). Returns the missing names.
 */
export function checkFilters(
  ffmpegPath: string,
  required: string[],
  spawn: (bin: string, args: string[]) => { status: number | null; stdout: string } = (bin, args) =>
    spawnSync(bin, args, { encoding: "utf8" }),
): string[] {
  const out = spawn(ffmpegPath, ["-hide_banner", "-filters"]);
  if (out.status !== 0) return [...required];
  const have = new Set<string>();
  for (const line of out.stdout.split("\n")) {
    const m = /^\s*[.A-Z]{3}\s+([a-z0-9_]+)\s/.exec(line);
    if (m) have.add(m[1]);
  }
  return required.filter((f) => !have.has(f));
}
