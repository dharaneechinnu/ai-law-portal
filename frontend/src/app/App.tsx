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
import { MatterDetail } from "@/features/matters/MatterDetail";
import { MattersPage } from "@/features/matters/MattersPage";
import { LegalPage } from "@/features/legal-intelligence/LegalPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { Placeholder } from "@/routes/Placeholder";

const queryClient = new QueryClient();

const pages: [string, string, string][] = [
  ["/people", "People", "Lawyers, workload and availability (Sprint 3)."],
  ["/tasks", "Tasks & Calendar", "Tasks, hearings, meetings (Sprint 3)."],
  ["/analytics", "Analytics", "Firm, legal and AI analytics (Sprint 5)."],
];

/** UX guard only; the server enforces RBAC on every admin endpoint. */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role_name !== "admin") {
    return <Placeholder title="Admins only" hint="Ask your firm admin if you need access to user management." />;
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
              <Route path="/matters" element={<MattersPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/matters/:id" element={<MatterDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/legal" element={<LegalPage />} />
              <Route path="/admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
              {pages.map(([path, title, hint]) => (
                <Route key={path} path={path} element={<Placeholder title={title} hint={hint} />} />
              ))}
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
