---
name: lint-fix
description: Run lint checks on Verilog files and auto-fix issues
user_invocable: true
context: inline
---
Run lint on the design files:

1. Find all .v source files (exclude testbenches matching `tb_*.v` or `*_tb.v`)
2. Run rtl_lint on the source files
3. For each fixable warning (unused signals, width mismatches, missing defaults), apply the fix using edit_file
4. Re-run rtl_lint to confirm all fixable issues are resolved
5. Report remaining warnings that require manual review
