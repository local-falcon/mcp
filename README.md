# Local Falcon MCP Server

An MCP (Model Context Protocol) server for the [Local Falcon API](https://www.localfalcon.com/), implemented in TypeScript, using the official MCP SDK. This server exposes Local Falcon reporting capabilities as MCP tools, enabling integration with agentic AI systems and workflows.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (install the LTS version)

### Getting Started in Claude Desktop

1. Create a new directory for the MCP server and install the package.
```bash
mkdir lf-mcp
cd lf-mcp 
npm i @local-falcon/mcp
```

2. Copy the path to the installed npm module and add it to the args in the mcp.json file making sure to point to the index.js file under /dist.
3. Add your API key to the env in the mcp.json file.

## Running via STDIO

For MacOS/Unix use the following format:
```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/lf-mcp/node_modules/@local-falcon/mcp/dist/index.js"],
      "env": {
        "LOCALFALCON_API_KEY": "INSERT_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

For Windows use the following format:
```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\lf-mcp\\node_modules\\@local-falcon\\mcp\\dist\\index.js"],
      "env": {
        "LOCALFALCON_API_KEY": "INSERT_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

## Running via SSE via a STDIO Gateway

For all platforms use the following format:

```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.localfalcon.com/sse?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE"
      ]
    }
  }
}
```

## Pro Users

For Claude Max/Team users you unlock a greater MCP tool call limit. This must be enabled by appending the `is_pro=true` in the query string of the URL. For example:

```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.localfalcon.com/sse?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE&is_pro=true"
      ]
    }
  }
}
```

## Running via HTTP

For all platforms use the following format:

```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.localfalcon.com/mcp?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE"
      ]
    }
  }
}
```

## Pro Users

For Claude Max/Team users you unlock a greater MCP tool call limit. This must be enabled by appending the `is_pro=true` in the query string of the URL. For example:

```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.localfalcon.com/mcp?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE&is_pro=true"
      ]
    }
  }
}
```

## Running via Claude Integrations (SSE)

If connecting to Claude integrations:
1. name the server `Local Falcon MCP SSE`
2. add the following url: https://mcp.localfalcon.com/sse?local_falcon_api_key=YOUR_API_KEY_HERE

## Running via Claude Integrations (HTTP)

If connecting to Claude integrations:
1. name the server `Local Falcon MCP HTTP`
2. add the following url: https://mcp.localfalcon.com/mcp?local_falcon_api_key=YOUR_API_KEY_HERE

## Tools List

### Scan Reports
* **listLocalFalconScanReports**: Lists all existing scan reports. Check here first before running new scans to avoid duplicates.
* **getLocalFalconReport**: Retrieves a specific scan report by report key (e.g., `https://www.localfalcon.com/reports/view/XXXXX`).
* **runLocalFalconScan**: Runs a new scan at the specified coordinates to get ranking data for a business.

### Campaign Management
* **listLocalFalconCampaignReports**: Lists all campaign reports. Campaigns track rankings at scale with scheduled scans.
* **getLocalFalconCampaignReport**: Retrieves a specific campaign report (e.g., `https://www.localfalcon.com/campaigns/view/XXXXX`).
* **createLocalFalconCampaign**: Creates a new campaign with scheduled recurring scans.
* **runLocalFalconCampaign**: Manually triggers a campaign to run immediately.
* **pauseLocalFalconCampaign**: Pauses a campaign's scheduled runs.
* **resumeLocalFalconCampaign**: Resumes a paused campaign.
* **reactivateLocalFalconCampaign**: Reactivates a campaign deactivated due to insufficient credits.

### Reviews Analysis
* **listLocalFalconReviewsAnalysisReports**: Lists all Reviews Analysis reports with AI-powered review insights.
* **getLocalFalconReviewsAnalysisReport**: Retrieves a specific Reviews Analysis report.

### Falcon Guard (GBP Monitoring)
* **listLocalFalconGuardReports**: Lists Falcon Guard reports for monitored locations.
* **getLocalFalconGuardReport**: Retrieves a specific Falcon Guard report by place_id.
* **addLocationsToFalconGuard**: Adds locations to Falcon Guard protection.
* **pauseFalconGuardProtection**: Pauses protection for specified locations.
* **resumeFalconGuardProtection**: Resumes protection for paused locations.
* **removeFalconGuardProtection**: Removes locations from Falcon Guard entirely.

### Trend Reports
* **listLocalFalconTrendReports**: Lists auto-generated trend reports showing ranking changes over time.
* **getLocalFalconTrendReport**: Retrieves a specific trend report (e.g., `https://www.localfalcon.com/reports/trend/view/XXXXX`).

### Auto Scans
* **listLocalFalconAutoScans**: Lists individually scheduled automatic scans (not campaign-based).

### Location Reports
* **listLocalFalconLocationReports**: Lists auto-generated reports aggregating scans for specific locations.
* **getLocalFalconLocationReport**: Retrieves a specific location report (e.g., `https://www.localfalcon.com/reports/location/view/XXXXX`).

### Keyword Reports
* **listLocalFalconKeywordReports**: Lists auto-generated reports aggregating scans for specific keywords.
* **getLocalFalconKeywordReport**: Retrieves a specific keyword report (e.g., `https://www.localfalcon.com/reports/keyword/view/XXXXX`).

### Competitor Reports
* **getLocalFalconCompetitorReports**: Lists auto-generated competitor analysis reports.
* **getLocalFalconCompetitorReport**: Retrieves a specific competitor report (e.g., `https://www.localfalcon.com/reports/competitor/view/XXXXX`).

### Location Management
* **listAllLocalFalconLocations**: Lists all business locations saved in your account.
* **getLocalFalconGoogleBusinessLocations**: Searches Google for business listings to find Place IDs.
* **searchForLocalFalconBusinessLocation**: Searches for business locations on Google or Apple platforms.
* **saveLocalFalconBusinessLocationToAccount**: Saves a business location to your account.

### On-Demand Tools
* **getLocalFalconGrid**: Helper tool that generates grid coordinates for single-point checks.
* **getLocalFalconRankingAtCoordinate**: Single-point ranking check at one coordinate.
* **getLocalFalconKeywordAtCoordinate**: Single-point keyword search at one coordinate.

### Account
* **viewLocalFalconAccountInformation**: Retrieves account info including user, credits, and subscription details.
---

## For developers

- Build (necessary to run in local MCP host applications):

  ```bash
  bun run build
  ```

- Run MCP Inspector:
  ```bash
  bun run inspector
  ```

- Run MCP Server:

  Run one of the following:

  ```bash
  bun run start
  bun run start:sse
  bun run start:stdio
  ```

  Note: if sse is not specified, the server will default to stdio.


---


## License

MIT

---

## Acknowledgments
- [Local Falcon API](https://www.localfalcon.com/api/)
- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol)
- [Bun](https://bun.sh/)
