import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FlaskConical, Search } from "lucide-react";
import { useStore } from "../../store";
import { describeRunPromptIdentity, resolveRunPromptIdentity } from "../../promptFactory";
import type { MockUser, RunGroup, SpecProject } from "../../types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { ColumnHeader, UPDATED_AT_PRESET_LABEL, matchesUpdatedAtPreset, type UpdatedAtPreset } from "@/components/ui/column-header";
import {
  DEFAULT_EVAL_RUNS_COLUMN_WIDTHS,
  EVAL_RUNS_MIN_COLUMN_WIDTH,
  EVAL_RUNS_PAGE_SIZE_OPTIONS,
  useEvalRunsViewPrefs,
  type EvalRunsWidthColumnId,
} from "../../evalRunsViewPrefs";
import { EvalRunsColumnsMenu } from "./EvalRunsColumnsMenu";

type SortKey = "id" | "description" | "author" | "createdAt" | "passRate" | "tests";
type SortDir = "asc" | "desc";

/** The shared preset buttons, plus a page-local "custom" mode backed by `createdFrom`/`createdTo` — kept local (not folded into `UpdatedAtPreset`) since Specs/Prompts/Library's own "Updated" filters don't offer a custom range and shouldn't gain a dead button because of this page. */
type CreatedFilterMode = UpdatedAtPreset | "custom";

/**
 * Drag handle on the right edge of a header cell to resize its column. Pointer events (not
 * mouse events) so it works the same with touch/pen input; capture-drag is done via window
 * listeners rather than React's onDrag since we need raw client-x deltas, not the HTML5 DnD API.
 */
function ResizableHeaderCell({
  width,
  minWidth = EVAL_RUNS_MIN_COLUMN_WIDTH,
  onResize,
  children,
}: {
  width: number;
  minWidth?: number;
  onResize: (width: number) => void;
  children: ReactNode;
}) {
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handlePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startWidth: width };
    setIsDragging(true);
    document.body.style.cursor = "col-resize";

    function handleMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      onResize(Math.max(minWidth, dragRef.current.startWidth + (ev.clientX - dragRef.current.startX)));
    }
    function handleUp() {
      dragRef.current = null;
      setIsDragging(false);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    // pr-3 leaves visible breathing room before the divider/handle, instead of text butting
    // right up against the column edge — this is also what makes the handle look intentional
    // rather than a stray sliver against the label.
    <div className="relative flex h-full min-w-0 items-center pr-3">
      {children}
      <div
        onPointerDown={handlePointerDown}
        title="Drag to resize column"
        className="group absolute inset-y-1 right-0 z-10 flex w-3 cursor-col-resize touch-none select-none items-center justify-center"
      >
        {/* The actual visible divider — a persistent thin line (not just a hover reveal) so it's
            obvious up front that every column boundary is draggable, not something you discover
            by accident. Thickens and switches to the accent color on hover/drag. */}
        <div
          className={`h-full rounded-full transition-all ${
            isDragging ? "w-1 bg-primary" : "w-px bg-slate-300 group-hover:w-1 group-hover:bg-primary/70"
          }`}
        />
      </div>
    </div>
  );
}

interface Row {
  spec: SpecProject;
  run: RunGroup;
  /** Real Prompt Management project id — `null` if this Spec's Prompt has never been synced there yet. */
  psProjectId: number | null;
  promptName: string;
  /** Real Prompt Management version id — `null` if this exact version has never been synced there yet. */
  psVersionId: number | null;
  versionNumber: number | null;
  /** Resolved from `run.ranByUserId` (falling back to the Spec's owner) — `null` only if that user id doesn't resolve to anyone. */
  author: MockUser | null;
}

interface ColumnFilters {
  id: string;
  description: string;
  author: string;
  createdAt: CreatedFilterMode;
  /** `yyyy-mm-dd` from the native date inputs, `""` when unset — only consulted when `createdAt === "custom"`. */
  createdFrom: string;
  createdTo: string;
  /** Whole percent (0–100), matching what's displayed — converted to a 0–1 fraction to compare against `run.passRate`. */
  minPassRate: number | null;
  maxPassRate: number | null;
  minTests: number | null;
  maxTests: number | null;
}

/** "MM/DD/YYYY, h:mm AM/PM" — matches the format used elsewhere (Home.tsx's Updated column). */
function formatUsDateTime(ts: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(ts);
}

