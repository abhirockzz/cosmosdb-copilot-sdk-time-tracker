import { CopilotClient, CopilotSession, defineTool } from "@github/copilot-sdk";
import { BrowserWindow } from "electron";
import { z } from "zod";
import path from "path";
import { runQuery } from "./cosmos";

// Resolve the Copilot CLI path. When running inside Electron, the bundled
// Node is too old for the CLI (needs node:sqlite from Node 22.5+).
function resolveCLIPath(): string {
  if (process.env.COPILOT_CLI_PATH) {
    return process.env.COPILOT_CLI_PATH;
  }
  const { execSync } = require("child_process");
  try {
    const systemPath = execSync("which copilot", { encoding: "utf-8" }).trim();
    if (systemPath) return systemPath;
  } catch {}
  return path.join(__dirname, "..", "..", "node_modules", "@github", "copilot", "index.js");
}

// --- Single agentic tool: let the model write SQL ---

let currentQueryUserId = "";

const queryTool = defineTool("query_time_data", {
  description: `Execute a read-only Cosmos DB SQL query against the time entries container.

Container fields (alias: c):
- c.description (string): task description, e.g. "API endpoint refactoring"
- c.project (string): project name — "engineering", "meetings", "docs", "design", "ops"
- c.tag (string): category — "backend", "frontend", "planning", "review", "infra"
- c.startTime (string): ISO 8601 start timestamp
- c.stopTime (string): ISO 8601 stop timestamp
- c.duration (number): duration in seconds

Cosmos DB SQL tips:
- DateTimePart("dw", c.startTime) → day of week (0=Sun … 6=Sat)
- DateTimePart("hh", c.startTime) → hour of day
- LEFT(c.startTime, 10) → date string "YYYY-MM-DD"
- Aggregates: SUM(), COUNT(), AVG(), MIN(), MAX()
- GROUP BY supports property refs and expressions like DateTimePart(...)
- ORDER BY with GROUP BY: do NOT use aliases or aggregate expressions. Omit ORDER BY and sort client-side instead.

IMPORTANT: Do NOT filter by userId in your query — it is auto-injected for security.`,
  parameters: z.object({
    query: z.string().describe("Cosmos DB SQL query using 'c' as alias. No userId filter needed."),
  }),
  handler: async ({ query }) => {
    console.log(`[TOOL] query_time_data called: ${query}`);
    const result = await runQuery(currentQueryUserId, query);
    if (result.error) {
      console.log(`[TOOL] query_time_data error: ${result.error}`);
      return JSON.stringify({ error: result.error });
    }
    console.log(`[TOOL] query_time_data returned ${result.results!.length} results`);
    return JSON.stringify(result.results);
  },
});

// --- BYOK provider helpers ---

function isLocalModel(): boolean {
  return !!process.env.BYOK_LOCAL_URL;
}

function buildProviderConfig(): { model: string; provider?: object } {
  // Local OpenAI-compatible provider (Ollama, Foundry Local, etc.)
  const localUrl = process.env.BYOK_LOCAL_URL;
  if (localUrl) {
    const model = process.env.BYOK_LOCAL_MODEL || "qwen3";
    const provider: Record<string, string> = {
      type: "openai",
      baseUrl: localUrl,
    };
    if (process.env.BYOK_LOCAL_API_KEY) {
      provider.apiKey = process.env.BYOK_LOCAL_API_KEY;
    }
    console.log(`[BYOK] Using local model "${model}" at ${localUrl}`);
    return { model, provider };
  }

  // Azure AI Foundry
  const endpoint = process.env.BYOK_AZURE_ENDPOINT;
  if (endpoint) {
    const model = process.env.BYOK_AZURE_MODEL || "gpt-4o";
    const apiKey = process.env.BYOK_AZURE_API_KEY;
    if (!apiKey) {
      console.warn("[BYOK] BYOK_AZURE_ENDPOINT is set but BYOK_AZURE_API_KEY is missing — falling back to Copilot model");
      return { model: "gpt-4.1" };
    }
    const apiVersion = process.env.BYOK_AZURE_API_VERSION || "2024-10-21";
    console.log(`[BYOK] Using Azure model "${model}" at ${endpoint} (API version: ${apiVersion})`);
    return {
      model,
      provider: {
        type: "azure",
        baseUrl: endpoint,
        apiKey,
        azure: { apiVersion },
      },
    };
  }

  // Default: Copilot model (configurable via env var)
  return { model: process.env.COPILOT_MODEL || "gpt-4.1" };
}

