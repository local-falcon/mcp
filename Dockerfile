FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Two things matter here:
#
# 1. The transport mode must be explicit. index.ts defaults argv[2] to "stdio",
#    which would start a STDIO server with no HTTP listener at all — so any
#    deployment relying on the bare command was overriding it elsewhere.
#
# 2. --max-old-space-size must be set. V8's default old-space ceiling is ~2 GB
#    regardless of how much memory the container has, so a 16 GB instance would
#    still hit a JavaScript heap OOM at ~2 GB with ~14 GB unused. Each live MCP
#    session retains ~1.3 MB (one McpServer per session; the SDK forbids sharing
#    one), so the ceiling is what bounds session capacity.
#
# Override the value for a smaller instance — keep it comfortably under the
# container limit so V8 does the GC rather than the kernel doing an OOM-kill.
ENV NODE_OPTIONS="--max-old-space-size=12288"

CMD ["node", "/app/dist/index.js", "HTTPAndSSE"]
