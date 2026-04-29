import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const PHOTO_BUCKET = "clinical-photos";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing env vars. Check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY"
  );
}

const supabaseAdmin = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const supabaseAuth = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : null;
}

function getAuthedSupabase(req) {
  const token = getBearerToken(req);

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function canAdminEmCapture(userId) {
  const { data: profileData } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileData?.role === "global_admin") return true;

  const { data: moduleAccess } = await supabaseAdmin
    .from("user_module_access")
    .select(`
      role,
      platform_modules (
        code
      )
    `)
    .eq("user_id", userId);

  return (moduleAccess || []).some(
    (item) =>
      item.role === "module_admin" &&
      item.platform_modules?.code === "em_capture"
  );
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ error: "Invalid token" });
  }
}

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/queue/join", requireAuth, async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const supabaseUser = getAuthedSupabase(req);

    const { data, error } = await supabaseUser.rpc("queue_join", {
      p_camera_id: cameraId,
    });

    if (error) {
      console.error("QUEUE JOIN RPC ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ queueEntryId: data });
  } catch (err) {
    console.error("QUEUE JOIN ERROR:", err);
    return res.status(500).json({ error: "Erro interno ao entrar na fila." });
  }
});

app.post("/api/queue/cancel", requireAuth, async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const supabaseUser = getAuthedSupabase(req);

    const { data, error } = await supabaseUser.rpc("queue_cancel", {
      p_camera_id: cameraId,
    });

    if (error) {
      console.error("QUEUE CANCEL RPC ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ cancelled: data });
  } catch (err) {
    console.error("QUEUE CANCEL ERROR:", err);
    return res.status(500).json({ error: "Erro interno ao cancelar fila." });
  }
});

app.post("/api/queue/expire-turn", requireAuth, async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const supabaseUser = getAuthedSupabase(req);

    const { data, error } = await supabaseUser.rpc("auto_expire_turn", {
      p_camera_id: cameraId,
    });

    if (error) {
      console.error("EXPIRE TURN RPC ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ expired: data });
  } catch (err) {
    console.error("EXPIRE TURN ERROR:", err);
    return res.status(500).json({ error: "Erro interno ao expirar turno." });
  }
});

app.post("/api/queue/sync", requireAuth, async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const supabaseUser = getAuthedSupabase(req);

    const { data, error } = await supabaseUser.rpc("sync_queue_state", {
      p_camera_id: cameraId,
    });

    if (error) {
      console.error("SYNC QUEUE RPC ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ result: data });
  } catch (err) {
    console.error("SYNC QUEUE ERROR:", err);
    return res.status(500).json({ error: "Erro interno ao sincronizar fila." });
  }
});

