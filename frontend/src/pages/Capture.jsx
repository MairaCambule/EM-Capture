import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import axios from "axios";


//const API_URL = "https://em-capture-backend.onrender.com/api/photos/ingest";
const ACTIVE_SESSION_URL = "https://em-capture-backend.onrender.com/api/camera/active-session";

//const API_URL = import.meta.env.VITE_API_URL;
const CAMERA_ID = import.meta.env.VITE_DEFAULT_CAMERA_ID;

const PHOTO_BUCKET = "clinical-photos";

export default function Capture({ session }) {
  const navigate = useNavigate();

  const [showTurnModal, setShowTurnModal] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });
  useEffect(() => {
    if (!msg.text) return;

    const timeout =
      msg.type === "warning" ? 30000 : 4000;

    const timer = setTimeout(() => {
      setMsg({ text: "", type: "" });
    }, timeout);

    return () => clearTimeout(timer);
  }, [msg]);

  const [teachers, setTeachers] = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [sessionTeachers, setSessionTeachers] = useState([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
  const [teacherRecords, setTeacherRecords] = useState([]);

  //const [teacherRecords, setTeacherRecords] = useState([]);

  const [currentPhase, setCurrentPhase] = useState("during");
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "",
    action: null,
    type: "default",
  });


  const [showStopConfirmModal, setShowStopConfirmModal] = useState(false);

  const [isEditingSessionData, setIsEditingSessionData] = useState(false);

  const [recordActionLoadingId, setRecordActionLoadingId] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL;

  //const BASE_URL = "https://em-capture-backend.onrender.com";

  //const API_URL = `${BASE_URL}/api/photos/ingest`;


  const [cameraState, setCameraState] = useState(null);
  const [queueEntries, setQueueEntries] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [currentSession, setCurrentSession] = useState(null);
  const [turnExpired, setTurnExpired] = useState(false);
  const [expiringTurn, setExpiringTurn] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [photoPhase, setPhotoPhase] = useState("after");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [myRecords, setMyRecords] = useState([]);
  const [recordsSearch, setRecordsSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedRecordPhotos, setSelectedRecordPhotos] = useState([]);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  const [filterDate, setFilterDate] = useState("");
  const [filterName, setFilterName] = useState("");
  const [filterPatientCode, setFilterPatientCode] = useState("");
  const [filterBox, setFilterBox] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [photoPreviewMap, setPhotoPreviewMap] = useState({});

  const [recordsFilterMode, setRecordsFilterMode] = useState("active");

  const [profile, setProfile] = useState(null);
  const [moduleRole, setModuleRole] = useState("user");
  const [recordsView, setRecordsView] = useState("mine");
  const [allRecords, setAllRecords] = useState([]);

  const isGlobalAdmin = profile?.role === "global_admin";

  const isModuleAdmin = moduleRole === "module_admin";
  const canViewAllRecords = isGlobalAdmin || isModuleAdmin;


  const isTeacher =
    profile?.role?.trim().toLowerCase() === "teacher";

  const baseRecords =
    isTeacher && recordsView === "assigned"
      ? teacherRecords
      : recordsView === "all" && canViewAllRecords
        ? allRecords
        : myRecords;

  console.log("BASE RECORDS:", baseRecords);
  console.log("TEACHER RECORDS:", teacherRecords);
  console.log("VIEW:", recordsView);

  const filteredRecordsByArchive = baseRecords.filter((record) => {
    const isArchived = record.is_archived === true;

    if (recordsFilterMode === "active") return !isArchived;
    if (recordsFilterMode === "archived") return isArchived;

    return true;
  });

  const filteredRecords = filteredRecordsByArchive.filter((record) => {
    const recordDate = record.started_at
      ? new Date(record.started_at).toISOString().slice(0, 10)
      : "";

    const matchesDate = !filterDate || recordDate === filterDate;

    const matchesName =
      !filterName ||
      String(record.user_name || "")
        .toLowerCase()
        .includes(filterName.toLowerCase());

    const matchesPatient =
      !filterPatientCode ||
      String(record.patient_code || "")
        .toLowerCase()
        .includes(filterPatientCode.toLowerCase());

    const matchesBox =
      !filterBox ||
      String(record.box || "")
        .toLowerCase()
        .includes(filterBox.toLowerCase());

    const matchesStatus =
      !filterStatus ||
      String(formatSessionStatus(record.status) || "")
        .toLowerCase()
        .includes(filterStatus.toLowerCase());

    return (
      matchesDate &&
      matchesName &&
      matchesPatient &&
      matchesBox &&
      matchesStatus
    );
  });

  console.log("BASE RECORDS:", baseRecords);
  console.log("TEACHER RECORDS:", teacherRecords);
  console.log("VIEW:", recordsView);
  console.log("FILTERED BY ARCHIVE:", filteredRecordsByArchive);
  console.log("FILTERED FINAL:", filteredRecords);


  const [pendingResumeRecord, setPendingResumeRecord] = useState(null);

  const [draftBox, setDraftBox] = useState("");
  const [draftPatientCode, setDraftPatientCode] = useState("");

  const currentUserId = session?.user?.id;

  const isCurrentUserUsingCamera =
    cameraState?.status === "in_use" &&
    cameraState?.current_user_id === currentUserId &&
    !!cameraState?.current_session_id;

  const isCurrentUserReserved =
    cameraState?.status === "reserved" &&
    cameraState?.current_user_id === currentUserId;

  const isOtherUserUsingCamera =
    cameraState?.status === "in_use" &&
    cameraState?.current_user_id &&
    cameraState?.current_user_id !== currentUserId;

  const isOtherUserReserved =
    cameraState?.status === "reserved" &&
    cameraState?.current_user_id &&
    cameraState?.current_user_id !== currentUserId;

  const canStartSession = isCurrentUserReserved && !isCurrentUserUsingCamera;
  const canPauseSession = isCurrentUserUsingCamera;
  const canStopSession = isCurrentUserUsingCamera;

  const canEditSessionData =
    !!currentSession &&
    currentSession?.user_id === currentUserId &&
    (currentSession?.status === "open" || currentSession?.status === "paused");

  const hasRequiredSessionData =
    draftBox.trim() !== "" && draftPatientCode.trim() !== "";

  const canStartSessionFinal = canStartSession && hasRequiredSessionData;

  const canSeeSessionClinic =
    isCurrentUserUsingCamera || isCurrentUserReserved;

  const [isPreparingSession, setIsPreparingSession] = useState(false);




  useEffect(() => {
    if (!session?.access_token) return;

    console.log("🔐 A configurar realtime auth");

    supabase.realtime.setAuth(session.access_token);
  }, [session?.access_token]);


  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      await syncQueueState();

      const { data: stateData, error: stateError } = await supabase
        .from("camera_state")
        .select("*")
        .eq("camera_id", CAMERA_ID)
        .single();

      if (stateError) {
        console.error("Erro ao carregar camera_state:", stateError);
        return;
      }

      setCameraState(stateData);
      setCurrentPhase(stateData?.current_phase || "during");

      const { data: queueData, error: queueError } = await supabase
        .from("queue_entries")
        .select("*")
        .eq("camera_id", CAMERA_ID)
        .in("status", ["waiting", "notified"])
        .order("joined_at", { ascending: true });

      if (queueError) console.error("Erro ao carregar fila:", queueError);

      const safeQueue = queueData || [];
      setQueueEntries(safeQueue);

      // Perfil do utilizador atual
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUserId)
        .single();

      let loadedProfileRole = "user";
      let isTeacherUser = false;
      let isGlobalAdminUser = false;

      if (profileError) {
        console.error("Erro ao carregar profile:", profileError);
        setProfile(null);
        setTeacherRecords([]);
      } else {
        setProfile(profileData);

        loadedProfileRole = (profileData?.role || "user").trim().toLowerCase();
        isTeacherUser = loadedProfileRole === "teacher";
        isGlobalAdminUser = loadedProfileRole === "global_admin";

        console.log("ROLE CARREGADA:", loadedProfileRole);
        console.log("IS TEACHER:", isTeacherUser);
        console.log("IS GLOBAL ADMIN:", isGlobalAdminUser);

        if (isTeacherUser) {
          try {
            const {
              data: { session: activeSession },
            } = await supabase.auth.getSession();

            const response = await axios.get(
              `${API_BASE_URL}/api/teacher/records`,
              {
                headers: {
                  Authorization: `Bearer ${activeSession?.access_token}`,
                },
              }
            );

            console.log("TEACHER RECORDS:", response.data);

            const records = response.data?.records || [];
            const normalized = (Array.isArray(records) ? records : []).map((r) => ({
              ...r,
              user_name: r.user_name || r.full_name || "—",
              name: r.name || r.full_name || "—",
            }));

            setTeacherRecords(normalized);
          } catch (error) {
            console.error("Erro ao carregar registos do professor:", error);
            setTeacherRecords([]);
          }
        } else {
          setTeacherRecords([]);
        }
      }

      const { data: moduleData, error: moduleError } = await supabase
        .from("user_module_access")
        .select(`
        role,
        platform_modules (
          code
        )
      `)
        .eq("user_id", currentUserId);

      let currentModuleRole = "user";

      if (moduleError) {
        console.error("Erro ao carregar role do módulo:", moduleError);
      } else {
        currentModuleRole =
          (moduleData || []).find(
            (item) => item.platform_modules?.code === "em_capture"
          )?.role || "user";

        setModuleRole(currentModuleRole);
      }

      if (stateData?.status === "in_use" && stateData?.current_session_id) {
        const { data, error } = await supabase
          .from("clinical_sessions")
          .select("*")
          .eq("id", stateData.current_session_id)
          .maybeSingle();

        if (error) {
          console.error("Erro ao buscar sessão:", error);
          setCurrentSession(null);
          setBox("");
          setPatientCode("");
        } else {
          setCurrentSession(data || null);
          setBox(data?.box || "");
          setPatientCode(data?.patient_code || "");
        }
      } else {
        setCurrentSession(null);
        setBox("");
        setPatientCode("");
      }

      const { data: allSessionsForNames, error: allSessionsForNamesError } =
        await supabase.from("clinical_sessions").select("user_id");

      if (allSessionsForNamesError) {
        console.error(
          "Erro ao carregar user_ids de clinical_sessions:",
          allSessionsForNamesError
        );
      }

      const ids = [
        ...new Set(
          [
            ...safeQueue.map((q) => q.user_id),
            ...(allSessionsForNames || []).map((s) => s.user_id),
            stateData?.current_user_id,
            currentUserId,
          ].filter(Boolean)
        ),
      ];

      let localProfilesMap = {};

      if (ids.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);

        if (profilesError) {
          console.error("Erro ao carregar profiles:", profilesError);
        } else {
          (profilesData || []).forEach((p) => {
            localProfilesMap[p.id] = p.full_name || p.id;
          });

          setProfilesMap(localProfilesMap);
        }
      } else {
        setProfilesMap({});
      }

      // Meus registos
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("clinical_sessions")
        .select("*")
        .eq("user_id", currentUserId)
        .order("started_at", { ascending: false });

      const archivedByIds = [
        ...new Set(
          (sessionsData || []).map((s) => s.archived_by_user_id).filter(Boolean)
        ),
      ];

      if (archivedByIds.length > 0) {
        const { data: archivedProfiles, error: archivedProfilesError } =
          await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", archivedByIds);

        if (archivedProfilesError) {
          console.error(
            "Erro ao carregar archived_by profiles:",
            archivedProfilesError
          );
        } else {
          (archivedProfiles || []).forEach((p) => {
            localProfilesMap[p.id] = p.full_name || p.id;
          });

          setProfilesMap({ ...localProfilesMap });
        }
      }

      if (sessionsError) {
        console.error("Erro ao carregar meus registos:", sessionsError);
        setMyRecords([]);
      } else {
        const sessions = sessionsData || [];

        if (sessions.length === 0) {
          setMyRecords([]);
        } else {
          const sessionIds = sessions.map((s) => s.id);

          const { data: photosData, error: photosError } = await supabase
            .from("session_photos")
            .select("session_id, id")
            .in("session_id", sessionIds);

          if (photosError) {
            console.error("Erro ao carregar contagem de fotos:", photosError);
          }

          const photoCountMap = {};
          (photosData || []).forEach((photo) => {
            photoCountMap[photo.session_id] =
              (photoCountMap[photo.session_id] || 0) + 1;
          });

          const records = sessions.map((sessionItem) => ({
            ...sessionItem,
            user_name:
              localProfilesMap[sessionItem.user_id] || sessionItem.user_id,
            photos_count: photoCountMap[sessionItem.id] || 0,
          }));

          setMyRecords(records);
        }
      }

      // Todos os registos apenas para admins
      if (isGlobalAdminUser || currentModuleRole === "module_admin") {
        const { data: allSessionsData, error: allSessionsError } = await supabase
          .from("clinical_sessions")
          .select("*")
          .order("started_at", { ascending: false });

        if (allSessionsError) {
          console.error("Erro ao carregar todos os registos:", allSessionsError);
          setAllRecords([]);
        } else {
          const allSessions = allSessionsData || [];

          if (allSessions.length === 0) {
            setAllRecords([]);
          } else {
            const allSessionIds = allSessions.map((s) => s.id);

            const { data: allPhotosData, error: allPhotosError } = await supabase
              .from("session_photos")
              .select("session_id, id")
              .in("session_id", allSessionIds);

            if (allPhotosError) {
              console.error(
                "Erro ao carregar contagem global de fotos:",
                allPhotosError
              );
            }

            const allPhotoCountMap = {};
            (allPhotosData || []).forEach((photo) => {
              allPhotoCountMap[photo.session_id] =
                (allPhotoCountMap[photo.session_id] || 0) + 1;
            });

            const allRecordsMapped = allSessions.map((sessionItem) => ({
              ...sessionItem,
              user_name:
                localProfilesMap[sessionItem.user_id] || sessionItem.user_id,
              photos_count: allPhotoCountMap[sessionItem.id] || 0,
            }));

            setAllRecords(allRecordsMapped);
          }
        }
      } else {
        setAllRecords([]);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!session?.access_token || !CAMERA_ID) return;

    loadData();
  }, [session?.access_token, CAMERA_ID, loadData]);


  const myNotifiedEntry = queueEntries.find(
    (entry) => entry.user_id === currentUserId && entry.status === "notified"
  );

  const isMyTurn = useMemo(() => {
    if (
      cameraState?.status !== "reserved" ||
      cameraState?.current_user_id !== currentUserId
    ) {
      return false;
    }

    if (!myNotifiedEntry?.expires_at) {
      return false;
    }

    return new Date(myNotifiedEntry.expires_at) > new Date();
  }, [cameraState, currentUserId, myNotifiedEntry]);



  /*const canStartSession =
    cameraState?.status === "reserved" &&
    cameraState?.current_user_id === currentUserId &&
    myNotifiedEntry &&
    new Date(myNotifiedEntry.expires_at) > new Date();
*/
  const canPauseOrStop =
    cameraState?.status === "in_use" &&
    cameraState?.current_user_id === currentUserId &&
    !!cameraState?.current_session_id;

  /*const isCurrentUserUsingCamera =
    cameraState?.status === "in_use" &&
    cameraState?.current_user_id === currentUserId;
*/
  console.log("session:", session);
  console.log("access token exists:", !!session?.access_token);
  console.log("API_BASE_URL:", API_BASE_URL);

  console.log("CAMERA_ID:", CAMERA_ID);


  const canManageQueue = !isCurrentUserUsingCamera;

  const canUploadPhotos =
    cameraState?.status === "in_use" &&
    cameraState?.current_user_id === currentUserId &&
    !!cameraState?.current_session_id;

  const activeRecordsSource =
    recordsView === "all" && canViewAllRecords ? allRecords : myRecords;



  console.log("FILTER MODE TESTE:", recordsFilterMode);
  console.log("FILTERED BY ARCHIVE:", filteredRecordsByArchive);
  console.log("FILTERED FINAL:", filteredRecords);

  function openConfirmModal({ title, message, confirmText, type, action }) {
    setConfirmModal({
      open: true,
      title,
      message,
      confirmText,
      type: type || "default",
      action,
    });
  }

  function closeConfirmModal() {
    setConfirmModal({
      open: false,
      title: "",
      message: "",
      confirmText: "",
      action: null,
      type: "default",
    });
  }

  function getStatusMeta(status) {
    switch (status) {
      case "available":
        return { label: "Disponível", bg: "#e8f2fd", color: "#1e4a8d" };
      case "reserved":
        return { label: "Reservada", bg: "#fdf2dc", color: "#c7952d" };
      case "in_use":
        return { label: "Em uso", bg: "#e8f4ec", color: "#2f7d4c" };
      case "paused":
        return { label: "Pausada", bg: "#eef1f5", color: "#5f6b7a" };
      default:
        return { label: status || "—", bg: "#eef1f5", color: "#5f6b7a" };
    }
  }

  function formatSessionStatus(status) {
    switch (status) {
      case "open":
        return "Aberta";
      case "paused":
        return "Pausada";
      case "closed":
        return "Fechada";
      case "auto_closed":
        return "Fechada auto.";
      default:
        return status || "—";
    }
  }

  function formatPhaseLabel(phase) {
    switch (phase) {
      case "before":
        return "Inicial";
      case "during":
        return "Durante";
      case "after":
        return "Final";
      default:
        return phase || "-";
    }
  }

  function groupPhotosByPhase(photos) {
    return {
      before: photos.filter((p) => p.phase === "before"),
      during: photos.filter((p) => p.phase === "during"),
      after: photos.filter((p) => p.phase === "after"),
    };
  }

  const groupedSelectedRecordPhotos = groupPhotosByPhase(selectedRecordPhotos);
  const statusMeta = getStatusMeta(cameraState?.status);


  //axios.get(`${API_BASE_URL}/api/teachers`)

  async function logout() {
    await supabase.auth.signOut();
  }

  async function apiPost(path, body) {
    const {
      data: { session: activeSession },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !activeSession?.access_token) {
      throw new Error("Sessão inválida. Faz login novamente.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeSession.access_token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    console.log("RAW RESPONSE:", text);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("O backend devolveu uma resposta inválida.");
    }

    return data;
  }

  async function apiGet(path) {
    const {
      data: { session: activeSession },
    } = await supabase.auth.getSession();

    const token = activeSession?.access_token;

    if (!token) {
      throw new Error("Sessão expirada. Faz login novamente.");
    }

    const response = await axios.get(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    console.log("API GET RESPONSE:", path, response.data);

    return response.data;
  }


  async function expireTurn() {
    try {
      const data = await apiPost("/api/queue/expire-turn", {
        cameraId: CAMERA_ID,
      });
      return data;
    } catch (error) {
      console.error("EXPIRE TURN ERROR:", error);
      return null;
    }
  }

  async function syncQueueState() {
    try {
      const data = await apiPost("/api/queue/sync", {
        cameraId: CAMERA_ID,
      });
      return data;
    } catch (error) {
      console.error("SYNC QUEUE ERROR:", error);
      return null;
    }
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function updatePhase(phase) {
    try {
      const data = await apiPost("/api/camera/phase", {
        cameraId: CAMERA_ID,
        phase,
      });

      if (data.updated) {
        setCurrentPhase(phase);
        setMsg({
          text: `Fase atual definida como ${phase === "before"
            ? "Antes"
            : phase === "during"
              ? "Durante"
              : "Depois"
            }.`,
          type: "success",
        });

        await loadData();
      }
    } catch (error) {
      console.error("UPDATE PHASE ERROR:", error);
      setMsg({
        text: error.message,
        type: "warning",
      });
    }
  }

  async function loadTeachers() {
    try {
      const data = await apiGet("/api/teachers");
      setTeachers(data.teachers || []);
    } catch (error) {
      console.error("Erro ao carregar professores:", error);
      setTeachers([]);
    }
  }

  async function loadSessionTeachers(sessionId) {
    try {
      const data = await apiGet(`/api/session/${sessionId}/teachers`);
      setSessionTeachers(data.teachers || []);
    } catch (error) {
      console.error("Erro ao carregar professores da sessão:", error);
      setSessionTeachers([]);
    }
  }

  async function assignTeacherToSession() {
    if (!selectedRecord?.id || !selectedTeacherId) {
      setMsg({
        text: "Seleciona um professor antes de guardar.",
        type: "warning",
      });
      return;
    }

    try {
      setLoadingTeachers(true);

      const data = await apiPost("/api/session/assign-teacher", {
        sessionId: selectedRecord.id,
        teacherUserId: selectedTeacherId,
      });

      if (data?.assigned) {
        setMsg({
          text: "Professor associado ao registo com sucesso.",
          type: "success",
        });

        setSelectedTeacherId("");
        await loadSessionTeachers(selectedRecord.id);
      }
    } catch (error) {
      console.error("ASSIGN TEACHER ERROR:", error);
      setMsg({
        text: error.message || "Erro ao associar professor.",
        type: "warning",
      });
    } finally {
      setLoadingTeachers(false);
    }
  }


  async function removeTeacherFromSession(accessId) {
    try {
      setLoadingTeachers(true);

      const data = await apiPost("/api/session/remove-teacher", {
        accessId,
      });

      if (data?.removed) {
        setMsg({
          text: "Professor removido do registo.",
          type: "success",
        });

        await loadSessionTeachers(selectedRecord.id);
      }
    } catch (error) {
      console.error("REMOVE TEACHER ERROR:", error);
      setMsg({
        text: error.message || "Erro ao remover professor.",
        type: "warning",
      });
    } finally {
      setLoadingTeachers(false);
    }
  }

  useEffect(() => {
    if (!session?.access_token) return;
    //loadTeachers();   - temporario
  }, [session]);


  useEffect(() => {
    if (!session?.access_token || !CAMERA_ID) return;

    const channel = supabase
      .channel(`em-capture-${CAMERA_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_state",
          filter: `camera_id=eq.${CAMERA_ID}`,
        },
        () => {
          loadData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_entries",
          filter: `camera_id=eq.${CAMERA_ID}`,
        },
        () => {
          loadData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clinical_sessions",
        },
        () => {
          loadData();
        }
      )
      .subscribe((status) => {
        console.log("Realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.access_token, CAMERA_ID, loadData]);


  useEffect(() => {
    if (!session?.access_token || !CAMERA_ID) return;

    // enquanto o user está a preparar a sessão, não refrescar agressivamente
    if (isCurrentUserReserved && isPreparingSession) return;

    const interval = setInterval(async () => {
      try {
        await syncQueueState();
        await loadData();
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [
    session?.access_token,
    CAMERA_ID,
    loadData,
    isCurrentUserReserved,
    isPreparingSession,
  ]);
  useEffect(() => {
    async function handleExpiredTurn() {
      if (
        expiringTurn ||
        cameraState?.status !== "reserved" ||
        !myNotifiedEntry?.expires_at
      ) {
        if (
          cameraState?.status !== "reserved" ||
          !myNotifiedEntry?.expires_at
        ) {
          setTurnExpired(false);
        }
        return;
      }

      const isExpired = new Date(myNotifiedEntry.expires_at) <= new Date();

      if (!isExpired) {
        setTurnExpired(false);
        return;
      }

      setTurnExpired(true);
      setExpiringTurn(true);

      const result = await expireTurn();

      if (result) {
        await loadData();
      }

      setExpiringTurn(false);
    }

    handleExpiredTurn();
  }, [cameraState, myNotifiedEntry, loadData, expiringTurn]);

  useEffect(() => {
    if (isMyTurn && !isCurrentUserUsingCamera) {
      setShowTurnModal(true);
      setDraftBox("");
      setDraftPatientCode("");
    }
  }, [isMyTurn, isCurrentUserUsingCamera]);


  useEffect(() => {
    if (!isMyTurn) {
      setShowTurnModal(false);
    }
  }, [isMyTurn]);

  async function joinQueue() {
    setMsg("");
    try {
      const data = await apiPost("/api/queue/join", { cameraId: CAMERA_ID });
      setMsg({
        text: `Entraste na fila com sucesso. ID: ${data.queueEntryId}`,
        type: "success"
      });
      await loadData();
    } catch (error) {
      console.error("QUEUE JOIN ERROR:", error);
      setMsg(error.message);
    }
  }

  async function cancelQueue() {
    setMsg("");
    try {
      await apiPost("/api/queue/cancel", { cameraId: CAMERA_ID });
      setMsg({
        text: "Saíste da fila com sucesso.",
        type: "success",
      });
      await loadData();
    } catch (error) {
      console.error("QUEUE CANCEL ERROR:", error);
      setMsg(error.message);
    }
  }


  async function startSession() {
    try {
      setMsg("");

      const data = await apiPost("/api/session/start", {
        cameraId: CAMERA_ID,
        patientCode: draftPatientCode,
        box: draftBox,
      });

      if (data.started) {
        setMsg({
          text: "Sessão iniciada com sucesso.",
          type: "success",
        });

        setDraftBox("");
        setDraftPatientCode("");
        setShowTurnModal(false);

        await loadData();
      }
    } catch (error) {
      console.error("START SESSION ERROR:", error);
      setMsg({
        text: error.message,
        type: "warning",
      });
    }
  }

  async function pauseSession() {
    setMsg("");
    try {
      const data = await apiPost("/api/session/pause", {
        cameraId: CAMERA_ID,
      });


      setMsg(
        data.paused
          ? { text: "Sessão pausada com sucesso.", type: "info" }
          : { text: "Não foi possível pausar a sessão.", type: "warning" }
      );
      await loadData();
    } catch (error) {
      console.error("PAUSE SESSION ERROR:", error);
      setMsg({ text: error.message, type: "warning" });
    }
  }

  async function resumeSession(record) {
    setMsg({ text: "", type: "" });

    try {
      const data = await apiPost("/api/session/resume", {
        cameraId: CAMERA_ID,
        sessionId: record.id,
      });

      if (data.resumed) {
        setMsg({
          text: "Sessão retomada com sucesso.",
          type: "success",
        });

        setPendingResumeRecord(null);
        setBox("");
        setPatientCode("");
      } else {
        setMsg({
          text: "Não foi possível retomar a sessão.",
          type: "warning",
        });
      }

      await loadData();
      closeRecordModal();
    } catch (error) {
      console.error("RESUME SESSION ERROR:", error);
      setMsg({ text: error.message, type: "warning" });
    }
  }

  async function stopSession() {
    setMsg("");
    try {
      const data = await apiPost("/api/session/stop", {
        cameraId: CAMERA_ID,
      });

      setMsg(
        data.stopped
          ? { text: "Sessão encerrada com sucesso.", type: "success" }
          : { text: "Não foi possível encerrar a sessão.", type: "warning" }
      );
      await loadData();
    } catch (error) {
      console.error("STOP SESSION ERROR:", error);
      setMsg({ text: error.message, type: "warning" });
    }
  }

  async function saveSessionData() {
    try {
      await apiPost("/api/session/update", {
        sessionId: currentSession.id,
        box,
        patientCode,
      });

      setIsEditingSessionData(false);

      setMsg({
        text: "Dados da sessão atualizados com sucesso.",
        type: "success",
      });

      await loadData();
    } catch (err) {
      console.error("Erro ao atualizar sessão:", err);
      setMsg({
        text: err.message || "Erro ao atualizar sessão.",
        type: "warning",
      });
    }
  }

  async function uploadPhoto() {
    try {
      if (!selectedFile || !cameraState?.camera_id && !CAMERA_ID) return;

      setUploadingPhoto(true);

      const formData = new FormData();
      formData.append("photo", selectedFile);
      formData.append("cameraId", CAMERA_ID);
      formData.append("phase", photoPhase);

      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();

      const response = await fetch(`${API_BASE_URL}/api/photos/ingest`, {
        method: "POST",
        headers: activeSession?.access_token
          ? {
            Authorization: `Bearer ${activeSession.access_token}`,
          }
          : {},
        body: formData,
      });

      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("O backend devolveu uma resposta inválida.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Erro ao carregar fotografia.");
      }

      setMsg({
        text: "Fotografia carregada com sucesso.",
        type: "success",
      });

      setSelectedFile(null);
      await loadData();
    } catch (error) {
      console.error("UPLOAD PHOTO ERROR:", error);
      setMsg({
        text: error.message || "Erro ao carregar fotografia.",
        type: "warning",
      });
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function openPhoto(path) {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      setMsg("Não foi possível abrir a fotografia.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  async function getSignedPhotoUrl(path) {
    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  }

  async function openRecordModal(record) {
    setSelectedRecord(record);

    const photosResponse = await apiGet(`/api/session/${record.id}/photos`);
    const recordPhotos = photosResponse.photos || [];
    const error = null;

    if (error) {
      console.error("Erro ao carregar fotos do registo:", error);
      setSelectedRecordPhotos([]);
      setPhotoPreviewMap({});
    } else {
      const photos = recordPhotos || [];
      setSelectedRecordPhotos(photos);

      const previewEntries = await Promise.all(
        photos.map(async (photo) => {
          const url = await getSignedPhotoUrl(photo.storage_path);
          return [photo.id, url];
        })
      );

      const previewMap = Object.fromEntries(previewEntries);
      setPhotoPreviewMap(previewMap);
    }

    // 👉 NOVO
    await loadTeachers();
    await loadSessionTeachers(record.id);

    setIsRecordModalOpen(true);
  }

  async function updatePhase(phase) {
    try {
      const data = await apiPost("/api/camera/phase", {
        cameraId: CAMERA_ID,
        phase,
      });

      if (data.updated) {
        setCurrentPhase(phase);
        await loadData();
      }
    } catch (error) {
      console.error("UPDATE PHASE ERROR:", error);
      setMsg({
        text: error.message,
        type: "warning",
      });
    }
  }

  async function confirmStopSession() {
    setShowStopConfirmModal(false);
    await stopSession();
  }


  async function archiveRecord(sessionId) {
    try {
      setRecordActionLoadingId(sessionId);

      const data = await apiPost("/api/session/archive", { sessionId });

      if (data?.archived) {
        setMsg({
          text: "Registo arquivado com sucesso.",
          type: "success",
        });

        await loadData();

        if (selectedRecord?.id === sessionId) {
          closeRecordModal();
        }
      } else {
        throw new Error(data?.error || "Erro ao arquivar registo.");
      }
    } catch (error) {
      console.error("ARCHIVE RECORD ERROR:", error);

      setMsg({
        text: error.message || "Erro ao arquivar registo.",
        type: "warning",
      });
    } finally {
      setRecordActionLoadingId(null);
    }
  }

  async function restoreRecord(sessionId) {
    try {
      setRecordActionLoadingId(sessionId);

      const data = await apiPost("/api/session/restore", { sessionId });

      if (data?.restored) {
        setMsg({
          text: "Registo restaurado com sucesso.",
          type: "success",
        });

        await loadData();
      } else {
        throw new Error(data?.error || "Erro ao restaurar registo.");
      }
    } catch (error) {
      console.error("RESTORE RECORD ERROR:", error);

      setMsg({
        text: error.message || "Erro ao restaurar registo.",
        type: "warning",
      });
    } finally {
      setRecordActionLoadingId(null);
    }
  }

  async function deleteRecordPermanently(sessionId) {
    try {
      setRecordActionLoadingId(sessionId);

      const data = await apiPost("/api/session/delete-permanently", {
        sessionId,
      });

      if (data?.deleted) {
        setMsg({
          text: "Registo eliminado definitivamente.",
          type: "success",
        });

        await loadData();

        if (selectedRecord?.id === sessionId) {
          closeRecordModal();
        }
      } else {
        throw new Error(data?.error || "Erro ao eliminar registo.");
      }
    } catch (error) {
      console.error("DELETE RECORD ERROR:", error);

      setMsg({
        text: error.message || "Erro ao eliminar registo.",
        type: "warning",
      });
    } finally {
      setRecordActionLoadingId(null);
    }
  }


  function closeRecordModal() {
    setIsRecordModalOpen(false);
    setSelectedRecord(null);
    setSelectedRecordPhotos([]);
    setPhotoPreviewMap({});
  }

  return (
    <div className="app-shell">
      <div className="top-actions">
        <div className="user-meta">
          <div className="user-email">{session.user.email}</div>
        </div>

        <button className="soft-btn" onClick={() => navigate("/app")}>
          Voltar
        </button>

        <button className="secondary-btn" onClick={logout}>
          Sair
        </button>

        <button
          type="button"
          onClick={() => navigate("/app/profile")}
          style={{
            background: "#eef4fb",
            color: "#1e4a8d",
            border: "none",
            padding: "10px 16px",
            borderRadius: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Perfil
        </button>

      </div>

      <section
        className="card"
        style={{
          padding: "34px 36px",
          marginBottom: 28,
          background: "linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)",
        }}
      >
        <div className="badge badge-blue" style={{ width: "fit-content", marginBottom: 18 }}>
          EM Capture
        </div>

        <h1
          style={{
            margin: 0,
            color: "#1e4a8d",
            fontSize: "2.7rem",
            lineHeight: 1.05,
            fontWeight: 800,
          }}
        >
          Gestão da Câmara Clínica
        </h1>

        <p
          style={{
            marginTop: 18,
            marginBottom: 0,
            color: "#5f6b7a",
            fontSize: "1.15rem",
            maxWidth: 900,
          }}
        >
          Gestão de fila, início direto da sessão, pausa, encerramento e
          preparação para registo fotográfico estruturado.
        </p>
      </section>

      <section
        className="card"
        style={{
          padding: 26,
          marginBottom: 28,
          background: "linear-gradient(180deg, #ffffff 0%, #fbfcff 100%)",
        }}
      >
        <h2 style={{ marginTop: 0, color: "#1e4a8d", fontSize: "1.7rem" }}>
          Ações
        </h2>


        <p style={{ color: "#5f6b7a", marginTop: 8 }}>
          Gestão da fila e controlo do ciclo da sessão.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 18,
            marginTop: 22,
          }}
        >
          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background: "#f8fafc",
              border: "1px solid #e4e9f0",
            }}
          >
            <div style={{ fontWeight: 800, color: "#1e4a8d", marginBottom: 14 }}>
              Fila
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="primary-btn" onClick={joinQueue} disabled={!canManageQueue}>
                Entrar na fila
              </button>
              <button className="secondary-btn" onClick={cancelQueue} disabled={!canManageQueue}>
                Cancelar fila
              </button>
              <button className="soft-btn" onClick={loadData}>
                Atualizar
              </button>
            </div>


            {isMyTurn && (
              <div style={{ marginTop: 14, color: "#1e4a8d", fontWeight: 700 }}>
                É a tua vez. O botão de início estará disponível após inserir o nº da Box e código do paciente.
              </div>
            )}

            {turnExpired && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: "#c7952d", fontWeight: 700, marginBottom: 10 }}>
                  O teu turno expirou. Podes entrar novamente na fila.
                </div>

                <button className="soft-btn" onClick={joinQueue}>
                  Entrar novamente na fila
                </button>
              </div>
            )}
          </div>

          <div
            style={{
              padding: 20,
              borderRadius: 20,
              background: "#f8fafc",
              border: "1px solid #e4e9f0",
            }}
          >
            <div style={{ fontWeight: 800, color: "#1e4a8d", marginBottom: 14 }}>
              Sessão
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button className="primary-btn" onClick={startSession} disabled={!canStartSessionFinal} >
                Iniciar
              </button>

              <button className="secondary-btn" onClick={pauseSession} disabled={!canPauseOrStop}>
                Pausar
              </button>
              <button
                className="secondary-btn"
                onClick={() => setShowStopConfirmModal(true)} disabled={!canStopSession}
              >
                Concluir
              </button>
            </div>
          </div>




          {showStopConfirmModal && (
            <div
              onClick={() => setShowStopConfirmModal(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                zIndex: 9999,
                backdropFilter: "blur(2px)",
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%",
                  maxWidth: 560,
                  background: "#ffffff",
                  borderRadius: 22,
                  padding: 28,
                  boxShadow: "0 30px 80px rgba(15, 23, 42, 0.22)",
                  border: "1px solid #eef2f7",
                }}
              >
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",
                    background: "#fff4e5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.9rem",
                    marginBottom: 18,
                  }}
                >
                  ⚠️
                </div>

                <h3
                  style={{
                    margin: 0,
                    marginBottom: 10,
                    color: "#1e4a8d",
                    fontSize: "1.45rem",
                    fontWeight: 800,
                  }}
                >
                  Concluir sessão
                </h3>

                <p
                  style={{
                    margin: 0,
                    color: "#5f6b7a",
                    lineHeight: 1.7,
                    fontSize: "1rem",
                  }}
                >
                  Pretende mesmo concluir esta sessão?
                  <br />
                  Confirme que já inseriu as fotografias associadas ao registo antes de continuar.
                </p>

                <div
                  style={{
                    marginTop: 24,
                    padding: "14px 16px",
                    borderRadius: 14,
                    background: "#f8fbff",
                    border: "1px solid #e3edf8",
                    color: "#48607a",
                    fontSize: "0.95rem",
                    lineHeight: 1.6,
                  }}
                >
                  A sessão só será concluída se existirem fotografias associadas.
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                    flexWrap: "wrap",
                    marginTop: 26,
                  }}
                >
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setShowStopConfirmModal(false)}
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    className="primary-btn"
                    onClick={confirmStopSession}
                  >
                    Confirmar conclusão
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>


        {msg.text && (
          <p
            style={{
              fontWeight: 600,
              marginTop: "10px",
              color:
                msg.type === "warning"
                  ? "#dc2626"
                  : msg.type === "success"
                    ? "#16a34a"
                    : "#2563eb"
            }}
          >
            {msg.type === "warning" && "⚠️ "}
            {msg.type === "success" && "✅ "}
            {msg.type === "info" && "ℹ️ "}
            {msg.text}
          </p>
        )}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.35fr 1fr",
          gap: 24,
          marginBottom: 28,
        }}
      >
        <div
          className="card"
          style={{
            padding: 26,
            background: "linear-gradient(180deg, #ffffff 0%, #fbfcff 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 16,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: "#1e4a8d", fontSize: "1.7rem" }}>
                Estado da câmara
              </h2>
              <p style={{ margin: "8px 0 0 0", color: "#5f6b7a" }}>
                Monitorização do estado atual do equipamento.
              </p>
            </div>

            <div
              style={{
                background: statusMeta.bg,
                color: statusMeta.color,
                borderRadius: 999,
                padding: "10px 18px",
                fontWeight: 800,
                fontSize: "0.95rem",
              }}
            >
              {statusMeta.label}
            </div>
          </div>

          {loading ? (
            <p>A carregar...</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              <div style={{ padding: 18, borderRadius: 18, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <div style={{ color: "#7f8b99", marginBottom: 8 }}>Utilizador atual</div>
                <div style={{ fontWeight: 700, color: "#17324d" }}>
                  <p>
                    {cameraState?.status === "available"
                      ? "—"
                      : profilesMap[cameraState?.current_user_id] ||
                      currentSession?.user_name ||
                      "—"}
                  </p>
                </div>
              </div>

              <div style={{ padding: 18, borderRadius: 18, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <div style={{ color: "#7f8b99", marginBottom: 8 }}>Box atual</div>
                <div style={{ fontWeight: 700, color: "#17324d" }}>
                  <p>{cameraState?.status === "in_use" ? cameraState?.current_box || "—" : "—"}</p>
                </div>
              </div>

              <div style={{ padding: 18, borderRadius: 18, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <div style={{ color: "#7f8b99", marginBottom: 8 }}>Sessão atual</div>
                <div style={{ fontWeight: 700, color: "#17324d", wordBreak: "break-word" }}>
                  <p>{cameraState?.status === "in_use" ? currentSession?.id || "—" : "—"}</p>
                </div>
              </div>

              <div style={{ padding: 18, borderRadius: 18, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <div style={{ color: "#7f8b99", marginBottom: 8 }}>Código do paciente</div>
                <div style={{ fontWeight: 700, color: "#17324d" }}>
                  <p>{cameraState?.status === "in_use" ? currentSession?.patient_code || "—" : "—"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            marginTop: 18,
            padding: 18,
            border: "1px solid #dbe5f0",
            borderRadius: 18,
            background: "#f8fbff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: "#1e4a8d",
                  fontSize: "1rem",
                  marginBottom: 4,
                }}
              >
                Fase da captura
              </div>
              <div style={{ color: "#6b7280", fontSize: "0.95rem" }}>
                Define em que etapa as próximas fotografias devem ser associadas.
              </div>
            </div>

            <div
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: "#e9f2fd",
                color: "#1e4a8d",
                fontWeight: 700,
              }}
            >
              Atual: {formatPhaseLabel(currentPhase)}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className={currentPhase === "before" ? "primary-btn" : "secondary-btn"}
              onClick={() => updatePhase("before")}
              type="button"
            >
              Inicial
            </button>

            <button
              className={currentPhase === "during" ? "primary-btn" : "secondary-btn"}
              onClick={() => updatePhase("during")}
              type="button"
            >
              Durante
            </button>

            <button
              className={currentPhase === "after" ? "primary-btn" : "secondary-btn"}
              onClick={() => updatePhase("after")}
              type="button"
            >
              Final
            </button>
          </div>
        </div>


        {canSeeSessionClinic && (
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              padding: 26,
              border: "1px solid #e4e9f0",
            }}
          >
            <h2 style={{ marginTop: 0, color: "#1e4a8d", fontSize: "1.7rem" }}>
              Sessão clínica
            </h2>

            <p style={{ color: "#5f6b7a", marginTop: 8 }}>
              Preparação da sessão ativa e carregamento de fotografias.
            </p>

            <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    color: "#5f6b7a",
                    fontWeight: 600,
                  }}
                >
                  Box
                </label>
                <input
                  value={currentSession && !isEditingSessionData ? box : currentSession && isEditingSessionData ? box : draftBox}
                  onChange={(e) => {
                    if (currentSession) {
                      setBox(e.target.value);
                    } else {
                      setDraftBox(e.target.value);
                    }
                  }}
                  placeholder="Introduza a Box"
                  disabled={!!currentSession && !isEditingSessionData}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    color: "#5f6b7a",
                    fontWeight: 600,
                  }}
                >
                  Código do paciente
                </label>
                <input
                  autoFocus={!currentSession}
                  value={
                    currentSession && !isEditingSessionData
                      ? patientCode
                      : currentSession && isEditingSessionData
                        ? patientCode
                        : draftPatientCode
                  }
                  onChange={(e) => {
                    if (currentSession) {
                      setPatientCode(e.target.value);
                    } else {
                      setDraftPatientCode(e.target.value);
                    }
                  }}
                  placeholder="Introduza o código"
                  disabled={!!currentSession && !isEditingSessionData}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canStartSessionFinal) {
                      startSession();
                    }
                  }}
                />
              </div>
            </div>

            {canEditSessionData && (
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                {!isEditingSessionData ? (
                  <button type="button" onClick={() => setIsEditingSessionData(true)}>
                    Editar
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={saveSessionData}>
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingSessionData(false);
                        setBox(currentSession?.box || "");
                        setPatientCode(currentSession?.patient_code || "");
                      }}
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            )}

            <div style={{ marginTop: 26 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 8,
                  color: "#5f6b7a",
                  fontWeight: 600,
                }}
              >
                Carregar fotografias
              </label>

              <select
                value={photoPhase}
                onChange={(e) => setPhotoPhase(e.target.value)}
                disabled={!currentSession || uploadingPhoto}
                style={{ marginBottom: 12 }}
              >
                <option value="before">Inicial</option>
                <option value="during">Durante</option>
                <option value="after">Final</option>
              </select>

              <input
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                disabled={!currentSession || uploadingPhoto}
                style={{ marginBottom: 12 }}
              />

              <button
                type="button"
                disabled={!currentSession || !selectedFile || uploadingPhoto}
                onClick={uploadPhoto}
              >
                {uploadingPhoto ? "A carregar..." : "Carregar fotografia"}
              </button>
            </div>
          </div>
        )}

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
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: "#1e4a8d", fontSize: "1.7rem" }}>
              Fila ativa
            </h2>
            <p style={{ color: "#5f6b7a", margin: "8px 0 0 0" }}>
              Utilizadores atualmente em espera ou notificados.
            </p>
          </div>
        </div>


        {loading ? (
          <p>A carregar fila...</p>
        ) : queueEntries.length === 0 ? (
          <p>Não há utilizadores na fila.</p>
        ) : (
          <div className="table-wrapper">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Posição</th>
                  <th>Nome</th>
                  <th>Box</th>
                  <th>Estado</th>
                  <th>Entrou em</th>
                  <th>Notificado em</th>
                </tr>
              </thead>
              <tbody>
                {queueEntries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td>{index + 1}</td>
                    <td>{profilesMap[entry.user_id] || entry.user_id}</td>
                    <td>{entry.current_box || "—"}</td>
                    <td>
                      <span
                        className="status-pill"
                        style={{
                          background:
                            entry.status === "notified" ? "#fdf2dc" : "#e8f2fd",
                          color:
                            entry.status === "notified" ? "#c7952d" : "#1e4a8d",
                        }}
                      >
                        {entry.status}
                      </span>
                    </td>
                    <td>
                      {entry.joined_at
                        ? new Date(entry.joined_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {entry.notified_at
                        ? new Date(entry.notified_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 18,
            }}
          >
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setRecordsFilterMode("active")}
                style={{
                  opacity: recordsFilterMode === "active" ? 1 : 0.7,
                }}
              >
                Ativos
              </button>

              <button
                type="button"
                onClick={() => setRecordsFilterMode("archived")}
                style={{
                  opacity: recordsFilterMode === "archived" ? 1 : 0.7,
                }}
              >
                Arquivados
              </button>

              <button
                type="button"
                onClick={() => setRecordsFilterMode("all")}
                style={{
                  opacity: recordsFilterMode === "all" ? 1 : 0.7,
                }}
              >
                Todos
              </button>
            </div>

            <div>
              <h2 style={{ margin: 0, color: "#1e4a8d", fontSize: "1.7rem" }}>
                {isTeacher
                  ? "Registos atribuídos"
                  : recordsView === "all"
                    ? "Todos os registos"
                    : "Meus registos"}
              </h2>
              <p style={{ color: "#5f6b7a", margin: "8px 0 0" }}>
                {isTeacher && recordsView === "assigned"
                  ? "Consulta dos registos clínicos aos quais tens acesso."
                  : recordsView === "all"
                    ? "Consulta global dos registos do módulo."
                    : "Consulta das tuas sessões clínicas e respetivas fotografias."}
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                className={recordsView === "mine" ? "primary-btn" : "soft-btn"}
                onClick={() => setRecordsView("mine")}
              >
                Meus registos
              </button>

              {isTeacher && (
                <button
                  className={recordsView === "assigned" ? "primary-btn" : "soft-btn"}
                  onClick={() => setRecordsView("assigned")}
                >
                  Registos atribuídos
                </button>
              )}

              {canViewAllRecords && (
                <button
                  className={recordsView === "all" ? "primary-btn" : "soft-btn"}
                  onClick={() => setRecordsView("all")}
                >
                  Todos os registos
                </button>
              )}
            </div>
          </div>


          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(140px, 1fr))",
              gap: 12,
              width: "100%",
            }}
          >
            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
            <input
              type="text"
              placeholder="Nome"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Cod paciente"
              value={filterPatientCode}
              onChange={(e) => setFilterPatientCode(e.target.value)}
            />
            <input
              type="text"
              placeholder="Box"
              value={filterBox}
              onChange={(e) => setFilterBox(e.target.value)}
            />
            <input
              type="text"
              placeholder="Estado"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <p style={{ color: "#5f6b7a" }}>Ainda não existem registos para mostrar.</p>
        ) : (
          <div className="table-wrapper">
            <table className="styled-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nome</th>
                  <th>Cod paciente</th>
                  <th>Box</th>
                  <th>Estado</th>
                  <th>Nº fotos</th>
                  <th>Consultar</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {record.started_at
                        ? new Date(record.started_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>{record.user_name || "—"}</td>
                    <td>{record.patient_code || "—"}</td>
                    <td>{record.box || "—"}</td>
                    <td>{formatSessionStatus(record.status)}</td>
                    <td>{record.photos_count}</td>
                    <td>
                      <button
                        className="secondary-btn"
                        onClick={() => openRecordModal(record)}
                      >
                        🔍
                      </button>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {record.is_archived && (
                          <div style={{ color: "#b45309", fontWeight: 600 }}>
                            Arquivado
                            {record.archived_at
                              ? ` em ${new Date(record.archived_at).toLocaleString()}`
                              : ""}
                            {record.archived_by_name ||
                              profilesMap[record.archived_by_user_id] ||
                              record.archived_by_user_id}
                          </div>
                        )}

                        {!record.is_archived && !(isTeacher && recordsView === "assigned") && (
                          <button
                            type="button"
                            disabled={recordActionLoadingId === record.id}
                            onClick={() =>
                              openConfirmModal({
                                title: "Arquivar registo",
                                message:
                                  "Este registo deixará de aparecer na lista de ativos, mas poderá ser restaurado por um administrador.",
                                confirmText: "Arquivar",
                                type: "warning",
                                action: () => archiveRecord(record.id),
                              })
                            }
                          >
                            {recordActionLoadingId === record.id ? "A arquivar..." : "Arquivar"}
                          </button>
                        )}

                        {record.is_archived && canViewAllRecords && (
                          <>
                            <button
                              type="button"
                              disabled={recordActionLoadingId === record.id}
                              onClick={() =>
                                openConfirmModal({
                                  title: "Restaurar registo",
                                  message: "Este registo voltará a aparecer na lista de ativos.",
                                  confirmText: "Restaurar",
                                  type: "success",
                                  action: () => restoreRecord(record.id),
                                })
                              }
                            >
                              {recordActionLoadingId === record.id ? "A restaurar..." : "Restaurar"}
                            </button>
                            <button
                              type="button"
                              disabled={recordActionLoadingId === record.id}
                              onClick={() =>
                                openConfirmModal({
                                  title: "Eliminar definitivamente",
                                  message:
                                    "Esta ação é irreversível. O registo será eliminado permanentemente.",
                                  confirmText: "Eliminar definitivo",
                                  type: "danger",
                                  action: () => deleteRecordPermanently(record.id),
                                })
                              }
                            >
                              {recordActionLoadingId === record.id
                                ? "A eliminar..."
                                : "Eliminar definitivo"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isRecordModalOpen && selectedRecord && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1000,
          }}
          onClick={closeRecordModal}
        >
          <div
            className="card"
            style={{
              width: "min(1080px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: 28,
              background: "#ffffff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                marginBottom: 22,
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: "#1e4a8d" }}>Detalhes do registo</h2>
                <p style={{ margin: "8px 0 0 0", color: "#5f6b7a" }}>
                  Consulta do histórico fotográfico e informação da sessão.
                </p>

                {selectedRecord?.status === "paused" &&
                  selectedRecord?.user_id === currentUserId && (
                    <div style={{ marginBottom: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {isMyTurn ? (
                        <button
                          className="primary-btn"
                          onClick={() => resumeSession(selectedRecord)}
                        >
                          Retomar sessão
                        </button>
                      ) : (
                        <button
                          className="secondary-btn"
                          onClick={async () => {
                            setPendingResumeRecord(selectedRecord);
                            await joinQueue();
                            closeRecordModal();
                          }}
                        >
                          Entrar na fila para retomar
                        </button>
                      )}
                    </div>
                  )}

              </div>

              <button className="secondary-btn" onClick={closeRecordModal}>
                Fechar
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <strong>Data:</strong><br />
                {selectedRecord.started_at
                  ? new Date(selectedRecord.started_at).toLocaleString()
                  : "—"}
              </div>

              <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <strong>Nome:</strong><br />
                {selectedRecord.user_name || "—"}
              </div>

              <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <strong>Código  do Paciente:</strong><br />
                {selectedRecord.patient_code || "—"}
              </div>

              <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <strong>Box:</strong><br />
                {selectedRecord.box || "—"}
              </div>

              <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <strong>Estado:</strong><br />
                {formatSessionStatus(selectedRecord.status)}
              </div>

              <div style={{ padding: 16, borderRadius: 16, background: "#f8fafc", border: "1px solid #e4e9f0" }}>
                <strong>ID da sessão:</strong><br />
                {selectedRecord.id}
              </div>
            </div>
            <div style={{ marginTop: 24 }}>
              <h3 style={{ color: "#1e4a8d", marginBottom: 12 }}>
                Professores com acesso
              </h3>

              <div style={{ marginBottom: 14 }}>
                {sessionTeachers.length === 0 ? (
                  <p style={{ color: "#5f6b7a", margin: 0 }}>
                    Nenhum professor associado a este registo.
                  </p>
                ) : (
                  sessionTeachers.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "#f1f5f9",
                        color: "#17324d",
                        fontWeight: 600,
                        marginRight: 8,
                        marginBottom: 8,
                      }}
                    >
                      <span>{item.teacher?.full_name || item.teacher_user_id}</span>

                      <button
                        type="button"
                        disabled={loadingTeachers}
                        onClick={() => removeTeacherFromSession(item.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#b91c1c",
                          fontWeight: 800,
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                        title="Remover professor"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #dbe3ec",
                    background: "#fff",
                    fontSize: 14,
                  }}
                >
                  <option value="">Selecionar professor</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.full_name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={!selectedTeacherId || loadingTeachers}
                  onClick={assignTeacherToSession}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "#1e4a8d",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: !selectedTeacherId || loadingTeachers ? 0.6 : 1,
                  }}
                >
                  {loadingTeachers ? "A associar..." : "Associar"}
                </button>
              </div>
            </div>

            <div>
              <h3 style={{ color: "#1e4a8d", marginBottom: 16 }}>
                Fotografias associadas
              </h3>

              {selectedRecordPhotos.length === 0 ? (
                <p style={{ color: "#5f6b7a" }}>
                  Este registo ainda não tem fotografias associadas.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 28 }}>
                  {[
                    { key: "before", label: "Inicial" },
                    { key: "during", label: "Durante" },
                    { key: "after", label: "Final" },
                  ].map((section) => {
                    const phasePhotos = groupedSelectedRecordPhotos[section.key];

                    return (
                      <div key={section.key}>
                        <h4
                          style={{
                            color: "#1e4a8d",
                            marginBottom: 12,
                          }}
                        >
                          {section.label}
                        </h4>

                        {phasePhotos.length === 0 ? (
                          <p style={{ color: "#5f6b7a" }}>
                            Sem fotografias nesta categoria.
                          </p>
                        ) : (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: 16,
                            }}
                          >
                            {phasePhotos.map((photo) => (
                              <div
                                key={photo.id}
                                style={{
                                  border: "1px solid #e4e9f0",
                                  borderRadius: 18,
                                  padding: 12,
                                  background: "#f8fafc",
                                }}
                              >
                                <div
                                  style={{
                                    width: "100%",
                                    aspectRatio: "4 / 3",
                                    borderRadius: 14,
                                    overflow: "hidden",
                                    background: "#eef3f8",
                                    marginBottom: 10,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {photoPreviewMap[photo.id] ? (
                                    <img
                                      src={photoPreviewMap[photo.id]}
                                      alt={section.label}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        cursor: "pointer",
                                      }}
                                      onClick={() => openPhoto(photo.storage_path)}
                                    />
                                  ) : (
                                    <span style={{ color: "#7f8b99", fontSize: "0.9rem" }}>
                                      Sem preview
                                    </span>
                                  )}
                                </div>

                                <div
                                  style={{
                                    color: "#5f6b7a",
                                    fontSize: "0.92rem",
                                    marginBottom: 10,
                                  }}
                                >
                                  {new Date(photo.captured_at).toLocaleString()}
                                </div>

                                <button
                                  className="secondary-btn"
                                  onClick={() => openPhoto(photo.storage_path)}
                                  style={{ width: "100%" }}
                                >
                                  Abrir fotografia
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {showTurnModal && isMyTurn && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1200,
          }}
          onClick={() => setShowTurnModal(false)}
        >
          <div
            className="card"
            style={{
              width: "min(560px, 100%)",
              padding: 30,
              background: "#ffffff",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="badge badge-blue"
              style={{ width: "fit-content", margin: "0 auto 18px auto" }}
            >
              Notificação
            </div>

            <h2 style={{ marginTop: 0, color: "#1e4a8d", fontSize: "2rem" }}>
              É a tua vez
            </h2>

            <p style={{ color: "#5f6b7a", fontSize: "1.05rem", marginBottom: 20 }}>
              A câmara está reservada para ti. Podes iniciar a sessão agora.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 14,
                marginBottom: 22,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "#f8fafc",
                  border: "1px solid #e4e9f0",
                }}
              >
                <strong>Box</strong>
                <br />
                {box || cameraState?.current_box || "—"}
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 14,
                  background: "#f8fafc",
                  border: "1px solid #e4e9f0",
                }}
              >
                <strong>Tempo limite</strong>
                <br />
                {myNotifiedEntry?.expires_at
                  ? new Date(myNotifiedEntry.expires_at).toLocaleTimeString()
                  : "—"}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <button
                className="primary-btn"
                onClick={async () => {
                  setShowTurnModal(false);

                  if (pendingResumeRecord) {
                    await resumeSession(pendingResumeRecord);
                  } else {
                    await startSession();
                  }
                }}
              >
                {pendingResumeRecord ? "Retomar sessão" : "Iniciar sessão"}
              </button>

              <button
                className="secondary-btn"
                onClick={() => setShowTurnModal(false)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              padding: 28,
              width: "100%",
              maxWidth: 460,
              boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 18,
                background:
                  confirmModal.type === "danger"
                    ? "#fee2e2"
                    : confirmModal.type === "success"
                      ? "#dcfce7"
                      : "#fef3c7",
                color:
                  confirmModal.type === "danger"
                    ? "#b91c1c"
                    : confirmModal.type === "success"
                      ? "#15803d"
                      : "#b45309",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {confirmModal.type === "danger"
                ? "!"
                : confirmModal.type === "success"
                  ? "✓"
                  : "?"}
            </div>

            <h3 style={{ margin: 0, color: "#17324d", fontSize: "1.4rem" }}>
              {confirmModal.title}
            </h3>

            <p style={{ color: "#5f6b7a", marginTop: 12, lineHeight: 1.6 }}>
              {confirmModal.message}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                marginTop: 24,
              }}
            >
              <button type="button" onClick={closeConfirmModal}>
                Cancelar
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (confirmModal.action) {
                    await confirmModal.action();
                  }
                  closeConfirmModal();
                }}
                style={{
                  background:
                    confirmModal.type === "danger" ? "#b91c1c" : "#1e4a8d",
                  color: "#fff",
                }}
              >
                {confirmModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>


  );
}