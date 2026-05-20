# waveform_analyze

解析 VCD 波形文件，提取指定信号在指定时间范围内的值变化，辅助调试。

## 工具定义

```typescript
{
  name: "waveform_analyze",
  description: "Parse VCD waveform files and extract signal values over time. Use for debugging simulation failures by inspecting signal transitions.",
  input_schema: {
    type: "object",
    properties: {
      vcd_file: {
        type: "string",
        description: "Path to the VCD waveform file"
      },
      signals: {
        type: "array",
        items: { type: "string" },
        description: "Signal names to extract, e.g. [\"top.clk\", \"top.data_out\", \"top.u_fifo.wr_ptr\"]. Use '*' for all signals."
      },
      time_range: {
        type: "object",
        properties: {
          start: { type: "string", description: "Start time, e.g. \"0ns\"" },
          end: { type: "string", description: "End time, e.g. \"1000ns\"" }
        },
        description: "Time range to extract (default: entire simulation)"
      },
      format: {
        type: "string",
        enum: ["transitions", "table", "summary"],
        description: "Output format: transitions (value changes only), table (sampled at clock edges), summary (first/last/min/max). Default: transitions"
      },
      max_transitions: {
        type: "number",
        description: "Maximum number of transitions to return per signal (default: 200)"
      }
    },
    required: ["vcd_file", "signals"]
  }
}
```

## 返回格式

### format: "transitions"（默认）

```json
{
  "success": true,
  "timescale": "1ns",
  "total_time": "10000ns",
  "signals": {
    "top.data_out": {
      "width": 8,
      "transitions": [
        { "time": "0ns", "value": "8'h00" },
        { "time": "100ns", "value": "8'hff" },
        { "time": "200ns", "value": "8'h42" }
      ],
      "total_transitions": 3
    },
    "top.valid": {
      "width": 1,
      "transitions": [
        { "time": "0ns", "value": "1'b0" },
        { "time": "95ns", "value": "1'b1" },
        { "time": "305ns", "value": "1'b0" }
      ],
      "total_transitions": 3
    }
  }
}
```

### format: "summary"

```json
{
  "success": true,
  "timescale": "1ns",
  "total_time": "10000ns",
  "signals": {
    "top.data_out": {
      "width": 8,
      "first_value": "8'h00",
      "last_value": "8'h42",
      "total_transitions": 156,
      "first_change": "100ns",
      "last_change": "9800ns"
    }
  }
}
```

## 底层实现（待开发）

- 纯 TypeScript 实现 VCD 文本解析器（VCD 是简单的文本格式）
- VCD 格式要点：
  - `$timescale` 段 → 时间单位
  - `$var` 段 → 信号定义（名称、位宽、缩写符号）
  - `#<time>` → 时间戳
  - `0/1/x/z<symbol>` → 1-bit 值变化
  - `b<binary> <symbol>` → 多-bit 值变化
- 大文件优化：流式读取，遇到超出 `time_range.end` 立即停止
- 信号名支持通配符匹配和层次路径
