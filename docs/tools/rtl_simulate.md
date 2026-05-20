# rtl_simulate

运行仿真，执行 testbench，返回仿真结果（pass/fail + 输出日志 + 波形文件路径）。

## 工具定义

```typescript
{
  name: "rtl_simulate",
  description: "Run RTL simulation with testbench. Returns pass/fail status, simulation log, and waveform file path.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "All Verilog/SV source files including testbench"
      },
      top_module: {
        type: "string",
        description: "Top-level testbench module name"
      },
      timeout: {
        type: "number",
        description: "Simulation timeout in milliseconds (default: 60000)"
      },
      plusargs: {
        type: "array",
        items: { type: "string" },
        description: "Plus arguments passed to simulation, e.g. [\"+TESTCASE=basic\", \"+SEED=42\"]"
      },
      dump_waves: {
        type: "boolean",
        description: "Generate VCD waveform dump (default: true)"
      },
      tool: {
        type: "string",
        enum: ["iverilog", "verilator"],
        description: "Simulator backend (default: iverilog)"
      }
    },
    required: ["files", "top_module"]
  }
}
```

## 返回格式

```json
{
  "success": true,
  "pass": true,
  "tool": "iverilog",
  "command": "iverilog -o sim.vvp -g2012 tb_top.v top.v && vvp sim.vvp",
  "log": "Test 1: PASS\nTest 2: PASS\nAll tests passed!",
  "waveform": "/tmp/chip-claw-sim-xxxx/dump.vcd",
  "sim_time": "10000ns",
  "duration_ms": 1523
}
```

失败时：

```json
{
  "success": true,
  "pass": false,
  "tool": "iverilog",
  "command": "...",
  "log": "Test 1: PASS\nTest 2: FAIL - expected 0xff, got 0x00 at time 5000ns\nSimulation FAILED",
  "waveform": "/tmp/chip-claw-sim-xxxx/dump.vcd",
  "sim_time": "5000ns",
  "duration_ms": 820
}
```

## 底层实现（待开发）

- **iverilog**: `iverilog -o <out>.vvp -g2012 <files> && vvp <out>.vvp [+plusargs]`
- **verilator**: `verilator --binary --top-module <top> <files> && obj_dir/V<top> [+plusargs]`
- 判定 pass/fail 规则：扫描输出日志中的 `FAIL`/`ERROR`/`PASS`/`All tests passed` 等关键词
- `dump_waves=true` 时自动注入 `$dumpfile`/`$dumpvars`（如果 tb 中没有的话）
- 仿真超时自动 kill 进程
