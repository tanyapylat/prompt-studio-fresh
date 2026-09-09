import { useState } from "react";
import {
  Activity,
  ChevronsUpDown,
  Compass,
  FileText,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  TableProperties,
  TrendingUp,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type Section = "specs" | "prompts" | "assertions" | "datasets" | "observability" | "dashboard";

const NAV: { id: Section; label: string; icon: typeof FileText; soon?: boolean }[] = [
  { id: "specs", label: "Specs", icon: FileText },
  { id: "prompts", label: "Prompts", icon: Sparkles },
  { id: "assertions", label: "Assertions", icon: ListChecks },
  { id: "datasets", label: "Datasets", icon: TableProperties },
  { id: "observability", label: "Observability", icon: Activity, soon: true },
  { id: "dashboard", label: "Dashboard", icon: TrendingUp },
];

export function Sidebar({ section, onSectionChange }: { section: Section; onSectionChange: (s: Section) => void }) {
  const { specs, prompts, library, users, currentUser, switchUser, select, selectPrompt, selectLibraryDataset } = useStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const counts: Partial<Record<Section, number>> = {
    specs: specs.length,
    prompts: prompts.length,
    assertions: library.assertions.length,
    datasets: library.datasets.length,
  };

  function goToSection(id: Section) {
    select(null);
    selectPrompt(null);
    selectLibraryDataset(null);
    onSectionChange(id);
  }

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center border-r border-slate-100 bg-white py-3">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="mb-3 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <PanelLeftOpen size={16} />
        </button>

        <nav className="flex-1 space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goToSection(item.id)}
                title={item.label}
                className={`flex w-10 items-center justify-center rounded-md py-2.5 transition-colors ${
                  active ? "bg-accent text-accent-foreground" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </nav>

        <div className="relative border-t border-slate-100 pt-2">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            title={currentUser.name}
            className="rounded-md p-1.5 hover:bg-slate-100"
          >
            <Avatar className="size-7" title={currentUser.name}>
              <AvatarFallback>{currentUser.initials}</AvatarFallback>
            </Avatar>
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-0 left-full ml-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-md shadow-slate-900/5">
              <p className="px-2 py-1 text-[11px] text-slate-400">Switch user (demo)</p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    switchUser(u.id);
                    setUserMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                    u.id === currentUser.id ? "bg-accent text-accent-foreground" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Avatar title={u.name}>
                    <AvatarFallback>{u.initials}</AvatarFallback>
                  </Avatar>
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <span className="flex items-center gap-1.5">
          <Compass size={15} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-900">AI Studio</span>
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <p className="px-4 pb-1 pt-2 text-[11px] text-slate-400">Workspace</p>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => goToSection(item.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-[7px] text-sm transition-colors ${
                active ? "bg-accent font-medium text-accent-foreground" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={15} className={active ? "text-slate-700" : "text-slate-400"} />
                {item.label}
              </span>
              {item.soon ? (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  Soon
                </span>
              ) : (
                counts[item.id] !== undefined && <span className="text-xs text-slate-400">{counts[item.id]}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="relative border-t border-slate-100 p-2">
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-slate-50"
        >
          <Avatar className="size-7" title={currentUser.name}>
            <AvatarFallback>{currentUser.initials}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{currentUser.name}</span>
          <ChevronsUpDown size={14} className="text-slate-400" />
        </button>
        {userMenuOpen && (
          <div className="absolute bottom-full left-2 mb-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-md shadow-slate-900/5">
            <p className="px-2 py-1 text-[11px] text-slate-400">Switch user (demo)</p>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  switchUser(u.id);
                  setUserMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  u.id === currentUser.id ? "bg-accent text-accent-foreground" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Avatar title={u.name}>
                  <AvatarFallback>{u.initials}</AvatarFallback>
                </Avatar>
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
