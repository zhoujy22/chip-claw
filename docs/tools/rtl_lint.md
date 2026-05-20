# rtl_lint

对 Verilog/SV 代码进行静态检查，返回 lint 警告和建议。

## 工具定义

```typescript
{
  name: "rtl_lint",
  description: "Run static lint checks on Verilog/SystemVerilog files. Returns warnings about coding style, potential bugs, and best-practice violations.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "Verilog/SV files to lint"
      },
      top_module: {
        type: "string",
        description: "Top-level module name (optional)"
      },
      tool: {
        type: "string",
        enum: ["verilator", "svlint"],
        description: "Lint backend (default: verilator)"
      },
      rules: {
        type: "array",
        items: { type: "string" },
        description: "Specific lint rules to enable/disable, e.g. [\"-WIDTHTRUNC\", \"+UNDRIVEN\"]"
      }
    },
    required: ["files"]
  }
}
```

## 返回格式

```json
{
  "success": true,
  "tool": "verilator",
  "command": "verilator --lint-only -Wall top.v",
  "diagnostics": [
    {
      "file": "top.v",
      "line": 23,
      "severity": "warning",
      "code": "UNUSEDSIGNAL",
      "message": "Signal 'debug_data' is not used"
    },
    {
      "file": "top.v",
      "line": 45,
      "severity": "warning",
      "code": "WIDTHTRUNC",
      "message": "Operator ASSIGNW expects 8 bits but got 16 bits"
    },
    {
      "file": "sub.v",
      "line": 12,
      "severity": "warning",
      "code": "LATCH",
      "message": "Latch inferred for signal 'state_next'"
    }
  ],
  "summary": {
    "errors": 0,
    "warnings": 3
  }
}
```

## 底层实现（待开发）

- **verilator**: `verilator --lint-only -Wall [-Wno-<rule>] [--top-module <top>] <files>`
- **svlint**: `svlint <files>`
- 解析 stderr 诊断格式：`%Warning-<CODE>: <file>:<line>:<col>: <message>`
- 常见 lint 类别：
  - `UNUSEDSIGNAL` — 未使用的信号
  - `UNDRIVEN` — 未驱动的信号
  - `WIDTHTRUNC` / `WIDTHEXPAND` — 位宽不匹配
  - `LATCH` — 意外的锁存器推断
  - `CASEINCOMPLETE` — case 语句缺少分支
  - `MULTIDRIVEN` — 多驱动
