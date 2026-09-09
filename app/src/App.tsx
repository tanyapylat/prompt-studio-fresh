import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { AssistantContextProvider, useAssistantReservedWidth, useSetAssistantView } from "./assistantContext";
import { Home } from "./components/Home";
import { Dashboard } from "./components/Dashboard";
import { Workspace } from "./components/Workspace";
import { Sidebar, type Section } from "./components/Sidebar";
import { LibraryList } from "./components/library/LibraryList";
import { PromptsList } from "./components/prompts/PromptsList";
import { PromptPlayground } from "./components/prompts/PromptPlayground";
import { DatasetWorkspace } from "./components/library/DatasetWorkspace";
import { AssistantWidget } from "./components/assistant/AssistantWidget";
import { ObservabilityPage } from "./components/ObservabilityPage";

function Shell() {
  const { selected, selectedPromptId, selectedLibraryDatasetId } = useStore();
  const [section, setSection] = useState<Section>("specs");
  useSetAssistantView({ section });
  // North Star is `fixed`-positioned so it can float above everything (including its own launcher
  // bubble) — reserve that same width here so it never overlaps and clips page content underneath
  // it (e.g. a Workspace header's right-aligned buttons) instead of docking cleanly beside it.
  const assistantReservedWidth = useAssistantReservedWidth();

  function renderSection() {
    if (section === "specs") return <Home />;
    if (section === "dashboard") return <Dashboard />;
    if (section === "prompts") return <PromptsList />;
    if (section === "observability") return <ObservabilityPage />;
    return <LibraryList kind={section} />;
  }

  function renderMain() {
    if (selectedPromptId) return <PromptPlayground />;
    if (selected) return <Workspace />;
    if (selectedLibraryDatasetId) return <DatasetWorkspace />;
    return renderSection();
  }

  return (
    <div className="flex h-screen">
      <Sidebar section={section} onSectionChange={setSection} />
      <div
        className="min-w-0 flex-1 overflow-y-auto transition-[padding-right] duration-150"
        style={{ paddingRight: assistantReservedWidth }}
      >
        {renderMain()}
      </div>
      <AssistantWidget />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AssistantContextProvider>
        <Shell />
      </AssistantContextProvider>
    </StoreProvider>
  );
}
