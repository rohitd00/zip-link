import { Route, Routes } from "react-router-dom";
import { ForgotPasswordPage } from "./auth/ForgotPasswordPage";
import { LoginPage } from "./auth/LoginPage";
import { ResetPasswordPage } from "./auth/ResetPasswordPage";
import { SignupPage } from "./auth/SignupPage";
import { AppShell } from "./components/AppShell";
import { DashboardHomePage } from "./pages/DashboardHomePage";
import { LandingPage } from "./pages/LandingPage";
import { LinkDetailPage } from "./pages/LinkDetailPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/dashboard"
        element={
          <AppShell>
            <DashboardHomePage />
          </AppShell>
        }
      />
      <Route
        path="/dashboard/links/:code"
        element={
          <AppShell>
            <LinkDetailPage />
          </AppShell>
        }
      />
    </Routes>
  );
}
