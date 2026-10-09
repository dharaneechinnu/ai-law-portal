import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { AdminUsersPage } from "@/features/admin/AdminUsersPage";
import { AccountPage } from "@/features/account/AccountPage";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { SetupPage } from "@/features/auth/SetupPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { PeoplePage } from "@/features/people/PeoplePage";
import { ApprovalsPage } from "@/features/ai/ApprovalsPage";
import { AnalyticsPage } from "@/features/analytics/AnalyticsPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { MatterDetail } from "@/features/matters/MatterDetail";
import { MattersPage } from "@/features/matters/MattersPage";
import { LegalPage } from "@/features/legal-intelligence/LegalPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { Placeholder } from "@/routes/Placeholder";

const queryClient = new QueryClient();

/** UX guard only; the server enforces RBAC on every admin endpoint. */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role_name !== "admin") {
    return <Placeholder title="Admins only" hint="Only your firm admin can open this page." />;
  }
  return <>{children}</>;
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route element={<Protected />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/matters" element={<MattersPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/matters/:id" element={<MatterDetail />} />
              <Route path="/settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
              <Route path="/legal" element={<LegalPage />} />
              <Route path="/admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