app.post("/api/session/start", requireAuth, async (req, res) => {
  try {
    const { cameraId, patientCode, box } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId é obrigatório." });
    }

    if (!patientCode) {
      return res.status(400).json({ error: "patientCode é obrigatório." });
    }

    if (!box) {
      return res.status(400).json({ error: "box é obrigatória." });
    }

    const userId = req.user.id;

    const { data: state, error: stateError } = await supabaseAdmin
      .from("camera_state")
      .select("*")
      .eq("camera_id", cameraId)
      .single();

    if (stateError || !state) {
      return res
        .status(500)
        .json({ error: "Erro ao obter estado da câmara." });
    }

    if (state.status !== "reserved") {
      return res.status(400).json({ error: "A câmara não está reservada." });
    }

    if (state.current_user_id !== userId) {
      return res.status(403).json({ error: "Não é a tua vez." });
    }

    const { data: queueEntry, error: queueError } = await supabaseAdmin
      .from("queue_entries")
      .select("*")
      .eq("camera_id", cameraId)
      .eq("user_id", userId)
      .eq("status", "notified")
      .order("notified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queueError || !queueEntry) {
      return res
        .status(400)
        .json({ error: "Entrada da fila não encontrada." });
    }

    if (
      !queueEntry.expires_at ||
      new Date(queueEntry.expires_at) < new Date()
    ) {
      return res.status(400).json({ error: "O turno expirou." });
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .insert({
        camera_id: cameraId,
        user_id: userId,
        patient_code: patientCode,
        box,
        status: "open",
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError || !sessionData) {
      console.error("SESSION INSERT ERROR:", sessionError);
      return res.status(500).json({ error: "Erro ao criar sessão." });
    }

    const { error: queueUpdateError } = await supabaseAdmin
      .from("queue_entries")
      .update({
        status: "served",
        served_at: new Date().toISOString(),
      })
      .eq("id", queueEntry.id);

    if (queueUpdateError) {
      console.error("QUEUE UPDATE ERROR:", queueUpdateError);
      return res.status(500).json({ error: "Erro ao atualizar fila." });
    }

    const { data: updatedState, error: cameraUpdateError } = await supabaseAdmin
      .from("camera_state")
      .update({
        status: "in_use",
        current_user_id: userId,
        current_box: box,
        current_session_id: sessionData.id,
        current_session_started_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("camera_id", cameraId)
      .select()
      .single();

    if (cameraUpdateError) {
      console.error("CAMERA UPDATE ERROR:", cameraUpdateError);
      return res
        .status(500)
        .json({ error: "Erro ao atualizar estado da câmara." });
    }

    await supabaseAdmin.from("audit_events").insert({
      actor_user_id: userId,
      camera_id: cameraId,
      session_id: sessionData.id,
      type: "START_SESSION",
      payload: {
        patient_code: patientCode,
        box,
      },
    });

    return res.json({
      started: true,
      sessionId: sessionData.id,
      cameraState: updatedState,
    });
  } catch (err) {
    console.error("START SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
});

app.post("/api/session/pause", requireAuth, async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const supabaseUser = getAuthedSupabase(req);

    const { data, error } = await supabaseUser.rpc("pause_session", {
      p_camera_id: cameraId,
    });

    if (error) {
      console.error("PAUSE SESSION RPC ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ paused: data });
  } catch (error) {
    console.error("PAUSE SESSION ERROR:", error);
    return res.status(500).json({
      error: error.message || "Erro ao pausar sessão.",
    });
  }
});

app.post("/api/session/resume", requireAuth, async (req, res) => {
  try {
    const { cameraId, sessionId } = req.body;
    const userId = req.user.id;

    if (!cameraId || !sessionId) {
      return res
        .status(400)
        .json({ error: "cameraId and sessionId are required" });
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    if (sessionData.user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Não tens permissão para retomar esta sessão." });
    }

    if (sessionData.status !== "paused") {
      return res.status(400).json({ error: "A sessão não está pausada." });
    }

    const { data: cameraState, error: cameraError } = await supabaseAdmin
      .from("camera_state")
      .select("*")
      .eq("camera_id", cameraId)
      .single();

    if (cameraError || !cameraState) {
      return res
        .status(404)
        .json({ error: "Estado da câmara não encontrado." });
    }

    if (
      cameraState.status !== "reserved" ||
      cameraState.current_user_id !== userId
    ) {
      return res.status(400).json({
        error: "A câmara não está reservada para este utilizador.",
      });
    }

    const { error: resumeSessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .update({
        status: "open",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (resumeSessionError) {
      return res.status(400).json({ error: resumeSessionError.message });
    }

    const { error: updateCameraError } = await supabaseAdmin
      .from("camera_state")
      .update({
        status: "in_use",
        current_user_id: userId,
        current_session_id: sessionId,
        current_box: sessionData.box || null,
        current_session_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("camera_id", cameraId);

    if (updateCameraError) {
      return res.status(400).json({ error: updateCameraError.message });
    }

    await supabaseAdmin
      .from("queue_entries")
      .update({
        status: "served",
        served_at: new Date().toISOString(),
      })
      .eq("camera_id", cameraId)
      .eq("user_id", userId)
      .eq("status", "notified");

    return res.json({
      resumed: true,
      sessionId,
    });
  } catch (err) {
    console.error("RESUME SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro ao retomar sessão." });
  }
});

app.post("/api/session/stop", requireAuth, async (req, res) => {
  try {
    const { cameraId } = req.body;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const { data: cameraState, error: cameraError } = await supabaseAdmin
      .from("camera_state")
      .select("*")
      .eq("camera_id", cameraId)
      .single();

    if (cameraError || !cameraState) {
      return res
        .status(404)
        .json({ error: "Estado da câmara não encontrado." });
    }

    const currentSessionId = cameraState.current_session_id;

    const { data: sessionPhotos, error: photosError } = await supabaseAdmin
      .from("session_photos")
      .select("id")
      .eq("session_id", currentSessionId);

    if (photosError) {
      return res.status(400).json({ error: photosError.message });
    }

    if (!sessionPhotos || sessionPhotos.length === 0) {
      return res.status(400).json({
        error: "Não é possível concluir a sessão sem fotografias associadas.",
      });
    }

    const supabaseUser = getAuthedSupabase(req);

    const { data, error } = await supabaseUser.rpc("stop_session", {
      p_camera_id: cameraId,
    });

    if (error) {
      console.error("STOP SESSION RPC ERROR:", error);
      return res.status(400).json({ error: error.message });
    }

    return res.json({ stopped: data });
  } catch (err) {
    console.error("STOP SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro ao concluir sessão." });
  }
});

console.log("✅ Rota /api/photos/ingest carregada");

app.post(
  "/api/photos/ingest",
  upload.single("photo"),
  async (req, res) => {
    console.log("🔥 REQUEST RECEBIDO EM /api/photos/ingest");
    try {
      const { cameraId, phase = "during" } = req.body;
      const file = req.file;

      if (!cameraId) {
        return res.status(400).json({ error: "cameraId is required" });
      }

      if (!file) {
        return res.status(400).json({ error: "photo file is required" });
      }

      const { data: cameraState, error: cameraError } = await supabaseAdmin
        .from("camera_state")
        .select("*")
        .eq("camera_id", cameraId)
        .single();

      if (cameraError || !cameraState) {
        return res
          .status(404)
          .json({ error: "Estado da câmara não encontrado." });
      }

      if (
        cameraState.status !== "in_use" ||
        !cameraState.current_session_id ||
        !cameraState.current_user_id
      ) {
        return res.status(400).json({
          error: "Não existe sessão ativa para esta câmara.",
        });
      }

      const sessionId = cameraState.current_session_id;
      const userId = cameraState.current_user_id;

      const fileExt = file.originalname.split(".").pop() || "jpg";
      const safePhase = ["before", "during", "after"].includes(phase)
        ? phase
        : "during";

      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${fileExt}`;

      const storagePath = `${sessionId}/${safePhase}/${fileName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        return res.status(400).json({ error: uploadError.message });
      }

      const { data: photoRow, error: insertError } = await supabaseAdmin
        .from("session_photos")
        .insert({
          session_id: sessionId,
          camera_id: cameraId,
          user_id: userId,
          phase: safePhase,
          storage_path: storagePath,
          captured_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        return res.status(400).json({ error: insertError.message });
      }

      return res.json({
        ingested: true,
        photoId: photoRow.id,
        sessionId,
        storagePath,
      });
    } catch (error) {
      console.error("PHOTO INGEST ERROR:", error);
      return res
        .status(500)
        .json({ error: "Erro interno ao ingerir fotografia." });
    }
  }
);

app.post("/api/camera/phase", requireAuth, async (req, res) => {
  try {
    const { cameraId, phase } = req.body;

    if (!cameraId || !phase) {
      return res.status(400).json({ error: "cameraId and phase are required" });
    }

    if (!["before", "during", "after"].includes(phase)) {
      return res.status(400).json({ error: "Fase inválida." });
    }

    const { error } = await supabaseAdmin
      .from("camera_state")
      .update({
        current_phase: phase,
        updated_at: new Date().toISOString(),
      })
      .eq("camera_id", cameraId);

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ updated: true, phase });
  } catch (err) {
    console.error("UPDATE PHASE ERROR:", err);
    return res.status(500).json({ error: "Erro ao atualizar fase." });
  }
});

app.get("/api/camera/active-session", async (req, res) => {
  try {
    const { cameraId } = req.query;

    if (!cameraId) {
      return res.status(400).json({ error: "cameraId is required" });
    }

    const { data: cameraState, error: cameraError } = await supabaseAdmin
      .from("camera_state")
      .select("*")
      .eq("camera_id", cameraId)
      .single();

    if (cameraError || !cameraState) {
      return res.status(404).json({ error: "Câmara não encontrada." });
    }

    if (cameraState.status !== "in_use" || !cameraState.current_session_id) {
      return res.json({
        hasActiveSession: false,
      });
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("*")
      .eq("id", cameraState.current_session_id)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    return res.json({
      hasActiveSession: true,
      sessionId: sessionData.id,
      userId: sessionData.user_id,
      cameraStatus: cameraState.status,
      currentPhase: cameraState.current_phase || "during",
    });
  } catch (err) {
    console.error("ACTIVE SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro ao obter sessão ativa." });
  }
});


app.post("/api/session/update", requireAuth, async (req, res) => {
  try {
    const { sessionId, box, patientCode } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId é obrigatório." });
    }

    // 🔍 Buscar sessão
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    // 🔒 Segurança: só o dono pode editar
    if (sessionData.user_id !== userId) {
      return res.status(403).json({ error: "Sem permissão para editar esta sessão." });
    }

    // 🔒 Só pode editar se estiver ativa ou pausada
    if (!["open", "paused"].includes(sessionData.status)) {
      return res.status(400).json({
        error: "Só é possível editar sessões ativas ou pausadas.",
      });
    }

    // 🧠 Atualizar sessão
    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from("clinical_sessions")
      .update({
        box: box || sessionData.box,
        patient_code: patientCode || sessionData.patient_code,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError) {
      return res.status(400).json({ error: updateError.message });
    }

    // 🔄 Atualizar também o estado da câmara
    await supabaseAdmin
      .from("camera_state")
      .update({
        current_box: box || sessionData.box,
        updated_at: new Date().toISOString(),
      })
      .eq("camera_id", sessionData.camera_id);

    // 🧾 Auditoria (MUITO IMPORTANTE 👇)
    await supabaseAdmin.from("audit_events").insert({
      actor_user_id: userId,
      camera_id: sessionData.camera_id,
      session_id: sessionId,
      type: "UPDATE_SESSION",
      payload: {
        old_box: sessionData.box,
        new_box: box,
        old_patient_code: sessionData.patient_code,
        new_patient_code: patientCode,
      },
    });

    return res.json({
      updated: true,
      session: updatedSession,
    });
  } catch (err) {
    console.error("UPDATE SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro interno ao atualizar sessão." });
  }
});



app.get("/api/teachers", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, role")
      .eq("role", "teacher")
      .order("full_name", { ascending: true });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ teachers: data || [] });
  } catch (err) {
    console.error("GET TEACHERS ERROR:", err);
    return res.status(500).json({ error: "Erro ao obter professores." });
  }
});

app.post("/api/session/assign-teacher", requireAuth, async (req, res) => {
  try {
    const { sessionId, teacherUserId } = req.body;
    const grantedByUserId = req.user.id;

    if (!sessionId || !teacherUserId) {
      return res.status(400).json({
        error: "sessionId and teacherUserId are required",
      });
    }

    const { error } = await supabaseAdmin
      .from("session_record_access")
      .upsert(
        {
          session_id: sessionId,
          teacher_user_id: teacherUserId,
          granted_by_user_id: grantedByUserId,
        },
        {
          onConflict: "session_id,teacher_user_id",
        }
      );

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.json({ assigned: true });
  } catch (err) {
    console.error("ASSIGN TEACHER ERROR:", err);
    return res.status(500).json({ error: "Erro ao associar professor." });
  }
});

app.get("/api/session/:sessionId/teachers", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data, error } = await supabaseAdmin
      .from("session_record_access")
      .select("id, teacher_user_id, granted_by_user_id, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const teacherIds = [
      ...new Set((data || []).map((row) => row.teacher_user_id)),
    ];

    let teachersMap = {};

    if (teacherIds.length > 0) {
      const { data: teacherProfiles, error: teacherProfilesError } =
        await supabaseAdmin
          .from("profiles")
          .select("id, full_name, role")
          .in("id", teacherIds);

      if (teacherProfilesError) {
        return res.status(400).json({ error: teacherProfilesError.message });
      }

      teachersMap = Object.fromEntries(
        (teacherProfiles || []).map((teacher) => [teacher.id, teacher])
      );
    }

    const result = (data || []).map((row) => ({
      ...row,
      teacher: teachersMap[row.teacher_user_id] || null,
    }));

    return res.json({ teachers: result });
  } catch (err) {
    console.error("GET SESSION TEACHERS ERROR:", err);
    return res.status(500).json({ error: "Erro ao obter professores do registo." });
  }
});

