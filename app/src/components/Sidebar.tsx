import { useState } from "react";
import {
  ChevronsUpDown,
  Compass,
  FileText,
  ListChecks,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldQuestion,
  Sparkles,
  TableProperties,
  TrendingUp,
} from "lucide-react";
import { useStore } from "../store";
import { Avatar } from "./ui";

export type Section = "specs" | "prompts" | "assertions" | "datasets" | "judgePolicies" | "dashboard";

const NAV: { id: Section; label: string; icon: typeof FileText }[] = [
  { id: "specs", label: "Specs", icon: FileText },
  { id: "prompts", label: "Prompts", icon: Sparkles },
  { id: "assertions", label: "Assertions", icon: ListChecks },
  { id: "datasets", label: "Datasets", icon: TableProperties },
  { id: "judgePolicies", label: "Judge Policies", icon: ShieldQuestion },
  { id: "dashboard", label: "Dashboard", icon: TrendingUp },
];

export function Sidebar({ section, onSectionChange }: { section: Section; onSectionChange: (s: Section) => void }) {
  const { specs, prompts, library, users, currentUser, switchUser, select, selectPrompt } = useStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const counts: Partial<Record<Section, number>> = {
    specs: specs.length,
    prompts: prompts.length,
    assertions: library.assertions.length,
    datasets: library.datasets.length,
    judgePolicies: library.judgePolicies.length,
  };

  function goToSection(id: Section) {
    select(null);
    selectPrompt(null);
    onSectionChange(id);
  }

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50 py-3">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          className="mb-3 rounded-lg p-2 text-sky-600 hover:bg-slate-100"
        >
          <PanelLeftOpen size={17} />
        </button>

        <nav className="flex-1 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => goToSection(item.id)}
                title={item.label}
                className={`flex w-10 items-center justify-center rounded-lg py-2.5 transition-colors ${
                  active ? "bg-sky-50 text-sky-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </nav>

        <div className="relative border-t border-slate-200 pt-2">
          <button
            onClick={() => setUserMenuOpen((v) => !v)}
            title={currentUser.name}
            className="rounded-lg p-1.5 hover:bg-slate-100"
          >
            <Avatar name={currentUser.name} initials={currentUser.initials} size="md" />
          </button>
          {userMenuOpen && (
            <div className="absolute bottom-0 left-full ml-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-400">Switch user (demo)</p>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    switchUser(u.id);
                    setUserMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                    u.id === currentUser.id ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Avatar name={u.name} initials={u.initials} />
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
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <span className="flex items-center gap-2 text-sky-600">
          <Compass size={16} />
          <span className="text-xs font-semibold uppercase tracking-wider">Compass</span>
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              onClick={() => goToSection(item.id)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                active ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={15} />
                {item.label}
              </span>
              {counts[item.id] !== undefined && <span className="text-xs text-slate-400">{counts[item.id]}</span>}
            </button>
          );
        })}
      </nav>

      <div className="relative border-t border-slate-200 p-2">
        <button
          onClick={() => setUserMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-100"
        >
          <Avatar name={currentUser.name} initials={currentUser.initials} size="md" />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{currentUser.name}</span>
          <ChevronsUpDown size={14} className="text-slate-500" />
        </button>
        {userMenuOpen && (
          <div className="absolute bottom-full left-2 mb-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-400">Switch user (demo)</p>
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  switchUser(u.id);
                  setUserMenuOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                  u.id === currentUser.id ? "bg-sky-50 text-sky-700" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Avatar name={u.name} initials={u.initials} />
                {u.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
