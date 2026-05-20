---
name: verify
description: Compile and simulate the current design, report results
user-invocable: true
context: inline
---
User wants to verify the current design. Steps:

1. Find all .v files in the project using list_files
2. Separate source files from testbenches (files matching `tb_*.v` or `*_tb.v`)
3. Compile all files using rtl_compile
4. If compilation passes, run simulation using rtl_simulate with the testbench as top module
5. Report results: pass/fail status, any errors or warnings, simulation log summary
