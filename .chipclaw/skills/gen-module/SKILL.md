---
name: gen-module
description: Generate a Verilog module from a natural-language specification
user-invocable: true
context: inline
---
User wants to generate an RTL module. Follow this workflow:

1. Parse the specification from $ARGUMENTS
2. Design the module interface (ports, parameters)
3. Write the Verilog implementation following the coding standards in CHIPCLAW.md
4. Write a basic testbench with clock generation, reset sequence, stimulus, and $display-based pass/fail checks
5. Compile both files using rtl_compile to verify correctness
6. If compilation fails, read the errors, fix the code, and re-compile
