#!/usr/bin/env node
// Benchmark runner CLI: for each task × k samples, generate RTL with the
// agent, score it against golden via the selected backend, and report pass@k.
//
// Usage:
//   node dist/bench/run.js [--task <id>]... [--suite ArchXBench]
//                          [--backend auto|docker|host] [--k N]
//                          [--model M] [--generator agent|replay]
//                          [--replay <file>] [--replay-dir <dir>]
//                          [--max-cost USD] [--max-turns N] [--out report.json]

import "dotenv/config";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { configureEnvProxy } from "../proxy.js";
import { listTaskIds, getTask, type TaskSpec } from "./tasks.js";
import { makeBackend, type BackendName } from "./backends.js";
import { stageTask, scoreTask, type ScoreResult } from "./score.js";
import { agentGenerate, replayGenerate, type ApiConfig, type GenResult } from "./generate.js";

interface Args {
  tasks: string[];
  backend: BackendName;
  k: number;
  model: string;
  generator: "agent" | "replay";
  replay?: string;
  replayDir?: string;
  maxCost?: number;
  maxTurns?: number;
  out?: string;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const tasks: string[] = [];
  let backend: BackendName = "auto";
  let k = 1;
  let model = process.env.CHIPCLAW_MODEL || "claude-opus-4-6";
  let generator: "agent" | "replay" = "agent";
  let replay: string | undefined;
  let replayDir: string | undefined;
  let maxCost: number | undefined;
  let maxTurns: number | undefined;
  let out: string | undefined;

  for (let i = 0; i < a.length; i++) {
    const arg = a[i];
    if (arg === "--task") tasks.push(a[++i]);
    else if (arg === "--suite") { if (a[i + 1] && !a[i + 1].startsWith("--")) i++; tasks.push(...listTaskIds()); }
    else if (arg === "--backend") backend = a[++i] as BackendName;
    else if (arg === "--k") k = parseInt(a[++i], 10) || 1;
    else if (arg === "--model" || arg === "-m") model = a[++i] || model;
    else if (arg === "--generator") generator = a[++i] === "replay" ? "replay" : "agent";
    else if (arg === "--replay") replay = a[++i];
    else if (arg === "--replay-dir") replayDir = a[++i];
    else if (arg === "--max-cost") maxCost = parseFloat(a[++i]);
    else if (arg === "--max-turns") maxTurns = parseInt(a[++i], 10);
    else if (arg === "--out") out = a[++i];
    else if (arg === "--help" || arg === "-h") { printHelp(); process.exit(0); }
  }

  const unique = tasks.length > 0 ? [...new Set(tasks)] : listTaskIds();
  return { tasks: unique, backend, k, model, generator, replay, replayDir, maxCost, maxTurns, out };
}

function printHelp(): void {
  console.log(`chip-claw benchmark runner

Options:
  --task <id>        Task to run (repeatable). Known: ${listTaskIds().join(", ")}
  --suite ArchXBench Run all ArchXBench tasks (default if no --task)
  --backend NAME     auto | docker | host (default auto; docker = eda-mcp image)
  --k N              Samples per task for pass@k (default 1)
  --model M          Model id (default CHIPCLAW_MODEL or claude-opus-4-6)
  --generator G      agent (call the model) | replay (use a saved .v)
  --replay <file>    RTL file for replay mode (single task)
  --replay-dir <dir> Dir of <moduleFile> RTL files for replay mode
  --max-cost USD     Per-sample generation cost budget
  --max-turns N      Per-sample generation turn budget
  --out <path>       Report JSON path (default bench-results/bench-<ts>.json)`);
}

function resolveApi(useOpenAIPreferred: boolean): ApiConfig {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_BASE_URL) {
    return { apiKey: process.env.OPENAI_API_KEY, apiBase: process.env.OPENAI_BASE_URL, useOpenAI: true };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { apiKey: process.env.ANTHROPIC_API_KEY, apiBase: process.env.ANTHROPIC_BASE_URL, useOpenAI: false };
  }
  if (process.env.OPENAI_API_KEY) {
    return { apiKey: process.env.OPENAI_API_KEY, apiBase: process.env.OPENAI_BASE_URL, useOpenAI: true };
  }
  throw new Error("No API key. Set ANTHROPIC_API_KEY or OPENAI_API_KEY (+ OPENAI_BASE_URL).");
}

interface SampleRecord {
  k: number;
  status: ScoreResult["status"] | "skipped";
  phase: ScoreResult["phase"] | "generate";
  source: GenResult["source"];
  tokens: { input: number; output: number };
  usd: number;
  runDir: string;
  note?: string;
}

// Default compile→fix iteration budget for agent generation (turns).
const DEFAULT_GEN_MAX_TURNS = 12;

