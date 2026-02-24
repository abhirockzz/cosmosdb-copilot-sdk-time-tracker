import { ipcMain } from "electron";
import { saveEntry, queryEntries, bulkCreateEntries, TimeEntry } from "./cosmos";
import { aiQuery } from "./copilot";
import { generateSeedEntries } from "./seed-data";

export function registerIpcHandlers() {
  // CRUD operations go directly to Cosmos DB — no AI overhead
  ipcMain.handle(
    "save-entry",
    async (_event, entry: TimeEntry) => {
      try {
        return await saveEntry(entry);
      } catch (err: any) {
        console.error("save-entry error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    "query-entries",
    async (_event, userId: string, startDate?: string, endDate?: string) => {
      try {
        return await queryEntries(userId, startDate, endDate);
      } catch (err: any) {
        console.error("query-entries error:", err);
        return [];
      }
    }
  );

  // Seed sample data for a user
  ipcMain.handle("seed-data", async (_event, userId: string) => {
    try {
      const entries = generateSeedEntries(userId);
      console.log(`[SEED] Generating ${entries.length} sample entries for ${userId}...`);
      const { saved, failed } = await bulkCreateEntries(entries);
      console.log(`[SEED] Saved ${saved}/${entries.length} entries for ${userId} (${failed} failed)`);
      return { success: true, count: saved };
    } catch (err: any) {
      console.error("seed-data error:", err);
      return { success: false, error: err.message };
    }
  });

  // AI query uses Copilot SDK — the LLM adds genuine value here
  ipcMain.handle(
    "ai-query",
    async (_event, question: string, userId: string) => {
      try {
        return await aiQuery(question, userId);
      } catch (err: any) {
        console.error("ai-query error:", err);
        return `Error: ${err.message}`;
      }
    }
  );
}
