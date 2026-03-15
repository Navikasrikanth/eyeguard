import { Navigate, Route, Routes } from "react-router-dom";

import { ReminderModal } from "@/components/breaks/ReminderModal";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/features/auth/AuthContext";
import { MonitoringProvider, useMonitoring } from "@/features/monitoring/MonitoringContext";
import { AboutPage } from "@/pages/AboutPage";
import { AuthPage } from "@/pages/AuthPage";
import { BreakPage } from "@/pages/BreakPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { HomePage } from "@/pages/HomePage";
import { SettingsPage } from "@/pages/SettingsPage";

function LoadingScreen() {
  return <div className="loading-screen">Loading EyeGuard...</div>;
}

function ProtectedRoutes() {
  const monitoring = useMonitoring();

  return (
    <>
      <ReminderModal
        open={monitoring.reminderOpen}
        onDismiss={() => monitoring.dismissReminder(120)}
        onStart={() => monitoring.beginBreak("auto")}
      />
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<HomePage />} path="/" />
          <Route element={<AboutPage />} path="/about" />
          <Route element={<DashboardPage />} path="/dashboard" />
          <Route element={<SettingsPage />} path="/settings" />
        </Route>
        <Route element={<BreakPage />} path="/break" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </>
  );
}

export function App() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <MonitoringProvider>
      <ProtectedRoutes />
    </MonitoringProvider>
  );
}
