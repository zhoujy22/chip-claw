// Staging + scoring pipeline. Generation and scoring are decoupled: the
// generator produces the RTL string, this module stages it next to the
// provided testbench in an isolated run dir and scores it via a backend.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { Backend } from "./backends.js";
import type { TaskSpec } from "./tasks.js";

export type ScoreStatus = "pass" | "fail" | "error";

export interface ScoreResult {
  status: ScoreStatus;
  /** Which phase produced the verdict. */
  phase: "compile" | "compare";
  log: string;
}

/**
 * Copy the task's reference files into `runDir` and drop the generated RTL
 * in as the module file. The upstream benchmark dir is never mutated.
 */
export function stageTask(task: TaskSpec, runDir: string, rtl?: string): void {
  mkdirSync(runDir, { recursive: true });
  for (const entry of task.stageEntries) {
    const src = join(task.dir, entry);
    if (!existsSync(src)) continue;
    cpSync(src, join(runDir, entry), { recursive: true });
  }
  for (const stale of task.cleanBeforeRun) {
    rmSync(join(runDir, stale), { force: true });
  }
  if (rtl !== undefined) {
    writeFileSync(join(runDir, task.moduleFile), rtl);
  }
}

/**
 * Run compile+sim, then compare. A non-zero compile/sim exit is reported as
 * `error` (the RTL didn't elaborate or the sim crashed); a clean sim whose
 * output diverges from golden is `fail`.
 */
export function scoreTask(task: TaskSpec, runDir: string, backend: Backend): ScoreResult {
  const build = backend.exec(runDir, [...task.prepare, task.compile, task.run]);
  if (build.code !== 0) {
    return { status: "error", phase: "compile", log: tail(build.stdout + build.stderr) };
  }

  const cmp = backend.exec(runDir, [task.compare]);
  const log = tail(cmp.stdout + cmp.stderr);

  if (task.pass.kind === "exit-code") {
    return { status: cmp.code === 0 ? "pass" : "fail", phase: "compare", log };
  }
  const re = new RegExp(task.pass.pattern);
  return { status: re.test(cmp.stdout) ? "pass" : "fail", phase: "compare", log };
}

function tail(s: string, max = 4000): string {
  if (s.length <= max) return s;
  return "…(truncated)…\n" + s.slice(-max);
}
