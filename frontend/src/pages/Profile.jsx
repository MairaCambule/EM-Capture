import { useEffect, useState } from "react";
//import { supabase } from "../lib/supabaseClient";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setEmail(user.email || "");

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      console.error("Erro ao carregar perfil:", error);
      return;
    }

    setProfile(data);
    setFullName(data.full_name || "");
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function handleSaveProfile() {
    try {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("Sessão expirada. Faz login novamente.");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
        })
        .eq("id", user.id);

      if (error) throw error;

      alert("Perfil atualizado com sucesso.");
      await loadProfile();
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      alert("Erro ao atualizar perfil.");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    const newPassword = window.prompt("Insere a nova password:");

    if (!newPassword) return;

    if (newPassword.length < 6) {
      alert("A password deve ter pelo menos 6 caracteres.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error("Erro ao alterar password:", error);
      alert("Erro ao alterar password.");
      return;
    }

    alert("Password alterada com sucesso.");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 20px 60px rgba(15, 23, 42, 0.08)",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/app/capture")}
          style={{
            marginBottom: 24,
            border: "none",
            background: "#eef4fb",
            color: "#1e4a8d",
            padding: "10px 16px",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← Voltar ao EM Capture
        </button>

        <h1 style={{ color: "#1e4a8d", marginBottom: 8 }}>Meu perfil</h1>

        <p style={{ color: "#5f6b7a", marginBottom: 28 }}>
          Consulta e atualiza os teus dados de utilizador.
        </p>

        <div style={{ display: "grid", gap: 18 }}>
          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>Nome</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome completo"
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #dbe3ec",
              }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>Email</label>
            <input
              value={email}
              disabled
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #dbe3ec",
                background: "#f8fafc",
              }}
            />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>Perfil</label>
            <input
              value={profile?.role || ""}
              disabled
              style={{
                width: "100%",
                marginTop: 8,
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #dbe3ec",
                background: "#f8fafc",
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 28,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={loading}
            style={{
              background: "#1e4a8d",
              color: "#fff",
              border: "none",
              padding: "12px 18px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading ? "A guardar..." : "Guardar alterações"}
          </button>

          <button
            type="button"
            onClick={handleChangePassword}
            style={{
              background: "#fff",
              color: "#1e4a8d",
              border: "1px solid #dbe3ec",
              padding: "12px 18px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Alterar password
          </button>
        </div>
      </div>
    </div>
  );
}