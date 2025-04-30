// MCP Server for Local Falcon using the official MCP TypeScript SDK
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchLocalFalconLocations, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports } from "./localfalcon.js";

dotenv.config({ path: ".env.local" });

const apiKey = process.env.LOCALFALCON_API_KEY;
if (!apiKey) {
  throw new Error("Missing LOCALFALCON_API_KEY environment variable");
}

// Define the MCP tool for fetching Local Falcon reports
const server = new McpServer({
  name: "Local Falcon MCP Server",
  version: "1.0.0",
});

server.tool(
  "fetchLocalFalconReports",
  "Fetches Local Falcon reports for the authenticated user.",
  { nextToken: z.string().optional().nullable() },
  async ({ nextToken }) => {
    const resp = await fetchLocalFalconReports(apiKey, nextToken ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  "fetchLocalFalconTrendReports",
  "Fetches Local Falcon trend reports for the authenticated user.",
  {
    nextToken: z.string().optional().nullable(),
    limit: z.number().optional().nullable(),
    placeId: z.string().optional().nullable(),
    keyword: z.string().optional().nullable(),
  },
  async ({ nextToken, limit, placeId, keyword }) => {
    const resp = await fetchLocalFalconTrendReports(apiKey, nextToken ?? undefined, limit ?? undefined, placeId ?? undefined, keyword ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  "fetchLocalFalconAutoScans",
  "Fetches Local Falcon auto scans for the authenticated user.",
  {
    nextToken: z.string().optional().nullable(),
    placeId: z.string().optional().nullable(),
    keyword: z.string().optional().nullable(),
    grid_size: z.string().optional().nullable(),
    frequency: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
  },
  async ({ nextToken, placeId, keyword, grid_size, frequency, status }) => {
    const resp = await fetchLocalFalconAutoScans(apiKey, nextToken ?? undefined, placeId ?? undefined, keyword ?? undefined, grid_size ?? undefined, frequency ?? undefined, status ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconLocations",
  "Fetches Local Falcon locations for the authenticated user.",
  {
    query: z.string().optional().nullable()
  },
  async ({ query }) => {
    const resp = await fetchLocalFalconLocations(apiKey, query ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconLocationReports",
  "Fetches Local Falcon location reports for the authenticated user.",
  { limit: z.number().optional().nullable(), placeId: z.string().optional().nullable(), keyword: z.string().optional().nullable(), nextToken: z.string().optional().nullable() },
  async ({ limit, placeId, keyword, nextToken }) => {
    const resp = await fetchLocalFalconLocationReports(apiKey, limit ?? undefined, placeId ?? undefined, keyword ?? undefined, nextToken ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconLocationReport",
  "Fetches a Local Falcon location report for the authenticated user.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconLocationReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconReport",
  "Fetches a Local Falcon report for the authenticated user.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconTrendReport",
  "Fetches a Local Falcon trend report for the authenticated user.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconTrendReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconKeywordReports",
  "Fetches Local Falcon keyword reports for the authenticated user.",
  {
    nextToken: z.string().optional().nullable(),
    limit: z.number().optional().nullable(),
    keyword: z.string().optional().nullable(),
  },
  async ({ nextToken, limit, keyword }) => {
    const resp = await fetchLocalFalconKeywordReports(apiKey, nextToken ?? undefined, limit ?? undefined, keyword ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "fetchLocalFalconKeywordReport",
  "Fetches a Local Falcon keyword report for the authenticated user.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconKeywordReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

// Start the MCP server using stdio transport
const transport = new StdioServerTransport();
server
  .connect(transport)
  .then(() => {
    // Using stderr for logging to avoid breaking stdin/stdout communication
    console.error("MCP server for Local Falcon is running (stdio mode)");
  })
  .catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });

// Add a simple uncaught exception handler
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

// Add a simple unhandled rejection handler
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});