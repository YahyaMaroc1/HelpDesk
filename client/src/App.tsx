import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { RequireAuth } from "./components/RequireAuth.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
