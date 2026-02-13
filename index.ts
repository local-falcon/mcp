import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";
import express, { Application, Request, Response, RequestHandler } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { getServer } from "./server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { setupOAuthRoutes, revokeToken, createTokenVerifier } from "./oauth/index.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// Augment Express Request to include auth info set by our bearer auth middleware
declare module "express" {
  interface Request {
    auth?: AuthInfo;
  }
}

// Configure environment variables
dotenv.config({ path: ".env.local" });

// Types
interface SessionData {
  apiKey: string;
  isPro: boolean;
  createdAt: number;
  lastActivity: number;
}

// Minimum session age before revocation (prevents revoking during OAuth setup)
const MIN_SESSION_AGE_FOR_REVOCATION_MS = 60000; // 60 seconds

// Session inactivity timeout - revoke tokens for sessions inactive longer than this
const SESSION_INACTIVITY_TIMEOUT_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

// How often to check for inactive sessions
const INACTIVITY_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

type Transport = SSEServerTransport | StreamableHTTPServerTransport;

type AsyncRequestHandler = (req: Request, res: Response) => Promise<void>;

// Session Management
class SessionManager {
  private sessions = new Map<string, SessionData>();
  private transports = new Map<string, Transport>();

  add(sessionId: string, data: Omit<SessionData, 'createdAt' | 'lastActivity'>, transport?: Transport): void {
    const now = Date.now();
    const sessionData = { ...data, createdAt: now, lastActivity: now };
    console.log(`[Session] Adding session ${sessionId}:`, {
      hasApiKey: !!data.apiKey,
      apiKeyPrefix: data.apiKey ? data.apiKey.substring(0, 8) + '...' : 'none',
      isPro: data.isPro,
      createdAt: sessionData.createdAt,
    });
    this.sessions.set(sessionId, sessionData);
    if (transport) this.transports.set(sessionId, transport);
  }