async function runSample(
  task: TaskSpec, idx: number, args: Args, api: ApiConfig, runRoot: string,
): Promise<SampleRecord> {
  const runDir = join(runRoot, `${task.id}-k${idx}`);
  stageTask(task, runDir);

  let gen: GenResult;
  try {
    if (args.generator === "replay") {
      const file = args.replayDir ? join(args.replayDir, task.moduleFile) : args.replay;
      if (!file) throw new Error("replay mode needs --replay or --replay-dir");
      gen = replayGenerate(file);
    } else {
      // Generate in a workspace sandbox so the agent's eda-mcp self-check tools
      // can see the module. Golden/testbench never enter this dir.
      const genDir = join("workspace", "bench", `${task.id}-k${idx}`);
      gen = await agentGenerate(task, genDir, {
        api, model: args.model,
        maxTurns: args.maxTurns ?? DEFAULT_GEN_MAX_TURNS,
        maxCostUsd: args.maxCost,
      });
    }
  } catch (e: any) {
    return { k: idx, status: "error", phase: "generate", source: "none",
      tokens: { input: 0, output: 0 }, usd: 0, runDir, note: e.message };
  }

  if (!gen.rtl) {
    return { k: idx, status: "error", phase: "generate", source: gen.source,
      tokens: gen.tokens, usd: gen.usd, runDir, note: "no RTL produced" };
  }
  writeFileSync(join(runDir, task.moduleFile), gen.rtl);

  const backend = makeBackend(args.backend);
  if (!backend.available()) {
    return { k: idx, status: "skipped", phase: "compile", source: gen.source,
      tokens: gen.tokens, usd: gen.usd, runDir,
      note: `backend '${backend.name}' unavailable (no toolchain)` };
  }

  const score = scoreTask(task, runDir, backend);
  writeFileSync(join(runDir, "score.log"), score.log);
  return { k: idx, status: score.status, phase: score.phase, source: gen.source,
    tokens: gen.tokens, usd: gen.usd, runDir, note: score.status === "pass" ? undefined : score.phase };
}

async function main(): Promise<void> {
  configureEnvProxy();
  const args = parseArgs();

  const needApi = args.generator === "agent";
  const api: ApiConfig = needApi
    ? resolveApi(false)
    : { apiKey: "", useOpenAI: false };

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = join(process.cwd(), "bench-runs", ts);
  mkdirSync(runRoot, { recursive: true });

  console.log(`\nchip-claw benchmark — backend=${args.backend} k=${args.k} model=${args.model} generator=${args.generator}`);
  console.log(`tasks: ${args.tasks.join(", ")}\n`);

  const taskRecords: Array<{ id: string; samples: SampleRecord[]; passAtK: boolean; passAt1: boolean }> = [];

  for (const id of args.tasks) {
    let task: TaskSpec;
    try { task = getTask(id); }
    catch (e: any) { console.log(`  ${id}: ${e.message}`); continue; }

    const samples: SampleRecord[] = [];
    for (let i = 1; i <= args.k; i++) {
      process.stdout.write(`  ${id} [${i}/${args.k}] … `);
      const rec = await runSample(task, i, args, api, runRoot);
      samples.push(rec);
      console.log(`${rec.status}${rec.note ? ` (${rec.note})` : ""}`);
    }
    const passAtK = samples.some((s) => s.status === "pass");
    const passAt1 = samples[0]?.status === "pass";
    taskRecords.push({ id, samples, passAtK, passAt1 });
  }

  // ── Aggregate ──
  const scored = taskRecords.filter((t) => t.samples.some((s) => s.status !== "skipped"));
  const passKCount = taskRecords.filter((t) => t.passAtK).length;
  const pass1Count = taskRecords.filter((t) => t.passAt1).length;
  const tokensIn = sum(taskRecords, (s) => s.tokens.input);
  const tokensOut = sum(taskRecords, (s) => s.tokens.output);
  const usd = sum(taskRecords, (s) => s.usd);

  console.log(`\n── Summary ──`);
  for (const t of taskRecords) {
    const marks = t.samples.map((s) => statusMark(s.status)).join("");
    console.log(`  ${pad(t.id, 16)} ${marks}  pass@1=${t.passAt1 ? "✓" : "✗"} pass@${args.k}=${t.passAtK ? "✓" : "✗"}`);
  }
  const denom = taskRecords.length || 1;
  console.log(`\n  pass@1: ${pass1Count}/${denom}   pass@${args.k}: ${passKCount}/${denom}` +
    (scored.length < taskRecords.length ? `   (${taskRecords.length - scored.length} skipped: no toolchain)` : ""));
  console.log(`  tokens: ${tokensIn} in / ${tokensOut} out   est. cost: $${usd.toFixed(4)}`);

  const report = {
    startedAt: ts,
    model: args.model,
    backend: args.backend,
    k: args.k,
    generator: args.generator,
    tasks: taskRecords,
    totals: { tasks: taskRecords.length, passAt1: pass1Count, passAtK: passKCount, tokensIn, tokensOut, usd },
  };
  const outPath = args.out ? resolve(args.out) : defaultReportPath(ts);
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n  report: ${outPath}`);
  console.log(`  run dirs: ${runRoot}\n`);
}

function defaultReportPath(ts: string): string {
  return join(process.cwd(), "bench-results", `bench-${ts}.json`);
}

function sum(
  records: Array<{ samples: SampleRecord[] }>,
  pick: (s: SampleRecord) => number,
): number {
  let total = 0;
  for (const r of records) for (const s of r.samples) total += pick(s);
  return total;
}

function statusMark(s: SampleRecord["status"]): string {
  return s === "pass" ? "✓" : s === "fail" ? "✗" : s === "error" ? "E" : "·";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
