/**
 * Streamable HTTP endpoint for the MCP server, one call4me session per MCP session.
 * Request bodies are never logged: they carry call details and, for
 * `call4me_set_api_key`, the user's API key.
 */
import { randomUUID } from 'node:crypto';

import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { log } from 'apify';
import type { Request, Response } from 'express';
import express from 'express';

import type { Call4meSession } from './call4me.js';
import { createCall4meSession } from './call4me.js';
import { resolveKey } from './keys.js';

const sessions: { [sessionId: string]: { transport: StreamableHTTPServerTransport; call4me: Call4meSession } } = {};

function jsonRpcError(res: Response, status: number, code: number, message: string) {
    res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

async function mcpPostHandler(req: Request, res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    try {
        if (sessionId && sessions[sessionId]) {
            await sessions[sessionId].transport.handleRequest(req, res, req.body);
            return;
        }
        if (sessionId || !isInitializeRequest(req.body)) {
            jsonRpcError(res, 400, -32000, 'Bad Request: No valid session ID provided');
            return;
        }

        const call4me = await createCall4meSession(await resolveKey(req));
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            eventStore: new InMemoryEventStore(),
            onsessioninitialized: (initializedSessionId) => {
                log.info('Session initialized', { sessionId: initializedSessionId });
                sessions[initializedSessionId] = { transport, call4me };
            },
        });
        transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && sessions[sid]) {
                log.info('Session closed', { sessionId: sid });
                delete sessions[sid];
                call4me.close().catch((error) => log.exception(error as Error, 'Error closing call4me session'));
            }
        };

        await call4me.server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        log.exception(error as Error, 'Error handling MCP request', { sessionId: sessionId || null });
        if (!res.headersSent) jsonRpcError(res, 500, -32603, 'Internal server error');
    }
}

/** GET opens the SSE stream and DELETE ends the session; both need a known session. */
async function mcpSessionHandler(req: Request, res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }
    try {
        await sessions[sessionId].transport.handleRequest(req, res);
    } catch (error) {
        log.exception(error as Error, 'Error handling MCP session request', { sessionId, method: req.method });
        if (!res.headersSent) res.status(500).send('Error processing session request');
    }
}

export function startServer(options: { serverPort: number }) {
    const { serverPort } = options;
    const app = express();

    app.get('/favicon.ico', (_req: Request, res: Response) => {
        res.writeHead(301, { Location: 'https://call4.me/favicon.ico' });
        res.end();
    });

    // Readiness probe handler
    app.get('/', (req: Request, res: Response) => {
        if (req.headers['x-apify-container-server-readiness-probe']) {
            res.end('ok\n');
            return;
        }
        res.status(404).end();
    });

    // Return the Apify OAuth authorization server metadata to allow the MCP client to authenticate using OAuth
    app.get('/.well-known/oauth-authorization-server', async (_req: Request, res: Response) => {
        // Some MCP clients do not follow redirects, so we need to fetch the data and return it directly.
        const response = await fetch(`https://api.apify.com/.well-known/oauth-authorization-server`);
        res.status(200).json(await response.json());
    });

    app.use(express.json());

    app.post('/mcp', mcpPostHandler);
    app.get('/mcp', mcpSessionHandler);
    app.delete('/mcp', mcpSessionHandler);

    app.listen(serverPort, () => {
        log.info(`call4me MCP server listening on port ${serverPort}`);
    });

    process.on('SIGINT', async () => {
        log.info('Shutting down server...');
        for (const [sid, session] of Object.entries(sessions)) {
            try {
                await session.transport.close();
                await session.call4me.close();
            } catch (error) {
                log.exception(error as Error, 'Error closing session', { sessionId: sid });
            }
            delete sessions[sid];
        }
        process.exit(0);
    });
}
