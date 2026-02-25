# Local Falcon MCP Server

<p align="center">
  <img src="https://www.localfalcon.com/uploads/identity/logos/742656_falcon-ai-logo.svg" alt="Local Falcon" width="120" />
</p>

<p align="center">
  <strong>An MCP (Model Context Protocol) server for the Local Falcon local SEO and AI Visibility platform</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@local-falcon/mcp"><img src="https://img.shields.io/npm/v/@local-falcon/mcp.svg" alt="npm version"></a>
  <a href="https://github.com/local-falcon/mcp/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg" alt="TypeScript"></a>
  <a href="https://www.localfalcon.com"><img src="https://img.shields.io/badge/Local%20Falcon-Website-red" alt="Local Falcon"></a>
  <a href="https://docs.localfalcon.com"><img src="https://img.shields.io/badge/API%20Docs-docs.localfalcon.com-green" alt="API Docs"></a>
</p>

---

## Local SEO and AI Visibility Monitoring MCP Server

An MCP (Model Context Protocol) server for the [Local Falcon platform](https://www.localfalcon.com/), implemented in TypeScript, using the official MCP SDK. This server exposes Local Falcon scanning, tracking and reporting capabilities as MCP tools, enabling integration with agentic AI systems and workflows.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (install the LTS version)

## Authentication

### OAuth (Recommended)

OAuth is the recommended way to connect to the Local Falcon MCP server. It provides a secure, token-based authentication flow — no API key management required. You'll be redirected to Local Falcon to authorize access, and tokens are handled automatically.

1. Set the URL to `https://mcp.localfalcon.com/mcp`
2. Set **Authentication** to **OAuth**
3. Leave **Client ID** and **Client Secret** empty — the server handles client registration automatically
4. Connect and authorize when redirected to Local Falcon

### Bearer Token

If your MCP client does not support OAuth, you can use your Local Falcon API key as a Bearer token.

1. Set the URL to `https://mcp.localfalcon.com/mcp`
2. Set **Authentication** to **Bearer Token**
3. Enter your Local Falcon API key as the token value

### API Key via Query String

If your MCP client does not support OAuth or Bearer Token authentication, you can pass your API key directly in the URL:

```
https://mcp.localfalcon.com/mcp?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE
```

---

## Running via Remote (HTTP)

For MCP clients that use `mcp-remote` (all platforms):

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

## Running via Remote (SSE — Legacy)

**The /sse endpoint is considered legacy and will be removed in a future version. Use the /mcp endpoint instead.**

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

## Running via STDIO

**One-click install:** Download the latest `.mcpb` bundle from [Releases](https://github.com/local-falcon/mcp/releases) and open it in Claude Desktop. For manual installation, follow the steps below.

For local installations, first install the package:

```bash
mkdir lf-mcp
cd lf-mcp
npm i @local-falcon/mcp
```

For MacOS/Unix:
```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/lf-mcp/node_modules/@local-falcon/mcp/dist/index.js"],
      "env": {
        "LOCAL_FALCON_API_KEY": "INSERT_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

For Windows:
```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\lf-mcp\\node_modules\\@local-falcon\\mcp\\dist\\index.js"],
      "env": {
        "LOCAL_FALCON_API_KEY": "INSERT_YOUR_API_KEY_HERE"
      }
    }
  }
}
```

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

### Knowledge Base
* **searchLocalFalconKnowledgeBase**: Searches the Local Falcon Knowledge Base for help articles, how-to guides, and platform documentation.
* **getLocalFalconKnowledgeBaseArticle**: Retrieves the full content of a specific Knowledge Base article by ID.

### Account
* **viewLocalFalconAccountInformation**: Retrieves account info including user, credits, and subscription details.

---

## For Developers

> **Note:** End users only need [Node.js](https://nodejs.org/) (LTS) and npm to install and run this server. The instructions below are for contributors and developers working on the source code.

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)
- npm (included with Node.js)

### Build

```bash
npm install
npm run build
```

### Run MCP Inspector

```bash
npm run inspector
```

### Run MCP Server

```bash
npm run start             # STDIO mode (default)
npm run start:sse         # SSE mode with OAuth
npm run start:http        # HTTP mode with OAuth
```


---


## License

MIT

---

## Acknowledgments
- [Local Falcon API Documentation](https://docs.localfalcon.com)
- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (Anthropic MCP SDK)