// --- Copilot client + session ---

let client: CopilotClient;
let session: CopilotSession;

export async function initCopilot(): Promise<void> {
  client = new CopilotClient({ logLevel: "error", cliPath: resolveCLIPath() });
  await client.start();

  const today = new Date().toISOString().split("T")[0];
  const { model, provider } = buildProviderConfig();

  // Shorter prompt for local models — existing cloud prompt is unchanged
  const systemContent = isLocalModel()
    ? `Time tracking assistant. Answer questions about user's time data using the query_time_data tool.
Today: ${today}. Durations are in seconds — convert to hours/minutes (e.g. "2h 30m").
ALWAYS call query_time_data. Never guess data. Keep answers short.`
    : `You are a time tracking assistant. You help users analyze their time data by writing Cosmos DB SQL queries.

You have one tool: query_time_data. Write SQL queries to answer any question about the user's time entries. The tool handles userId filtering automatically.

RULES:
1. Today's date is ${today}
2. Always use the query_time_data tool — never guess or make up data
3. Write efficient queries: use GROUP BY and aggregates instead of fetching all raw entries
4. Format durations as hours and minutes (e.g., "2h 30m"). Durations are stored in seconds.
5. Keep answers concise and conversational
6. If a query fails, read the error and try a corrected query`;

  session = await client.createSession({
    model,
    ...(provider && { provider }),
    streaming: true,
    onPermissionRequest: async () => ({ kind: "approved" as const }),
    tools: [queryTool],
    systemMessage: {
      mode: "replace",
      content: systemContent,
    },
  });
}

export async function destroyCopilot(): Promise<void> {
  try {
    if (session) await session.destroy();
  } catch {}
  try {
    if (client) await client.stop();
  } catch {}
}

// Serialize AI queries on the shared session
let opQueue: Promise<any> = Promise.resolve();

export async function aiQuery(question: string, userId: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  console.log(`\n[AI-QUERY] User "${userId}" asks: "${question}"`);

  // Set the userId for the tool handler to use
  currentQueryUserId = userId;

  const prompt = `The current user is "${userId}". Today is ${today}.\n\n${question}`;

  const op = opQueue.then(
    () =>
      new Promise<string>((resolve, reject) => {
        let response = "";
        const startTime = Date.now();
        const timeoutMs = isLocalModel() ? 180000 : 60000;
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error("Operation timed out"));
        }, timeoutMs);

        const win = BrowserWindow.getAllWindows()[0];

        const unsub = session.on((event: any) => {
          switch (event.type) {
            case "tool.call":
              console.log(
                `[AI → TOOL] ${event.data?.name}`,
                JSON.stringify(event.data?.parameters ?? {})
              );
              break;
            case "tool.result": {
              const result = event.data?.content ?? event.data?.result ?? "";
              const preview =
                typeof result === "string"
                  ? result.slice(0, 200)
                  : JSON.stringify(result).slice(0, 200);
              console.log(`[TOOL → AI] ${preview}${preview.length >= 200 ? "..." : ""}`);
              break;
            }
            case "assistant.message_delta":
              if (event.data?.content) {
                response += event.data.content;
                win?.webContents.send("ai-stream-chunk", event.data.content);
              }
              break;
            case "assistant.message":
              if (event.data?.content) {
                response = event.data.content;
                console.log(
                  `[AI] ${response.slice(0, 200)}${response.length > 200 ? "..." : ""}`
                );
              }
              break;
            case "assistant.usage":
              if (event.data?.model) {
                console.log(`[MODEL] ${event.data.model} | tokens: ${event.data.inputTokens}→${event.data.outputTokens} | ${event.data.duration}ms`);
              }
              break;
            case "session.idle":
              console.log(
                `[TIMING] AI query completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`
              );
              win?.webContents.send("ai-stream-done");
              cleanup();
              resolve(response);
              break;
            case "session.error":
              console.error(`[ERROR] ${event.data?.message || "Session error"}`);
              win?.webContents.send("ai-stream-done");
              cleanup();
              reject(new Error(event.data?.message || "Session error"));
              break;
          }
        });

        function cleanup() {
          clearTimeout(timeout);
          unsub();
        }

        session.send({ prompt }).catch((err: Error) => {
          cleanup();
          reject(err);
        });
      })
  );

  opQueue = op.catch(() => {});
  return op;
}
