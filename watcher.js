import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const WATCH_FOLDER = "Z:/EM Capture/incoming";
const PROCESSED_FOLDER = "Z:/EM Capture/processed";
const ERROR_FOLDER = "Z:/EM Capture/error";

const API_URL = "http://localhost:3001/api/photos/ingest";
const ACTIVE_SESSION_URL = "http://localhost:3001/api/camera/active-session";

// coloca aqui o camera_id real que usas no sistema
const CAMERA_ID = "00000000-0000-0000-0000-000000000001";

// coloca aqui o token, se o endpoint ainda estiver protegido
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFoc3ZsaXlsd294aHJheWl4a3BvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY1ODIwOCwiZXhwIjoyMDg4MjM0MjA4fQ.8Y27mr0nKlBeBbKWydIe_R2Np-YFkXkJS7ZF-huI4qY";

console.log("WATCH_FOLDER =", WATCH_FOLDER);
console.log("EXISTE PASTA?", fs.existsSync(WATCH_FOLDER));

async function moveFile(sourcePath, targetFolder) {
  try {
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetFolder, fileName);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    fs.renameSync(sourcePath, targetPath);
    console.log(`📁 Ficheiro movido para: ${targetPath}`);
  } catch (error) {
    console.error("Erro ao mover ficheiro:", error.message);
  }
}

async function getActiveSessionInfo() {
  const response = await axios.get(ACTIVE_SESSION_URL, {
    params: {
      cameraId: CAMERA_ID,
    },
    headers: TOKEN
      ? {
          Authorization: `Bearer ${TOKEN}`,
        }
      : {},
  });

  return response.data;
}

async function handleNewFile(filePath) {
  try {
    console.log("📸 Nova foto detectada:", filePath);

    const fileBuffer = fs.readFileSync(filePath);

    const sessionInfo = await getActiveSessionInfo();
    console.log("Sessão ativa:", sessionInfo);

    if (!sessionInfo?.hasActiveSession) {
      console.log("⏸ Sem sessão ativa. Foto ignorada.");
      await moveFile(filePath, ERROR_FOLDER);
      return;
    }

    const phase = sessionInfo.currentPhase || "during";
    console.log("Fase enviada para upload:", phase);

    const formData = new FormData();
    formData.append("photo", fileBuffer, path.basename(filePath));
    formData.append("cameraId", CAMERA_ID);
    formData.append("phase", phase);

    const response = await axios.post(API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        ...(TOKEN
          ? {
               Authorization: `Bearer ${TOKEN}`,

            }
          : {}),
      },
      maxBodyLength: Infinity,
    });

    console.log("✅ Upload feito:", response.data);

    await moveFile(filePath, PROCESSED_FOLDER);
  } catch (error) {
    console.error("❌ Erro ao enviar foto:", error.message);

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Resposta:", error.response.data);
    }

    await moveFile(filePath, ERROR_FOLDER);
  }
}

const watcher = chokidar.watch(WATCH_FOLDER, {
  ignored: /^\./,
  persistent: true,
  ignoreInitial: true,
  usePolling: true,
  interval: 1000,
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 200,
  },
});

console.log("👀 A observar pasta:", WATCH_FOLDER);

watcher.on("add", (filePath) => {
  console.log("EVENTO ADD:", filePath);
  handleNewFile(filePath);
});

watcher.on("change", (filePath) => {
  console.log("EVENTO CHANGE:", filePath);
});

watcher.on("error", (error) => {
  console.error("ERRO WATCHER:", error);
});

watcher.on("ready", () => {
  console.log("✅ Watcher pronto.");
});