app.post("/api/session/remove-teacher", requireAuth, async (req, res) => {
  try {
    const { accessId } = req.body;
    const userId = req.user.id;

    if (!accessId) {
      return res.status(400).json({ error: "accessId é obrigatório." });
    }

    const { data: accessRow, error: accessError } = await supabaseAdmin
      .from("session_record_access")
      .select("id, session_id")
      .eq("id", accessId)
      .single();

    if (accessError || !accessRow) {
      return res.status(404).json({ error: "Acesso não encontrado." });
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("id, user_id")
      .eq("id", accessRow.session_id)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    const isAdmin = await canAdminEmCapture(userId);
    const isOwner = sessionData.user_id === userId;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        error: "Sem permissão para remover este professor.",
      });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("session_record_access")
      .delete()
      .eq("id", accessId);

    if (deleteError) {
      return res.status(400).json({ error: deleteError.message });
    }

    return res.json({ removed: true });
  } catch (err) {
    console.error("REMOVE TEACHER ERROR:", err);
    return res.status(500).json({ error: "Erro ao remover professor." });
  }
});


app.get("/api/teacher/records", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from("session_record_access")
      .select("session_id")
      .eq("teacher_user_id", userId);

    if (accessError) {
      return res.status(400).json({ error: accessError.message });
    }

    const sessionIds = (accessRows || []).map((row) => row.session_id);

    if (sessionIds.length === 0) {
      return res.json({ records: [] });
    }

    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("*")
      .in("id", sessionIds)
      .order("started_at", { ascending: false });

    if (sessionsError) {
      return res.status(400).json({ error: sessionsError.message });
    }

    const userIds = [
      ...new Set(
        (sessions || [])
          .flatMap((s) => [s.user_id, s.archived_by_user_id])
          .filter(Boolean)
      ),
    ];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profilesMap = {};
    (profiles || []).forEach((p) => {
      profilesMap[p.id] = p.full_name || p.id;
    });

    const sessionIdsForPhotos = (sessions || []).map((s) => s.id);

    const { data: photos } = await supabaseAdmin
      .from("session_photos")
      .select("session_id, id")
      .in("session_id", sessionIdsForPhotos);

    const photoCountMap = {};
    (photos || []).forEach((photo) => {
      photoCountMap[photo.session_id] =
        (photoCountMap[photo.session_id] || 0) + 1;
    });

    const records = (sessions || []).map((session) => ({
      ...session,
      user_name: profilesMap[session.user_id] || session.user_id,
      archived_by_name:
        profilesMap[session.archived_by_user_id] || session.archived_by_user_id || null,
      photos_count: photoCountMap[session.id] || 0,
    }));

    return res.json({ records });
  } catch (err) {
    console.error("GET TEACHER RECORDS ERROR:", err);
    return res.status(500).json({ error: "Erro ao carregar registos do professor." });
  }
});


