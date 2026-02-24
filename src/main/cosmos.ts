import { CosmosClient, Container, Database, OperationInput, BulkOperationType } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { v4 as uuidv4 } from "uuid";

export interface TimeEntry {
  userId: string;
  description: string;
  project?: string;
  tag?: string;
  startTime: string;
  stopTime: string;
  duration: number;
}

export interface EntryFilter {
  userId: string;
  startDate?: string;
  endDate?: string;
  project?: string;
  tag?: string;
}

let client: CosmosClient;
let container: Container;

const EMULATOR_KEY = "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==";
const EMULATOR_ENDPOINT = "http://localhost:8081";

const cosmosConfig = {
  endpoint: process.env.COSMOS_ACCOUNT || "",
  database: process.env.COSMOS_DATABASE || "timetracker",
  container: process.env.COSMOS_CONTAINER || "timeEntries",
};

export async function initCosmos(): Promise<void> {
  const useEmulator = process.env.USE_EMULATOR === "true";

  if (useEmulator) {
    const endpoint = process.env.COSMOS_EMULATOR_ENDPOINT || EMULATOR_ENDPOINT;
    client = new CosmosClient({ endpoint, key: EMULATOR_KEY });
    console.log(`[COSMOS] Using emulator at ${endpoint}`);
  } else {
    if (!cosmosConfig.endpoint)
      throw new Error("COSMOS_ACCOUNT environment variable is required");
    const credential = new DefaultAzureCredential();
    client = new CosmosClient({ endpoint: cosmosConfig.endpoint, aadCredentials: credential });
  }

  const db = client.database(cosmosConfig.database);
  container = db.container(cosmosConfig.container);

  // Verify connectivity
  const { resource } = await container.read();
  console.log(`[COSMOS] Connected to ${cosmosConfig.database}/${cosmosConfig.container}`);
}

export async function saveEntry(
  entry: TimeEntry
): Promise<{ success: boolean; id: string }> {
  const id = uuidv4();
  const item = { ...entry, id };
  const start = Date.now();

  try {
    await container.items.create(item);
    console.log(
      `[COSMOS] Saved entry "${entry.description}" (${((Date.now() - start) / 1000).toFixed(2)}s)`
    );
    return { success: true, id };
  } catch (err: any) {
    console.error(`[COSMOS] Save failed:`, err.message);
    return { success: false, id };
  }
}

/**
 * Bulk-insert entries using Cosmos DB batch API (max 100 per batch, same partition).
 */
export async function bulkCreateEntries(
  entries: TimeEntry[]
): Promise<{ saved: number; failed: number }> {
  const start = Date.now();
  let saved = 0;
  let failed = 0;

  // All entries share the same userId (partition key), batch in chunks of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const operations: OperationInput[] = chunk.map((entry) => ({
      operationType: BulkOperationType.Create,
      resourceBody: { ...entry, id: uuidv4() },
    }));

    try {
      const response = await container.items.batch(operations, chunk[0].userId);
      for (const result of response.result) {
        if (result.statusCode >= 200 && result.statusCode < 300) {
          saved++;
        } else {
          failed++;
        }
      }
    } catch (err: any) {
      console.error(`[COSMOS] Batch insert failed:`, err.message);
      failed += chunk.length;
    }
  }

  console.log(
    `[COSMOS] Bulk insert: ${saved} saved, ${failed} failed (${((Date.now() - start) / 1000).toFixed(2)}s)`
  );
  return { saved, failed };
}

