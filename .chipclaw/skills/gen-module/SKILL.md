---
name: gen-module
description: Generate a Verilog module from a natural-language specification
user-invocable: true
context: inline
---
User wants to generate an RTL module. Follow this workflow:

1. Parse the specification from $ARGUMENTS
2. Before designing the module, call rtl_knowledge_search with a query derived from the requested module type, interface protocol, clock/reset style, and verification needs. Include types: coding_rule, template, protocol, testbench, bug_pattern.
3. Use the retrieved knowledge to design the module interface (ports, parameters) and summarize the micro-architecture.
4. Write the Verilog implementation following CHIPCLAW.md and the retrieved coding rules/templates.
5. Write a self-checking testbench with clock generation, reset sequence, stimulus, $display-based pass/fail checks, and $dumpfile/$dumpvars.
6. Compile both files using rtl_compile to verify correctness.
7. If compilation fails, call rtl_knowledge_search for relevant bug_pattern entries, fix the code, and re-compile. Repeat until clean or until the failure is clearly blocked.
8. If rtl_simulate is available, run the testbench and fix any failing checks.