/** Faint boundary between data cells, echoing the header's resize dividers so columns read as
 * distinct, adjustable regions everywhere in the table, not just in the header row. */
const CELL_DIVIDER = "border-r border-slate-100 pr-2 last:border-r-0 last:pr-0";

/** 0–60% red, 61–89% orange, 90–100% green — a coarser, more scannable read on a list of many runs than a binary pass/fail color would give. */
function passRateTone(rate: number): string {
  const pct = Math.round(rate * 100);
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 61) return "text-orange-600";
  return "text-rose-600";
}

/**
 * Renders one Row's identity via the shared `describeRunPromptIdentity` (see `promptFactory.ts`),
 * with the Spec's own name appended in brackets whenever it's not just a duplicate of the Prompt
 * name — e.g. the CSV-imported Scenario demos, where `spec.name` is really an eval-scenario
 * description ("Scenario 1 — Compliance chat, 14 assertions"), not the underlying Prompt's name,
 * so it's still worth keeping visible alongside the real Prompt identity, not replaced by it.
 */
function describeRun(row: Pick<Row, "spec" | "promptName" | "psProjectId" | "versionNumber" | "psVersionId">): string {
  const identity = describeRunPromptIdentity(row);
  return row.spec.name === row.promptName ? identity : `${identity} (${row.spec.name})`;
}

/**
 * The global "Eval runs" section — every eval Run across every Spec, newest first by default.
 * This is the AI Studio replacement for Promptfoo's eval-list screen: click a row to open that
 * Run's own full-page detail view (`RunDetailPage`). Every Run stays tied to the Spec it came
 * from — there's no standalone "eval config" concept here — but each Run also carries the exact
 * mirrored Prompt version it ran against (`run.targetId`, resolved to the Prompt/PromptVersion
 * rows via `promptFactory.ts`), summarized in the "Description" column (see `describeRun`).
 */
