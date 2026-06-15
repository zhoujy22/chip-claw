// RTL generators for the benchmark.
//
// The agent generates in an isolated *workspace* sandbox (`workspace/bench/<run>/`)
// so its own eda-mcp tools (rtl_compile / rtl_lint) can self-check the module —
// this gives it a real compile→fix iteration budget instead of one-shot output.
//
// Two integrity rules keep pass@k honest:
//   1. The sandbox holds ONLY the agent's own module (+ any self-check TB it
//      writes). The grading testbench, stimulus and golden outputs never enter
//      it, so the agent cannot read or self-grade against the answer.
//   2. Scoring is done separately by the runner, which copies the final module
//      into an isolated scoring dir alongside the hidden testbench + golden.
//
// rtl_compile/rtl_lint both use eda-mcp's verilator_lint backend (source + top
// only — no vvp, no relative-path file IO), so the self-check works regardless
// of the testbench's cwd quirks. Where the EDA toolchain is absent the tools
// error out gracefully and the agent degrades to one-shot generation.

import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { Agent } from "../agent.js";
import { toolDefinitions, type ToolDef } from "../tools.js";
import type { TaskSpec } from "./tasks.js";

export interface ApiConfig {
  apiKey: string;
  apiBase?: string;
  useOpenAI: boolean;
}

export interface GenOptions {
  api: ApiConfig;
  model: string;
  maxTurns?: number;
  maxCostUsd?: number;
}

export interface GenResult {
  rtl: string;
  source: "file" | "fence" | "none";
  tokens: { input: number; output: number };
  usd: number;
  text: string;
}

// Tools the generator gets: file I/O + search + RTL knowledge base, plus the
// FULL eda-mcp RTL self-check chain (workspace I/O, compile, lint, synth,
// simulate, waveform). Deliberately excludes shell/agent/skill — no escape
// hatch to the host filesystem or the hidden grader.
const GEN_TOOL_NAMES = new Set([
  "read_file", "write_file", "edit_file", "list_files", "grep_search",
  "rtl_knowledge_search", "rtl_knowledge_get",
  "rtl_workspace_list", "rtl_workspace_read", "rtl_workspace_write",
  "rtl_compile", "rtl_lint", "rtl_synthesize", "rtl_simulate", "waveform_analyze",
]);

function genTools(): ToolDef[] {
  return toolDefinitions.filter((t) => GEN_TOOL_NAMES.has(t.name));
}

const GEN_SYSTEM_PROMPT = `You are an expert RTL design engineer working inside an automated benchmark harness.

Goal: implement ONE synthesizable Verilog-2001 module that a HIDDEN testbench will grade. You have a small iteration budget — spend it self-checking and fixing before you finish.

Hard rules:
- Produce ONE self-contained module. Do NOT write the grading testbench — a fixed, hidden testbench instantiates your module.
- Match the required module name, parameter names/defaults, port names, directions, and bit widths EXACTLY. A single mismatch fails the whole task.
- Use Verilog-2001 ANSI-style ports, synchronous logic, no latches, no SystemVerilog-only constructs.
- The grading testbench, its stimulus, and the golden outputs are NOT available to you. Do not search for, guess at, or fabricate them. You are scored against a hidden reference, so reason carefully from the spec alone.

Workflow:
1. (Optional) call rtl_knowledge_search for relevant templates, coding rules, and bug patterns.
2. Write the module with write_file to the EXACT path given in the task.
3. Static self-check: run rtl_compile and rtl_lint on your file, and rtl_synthesize to catch non-synthesizable constructs (inferred latches, multi-driven nets, combinational loops). Fix every error and every meaningful warning, then re-check until it compiles, lints and synthesizes clean.
4. (Optional) Functional self-check: author your OWN small self-checking testbench with INLINE stimulus (no external file reads), run rtl_simulate on it, and use waveform_analyze on the resulting VCD to debug any mismatch. This is your PRIVATE check — it is NOT the grader.
5. When the module is clean on the static checks and you are confident it meets the spec, stop.

If the EDA tools are unavailable (they may error in some environments), still write the best correct module you can from the spec and stop.`;

