import assert from "node:assert/strict";
import { getRtlKnowledgeEntry, searchRtlKnowledge } from "../dist/knowledge.js";
import { executeTool } from "../dist/tools.js";

const search = JSON.parse(searchRtlKnowledge({
  query: "synchronous fifo pointer full empty testbench",
  types: ["template", "testbench", "coding_rule"],
  limit: 5,
}));

assert.ok(Array.isArray(search.matches), "search result must include matches");
assert.ok(search.matches.some((entry) => entry.id === "sync-fifo"), "sync-fifo template should be retrieved");

const fifo = JSON.parse(getRtlKnowledgeEntry({ id: "sync-fifo" }));
assert.equal(fifo.id, "sync-fifo");
assert.ok(fifo.content.includes("Write when `wr_en && !full`"));
assert.ok(fifo.citations.length > 0, "knowledge entry should include citations");

const toolSearch = JSON.parse(await executeTool("rtl_knowledge_search", {
  query: "ready valid backpressure",
  types: ["protocol"],
}));
assert.ok(toolSearch.matches.some((entry) => entry.id === "valid-ready"), "tool execution should retrieve valid-ready");

console.log("RTL knowledge smoke test passed");
