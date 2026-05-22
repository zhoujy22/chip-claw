# Chip-Claw: RTL Generation / Optimization / Verification Agent

基于 mini-claude 架构，构建面向芯片设计的 RTL Agent。

> **最近更新**: 2026-05-20

---

## Phase 0: 基础设施准备

- [x] **P0-1** 项目重命名与初始化
  - 项目名改为 chip-claw，更新 package.json（bin/name/version=0.1.0）
  - 删除 python/ 目录，只保留 TypeScript 版本
  - 清理无关文件（docs教程、demo.mp4、Docsify站点文件、assets）
  - 配置 git remote：origin → zhoujy22/chip-claw.git，upstream → 原仓库

- [ ] **P0-2** RTL 领域工具链集成
  - 集成 Verilog/SystemVerilog 编译器（iverilog / Verilator）
  - 集成仿真器（iverilog + vvp / Verilator sim）
  - 集成综合工具（Yosys）接口
  - 集成波形查看能力（VCD 解析）
  - 集成 lint 工具（Verilator --lint-only / svlint）

- [x] **P0-3a** RTL 专用 Tools — API 设计文档 ✅
  - `docs/tools/rtl_compile.md` — 编译工具接口定义与返回格式
  - `docs/tools/rtl_simulate.md` — 仿真工具接口定义与返回格式
  - `docs/tools/rtl_synthesize.md` — 综合工具接口定义与返回格式
  - `docs/tools/rtl_lint.md` — Lint 工具接口定义与返回格式
  - `docs/tools/waveform_analyze.md` — 波形分析工具接口定义与返回格式

- [ ] **P0-3b** RTL 专用 Tools — TypeScript 实现
  - `rtl_compile`: 编译 Verilog/SV 文件，解析 stderr 返回结构化错误
  - `rtl_simulate`: 运行仿真，判定 pass/fail，返回日志与波形路径
  - `rtl_synthesize`: 调用 Yosys 综合，解析 stat 输出
  - `rtl_lint`: 代码静态检查，解析 lint 诊断
  - `waveform_analyze`: VCD 文本解析器（纯 TypeScript 实现）
  - 在 `src/tools.ts` 中注册所有新工具

---

## Phase 1: RTL 生成 Agent

- [x] **P1-1** RTL 生成 System Prompt ✅
  - `CHIPCLAW.md`: RTL 编码规范（命名约定、时钟复位、FSM、参数化等）
  - `CHIPCLAW.md`: 常用模块模板列表（FIFO、AXI4、仲裁器、CDC、APB）
  - `CHIPCLAW.md`: 设计工作流（spec → RTL → TB → compile → simulate）
  - `src/prompt.ts`: Chip-Claw 专用 system prompt（Verilog 编码规则、TB 约定、默认工作流）

- [ ] **P1-2** 自然语言到 RTL 的生成流程
  - [x] `/gen-module` skill 定义（`.chipclaw/skills/gen-module/SKILL.md`）
  - [ ] 端到端流程验证（需要 P0-2 工具链就绪后测试）
  - [ ] 编译检查 → 修复语法错误的自动循环（依赖 rtl_compile 工具实现）

- [ ] **P1-3** Testbench 自动生成
  - 根据模块接口自动生成 UVM/cocotb 风格的 testbench
  - 生成 stimulus 和 checker
  - 支持 assertion 自动插入

---

## Phase 2: RTL 优化 Agent

- [ ] **P2-1** 代码质量优化
  - lint 结果分析 → 自动修复常见问题
  - 代码风格统一化（对齐、命名、注释）
  - 冗余逻辑检测与删除

- [ ] **P2-2** 性能优化
  - 综合报告分析（面积、时序、功耗）
  - 关键路径识别与优化建议
  - Pipeline 插入建议
  - 资源共享 / 时分复用优化

- [ ] **P2-3** 设计空间探索
  - 参数化设计自动生成多个变体
  - 综合结果对比分析
  - 最优配置推荐

---

## Phase 3: RTL 验证 Agent

- [ ] **P3-1** 功能验证
  - 自动生成 directed test cases
  - 覆盖率驱动的测试生成（代码覆盖率分析）
  - 仿真结果自动检查与 bug 定位
  - 波形分析辅助调试

- [ ] **P3-2** Bug 自动修复循环
  - 仿真失败 → 分析波形/日志 → 定位 bug → 修复 RTL → 重新仿真
  - 支持多轮迭代直到测试通过
  - 修复历史记录与学习

