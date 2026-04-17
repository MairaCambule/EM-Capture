import chokidar from "chokidar";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";

const WATCH_FOLDER = "Z:/EM Capture/incoming";
const PROCESSED_FOLDER = "Z:/EM Capture/processed";
const ERROR_FOLDER = "Z:/EM Capture/error";

const API_URL = "https://em-capture-backend.onrender.com/api/photos/ingest";
const ACTIVE_SESSION_URL =
  "https://em-capture-backend.onrender.com/api/camera/active-session";

// camera_id real
const CAMERA_ID = "00000000-0000-0000-0000-000000000001";

// Se /api/photos/ingest NÃO estiver protegido, deixa vazio:
const TOKEN = "";

console.log("WATCH_FOLDER =", WATCH_FOLDER);
console.log("EXISTE PASTA?", fs.existsSync(WATCH_FOLDER));

async function moveFile(sourcePath, targetFolder) {
  try {
    if (!fs.existsSync(sourcePath)) {
      console.log("⚠️ Ficheiro já não existe, não foi movido:", sourcePath);
      return;
    }

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
  try {
    console.log("🔍 A chamar active-session API...");

    const response = await axios.get(ACTIVE_SESSION_URL, {
      params: {
        cameraId: CAMERA_ID,
      },
    });

    console.log("✅ Resposta active-session:", response.data);

    return response.data;
  } catch (err) {
    console.error("❌ ERRO active-session:");
    console.error(err.message);
    console.error(err.response?.status);
    console.error(err.response?.data);
    throw err;
  }
}

async function handleNewFile(filePath) {
  try {
    console.log("📸 Nova foto detectada:", filePath);

    if (!fs.existsSync(filePath)) {
      console.log("⚠️ O ficheiro já não existe no momento da leitura.");
      return;
    }

    console.log("➡️ A pedir sessão ativa...");
    const sessionInfo = await getActiveSessionInfo();
    console.log("✅ Sessão ativa recebida:", sessionInfo);

    if (!sessionInfo?.hasActiveSession) {
      console.log("⏸ Sem sessão ativa. Foto ignorada.");
      await moveFile(filePath, ERROR_FOLDER);
      return;
    }

    const phase = sessionInfo.currentPhase || "during";
    console.log("📌 Fase:", phase);

    const fileBuffer = fs.readFileSync(filePath);

    const ext = path.extname(filePath).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";

    const formData = new FormData();
    formData.append("photo", fileBuffer, {
      filename: path.basename(filePath),
      contentType,
    });
    formData.append("cameraId", CAMERA_ID);
    formData.append("phase", phase);

    console.log("📡 A enviar foto para API...");
    console.log("API_URL:", API_URL);

    const response = await axios.post(API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
    });

    console.log("✅ Upload feito:", response.data);

    await moveFile(filePath, PROCESSED_FOLDER);
  } catch (err) {
    console.error("❌ ERRO COMPLETO:");
    console.error(err);
    console.error("❌ Message:", err.message);
    console.error("❌ Code:", err.code);
    console.error("❌ Status:", err.response?.status);
    console.error("❌ Data:", err.response?.data);

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