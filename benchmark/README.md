# Curated RTL Benchmark Bundle

本目录汇总 **Chip-Claw / HINT** 评测用的代表性 RTL 任务，来源为公开 benchmark 仓库的精选子集。

## 来源与许可

| 子集 | 上游 | 说明 |
|------|------|------|
| `ArchXBench/level-6/` | [ArchXBench](https://github.com/sureshpurini/ArchXBench) | 架构级生成任务，含规格、激励与 golden |
| `RealBench/` | [RealBench](https://github.com/IPRC-DIP/RealBench) | 真实场景复杂 IP（模块级/系统级） |

上游各自许可见原仓库。本目录为 **只读参考材料** 打包，便于 agent 按统一路径做 RTL 生成与验证。

## 推荐评测顺序

由易到难、由算法块到系统 IP，建议按下列阶段推进（每阶段完成后再进入下一阶段）：

| 阶段 | 路径 | 难度 | 说明 |
|------|------|------|------|
| **1** | `ArchXBench/level-6/aes_encryption/` | ★☆☆ | 结构化规格 + 脚本齐全，适合作为 **入门首题** |
| **2a** | `RealBench/aes/` | ★★☆ | 多模块 AES IP 族，考察分模块理解与集成 |
| **2b** | `ArchXBench/level-6/conv_3d/` | ★★☆ | 3D 卷积流式加速器，考察缓冲与 MAC 数据通路 |
| **3** | `RealBench/sdc/` | ★★★ | SD 卡控制器 + Wishbone，总线与协议面更宽 |
| **4** | `RealBench/e203/` | ★★★★ | RISC-V 处理器核（E203），系统级复杂度最高 |

阶段 2 中 **2a 与 2b 可并行或按团队偏好调换**；若目标是从“单算法核”过渡到“存储/总线 IP”，可先 `aes` 再 `conv_3d`。

---

## 各设计简介

### 1. AES-128 Encryption Pipeline（ArchXBench L6）

**路径:** `ArchXBench/level-6/aes_encryption/`

**简介:** 设计全流水 AES-128 **加密** 加速器：在 pipeline 填满后实现 **每周期一个 128-bit 块** 的吞吐。需在硬件内联完成密钥扩展，并执行标准 10 轮变换（SubBytes、ShiftRows、MixColumns、AddRoundKey），不依赖外部微码。

**要点:** 握手 `valid_in` / `valid_out`、`start` 控制；加密专用（mode=0）；适合验证 agent 对 **固定深度流水线 + 控制语义** 的表达。

**入口文件:** `problem-description.txt`, `design-specs.txt`, `tb_aes_encryption.v`, `scripts/compare_outputs.py`

---

### 2a. RealBench AES IP Family

**路径:** `RealBench/aes/`

**简介:** RealBench 中的 **AES 模块族**，覆盖正向/逆向密码、S-box、Rcon、128-bit 密钥扩展等子模块（如 `aes_cipher_top`, `aes_inv_cipher_top`, `aes_sbox`, `aes_key_expand_128`）。相比 ArchXBench 单题，更强调 **多文件 IP 拆分、模块级接口与验证目录结构**。

**要点:** 典型模块级 RTL + `verification/` Makefile 流程；部分文档在上游为 GPG 加密（`.md.gpg`），RTL 与 testbench 可直接使用。

---

### 2b. 3D Convolution Streaming Accelerator（ArchXBench L6）

**路径:** `ArchXBench/level-6/conv_3d/`

**简介:** 对 3D 体数据（如视频/体素）做 **3D 卷积** 的流式硬件加速器。需在 pipeline 填满后 **每周期输出一个有效体素**，并处理 3×3×3（或可参数化）核的滑窗、padding/stride 与中间行/面缓冲。

**要点:** 考察 **多维 line buffer / FIFO 窗口** 与 MAC 复用；含 `ref_model/conv3d_ref.py` 与 `scripts/` 激励对比流程。

**入口文件:** `problem-description.txt`, `design-specs.txt`, `tb_conv3d.v`, `Makefile`

---

### 3. SD Card Controller（RealBench）

**路径:** `RealBench/sdc/`

**简介:** **SD/SDIO 控制器** IP，含 `sdc_controller` 顶层及命令/数据通路、CRC、FIFO、时钟分频等子模块，通过 **Wishbone** 从/主接口与片外 SD 总线交互。属于典型 **外设 + 总线 + 状态机** 的真实 SoC 模块。

**要点:** 多模块层次、总线协议与跨模块握手；适合在 AES/卷积类算法核之后评估 agent 对 **接口协议与系统集成** 的能力。

**代表模块:** `sdc_controller/`, `sd_cmd_master/`, `sd_data_master/`, `sd_crc_16/`, `sd_fifo_*`

---

### 4. Hummingbird E203 RISC-V Core（RealBench）

**路径:** `RealBench/e203/`

**简介:** 蜂鸟 **E203** 32-bit RISC-V 处理器核（`e203_hbirdv2` 精选树），含取指/执行、ALU、CSR、时钟门控、BIU、DTCM 等大量子模块。为 RealBench 中 **系统级复杂度最高** 的设计之一，适合作为长程评测或能力上限探测。

**要点:** 处理器微架构、多时钟域与定义头文件（`e203_defines.v`）依赖广泛；修改应 **自顶向下**（先 `e203_cpu_top` / `e203_core` 边界再下钻）。

**代表模块:** `e203_core/`, `e203_cpu/`, `e203_exu/`, `e203_ifu/`, `e203_lsu/`

---

## 目录结构

```
benchmark/
├── README.md                 # 本文件
├── ArchXBench/
│   └── level-6/
│       ├── aes_encryption/   # 阶段 1
│       └── conv_3d/          # 阶段 2b
└── RealBench/
    ├── aes/                  # 阶段 2a
    ├── sdc/                  # 阶段 3
    └── e203/                 # 阶段 4（自 e203_hbirdv2 打包）
```

## 使用提示（Chip-Claw）

1. 从阶段 1 的 `problem-description.txt` 读入任务，再对照 `design-specs.txt` / testbench 端口。
2. ArchXBench 用例优先跑 `scripts/compare_outputs.py`（及目录内 `Makefile`）做 golden 对比。
3. RealBench 用例参考各子目录 `verification/` 与上游 `run_verify.py` 流程。
4. 生成 RTL 时遵循仓库根目录 `CHIPCLAW.md` 中的 Verilog 编码规范。

## 引用

```bibtex
@article{jin2025realbench,
  title={RealBench: Benchmarking Verilog Generation Models with Real-World IP Designs},
  journal={arXiv preprint arXiv:2507.16200},
  year={2025}
}

@inproceedings{purini2025mlcad,
  title={ArchXBench: A Complex Digital Systems Benchmark Suite for LLM Driven RTL Synthesis},
  booktitle={MLCAD},
  year={2025}
}
```
