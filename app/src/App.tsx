import { useState } from "react";
import { StoreProvider, useStore } from "./store";
import { AssistantContextProvider, useSetAssistantView } from "./assistantContext";
import { Home } from "./components/Home";
import { Dashboard } from "./components/Dashboard";
import { Workspace } from "./components/Workspace";
import { Sidebar, type Section } from "./components/Sidebar";
import { LibraryList } from "./components/library/LibraryList";
import { PromptsList } from "./components/prompts/PromptsList";
import { PromptPlayground } from "./components/prompts/PromptPlayground";
import { AssistantWidget } from "./components/assistant/AssistantWidget";

function Shell() {
  const { selected, selectedPromptId } = useStore();
  const [section, setSection] = useState<Section>("specs");
  useSetAssistantView({ section });

  function renderSection() {
    if (section === "specs") return <Home />;
    if (section === "dashboard") return <Dashboard />;
    if (section === "prompts") return <PromptsList />;
    return <LibraryList kind={section} />;
  }

  function renderMain() {
    if (selectedPromptId) return <PromptPlayground />;
    if (selected) return <Workspace />;
    return renderSection();
  }

  return (
    <div className="flex h-screen">
      <Sidebar section={section} onSectionChange={setSection} />
      <div className="min-w-0 flex-1 overflow-y-auto">{renderMain()}</div>
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