export function RunsList() {
  const { specs, prompts, users } = useStore();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openFilterKey, setOpenFilterKey] = useState<SortKey | null>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    id: "",
    description: "",
    author: "",
    createdAt: "any",
    createdFrom: "",
    createdTo: "",
    minPassRate: null,
    maxPassRate: null,
    minTests: null,
    maxTests: null,
  });
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { prefs, toggleColumn, setColumnWidth, update: updatePrefs } = useEvalRunsViewPrefs();
  const widths: Record<EvalRunsWidthColumnId, number> = { ...DEFAULT_EVAL_RUNS_COLUMN_WIDTHS, ...prefs.columnWidths };

  const userById = useMemo(() => new Map<string, MockUser>(users.map((u) => [u.id, u])), [users]);

  const allRows: Row[] = useMemo(() => {
    return specs.flatMap((spec) => {
      return spec.runs.map((run) => {
        const identity = resolveRunPromptIdentity(spec, run, prompts);
        // Legacy Runs predate `ranByUserId` — attribute those to the Spec's own owner rather than
        // showing a blank Author (same fallback `rerun`/`publishSpec` apply for brand-new Runs).
        const author = userById.get(run.ranByUserId ?? spec.ownerId) ?? null;
        return { spec, run, ...identity, author };
      });
    });
  }, [specs, prompts, userById]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const showAuthor = !prefs.hiddenColumns.includes("author");
  const showCreated = !prefs.hiddenColumns.includes("createdAt");
  const showPassRate = !prefs.hiddenColumns.includes("passRate");
  const showTests = !prefs.hiddenColumns.includes("tests");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows
      .filter(
        (r) =>
          !q ||
          describeRun(r).toLowerCase().includes(q) ||
          (r.author?.email ?? "").toLowerCase().includes(q) ||
          r.run.id.toLowerCase().includes(q),
      )
      .filter((r) => !columnFilters.id || r.run.id.toLowerCase().includes(columnFilters.id.toLowerCase()))
      .filter((r) => !columnFilters.description || describeRun(r).toLowerCase().includes(columnFilters.description.toLowerCase()))
      // Only filter by a column that's actually visible — same convention as the Results table's
      // filters menu, so hiding a column can't leave a stale, invisible filter quietly excluding rows.
      .filter((r) => !showAuthor || !columnFilters.author || (r.author?.email ?? "").toLowerCase().includes(columnFilters.author.toLowerCase()))
      .filter((r) => {
        if (!showCreated) return true;
        if (columnFilters.createdAt === "custom") {
          if (columnFilters.createdFrom && r.run.createdAt < new Date(`${columnFilters.createdFrom}T00:00:00`).getTime()) {
            return false;
          }
          if (columnFilters.createdTo && r.run.createdAt > new Date(`${columnFilters.createdTo}T23:59:59.999`).getTime()) {
            return false;
          }
          return true;
        }
        return matchesUpdatedAtPreset(r.run.createdAt, columnFilters.createdAt);
      })
      .filter((r) => {
        if (!showPassRate) return true;
        const pct = r.run.passRate * 100;
        if (columnFilters.minPassRate !== null && pct < columnFilters.minPassRate) return false;
        if (columnFilters.maxPassRate !== null && pct > columnFilters.maxPassRate) return false;
        return true;
      })
      .filter((r) => {
        if (!showTests) return true;
        const count = r.run.results.length;
        if (columnFilters.minTests !== null && count < columnFilters.minTests) return false;
        if (columnFilters.maxTests !== null && count > columnFilters.maxTests) return false;
        return true;
      })
      .sort((a, b) => {
        const dir = sortDir === "asc" ? 1 : -1;
        switch (sortKey) {
          case "id":
            return a.run.id.localeCompare(b.run.id) * dir;
          case "description":
            return describeRun(a).localeCompare(describeRun(b)) * dir;
          case "author":
            return (a.author?.email ?? "").localeCompare(b.author?.email ?? "") * dir;
          case "passRate":
            return (a.run.passRate - b.run.passRate) * dir;
          case "tests":
            return (a.run.results.length - b.run.results.length) * dir;
          default:
            return (a.run.createdAt - b.run.createdAt) * dir;
        }
      });
  }, [allRows, query, columnFilters, sortKey, sortDir, showAuthor, showCreated, showPassRate, showTests]);

  useEffect(() => {
    setPage(0);
  }, [query, columnFilters, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(visible.length / prefs.pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  useEffect(() => {
    if (page !== clampedPage) setPage(clampedPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedPage]);
  const pageStart = clampedPage * prefs.pageSize;
  const pageRows = visible.slice(pageStart, pageStart + prefs.pageSize);

  // The table body scrolls inside its own sticky-header box (see below) — without this, paging
  // forward/back after scrolling down would render the new page's rows starting mid-scroll
  // instead of from the top, which reads as if rows are missing.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [clampedPage]);

  const gridTemplateColumns = [
    `${widths.id}px`,
    `${widths.description}px`,
    showAuthor && `${widths.author}px`,
    showCreated && `${widths.createdAt}px`,
    showPassRate && `${widths.passRate}px`,
    showTests && `${widths.tests}px`,
  ]
    .filter((v): v is string => typeof v === "string")
    .join(" ");

  return (
    <PageShell>
      <div>
        <div className="flex items-center gap-2 text-primary">
          <FlaskConical size={16} />
          <span className="text-xs font-semibold uppercase tracking-wider">AI Studio</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Eval runs</h1>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Every eval run across every Spec, in one place — click a row to see its full results, filters, and export
          options.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by description, author, or run id…"
            className="pl-8"
          />
        </div>
        <EvalRunsColumnsMenu prefs={prefs} onToggleColumn={toggleColumn} onUpdate={updatePrefs} />
      </div>

      {allRows.length === 0 ? (
        <Card className="mt-10 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <FlaskConical className="text-slate-400" size={28} />
          <p className="text-sm text-slate-600">No eval runs yet — run a Spec's eval suite to see it here.</p>
        </Card>
      ) : (
        <div className="mt-5">
          {openFilterKey && <div className="fixed inset-0 z-20" onClick={() => setOpenFilterKey(null)} />}

          <div ref={scrollRef} className="max-h-[70vh] overflow-auto rounded-2xl border border-slate-200">
            <div
              className={`grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 ${
                prefs.stickyHeader ? "sticky top-0 z-10" : ""
              }`}
              style={{ gridTemplateColumns }}
            >
              <ResizableHeaderCell width={widths.id} onResize={(w) => setColumnWidth("id", w)}>
                <ColumnHeader
                  label="Run ID"
                  columnKey="id"
                  activeSort={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterActive={!!columnFilters.id}
                  isFilterOpen={openFilterKey === "id"}
                  onToggleFilter={setOpenFilterKey}
                  filterContent={
                    <Input
                      autoFocus
                      value={columnFilters.id}
                      onChange={(e) => setColumnFilters((f) => ({ ...f, id: e.target.value }))}
                      placeholder="Filter by run id…"
                    />
                  }
                />
              </ResizableHeaderCell>
              <ResizableHeaderCell width={widths.description} onResize={(w) => setColumnWidth("description", w)}>
                <ColumnHeader
                  label="Description"
                  title="What was evaluated during the run — e.g. prompt project and version details, or an agent's name."
                  columnKey="description"
                  activeSort={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                  filterActive={!!columnFilters.description}
                  isFilterOpen={openFilterKey === "description"}
                  onToggleFilter={setOpenFilterKey}
                  filterContent={
                    <Input
                      autoFocus
                      value={columnFilters.description}
                      onChange={(e) => setColumnFilters((f) => ({ ...f, description: e.target.value }))}
                      placeholder="Filter by name or id…"
                    />
                  }
                />
              </ResizableHeaderCell>
              {showAuthor && (
                <ResizableHeaderCell width={widths.author} onResize={(w) => setColumnWidth("author", w)}>
                  <ColumnHeader
                    label="Author"
                    title="Who triggered this run."
                    columnKey="author"
                    activeSort={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    filterActive={!!columnFilters.author}
                    isFilterOpen={openFilterKey === "author"}
                    onToggleFilter={setOpenFilterKey}
                    filterContent={
                      <Input
                        autoFocus
                        value={columnFilters.author}
                        onChange={(e) => setColumnFilters((f) => ({ ...f, author: e.target.value }))}
                        placeholder="Filter by author email…"
                      />
                    }
                  />
                </ResizableHeaderCell>
              )}
              {showCreated && (
                <ResizableHeaderCell width={widths.createdAt} onResize={(w) => setColumnWidth("createdAt", w)}>
                  <ColumnHeader
                    label="Created"
                    columnKey="createdAt"
                    activeSort={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    filterActive={columnFilters.createdAt !== "any"}
                    isFilterOpen={openFilterKey === "createdAt"}
                    onToggleFilter={setOpenFilterKey}
                    filterContent={
                      <div className="w-64 space-y-0.5">
                        {(Object.keys(UPDATED_AT_PRESET_LABEL) as UpdatedAtPreset[]).map((k) => (
                          <button
                            key={k}
                            onClick={() => setColumnFilters((f) => ({ ...f, createdAt: k }))}
                            className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                              columnFilters.createdAt === k ? "bg-accent text-accent-foreground" : "hover:bg-slate-50"
                            }`}
                          >
                            {UPDATED_AT_PRESET_LABEL[k]}
                          </button>
                        ))}
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          onClick={() => setColumnFilters((f) => ({ ...f, createdAt: "custom" }))}
                          className={`block w-full rounded-md px-2 py-1 text-left text-xs ${
                            columnFilters.createdAt === "custom" ? "bg-accent text-accent-foreground" : "hover:bg-slate-50"
                          }`}
                        >
                          Custom range
                        </button>
                        <div className="flex items-center gap-1 px-2 pt-1">
                          <Input
                            type="date"
                            value={columnFilters.createdFrom}
                            onChange={(e) => setColumnFilters((f) => ({ ...f, createdAt: "custom", createdFrom: e.target.value }))}
                            className="h-7 px-1.5 text-xs"
                          />
                          <span className="shrink-0 text-slate-300">–</span>
                          <Input
                            type="date"
                            value={columnFilters.createdTo}
                            onChange={(e) => setColumnFilters((f) => ({ ...f, createdAt: "custom", createdTo: e.target.value }))}
                            className="h-7 px-1.5 text-xs"
                          />
                        </div>
                      </div>
                    }
                  />
                </ResizableHeaderCell>
              )}
              {showPassRate && (
                <ResizableHeaderCell width={widths.passRate} onResize={(w) => setColumnWidth("passRate", w)}>
                  <ColumnHeader
                    label="Pass rate"
                    title="Color-coded: 0–60% red, 61–89% orange, 90–100% green."
                    columnKey="passRate"
                    activeSort={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    filterActive={columnFilters.minPassRate !== null || columnFilters.maxPassRate !== null}
                    isFilterOpen={openFilterKey === "passRate"}
                    onToggleFilter={setOpenFilterKey}
                    filterContent={
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-700">Pass rate (%)</p>
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            type="number"
                            min={0}
                            max={100}
                            placeholder="Min"
                            value={columnFilters.minPassRate ?? ""}
                            onChange={(e) =>
                              setColumnFilters((f) => ({
                                ...f,
                                minPassRate: e.target.value === "" ? null : Number(e.target.value),
                              }))
                            }
                          />
                          <span className="text-slate-300">–</span>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            placeholder="Max"
                            value={columnFilters.maxPassRate ?? ""}
                            onChange={(e) =>
                              setColumnFilters((f) => ({
                                ...f,
                                maxPassRate: e.target.value === "" ? null : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                    }
                  />
                </ResizableHeaderCell>
              )}
              {showTests && (
                <ResizableHeaderCell width={widths.tests} onResize={(w) => setColumnWidth("tests", w)}>
                  <ColumnHeader
                    label="Test cases"
                    columnKey="tests"
                    activeSort={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    filterActive={columnFilters.minTests !== null || columnFilters.maxTests !== null}
                    isFilterOpen={openFilterKey === "tests"}
                    onToggleFilter={setOpenFilterKey}
                    filterContent={
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-700">Test cases</p>
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            type="number"
                            min={0}
                            placeholder="Min"
                            value={columnFilters.minTests ?? ""}
                            onChange={(e) =>
                              setColumnFilters((f) => ({
                                ...f,
                                minTests: e.target.value === "" ? null : Number(e.target.value),
                              }))
                            }
                          />
                          <span className="text-slate-300">–</span>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Max"
                            value={columnFilters.maxTests ?? ""}
                            onChange={(e) =>
                              setColumnFilters((f) => ({
                                ...f,
                                maxTests: e.target.value === "" ? null : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </div>
                    }
                  />
                </ResizableHeaderCell>
              )}
            </div>

            <div>
              {pageRows.map((row) => (
                <button
                  key={row.run.id}
                  onClick={() => window.open(`/runs/${row.run.id}`, "_blank")}
                  title="Opens this run's full results on its own page, in a new tab"
                  className="grid w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50"
                  style={{ gridTemplateColumns }}
                >
                  <span className={`truncate font-mono text-[11px] text-slate-500 ${CELL_DIVIDER}`} title={row.run.id}>
                    {row.run.id}
                  </span>
                  <span className={`truncate text-sm font-medium text-slate-900 ${CELL_DIVIDER}`} title={describeRun(row)}>
                    {describeRun(row)}
                  </span>
                  {showAuthor && (
                    <span className={`flex min-w-0 items-center gap-1.5 text-xs text-slate-600 ${CELL_DIVIDER}`}>
                      {row.author ? (
                        <>
                          <Avatar title={row.author.name}>
                            <AvatarFallback>{row.author.initials}</AvatarFallback>
                          </Avatar>
                          <span className="truncate" title={row.author.email}>
                            {row.author.email}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </span>
                  )}
                  {showCreated && (
                    <span className={`text-xs text-slate-500 ${CELL_DIVIDER}`}>{formatUsDateTime(row.run.createdAt)}</span>
                  )}
                  {showPassRate && (
                    <span className={`text-xs font-semibold ${passRateTone(row.run.passRate)} ${CELL_DIVIDER}`}>
                      {Math.round(row.run.passRate * 100)}%
                    </span>
                  )}
                  {showTests && (
                    <span className={`text-xs tabular-nums text-slate-600 ${CELL_DIVIDER}`}>{row.run.results.length}</span>
                  )}
                </button>
              ))}
              {pageRows.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Nothing matches these filters.</p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {visible.length} run{visible.length === 1 ? "" : "s"}
              {visible.length !== allRows.length && <> (of {allRows.length} total)</>}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5">
                Show
                <select
                  value={prefs.pageSize}
                  onChange={(e) => updatePrefs({ pageSize: Number(e.target.value) })}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700 outline-none focus:border-ring"
                >
                  {EVAL_RUNS_PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                Page {clampedPage + 1} of {totalPages}
              </span>
              <button
                disabled={clampedPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={clampedPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
