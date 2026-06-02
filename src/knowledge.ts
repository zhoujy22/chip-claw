import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join, relative } from "path";
import { parseFrontmatter } from "./frontmatter.js";

export interface RtlKnowledgeEntry {
  id: string;
  type: string;
  title: string;
  tags: string[];
  priority: number;
  sourcePath: string;
  summary: string;
  citations: string[];
  content: string;
}

export interface RtlKnowledgeSearchInput {
  query?: string;
  types?: string[];
  tags?: string[];
  limit?: number;
}

let cachedEntries: RtlKnowledgeEntry[] | null = null;

export function searchRtlKnowledge(input: RtlKnowledgeSearchInput): string {
  const query = String(input.query || "").trim();
  const typeFilter = new Set((input.types || []).map((t) => t.toLowerCase()));
  const tagFilter = new Set((input.tags || []).map((t) => t.toLowerCase()));
  const limit = Math.max(1, Math.min(20, Number(input.limit) || 5));
  const queryTokens = tokenize(query);

  const matches = loadRtlKnowledge()
    .filter((entry) => typeFilter.size === 0 || typeFilter.has(entry.type.toLowerCase()))
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens, tagFilter) }))
    .filter(({ score }) => score > 0 || (!query && tagFilter.size === 0))
    .sort((a, b) => b.score - a.score || b.entry.priority - a.entry.priority)
    .slice(0, limit)
    .map(({ entry, score }) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      tags: entry.tags,
      score: Number(score.toFixed(3)),
      source: entry.sourcePath,
      citations: entry.citations,
      summary: entry.summary,
      content: entry.content,
    }));

  return JSON.stringify({ query, matches }, null, 2);
}

export function getRtlKnowledgeEntry(input: { id: string }): string {
  const id = String(input.id || "").trim().toLowerCase();
  if (!id) return JSON.stringify({ error: "id is required" }, null, 2);
  const entry = loadRtlKnowledge().find((item) => item.id.toLowerCase() === id);
  if (!entry) return JSON.stringify({ error: `No RTL knowledge entry found for id '${input.id}'` }, null, 2);
  return JSON.stringify(entry, null, 2);
}

export function loadRtlKnowledge(): RtlKnowledgeEntry[] {
  if (cachedEntries) return cachedEntries;
  const root = resolveKnowledgeRoot();
  if (!existsSync(root)) {
    cachedEntries = [];
    return cachedEntries;
  }

  const files = walkMarkdown(root);
  cachedEntries = files.map((filePath) => parseKnowledgeFile(root, filePath)).filter(Boolean) as RtlKnowledgeEntry[];
  return cachedEntries;
}

function resolveKnowledgeRoot(): string {
  const candidates = [
    process.env.CHIPCLAW_KNOWLEDGE_DIR,
    join(process.cwd(), "vendor", "rtl-knowledge", "knowledge"),
    join(process.cwd(), ".chipclaw", "knowledge"),
  ].filter((value): value is string => !!value && value.trim().length > 0);
  return candidates.find((candidate) => existsSync(candidate)) || candidates[candidates.length - 1];
}

function walkMarkdown(dir: string): string[] {
  const files: string[] = [];
  for (const entry of safeReaddir(dir)) {
    const fullPath = join(dir, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }
    if (stat.isDirectory()) files.push(...walkMarkdown(fullPath));
    else if (entry.endsWith(".md")) files.push(fullPath);
  }
  return files.sort();
}

function safeReaddir(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

function parseKnowledgeFile(root: string, filePath: string): RtlKnowledgeEntry | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const id = meta.id || basename(filePath, ".md");
    const relPath = relative(process.cwd(), filePath).replace(/\\/g, "/");
    const title = meta.title || id;
    return {
      id,
      type: meta.type || inferType(root, filePath),
      title,
      tags: parseList(meta.tags),
      priority: Number(meta.priority) || 50,
      sourcePath: relPath,
      summary: firstParagraph(body),
      citations: parseList(meta.sources),
      content: body,
    };
  } catch {
    return null;
  }
}

function inferType(root: string, filePath: string): string {
  const rel = relative(root, filePath).replace(/\\/g, "/");
  return rel.includes("/") ? rel.split("/")[0].replace(/-/g, "_") : "reference";
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return inner
    .split(",")
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function firstParagraph(body: string): string {
  const cleaned = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
    .join(" ");
  return cleaned.length > 280 ? cleaned.slice(0, 277) + "..." : cleaned;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function scoreEntry(entry: RtlKnowledgeEntry, queryTokens: string[], tagFilter: Set<string>): number {
  let score = entry.priority / 1000;
  const id = entry.id.toLowerCase();
  const title = entry.title.toLowerCase();
  const tags = entry.tags.map((tag) => tag.toLowerCase());
  const summary = entry.summary.toLowerCase();
  const content = entry.content.toLowerCase();

  for (const tag of tagFilter) {
    if (tags.includes(tag)) score += 8;
  }

  for (const token of queryTokens) {
    if (id.includes(token)) score += 6;
    if (title.includes(token)) score += 5;
    if (tags.some((tag) => tag.includes(token))) score += 4;
    if (summary.includes(token)) score += 2;
    if (content.includes(token)) score += 1;
  }

  return score;
}
