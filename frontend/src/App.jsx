import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Capture from "./pages/Capture";
import Profile from "./pages/Profile";
import AdminUsers from "./pages/AdminUsers";

function PrivateRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div style={{ padding: 24 }}>A carregar...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/app" replace /> : <Login />} />
        <Route path="/app/profile" element={<Profile />} />
        <Route path="/app/admin/users" element={<AdminUsers />} />

        <Route
          path="/app"
          element={
            <PrivateRoute session={session}>
              <Dashboard session={session} />
            </PrivateRoute>
          }
        />

        <Route
          path="/app/capture"
          element={
            <PrivateRoute session={session}>
              <Capture session={session} />
            </PrivateRoute>
          }
        />

        <Route path="*" element={<Navigate to={session ? "/app" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}