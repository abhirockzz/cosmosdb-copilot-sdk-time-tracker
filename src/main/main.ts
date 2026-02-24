import "dotenv/config";
import { app, BrowserWindow } from "electron";
import path from "path";
import { initCosmos } from "./cosmos";
import { initCopilot, destroyCopilot } from "./copilot";
import { registerIpcHandlers } from "./ipc-handlers";

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    console.log("Connecting to Cosmos DB...");
    await initCosmos();

    console.log("Initializing Copilot SDK...");
    await initCopilot();
    console.log("Ready.");
  } catch (err) {
    console.error("Failed to initialize:", err);
    app.quit();
    return;
  }

  registerIpcHandlers();
  await createWindow();
});

app.on("window-all-closed", async () => {
  await destroyCopilot();
  app.quit();
});