export async function queryEntries(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<any[]> {
  const start = Date.now();
  const params: { name: string; value: string }[] = [
    { name: "@userId", value: userId },
  ];
  let where = "WHERE c.userId = @userId";

  if (startDate) {
    where += " AND c.startTime >= @startDate";
    params.push({ name: "@startDate", value: startDate });
  }
  if (endDate) {
    where += " AND c.startTime < @endDate";
    params.push({ name: "@endDate", value: endDate });
  }

  const query = `SELECT * FROM c ${where} ORDER BY c.startTime DESC`;
  console.log(`[COSMOS] Query: ${query}`);

  const { resources } = await container.items
    .query({ query, parameters: params }, { partitionKey: userId })
    .fetchAll();

  console.log(
    `[COSMOS] Returned ${resources.length} entries (${((Date.now() - start) / 1000).toFixed(2)}s)`
  );
  return resources;
}

export async function queryEntriesByFilter(filter: EntryFilter): Promise<any[]> {
  const params: { name: string; value: string }[] = [
    { name: "@userId", value: filter.userId },
  ];
  let where = "WHERE c.userId = @userId";

  if (filter.startDate) {
    where += " AND c.startTime >= @startDate";
    params.push({ name: "@startDate", value: filter.startDate });
  }
  if (filter.endDate) {
    where += " AND c.startTime < @endDate";
    params.push({ name: "@endDate", value: filter.endDate });
  }
  if (filter.project) {
    where += " AND c.project = @project";
    params.push({ name: "@project", value: filter.project });
  }
  if (filter.tag) {
    where += " AND c.tag = @tag";
    params.push({ name: "@tag", value: filter.tag });
  }

  const query = `SELECT * FROM c ${where} ORDER BY c.startTime DESC`;
  const { resources } = await container.items
    .query({ query, parameters: params }, { partitionKey: filter.userId })
    .fetchAll();

  return resources;
}

/**
 * Execute an arbitrary Cosmos DB SQL query with auto-injected userId scoping.
 * The model writes the SQL; this function ensures it's scoped to the current user.
 */
export async function runQuery(
  userId: string,
  modelQuery: string
): Promise<{ results?: any[]; error?: string }> {
  try {
    const scoped = injectUserId(modelQuery);
    console.log(`[COSMOS] AI query: ${scoped}`);

    const { resources } = await container.items
      .query(
        { query: scoped, parameters: [{ name: "@userId", value: userId }] },
        { partitionKey: userId }
      )
      .fetchAll();

    console.log(`[COSMOS] AI query returned ${resources.length} results`);
    return { results: resources };
  } catch (err: any) {
    const msg = err.message || String(err);
    console.error(`[COSMOS] AI query error: ${msg}`);
    return { error: msg };
  }
}

/** Inject c.userId = @userId into a SQL query. */
function injectUserId(sql: string): string {
  const whereMatch = sql.match(/\bWHERE\b/i);
  if (whereMatch && whereMatch.index !== undefined) {
    const afterWhere = sql.slice(whereMatch.index + whereMatch[0].length);
    // Find where the WHERE conditions end (before GROUP BY, ORDER BY, OFFSET, LIMIT)
    const clauseEnd = afterWhere.match(/\b(GROUP\s+BY|ORDER\s+BY|OFFSET|LIMIT)\b/i);
    if (clauseEnd && clauseEnd.index !== undefined) {
      const conditions = afterWhere.slice(0, clauseEnd.index).trim();
      const rest = afterWhere.slice(clauseEnd.index);
      return `${sql.slice(0, whereMatch.index)}WHERE c.userId = @userId AND (${conditions}) ${rest}`;
    }
    // No trailing clause — wrap everything after WHERE
    return `${sql.slice(0, whereMatch.index)}WHERE c.userId = @userId AND (${afterWhere.trim()})`;
  }

  // No WHERE clause — insert before ORDER BY, GROUP BY, OFFSET, or at end
  const insertBefore = sql.match(/\b(ORDER\s+BY|GROUP\s+BY|OFFSET|LIMIT)\b/i);
  if (insertBefore && insertBefore.index !== undefined) {
    const before = sql.slice(0, insertBefore.index);
    const after = sql.slice(insertBefore.index);
    return `${before}WHERE c.userId = @userId ${after}`;
  }

  return `${sql} WHERE c.userId = @userId`;
}
