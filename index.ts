// MCP Server for Local Falcon using the official MCP TypeScript SDK
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconFullGridSearch, fetchLocalFalconGoogleBusinessLocations, fetchLocalFalconGrid, fetchLocalFalconKeywordAtCoordinate, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchAllLocalFalconLocations, fetchLocalFalconRankingAtCoordinate, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports, fetchLocalFalconCompetitorReports, fetchLocalFalconCompetitorReport, fetchLocalFalconCampaignReports, fetchLocalFalconCampaignReport, fetchLocalFalconGuardReports, fetchLocalFalconGuardReport } from "./localfalcon.js";
import express, { Request, Response } from "express";
import cors from "cors";

dotenv.config({ path: ".env.local" });

const LOW_LIMIT = "3"
const HIGH_LIMIT = "7"

// Backup key if no session header is found (optional)
const defaultApiKey = process.env.LOCALFALCON_API_KEY;
const sessionMapping = new Map<string, { apiKey: string; isPro: boolean }>();
const transportMapping = new Map<string, SSEServerTransport>();

const getApiKey = (ctx: any) => {
  const sessionId = ctx?.sessionId;
  const sessionHeaders = sessionMapping.get(sessionId)
  if (!sessionHeaders) {
    return defaultApiKey;
  }
  return sessionHeaders.apiKey;
};

const isProUser = (ctx: any) => {
  const sessionId = ctx?.sessionId;
  const sessionHeaders = sessionMapping.get(sessionId)
  if (!sessionHeaders) {
    return false;
  }
  return sessionHeaders.isPro;
};

const PORT = process.env.PORT || 8000;