- [ ] **P3-3** Formal Verification 接口（进阶）
  - 集成 SymbiYosys 进行形式化验证
  - 自动生成 SVA (SystemVerilog Assertions)
  - 形式化验证结果分析

---

## Phase 4: SubAgent 委派、Skill 与知识系统

架构：单主 Agent 统一决策，工具调用做原子操作，subagent 处理独立重活（波形深度分析、批量 tb 生成等），结果回传主 Agent 继续推理。

- [ ] **P4-1** 专用 SubAgent 定义
  - [x] `code-reviewer`：RTL 代码审查（`.chipclaw/agents/reviewer.md`）
  - [ ] `waveform-analyst`：接收 VCD + 失败信息，深度分析波形，返回 bug 定位
  - [ ] `testbench-gen`：接收模块接口 + 功能描述，批量生成 testcase
  - [ ] `synth-analyst`：接收综合报告，返回关键路径/面积分析与优化建议

- [ ] **P4-2** RTL 知识库 / Memory 系统
  - 利用 mini-claude 的 memory 系统存储设计模式
  - 常见 bug pattern 记忆
  - 项目特定约束记忆（时钟频率、接口标准、IP 库）

- [ ] **P4-3** Skill 系统扩展
  - [x] `/gen-module` — 快速生成模块骨架（`.chipclaw/skills/gen-module/SKILL.md`）
  - [x] `/verify` — 一键编译+仿真+报告（`.chipclaw/skills/verify/SKILL.md`）
  - [x] `/lint-fix` — lint 检查并自动修复（`.chipclaw/skills/lint-fix/SKILL.md`）
  - [ ] `/optimize` — 综合+分析+优化建议
  - [ ] `/coverage` — 覆盖率分析报告

- [ ] **P4-4** IP 复用与层次化设计
  - 已有 IP 模块索引与搜索
  - 顶层集成自动化（端口连接、参数传递）
  - 层次化设计的依赖管理

---

## 当前进度总览

| 阶段 | 状态 | 已完成项 | 阻塞项 |
|------|------|----------|--------|
| **P0 基础设施** | 🔶 进行中 | 项目初始化、工具 API 文档 | 工具链安装(P0-2)、工具代码实现(P0-3b) |
| **P1 RTL 生成** | 🔶 进行中 | System Prompt、gen-module skill | 端到端验证依赖 P0-2/P0-3b |
| **P2 RTL 优化** | ⬜ 未开始 | — | 依赖 P0 完成 |
| **P3 RTL 验证** | ⬜ 未开始 | — | 依赖 P0 完成 |
| **P4 SubAgent/Skill** | 🔶 进行中 | 3 个 Skill + 1 个 Agent | 剩余 Skill 和 Agent 定义 |

### 下一步优先级

1. **P0-2**: 安装 iverilog / Verilator / Yosys，验证本地可用
2. **P0-3b**: 基于 docs/tools/ 的 API 设计实现 TypeScript 工具代码
3. **P1-2**: 工具就绪后端到端验证 gen-module 流程
4. **P4-3**: 补充 `/optimize` 和 `/coverage` skill

---

## 里程碑

| 里程碑 | 目标 | 预估周期 | 状态 |
|--------|------|----------|------|
| **M0** | 工具链集成完成，能编译/仿真 Verilog | 1 周 | 🔶 API 设计完成，待实现 |
| **M1** | 能根据自然语言描述生成可编译的 RTL + testbench | 2-3 周 | 🔶 Prompt + Skill 就绪 |
| **M2** | 能分析综合报告并给出优化建议 | 1-2 周 | ⬜ 未开始 |
| **M3** | 完整的 生成→验证→修复 自动循环 | 2-3 周 | ⬜ 未开始 |
| **M4** | SubAgent 委派 + Skill 系统 + 知识库 | 2-3 周 | 🔶 部分完成 |

---

## 技术选型参考

| 组件 | 推荐方案 | 备注 |
|------|----------|------|
| Verilog 编译 | iverilog / Verilator | 开源免费 |
| 仿真 | iverilog+vvp / Verilator | Verilator 更快 |
| 综合 | Yosys | 开源综合工具 |
| 波形 | VCD 文本解析 / pyDigitalWaveTools | Agent 可直接分析 |
| 形式化验证 | SymbiYosys | 基于 Yosys |
| Testbench 框架 | cocotb (Python) | 易与 Agent 集成 |
| Lint | Verilator --lint-only / svlint | 快速静态检查 |
