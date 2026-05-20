# rtl_synthesize

调用 Yosys 进行逻辑综合，返回面积/资源/关键路径等报告。

## 工具定义

```typescript
{
  name: "rtl_synthesize",
  description: "Synthesize RTL design using Yosys. Returns area, cell count, and resource utilization report.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Verilog/SV source files to synthesize"
      },
      top_module: {
        type: "string",
        description: "Top-level module name for synthesis"
      },
      target: {
        type: "string",
        enum: ["generic", "ice40", "ecp5", "gowin", "xilinx"],
        description: "Target FPGA family or generic (default: generic)"
      },
      flatten: {
        type: "boolean",
        description: "Flatten hierarchy before reporting (default: false)"
      },
      output_verilog: {
        type: "boolean",
        description: "Output synthesized netlist as Verilog (default: false)"
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
  "tool": "yosys",
  "command": "yosys -p 'read_verilog top.v; synth -top top; stat' ",
  "stats": {
    "wires": 156,
    "cells": 423,
    "cell_breakdown": {
      "$_AND_": 89,
      "$_OR_": 67,
      "$_NOT_": 34,
      "$_DFF_P_": 128,
      "$_MUX_": 105
    },
    "area_estimate": "N/A"
  },
  "netlist_file": null,
  "warnings": [],
  "raw_log": "..."
}
```

## 底层实现（待开发）

- Yosys 脚本模板：
  ```
  read_verilog -sv <files>
  synth [-top <top>] [-flatten]      # generic
  synth_ice40 -top <top>             # ice40 target
  stat
  [write_verilog <output>.v]
  ```
- 解析 `stat` 命令输出提取 wires/cells/cell types
- target-specific 综合命令映射（ice40/ecp5/gowin/xilinx）
- `output_verilog=true` 时生成综合后网表文件
