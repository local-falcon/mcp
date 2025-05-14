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

For Claude Max/Team users you unlock a greater MCP tool call limit. This must be enabled by appending the `isProUser=true` in the query string of the URL. For example:

```json
{
  "mcpServers": {
    "local-falcon-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.localfalcon.com/sse?local_falcon_api_key=INSERT_YOUR_API_KEY_HERE&isProUser=true"
      ]
    }
  }
}
```

## Running via Claude Integrations (SSE)

If connecting to Claude integrations:
1. name the server `Local Falcon MCP`
2. add the following url: https://mcp.localfalcon.com/sse?local_falcon_api_key=YOUR_API_KEY_HERE

## Tools List
* listLocalFalconScanReports: Retrieves a list of all Scan Reports performed by your Local Falcon account.
* listLocalFalconTrendReports: Retrieves a list of all Trend Reports performed by your Local Falcon account.
* listLocalFalconAutoScans: Retrieves a list of all Auto Scans.
* listAllLocalFalconLocations: Retrieves a list of all locations.
* listLocalFalconLocationReports: Retrieves a list of all location reports.
* getLocalFalconLocationReport: Retrieves a single location report. A location report looks like https://www.localfalcon.com/reports/location/view/c60c325a8665c4a where c60c325a8665c4a is the report key.
* getLocalFalconReport: Retrieves a single Local Falcon scan report given a report key. Only reads the ai analysis of the returned report. Otherwise report the ai analysis is not present. Users can also enter the report key in the format of https://www.localfalcon.com/reports/view/0b38313fa35c37f where 0b38313fa35c37f is the report key.
* getLocalFalconTrendReport: Retrieves a single Local Falcon trend report. A trend report looks like https://www.localfalcon.com/reports/trend/view/95290829819f6e8 where 95290829819f6e8 is the report key.
* listLocalFalconKeywordReports: Retrieves a list of all keyword reports. A keyword report looks like https://www.localfalcon.com/reports/keyword/view/754ffcb0f309938 where 754ffcb0f309938 is the report key.
* getLocalFalconKeywordReport: Retrieves a single Local Falcon keyword report.
* getLocalFalconGrid: A helper method to create a Local Falcon grid.
* getLocalFalconGoogleBusinessLocations: Fetches Local Falcon Google Business locations.
* getLocalFalconRankingAtCoordinate: Retrieves search results at the specified coordinate point and gets ranking data for specified business.
* getLocalFalconKeywordAtCoordinate: Retrieves search results at the specified coordinate point without any rank comparison data.
* runLocalFalconFullGridSearch: Retrieves a full grid search using the passed keyword or search term to match against the specified business.
* getLocalFalconCompetitorReports: Retrieves a list of all Competitor Reports within your Local Falcon account.
* getLocalFalconCompetitorReport: Retrieves up to 20 competitor businesses from a specific Competitor Report from your Local Falcon account.
* listLocalFalconCampaignReports: Retrieves a list of all Location Reports within your Local Falcon account.
* getLocalFalconCampaignReport: Retrieves a full report of a Campaign from your Local Falcon account.
* listLocalFalconGuardReports: Retrieves a list of all Falcon Guard Reports within your Local Falcon account.
* getLocalFalconGuardReport: Retrieves a full report of a Falcon Guard Report from your Local Falcon account given a place_id.

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
