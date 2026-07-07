import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase, setPortalSupabaseAccessToken, clearPortalSupabaseAccessToken } from "./supabaseClient";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Capture from "./pages/Capture";
import Profile from "./pages/Profile";
import AdminUsers from "./pages/AdminUsers";

const API_BASE_URL = import.meta.env.VITE_API_URL;

function isEmbeddedPortalMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("portal") === "1" || window.self !== window.top;
}

function PrivateRoute({ session, children }) {
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const portalMode = useMemo(() => isEmbeddedPortalMode(), []);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalMsg, setPortalMsg] = useState(
    "A aguardar autenticação do PortalSmart..."
  );

  useEffect(() => {
    if (portalMode) return;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session || null);
      setLoading(false);
    });

    const { data: subscriptionData } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
      }
    );

    return () => {
      active = false;
      subscriptionData?.subscription?.unsubscribe?.();
    };
  }, [portalMode]);

  useEffect(() => {
    if (!portalMode) return;

    let cancelled = false;

    async function loginWithPortalSmart(firebaseToken) {
      try {
        setPortalMsg("A validar sessão do PortalSmart...");

        if (!API_BASE_URL) {
          throw new Error("VITE_API_URL não está configurado no frontend.");
        }

        const response = await fetch(`${API_BASE_URL}/api/auth/portal-login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${firebaseToken}`,
          },
          body: JSON.stringify({ moduleCode: "em_capture" }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            data?.error || "Não foi possível validar o acesso ao EM Capture."
          );
        }

        if (!data?.session?.access_token || !data?.session?.user?.id) {
          throw new Error(
            "O backend não devolveu uma sessão válida para o EM Capture."
          );
        }

        if (cancelled) return;

        setPortalSupabaseAccessToken(data.session.access_token);

        setSession({
          access_token: data.session.access_token,
          expires_at: data.session.expires_at,
          auth_provider: "portalsmart",
          portal_profile: data.portalProfile || null,
          em_capture_role: data.emCaptureRole || null,
          user: {
            id: data.session.user.id,
            email: data.session.user.email,
            user_metadata: {
              full_name: data.session.user.full_name || data.session.user.email,
            },
          },
        });

        setLoading(false);
      } catch (error) {
        console.error("PORTALSMART LOGIN ERROR:", error);
        clearPortalSupabaseAccessToken();
        setSession(null);
        setPortalMsg(error.message || "Erro ao validar sessão do PortalSmart.");
        setLoading(false);
      }
    }

    function handleMessage(event) {
      const payload = event.data || {};
      if (payload.type !== "PORTALSMART_AUTH") return;

      const token = payload.firebaseToken || payload.token || payload.idToken;

      if (!token) {
        setPortalMsg("O PortalSmart não enviou um token de autenticação válido.");
        setLoading(false);
        return;
      }

      loginWithPortalSmart(token);
    }

    window.addEventListener("message", handleMessage);
    window.parent?.postMessage({ type: "EM_CAPTURE_READY" }, "*");

    const retry = window.setInterval(() => {
      window.parent?.postMessage({ type: "EM_CAPTURE_READY" }, "*");
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(retry);
      window.removeEventListener("message", handleMessage);
    };
  }, [portalMode]);

  if (loading) {
    return <div style={{ padding: 24 }}>{portalMode ? portalMsg : "A carregar..."}</div>;
  }

  if (portalMode && !session) {
    return (
      <div style={{ padding: 32, maxWidth: 720, margin: "40px auto" }}>
        <h2 style={{ color: "#1e4a8d" }}>Não foi possível abrir o EM Capture</h2>
        <p style={{ color: "#5f6b7a" }}>{portalMsg}</p>
        <button
          type="button"
          onClick={() =>
            window.parent?.postMessage({ type: "EM_CAPTURE_READY" }, "*")
          }
          style={{
            background: "#1e4a8d",
            color: "#fff",
            border: "none",
            padding: "12px 18px",
            borderRadius: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/app" replace /> : <Login />}
      />

      <Route
        path="/app/profile"
        element={
          <PrivateRoute session={session}>
            <Profile />
          </PrivateRoute>
        }
      />

      <Route
        path="/app/admin/users"
        element={
          <PrivateRoute session={session}>
            <AdminUsers />
          </PrivateRoute>
        }
      />

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

      <Route
        path="*"
        element={
          <Navigate
            to={portalMode ? "/app/capture" : session ? "/app" : "/login"}
            replace
          />
        }
      />
    </Routes>
  );
}
