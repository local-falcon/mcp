import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconFullGridSearch, fetchLocalFalconGoogleBusinessLocations, fetchLocalFalconGrid, fetchLocalFalconKeywordAtCoordinate, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchAllLocalFalconLocations, fetchLocalFalconRankingAtCoordinate, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports, fetchLocalFalconCompetitorReports, fetchLocalFalconCompetitorReport, fetchLocalFalconCampaignReports, fetchLocalFalconCampaignReport, fetchLocalFalconGuardReports, fetchLocalFalconGuardReport, runLocalFalconScan, searchForLocalFalconBusinessLocation, fetchLocalFalconAccountInfo, saveLocalFalconBusinessLocationToAccount, addLocationsToFalconGuard, pauseFalconGuardProtection, resumeFalconGuardProtection, removeFalconGuardProtection, createLocalFalconCampaign, runLocalFalconCampaign, pauseLocalFalconCampaign, resumeLocalFalconCampaign, reactivateLocalFalconCampaign, fetchLocalFalconReviewsAnalysisReports, fetchLocalFalconReviewsAnalysisReport } from "./localfalcon.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

dotenv.config({ path: ".env.local" });


const DEFAULT_LIMIT = "7"

function handleNullOrUndefined(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  return value;
}


export const getServer = (sessionMapping: Map<string, { apiKey: string }>) => {
  const getApiKey = (ctx: any) => {
    const sessionId = ctx?.sessionId;
    const sessionHeaders = sessionMapping.get(sessionId)
    if (!sessionHeaders) {
      return process.env.LOCAL_FALCON_API_KEY;
    }
    return sessionHeaders.apiKey;
  };

  const server = new McpServer({
    name: "Local Falcon MCP Server",
    version: "1.0.0",
    icons: [
      {
        src: "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCA3MTQuNzIgMTAwMCI+CiAgPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDI5LjAuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDIuMS4wIEJ1aWxkIDE4NikgIC0tPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuc3QwIHsKICAgICAgICBmaWxsOiAjMjg0MDYwOwogICAgICB9CgogICAgICAuc3QwLCAuc3QxIHsKICAgICAgICBmaWxsLXJ1bGU6IGV2ZW5vZGQ7CiAgICAgIH0KCiAgICAgIC5zdDEgewogICAgICAgIGZpbGw6ICNlNjJhMmQ7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xMjguNTIsMjM2Ljc3YzAsNjUuMzgsMjUuODksMTI0LjU4LDY3LjcyLDE2Ny40M2wxNjEuMDksMTY0Ljk3LDE2MS4wOC0xNjQuOTdjNDEuODMtNDIuODUsNjcuNzItMTAyLjA1LDY3LjcyLTE2Ny40M0M1ODYuMTMsMTA2LjgyLDQ4My45MSwxLjMyLDM1Ny4zMywwYy0xMjYuNTksMS4zMi0yMjguODEsMTA2LjgyLTIyOC44MSwyMzYuNzdaTTI1NC43NiwyMzcuMTVjMC01Ni43NSw0NS45Mi0xMDIuNzYsMTAyLjU3LTEwMi43NnMxMDIuNTYsNDYuMDEsMTAyLjU2LDEwMi43Ni00NS45MiwxMDIuNzctMTAyLjU2LDEwMi43Ny0xMDIuNTctNDYuMDEtMTAyLjU3LTEwMi43N1oiLz4KICA8cGF0aCBjbGFzcz0ic3QwIiBkPSJNMjA0Ljg3LDY3OC45OWwtMjguNDQsNDguODJzLTYuOTQsOS43OS04LjgzLDI4LjQxYy0xLjg5LDE4LjYzLDEwLjc1LDMwLjcyLDEwLjc1LDMwLjcyLDAsMC0yLjk2LDE3LjgyLS42NSwzMC44Niw1LjUxLDMxLjAxLDM5LjEyLDI0LjY2LDM5LjEyLDI0LjY2LDAsMC05LjE4LTcuOC0xMC43Ni0xNS42OS0xLjU5LTcuODksOS44MS0yMS4zOSw5LjgxLTIxLjM5bDQ5LjI1LTY1LjQ5YzEuMTksMS41MSwyLjM2LDMuMDQsMy41Myw0LjU4di4wMmMzLjE0LDQuMTUsNi4xNyw4LjQsOS4wOSwxMi43NCw1LjQzLDguMDgsMTAuNSwxNi40NywxNS4yNCwyNS4wNiwxNi4wNy01MS43NSw0MS4yMi0xMDguOTIsNzkuOTgtMTQ5Ljg4LDU1LjgyLTU5LjAxLDE0My43LTEyMi4yMiwyMDAuNzMtMTk4LjkxaC4yMWMzNC42NS00Ni42LDU3LjkyLTk4LjE4LDU1LjY4LTE1Ni44Mi0uNy0xOC4zNC0zLjc3LTM1LjM5LTguNjQtNTEuMTktMi4zOC01LjU2LTYuMDMtMTMuNjgtOS0xOC40OS0zLjQ1LTUuNjEtNy4xOC0xMC4zOC0xMC4zMS0xMy45OSwyLjgxLDE0LjE4LDQuMjgsMjguODEsNC4yOCw0My43NiwwLDE5LjA3LTIuMzgsMzcuNjItNi45LDU1LjM4LTkuMjYsNTIuNDItMzguMjksOTguOTQtNzUuMDIsMTQxLjM1aC0uMmMtNDcuNzEsNTUuMDktMTA4LjQsMTAzLjI2LTE1NS42MSwxNDguNGwtMTEsMTAuOTl2LS4yNmMtNC4wOCw0LjA2LTguMDMsOC4wOS0xMS44NCwxMi4xMS0yMS44NSwyMy4xLTM5LjM3LDUxLjM1LTUzLjM3LDgwLjg3bC0xLjcxLTEuODJDMjAyLjE3LDU5MC42OCwzNC4yNSw0ODcuMDksMzMuNywzMzYuNTdjLTYuNDQsNC44OS0xNi41NSwxNC45MS0yNS40MywzMy45My0xMC44MSwyMy4xNy04LjUsNDguMTMtNi44OSw1OC4yOSwyNy4xLDEwMS4wNCwxMjYuMTIsMTc5Ljg1LDIwMy40OSwyNTAuMlpNMTkwLjczLDc3NC41N2MtLjk4LS4xNS0xLjg3LS41Ni0yLjYzLTEuMiwzLjAxLTEuMjUsNS42NS00LjkzLDYuNDktOS41NS44NS00LjYyLS4zNC04Ljg1LTIuNzYtMTAuODcuOTUtLjQsMS45NC0uNTUsMi45Mi0uNDEsNC4xLjU5LDYuNTEsNS45OSw1LjQsMTIuMDgtMS4xMSw2LjA4LTUuMzMsMTAuNTMtOS40Miw5Ljk1Wk0xMTguMjcsOTIyLjU1czU3LjI2LDE0LDE0Ny43LTE5LjAxYzE3LjUtNi4zOCwzMi45Mi0xMy40NSw0Ni40LTIwLjY4LTMuODEtMTEuMTYtOC4wNi0yMi40Ni0xMi43OC0zMy42OS0xNy43OCwxNC41My0zNy43NCwyOC4xMy01OC41MSwzNy4zNy02OS43LDMxLjAxLTEyMi44MSwzNi4wMS0xMjIuODEsMzYuMDFaTTY5Ni4yNyw4MjMuNTVzLTUzLjExLTUtMTIyLjgxLTM2LjAxYy0zMS40OS0xNC4wMS02MS4xMi0zOC4wMy04NC4xNC02MC4xNS00LjAxLDQtNy44OSw3Ljk3LTExLjYzLDExLjkzLTUuNTksNS45MS0xMC44OSwxMi4xNS0xNS45MywxOC42NiwxOS45NSwxNS4yNCw0OC4zNiwzMi41Myw4Ni44MSw0Ni41Niw5MC40NCwzMy4wMSwxNDcuNywxOS4wMSwxNDcuNywxOS4wMVpNNzA2LjI3LDg4Ni41cy02NC01LTE0OC0zNmMtNDMuMzEtMTUuOTgtODMuNjktNDQuOTktMTEyLjY1LTY5LjM1LTguMDYsMTIuNzktMTUuMjcsMjYuMjQtMjEuNzQsMzkuOTQsMjQuMDMsMTUuMiw1OC4xOSwzMi40MiwxMDQuMzksNDYuNDEsMTA5LDMzLDE3OCwxOSwxNzgsMTlaTTMwNC4yMSw2MTguODljLTkzLjMtODguNTEtMjM2LjMxLTE4OC45LTIzMC45MS0zMzAuMzUuNTgtMTUuMjUsMi40OC0yOC45NSw1LjU1LTQxLjUyLTUuNTQsNS4yMi0xNC40NSwxNS4yMi0yMi41OCwzMS40OC01Ljc2LDExLjUzLTEwLDIwLTEwLjU5LDM3LjcxLTQuOCwxNDQuNzUsMTQ0LjMxLDI0Ni40NiwyMzcuMywzMzYuNDgsNi40NC0xMS43MiwxMy41LTIzLjA4LDIxLjIzLTMzLjhaTTM0MS4zMyw1NzcuMTVjLTgzLjQ3LTc4LjY4LTIwNC43Ni0xNjYuODgtMjI1LjYzLTI4NS00LjUxLTE3Ljc2LTYuOS0zNi4zMS02LjktNTUuMzgsMC0xNC45NSwxLjQ3LTI5LjU4LDQuMjgtNDMuNzYtMy4xMywzLjYxLTYuODYsOC4zOC0xMC4zMSwxMy45OS0yLjk2LDQuODEtNi42MSwxMi45My04Ljk5LDE4LjQ5LTQuODgsMTUuOC03Ljk1LDMyLjg1LTguNjUsNTEuMTktNS4zNiwxNDAuNjYsMTM2LjAzLDI0MC43MiwyMjkuMzUsMzI4Ljg3LDMuNTktNC4zNiw3LjI5LTguNiwxMS4xNC0xMi42NiwzLjgtNC4wMiw3Ljc1LTguMDYsMTEuODMtMTIuMTJ2LjI2bDMuODgtMy44OFpNMzMzLjY2LDgxNy45NmMzLjIzLTEwLjE5LDYuODItMjAuNTksMTAuODEtMzFsLjUzLTEuMzcuMjktLjc1LjU4LTEuNDYuOTItMi4zNSwyLjAzLTUuMDZjMTUuNDItMzcuNjksMzYuMDctNzQuOTUsNjMuNTgtMTA0LjAzLDY1LjE0LTY4Ljg1LDE3My45LTE0My40MiwyMjYuMzktMjM4LjQ0aC0uMDljMTkuODYtMzUuOTEsMzEuNzQtNzQuNzQsMzAuMzMtMTE3LjI5LS41OS0xNy43MS00LjgyLTI2LjE4LTEwLjU5LTM3LjcxLTguMTMtMTYuMjYtMTcuMDQtMjYuMjYtMjIuNTgtMzEuNDgsMy4wOCwxMi41Nyw0Ljk4LDI2LjI3LDUuNTYsNDEuNTIsMi4wNSw1My43MS0xNy4zLDEwMS40OS00Ny4yLDE0NC45NmgtLjIxYy01Ni40Niw4Mi4wOC0xNTAuNTQsMTQ4Ljc1LTIwOS4yMiwyMTAuNzctMjQsMjUuMzYtNDIuNzcsNTYuOTYtNTcuNDEsODkuNjItOC40OCwxOC45NC0xNS41OCwzOC4yMi0yMS40OSw1Ni44OGwtMi4wMSw5LjcsMiw3LjM2YzQuMzQsOS4zNSw4LjMzLDE4LjgxLDEyLDI4LjI2LDIuMDksNS4zOCw0LjA3LDEwLjc1LDUuOTUsMTYuMSwyLjg1LTEwLjk5LDYuMS0yMi40OCw5LjgzLTM0LjIzWk0zNTcuMzMsMTAwMHYtMS40OHMtLjA4LjcyLS4wOC43MmwuMDguNzZaTTM1Ny4zMiw5OTguNTJjMS44My0xNy40NywyMS4zNi0xODUuMzQsMTA2LjM3LTI3NS4yLDc2LjQzLTgwLjc5LDIxMi45NS0xNjkuNDYsMjQ4LjExLTI4OS44MmguMjFjLjQ2LTEuNTYuOS0zLjEzLDEuMzItNC43MSwxLjYyLTEwLjE2LDMuOTMtMzUuMTItNi44OS01OC4yOS04Ljg3LTE5LjAyLTE4Ljk5LTI5LjA0LTI1LjQzLTMzLjkzLS4xMiwzNC42NS05LjEyLDY2LjgxLTIzLjk3LDk2LjkzaC0uMjFjLTQ5LjY2LDEwMC43Mi0xNjQuNzcsMTc4LjYxLTIzMi41OSwyNTAuMjktMjkuNTksMzEuMjgtNTEuMjYsNzIuMDItNjYuOTksMTEyLjU3bC0uMDQuMDktLjAzLjExYy0xMC45OCwyOC4zMS0xOS4wNyw1Ni41My0yNC45Niw4MS4zNiwxOC4wNSw1OS44MSwyMy45OSwxMTEuMzgsMjQuOTUsMTIwLjYxbC4wOC43MS4wNy0uNzJaTTM1Ny4xNyw5OTguNTN2MS40N3MuMDgtLjc2LjA4LS43NmwtLjA4LS43MVoiLz4KPC9zdmc+",
        mimeType: "image/svg+xml",
        sizes: ["any"],
      },
    ],
    description: `You are a Local Falcon MCP Server. You are able to interact with the Local Falcon API to retrieve information about your Local Falcon reports and locations.
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

  // Get list of Scan Reports
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "listLocalFalconScanReports",
    "ALWAYS USE THIS FIRST before running new scans. Shows all existing scan reports to check if the data you need already exists. Prevents duplicate scans and saves time. Check here before using runLocalFalconScan to see if a recent report is available. Lists reports with dates, keywords, and locations for easy identification. NOTE: If a scan shows a campaign_key, it means a campaign report exists with broader multi-location/keyword data. Campaign scans won't have separate location/keyword reports - all that data is consolidated in the campaign report instead.",
    { 
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."), 
      keyword: z.string().nullish().describe("Filter only results similar to specified keyword (loose match)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15', '17', '19', '20']).nullish().describe("Filter only for specific grid sizes. Expects 3, 5, 7, 9, 11, 13, 15, 17, 19, or 20."), 
      campaignKey: z.string().nullish().describe("Filter only results for a specific campaign using the campaign_key."), 
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt','gemini','grok']).nullish().describe("Filter only results for a specific platform."),
    },
    async ({ nextToken, startDate, endDate, placeId, keyword, gridSize, campaignKey, platform }, ctx) => {
      const apiKey = getApiKey(ctx);
      const limit = DEFAULT_LIMIT;
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReports(apiKey, limit, handleNullOrUndefined(nextToken), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(gridSize), handleNullOrUndefined(campaignKey), handleNullOrUndefined(platform));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Scan Report
  server.tool(
    "getLocalFalconReport",
    `EXISTING REPORT VIEWER ONLY - Retrieves previously created scan reports. CANNOT create new reports. WARNING: Only use this if you have a report_key from listLocalFalconScanReports. If you need NEW ranking data, use runLocalFalconScan instead. Common mistake: DO NOT use this hoping to generate a report - it only displays reports that already exist. The report URL format (https://www.localfalcon.com/reports/view/XXXXX) contains the report_key needed. NOTE: If this scan was part of a campaign, there will be a corresponding campaign report available (but NO separate location/keyword reports). Campaign reports provide a broader view across multiple locations/keywords which may be more valuable for comprehensive analysis.`,
    { reportKey: z.string().describe("The report key of the scan report.") },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Saved Locations
  server.tool(
    "listAllLocalFalconLocations",
    "Lists all business locations already configured in the Local Falcon account. Check here BEFORE using getLocalFalconGoogleBusinessLocations - if the business is already in the account, you'll get the Place ID instantly without needing to search Google. Saves time and ensures consistency with previous scans.",
    {
      query: z.string().nullish().describe("Search query. Matches against location name, address, Place ID, or store code.")
    },
    async ({ query }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchAllLocalFalconLocations(apiKey, handleNullOrUndefined(query));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Search Google for Place ID - OnDemand Endpoint
  server.tool(
    "getLocalFalconGoogleBusinessLocations",
    "Searches Google for business listings to find Place IDs needed for runLocalFalconScan. ONLY use this if: 1) Place ID not found in previous scan reports, AND 2) Business not found in listAllLocalFalconLocations. This is the last resort for finding a Place ID. Returns multiple potential matches - verify you have the correct business before scanning.",
    {
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      query: z.string().describe("The query to search for."),
      near: z.string().nullish().describe("Narrow results by location. City, state, country, etc."),
    },
    async ({ nextToken, query, near }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGoogleBusinessLocations(apiKey, handleNullOrUndefined(nextToken), query, handleNullOrUndefined(near));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Run a Dashboard Scan v2
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "runLocalFalconScan",
    "Runs a scan at the specified coordinate point and gets ranking data for a specified business.",
    {
      placeId: z.string().describe("The Google Place ID of the business to match against in results."),
      keyword: z.string().describe("The desired search term or keyword."),
      lat: z.string().describe("The data point latitude value."),
      lng: z.string().describe("The data point longitude value."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).describe("The size of the grid."),
      radius: z.string().describe("The radius of the grid from center point to outer most north/east/south/west point (0.1 to 100)."),
      measurement: z.enum(['mi', 'km']).describe("The measurement unit of the radius (mi for miles, km for kilometers)."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt']).describe("The platform to run the scan against."),
      aiAnalysis: z.boolean().default(false).describe("Whether AI analysis should be generated for this scan (optional, defaults to false)."),
    },
    async ({ placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await runLocalFalconScan(apiKey, placeId, keyword, lat, lng, gridSize, radius, measurement, platform, aiAnalysis);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get list of Campaign Reports
  server.tool(
    "listLocalFalconCampaignReports",
    "Lists all campaign reports in your account. Campaigns are the primary way to organize and track rankings at scale. Can include: single location + single keyword, multiple locations + single keyword, single location + multiple keywords, or multiple locations + multiple keywords. Most campaigns run on automated schedules (daily, weekly, monthly) making them the preferred method for ongoing tracking, but can also be run manually. Campaign reports consolidate all data in one place - no separate location/keyword reports are generated for campaign scans. Check here to see scheduled scan activity and multi-location/keyword performance data.",
    {
      startDate: z.string().date().nullish().describe("A lower limit date of a Campaign run you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().nullish().describe("Upper limit date of a Campaign run or schedule you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      runDate: z.string().date().nullish().describe("Filter only results for a specific Campaign run date. Expects date formatted as MM/DD/YYYY. Defaults to the last report run."),
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
    },
    async ({ startDate, endDate, placeId, runDate, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconCampaignReports(apiKey, limit, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(placeId), handleNullOrUndefined(runDate), handleNullOrUndefined(nextToken));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Campaign Report
  server.tool(
    "getLocalFalconCampaignReport",
    "Campaign reports look like https://www.localfalcon.com/campaigns/view/0ee3c5869f3fa13 where 0ee3c5869f3fa13 is the report_key. Retrieves a specific campaign report that tracks multiple locations/keywords. Only for existing reports. Contains aggregated metrics (ARP, ATRP, SOLV), individual scan results, performance breakdowns by keyword and location, and scheduling info. Consolidates all data - no separate location/keyword reports exist for campaign scans.",
    {
      reportKey: z.string().describe("The report_key of the Campaign Report you wish to retrieve."),
      run: z.string().nullish().describe("Optional specific campaign run date to retrieve (MM/DD/YYYY). Defaults to latest run."),
    },
    async ({ reportKey, run }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconCampaignReport(apiKey, reportKey, handleNullOrUndefined(run));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Create a new Campaign
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "createLocalFalconCampaign",
    "Creates a new campaign in Local Falcon. Campaigns allow you to schedule recurring scans for one or multiple locations with one or multiple keywords. Locations must already exist in your Saved Locations (use listAllLocalFalconLocations to verify).",
    {
      name: z.string().describe("A name to give the campaign."),
      measurement: z.enum(['mi', 'km']).describe("The measurement unit of your radius (mi for miles, km for kilometers)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15', '17', '19', '21']).describe("The size of your desired grid."),
      radius: z.string().describe("The radius of your grid from center point to outer most point (0.1 to 100)."),
      frequency: z.enum(['one-time', 'daily', 'weekly', 'biweekly', 'monthly']).describe("The specific run frequency for the campaign."),
      placeId: z.string().describe("The location(s) to include in the campaign. Supports multiple Google Place IDs separated by commas."),
      keyword: z.string().describe("The keyword(s) to run against the campaign locations. Supports multiple keywords separated by commas."),
      startDate: z.string().describe("The date when your campaign runs the first time. Format: MM/DD/YYYY."),
      startTime: z.string().describe("The time of day your campaign should run. Format: friendly time like '9:00 AM'."),
      aiAnalysis: z.boolean().nullish().describe("Whether campaign scans should include AI analysis."),
      notify: z.boolean().nullish().describe("Whether email notification should be enabled for the campaign."),
      emailRecipients: z.string().nullish().describe("Recipients of email notification. Supports multiple email addresses separated by commas. Required if notify is true."),
      emailSubject: z.string().nullish().describe("Email subject of the email notification. Required if notify is true."),
      emailBody: z.string().nullish().describe("Email body of the email notification."),
    },
    async ({ name, measurement, gridSize, radius, frequency, placeId, keyword, startDate, startTime, aiAnalysis, notify, emailRecipients, emailSubject, emailBody }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (notify && !emailRecipients) {
        return { content: [{ type: "text", text: "emailRecipients is required when notify is enabled." }] };
      }
      if (notify && !emailSubject) {
        return { content: [{ type: "text", text: "emailSubject is required when notify is enabled." }] };
      }
      const resp = await createLocalFalconCampaign(apiKey, {
        name,
        measurement,
        gridSize,
        radius,
        frequency,
        placeId,
        keyword,
        startDate,
        startTime,
        aiAnalysis: aiAnalysis ?? undefined,
        notify: notify ?? undefined,
        emailRecipients: handleNullOrUndefined(emailRecipients) || undefined,
        emailSubject: handleNullOrUndefined(emailSubject) || undefined,
        emailBody: handleNullOrUndefined(emailBody) || undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Manually run a Campaign
  server.tool(
    "runLocalFalconCampaign",
    "Manually triggers a campaign to run immediately. The total credits required will be checked against your available credits. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to run.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to run."),
    },
    async ({ campaignKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await runLocalFalconCampaign(apiKey, campaignKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Pause a Campaign
  server.tool(
    "pauseLocalFalconCampaign",
    "Pauses a campaign to stop it from running on its scheduled frequency. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to pause.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to pause."),
    },
    async ({ campaignKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await pauseLocalFalconCampaign(apiKey, campaignKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Resume a Campaign
  server.tool(
    "resumeLocalFalconCampaign",
    "Resumes a campaign from a deactivated or paused status. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to resume.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to resume."),
      startDate: z.string().nullish().describe("Optional date to resume and run the campaign. Format: MM/DD/YYYY."),
      startTime: z.string().nullish().describe("Optional time of day the campaign should next run. Format: friendly time like '9:00 AM'."),
    },
    async ({ campaignKey, startDate, startTime }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await resumeLocalFalconCampaign(apiKey, campaignKey, handleNullOrUndefined(startDate), handleNullOrUndefined(startTime));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Reactivate a Campaign
  server.tool(
    "reactivateLocalFalconCampaign",
    "Reactivates a campaign that was deactivated due to insufficient credits. Use listLocalFalconCampaignReports to find the campaign_key for the campaign you want to reactivate.",
    {
      campaignKey: z.string().describe("The key of the campaign you wish to reactivate."),
    },
    async ({ campaignKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await reactivateLocalFalconCampaign(apiKey, campaignKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // List all Reviews Analysis Reports
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "listLocalFalconReviewsAnalysisReports",
    "Retrieves the full list of all Reviews Analysis Reports within your Local Falcon account. Reviews Analysis Reports provide AI-powered analysis of your business reviews.",
    {
      reviewsKey: z.string().nullish().describe("Filter by parent Reviews Analysis record key to retrieve only reports from that specific configuration."),
      placeId: z.string().nullish().describe("Filter by platform Place ID(s). Supports multiple IDs separated by commas."),
      frequency: z.enum(['one_time', 'daily', 'weekly', 'two_weeks', 'three_weeks', 'four_weeks', 'monthly']).nullish().describe("Filter by analysis frequency."),
      limit: z.number().min(1).max(100).nullish().describe("Number of results to retrieve (1-100). Defaults to 10."),
      nextToken: z.string().nullish().describe("Pagination token for retrieving the next page of results."),
    },
    async ({ reviewsKey, placeId, frequency, limit, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReviewsAnalysisReports(
        apiKey,
        handleNullOrUndefined(reviewsKey),
        handleNullOrUndefined(placeId),
        handleNullOrUndefined(frequency),
        limit ?? undefined,
        handleNullOrUndefined(nextToken)
      );
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get specific Reviews Analysis Report
  server.tool(
    "getLocalFalconReviewsAnalysisReport",
    "Retrieves the full result of a specific Reviews Analysis Report. Use listLocalFalconReviewsAnalysisReports to find the report_key for the report you want to retrieve.",
    {
      reportKey: z.string().describe("The key of the Reviews Analysis report you wish to retrieve."),
    },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconReviewsAnalysisReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get list of Falcon Guard Reports
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "listLocalFalconGuardReports",
    "Lists Falcon Guard reports IF they exist for your locations. Falcon Guard monitors Google Business Profile health and changes. NOTE: Not all locations have Guard reports. For OAuth-connected locations, reports include calls/clicks/directions data. For manually added locations, reports only show historical GBP changes.",
    {
      startDate: z.string().date().nullish().describe("A lower limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().nullish().describe("Upper limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      status: z.enum(['protected', 'paused']).nullish().describe("Filter results by status: protected or paused."),
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
    },
    async ({ startDate, endDate, status, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconGuardReports(apiKey, limit, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(status), handleNullOrUndefined(nextToken));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Falcon Guard Report
  server.tool(
    "getLocalFalconGuardReport",
    "Retrieves a Falcon Guard report IF it exists for the location given a place_id. Shows Google Business Profile monitoring data. OAuth-connected locations include full metrics (calls, clicks, directions) plus historical changes. Manually added locations only show historical GBP changes. Returns an error if Guard is not enabled for this location.",
    {
      placeId: z.string().describe("The place_id of the Falcon Guard Report you wish to retrieve."),
    },
    async ({ placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGuardReport(apiKey, placeId);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Add location(s) to Falcon Guard
  server.tool(
    "addLocationsToFalconGuard",
    "Adds one or multiple locations to be protected by Falcon Guard. Each business location must already be added to your Saved Locations in your Local Falcon dashboard before it can be protected. Use listAllLocalFalconLocations to verify locations exist first.",
    {
      placeId: z.string().describe("Platform Place ID(s) to protect. Supports multiple Place IDs separated by commas."),
    },
    async ({ placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await addLocationsToFalconGuard(apiKey, placeId);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Pause Falcon Guard protection for location(s)
  server.tool(
    "pauseFalconGuardProtection",
    "Pauses protection for one or multiple locations in Falcon Guard. You must provide either guardKey or placeId (or both). Use listLocalFalconGuardReports to find guard_key values for protected locations.",
    {
      guardKey: z.string().nullish().describe("Falcon Guard report key(s) to pause. Supports multiple keys separated by commas."),
      placeId: z.string().nullish().describe("Google Place ID(s) to pause protection for. Supports multiple IDs separated by commas. Required if guardKey is not provided."),
    },
    async ({ guardKey, placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (!guardKey && !placeId) {
        return { content: [{ type: "text", text: "Either guardKey or placeId must be provided." }] };
      }
      const resp = await pauseFalconGuardProtection(apiKey, handleNullOrUndefined(guardKey), handleNullOrUndefined(placeId));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Resume Falcon Guard protection for location(s)
  server.tool(
    "resumeFalconGuardProtection",
    "Resumes protection for one or multiple locations in Falcon Guard that were previously paused. You must provide either guardKey or placeId (or both). Use listLocalFalconGuardReports to find guard_key values for paused locations.",
    {
      guardKey: z.string().nullish().describe("Falcon Guard report key(s) to resume. Supports multiple keys separated by commas."),
      placeId: z.string().nullish().describe("Google Place ID(s) to resume protection for. Supports multiple IDs separated by commas. Required if guardKey is not provided."),
    },
    async ({ guardKey, placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (!guardKey && !placeId) {
        return { content: [{ type: "text", text: "Either guardKey or placeId must be provided." }] };
      }
      const resp = await resumeFalconGuardProtection(apiKey, handleNullOrUndefined(guardKey), handleNullOrUndefined(placeId));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Remove Falcon Guard protection for location(s)
  server.tool(
    "removeFalconGuardProtection",
    "Removes protection for one or multiple locations from Falcon Guard entirely. This deletes the Guard monitoring for the specified locations. You must provide either guardKey or placeId (or both). Use listLocalFalconGuardReports to find guard_key values.",
    {
      guardKey: z.string().nullish().describe("Falcon Guard report key(s) to remove. Supports multiple keys separated by commas."),
      placeId: z.string().nullish().describe("Google Place ID(s) to remove protection for. Supports multiple IDs separated by commas. Required if guardKey is not provided."),
    },
    async ({ guardKey, placeId }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      if (!guardKey && !placeId) {
        return { content: [{ type: "text", text: "Either guardKey or placeId must be provided." }] };
      }
      const resp = await removeFalconGuardProtection(apiKey, handleNullOrUndefined(guardKey), handleNullOrUndefined(placeId));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // Get list of Trend Reports
  server.tool(
    "listLocalFalconTrendReports",
    "Lists all existing trend reports that are AUTO-GENERATED when you run multiple scans with identical settings (same place ID, keyword, lat/lng, grid size, radius, platform). Trend reports show ranking changes over time and only appear after at least 2 identical scans. Check here to see historical ranking trends for a single location and single keyword at a time.",
    {
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      keyword: z.string().nullish().describe("Filter only results similar to specified keyword (loose match)."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt','gemini','grok']).nullish().describe("Filter only results for a specific platform."),
    },
    async ({ nextToken, placeId, keyword, startDate, endDate, platform }, ctx) => {
      const apiKey = getApiKey(ctx);
      const limit = DEFAULT_LIMIT;
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconTrendReports(apiKey, limit, handleNullOrUndefined(nextToken), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(platform));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Trend Report
  server.tool(
    "getLocalFalconTrendReport",
    "Retrieves an AUTO-GENERATED trend report showing ranking changes over time. A trend report looks like https://www.localfalcon.com/reports/trend/view/95290829819f6e8 where 95290829819f6e8 is the report key. These are automatically created when you run multiple scans with IDENTICAL settings (same place ID, keyword, coordinates, grid, radius, platform). Requires at least 2 identical scans to generate. Cannot be created manually.",
    { reportKey: z.string().describe("The report key of the trend report.") },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconTrendReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );


  // Get list of Autoscans
  server.tool(
    "listLocalFalconAutoScans",
    "Lists ONLY individually scheduled automatic scans. NOTE: This does NOT include campaign-scheduled scans, which are the more common way to schedule recurring scans. To see campaign schedules, use listLocalFalconCampaignReports instead. Most users schedule scans through campaigns for better organization and reporting.",
    {
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      placeId: z.string().nullish().describe("The Place ID of the location."),
      keyword: z.string().nullish().describe("The keyword to search for."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15', '17', '19', '20']).nullish().describe("The grid size of the scan."),
      frequency: z.enum(["one-time", "daily", "weekly", "biweekly", "monthly"]).nullish().describe("The frequency of the scan."),
      status: z.string().nullish().describe("The status of the scan."),
      platform: z.enum(['google', 'apple', 'gaio', 'chatgpt','gemini','grok']).nullish().describe("The platform of the scan."),
    },
    async ({ nextToken, placeId, keyword, gridSize, frequency, status, platform }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconAutoScans(apiKey, handleNullOrUndefined(nextToken), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(gridSize), handleNullOrUndefined(frequency), handleNullOrUndefined(status), handleNullOrUndefined(platform));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Location Reports
  server.tool(
    "listLocalFalconLocationReports",
    "Lists all existing location reports that are AUTO-GENERATED after running runLocalFalconScan. NOTE: Location reports are NOT generated if the scan was initiated from a campaign (that data is included in the campaign report instead). These aggregate all scans for a specific business location. These will only be generated after a location has been scanned for at least 2 keywords outside of a campaign. ",
    {
      placeId: z.string().nullish().describe("The Place ID of the location."),
      keyword: z.string().nullish().describe("The keyword to search for."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      nextToken: z.string().nullish().describe("Pagination token for additional results.")
    },
    async ({ placeId, keyword, startDate, endDate, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconLocationReports(apiKey, limit, handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate),  handleNullOrUndefined(nextToken));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get a Specific Location Report
  server.tool(
    "getLocalFalconLocationReport",
    "Retrieves a single location report. A location report looks like https://www.localfalcon.com/reports/location/view/c60c325a8665c4a where c60c325a8665c4a is the report key. Retrieves an AUTO-GENERATED location report that aggregates scan data for a specific business location. These are automatically created with runLocalFalconScan EXCEPT when scans are run from campaigns (campaign reports contain this data instead). Cannot be created manually. These will only be generated after a location has been scanned for at least 2 keywords outside of a campaign.",
    { reportKey: z.string().describe("The report key of the location report.") },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconLocationReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Keyword Reports
  server.tool(
    "listLocalFalconKeywordReports",
    "A keyword report looks like https://www.localfalcon.com/reports/keyword/view/754ffcb0f309938 where 754ffcb0f309938 is the report key. Lists all existing keyword reports that are AUTO-GENERATED after running runLocalFalconScan. NOTE: Keyword reports are NOT generated if the scan was initiated from a campaign (that data is included in the campaign report instead). These aggregate all scans for a specific keyword. These will only be generated after a keyword has been scanned for at least 2 locations outside of a campaign. ",
    {
      nextToken: z.string().nullish().describe("Pagination token for additional results."),
      keyword: z.string().nullish().describe("The keyword to search for."),
      startDate: z.string().nullish().describe("A lower limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().nullish().describe("Upper limit date of a scan report you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
    },
    async ({ nextToken, keyword, startDate, endDate  }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconKeywordReports(apiKey, limit, handleNullOrUndefined(nextToken), handleNullOrUndefined(keyword), handleNullOrUndefined(startDate), handleNullOrUndefined(endDate));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get specific Keyword Report
  server.tool(
    "getLocalFalconKeywordReport",
    "Retrieves an AUTO-GENERATED keyword report that aggregates scan data for a specific keyword. These are automatically created with runLocalFalconScan EXCEPT when scans are run from campaigns (campaign reports contain this data instead). Cannot be created manually. These will only be generated after a keyword has been scanned for at least 2 locations outside of a campaign. ",
    { reportKey: z.string() },
    async ({ reportKey }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconKeywordReport(apiKey, reportKey);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get list of Competitor Reports
  server.tool(
    "getLocalFalconCompetitorReports",
    "Lists all existing competitor analysis reports that are AUTO-GENERATED after running runLocalFalconScan. Every scan automatically creates a competitor report showing top-ranking businesses in the area. You don't run these separately - they're created automatically with each scan.",
    {
      startDate: z.string().date().nullish().describe("A lower limit (oldest) date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      endDate: z.string().date().nullish().describe("Upper limit (newest) date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      placeId: z.string().nullish().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
      keyword: z.string().nullish().describe("Filter only results similar to specified keyword (loose match)."),
      gridSize: z.enum(['3', '5', '7', '9', '11', '13', '15']).default("3").describe("Filter only for specific grid sizes. Expects 3, 5, 7, 9, 11, 13, or 15."),
      nextToken: z.string().nullish().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
    },
    async ({ startDate, endDate, placeId, keyword, gridSize, nextToken }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const limit = DEFAULT_LIMIT;
      const resp = await fetchLocalFalconCompetitorReports(apiKey, limit, handleNullOrUndefined(startDate), handleNullOrUndefined(endDate), handleNullOrUndefined(placeId), handleNullOrUndefined(keyword), handleNullOrUndefined(gridSize), handleNullOrUndefined(nextToken));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Get specific Competitor Report
  server.tool(
    "getLocalFalconCompetitorReport",
    "Competitor reports look like https://www.localfalcon.com/reports/competitor/view/08116fb5331e258 where 08116fb5331e258 is the report_key. Retrieves an AUTO-GENERATED competitor report that was created when you ran a scan. Shows top-ranking competitors from that scan. These reports are automatically created with every runLocalFalconScan - you cannot create them separately. Use the report_key from getLocalFalconCompetitorReports to view competitor data from a specific scan.",
    {
      reportKey: z.string().describe("The report_key of the Competitor Report you wish to retrieve."),
      lowDataMode: z.boolean().nullish().default(true).describe("Set to false to retrieve more data."),
    },
    async ({ reportKey, lowDataMode }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconCompetitorReport(apiKey, reportKey, (lowDataMode as any === "null" || lowDataMode as any === "undefined") ? false : !!lowDataMode);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  );

  // On-Demand Endpoints for Single-Point Checks
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "getLocalFalconGrid",
    "Helper tool that generates grid coordinates for use with getLocalFalconRankingAtCoordinate or getLocalFalconKeywordAtCoordinate. Creates an array of lat/lng points based on your specified grid size and radius. NOTE: This is only useful if you're doing manual single-point checks. For comprehensive ranking analysis, skip this and use runLocalFalconScan instead, which handles grid creation automatically and provides full reports.",
    {
      lat: z.string().describe("The latitude of the center of the grid."),
      lng: z.string().describe("The longitude of the center of the grid."),
      gridSize: z.string().describe("Expects 3, 5, 7, 9, 11, 13, or 15."),
      radius: z.string().describe("The radius of the grid in meters. From 0.1 to 100."),
      measurement: z.enum(['mi', 'km', 'null', 'undefined']).describe("Expects 'mi' or 'km'."),
    },
    async ({ lat, lng, gridSize, radius, measurement }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconGrid(apiKey, lat, lng, gridSize, radius, handleNullOrUndefined(measurement));
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // On-Demand Endpoint - Single Point Ranking Check
  server.tool(
    "getLocalFalconRankingAtCoordinate",
    "SINGLE-POINT CHECK ONLY - LIMITED USE TOOL. Checks ranking at exactly ONE coordinate. NOT for comprehensive analysis. WARNING: This is like checking the weather by looking out one window - you miss the full picture. Only use for: debugging specific locations, verifying edge cases, or quick spot checks. For ANY serious ranking analysis, reporting, or visibility assessment, use runLocalFalconScan instead which provides complete geographic coverage. Never use this for client reports or strategic decisions.",
    {
      lat: z.string().describe("The latitude of the coordinate."),
      lng: z.string().describe("The longitude of the coordinate."),
      keyword: z.string().describe("The keyword to search for."),
      zoom: z.string().nullish().describe("The zoom level of the map. From 0 to 18.").default("13"),
    },
    async ({ lat, lng, keyword, zoom }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconRankingAtCoordinate(apiKey, lat, lng, keyword, zoom ? zoom : "13");
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );


  // On-Demand Endpoint - Single Point Keyword Search
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "getLocalFalconKeywordAtCoordinate",
    "LIMITED TOOL - Shows raw search results at ONE SINGLE point without ranking analysis. Does not provide ranking positions or competitive insights. Only use for debugging or checking raw SERP data. For actual ranking analysis, use runLocalFalconScan.",
    {
      lat: z.string().describe("The latitude of the coordinate."),
      lng: z.string().describe("The longitude of the coordinate."),
      keyword: z.string().describe("The desired search term or keyword."),
      zoom: z.string().describe("The desired zoom level of the map. From 0 to 18.").default("13"),
    },
    async ({ lat, lng, keyword, zoom }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconKeywordAtCoordinate(apiKey, lat, lng, keyword, zoom ? zoom : "13");
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    }
  );

  // Search for Business Location on Google or Apple
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "searchForLocalFalconBusinessLocation",
    "Searches for business locations on the specified platform. Returns a list of locations that match the search term.",
    {
      term: z.string().describe("The business location name to search for"),
      platform: z.enum(['google', 'apple']).default('google').describe("The platform to search against"),
      proximity: z.string().nullish().describe("Optional proximity filter (e.g., city, state, country)").default(""),
    },
    async ({ term, platform, proximity }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await searchForLocalFalconBusinessLocation(apiKey, term, platform, proximity ? proximity : undefined);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  )

  // Save Business Location to Local Falcon Account
  server.tool(
    "saveLocalFalconBusinessLocationToAccount",
    "Saves a business location to your Local Falcon account. This is required to run a scan if it doesn't exist in your account.",
    {
      platform: z.enum(['google', 'apple']).default('google').describe("The platform to add the location from (google or apple)"),
      placeId: z.string().describe("The Business Location ID to add"),
      name: z.string().describe("Business name (required for Apple)").nullish(),
      lat: z.string().describe("Latitude (required for Apple)").nullish(),
      lng: z.string().describe("Longitude (required for Apple)").nullish(),
    },
    async ({ platform, placeId, name, lat, lng }, ctx) => {
      const apiKey = getApiKey(ctx);

      console.info(`Found apikey: ${apiKey}`)
      if (!apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers",
            },
          ],
        };
      }

      try {
        const resp = await saveLocalFalconBusinessLocationToAccount(apiKey, platform, placeId, handleNullOrUndefined(name), handleNullOrUndefined(lat), handleNullOrUndefined(lng));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(resp, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to save business location: ${error.message}`,
            },
          ],
        };
      }
    }
  );

  // View Local Falcon Account Information
  // @ts-expect-error TS2589 — SDK Zod type inference depth limit
  server.tool(
    "viewLocalFalconAccountInformation",
    "Retrieves Local Falcon account information. Returns user, credit package, subscription, and credits.",
    {
      returnField: z.enum(['user', 'credit package', 'subscription', 'credits', 'null', 'undefined']).nullish().describe("Optional specific return information"),
    },
    async ({ returnField }, ctx) => {
      const apiKey = getApiKey(ctx);
      if (!apiKey) {
        return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
      }
      const resp = await fetchLocalFalconAccountInfo(apiKey, handleNullOrUndefined(returnField) as any);
      return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
    },
  )

  return server;
};

