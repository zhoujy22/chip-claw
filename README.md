# Chip-Claw

通过自然语言交互，生成、优化和验证 Verilog RTL 代码的智能体。

基于 [mini-claude](https://github.com/Windy3f3f3f3f/claude-code-from-scratch) 架构改造 —— 用 TypeScript 从零实现的 RTL 设计 Agent。

## 功能特性

**RTL 生成** — 用自然语言描述模块功能，自动生成可综合的 Verilog 代码和配套 testbench。

**Agent 循环** — 流式 LLM 调用 + 工具使用，支持自动重试、预算控制（`--max-cost`、`--max-turns`）、中断恢复（Ctrl+C）。

**上下文管理** — 四层压缩管道，保证长会话不超出上下文窗口：
1. **Budget** — 随上下文填充动态裁剪大体量工具结果
2. **Snip** — 用占位符替换过时/重复的读取结果
3. **Microcompact** — prompt cache 过期后激进清理旧结果
4. **Auto-compact** — 上下文达 85% 容量时由 LLM 生成对话摘要

**记忆系统** — 基于文件的持久化记忆（user / feedback / project / reference 四种类型），通过 LLM sideQuery 实现异步语义召回。

**Skill 系统** — 斜杠命令工作流：`/gen-module`、`/verify`、`/lint-fix`。

**RTL 知识库** — 通过 `vendor/rtl-knowledge` submodule 或自定义目录提供可复用 RTL 规范、协议、模板、testbench 和 bug pattern；Agent 通过 `rtl_knowledge_search` / `rtl_knowledge_get` 在生成 RTL 前检索相关经验。

**SubAgent** — 将重型子任务（探索、规划、代码审查）委派给隔离的子 Agent 实例。

**双后端支持** — 同时支持 Anthropic API 和任意 OpenAI 兼容接口。

**CLI 工具包** — `package.json` 已声明 `chip-claw` 命令入口，可通过 `npm link` 本地安装，或用 `npm pack` 打包后全局安装。

## 项目结构

```
src/
  cli.ts          CLI 入口、REPL、参数解析
  agent.ts        Agent 循环、上下文管理、压缩管道
  tools.ts        工具定义（read/write/edit/grep/shell/web_fetch）、权限控制
  prompt.ts       System Prompt 构建、CHIPCLAW.md/@include 解析
  memory.ts       四类型记忆系统、语义召回（sideQuery 预取）
  knowledge.ts    RTL 知识库加载、检索、条目读取
  skills.ts       Skill 发现与执行（inline / fork 模式）
  subagent.ts     SubAgent 类型（explore / plan / general + 自定义）
  session.ts      会话保存与恢复
  mcp.ts          MCP Server 集成
  frontmatter.ts  YAML frontmatter 解析器
  ui.ts           终端输出格式化
```

## RTL 专属能力

### 编码规范（通过 System Prompt 强制执行）

- Verilog-2001 ANSI 风格端口声明
- 信号命名 `snake_case`，参数命名 `UPPER_CASE`
- 时钟：`clk` 上升沿；复位：`rst_n` 低电平有效，异步置位/同步释放
- 时序逻辑：`always @(posedge clk or negedge rst_n)`
- 组合逻辑：`always @(*)`，每个 `if` 必须有 `else`（禁止锁存器）
- FSM：双进程风格（状态寄存器 + 次态/输出逻辑）
- Testbench：`tb_<module>.v`，包含 `$dumpfile`/`$dumpvars`，以 `TEST PASSED`/`TEST FAILED` 结尾

### RTL 知识库

Chip-Claw 会在默认工作流中先调用知识库检索，再生成 RTL。知识库条目是带 frontmatter 的 Markdown 文件，当前内置内容来自 `vendor/rtl-knowledge` 子模块：

```
vendor/rtl-knowledge/knowledge/
  coding-rules/    Verilog/RTL 编码规范
  protocols/       valid-ready、APB 等协议约定
  templates/       FIFO 等可复用 RTL 模板
  testbench/       自检查 testbench 与波形输出模式
  bug-patterns/    常见 RTL bug 与修复建议
```

默认查找顺序：

1. `CHIPCLAW_KNOWLEDGE_DIR` 指定的目录
2. `vendor/rtl-knowledge/knowledge`
3. `.chipclaw/knowledge`

可用工具：

| 工具 | 说明 |
|------|------|
| `rtl_knowledge_search` | 按 `query`、`types`、`tags` 检索知识库，返回匹配条目摘要和内容 |
| `rtl_knowledge_get` | 按 `id` 精确读取某一条知识库条目 |

新增知识条目时，在知识库目录下添加 `.md` 文件即可：

```yaml
---
id: sync-fifo
type: template
title: Synchronous FIFO RTL template
tags: fifo, sync, queue
priority: 95
sources: https://example.com/reference
---
```

### EDA 工具链（via eda-mcp）

通过 [eda-mcp](https://github.com/LittleBlackCQ/eda-mcp) 子模块，以 Docker MCP Server 形式集成开源 EDA 工具链。Agent 可直接通过 tool call 执行综合、仿真、lint 和波形分析。

| MCP 工具 | 底层引擎 | 说明 |
|----------|----------|------|
| `yosys_synth` | Yosys | Verilog 综合为门级/JSON 网表 |
| `iverilog_simulate` | Icarus Verilog | 事件驱动仿真，生成 VCD 波形 |
| `verilator_lint` | Verilator | 静态 lint 检查 |
| `waveform_*`（6 个） | waveform-cli | VCD/FST 波形分析（层级、信号值、事件查找） |
| `list_files` / `read_file` / `write_file` | Python stdlib | workspace 文件读写 |

**首次使用需构建 Docker 镜像：**

```bash
cd eda-mcp
docker build -t eda-mcp .
# 国内网络可指定镜像源：
# docker build --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple -t eda-mcp .
```

构建完成后，启动 chip-claw 即自动连接 eda-mcp server。eda-mcp 原始工具作为 RTL 封装工具的后端使用，默认不直接暴露给 Agent，避免模型绕过 `rtl_*` / `rtl_workspace_*` 抽象层。EDA 工件存放在 `workspace/` 目录中。

本地 MCP 启用列表由 `.chipclaw/settings.local.json` 的 `enabledMcpjsonServers` 控制；若要启用 EDA 工具链，请确保其中包含 `"eda-mcp"`，并已构建 Docker 镜像。

### RTL 工具接口

| 工具 | 说明 | 接口文档 |
|------|------|----------|
| `rtl_workspace_list` | 列出 MCP RTL workspace 中的源码、testbench 和 EDA 产物 | - |
| `rtl_workspace_read` | 读取 MCP RTL workspace 中的文件 | - |
| `rtl_workspace_write` | 写入 MCP RTL workspace 中的 RTL/testbench 文件 | - |
| `rtl_compile` | 编译 Verilog/SV（iverilog / Verilator） | [rtl_compile.md](docs/tools/rtl_compile.md) |
| `rtl_simulate` | 运行仿真，返回 pass/fail + 波形路径 | [rtl_simulate.md](docs/tools/rtl_simulate.md) |
| `rtl_synthesize` | Yosys 逻辑综合，输出面积/单元报告 | [rtl_synthesize.md](docs/tools/rtl_synthesize.md) |
| `rtl_lint` | 静态检查（Verilator --lint-only / svlint） | [rtl_lint.md](docs/tools/rtl_lint.md) |
| `waveform_analyze` | 解析 VCD 波形，提取信号跳变 | [waveform_analyze.md](docs/tools/waveform_analyze.md) |

### Skills

| Skill | 说明 |
|-------|------|
| `/gen-module <spec>` | 根据自然语言描述生成 Verilog 模块 + testbench |
| `/verify` | 一键编译并仿真当前设计 |
| `/lint-fix` | 运行 lint 检查并自动修复 |

## 快速开始

### 前置条件

- Node.js >= 18.17
- Docker（用于运行 eda-mcp EDA 工具链）
- API Key：Anthropic（`ANTHROPIC_API_KEY`）或 OpenAI 兼容接口（`OPENAI_API_KEY` + `OPENAI_BASE_URL`）

### 安装与构建

```bash
git clone --recurse-submodules https://github.com/zhoujy22/chip-claw.git
cd chip-claw
npm install
npm run build
```

如果不是用 `--recurse-submodules` 克隆，或后续 `git pull origin main` 后需要补齐子模块：

```bash
git submodule update --init --recursive
```

### 配置 API Key

```bash
# Anthropic（直连）
export ANTHROPIC_API_KEY=sk-ant-xxx

# Anthropic（通过代理）
export ANTHROPIC_API_KEY=sk-xxx
export ANTHROPIC_BASE_URL=https://your-proxy.com

# OpenAI 兼容接口
export OPENAI_API_KEY=sk-xxx
export OPENAI_BASE_URL=https://api.openai.com/v1
```

> **注意**：环境变量 `MINI_CLAUDE_MODEL` 已重命名为 `CHIPCLAW_MODEL`。如需通过环境变量指定模型，请使用新名称：
> ```bash
> export CHIPCLAW_MODEL=claude-sonnet-4-6
> ```
> 若不设置，默认使用 `claude-opus-4-6`。

### 运行

```bash
# 交互式 REPL
node dist/cli.js
chip-claw

# 单次执行
node dist/cli.js "设计一个 8 位同步 FIFO，深度 16"
chip-claw "设计一个 8 位同步 FIFO，深度 16"

# 带参数运行
node dist/cli.js --yolo --model claude-sonnet-4-6 "生成一个 AXI4-Lite 从设备接口"
chip-claw --yolo --model claude-sonnet-4-6 "生成一个 AXI4-Lite 从设备接口"
```

### 安装为本地 CLI

开发环境中可把当前仓库链接成全局命令：

```bash
npm run build
npm link
chip-claw --help
```

也可以先打包再安装：

```bash
npm run build
npm pack
npm install -g ./chip-claw-0.1.0.tgz
```

## CLI 参数

```
用法: chip-claw [options] [prompt]

选项:
  --yolo, -y          跳过所有确认提示
  --plan              计划模式：只读探索，不执行修改
  --accept-edits      自动批准文件编辑，仍确认危险 shell 命令
  --dont-ask          自动拒绝所有需确认的操作（CI 模式）
  --thinking          启用扩展思考（仅 Anthropic）
  --model, -m MODEL   指定模型（默认: claude-opus-4-6，或 CHIPCLAW_MODEL 环境变量）
  --api-base URL      使用 OpenAI 兼容接口
  --resume            恢复上次会话
  --max-cost USD      预估费用超过此值时停止
  --max-turns N       Agent 循环超过 N 轮时停止
  --help, -h          显示帮助
```

## REPL 命令

| 命令 | 说明 |
|------|------|
| `/clear` | 清空对话历史 |
| `/plan` | 切换计划模式（只读） |
| `/cost` | 显示 token 用量和预估费用 |
| `/compact` | 手动压缩对话 |
| `/memory` | 列出已保存的记忆 |
| `/skills` | 列出可用 Skill |
| `/<skill>` | 调用 Skill（如 `/gen-module 8位计数器`） |
| `exit` | 退出 |

## 项目进度

完整路线图见 [TODO.md](TODO.md)。

| 阶段 | 状态 |
|------|------|
| P0 基础设施 | 基本完成 — 项目初始化、CLI 打包入口、工具 API 文档、eda-mcp 集成、RTL 工具封装、RTL 知识库检索已完成 |
| P1 RTL 生成 | 进行中 — System Prompt + gen-module Skill + 知识库优先检索流程就绪，需继续扩充知识条目和端到端验证 |
| P2 RTL 优化 | 未开始 |
| P3 RTL 验证 | 未开始 |
| P4 SubAgent/Skill | 进行中 — 已定义 3/5 Skill、1/4 Agent |

## 许可证

MIT