function buildPrompt(task: TaskSpec, targetRel: string): string {
  const specs = task.specFiles
    .map((f) => {
      const p = join(task.dir, f);
      return existsSync(p) ? `### ${f}\n${readFileSync(p, "utf-8")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  return `Implement module \`${task.moduleName}\` per the spec below.

${specs}

## Deliverable
Write the complete, synthesizable Verilog file implementing module \`${task.moduleName}\` to this EXACT path (use write_file):

  ${targetRel}

Then self-check and iterate:
- rtl_compile with files: ["${targetRel}"], top_module: "${task.moduleName}"
- rtl_lint    with files: ["${targetRel}"], top_module: "${task.moduleName}"
Fix any errors/warnings and re-check until clean.

The module name, ports, and parameters must match the spec's module signature exactly. The grading testbench and golden output are hidden — do not look for them. When clean and confident, stop.`;
}

// Rough output-token-weighted cost, per 1M tokens (in, out).
const RATES: Array<[RegExp, number, number]> = [
  [/opus/i, 3, 15],
  [/sonnet/i, 3, 15],
  [/haiku/i, 0.8, 4],
  [/gpt-4o-mini/i, 0.15, 0.6],
  [/gpt-4o|gpt-4/i, 2.5, 10],
];

function estimateUsd(model: string, input: number, output: number): number {
  const [, ri, ro] = RATES.find(([re]) => re.test(model)) || [, 3, 15];
  return (input / 1e6) * (ri as number) + (output / 1e6) * (ro as number);
}

function extractFence(text: string): string | null {
  const blocks = [...text.matchAll(/```(?:verilog|systemverilog|v)?\s*\n([\s\S]*?)```/gi)];
  if (blocks.length === 0) return null;
  return blocks[blocks.length - 1][1].trim();
}

/**
 * Drive the real agent to generate the module into a workspace sandbox where
 * its eda-mcp self-check tools can see it. `genDir` is a cwd-relative path under
 * `workspace/` (e.g. `workspace/bench/aes_encryption-k1`). Returns the RTL read
 * back from that sandbox; the caller stages it into an isolated scoring dir.
 */
export async function agentGenerate(
  task: TaskSpec,
  genDir: string,
  opts: GenOptions,
): Promise<GenResult> {
  // Fresh sandbox so a prior sample's module is never mistaken for this one.
  const genAbs = resolve(process.cwd(), genDir);
  rmSync(genAbs, { recursive: true, force: true });
  mkdirSync(genAbs, { recursive: true });

  // Path string handed to the agent: forward-slashed, cwd-relative under
  // workspace/, so write_file and the rtl_* tools resolve to the same file.
  const targetRel = `${genDir.replace(/\\/g, "/")}/${task.moduleFile}`;
  const targetAbs = join(genAbs, task.moduleFile);

  const agent = new Agent({
    model: opts.model,
    apiKey: opts.api.apiKey,
    apiBase: opts.api.useOpenAI ? opts.api.apiBase : undefined,
    anthropicBaseURL: opts.api.useOpenAI ? undefined : opts.api.apiBase,
    permissionMode: "bypassPermissions",
    isSubAgent: true, // skip memory prefetch + REPL chrome…
    enableMcp: true,  // …but still connect MCP for rtl_compile/rtl_lint
    customSystemPrompt: GEN_SYSTEM_PROMPT,
    customTools: genTools(),
    maxTurns: opts.maxTurns,
    maxCostUsd: opts.maxCostUsd,
  });

  const { text, tokens } = await agent.runOnce(buildPrompt(task, targetRel));
  const usd = estimateUsd(opts.model, tokens.input, tokens.output);

  if (existsSync(targetAbs)) {
    return { rtl: readFileSync(targetAbs, "utf-8"), source: "file", tokens, usd, text };
  }
  const fence = extractFence(text);
  if (fence) return { rtl: fence, source: "fence", tokens, usd, text };
  return { rtl: "", source: "none", tokens, usd, text };
}

/** Replay a previously-saved RTL file (no API / no model call). */
export function replayGenerate(rtlPath: string): GenResult {
  const rtl = existsSync(rtlPath) ? readFileSync(rtlPath, "utf-8") : "";
  return {
    rtl,
    source: rtl ? "file" : "none",
    tokens: { input: 0, output: 0 },
    usd: 0,
    text: "",
  };
}
