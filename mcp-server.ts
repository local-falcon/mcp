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
  { nextToken: z.string().optional() },
  async ({ nextToken }) => {
    const resp = await fetchLocalFalconReports(apiKey, nextToken);
    // You may want to transform resp to match fetchReportsOutput if needed
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

// Start the MCP server using stdio transport
const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  // TODO: Logging to STDOUT here breaks the inspector.
  console.warn("MCP server for Local Falcon is running (stdio mode)");
});