const getServer = () => {
  const server = new McpServer({
    name: "Local Falcon MCP Server",
    version: "1.0.0",
    instructions: `You are a Local Falcon MCP Server. You are able to interact with the Local Falcon API to retrieve information about your Local Falcon reports and locations.
    Note that sometimes you will run into an issue where responses are too verbose. If this happens use the lowDateMode option by default. If the user seems to be unsatisfied with the quanity of data returned, set lowDataMode to false.
    Don't run a ton of tools sequentially with no direction, for example if the user asks for a scan reports don't run the tool for every other kind of report as well unless you're trying to do something important. Instead in that case you'd just summarize the scan reports for them.
    
    **Parameter Handling Note:**
  When calling Local Falcon API functions, omit optional parameters entirely when you don't have a useful value to provide. Do not pass null values or empty strings for parameters you're not actively using.

  Examples:
  - Correct: \`listLocalFalconLocationReports({})\` (no filters needed)
  - Correct: \`listLocalFalconLocationReports({"keyword": "web design"})\` (filtering by keyword)
  - Incorrect: \`listLocalFalconLocationReports({"keyword": null, "placeId": ""})\` (passing unused parameters)

  Only include parameters when you have meaningful values that will filter or modify the API response.
  `
  });

  server.tool(
    "listLocalFalconScanReports",
    "Retrieves a list of all Scan Reports performed by your Local Falcon account.",
    { nextToken: z.string().optional().nullable() },
    async ({ nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReports(apiKey, limit, nextToken ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "listLocalFalconTrendReports",
    "Retrieves a list of all Trend Reports performed by your Local Falcon account.",
    {
      nextToken: z.string().optional().nullable(),
      placeId: z.string().optional().nullable(),
      keyword: z.string().optional().nullable(),
    },
    async ({ nextToken, placeId, keyword }, ctx) => {
      const apiKey = getApiKey(ctx);
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconTrendReports(apiKey, limit, nextToken ?? undefined, placeId ?? undefined, keyword ?? undefined);
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
    async ({ nextToken, placeId, keyword, grid_size, frequency, status }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconAutoScans(apiKey, nextToken ?? undefined, placeId ?? undefined, keyword ?? undefined, grid_size ?? undefined, frequency ?? undefined, status ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "listAllLocalFalconLocations",
    "Retrieves a list of all locations.",
    {
      query: z.string().optional().nullable().describe("Search query. Matches against location name, address, Place ID, or store code.")
    },
    async ({ query }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchAllLocalFalconLocations(apiKey, query ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "listLocalFalconLocationReports",
    "Retrieves a list of all location reports.",
    {
      placeId: z.string().optional().nullable().describe("The Place ID of the location."),
      keyword: z.string().optional().nullable().describe("The keyword to search for."),
      nextToken: z.string().optional().nullable().describe("Pagination token for additional results.")
    },
    async ({ placeId, keyword, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      const resp = await fetchLocalFalconLocationReports(apiKey, limit, placeId ?? undefined, keyword ?? undefined, nextToken ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconLocationReport",
    "Retrieves a single location report. A location report looks like https://www.localfalcon.com/reports/location/view/c60c325a8665c4a where c60c325a8665c4a is the report key.",
    { reportKey: z.string().describe("The report key of the location report.") },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconLocationReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconReport",
    `Retrieves a single Local Falcon scan report given a report key. Only reads the ai analysis of the returned report. Otherwise report the ai analysis is not present.
    Users can also enter the report key in the format of https://www.localfalcon.com/reports/view/0b38313fa35c37f where 0b38313fa35c37f is the report key.`,
    { reportKey: z.string().describe("The report key of the scan report.") },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconTrendReport",
    "Retrieves a single Local Falcon trend report. A trend report looks like https://www.localfalcon.com/reports/trend/view/95290829819f6e8 where 95290829819f6e8 is the report key.",
    { reportKey: z.string().describe("The report key of the trend report.") },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconTrendReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "listLocalFalconKeywordReports",
    "Retrieves a list of all keyword reports. A keyword report looks like https://www.localfalcon.com/reports/keyword/view/754ffcb0f309938 where 754ffcb0f309938 is the report key.",
    {
      nextToken: z.string().optional().nullable().describe("Pagination token for additional results."),
      keyword: z.string().optional().nullable().describe("The keyword to search for."),
    },
    async ({ nextToken, keyword }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      const resp = await fetchLocalFalconKeywordReports(apiKey, limit, nextToken ?? undefined, keyword ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconKeywordReport",
    "Retrieves a single Local Falcon keyword report.",
    { reportKey: z.string() },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconKeywordReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

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
    async ({ lat, lng, gridSize, radius, measurement }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGrid(apiKey, lat, lng, gridSize, radius, measurement);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconGoogleBusinessLocations",
    "Fetches Local Falcon Google Business locations.",
    {
      nextToken: z.string().optional().nullable().describe("Pagination token for additional results."),
      query: z.string().describe("The query to search for."),
      near: z.string().optional().nullable().describe("Narrow results by location. City, state, country, etc."),
    },
    async ({ nextToken, query, near }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGoogleBusinessLocations(apiKey, nextToken ?? undefined, query, near ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconRankingAtCoordinate",
    "Retrieves search results at the specified coordinate point and gets ranking data for specified business.",
    {
      lat: z.string().describe("The latitude of the coordinate."),
      lng: z.string().describe("The longitude of the coordinate."),
      keyword: z.string().describe("The keyword to search for."),
      zoom: z.string().optional().nullable().describe("The zoom level of the map. From 0 to 18.").default("13"),
    },
    async ({ lat, lng, keyword, zoom }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconRankingAtCoordinate(apiKey, lat, lng, keyword, zoom ?? "13");
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconKeywordAtCoordinate",
    "Retrieves search results at the specified coordinate point without any rank comparison data.",
    {
      lat: z.string().describe("The latitude of the coordinate."),
      lng: z.string().describe("The longitude of the coordinate."),
      keyword: z.string().describe("The desired search term or keyword."),
      zoom: z.string().describe("The desired zoom level of the map. From 0 to 18.").default("13"),
    },
    async ({ lat, lng, keyword, zoom }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconKeywordAtCoordinate(apiKey, lat, lng, keyword, zoom);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "runLocalFalconScan",
    "Runs a full grid search using the passed keyword or search term to match against the specified business.",
    {
      placeId: z.string().describe("The Google Place ID of the business to match against in results."),
      keyword: z.string().describe("The desired search term or keyword."),
      lat: z.string().describe("The center point latitude value."),
      lng: z.string().describe("The center point longitude value."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).describe("The size of your desired grid."),
      radius: z.string().describe("The radius of your grid from center point to outer most north/east/south/west point (0.1 to 100)."),
      measurement: z.enum(['mi', 'km']).describe("The measurement unit of your radius (mi for miles, km for kilometers)."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt']).describe("The platform to run the scan against."),
      aiAnalysis: z.boolean().default(false).describe("Whether AI analysis should be generated for this scan (optional, defaults to false)."),
    },
    async ({ placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconFullGridSearch(apiKey, placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  server.tool(
    "getLocalFalconCompetitorReports",
    "Retrieves a list of all Competitor Reports within your Local Falcon account.",
    {
      startDate: z.string().date().optional().nullable().describe("A lower limit (oldest) date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().optional().nullable().describe("Upper limit (newest) date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().optional().nullable().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      keyword: z.string().optional().nullable().describe("Filter only results similar to specified keyword (loose match)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).optional().nullable().default("3").describe("Filter only for specific grid sizes. Expects 3, 5, 7, 9, 11, 13, or 15."),
      nextToken: z.string().optional().nullable().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
    },
    async ({ startDate, endDate, placeId, keyword, gridSize, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      const resp = await fetchLocalFalconCompetitorReports(apiKey, limit, startDate ?? undefined, endDate ?? undefined, placeId ?? undefined, keyword ?? undefined, gridSize ?? undefined, nextToken ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconCompetitorReport",
    "Retrieves up to 20 competitor businesses from a specific Competitor Report from your Local Falcon account. Competitor reports look like https://www.localfalcon.com/reports/competitor/view/08116fb5331e258 where 08116fb5331e258 is the report_key.",
    {
      reportKey: z.string().describe("The report_key of the Competitor Report you wish to retrieve."),
      lowDataMode: z.boolean().optional().nullable().default(true).describe("Set to false to retrieve more data."),
    },
    async ({ reportKey, lowDataMode }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconCompetitorReport(apiKey, reportKey, lowDataMode ?? true);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  server.tool(
    "listLocalFalconCampaignReports",
    "Retrieves a list of all Location Reports within your Local Falcon account.",
    {
      startDate: z.string().date().optional().nullable().describe("A lower limit date of a Campaign run you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().optional().nullable().describe("Upper limit date of a Campaign run or schedule you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().optional().nullable().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      nextToken: z.string().optional().nullable().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
    },
    async ({ startDate, endDate, placeId, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      const resp = await fetchLocalFalconCampaignReports(apiKey, limit, startDate ?? undefined, endDate ?? undefined, placeId ?? undefined, nextToken ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconCampaignReport",
    "Retrieves a full report of a Campaign from your Local Falcon account. Campaign reports look like https://www.localfalcon.com/campaigns/view/0ee3c5869f3fa13 where 0ee3c5869f3fa13 is the report_key.",
    {
      reportKey: z.string().describe("The report_key of the Campaign Report you wish to retrieve."),
    },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconCampaignReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  server.tool(
    "listLocalFalconGuardReports",
    "Retrieves a list of all Falcon Guard Reports within your Local Falcon account. This helps analyze the Google Business profile of a specific location.",
    {
      startDate: z.string().date().optional().nullable().describe("A lower limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().optional().nullable().describe("Upper limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
    },
    async ({ startDate, endDate }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
      const resp = await fetchLocalFalconGuardReports(apiKey, limit, startDate ?? undefined, endDate ?? undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  server.tool(
    "getLocalFalconGuardReport",
    "Retrieves a full report of a Falcon Guard Report from your Local Falcon account given a place_id.",
    {
      placeId: z.string().describe("The place_id of the Falcon Guard Report you wish to retrieve."),
    },
    async ({ placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCALFALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGuardReport(apiKey, placeId);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  return server;
};

// Parse command line arguments to determine which transport to use
const args = process.argv.slice(2);
const serverMode = args[0] || 'stdio'; // Default to stdio if not specified

if (serverMode === 'sse') {
  try {
    const app = express();
    app.use(express.json());
    app.use(cors({
      allowedHeaders: ['Content-Type', 'LOCALFALCON_API_KEY']
    }));

    app.get("/ping", (req: Request, res: Response) => {
      res.status(200).json({ status: "ok", message: "Local Falcon MCP server is alive." });
    });
    
    app.get("/healthz", (req: Request, res: Response) => {
      res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connectedSessions: sessionMapping.size,
      });
    });

    // SSE endpoint for establishing the stream
    app.get("/sse", async (req: Request, res: Response) => {
      console.log('Received GET request to /sse (establishing SSE stream)');
      
      const apiKey = req.query["local_falcon_api_key"] as string;
      const isPro = req.query["is_pro"] as string;
      
      if (!apiKey) {
        console.error(`Didn't find api key in query params ${JSON.stringify(req.query)}`);
        res.status(401).send("Missing LOCALFALCON_API_KEY in environment variables or request headers");
        return;
      }

      try {
        // Create a new SSE transport for the client
        // The endpoint for POST messages is '/messages'
        const transport = new SSEServerTransport("/messages", res);
        const sessionId = transport.sessionId;
        
        // Store both session data and transport reference
        sessionMapping.set(sessionId, {
          apiKey,
          isPro: isPro === "true",
        });
        transportMapping.set(sessionId, transport);
        
        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          console.log(`SSE transport closed for session ${sessionId}`);
          sessionMapping.delete(sessionId);
          transportMapping.delete(sessionId);
        };

        // Connect the transport to the MCP server
        const server = getServer();
        await server.connect(transport);
        
        console.log(`Established SSE stream with session ID: ${sessionId}`);
      } catch (error) {
        console.error('Error establishing SSE stream:', error);
        if (!res.headersSent) {
          res.status(500).send('Error establishing SSE stream');
        }
      }
    });

    // Messages endpoint for receiving client JSON-RPC requests
    app.post("/messages", async (req: Request, res: Response) => {
      console.log('Received POST request to /messages');
      
      // Extract session ID from URL query parameter
      // In the SSE protocol, this is added by the client based on the endpoint event
      const sessionId = req.query.sessionId as string | undefined;
      
      if (!sessionId) {
        console.error('No session ID provided in request URL');
        res.status(400).send('Missing sessionId parameter');
        return;
      }
      
      const transport = transportMapping.get(sessionId);
      if (!transport) {
        console.error(`No active transport found for session ID: ${sessionId}`);
        res.status(404).send('Session not found');
        return;
      }
      
      try {
        await transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        console.error('Error handling request:', error);
        if (!res.headersSent) {
          res.status(500).send('Error handling request');
        }
      }
    });

    app.listen(PORT, () => {
      console.log(`SSE server listening on port ${PORT}`);
    });

    // Handle server shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down server...');

      // Close all active transports to properly clean up resources
      for (const [sessionId, transport] of transportMapping) {
        try {
          console.log(`Closing transport for session ${sessionId}`);
          await transport.close();
          transportMapping.delete(sessionId);
          sessionMapping.delete(sessionId);
        } catch (error) {
          console.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
      console.log('Server shutdown complete');
      process.exit(0);
    });

  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
} else {
  const transport = new StdioServerTransport();
  const server = getServer();
  server.connect(transport);
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  });
}