app.get("/api/session/:sessionId/photos", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("id, user_id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    const isOwner = sessionData.user_id === userId;
    const isAdmin = await canAdminEmCapture(userId);

    const { data: accessRow } = await supabaseAdmin
      .from("session_record_access")
      .select("id")
      .eq("session_id", sessionId)
      .eq("teacher_user_id", userId)
      .maybeSingle();

    const hasTeacherAccess = !!accessRow;

    if (!isOwner && !isAdmin && !hasTeacherAccess) {
      return res.status(403).json({ error: "Sem acesso a este registo." });
    }

    const { data: photos, error: photosError } = await supabaseAdmin
      .from("session_photos")
      .select("*")
      .eq("session_id", sessionId)
      .order("captured_at", { ascending: false });

    if (photosError) {
      return res.status(400).json({ error: photosError.message });
    }

    return res.json({ photos: photos || [] });
  } catch (err) {
    console.error("GET SESSION PHOTOS ERROR:", err);
    return res.status(500).json({ error: "Erro ao carregar fotografias." });
  }
});

app.post("/api/session/archive", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("id, user_id, is_archived")
      .eq("id", sessionId)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Registo não encontrado." });
    }

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    const isGlobalAdmin = profileData?.role === "global_admin";

    if (!isGlobalAdmin && sessionData.user_id !== userId) {
      return res.status(403).json({ error: "Sem permissão para arquivar este registo." });
    }

    const { error: archiveError } = await supabaseAdmin
      .from("clinical_sessions")
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by_user_id: userId,
      })
      .eq("id", sessionId);

    if (archiveError) {
      return res.status(400).json({ error: archiveError.message });
    }

    return res.json({ archived: true });
  } catch (err) {
    console.error("ARCHIVE SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro ao arquivar registo." });
  }
});

