// Scoring backends — execute a sequence of shell commands in a run dir and
// return the combined exit status + output. Two backends:
//   - docker: runs inside the eda-mcp image (bundles iverilog/verilator/python),
//     mounting the run dir at /workspace so the testbench's relative inputs/
//     and outputs/ paths resolve correctly.
//   - host:   runs on the local shell (requires iverilog/vvp/python on PATH).

import { spawnSync } from "child_process";
import { resolve } from "path";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Backend {
  name: string;
  /** True if the backend's prerequisites are present on this machine. */
  available(): boolean;
  /**
   * Run commands in order inside `runDir`. Stops at the first non-zero exit.
   * Returns the exit code of the last command run plus accumulated output.
   */
  exec(runDir: string, commands: string[]): ExecResult;
}

// ─── Host backend ────────────────────────────────────────────

function commandExists(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(probe, [cmd], { encoding: "utf-8" });
  return r.status === 0;
}

/** Pick a real Python 3 interpreter by actually running `--version`. This
 *  skips the Windows Store `python3` stub, which exists on PATH but errors. */
function resolvePython(): string {
  for (const c of ["python3", "python"]) {
    const r = spawnSync(c, ["--version"], { encoding: "utf-8" });
    if (r.status === 0 && /Python 3/.test((r.stdout || "") + (r.stderr || ""))) return c;
  }
  return "python3";
}

class HostBackend implements Backend {
  name = "host";
  private py: string;

  constructor() {
    // compare scripts invoke `python3`; resolve to a working Python 3.
    this.py = resolvePython();
  }

  available(): boolean {
    return commandExists("iverilog") && commandExists("vvp");
  }

  exec(runDir: string, commands: string[]): ExecResult {
    let stdout = "";
    let stderr = "";
    let code = 0;
    for (const raw of commands) {
      const cmd = raw.replace(/\bpython3\b/g, this.py);
      const r = spawnSync(cmd, {
        cwd: runDir,
        shell: true,
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
      });
      stdout += r.stdout || "";
      stderr += r.stderr || "";
      code = r.status ?? (r.error ? 1 : 0);
      if (code !== 0) break;
    }
    return { code, stdout, stderr };
  }
}

// ─── Docker backend (eda-mcp image) ──────────────────────────

class DockerBackend implements Backend {
  name = "docker";
  constructor(private image = process.env.CHIPCLAW_EDA_IMAGE || "eda-mcp") {}

  available(): boolean {
    return commandExists("docker");
  }

  exec(runDir: string, commands: string[]): ExecResult {
    // Join with && so the container runs the whole pipeline; the exit code is
    // the last failing (or final) command — matching the host backend's
    // stop-on-first-failure semantics.
    const script = commands.join(" && ");
    const mount = `${resolve(runDir)}:/workspace`;
    const args = [
      "run", "--rm",
      "-v", mount,
      "-w", "/workspace",
      "--entrypoint", "sh",
      this.image,
      "-c", script,
    ];
    const r = spawnSync("docker", args, {
      encoding: "utf-8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      code: r.status ?? (r.error ? 1 : 0),
      stdout: r.stdout || "",
      stderr: r.stderr || "",
    };
  }
}

// ─── Selection ───────────────────────────────────────────────

export type BackendName = "auto" | "docker" | "host";

export function makeBackend(name: BackendName): Backend {
  if (name === "docker") return new DockerBackend();
  if (name === "host") return new HostBackend();
  // auto: prefer docker (matches the eda-mcp scoring environment), else host.
  const docker = new DockerBackend();
  return docker.available() ? docker : new HostBackend();
}
