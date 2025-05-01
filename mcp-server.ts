// MCP Server for Local Falcon using the official MCP TypeScript SDK
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconFullGridSearch, fetchLocalFalconGoogleBusinessLocations, fetchLocalFalconGrid, fetchLocalFalconKeywordAtCoordinate, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchAllLocalFalconLocations as fetchAllLocalFalconLocations, fetchLocalFalconRankingAtCoordinate, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports } from "./localfalcon.js";

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
  "listLocalFalconScanReports",
  "Retrieves a list of all Scan Reports performed by your Local Falcon account.",
  { nextToken: z.string().optional().nullable() },
  async ({ nextToken }) => {
    const resp = await fetchLocalFalconReports(apiKey, nextToken ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
);

server.tool(
  "listLocalFalconTrendReports",
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
  "listLocalFalconAutoScans",
  "Retrieves a list of all Auto Scans.",
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
  "listAllLocalFalconLocations",
  "Retrieves a list of all locations.",
  {
    query: z.string().optional().nullable().describe("Search query. Matches against location name, address, Place ID, or store code.")
  },
  async ({ query }) => {
    const resp = await fetchAllLocalFalconLocations(apiKey, query ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "listLocalFalconLocationReports",
  "Retrieves a list of all location reports.",
  {
    limit: z.string().optional().nullable().default("10"),
    placeId: z.string().optional().nullable().describe("The Place ID of the location."),
    keyword: z.string().optional().nullable().describe("The keyword to search for."),
    nextToken: z.string().optional().nullable().describe("Pagination token for additional results.")
  },
  async ({ limit, placeId, keyword, nextToken }) => {
    const resp = await fetchLocalFalconLocationReports(apiKey, limit ?? undefined, placeId ?? undefined, keyword ?? undefined, nextToken ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "getLocalFalconLocationReport",
  "Retrieves a single location report. A location report looks like https://www.localfalcon.com/reports/location/view/c60c325a8665c4a where c60c325a8665c4a is the report key.",
  { reportKey: z.string().describe("The report key of the location report.") },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconLocationReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "getLocalFalconReport",
  `Retrieves a single Local Falcon scan report given a report key. Only reads the ai analysis of the returned report. Otherwise report the ai analysis is not present.
  Users can also enter the report key in the format of https://www.localfalcon.com/reports/view/0b38313fa35c37f where 0b38313fa35c37f is the report key.`,
  { reportKey: z.string().describe("The report key of the scan report.") },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "getLocalFalconTrendReport",
  "Retrieves a single Local Falcon trend report. A trend report looks like https://www.localfalcon.com/reports/trend/view/95290829819f6e8 where 95290829819f6e8 is the report key.",
  { reportKey: z.string().describe("The report key of the trend report.") },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconTrendReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "listLocalFalconKeywordReports",
  "Retrieves a list of all keyword reports. A keyword report looks like https://www.localfalcon.com/reports/keyword/view/754ffcb0f309938 where 754ffcb0f309938 is the report key.",
  {
    nextToken: z.string().optional().nullable().describe("Pagination token for additional results."),
    limit: z.string().optional().nullable().default("10").describe("Number of results to return."),
    keyword: z.string().optional().nullable().describe("The keyword to search for."),
  },
  async ({ nextToken, limit, keyword }) => {
    const resp = await fetchLocalFalconKeywordReports(apiKey, nextToken ?? undefined, limit ?? undefined, keyword ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "getLocalFalconKeywordReport",
  "Retrieves a single Local Falcon keyword report.",
  { reportKey: z.string() },
  async ({ reportKey }) => {
    const resp = await fetchLocalFalconKeywordReport(apiKey, reportKey);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "getLocalFalconGrid",
  "A helper method to create a Local Falcon grid.",
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
  "getLocalFalconGoogleBusinessLocations",
  "Fetches Local Falcon Google Business locations.",
  {
    nextToken: z.string().optional().nullable().describe("Pagination token for additional results."),
    query: z.string().describe("The query to search for."),
    near: z.string().optional().nullable().describe("Narrow results by location. City, state, country, etc."),
  },
  async ({ nextToken, query, near }) => {
    const resp = await fetchLocalFalconGoogleBusinessLocations(apiKey, nextToken ?? undefined, query, near ?? undefined);
    return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
  }
)

server.tool(
  "getLocalFalconRankingAtCoordinate",
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
  "getLocalFalconKeywordAtCoordinate",
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
  "runLocalFalconFullGridSearch",
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