app.post("/api/session/restore", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }
    const isAdmin = await canAdminEmCapture(userId);

    if (!isAdmin) {
      return res.status(403).json({
        error: "Só admins podem restaurar registos.",
      });
    }

    const { error: restoreError } = await supabaseAdmin
      .from("clinical_sessions")
      .update({
        is_archived: false,
        archived_at: null,
        archived_by_user_id: null,
      })
      .eq("id", sessionId);

    if (restoreError) {
      return res.status(400).json({ error: restoreError.message });
    }

    return res.json({ restored: true });
  } catch (err) {
    console.error("RESTORE SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro ao restaurar registo." });
  }
});

app.post("/api/session/delete-permanently", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError) {
      return res.status(400).json({ error: profileError.message });
    }

    const isAdmin = await canAdminEmCapture(userId);

    if (!isAdmin) {
      return res.status(403).json({
        error: "Só admins podem eliminar registos definitivamente.",
      });
    }
    const { error: deletePhotosError } = await supabaseAdmin
      .from("session_photos")
      .delete()
      .eq("session_id", sessionId);

    if (deletePhotosError) {
      return res.status(400).json({ error: deletePhotosError.message });
    }

    const { error: deleteSessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .delete()
      .eq("id", sessionId);

    if (deleteSessionError) {
      return res.status(400).json({ error: deleteSessionError.message });
    }

    return res.json({ deleted: true });
  } catch (err) {
    console.error("DELETE SESSION ERROR:", err);
    return res.status(500).json({ error: "Erro ao eliminar registo definitivamente." });
  }
});

const listenPort = process.env.PORT || 3001;
app.listen(listenPort, () => {
  console.log(`API running on http://localhost:${listenPort}`);
});

console.log("SERVICE ROLE KEY EXISTS:", !!SUPABASE_SERVICE_ROLE_KEY);