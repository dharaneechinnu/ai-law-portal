import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { Placeholder } from "@/routes/Placeholder";

const queryClient = new QueryClient();

const pages: [string, string, string][] = [
  ["/", "Dashboard", "Action center: today's work and AI alerts (Sprint 3)."],
  ["/matters", "Matters", "Matter workspace and documents (Sprint 1)."],
  ["/people", "People", "Lawyers, workload and availability (Sprint 3)."],
  ["/tasks", "Tasks & Calendar", "Tasks, hearings, meetings (Sprint 3)."],
  ["/legal", "Legal Intelligence", "eCourts developments matched to matters (Sprint 2)."],
  ["/analytics", "Analytics", "Firm, legal and AI analytics (Sprint 5)."],
  ["/settings", "Settings", "AI providers, integrations, agent permissions (Sprint 5)."],
  ["/account", "Account", "Profile and preferences (Sprint 1)."],
];

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {pages.map(([path, title, hint]) => (
              <Route key={path} path={path} element={<Placeholder title={title} hint={hint} />} />
            ))}
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
