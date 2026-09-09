import type {
  AssertionTier,
  LibraryAssertion,
  LibraryDataset,
  LibraryKind,
} from "./types";

export type AnyLibraryEntry = LibraryAssertion | LibraryDataset;
export type AssertionTierFilter = AssertionTier | "all";
export type SearchMode = "keyword" | "semantic";

export function filterByAssertionTier(
  kind: LibraryKind,
  entries: AnyLibraryEntry[],
  tier: AssertionTierFilter,
): AnyLibraryEntry[] {
  if (kind !== "assertions" || tier === "all") return entries;
  return entries.filter((e) => (e as LibraryAssertion).tier === tier);
}

/** Every bit of text on an entry worth matching against — used by both keyword and semantic search. */
function searchableText(kind: LibraryKind, entry: AnyLibraryEntry): string {
  const parts: string[] = [entry.name, entry.description, ...entry.tags];
  if (kind === "assertions") {
    const e = entry as LibraryAssertion;
    if (e.rubric) parts.push(e.rubric);
    if (e.check?.value) parts.push(e.check.value);
    if (e.check?.reference) parts.push(e.check.reference);
    if (e.code) parts.push(e.code);
  } else if (kind === "datasets") {
    const e = entry as LibraryDataset;
    parts.push(...e.items.map((it) => it.input));
  }
  return parts.join(" ");
}

export function keywordSearch(kind: LibraryKind, entries: AnyLibraryEntry[], query: string): AnyLibraryEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => searchableText(kind, e).toLowerCase().includes(q));
}

/**
 * Small domain synonym groups so a query like "block" surfaces an assertion whose text only says
 * "excludes"/"forbid"/"never" — the kind of match a keyword search misses.
 */
const SYNONYM_GROUPS: string[][] = [
  ["exclude", "excludes", "excluding", "avoid", "avoids", "forbid", "forbidden", "prevent", "prevents", "block", "blocks", "disallow", "never", "must not"],
  ["contain", "contains", "containing", "include", "includes", "mention", "mentions", "require", "requires"],
  ["judge", "judges", "judging", "rubric", "grade", "grading", "evaluate", "evaluates", "llm"],
  ["code", "script", "function", "javascript", "python", "custom"],
  ["format", "structure", "schema", "shape", "json", "xml"],
  ["toxicity", "toxic", "safety", "safe", "harmful", "harm"],
  ["price", "pricing", "cost", "financial", "money"],
  ["question", "ask", "asking", "query"],
  ["brand", "device", "product"],
  ["escalate", "escalation", "manager", "supervisor"],
  ["similar", "similarity", "distance", "overlap", "match", "levenshtein", "rouge"],
];

const SYNONYM_MAP: Map<string, Set<string>> = new Map();
for (const group of SYNONYM_GROUPS) {
  const set = new Set(group);
  for (const word of group) SYNONYM_MAP.set(word, set);
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function expandTokens(tokens: string[]): Set<string> {
  const expanded = new Set<string>();
  for (const t of tokens) {
    expanded.add(t);
    const group = SYNONYM_MAP.get(t);
    if (group) for (const w of group) expanded.add(w);
  }
  return expanded;
}

/**
 * Heuristic "semantic" search — a local, deterministic stand-in for a real embeddings-based
 * search, NOT an API call. It expands the query into a synonym-aware token set, then scores each
 * entry by weighted overlap (name > tags > body text), so a query like "block a phrase" can
 * surface an assertion whose only text is "excludes" without a literal substring match.
 */
export function semanticSearch(kind: LibraryKind, entries: AnyLibraryEntry[], query: string): AnyLibraryEntry[] {
  const q = query.trim();
  if (!q) return entries;
  const queryTokens = expandTokens(tokenize(q));
  if (queryTokens.size === 0) return entries;

  const scored = entries.map((entry) => {
    const nameTokens = expandTokens(tokenize(entry.name));
    const tagTokens = expandTokens(tokenize(entry.tags.join(" ")));
    const bodyTokens = expandTokens(tokenize(searchableText(kind, entry)));

    let score = 0;
    for (const t of queryTokens) {
      if (nameTokens.has(t)) score += 3;
      if (tagTokens.has(t)) score += 2;
      if (bodyTokens.has(t)) score += 1;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry);
}

/** One-stop helper combining tier filtering + keyword/semantic search, shared by the catalog page and the load modal. */
export function searchLibraryEntries(
  kind: LibraryKind,
  entries: AnyLibraryEntry[],
  opts: { query: string; mode: SearchMode; tier?: AssertionTierFilter },
): AnyLibraryEntry[] {
  const tierFiltered = opts.tier ? filterByAssertionTier(kind, entries, opts.tier) : entries;
  if (!opts.query.trim()) return tierFiltered;
  return opts.mode === "semantic"
    ? semanticSearch(kind, tierFiltered, opts.query)
    : keywordSearch(kind, tierFiltered, opts.query);
}
