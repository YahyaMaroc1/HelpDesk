import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { RequireAdmin } from "./components/RequireAdmin.tsx";
import { RequireAuth } from "./components/RequireAuth.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { TicketDetailPage } from "./pages/TicketDetailPage.tsx";
import { TicketsPage } from "./pages/TicketsPage.tsx";
import { UsersPage } from "./pages/UsersPage.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
