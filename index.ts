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
import { OAuth2Client } from "google-auth-library";

// Configure environment variables
dotenv.config({ path: ".env.local" });

// Types
interface SessionData {
  apiKey: string;
  isPro: boolean;
}

interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  apiKey: string; // mapped from user profile or config
  isPro: boolean;
  provider: 'google' | 'legacy';
}

type Transport = SSEServerTransport | StreamableHTTPServerTransport;

type AsyncRequestHandler = (req: Request, res: Response) => Promise<void>;

// Google OAuth Client
class GoogleOAuthService {
  private googleClient: OAuth2Client;
  private allowedDomains: Set<string> = new Set();

  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId) {
      console.warn('GOOGLE_CLIENT_ID not provided - Google OAuth will be disabled');
    }
    
    // Initialize OAuth client with both ID and secret (secret optional for ID token validation)
    this.googleClient = new OAuth2Client(clientId, clientSecret);
    
    if (clientSecret) {
      console.log('Google OAuth configured with client secret for enhanced validation');
    } else {
      console.log('Google OAuth configured for ID token validation only');
    }
    
    // Hardcoded allowed domains - no need for env var
    // Add any domains you want to allow here
    // this.allowedDomains.add('yourcompany.com');
  }

  async verifyGoogleToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.log('Google OAuth not configured - skipping token verification');
        return null;
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email_verified) {
        console.log('Google token verification failed: invalid payload or unverified email');
        return null;
      }

      // Skip domain restrictions - allow all domains
      // if (this.allowedDomains.size > 0 && payload.hd && !this.allowedDomains.has(payload.hd)) {
      //   console.log(`Google token verification failed: domain ${payload.hd} not in allowed domains`);
      //   return null;
      // }

      // Map Google user to our user format
      const user: AuthenticatedUser = {
        id: payload.sub!,
        email: payload.email!,
        name: payload.name,
        apiKey: process.env.LOCAL_FALCON_API_KEY || 'default-key',
        isPro: this.isProUser(payload.email!, payload.hd || undefined),
        provider: 'google'
      };

      console.log(`[${new Date().toISOString()}] Google OAuth authentication successful for ${user.email}`);
      return user;
    } catch (error) {
      console.error('Google token verification error:', error);
      return null;
    }
  }

  private isProUser(email: string, domain?: string): boolean {
    // Hardcoded pro users and domains - no need for env vars
    const proUsers = [
      // Add pro user emails here
      // 'admin@yourcompany.com',
      // 'premium@gmail.com'
    ];
    const proDomains = [
      // Add pro domains here
      // 'enterprise.com',
      // 'yourcompany.com'
    ];
    
    return proUsers.includes(email) || !!(domain && proDomains.includes(domain));
  }

  getGoogleAuthUrl(): string {
    return 'https://accounts.google.com';
  }

  isConfigured(): boolean {
    return !!process.env.GOOGLE_CLIENT_ID;
  }
}

// Session Management
class SessionManager {
  private sessions = new Map<string, SessionData>();
  private transports = new Map<string, Transport>();
  private googleOAuthService: GoogleOAuthService;

  constructor() {
    this.googleOAuthService = new GoogleOAuthService();
    
    if (this.googleOAuthService.isConfigured()) {
      console.log('Google OAuth service initialized');
    } else {
      console.log('Google OAuth service not configured - only legacy API key auth available');
    }
  }

