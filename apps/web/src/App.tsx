import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { LinkDetailPage } from "./pages/LinkDetailPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardHomePage />} />
        <Route path="/links/:code" element={<LinkDetailPage />} />
      </Routes>
    </AppShell>
  );
}
