import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate, useParams } from "react-router-dom";
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
import { RunsList } from "./components/runs/RunsList";
import { RunDetailPage } from "./components/runs/RunDetailPage";

function Shell() {
  const { selected, selectedPromptId, selectedLibraryDatasetId, selectedRunId, selectRun } = useStore();
  // A tab that boots straight onto a `/runs/:runId` link (the normal way a Run is opened — see
  // `RunsList`/`Home`/`ResultsPane`, all of which `window.open` this route in a new tab) should
  // land "Back" on the Runs list, not the Specs home it'd otherwise default to.
  const [section, setSection] = useState<Section>(() => (window.location.pathname.startsWith("/runs/") ? "runs" : "specs"));
  useSetAssistantView({ section });
  const navigate = useNavigate();
  const { runId: routeRunId } = useParams<{ runId?: string }>();

  // URL -> store: a direct link (new tab, reload, browser back/forward) drives which Run is shown.
  useEffect(() => {
    if (routeRunId && routeRunId !== selectedRunId) selectRun(routeRunId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeRunId]);

  // store -> URL: any in-app Run switch (e.g. the version-history picker on `RunDetailPage`, or
  // its own "Back" button) keeps the address bar honest too, so reload/copy-link/back-forward all
  // keep working no matter how the Run changed.
  useEffect(() => {
    if (selectedRunId && selectedRunId !== routeRunId) navigate(`/runs/${selectedRunId}`, { replace: true });
    else if (!selectedRunId && routeRunId) navigate("/", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRunId]);
  // North Star is `fixed`-positioned so it can float above everything (including its own launcher
  // bubble) — reserve that same width here so it never overlaps and clips page content underneath
  // it (e.g. a Workspace header's right-aligned buttons) instead of docking cleanly beside it.
  const assistantReservedWidth = useAssistantReservedWidth();

  function renderSection() {
    if (section === "specs") return <Home />;
    if (section === "dashboard") return <Dashboard />;
    if (section === "prompts") return <PromptsList />;
    if (section === "runs") return <RunsList />;
    if (section === "observability") return <ObservabilityPage />;
    return <LibraryList kind={section} />;
  }

  function renderMain() {
    // A selected Run takes priority over a selected Spec — e.g. "View full history" from inside a
    // Spec's Results tab keeps `selected` set so "Back to Spec" can return to it afterward.
    if (selectedRunId) return <RunDetailPage />;
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
    <BrowserRouter>
      <StoreProvider>
        <AssistantContextProvider>
          <Routes>
            <Route path="/runs/:runId" element={<Shell />} />
            <Route path="*" element={<Shell />} />
          </Routes>
        </AssistantContextProvider>
      </StoreProvider>
    </BrowserRouter>
  );
}
