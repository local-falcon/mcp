// MCP Server for Local Falcon using the official MCP TypeScript SDK
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconFullGridSearch, fetchLocalFalconGoogleBusinessLocations, fetchLocalFalconGrid, fetchLocalFalconKeywordAtCoordinate, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchLocalFalconLocations, fetchLocalFalconRankingAtCoordinate, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports } from "./localfalcon.js";

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
  "List Local Falcon Scan Reports",
  "Retrieves a list of all Scan Reports performed by your Local Falcon account.",
  { nextToken: z.string().optional().nullable() },
  async ({ nextToken }) => {
    const resp = await fetchLocalFalconReports(apiKey, nextToken ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  "List Local Falcon Trend Reports",
  "Retrieves a list of all Trend Reports performed by your Local Falcon account.",
  {
    nextToken: z.string().optional().nullable(),
    limit: z.string().optional().nullable().default("10"),
    placeId: z.string().optional().nullable(),
    keyword: z.string().optional().nullable(),
  },
  async ({ nextToken, limit, placeId, keyword }) => {
    const resp = await fetchLocalFalconTrendReports(apiKey, nextToken ?? undefined, limit ?? undefined, placeId ?? undefined, keyword ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  "List Local Falcon Auto Scans",
  "Retrieves a list of all Auto Scans associated with your Local Falcon account.",
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
  "List Local Falcon Locations",
  "Retrieves a list of all locations connected to your Local Falcon account.",
  {
    query: z.string().optional().nullable()
  },
  async ({ query }) => {
    const resp = await fetchLocalFalconLocations(apiKey, query ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "List Local Falcon Location Reports",
  "Retrieves a list of all location reports associated with your Local Falcon account.",
  { limit: z.string().optional().nullable().default("10"), placeId: z.string().optional().nullable(), keyword: z.string().optional().nullable(), nextToken: z.string().optional().nullable() },
  async ({ limit, placeId, keyword, nextToken }) => {
    const resp = await fetchLocalFalconLocationReports(apiKey, limit ?? undefined, placeId ?? undefined, keyword ?? undefined, nextToken ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Location Report",
  "Retrieves a single location report associated with your Local Falcon account.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconLocationReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Report",
  "Retrieves a single Local Falcon scan report. Only reads the ai analysis of the returned report. Otherwise report the ai analysis is not present.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Trend Report",
  "Retrieves a single Local Falcon trend report.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconTrendReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "List Local Falcon Keyword Reports",
  "Retrieves a list of all keyword reports associated with your Local Falcon account.",
  {
    nextToken: z.string().optional().nullable(),
    limit: z.string().optional().nullable().default("10"),
    keyword: z.string().optional().nullable(),
  },
  async ({ nextToken, limit, keyword }) => {
    const resp = await fetchLocalFalconKeywordReports(apiKey, nextToken ?? undefined, limit ?? undefined, keyword ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Keyword Report",
  "Retrieves a single Local Falcon keyword report.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconKeywordReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Grid",
  "Retrieves a Local Falcon grid for the authenticated user.",
  {
    lat: z.string().describe("The latitude of the center of the grid."),
    lng: z.string().describe("The longitude of the center of the grid."),
    gridSize: z.string().describe("Expects 3, 5, 7, 9, 11, 13, or 15."),
    radius: z.string().describe("The radius of the grid in meters. From 0.1 to 100."),
    measurement: z.enum(['mi', 'km']).describe("Expects 'mi' or 'km'."),
  },
  async ({ lat, lng, gridSize, radius, measurement }) => {
    const resp = await fetchLocalFalconGrid(apiKey, lat, lng, gridSize, radius, measurement);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "List Local Falcon Google Business Locations",
  "Fetches Local Falcon Google Business locations for the authenticated user.",
  {
    nextToken: z.string().optional().nullable(),
    query: z.string().describe("The query to search for."),
    near: z.string().optional().nullable().describe("Narrow results by location. City, state, country, etc."),
  },
  async ({ nextToken, query, near }) => {
    const resp = await fetchLocalFalconGoogleBusinessLocations(apiKey, nextToken ?? undefined, query, near ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Ranking At Coordinate",
  "Retrieves search results at the specified coordinate point and gets ranking data for specified business.",
  {
    lat: z.string().describe("The latitude of the coordinate."),
    lng: z.string().describe("The longitude of the coordinate."),
    keyword: z.string().describe("The keyword to search for."),
    zoom: z.string().optional().nullable().describe("The zoom level of the map. From 0 to 18.").default("13"),
  },
  async ({ lat, lng, keyword, zoom }) => {
    const resp = await fetchLocalFalconRankingAtCoordinate(apiKey, lat, lng, keyword, zoom ?? "13");
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Keyword At Coordinate",
  "Retrieves search results at the specified coordinate point without any rank comparison data.",
  {
    lat: z.string().describe("The latitude of the coordinate."),
    lng: z.string().describe("The longitude of the coordinate."),
    keyword: z.string().describe("The desired search term or keyword."),
    zoom: z.string().describe("The desired zoom level of the map. From 0 to 18.").default("13"),
  },
  async ({ lat, lng, keyword, zoom }) => {
    const resp = await fetchLocalFalconKeywordAtCoordinate(apiKey, lat, lng, keyword, zoom);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "Get Local Falcon Full Grid Search",
  "Retrieves a full grid search using the passed keyword or search term to match against the specified business.",
  {
    placeId: z.string().describe("The Google Place ID of the business to match against in results."),
    keyword: z.string().describe("The desired search term or keyword."),
    lat: z.string().describe("The center point latitude value."),
    lng: z.string().describe("The center point longitude value."),
    gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).describe("The size of your desired grid."),
    radius: z.string().describe("The radius of your grid from center point to outer most north/east/south/west point."),
    measurement: z.enum(['mi', 'km']).describe("The measurement unit of your radius."),
  },
  async ({ placeId, keyword, lat, lng, gridSize, radius, measurement }) => {
    const resp = await fetchLocalFalconFullGridSearch(apiKey, placeId, keyword, lat, lng, gridSize, radius, measurement);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  },
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