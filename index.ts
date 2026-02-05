import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import express, { Application, Request, Response, RequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { v4 as uuidv4 } from "uuid";
import { getServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { setupOAuthRoutes } from "./oauth/index.js";

// Configure environment variables
dotenv.config({ path: ".env.local" });

// Types
interface SessionData {
  apiKey: string;
  isPro: boolean;
}

type Transport = SSEServerTransport | StreamableHTTPServerTransport;

type AsyncRequestHandler = (req: Request, res: Response) => Promise<void>;

// Session Management
class SessionManager {
  private sessions = new Map<string, SessionData>();
  private transports = new Map<string, Transport>();

  add(sessionId: string, data: SessionData, transport?: Transport): void {
    this.sessions.set(sessionId, data);
    if (transport) this.transports.set(sessionId, transport);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.transports.delete(sessionId);
  }

  getTransport(sessionId: string): Transport | undefined {
    return this.transports.get(sessionId);
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionMap(): Map<string, SessionData> {
    return this.sessions;
  }

  getTransportMap(): Map<string, Transport> {
    return this.transports;
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  async cleanup(): Promise<void> {
    console.log("Cleaning up sessions...");
    for (const [sessionId, transport] of this.transports) {
      try {
        console.log(`Closing transport for session ${sessionId}`);
        await transport.close();
      } catch (error: unknown) {
        console.error(`Failed to close transport for session ${sessionId}:`, error);
      }
    }
    this.sessions.clear();
    this.transports.clear();
  }
}

// Authentication Utilities
const extractAuth = (req: Request): { apiKey?: string; isPro?: string } => {
  // Extract Bearer token from Authorization header
  const authHeader = req.headers["authorization"] as string | undefined;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  // Check Authorization Bearer, custom header, query params, and cookies (in order of priority)
  const apiKey = bearerToken ??
    (req.headers["local_falcon_api_key"] as string | undefined) ??
    (req.query["local_falcon_api_key"] as string | undefined) ??
    (req.cookies?.["local_falcon_api_key"] as string | undefined);
  const isPro = (req.headers["is_pro"] as string | undefined) ??
    (req.query["is_pro"] as string | undefined);
  const source = bearerToken ? "bearer" :
    req.headers["local_falcon_api_key"] ? "header" :
    req.query["local_falcon_api_key"] ? "query" :
    req.cookies?.["local_falcon_api_key"] ? "cookie" : "none";
  console.log(`[${new Date().toISOString()}] Extracted auth - Method: ${req.method}, URL: ${req.url}, ` +
    `apiKey: ${apiKey ? `"${apiKey.substring(0, 8)}..."` : "missing"}, source: ${source}, isPro: ${isPro || "not provided"}`);
  return { apiKey, isPro };
};

const validateAuth = (apiKey?: string): boolean => {
  const isValid = !!apiKey && apiKey.trim() !== "";
  if (!isValid) console.log(`[${new Date().toISOString()}] Authentication failed: API key is ${apiKey ? "empty" : "missing"}`);
  return isValid;
};

// Base Application Setup
const createBaseApp = (sessionManager: SessionManager): Application => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // Required for OAuth token requests
  app.use(cookieParser());
  app.use(cors({
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'LOCAL_FALCON_API_KEY', 'is_pro', 'last-event-id'],
    origin: "*",
    exposedHeaders: ['mcp-session-id'],
  }));

  // Health check endpoints
  app.get("/ping", (_req: Request, res: Response): void => {
    res.status(200).json({ status: "ok", message: "Local Falcon MCP server is up." });
  });

  app.get("/healthz", (_req: Request, res: Response): void => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connectedSessions: sessionManager.getSessionCount(),
    });
  });

  // Helper to get base URL respecting proxy headers
  const getBaseUrl = (req: Request): string => {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    return `${protocol}://${host}`;
  };

  // OAuth 2.0 Authorization Server Metadata (RFC 8414)
  const oauthMetadata = (_req: Request, res: Response): void => {
    const baseUrl = getBaseUrl(_req);
    res.status(200).json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  };

  // Support both OpenID Connect and OAuth 2.0 discovery paths
  app.get("/.well-known/openid-configuration", oauthMetadata);
  app.get("/.well-known/oauth-authorization-server", oauthMetadata);

  // OAuth 2.0 Protected Resource Metadata (RFC 9449)
  app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response): void => {
    const baseUrl = getBaseUrl(_req);
    res.status(200).json({
      resource: baseUrl,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: ["api"],
    });
  });

  // Client registration endpoint - returns pre-configured client credentials
  // Dynamic registration is not actually performed; credentials are hardcoded
  app.post("/register", (_req: Request, res: Response): void => {
    const baseUrl = getBaseUrl(_req);
    res.status(201).json({
      client_id: "74e0d6e848652234efed.localfalconapps.com",
      client_secret: "71fdc6383c274334095fec457fb2085d73451a79fd030e460c69a6f3db00af0b",
      client_name: "LocalFalcon MCP",
      redirect_uris: [`${baseUrl}/oauth/callback`],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  // Setup OAuth routes
  setupOAuthRoutes(app);

  return app;
};

// SSE Transport Handlers
const setupSSERoutes = (app: Application, sessionManager: SessionManager): void => {
  // SSE endpoint for establishing streams
  const sseHandler: AsyncRequestHandler = async (req, res) => {
    console.log("Establishing SSE stream...");
    const { apiKey, isPro } = extractAuth(req);

    if (!validateAuth(apiKey)) {
      res.status(401).json({ 
        error: "Missing or invalid LOCAL_FALCON_API_KEY", 
        headers: req.headers, 
        query: req.query 
      });
      return;
    }

    try {
      const transport = new SSEServerTransport("/sse/messages", res);
      const sessionId = transport.sessionId;

      sessionManager.add(sessionId, { apiKey: apiKey!, isPro: isPro === "true" }, transport);
      
      transport.onclose = () => {
        console.log(`SSE transport closed for session ${sessionId}`);
        sessionManager.remove(sessionId);
      };

      const server = getServer(sessionManager.getSessionMap());
      await server.connect(transport);
      console.log(`Established SSE stream with session ID: ${sessionId}`);
    } catch (error: unknown) {
      console.error("Error establishing SSE stream:", error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Error establishing SSE stream", 
          details: String(error) 
        });
      }
    }
  };

  // SSE message handling endpoint
  const sseMessagesHandler: AsyncRequestHandler = async (req, res) => {
    console.log("Received message for SSE...");
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      console.error("Missing session ID in SSE request");
      res.status(400).json({ error: "Missing sessionId parameter" });
      return;
    }

    const transport = sessionManager.getTransport(sessionId);
    if (!transport || !(transport instanceof SSEServerTransport)) {
      console.error(`No active SSE transport for session ID: ${sessionId}`);
      res.status(404).json({ error: "Session not found" });
      return;
    }

    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (error: unknown) {
      console.error("Error handling SSE message:", error);
      if (!res.headersSent) {
        res.status(500).json({ 
          error: "Error handling request", 
          details: String(error) 
        });
      }
    }
  };

  app.get("/sse", sseHandler);
  app.post("/sse/messages", sseMessagesHandler);
};

