# rtl_compile

编译 Verilog/SystemVerilog 源文件，返回编译结果（成功/失败 + 错误列表）。

## 工具定义

```typescript
{
  name: "rtl_compile",
  description: "Compile Verilog/SystemVerilog files. Returns compilation status and error diagnostics with file, line, and message.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "List of Verilog/SV file paths to compile"
      },
      top_module: {
        type: "string",
        description: "Top-level module name (optional, auto-detected if omitted)"
      },
      include_dirs: {
        type: "array",
        items: { type: "string" },
        description: "Include search directories for `include directives"
      },
      defines: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Preprocessor defines, e.g. {\"DATA_WIDTH\": \"32\"}"
      },
      tool: {
        type: "string",
        enum: ["iverilog", "verilator"],
        description: "Compiler backend (default: iverilog)"
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
  "tool": "iverilog",
  "command": "iverilog -o /tmp/xxx.vvp -g2012 top.v sub.v",
  "errors": [],
  "warnings": [
    { "file": "top.v", "line": 42, "severity": "warning", "message": "implicit wire declaration" }
  ]
}
```

失败时：

```json
{
  "success": false,
  "tool": "iverilog",
  "command": "iverilog -o /tmp/xxx.vvp -g2012 top.v",
  "errors": [
    { "file": "top.v", "line": 15, "severity": "error", "message": "Unknown module type: sub_module" }
  ],
  "warnings": []
}
```

## 底层实现（待开发）

- **iverilog**: `iverilog -o <out>.vvp -g2012 [-I <dir>] [-D <key>=<val>] <files>`
- **verilator**: `verilator --binary --top-module <top> [-I<dir>] [-D<key>=<val>] <files>`
- 解析 stderr 提取 `file:line: error/warning: message` 格式的诊断信息
- 编译产物放在临时目录，供 `rtl_simulate` 使用