  getGoogleOAuthService(): GoogleOAuthService {
    return this.googleOAuthService;
  }

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
const extractAuth = (req: Request): { apiKey?: string; isPro?: string; oauthToken?: string } => {
  // Try OAuth Bearer token first
  const authHeader = req.headers.authorization;
  const oauthToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
  
  // Fallback to legacy API key auth
  const apiKey = (req.headers["local_falcon_api_key"] as string | undefined) ??
    (req.query["local_falcon_api_key"] as string | undefined);
  const isPro = (req.headers["is_pro"] as string | undefined) ??
    (req.query["is_pro"] as string | undefined);
  
  console.log(`[${new Date().toISOString()}] Extracted auth - Method: ${req.method}, URL: ${req.url}, ` +
    `oauthToken: ${oauthToken ? "present" : "missing"}, apiKey: ${apiKey ? `"${apiKey}"` : "missing"}, isPro: ${isPro || "not provided"}`);
  
  return { apiKey, isPro, oauthToken };
};

const validateAuth = (apiKey?: string): boolean => {
  const isValid = !!apiKey && apiKey.trim() !== "";
  if (!isValid) console.log(`[${new Date().toISOString()}] Authentication failed: API key is ${apiKey ? "empty" : "missing"}`);
  return isValid;
};

const validateGoogleOAuthToken = async (token: string, googleOAuthService: GoogleOAuthService): Promise<AuthenticatedUser | null> => {
  try {
    return await googleOAuthService.verifyGoogleToken(token);
  } catch (error) {
    console.log(`[${new Date().toISOString()}] Google OAuth token validation error:`, error);
    return null;
  }
};


// Base Application Setup
const createBaseApp = (sessionManager: SessionManager): Application => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true })); // Add URL-encoded parsing for OAuth
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

  // OAuth Resource Server discovery endpoints - Hardcoded Google OAuth config
  app.get("/.well-known/openid_configuration", (req: Request, res: Response): void => {
    if (sessionManager.getGoogleOAuthService().isConfigured()) {
      res.status(200).json({
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
        userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        response_types_supported: ["code", "token", "id_token"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        scopes_supported: ["openid", "email", "profile"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
        code_challenge_methods_supported: ["S256", "plain"],
        claims_supported: ["aud", "email", "email_verified", "exp", "family_name", "given_name", "iat", "iss", "locale", "name", "picture", "sub"],
        // Hardcoded redirect URIs that work with most MCP clients
        redirect_uris_supported: [
          "http://localhost:3000/auth/callback",
          "http://localhost:8080/auth/callback", 
          "http://localhost:5173/auth/callback",
          "http://localhost:3001/auth/callback"
        ]
      });
    } else {
      res.status(503).json({
        error: "OAuth not configured",
        message: "Google OAuth not configured. Use LOCAL_FALCON_API_KEY for authentication."
      });
    }
  });

  return app;
};

// OAuth Resource Server Info - No OAuth endpoints needed, just discovery
const setupOAuthDiscovery = (app: Application, sessionManager: SessionManager): void => {
  // OAuth authorization server metadata - hardcoded Google config
  app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response): void => {
    if (sessionManager.getGoogleOAuthService().isConfigured()) {
      res.json({
        issuer: "https://accounts.google.com",
        authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token",
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
        response_types_supported: ["code", "token", "id_token"],
        grant_types_supported: ["authorization_code", "implicit", "refresh_token"],
        scopes_supported: ["openid", "email", "profile"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
        code_challenge_methods_supported: ["S256", "plain"],
        // Hardcoded redirect URIs that work with most MCP clients
        redirect_uris_supported: [
          "http://localhost:3000/auth/callback",
          "http://localhost:8080/auth/callback",
          "http://localhost:5173/auth/callback", 
          "http://localhost:3001/auth/callback"
        ]
      });
    } else {
      res.status(503).json({
        error: "OAuth not configured",
        message: "Google OAuth not configured. Use LOCAL_FALCON_API_KEY for authentication."
      });
    }
  });

  // Legacy endpoint response
  app.post("/register", (_req: Request, res: Response): void => {
    res.status(501).json({ 
      error: "Registration not supported",
      message: "This MCP server uses Google OAuth. Register your application at https://console.cloud.google.com/"
    });
  });
};

// Authentication middleware
const authenticateRequest = async (req: Request, res: Response, sessionManager: SessionManager): Promise<{ user: AuthenticatedUser; isOAuth: boolean } | null> => {
  const { apiKey, isPro, oauthToken } = extractAuth(req);
  
  // Try Google OAuth first
  if (oauthToken) {
    const googleUser = await validateGoogleOAuthToken(oauthToken, sessionManager.getGoogleOAuthService());
    if (googleUser) {
      console.log(`[${new Date().toISOString()}] Google OAuth authentication successful`);
      return { user: googleUser, isOAuth: true };
    } else {
      console.log(`[${new Date().toISOString()}] Google OAuth authentication failed`);
      res.status(401).json({ 
        error: "Invalid or expired Google OAuth token"
      });
      return null;
    }
  }
  
  // Fallback to legacy API key auth
  if (validateAuth(apiKey)) {
    const legacyUser: AuthenticatedUser = {
      id: 'legacy-user',
      email: 'legacy@local-falcon.com',
      apiKey: apiKey!,
      isPro: isPro === "true",
      provider: 'legacy'
    };
    console.log(`[${new Date().toISOString()}] Legacy API key authentication successful`);
    return { user: legacyUser, isOAuth: false };
  }
  
  console.log(`[${new Date().toISOString()}] Authentication failed: no valid OAuth token or API key`);
  res.status(401).json({ 
    error: "Missing or invalid authentication. Provide either Authorization: Bearer <google-id-token> or LOCAL_FALCON_API_KEY", 
    headers: req.headers, 
    query: req.query 
  });
  return null;
};

// SSE Transport Handlers
const setupSSERoutes = (app: Application, sessionManager: SessionManager): void => {
  // SSE endpoint for establishing streams
  const sseHandler: AsyncRequestHandler = async (req, res) => {
    console.log("Establishing SSE stream...");
    
    const authResult = await authenticateRequest(req, res, sessionManager);
    if (!authResult) return; // Response already sent by authenticateRequest
    
    const { user } = authResult;

    try {
      const transport = new SSEServerTransport("/sse/messages", res);
      const sessionId = transport.sessionId;

      sessionManager.add(sessionId, { apiKey: user.apiKey, isPro: user.isPro }, transport);
      
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
        
        const authResult = await authenticateRequest(req, res, sessionManager);
        if (!authResult) return; // Response already sent by authenticateRequest
        
        const { user } = authResult;

        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => uuidv4(),
          enableJsonResponse: true,
          eventStore,
          onsessioninitialized: (sessionId) => {
            console.log(`HTTP Session initialized: ${sessionId}`);
            sessionManager.add(sessionId, { apiKey: user.apiKey, isPro: user.isPro }, transport);
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
  
  // Always set up OAuth discovery for any mode
  console.log('Setting up OAuth discovery...');
  setupOAuthDiscovery(app, sessionManager);
  
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
    console.log(`  - OAuth Discovery: GET /.well-known/openid_configuration, GET /.well-known/oauth-authorization-server`);
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
  console.log("Starting STDIO server...");
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

  console.log("STDIO server started successfully");
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