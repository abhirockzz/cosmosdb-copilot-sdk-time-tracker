import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  saveEntry: (entry: any) => ipcRenderer.invoke("save-entry", entry),
  queryEntries: (userId: string, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke("query-entries", userId, startDate, endDate),
  aiQuery: (question: string, userId: string) =>
    ipcRenderer.invoke("ai-query", question, userId),
  seedData: (userId: string) => ipcRenderer.invoke("seed-data", userId),
  onAiStreamChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.on("ai-stream-chunk", (_event, chunk) => callback(chunk));
  },
  onAiStreamDone: (callback: () => void) => {
    ipcRenderer.on("ai-stream-done", () => callback());
  },
});
