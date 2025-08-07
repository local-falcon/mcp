import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import dotenv from "dotenv";
import { fetchLocalFalconAutoScans, fetchLocalFalconFullGridSearch, fetchLocalFalconGoogleBusinessLocations, fetchLocalFalconGrid, fetchLocalFalconKeywordAtCoordinate, fetchLocalFalconKeywordReport, fetchLocalFalconKeywordReports, fetchLocalFalconLocationReport, fetchLocalFalconLocationReports, fetchAllLocalFalconLocations, fetchLocalFalconRankingAtCoordinate, fetchLocalFalconReport, fetchLocalFalconReports, fetchLocalFalconTrendReport, fetchLocalFalconTrendReports, fetchLocalFalconCompetitorReports, fetchLocalFalconCompetitorReport, fetchLocalFalconCampaignReports, fetchLocalFalconCampaignReport, fetchLocalFalconGuardReports, fetchLocalFalconGuardReport, runLocalFalconScan, searchForLocalFalconBusinessLocation, fetchLocalFalconAccountInfo, saveLocalFalconBusinessLocationToAccount } from "./localfalcon.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

dotenv.config({ path: ".env.local" });


const LOW_LIMIT = "3"
const HIGH_LIMIT = "7"


export const getServer = (sessionMapping: Map<string, { apiKey: string; isPro: boolean }>) => {
    const getApiKey = (ctx: any) => {
        const sessionId = ctx?.sessionId;
        const sessionHeaders = sessionMapping.get(sessionId)
        if (!sessionHeaders) {
          return process.env.LOCAL_FALCON_API_KEY;
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
      "ALWAYS USE THIS FIRST before running new scans. Shows all existing scan reports to check if the data you need already exists. Prevents duplicate scans and saves time. Check here before using runLocalFalconScan to see if a recent report is available. Lists reports with dates, keywords, and locations for easy identification. NOTE: If a scan shows a campaign_key, it means a campaign report exists with broader multi-location/keyword data. Campaign scans won't have separate location/keyword reports - all that data is consolidated in the campaign report instead.",
      { nextToken: z.string().optional().nullable() },
      async ({ nextToken }, ctx) => {
        const apiKey = getApiKey(ctx);
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconReports(apiKey, limit, nextToken ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

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

    server.tool(
      "listAllLocalFalconLocations",
      "Lists all business locations already configured in the Local Falcon account. Check here BEFORE using getLocalFalconGoogleBusinessLocations - if the business is already in the account, you'll get the Place ID instantly without needing to search Google. Saves time and ensures consistency with previous scans.",
      {
        query: z.string().optional().nullable().describe("Search query. Matches against location name, address, Place ID, or store code.")
      },
      async ({ query }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchAllLocalFalconLocations(apiKey, query ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

    server.tool(
      "getLocalFalconGoogleBusinessLocations",
      "Searches Google for business listings to find Place IDs needed for runLocalFalconScan. ONLY use this if: 1) Place ID not found in previous scan reports, AND 2) Business not found in listAllLocalFalconLocations. This is the last resort for finding a Place ID. Returns multiple potential matches - verify you have the correct business before scanning.",
      {
        nextToken: z.string().optional().nullable().describe("Pagination token for additional results."),
        query: z.string().describe("The query to search for."),
        near: z.string().optional().nullable().describe("Narrow results by location. City, state, country, etc."),
      },
      async ({ nextToken, query, near }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconGoogleBusinessLocations(apiKey, nextToken ?? undefined, query, near ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

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

    server.tool(
      "listLocalFalconCampaignReports",
      "Lists all campaign reports in your account. Campaigns are the primary way to organize and track rankings at scale. Can include: single location + single keyword, multiple locations + single keyword, single location + multiple keywords, or multiple locations + multiple keywords. Most campaigns run on automated schedules (daily, weekly, monthly) making them the preferred method for ongoing tracking, but can also be run manually. Campaign reports consolidate all data in one place - no separate location/keyword reports are generated for campaign scans. Check here to see scheduled scan activity and multi-location/keyword performance data.",
      {
        startDate: z.string().date().optional().nullable().describe("A lower limit date of a Campaign run you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
        endDate: z.string().date().optional().nullable().describe("Upper limit date of a Campaign run or schedule you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
        placeId: z.string().optional().nullable().describe("Filter only results for specific Google Place ID. Supports multiple Google Place IDs, seperated by commas."),
        nextToken: z.string().optional().nullable().describe("This parameter is used to get the next 'page' of results. The value used with the parameter is provided from a previous response by this endpoint if more 'pages' of results exist."),
      },
      async ({ startDate, endDate, placeId, nextToken }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        const resp = await fetchLocalFalconCampaignReports(apiKey, limit, startDate ?? undefined, endDate ?? undefined, placeId ?? undefined, nextToken ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );
  
    server.tool(
      "listLocalFalconGuardReports",
      "Lists Falcon Guard reports IF they exist for your locations. Falcon Guard monitors Google Business Profile health and changes. NOTE: Not all locations have Guard reports. For OAuth-connected locations, reports include calls/clicks/directions data. For manually added locations, reports only show historical GBP changes.",
      {
        startDate: z.string().date().optional().nullable().describe("A lower limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
        endDate: z.string().date().optional().nullable().describe("Upper limit date you wish to retrieve. Expects date formatted as MM/DD/YYYY."),
      },
      async ({ startDate, endDate }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        const resp = await fetchLocalFalconGuardReports(apiKey, limit, startDate ?? undefined, endDate ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

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

    server.tool(
      "listLocalFalconTrendReports",
      "Lists all existing trend reports that are AUTO-GENERATED when you run multiple scans with identical settings (same place ID, keyword, lat/lng, grid size, radius, platform). Trend reports show ranking changes over time and only appear after at least 2 identical scans. Check here to see historical ranking trends for a single location and single keyword at a time.",
      {
        nextToken: z.string().optional().nullable(),
        placeId: z.string().optional().nullable(),
        keyword: z.string().optional().nullable(),
      },
      async ({ nextToken, placeId, keyword }, ctx) => {
        const apiKey = getApiKey(ctx);
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconTrendReports(apiKey, limit, nextToken ?? undefined, placeId ?? undefined, keyword ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

    server.tool(
      "listLocalFalconAutoScans",
      "Lists ONLY individually scheduled automatic scans. NOTE: This does NOT include campaign-scheduled scans, which are the more common way to schedule recurring scans. To see campaign schedules, use listLocalFalconCampaignReports instead. Most users schedule scans through campaigns for better organization and reporting.",
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
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconAutoScans(apiKey, nextToken ?? undefined, placeId ?? undefined, keyword ?? undefined, grid_size ?? undefined, frequency ?? undefined, status ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

    server.tool(
      "listLocalFalconLocationReports",
      "Lists all existing location reports that are AUTO-GENERATED after running runLocalFalconScan. NOTE: Location reports are NOT generated if the scan was initiated from a campaign (that data is included in the campaign report instead). These aggregate all scans for a specific business location. These will only be generated after a location has been scanned for at least 2 keywords outside of a campaign. ",
      {
        placeId: z.string().optional().nullable().describe("The Place ID of the location."),
        keyword: z.string().optional().nullable().describe("The keyword to search for."),
        nextToken: z.string().optional().nullable().describe("Pagination token for additional results.")
      },
      async ({ placeId, keyword, nextToken }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        const resp = await fetchLocalFalconLocationReports(apiKey, limit, placeId ?? undefined, keyword ?? undefined, nextToken ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

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

    server.tool(
      "listLocalFalconKeywordReports",
      "A keyword report looks like https://www.localfalcon.com/reports/keyword/view/754ffcb0f309938 where 754ffcb0f309938 is the report key. Lists all existing keyword reports that are AUTO-GENERATED after running runLocalFalconScan. NOTE: Keyword reports are NOT generated if the scan was initiated from a campaign (that data is included in the campaign report instead). These aggregate all scans for a specific keyword. These will only be generated after a keyword has been scanned for at least 2 locations outside of a campaign. ",
      {
        nextToken: z.string().optional().nullable().describe("Pagination token for additional results."),
        keyword: z.string().optional().nullable().describe("The keyword to search for."),
      },
      async ({ nextToken, keyword }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        const resp = await fetchLocalFalconKeywordReports(apiKey, limit, nextToken ?? undefined, keyword ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

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

    server.tool(
      "getLocalFalconCompetitorReports",
      "Lists all existing competitor analysis reports that are AUTO-GENERATED after running runLocalFalconScan. Every scan automatically creates a competitor report showing top-ranking businesses in the area. You don't run these separately - they're created automatically with each scan.",
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
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const limit = isProUser(ctx) ? HIGH_LIMIT : LOW_LIMIT;
        const resp = await fetchLocalFalconCompetitorReports(apiKey, limit, startDate ?? undefined, endDate ?? undefined, placeId ?? undefined, keyword ?? undefined, gridSize ?? undefined, nextToken ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

    server.tool(
      "getLocalFalconCompetitorReport",
      "Competitor reports look like https://www.localfalcon.com/reports/competitor/view/08116fb5331e258 where 08116fb5331e258 is the report_key. Retrieves an AUTO-GENERATED competitor report that was created when you ran a scan. Shows top-ranking competitors from that scan. These reports are automatically created with every runLocalFalconScan - you cannot create them separately. Use the report_key from getLocalFalconCompetitorReports to view competitor data from a specific scan.",
      {
        reportKey: z.string().describe("The report_key of the Competitor Report you wish to retrieve."),
        lowDataMode: z.boolean().optional().nullable().default(true).describe("Set to false to retrieve more data."),
      },
      async ({ reportKey, lowDataMode }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconCompetitorReport(apiKey, reportKey, lowDataMode ?? true);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      },
    );

    server.tool(
      "getLocalFalconGrid",
      "Helper tool that generates grid coordinates for use with getLocalFalconRankingAtCoordinate or getLocalFalconKeywordAtCoordinate. Creates an array of lat/lng points based on your specified grid size and radius. NOTE: This is only useful if you're doing manual single-point checks. For comprehensive ranking analysis, skip this and use runLocalFalconScan instead, which handles grid creation automatically and provides full reports.",
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
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconGrid(apiKey, lat, lng, gridSize, radius, measurement);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

    server.tool(
      "getLocalFalconRankingAtCoordinate",
      "SINGLE-POINT CHECK ONLY - LIMITED USE TOOL. Checks ranking at exactly ONE coordinate. NOT for comprehensive analysis. WARNING: This is like checking the weather by looking out one window - you miss the full picture. Only use for: debugging specific locations, verifying edge cases, or quick spot checks. For ANY serious ranking analysis, reporting, or visibility assessment, use runLocalFalconScan instead which provides complete geographic coverage. Never use this for client reports or strategic decisions.",
      {
        lat: z.string().describe("The latitude of the coordinate."),
        lng: z.string().describe("The longitude of the coordinate."),
        keyword: z.string().describe("The keyword to search for."),
        zoom: z.string().optional().nullable().describe("The zoom level of the map. From 0 to 18.").default("13"),
      },
      async ({ lat, lng, keyword, zoom }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconRankingAtCoordinate(apiKey, lat, lng, keyword, zoom ?? "13");
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

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
        const resp = await fetchLocalFalconKeywordAtCoordinate(apiKey, lat, lng, keyword, zoom);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      }
    );

    server.tool(
      "getLocalFalconCampaignReport",
      "Campaign reports look like https://www.localfalcon.com/campaigns/view/0ee3c5869f3fa13 where 0ee3c5869f3fa13 is the report_key. Retrieves a specific campaign report that tracks multiple locations/keywords. Only for existing reports. Contains aggregated metrics (ARP, ATRP, SOLV), individual scan results, performance breakdowns by keyword and location, and scheduling info. Consolidates all data - no separate location/keyword reports exist for campaign scans.",
      {
        reportKey: z.string().describe("The report_key of the Campaign Report you wish to retrieve."),
      },
      async ({ reportKey }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconCampaignReport(apiKey, reportKey);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      },
    );

    server.tool(
      "searchForLocalFalconBusinessLocation",
      "Searches for business locations on the specified platform. Returns a list of locations that match the search term.",
      {
        term: z.string().describe("The business location name to search for"),
        platform: z.enum(['google', 'apple']).describe("The platform to search against"),
        proximity: z.string().nullish().describe("Optional proximity filter (e.g., city, state, country)").default(""),
      },
      async ({ term, platform, proximity }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await searchForLocalFalconBusinessLocation(apiKey, term, platform, proximity ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      },
    )

    server.tool(
      "saveLocalFalconBusinessLocationToAccount",
      "Saves a business location to your Local Falcon account. This is required to run a scan if it doesn't exist in your account.",
      {
        platform: z.enum(['google', 'apple']).describe("The platform to add the location from (google or apple)"),
        placeId: z.string().describe("The Business Location ID to add"),
        name: z.string().describe("Business name (required for Apple)").optional().nullable(),
        lat: z.string().describe("Latitude (required for Apple)").optional().nullable(),
        lng: z.string().describe("Longitude (required for Apple)").optional().nullable(),
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
          const resp = await saveLocalFalconBusinessLocationToAccount(apiKey, platform, placeId, name ?? undefined, lat ?? undefined, lng ?? undefined);
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
    

    server.tool(
      "viewLocalFalconAccountInformation",
      "Retrieves Local Falcon account information. Returns user, credit package, subscription, and credits.",
      {
        returnField: z.enum(['user', 'credit package', 'subscription', 'credits']).optional().nullish().describe("Optional specific return information"),
      },
      async ({ returnField }, ctx) => {
        const apiKey = getApiKey(ctx);
        if (!apiKey) {
          return { content: [{ type: "text", text: "Missing LOCAL_FALCON_API_KEY in environment variables or request headers" }] };
        }
        const resp = await fetchLocalFalconAccountInfo(apiKey, returnField ?? undefined);
        return { content: [{ type: "text", text: JSON.stringify(resp, null, 2) }] };
      },
    )
  
    return server;
  };