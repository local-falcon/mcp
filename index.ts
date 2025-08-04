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

// Configure environment variables
dotenv.config({ path: ".env.local" });

// Types
interface SessionData {
  apiKey: string;
  isPro: boolean;
}

type Transport = SSEServerTransport | StreamableHTTPServerTransport;

// Custom async handler type to support Promise-based route handlers
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
  const apiKey = (req.headers["local_falcon_api_key"] as string | undefined) ??
    (req.query["local_falcon_api_key"] as string | undefined);
  const isPro = (req.headers["is_pro"] as string | undefined) ??
    (req.query["is_pro"] as string | undefined);
  console.log(`[${new Date().toISOString()}] Extracted auth - Method: ${req.method}, URL: ${req.url}, ` +
    `apiKey: ${apiKey ? `"${apiKey}"` : "missing"}, isPro: ${isPro || "not provided"}`);
  return { apiKey, isPro };
};

const validateAuth = (apiKey?: string): boolean => {
  const isValid = !!apiKey && apiKey.trim() !== "";
  if (!isValid) console.log(`[${new Date().toISOString()}] Authentication failed: API key is ${apiKey ? "empty" : "missing"}`);
  return isValid;
};

// Server Configuration
const createBaseApp = (sessionManager: SessionManager): Application => {
  const app = express();
  app.use(express.json());
  app.use(cors({
    allowedHeaders: ['Content-Type', 'mcp-session-id', 'LOCAL_FALCON_API_KEY', 'is_pro'],
    origin: "*", // Allow all origins (ngrok-compatible)
    exposedHeaders: ['mcp-session-id'],
  }));

  const pingHandler: RequestHandler = (_req: Request, res: Response): void => {
    res.status(200).json({ status: "ok", message: "Local Falcon MCP server is up." });
  };

  const healthzHandler: RequestHandler = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      connectedSessions: sessionManager.getSessionCount(),
    });
  };

  // OAuth discovery endpoints (minimal implementation)
  const oauthDiscoveryHandler: RequestHandler = (_req: Request, res: Response): void => {
    res.status(200).json({
      issuer: "Local Falcon MCP",
      authorization_endpoint: "not_implemented",
      token_endpoint: "not_implemented",
      registration_endpoint: "/register",
    });
  };

  const registerHandler: RequestHandler = (_req: Request, res: Response): void => {
    res.status(501).json({ error: "Registration endpoint not implemented" });
  };

  app.get("/ping", pingHandler);
  app.get("/healthz", healthzHandler);
  app.post("/register", registerHandler);

  return app;
};

// SSE Server Handlers
const setupSSEHandlers = (app: Application, sessionManager: SessionManager): void => {
  const sseHandler: AsyncRequestHandler = async (req, res) => {
    console.log("Establishing SSE stream...");
    const { apiKey, isPro } = extractAuth(req);

    if (!validateAuth(apiKey)) {
      res.status(401).json({ error: "Missing or invalid LOCAL_FALCON_API_KEY", headers: req.headers, query: req.query });
      return;
    }

    try {
      const transport = new SSEServerTransport("/messages", res);
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
      if (!res.headersSent) res.status(500).json({ error: "Error establishing SSE stream", details: String(error) });
    }
  };

  const messagesHandler: AsyncRequestHandler = async (req, res) => {
    console.log("Received message for SSE...");
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      console.error("Missing session ID in request");
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
      if (!res.headersSent) res.status(500).json({ error: "Error handling request", details: String(error) });
    }
  };

  app.get("/sse", sseHandler);
  app.post("/messages", messagesHandler);
};

