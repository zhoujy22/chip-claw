import assert from "node:assert/strict";
import { McpManager } from "../dist/mcp.js";

const manager = new McpManager();
const started = Date.now();

try {
  await manager.loadAndConnect();
  const elapsedMs = Date.now() - started;
  const toolNames = new Set(manager.getToolDefinitions().map((tool) => tool.name));

  assert.ok(toolNames.has("mcp__test__add"), "test MCP add tool was not loaded");
  assert.ok(toolNames.has("mcp__test__echo"), "test MCP echo tool was not loaded");
  assert.ok(toolNames.has("mcp__test__timestamp"), "test MCP timestamp tool was not loaded");
  assert.ok(elapsedMs < 5_000, `MCP config smoke test took too long: ${elapsedMs}ms`);

  console.log(`MCP config smoke test passed (${elapsedMs}ms)`);
} finally {
  await manager.disconnectAll();
}