// HTTP Transport Handlers
const setupHTTPRoutes = (app: Application, sessionManager: SessionManager): void => {
  // Main MCP HTTP endpoint
  const mcpHandler: AsyncRequestHandler = async (req, res) => {
    console.log(`MCP Request received: ${req.method} ${req.url}`, { body: req.body });
    
    // Capture response data for logging
    const originalJson = res.json;
    res.json = function(body) {
      console.log(`MCP Response being sent:`, JSON.stringify(body, null, 2));
      return originalJson.call(this, body);
    };
    
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && sessionManager.getTransport(sessionId)) {
        // Reuse existing transport
        console.log(`Reusing HTTP session: ${sessionId}`);
        transport = sessionManager.getTransport(sessionId) as StreamableHTTPServerTransport;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request
        console.log(`New HTTP session request: ${req.body.method}`);
        const { apiKey, isPro } = extractAuth(req);
        
        if (!validateAuth(apiKey)) {
          res.status(401).json({
            error: "Missing or invalid LOCAL_FALCON_API_KEY",
            headers: req.headers,
            query: req.query,
          });
          return;
        }

        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => uuidv4(),
          enableJsonResponse: true,
          eventStore,
          onsessioninitialized: (sessionId) => {
            console.log(`HTTP Session initialized: ${sessionId}`);
            sessionManager.add(sessionId, { apiKey: apiKey!, isPro: isPro === "true" }, transport);
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessionManager.getTransport(sid)) {
            console.log(`HTTP Transport closed for session ${sid}, removing from session manager`);
            sessionManager.remove(sid);
          }
        };

        console.log(`Connecting HTTP transport to MCP server...`);
        await getServer(sessionManager.getSessionMap()).connect(transport);
        console.log(`HTTP Transport connected to MCP server successfully`);
        
        console.log(`Handling HTTP initialization request...`);
        await transport.handleRequest(req, res, req.body);
        console.log(`HTTP Initialization request handled, response sent`);
        return;
      } else {
        console.error('Invalid HTTP request: No valid session ID or initialization request');
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      console.log(`Handling HTTP request for session: ${transport.sessionId}`);
      const startTime = Date.now();
      await transport.handleRequest(req, res, req.body);
      const duration = Date.now() - startTime;
      console.log(`HTTP Request handling completed in ${duration}ms for session: ${transport.sessionId}`);
    } catch (error) {
      console.error('Error handling MCP HTTP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  // Handle GET requests for server-to-client notifications via HTTP SSE
  const mcpGetHandler: AsyncRequestHandler = async (req, res) => {
    console.log(`MCP GET Request received: ${req.method} ${req.url}`);
    
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessionManager.getTransport(sessionId)) {
        console.log(`Invalid session ID in HTTP GET request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        console.log(`HTTP Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        console.log(`Establishing new HTTP SSE stream for session ${sessionId}`);
      }
      
      const transport = sessionManager.getTransport(sessionId);
      
      res.on('close', () => {
        console.log(`HTTP SSE connection closed for session ${sessionId}`);
      });
      
      console.log(`Starting HTTP SSE transport.handleRequest for session ${sessionId}...`);
      const startTime = Date.now();
      await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(`HTTP SSE stream setup completed in ${duration}ms for session: ${sessionId}`);
    } catch (error) {
      console.error('Error handling HTTP GET request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  };

  // Handle DELETE requests for session termination
  const mcpDeleteHandler: AsyncRequestHandler = async (req, res) => {
    console.log(`MCP DELETE Request received: ${req.method} ${req.url}`);
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessionManager.getTransport(sessionId)) {
        console.log(`Invalid session ID in HTTP DELETE request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      console.log(`Received HTTP session termination request for session ${sessionId}`);
      const transport = sessionManager.getTransport(sessionId);
      
      const originalSend = res.send;
      res.send = function(body) {
        console.log(`HTTP DELETE response being sent:`, body);
        return originalSend.call(this, body);
      };
      
      console.log(`Processing HTTP session termination...`);
      const startTime = Date.now();
      await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(`HTTP Session termination completed in ${duration}ms for session: ${sessionId}`);
      
      setTimeout(() => {
        if (sessionManager.getTransport(sessionId)) {
          console.log(`Note: HTTP Transport for session ${sessionId} still exists after DELETE request`);
        } else {
          console.log(`HTTP Transport for session ${sessionId} successfully removed after DELETE request`);
        }
      }, 100);
    } catch (error) {
      console.error('Error handling HTTP DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  };

  app.post('/mcp', mcpHandler);
  app.get('/mcp', mcpGetHandler);
  app.delete('/mcp', mcpDeleteHandler);
};

// Unified Server Creation
const createUnifiedServer = (sessionManager: SessionManager, modes: string[]): Application => {
  const app = createBaseApp(sessionManager);
  
  if (modes.includes('sse')) {
    console.log('Setting up SSE routes...');
    setupSSERoutes(app, sessionManager);
  }
  
  if (modes.includes('http')) {
    console.log('Setting up HTTP routes...');
    setupHTTPRoutes(app, sessionManager);
  }
  
  return app;
};

// Server Startup
const startUnifiedServer = (app: Application, sessionManager: SessionManager, modes: string[]): void => {
  const port = parseInt(process.env.PORT ?? "8000", 10);
  const server = app.listen(port, () => {
    console.log(`Unified MCP server listening on port ${port}`);
    console.log(`Active modes: ${modes.join(', ').toUpperCase()}`);
    console.log(`Available endpoints:`);
    if (modes.includes('sse')) {
      console.log(`  - SSE: GET /sse, POST /sse/messages`);
    }
    if (modes.includes('http')) {
      console.log(`  - HTTP: POST /mcp, GET /mcp, DELETE /mcp`);
    }
    console.log(`  - Health: GET /ping, GET /healthz`);
  });

  process.on("SIGINT", async () => {
    console.log("Shutting down unified server...");
    await sessionManager.cleanup();
    server.close(() => {
      console.log("Unified server shutdown complete");
      process.exit(0);
    });
  });

  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM, shutting down unified server...");
    await sessionManager.cleanup();
    server.close(() => {
      console.log("Unified server shutdown complete");
      process.exit(0);
    });
  });
};

const startStdioServer = (): void => {
  // Note: In STDIO mode, stdout is reserved for JSON-RPC messages only.
  // Use stderr for logging to avoid breaking the protocol.
  console.error("Starting STDIO server...");
  const transport = new StdioServerTransport();
  const server = getServer(new Map<string, SessionData>());

  server.connect(transport).catch((error: unknown) => {
    console.error("Error connecting stdio server:", error);
    process.exit(1);
  });

  process.on("uncaughtException", (error: Error) => {
    console.error("Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown, promise: Promise<unknown>) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
  });

  console.error("STDIO server started successfully");
};

// Main Execution
const main = (): void => {
  const serverMode = process.argv[2] ?? "stdio";

  try {
    switch (serverMode) {
      case "sse": {
        const sessionManager = new SessionManager();
        const app = createUnifiedServer(sessionManager, ['sse']);
        startUnifiedServer(app, sessionManager, ['sse']);
        break;
      }
      case "http": {
        const sessionManager = new SessionManager();
        const app = createUnifiedServer(sessionManager, ['http']);
        startUnifiedServer(app, sessionManager, ['http']);
        break;
      }
      case "unified":
      case "both":
      case "HTTPAndSSE": {
        const sessionManager = new SessionManager();
        const app = createUnifiedServer(sessionManager, ['http', 'sse']);
        startUnifiedServer(app, sessionManager, ['http', 'sse']);
        break;
      }
      case "stdio":
      default:
        startStdioServer();
        break;
    }
  } catch (error: unknown) {
    console.error(`Error starting ${serverMode} server:`, error);
    process.exit(1);
  }
};

main();