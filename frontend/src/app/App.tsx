import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { AuthProvider, useAuth } from "@/features/auth/AuthContext";
import { AccountPage } from "@/features/account/AccountPage";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { MatterDetail } from "@/features/matters/MatterDetail";
import { MattersPage } from "@/features/matters/MattersPage";
import { AISettingsPage } from "@/features/settings/AISettingsPage";
import { Placeholder } from "@/routes/Placeholder";

const queryClient = new QueryClient();

const pages: [string, string, string][] = [
  ["/", "Dashboard", "Action center: today's work and AI alerts (Sprint 3)."],
  ["/people", "People", "Lawyers, workload and availability (Sprint 3)."],
  ["/tasks", "Tasks & Calendar", "Tasks, hearings, meetings (Sprint 3)."],
  ["/legal", "Legal Intelligence", "eCourts developments matched to matters (Sprint 2)."],
  ["/analytics", "Analytics", "Firm, legal and AI analytics (Sprint 5)."],
];

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
            <Route element={<Protected />}>
              <Route path="/matters" element={<MattersPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/matters/:id" element={<MatterDetail />} />
              <Route path="/settings" element={<AISettingsPage />} />
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