  remove(sessionId: string): void {
    console.log(`[Session] remove() called for session ${sessionId}`);
    const session = this.sessions.get(sessionId);

    if (!session) {
      console.log(`[Session] No session found for ${sessionId} - already removed or never existed`);
      this.transports.delete(sessionId);
      return;
    }

    console.log(`[Session] Session data for ${sessionId}:`, {
      hasApiKey: !!session.apiKey,
      apiKeyPrefix: session.apiKey ? session.apiKey.substring(0, 8) + '...' : 'none',
      isPro: session.isPro,
      createdAt: session.createdAt,
      ageMs: Date.now() - session.createdAt,
    });

    if (session.apiKey) {
      const sessionAge = Date.now() - session.createdAt;
      // Only revoke if session was active long enough (not during OAuth setup)
      if (sessionAge >= MIN_SESSION_AGE_FOR_REVOCATION_MS) {
        console.log(`[Session] Revoking token for disconnected session ${sessionId} (age: ${Math.round(sessionAge / 1000)}s)`);
        revokeToken(session.apiKey)
          .then(() => {
            console.log(`[Session] Token revocation call completed for session ${sessionId}`);
          })
          .catch((err) => {
            console.error(`[Session] Failed to revoke token for session ${sessionId}:`, err);
          });
      } else {
        console.log(`[Session] Skipping revocation for new session ${sessionId} (age: ${Math.round(sessionAge / 1000)}s, threshold: ${MIN_SESSION_AGE_FOR_REVOCATION_MS}ms)`);
      }
    } else {
      console.log(`[Session] No apiKey for session ${sessionId} - skipping revocation`);
    }

    this.sessions.delete(sessionId);
    this.transports.delete(sessionId);
    console.log(`[Session] Session ${sessionId} removed from manager`);
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

  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  private inactivityInterval: ReturnType<typeof setInterval> | null = null;

  startInactivityChecker(): void {
    this.inactivityInterval = setInterval(() => {
      const now = Date.now();
      for (const [sessionId, session] of this.sessions) {
        const inactiveMs = now - session.lastActivity;
        if (inactiveMs >= SESSION_INACTIVITY_TIMEOUT_MS) {
          console.log(`[Session] Session ${sessionId} inactive for ${Math.round(inactiveMs / 1000 / 60 / 60)}h, revoking token and removing`);
          // Grab transport before remove() deletes it from the map
          const transport = this.transports.get(sessionId);
          this.remove(sessionId);
          // Also close the transport to free resources
          if (transport) {
            transport.close().catch((err) => {
              console.error(`[Session] Failed to close transport for stale session ${sessionId}:`, err);
            });
          }
        }
      }
    }, INACTIVITY_CHECK_INTERVAL_MS);
  }

  stopInactivityChecker(): void {
    if (this.inactivityInterval) {
      clearInterval(this.inactivityInterval);
      this.inactivityInterval = null;
    }
  }

  async cleanup(): Promise<void> {
    this.stopInactivityChecker();
    console.log("Cleaning up sessions...");

    // Revoke all OAuth tokens
    const revocationPromises: Promise<void>[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.apiKey) {
        console.log(`[Session] Revoking token for session ${sessionId}`);
        revocationPromises.push(
          revokeToken(session.apiKey).catch((err) => {
            console.error(`[Session] Failed to revoke token for session ${sessionId}:`, err);
          })
        );
      }
    }

    // Wait for all revocations to complete (with timeout)
    await Promise.race([
      Promise.all(revocationPromises),
      new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
    ]);

    // Close all transports
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

// OAuth 2.1 Token Verifier — used by requireBearerAuth middleware
const tokenVerifier = createTokenVerifier();

// Base Application Setup
const createBaseApp = (sessionManager: SessionManager): Application => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // Required for OAuth token requests
  app.use(cors({
    allowedHeaders: ['Content-Type', 'Authorization', 'mcp-session-id', 'last-event-id'],
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

  // OAuth 2.1 Authorization Server Metadata (RFC 8414)
  const oauthMetadata = (_req: Request, res: Response): void => {
    const baseUrl = getBaseUrl(_req);
    res.status(200).json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/register`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      revocation_endpoint_auth_methods_supported: ["none"],
    });
  };

  // Support both OpenID Connect and OAuth 2.1 discovery paths.
  // Wildcard variants handle RFC 9728 path-aware discovery: when the MCP server
  // URL includes a path (e.g. /mcp), clients try /.well-known/{type}/mcp first.
  app.get("/.well-known/openid-configuration", oauthMetadata);
  app.get("/.well-known/openid-configuration/*path", oauthMetadata);
  app.get("/.well-known/oauth-authorization-server", oauthMetadata);
  app.get("/.well-known/oauth-authorization-server/*path", oauthMetadata);

  // OAuth 2.1 Protected Resource Metadata (RFC 9728)
  // The wildcard variant handles path-aware discovery (e.g. /.well-known/oauth-protected-resource/mcp)
  const protectedResourceMetadata = (_req: Request, res: Response): void => {
    const baseUrl = getBaseUrl(_req);
    res.status(200).json({
      resource: baseUrl,
      authorization_servers: [baseUrl],
      bearer_methods_supported: ["header"],
      scopes_supported: ["api"],
    });
  };
  app.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
  app.get("/.well-known/oauth-protected-resource/*path", protectedResourceMetadata);

  // Dynamic Client Registration (RFC 7591)
  // Echoes back the client's metadata merged with our pre-configured credentials.
  // The MCP SDK client expects redirect_uris from its request to be reflected.
  app.post("/register", (req: Request, res: Response): void => {
    const clientMetadata = req.body || {};

    res.status(201).json({
      // Echo client's metadata so the SDK's Zod parse succeeds
      ...clientMetadata,
      // Override with our server-assigned credentials
      client_id: "74e0d6e848652234efed.localfalconapps.com",
      client_secret: "71fdc6383c274334095fec457fb2085d73451a79fd030e460c69a6f3db00af0b",
      client_name: clientMetadata.client_name || "LocalFalcon MCP",
      logo_uri: "https://www.localfalcon.com/uploads/identity/logos/471387_local-falcon-logo.png",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  // Setup OAuth 2.1 routes
  setupOAuthRoutes(app);

  return app;
};

// Custom Bearer auth middleware that dynamically sets resource_metadata
// from the incoming request's host. This avoids hard-coded BASE_URL mismatches
// that cause OAuth discovery to fail when the client can't reach a static URL.
const bearerAuthMiddleware: RequestHandler = (async (req: Request, res: Response, next: Function) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw { code: "invalid_token", message: "Missing Authorization header", status: 401 };
    }

    const [type, token] = authHeader.split(" ");
    if (type.toLowerCase() !== "bearer" || !token) {
      throw { code: "invalid_token", message: "Invalid Authorization header format, expected 'Bearer TOKEN'", status: 401 };
    }

    const authInfo = await tokenVerifier.verifyAccessToken(token);

    // Check required scopes
    if (!authInfo.scopes.includes("api")) {
      throw { code: "insufficient_scope", message: "Insufficient scope", status: 403 };
    }

    // Check expiration
    if (typeof authInfo.expiresAt !== "number" || isNaN(authInfo.expiresAt)) {
      throw { code: "invalid_token", message: "Token has no expiration time", status: 401 };
    }
    if (authInfo.expiresAt < Date.now() / 1000) {
      throw { code: "invalid_token", message: "Token has expired", status: 401 };
    }

    req.auth = authInfo;
    next();
  } catch (error: any) {
    const errCode = error?.code || "invalid_token";
    const errMsg = error?.message || "Unauthorized";
    const status = error?.status || 401;

    // Build WWW-Authenticate header with dynamic resource_metadata from request host
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const resourceMetadataUrl = `${protocol}://${host}/.well-known/oauth-protected-resource`;

    let wwwAuth = `Bearer error="${errCode}", error_description="${errMsg}", scope="api"`;
    wwwAuth += `, resource_metadata="${resourceMetadataUrl}"`;

    res.set("WWW-Authenticate", wwwAuth);
    res.status(status).json({ error: errCode, error_description: errMsg });
  }
}) as RequestHandler;

// SSE Transport Handlers
const setupSSERoutes = (app: Application, sessionManager: SessionManager): void => {

  // SSE endpoint for establishing streams — protected by Bearer auth (OAuth 2.1)
  const sseHandler: AsyncRequestHandler = async (req, res) => {
    console.log("Establishing SSE stream...");

    // Auth is validated by requireBearerAuth middleware — req.auth is guaranteed
    const authInfo = req.auth!;
    const apiKey = authInfo.token;
    const isPro = (authInfo.extra?.isPro as boolean) || false;

    console.log(`[${new Date().toISOString()}] SSE auth - apiKey: "${apiKey.substring(0, 8)}...", isPro: ${isPro}`);

    try {
      const transport = new SSEServerTransport("/sse/messages", res);
      const sessionId = transport.sessionId;

      sessionManager.add(sessionId, { apiKey, isPro }, transport);

      transport.onclose = () => {
        console.log(`[Transport] SSE transport onclose triggered for session ${sessionId}`);
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

  // SSE message handling endpoint (session already authenticated)
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
      sessionManager.updateActivity(sessionId);
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

  app.get("/sse", bearerAuthMiddleware, sseHandler);
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
        sessionManager.updateActivity(sessionId);
        transport = sessionManager.getTransport(sessionId) as StreamableHTTPServerTransport;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request — auth is validated by requireBearerAuth middleware
        console.log(`New HTTP session request: ${req.body.method}`);
        const authInfo = req.auth!;
        const apiKey = authInfo.token;
        const isPro = (authInfo.extra?.isPro as boolean) || false;

        console.log(`[${new Date().toISOString()}] HTTP auth - apiKey: "${apiKey.substring(0, 8)}...", isPro: ${isPro}`);

        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => uuidv4(),
          enableJsonResponse: true,
          eventStore,
          onsessioninitialized: (sessionId) => {
            console.log(`HTTP Session initialized: ${sessionId}`);
            sessionManager.add(sessionId, { apiKey, isPro }, transport);
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          console.log(`[Transport] HTTP transport onclose triggered, sessionId: ${sid || 'undefined'}`);
          if (sid && sessionManager.getTransport(sid)) {
            console.log(`[Transport] HTTP transport closed for session ${sid}, removing from session manager`);
            sessionManager.remove(sid);
          } else {
            console.log(`[Transport] HTTP transport onclose: session ${sid} not found in manager (already removed or not yet added)`);
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
        console.log(`[Transport] HTTP SSE connection closed for session ${sessionId}`);
        // When the SSE stream closes, the client has disconnected
        // Remove the session which will trigger token revocation
        if (sessionManager.getSession(sessionId)) {
          console.log(`[Transport] Client disconnected via SSE close, removing session ${sessionId}`);
          sessionManager.remove(sessionId);
          // Also close the transport to free resources and trigger transport.onclose
          if (transport) {
            (transport as StreamableHTTPServerTransport).close().catch((err) => {
              console.error(`[Transport] Failed to close transport after SSE disconnect for session ${sessionId}:`, err);
            });
          }
        }
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

  // Bearer auth is required only for initialization requests (no existing session).
  // Subsequent requests with a valid mcp-session-id skip auth since the session
  // was already authenticated at creation time.
  const conditionalBearerAuth: RequestHandler = (req, res, next) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessionManager.getTransport(sessionId)) {
      // Existing session — already authenticated
      return next();
    }
    // New request (initialization) — require Bearer token
    return bearerAuthMiddleware(req, res, next);
  };

  app.post('/mcp', conditionalBearerAuth, mcpHandler);
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
  sessionManager.startInactivityChecker();

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
    console.log(`  - Session inactivity timeout: ${SESSION_INACTIVITY_TIMEOUT_MS / 1000 / 60 / 60 / 24} days`);
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