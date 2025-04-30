# Local Falcon MCP Server

An MCP (Model Context Protocol) server for the [Local Falcon API](https://www.localfalcon.com/), implemented in TypeScript, using the official MCP SDK and Bun as the runtime. This server exposes Local Falcon reporting capabilities as MCP tools, enabling integration with agentic AI systems and workflows.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (ensure it's installed and available in your PATH)
- A Local Falcon API key ([get one here](https://www.localfalcon.com/api/))

### Installation

1. Clone this repository:

   ```bash
   git clone <this-repo-url>
   cd local-falcon-mcp
   ```

2. Install dependencies with Bun:

   ```bash
   bun install
   ```

3. Copy `.env.example` to `.env.local` and add your Local Falcon API key:

   ```env
   LOCALFALCON_API_KEY=your_api_key_here
   ```

---

## Usage

### Start the MCP Server

```bash
bun run mcp-server.ts
```

The server will start in stdio mode, ready to communicate via the MCP protocol.

---

## Development

- TypeScript configuration: see `tsconfig.json`
- Build (necessary to run in local MCP host applications):

  ```bash
  bun run build
  ```

- Run MCP Inspector:

  ```bash
  bun run inspector
  ```

---

## License

MIT

---

## Acknowledgments

- [Local Falcon API](https://www.localfalcon.com/api/)
- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol)
- [Bun](https://bun.sh/)
