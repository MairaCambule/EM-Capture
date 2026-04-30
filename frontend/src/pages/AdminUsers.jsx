import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { supabase } from "../supabaseClient";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminUsers() {
    //onst [users, setUsers] = useState([]);
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const [filterText, setFilterText] = useState("");
  const [filterRole, setFilterRole] = useState("");

  const [selectedUser, setSelectedUser] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    jobTitle: "",
    department: "",
    role: "user",
  });

  useEffect(() => {
  const loadUsers = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await axios.get(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      console.log("USERS API:", response.data);

      setUsers(response.data.users || []);
    } catch (err) {
      console.error("Erro ao carregar utilizadores:", err);
    }
  };

  loadUsers();
}, []);
  
  async function apiGet(path) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await axios.get(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });

    return response.data;
  }

  async function apiPost(path, body) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await axios.post(`${API_BASE_URL}${path}`, body, {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
      },
    });

    return response.data;
  }

  async function loadUsers() {
    try {
      setLoading(true);
      setMsg(null);

      const data = await apiGet("/api/admin/users");
      setUsers(data.users || []);
    } catch (error) {
      console.error("Erro ao carregar utilizadores:", error);
      setMsg({
        type: "error",
        text:
          error.response?.data?.error ||
          "Erro ao carregar utilizadores. Verifica se tens permissão.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function openEditDrawer(user) {
    setSelectedUser(user);
    setForm({
      fullName: user.full_name || "",
      phone: user.phone || "",
      jobTitle: user.job_title || "",
      department: user.department || "",
      role: user.role || "user",
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedUser(null);
  }

  async function saveUser() {
    if (!selectedUser) return;

    try {
      setSaving(true);
      setMsg(null);

      await apiPost("/api/admin/users/update", {
        userId: selectedUser.id,
        fullName: form.fullName,
        phone: form.phone,
        jobTitle: form.jobTitle,
        department: form.department,
        role: form.role,
      });

      setMsg({
        type: "success",
        text: "Utilizador atualizado com sucesso.",
      });

      await loadUsers();
      closeDrawer();
    } catch (error) {
      console.error("Erro ao atualizar utilizador:", error);
      setMsg({
        type: "error",
        text:
          error.response?.data?.error ||
          "Erro ao atualizar utilizador.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(user) {
    const newPassword = window.prompt(
      `Nova password para ${user.full_name || user.id}:`
    );

    if (!newPassword) return;

    if (newPassword.length < 6) {
      setMsg({
        type: "error",
        text: "A password deve ter pelo menos 6 caracteres.",
      });
      return;
    }

    const confirmAction = window.confirm(
      "Tens a certeza que queres alterar a password deste utilizador?"
    );

    if (!confirmAction) return;

    try {
      setMsg(null);

      await apiPost("/api/admin/users/reset-password", {
        userId: user.id,
        newPassword,
      });

      setMsg({
        type: "success",
        text: "Password alterada com sucesso.",
      });
    } catch (error) {
      console.error("Erro ao alterar password:", error);
      setMsg({
        type: "error",
        text:
          error.response?.data?.error ||
          "Erro ao alterar password.",
      });
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const text = filterText.toLowerCase();

      const matchesText =
        !filterText ||
        String(user.full_name || "").toLowerCase().includes(text) ||
        String(user.id || "").toLowerCase().includes(text) ||
        String(user.phone || "").toLowerCase().includes(text) ||
        String(user.job_title || "").toLowerCase().includes(text) ||
        String(user.department || "").toLowerCase().includes(text);

      const matchesRole = !filterRole || user.role === filterRole;

      return matchesText && matchesRole;
    });
  }, [users, filterText, filterRole]);

  function roleLabel(role) {
    if (role === "global_admin") return "Global Admin";
    if (role === "module_admin") return "Module Admin";
    if (role === "teacher") return "Professor";
    return "User";
  }

  function roleColor(role) {
    if (role === "global_admin") return "#991b1b";
    if (role === "module_admin") return "#7c2d12";
    if (role === "teacher") return "#1e4a8d";
    return "#475569";
  }

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
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <button
          type="button"
          onClick={() => navigate("/app")}
          style={{
            marginBottom: 24,
            border: "none",
            background: "#fff",
            color: "#1e4a8d",
            padding: "10px 16px",
            borderRadius: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
          }}
        >
          ← Voltar à página principal
        </button>

        <div
          style={{
            background: "#fff",
            borderRadius: 28,
            padding: 32,
            boxShadow: "0 24px 70px rgba(15, 23, 42, 0.10)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 20,
              marginBottom: 28,
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
                  fontWeight: 900,
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                ADMINISTRAÇÃO
              </div>

              <h1
                style={{
                  color: "#1e4a8d",
                  margin: 0,
                  fontSize: "2rem",
                }}
              >
                Gestão de utilizadores
              </h1>

              <p style={{ color: "#5f6b7a", marginTop: 8 }}>
                Administração de perfis, dados profissionais e acessos do sistema.
              </p>
            </div>

            <button
              type="button"
              onClick={loadUsers}
              style={{
                background: "#1e4a8d",
                color: "#fff",
                border: "none",
                padding: "12px 18px",
                borderRadius: 14,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Atualizar
            </button>
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
              gridTemplateColumns: "1fr 220px",
              gap: 14,
              marginBottom: 22,
            }}
          >
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Pesquisar por nome, ID, telefone, cargo ou departamento..."
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #dbe3ec",
              }}
            />

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                border: "1px solid #dbe3ec",
                background: "#fff",
              }}
            >
              <option value="">Todos os perfis</option>
              <option value="user">User</option>
              <option value="teacher">Professor</option>
              <option value="module_admin">Module Admin</option>
              <option value="global_admin">Global Admin</option>
            </select>
          </div>

          {loading ? (
            <p style={{ color: "#5f6b7a" }}>A carregar utilizadores...</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  border: "1px solid #e4e9f0",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thStyle}>Utilizador</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Telemóvel</th>
                    <th style={thStyle}>Cargo</th>
                    <th style={thStyle}>Departamento</th>
                    <th style={thStyle}>Perfil</th>
                    <th style={thStyle}>Módulos</th>
                    <th style={thStyle}>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: 20, color: "#5f6b7a" }}>
                        Nenhum utilizador encontrado.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id} style={{ borderTop: "1px solid #e4e9f0" }}>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: "50%",
                                background: "#1e4a8d",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 900,
                              }}
                            >
                              {(user.full_name || "U").charAt(0).toUpperCase()}
                            </div>

                            <div>
                              <div style={{ fontWeight: 900, color: "#17324d" }}>
                                {user.full_name || "Sem nome"}
                              </div>
                              <div style={{ color: "#64748b", fontSize: 12 }}>
                                {user.id}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={tdStyle}>{user.email || "—"}</td>
                        <td style={tdStyle}>{user.phone || "—"}</td>
                        <td style={tdStyle}>{user.job_title || "—"}</td>
                        <td style={tdStyle}>{user.department || "—"}</td>

                        <td style={tdStyle}>
                          <span
                            style={{
                              background: "#eef4fb",
                              color: roleColor(user.role),
                              padding: "6px 10px",
                              borderRadius: 999,
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            {roleLabel(user.role)}
                          </span>
                        </td>

                        <td style={tdStyle}>
                          {(user.modules || []).length === 0 ? (
                            <span style={{ color: "#94a3b8" }}>Sem módulos</span>
                          ) : (
                            user.modules.map((item, index) => (
                              <div key={index} style={{ marginBottom: 4 }}>
                                <strong>
                                  {item.platform_modules?.name ||
                                    item.platform_modules?.code}
                                </strong>{" "}
                                <span style={{ color: "#64748b" }}>
                                  ({item.role})
                                </span>
                              </div>
                            ))
                          )}
                        </td>

                        <td style={tdStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => openEditDrawer(user)}
                              style={smallPrimaryBtn}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => resetPassword(user)}
                              style={smallSecondaryBtn}
                            >
                              Reset password
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {drawerOpen && selectedUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            zIndex: 2000,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={closeDrawer}
        >
          <div
            style={{
              width: "min(520px, 100%)",
              height: "100%",
              background: "#fff",
              padding: 30,
              overflowY: "auto",
              boxShadow: "-20px 0 60px rgba(15, 23, 42, 0.20)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 14,
                marginBottom: 24,
              }}
            >
              <div>
                <h2 style={{ color: "#1e4a8d", margin: 0 }}>
                  Editar utilizador
                </h2>
                <p style={{ color: "#5f6b7a", marginTop: 6 }}>
                  {selectedUser.id}
                </p>
              </div>

              <button
                type="button"
                onClick={closeDrawer}
                style={{
                  border: "none",
                  background: "#eef4fb",
                  color: "#1e4a8d",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Fechar
              </button>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <FormField
                label="Nome"
                value={form.fullName}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, fullName: value }))
                }
              />

              <FormField
                label="Telemóvel"
                value={form.phone}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, phone: value }))
                }
              />

              <FormField
                label="Cargo / Função"
                value={form.jobTitle}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, jobTitle: value }))
                }
              />

              <FormField
                label="Departamento"
                value={form.department}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, department: value }))
                }
              />

              <div>
                <label style={labelStyle}>Perfil global</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, role: e.target.value }))
                  }
                  style={inputStyle}
                >
                  <option value="user">User</option>
                  <option value="teacher">Professor</option>
                  <option value="module_admin">Module Admin</option>
                  <option value="global_admin">Global Admin</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                style={{
                  background: "#1e4a8d",
                  color: "#fff",
                  border: "none",
                  padding: "12px 18px",
                  borderRadius: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "A guardar..." : "Guardar alterações"}
              </button>

              <button
                type="button"
                onClick={() => resetPassword(selectedUser)}
                style={{
                  background: "#fff",
                  color: "#1e4a8d",
                  border: "1px solid #dbe3ec",
                  padding: "12px 18px",
                  borderRadius: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Reset password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "14px 16px",
  color: "#17324d",
  fontWeight: 900,
  fontSize: 13,
};

const tdStyle = {
  padding: "14px 16px",
  color: "#17324d",
  verticalAlign: "top",
};

const labelStyle = {
  display: "block",
  color: "#17324d",
  fontWeight: 800,
  marginBottom: 8,
};

const inputStyle = {
  width: "100%",
  padding: "13px 15px",
  borderRadius: 14,
  border: "1px solid #dbe3ec",
  fontSize: 14,
};

const smallPrimaryBtn = {
  background: "#1e4a8d",
  color: "#fff",
  border: "none",
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};

const smallSecondaryBtn = {
  background: "#fff",
  color: "#1e4a8d",
  border: "1px solid #dbe3ec",
  padding: "8px 12px",
  borderRadius: 10,
  fontWeight: 800,
  cursor: "pointer",
};