const setupHTTPHandlers = (app: Application, sessionManager: SessionManager): void => {

  app.post('/mcp', async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`, {body: req.body});
    
    // Capture response data for logging
    const originalJson = res.json;
    res.json = function(body) {
      console.log(`Response being sent:`, JSON.stringify(body, null, 2));
      return originalJson.call(this, body);
    };
    
    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && sessionManager.getTransport(sessionId)) {
        // Reuse existing transport
        console.log(`Reusing session: ${sessionId}`);
        transport = sessionManager.getTransport(sessionId) as StreamableHTTPServerTransport;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        console.log(`New session request: ${req.body.method}`);
        // New initialization request
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
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            console.log(`Session initialized: ${sessionId}`);
            sessionManager.add(sessionId, { apiKey: apiKey!, isPro: isPro === "true" }, transport);
          }
        });

        // Clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessionManager.getTransport(sid)) {
            console.log(`Transport closed for session ${sid}, removing from transports map`);
            sessionManager.remove(sid);
          }
        };


        // Connect to the MCP server BEFORE handling the request
        console.log(`Connecting transport to MCP server...`);
        await getServer(sessionManager.getSessionMap()).connect(transport);
        console.log(`Transport connected to MCP server successfully`);
        
        console.log(`Handling initialization request...`);
        await transport.handleRequest(req, res, req.body);
        console.log(`Initialization request handled, response sent`);
        return; // Already handled
      } else {
        console.error('Invalid request: No valid session ID or initialization request');
        // Invalid request
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

      console.log(`Handling request for session: ${transport.sessionId}`);
      console.log(`Request body:`, JSON.stringify(req.body, null, 2));
      
      // Handle the request with existing transport
      console.log(`Calling transport.handleRequest...`);
      const startTime = Date.now();
      await transport.handleRequest(req, res, req.body);
      const duration = Date.now() - startTime;
      console.log(`Request handling completed in ${duration}ms for session: ${transport.sessionId}`);
    } catch (error) {
      console.error('Error handling MCP request:', error);
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
  });

  // Handle GET requests for server-to-client notifications via SSE
  app.get('/mcp', async (req: express.Request, res: express.Response) => {
    console.log(`GET Request received: ${req.method} ${req.url}`);
    
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessionManager.getTransport(sessionId)) {
        console.log(`Invalid session ID in GET request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      // Check for Last-Event-ID header for resumability
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        console.log(`Establishing new SSE stream for session ${sessionId}`);
      }
      
      const transport = sessionManager.getTransport(sessionId);
      
      // Set up connection close monitoring
      res.on('close', () => {
        console.log(`SSE connection closed for session ${sessionId}`);
      });
      
      console.log(`Starting SSE transport.handleRequest for session ${sessionId}...`);
      const startTime = Date.now();
      await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(`SSE stream setup completed in ${duration}ms for session: ${sessionId}`);
    } catch (error) {
      console.error('Error handling GET request:', error);
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  });

  // Handle DELETE requests for session termination
  app.delete('/mcp', async (req: express.Request, res: express.Response) => {
    console.log(`DELETE Request received: ${req.method} ${req.url}`);
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !sessionManager.getTransport(sessionId)) {
        console.log(`Invalid session ID in DELETE request: ${sessionId}`);
        res.status(400).send('Invalid or missing session ID');
        return;
      }
      
      console.log(`Received session termination request for session ${sessionId}`);
      const transport = sessionManager.getTransport(sessionId);
      
      // Capture response for logging
      const originalSend = res.send;
      res.send = function(body) {
        console.log(`DELETE response being sent:`, body);
        return originalSend.call(this, body);
      };
      
      console.log(`Processing session termination...`);
      const startTime = Date.now();
      await (transport as StreamableHTTPServerTransport).handleRequest(req, res);
      const duration = Date.now() - startTime;
      console.log(`Session termination completed in ${duration}ms for session: ${sessionId}`);
      
      // Check if transport was actually closed
      setTimeout(() => {
        if (sessionManager.getTransport(sessionId)) {
          console.log(`Note: Transport for session ${sessionId} still exists after DELETE request`);
        } else {
          console.log(`Transport for session ${sessionId} successfully removed after DELETE request`);
        }
      }, 100);
    } catch (error) {
      console.error('Error handling DELETE request:', error);
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });
};

// Server Factory
const createSSEServer = (sessionManager: SessionManager): Application => {
  const app = createBaseApp(sessionManager);
  setupSSEHandlers(app, sessionManager);
  return app;
};

const createHTTPServer = (sessionManager: SessionManager): Application => {
  const app = createBaseApp(sessionManager);
  setupHTTPHandlers(app, sessionManager);
  return app;
};

// Server Startup
const startExpressServer = (app: Application, sessionManager: SessionManager, mode: string): void => {
  const port = parseInt(process.env.PORT ?? "8000", 10);
  const server = app.listen(port, () => console.log(`${mode.toUpperCase()} server listening on port ${port}`));

  process.on("SIGINT", async () => {
    console.log("Shutting down server...");
    await sessionManager.cleanup();
    server.close(() => {
      console.log("Server shutdown complete");
      process.exit(0);
    });
  });
};

const startStdioServer = (): void => {
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
};

// Main Execution
const main = (): void => {
  const serverMode = process.argv[2] ?? "stdio";

  try {
    switch (serverMode) {
      case "sse": {
        const sessionManager = new SessionManager();
        startExpressServer(createSSEServer(sessionManager), sessionManager, "sse");
        break;
      }
      case "http": {
        const sessionManager = new SessionManager();
        startExpressServer(createHTTPServer(sessionManager), sessionManager, "http");
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