import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

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
      setMsg({ type: "error", text: "Erro ao carregar perfil." });
      return;
    }

    setProfile(data);
    setFullName(data.full_name || "");
    setPhone(data.phone || "");
    setJobTitle(data.job_title || "");
    setDepartment(data.department || "");
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function handleSaveProfile() {
    try {
      setLoading(true);
      setMsg(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Sessão expirada.");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          job_title: jobTitle,
          department,
        })
        .eq("id", user.id);

      if (error) throw error;

      setMsg({ type: "success", text: "Perfil atualizado com sucesso." });
      await loadProfile();
    } catch (error) {
      console.error(error);
      setMsg({ type: "error", text: "Erro ao atualizar perfil." });
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    const newPassword = window.prompt("Insere a nova password:");

    if (!newPassword) return;

    if (newPassword.length < 6) {
      setMsg({
        type: "error",
        text: "A password deve ter pelo menos 6 caracteres.",
      });
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setMsg({ type: "error", text: "Erro ao alterar password." });
    } else {
      setMsg({ type: "success", text: "Password alterada com sucesso." });
    }
  }

  const inputStyle = {
    width: "100%",
    marginTop: 8,
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid #dbe3ec",
    fontSize: 14,
  };

  const disabledInputStyle = {
    ...inputStyle,
    background: "#f8fafc",
    color: "#5f6b7a",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f4f7fb 0%, #eef4fb 100%)",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 28,
          padding: 36,
          boxShadow: "0 24px 70px rgba(15, 23, 42, 0.10)",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/app")}
          style={{
            marginBottom: 28,
            border: "none",
            background: "#eef4fb",
            color: "#1e4a8d",
            padding: "10px 16px",
            borderRadius: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← Voltar à página principal
        </button>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            alignItems: "center",
            marginBottom: 30,
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                background: "#e8f1fb",
                color: "#1e4a8d",
                padding: "8px 14px",
                borderRadius: 999,
                fontWeight: 800,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              PERFIL DE UTILIZADOR
            </div>

            <h1 style={{ color: "#1e4a8d", margin: 0, fontSize: "2rem" }}>
              Meu perfil
            </h1>

            <p style={{ color: "#5f6b7a", marginTop: 8 }}>
              Consulta e atualiza os teus dados pessoais e profissionais.
            </p>
          </div>

          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: "50%",
              background: "#1e4a8d",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            {(fullName || email || "U").charAt(0).toUpperCase()}
          </div>
        </div>

        {msg && (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 14,
              marginBottom: 22,
              background: msg.type === "success" ? "#ecfdf3" : "#fef2f2",
              color: msg.type === "success" ? "#166534" : "#991b1b",
              fontWeight: 700,
            }}
          >
            {msg.text}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 20,
          }}
        >
          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>Nome</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={inputStyle}
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>Email</label>
            <input value={email} disabled style={disabledInputStyle} />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>
              Telemóvel
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
              placeholder="+351 ..."
            />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>
              Cargo / Função
            </label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              style={inputStyle}
              placeholder="Ex: Professor, Médico, Administrador..."
            />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>
              Departamento
            </label>
            <input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              style={inputStyle}
              placeholder="Ex: Clínica Dentária"
            />
          </div>

          <div>
            <label style={{ fontWeight: 700, color: "#17324d" }}>Perfil</label>
            <input value={profile?.role || ""} disabled style={disabledInputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 32 }}>
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={loading}
            style={{
              background: "#1e4a8d",
              color: "#fff",
              border: "none",
              padding: "13px 20px",
              borderRadius: 14,
              fontWeight: 800,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
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
              padding: "13px 20px",
              borderRadius: 14,
              fontWeight: 800,
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