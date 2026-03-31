import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import emLogo from "../assets/em-logo.png";
import { supabase } from "../supabaseClient";

export default function Dashboard({ session }) {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [modules, setModules] = useState([]);
  const [moduleAccess, setModuleAccess] = useState([]);
  const [loading, setLoading] = useState(true);

  async function logout() {
    await supabase.auth.signOut();
  }

  useEffect(() => {
    async function loadDashboardData() {
      try {
        setLoading(true);

        const userId = session?.user?.id;
        if (!userId) return;

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (profileError) {
          console.error("Erro ao carregar perfil:", profileError);
        } else {
          setProfile(profileData);
        }

        const { data: allModules, error: modulesError } = await supabase
          .from("platform_modules")
          .select("*")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (modulesError) {
          console.error("Erro ao carregar módulos:", modulesError);
        } else {
          setModules(allModules || []);
        }

        const { data: accessData, error: accessError } = await supabase
          .from("user_module_access")
          .select(`
            id,
            role,
            module_id,
            platform_modules (
              id,
              code,
              name,
              description,
              is_active
            )
          `)
          .eq("user_id", userId);

        if (accessError) {
          console.error("Erro ao carregar acessos do utilizador:", accessError);
        } else {
          setModuleAccess(accessData || []);
        }
      } catch (error) {
        console.error("Erro no dashboard:", error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [session]);

  const isGlobalAdmin = profile?.role === "global_admin";

  const visibleModules = useMemo(() => {
    if (isGlobalAdmin) {
      return modules.map((module) => ({
        ...module,
        accessRole: "global_admin",
      }));
    }

    return moduleAccess
      .filter((item) => item.platform_modules?.is_active)
      .map((item) => ({
        ...item.platform_modules,
        accessRole: item.role,
      }));
  }, [isGlobalAdmin, modules, moduleAccess]);

function openModule(moduleCode) {
  if (moduleCode === "em_capture") {
    navigate("/app/capture");
    return;
  }

  if (moduleCode === "auditorios") {
    window.open("https://controlo-auditorios.web.app/", "_blank");
    return;
  }
}

  function getRoleLabel(role) {
    switch (role) {
      case "global_admin":
        return "Admin global";
      case "module_admin":
        return "Admin do módulo";
      default:
        return "Utilizador";
    }
  }

  return (
    <div className="app-shell">
      <div className="top-actions">
        <div className="user-meta">
          <div className="user-email">{session.user.email}</div>
          <div style={{ color: "#5f6b7a", fontSize: "0.95rem", marginTop: 4 }}>
            {isGlobalAdmin ? "Admin global" : "Sessão iniciada"}
          </div>
        </div>

        <button className="secondary-btn" onClick={logout}>
          Sair
        </button>
      </div>

      <section
        className="dashboard-hero"
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 0.7fr",
          gap: 24,
          marginBottom: 28,
        }}
      >
        <div
          className="card"
          style={{
            padding: "34px 36px",
            background: "linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)",
          }}
        >
          <div
            className="badge"
            style={{
              width: "fit-content",
              marginBottom: 18,
              background: "#efe6d6",
              color: "#c7952d",
              fontWeight: 800,
            }}
          >
            PLATAFORMA INSTITUCIONAL
          </div>

          <h1
            style={{
              margin: 0,
              color: "#1e4a8d",
              fontSize: "3rem",
              lineHeight: 1.05,
              fontWeight: 800,
            }}
          >
            Plataforma Egas Moniz
          </h1>

          <p
            style={{
              marginTop: 18,
              marginBottom: 0,
              color: "#5f6b7a",
              fontSize: "1.15rem",
              maxWidth: 840,
            }}
          >
            Ambiente digital preparado para integrar módulos clínicos,
            académicos e operacionais, com uma estrutura escalável para
            diferentes contextos de utilização.
          </p>
        </div>

        <div
          className="card"
          style={{
            minHeight: 260,
            padding: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#1e4a8d",
          }}
        >
          <img
            src={emLogo}
            alt="Egas Moniz"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              padding: "30px",
              background: "#1e4a8d",
            }}
          />
        </div>
      </section>

      <section
        className="card"
        style={{
          padding: 26,
          marginBottom: 28,
          background: "linear-gradient(180deg, #ffffff 0%, #fbfcff 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#1e4a8d",
                fontSize: "1.8rem",
              }}
            >
              Módulos disponíveis
            </h2>

            <p style={{ margin: "8px 0 0 0", color: "#5f6b7a" }}>
              Acede rapidamente aos módulos permitidos para o teu perfil.
            </p>
          </div>
        </div>

        {loading ? (
          <p>A carregar módulos...</p>
        ) : visibleModules.length === 0 ? (
          <p>Não tens módulos atribuídos neste momento.</p>
        ) : (
          <div className="modules-grid">
            {visibleModules.map((module) => (
              <div key={module.id} className="module-card">
                <div
                  style={{
                    display: "inline-block",
                    marginBottom: 12,
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "#e8f2fd",
                    color: "#1e4a8d",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}
                >
                  {getRoleLabel(module.accessRole)}
                </div>

                <h3>{module.name}</h3>
                <p>{module.description}</p>

                <button
  className="primary-btn"
  onClick={() => openModule(module.code)}
  disabled={!["em_capture", "auditorios"].includes(module.code)}
>
  {["em_capture", "auditorios"].includes(module.code) ? "Abrir" : "Brevemente"}
</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="site-footer">
        <div>
          <strong>Plataforma Egas Moniz</strong>
          <div>Desenvolvido por GSI</div>
        </div>

        <div>
          <strong>Suporte</strong>
          <div>atendimentogsi@egasmoniz.edu.pt</div>
          <div>Uso institucional e académico</div>
        </div>
      </footer>
    </div>
  );
}