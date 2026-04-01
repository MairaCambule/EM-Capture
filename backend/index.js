import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";

import jwt from "jsonwebtoken";

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // 🔥 VERIFICAR JWT diretamente
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.sub) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // 🔥 Buscar user real no Supabase
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(decoded.sub);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    console.error("AUTH ERROR:", err);
    return res.status(401).json({ error: "Unauthorized" });
  }
}

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());

const PHOTO_BUCKET = "clinical-photos";

/*const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PORT } =
  process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env vars. Check SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY"
  );
}*/


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

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


app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/queue/join", requireAuth, async (req, res) => {
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: "cameraId is required" });
  }

  const { data, error } = await req.supabaseUser.rpc("queue_join", {
    p_camera_id: cameraId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ queueEntryId: data });
});

app.post("/api/queue/cancel", requireAuth, async (req, res) => {
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: "cameraId is required" });
  }

  const { data, error } = await req.supabaseUser.rpc("queue_cancel", {
    p_camera_id: cameraId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ cancelled: data });
});

app.post("/api/queue/expire-turn", requireAuth, async (req, res) => {
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: "cameraId is required" });
  }

  const { data, error } = await req.supabaseUser.rpc("auto_expire_turn", {
    p_camera_id: cameraId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ expired: data });
});

app.post("/api/queue/sync", requireAuth, async (req, res) => {
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: "cameraId is required" });
  }

  const { data, error } = await req.supabaseUser.rpc("sync_queue_state", {
    p_camera_id: cameraId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ result: data });
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
        box: box,
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
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: "cameraId is required" });
  }

  const { data, error } = await req.supabaseUser.rpc("pause_session", {
    p_camera_id: cameraId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ paused: data });
});

app.post("/api/session/resume", requireAuth, async (req, res) => {
  const { cameraId, sessionId } = req.body;
  const userId = req.user.id;

  if (!cameraId || !sessionId) {
    return res.status(400).json({ error: "cameraId and sessionId are required" });
  }

  // 1) buscar sessão
  const { data: sessionData, error: sessionError } = await supabaseAdmin
    .from("clinical_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionError || !sessionData) {
    return res.status(404).json({ error: "Sessão não encontrada." });
  }

  if (sessionData.user_id !== userId) {
    return res.status(403).json({ error: "Não tens permissão para retomar esta sessão." });
  }

  if (sessionData.status !== "paused") {
    return res.status(400).json({ error: "A sessão não está pausada." });
  }

  // 2) verificar estado atual da câmara
  const { data: cameraState, error: cameraError } = await supabaseAdmin
    .from("camera_state")
    .select("*")
    .eq("camera_id", cameraId)
    .single();

  if (cameraError || !cameraState) {
    return res.status(404).json({ error: "Estado da câmara não encontrado." });
  }

  // permitir retomar apenas se a câmara estiver reservada para este user
  if (
    cameraState.status !== "reserved" ||
    cameraState.current_user_id !== userId
  ) {
    return res.status(400).json({
      error: "A câmara não está reservada para este utilizador.",
    });
  }

  // 3) reabrir a sessão pausada
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

  // 4) atualizar a câmara para in_use
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

  // 5) retirar notified da fila, se existir
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
});


app.post("/api/session/stop", requireAuth, async (req, res) => {
  const { cameraId } = req.body;

  if (!cameraId) {
    return res.status(400).json({ error: "cameraId is required" });
  }

  // 🔹 1. buscar estado da câmara
  const { data: cameraState, error: cameraError } = await supabaseAdmin
    .from("camera_state")
    .select("*")
    .eq("camera_id", cameraId)
    .single();

  if (cameraError || !cameraState) {
    return res.status(404).json({ error: "Estado da câmara não encontrado." });
  }

  const currentSessionId = cameraState.current_session_id;

  // 🔹 2. validar fotos
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

  // 🔹 3. concluir sessão
  const { data, error } = await req.supabaseUser.rpc("stop_session", {
    p_camera_id: cameraId,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.json({ stopped: data });
});

console.log("✅ Rota /api/photos/ingest carregada");

app.post(
  "/api/photos/ingest",
  //requireAuth,
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
        return res.status(404).json({ error: "Estado da câmara não encontrado." });
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
      return res.status(500).json({ error: "Erro interno ao ingerir fotografia." });
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

    // 1. buscar estado da câmara
    const { data: cameraState, error: cameraError } = await supabaseAdmin
      .from("camera_state")
      .select("*")
      .eq("camera_id", cameraId)
      .single();

    if (cameraError || !cameraState) {
      return res.status(404).json({ error: "Câmara não encontrada." });
    }

    // 2. verificar se há sessão ativa
    if (
      cameraState.status !== "in_use" ||
      !cameraState.current_session_id
    ) {
      return res.json({
        hasActiveSession: false,
      });
    }

    // 3. buscar sessão
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("clinical_sessions")
      .select("*")
      .eq("id", cameraState.current_session_id)
      .single();

    if (sessionError || !sessionData) {
      return res.status(404).json({ error: "Sessão não encontrada." });
    }

    // 4. devolver info completa
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
  console.log("Teachers:", res.data);
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

    const teacherIds = [...new Set((data || []).map((row) => row.teacher_user_id))];

    let teachersMap = {};

    if (teacherIds.length > 0) {
      const { data: teacherProfiles, error: teacherProfilesError } = await supabaseAdmin
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

const listenPort = PORT || 3001;
app.listen(listenPort, () => {
  console.log(`API running on http://localhost:${listenPort}`);
});

