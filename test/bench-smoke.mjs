// Toolchain-independent smoke test for the benchmark runner.
// Validates staging + the compare phase + both pass rules (exit-code and
// stdout-regex) using each task's committed golden output. Requires only
// Python 3 — no iverilog/verilator/docker — so it runs in CI everywhere.

import assert from "node:assert/strict";
import { cpSync, writeFileSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { getTask } from "../dist/bench/tasks.js";
import { stageTask } from "../dist/bench/score.js";
import { makeBackend } from "../dist/bench/backends.js";

function pythonAvailable() {
  for (const c of ["python3", "python"]) {
    const r = spawnSync(c, ["--version"], { encoding: "utf-8" });
    if (r.status === 0 && /Python 3/.test((r.stdout || "") + (r.stderr || ""))) return true;
  }
  return false;
}

if (!pythonAvailable()) {
  console.log("bench smoke test skipped (no Python 3 on PATH)");
  process.exit(0);
}

const backend = makeBackend("host");
const root = mkdtempSync(join(tmpdir(), "chipclaw-bench-"));

function isPass(task, res) {
  return task.pass.kind === "exit-code"
    ? res.code === 0
    : new RegExp(task.pass.pattern).test(res.stdout);
}

function checkTask(taskId, mutate) {
  const task = getTask(taskId);
  const runDir = join(root, taskId);
  stageTask(task, runDir);

  const golden = join(runDir, "outputs/golden_output.json");
  const dut = join(runDir, "outputs/dut_output.json");

  // golden == dut → PASS
  cpSync(golden, dut);
  const pass = backend.exec(runDir, [task.compare]);
  assert.ok(isPass(task, pass), `${taskId}: identical-to-golden output should PASS\n${pass.stdout}${pass.stderr}`);

  // mutated dut → FAIL
  mutate(dut);
  const fail = backend.exec(runDir, [task.compare]);
  assert.ok(!isPass(task, fail), `${taskId}: mutated output should FAIL`);

  console.log(`  ${taskId}: compare pass/fail rule OK (${task.pass.kind})`);
}

// aes_encryption: JSON array of hex strings, exact match, exit-code rule.
checkTask("aes_encryption", (file) => {
  const arr = JSON.parse(readFileSync(file, "utf-8"));
  const s = arr[0];
  arr[0] = (s[0] === "0" ? "f" : "0") + s.slice(1);
  writeFileSync(file, JSON.stringify(arr));
});

// conv_3d: { "C": [int,...] }, ±1 tolerance, stdout-regex rule.
checkTask("conv_3d", (file) => {
  const obj = JSON.parse(readFileSync(file, "utf-8"));
  obj.C[0] = obj.C[0] + 1000;
  writeFileSync(file, JSON.stringify(obj));
});

rmSync(root, { recursive: true, force: true });
console.log("bench smoke test passed");
