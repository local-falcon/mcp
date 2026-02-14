# Local Falcon MCP Server

<p align="center">
  <img src="https://www.localfalcon.com/uploads/identity/logos/742656_falcon-ai-logo.svg" alt="Local Falcon" width="120" />
</p>

<p align="center">
  <strong>An MCP (Model Context Protocol) server for the Local Falcon local SEO and AI Visibility platform</strong>
</p>

<p align="center">
  <a href="https://github.com/local-falcon/mcp/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://www.npmjs.com/package/@local-falcon/mcp"><img src="https://img.shields.io/npm/v/@local-falcon/mcp" alt="npm"></a>
  <a href="https://www.localfalcon.com"><img src="https://img.shields.io/badge/Local%20Falcon-Website-red" alt="Local Falcon"></a>
</p>

---

An MCP server for the [Local Falcon platform](https://www.localfalcon.com/), implemented in TypeScript using the official MCP SDK. This server exposes Local Falcon's scanning, tracking, and reporting capabilities as MCP tools — enabling integration with Claude, VS Code, Cursor, and other agentic AI systems.

> **New to Local Falcon?** Learn more at [localfalcon.com](https://www.localfalcon.com/) · [API docs](https://www.localfalcon.com/api/) · [npm package](https://www.npmjs.com/package/@local-falcon/mcp)

---

## Quick Start

The fastest way to connect is through **OAuth** — no API key or local installation required. Just point your MCP client at the server URL and authorize with your Local Falcon account.

| Method | Best for | Requires |
|--------|----------|----------|
| [OAuth](#oauth-recommended) | Claude.ai, MCP clients with OAuth support | Local Falcon account |
| [Bearer Token](#bearer-token) | MCP clients without OAuth | API key |
| [API Key via URL](#api-key-via-query-string) | mcp-remote, simple setups | API key |
| [Local (STDIO)](#local-server-stdio) | Offline use, development | Node.js, API key |

---

## Authentication

### OAuth (Recommended)

OAuth is the recommended way to connect to the Local Falcon MCP server. It provides a secure, token-based authentication flow — no API key management required. You'll be redirected to Local Falcon to authorize access, and tokens are handled automatically.

1. Set the URL to `https://mcp.localfalcon.com/mcp`
2. Set **Authentication** to **OAuth**
3. Leave **Client ID** and **Client Secret** empty — the server handles client registration automatically via [Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591)
4. Connect and authorize when redirected to Local Falcon

**OAuth endpoints:**

| Endpoint | URL |
|----------|-----|
| Authorization Server Metadata | `https://mcp.localfalcon.com/.well-known/oauth-authorization-server` |
| Protected Resource Metadata | `https://mcp.localfalcon.com/.well-known/oauth-protected-resource` |
| Authorization | `https://www.localfalcon.com/oauth/authorize` |
| Token | `https://www.localfalcon.com/oauth/token` |

**Details:** Authorization Code with PKCE (`S256`) · Bearer tokens · Full API access scoped to the authenticating user's account

### Bearer Token

If your MCP client does not support OAuth, you can use your Local Falcon API key as a Bearer token.

1. Set the URL to `https://mcp.localfalcon.com/mcp`
2. Set **Authentication** to **Bearer Token**
3. Enter your [Local Falcon API key](https://www.localfalcon.com/api/) as the token value

### API Key via Query String

If your MCP client does not support OAuth or Bearer Token authentication, you can pass your API key directly in the URL:

```
https://mcp.localfalcon.com/mcp?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE
```

---

## Connection Methods

### Claude.ai Custom Connector (OAuth)

The simplest setup — no installation, no API key, just authorize with your Local Falcon account:

1. Go to **Settings → Connectors → Add custom connector**
2. Name: `Local Falcon`
3. URL: `https://mcp.localfalcon.com/mcp`
4. Click **Add**, then **Connect**
5. Sign in with your Local Falcon account and authorize

### Remote Server via mcp-remote

For MCP clients that use `mcp-remote` (Claude Desktop, VS Code, Cursor, etc.):

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

### Local Server (STDIO)

For offline use or development. Requires [Node.js LTS](https://nodejs.org/).

1. Create a new directory and install the package:

```bash
mkdir lf-mcp
cd lf-mcp
npm i @local-falcon/mcp
```

2. Add to your MCP client configuration:

**macOS / Linux:**

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

**Windows:**

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

<details>
<summary><strong>SSE (Legacy)</strong></summary>

> The `/sse` endpoint is considered legacy and will be removed in a future version. Use `/mcp` (Streamable HTTP) for all new integrations.

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

</details>

---

## Available Tools

### Scan Reports

* **listLocalFalconScanReports** — Lists all existing scan reports. Check here first before running new scans to avoid duplicates.
* **getLocalFalconReport** — Retrieves a specific scan report by report key.
* **runLocalFalconScan** — Runs a new scan at the specified coordinates to get ranking data for a business.

### Campaign Management

* **listLocalFalconCampaignReports** — Lists all campaign reports. Campaigns track rankings at scale with scheduled scans.
* **getLocalFalconCampaignReport** — Retrieves a specific campaign report.
* **createLocalFalconCampaign** — Creates a new campaign with scheduled recurring scans.
* **runLocalFalconCampaign** — Manually triggers a campaign to run immediately.
* **pauseLocalFalconCampaign** — Pauses a campaign's scheduled runs.
* **resumeLocalFalconCampaign** — Resumes a paused campaign.
* **reactivateLocalFalconCampaign** — Reactivates a campaign deactivated due to insufficient credits.

### Reviews Analysis

* **listLocalFalconReviewsAnalysisReports** — Lists all Reviews Analysis reports with AI-powered review insights.
* **getLocalFalconReviewsAnalysisReport** — Retrieves a specific Reviews Analysis report.

### Falcon Guard (GBP Monitoring)

* **listLocalFalconGuardReports** — Lists Falcon Guard reports for monitored locations.
* **getLocalFalconGuardReport** — Retrieves a specific Falcon Guard report by place_id.
* **addLocationsToFalconGuard** — Adds locations to Falcon Guard protection.
* **pauseFalconGuardProtection** — Pauses protection for specified locations.
* **resumeFalconGuardProtection** — Resumes protection for paused locations.
* **removeFalconGuardProtection** — Removes locations from Falcon Guard entirely.

### Trend Reports

* **listLocalFalconTrendReports** — Lists auto-generated trend reports showing ranking changes over time.
* **getLocalFalconTrendReport** — Retrieves a specific trend report.

### Auto Scans

* **listLocalFalconAutoScans** — Lists individually scheduled automatic scans (not campaign-based).

### Location Reports

* **listLocalFalconLocationReports** — Lists auto-generated reports aggregating scans for specific locations.
* **getLocalFalconLocationReport** — Retrieves a specific location report.

### Keyword Reports

* **listLocalFalconKeywordReports** — Lists auto-generated reports aggregating scans for specific keywords.
* **getLocalFalconKeywordReport** — Retrieves a specific keyword report.

### Competitor Reports

* **getLocalFalconCompetitorReports** — Lists auto-generated competitor analysis reports.
* **getLocalFalconCompetitorReport** — Retrieves a specific competitor report.

### Location Management

* **listAllLocalFalconLocations** — Lists all business locations saved in your account.
* **getLocalFalconGoogleBusinessLocations** — Searches Google for business listings to find Place IDs.
* **searchForLocalFalconBusinessLocation** — Searches for business locations on Google or Apple platforms.
* **saveLocalFalconBusinessLocationToAccount** — Saves a business location to your account.

### On-Demand Tools

* **getLocalFalconGrid** — Generates grid coordinates for single-point checks.
* **getLocalFalconRankingAtCoordinate** — Single-point ranking check at one coordinate.
* **getLocalFalconKeywordAtCoordinate** — Single-point keyword search at one coordinate.

### Account

* **viewLocalFalconAccountInformation** — Retrieves account info including user, credits, and subscription details.

---

## For Developers

**Build** (required to run in local MCP host applications):

```bash
bun run build
```

**Run MCP Inspector:**

```bash
bun run inspector
```

**Run MCP Server:**

```bash
bun run start          # defaults to stdio
bun run start:http     # Streamable HTTP transport
bun run start:sse      # SSE transport (legacy)
bun run start:stdio    # STDIO transport
```

---

## License

[MIT](LICENSE)

## Links

* [Local Falcon](https://www.localfalcon.com/)
* [Local Falcon API](https://www.localfalcon.com/api/)
* [npm Package](https://www.npmjs.com/package/@local-falcon/mcp)
* [Model Context Protocol](https://github.com/modelcontextprotocol)
