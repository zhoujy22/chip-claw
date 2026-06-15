// ArchXBench task registry for the RTL generation benchmark runner.
// Each TaskSpec is a self-contained recipe: what the agent must produce,
// which files to stage into an isolated run dir, and how to score it.

import { existsSync } from "fs";
import { join, resolve } from "path";

// ─── Pass/fail rules ─────────────────────────────────────────
// exit-code:    compare command's exit status (0 = pass)
// stdout-regex: compare command always exits 0; pass iff stdout matches.

export type PassRule =
  | { kind: "exit-code" }
  | { kind: "stdout-regex"; pattern: string };

export interface TaskSpec {
  id: string;
  suite: "ArchXBench";
  /** Absolute path to the upstream task directory (read-only reference). */
  dir: string;
  /** Module the agent must implement. */
  moduleName: string;
  /** Filename the generated module is written to inside the run dir. */
  moduleFile: string;
  /** Spec files fed into the generation prompt (relative to dir). */
  specFiles: string[];
  /** Files/dirs copied from dir into the run dir before scoring. */
  stageEntries: string[];
  /** Run-dir-relative files deleted before scoring (stale DUT output). */
  cleanBeforeRun: string[];
  /** Shell commands run before compile (e.g. stimulus gen). Usually empty. */
  prepare: string[];
  /** Compile + run + compare commands, executed in the run dir. */
  compile: string;
  run: string;
  compare: string;
  pass: PassRule;
}

// ─── Benchmark root resolution ───────────────────────────────

export function benchRoot(): string {
  return process.env.CHIPCLAW_BENCH_ROOT
    ? resolve(process.env.CHIPCLAW_BENCH_ROOT)
    : join(process.cwd(), "benchmark");
}

function archXDir(taskId: string): string {
  return join(benchRoot(), "ArchXBench", "level-6", taskId);
}

// ─── Task definitions ────────────────────────────────────────

function aesEncryption(): TaskSpec {
  return {
    id: "aes_encryption",
    suite: "ArchXBench",
    dir: archXDir("aes_encryption"),
    moduleName: "aes128_pipeline",
    moduleFile: "aes128_pipeline.v",
    specFiles: ["problem-description.txt", "design-specs.txt"],
    stageEntries: [
      "tb_aes_encryption.v",
      "problem-description.txt",
      "design-specs.txt",
      "inputs",
      "outputs",
      "scripts",
    ],
    cleanBeforeRun: ["outputs/dut_output.json"],
    prepare: [],
    compile: "iverilog -g2005 -o sim.out tb_aes_encryption.v aes128_pipeline.v",
    run: "vvp sim.out",
    compare: "python3 scripts/compare_outputs.py",
    pass: { kind: "exit-code" },
  };
}

function conv3d(): TaskSpec {
  return {
    id: "conv_3d",
    suite: "ArchXBench",
    dir: archXDir("conv_3d"),
    moduleName: "conv3d",
    moduleFile: "conv3d.v",
    specFiles: ["problem-description.txt", "design-specs.txt"],
    // stimuli.json, tb_input.mem and golden_output.json are committed, so
    // scoring needs no numpy/ref-model regeneration — stage them as-is.
    stageEntries: [
      "tb_conv3d.v",
      "tb_input.mem",
      "problem-description.txt",
      "design-specs.txt",
      "inputs",
      "outputs",
      "scripts",
    ],
    cleanBeforeRun: ["outputs/dut_output.json"],
    prepare: [],
    compile: "iverilog -g2005 -o sim.out tb_conv3d.v conv3d.v",
    run: "vvp sim.out",
    compare: "python3 scripts/compare_outputs.py",
    pass: { kind: "stdout-regex", pattern: '"status":\\s*"PASS"' },
  };
}

const REGISTRY: Record<string, () => TaskSpec> = {
  aes_encryption: aesEncryption,
  conv_3d: conv3d,
};

export function listTaskIds(): string[] {
  return Object.keys(REGISTRY);
}

export function getTask(id: string): TaskSpec {
  const factory = REGISTRY[id];
  if (!factory) {
    throw new Error(`Unknown benchmark task '${id}'. Known: ${listTaskIds().join(", ")}`);
  }
  const task = factory();
  if (!existsSync(task.dir)) {
    throw new Error(
      `Task dir not found: ${task.dir}. Did you download benchmark/ (origin/ctr)?`
    );
  }
  return task;
}
