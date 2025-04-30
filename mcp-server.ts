// MCP Server for Local Falcon using the official MCP TypeScript SDK
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconReports } from "./localfalcon.js";

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
    // You may want to transform resp to match fetchReportsOutput if needed
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

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
