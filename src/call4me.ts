/**
 * The MCP server each session talks to. It forwards tools to the call4me remote MCP
 * server (https://call4.me/mcp) with the session's own call4me API key, and adds
 * `call4me_set_api_key` so a user connected through mcp.apify.com, where no custom
 * header or query string reaches the Actor, can still bring their key.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { log } from 'apify';

import { chargeToolResult } from './billing.js';
import snapshot from './call4me-tools.json' with { type: 'json' };
import type { ResolvedKey } from './keys.js';
import { forgetKey, KEY_HEADER, KEY_QUERY_PARAM, saveKey } from './keys.js';

const CALL4ME_MCP_URL = new URL(process.env.CALL4ME_MCP_URL || 'https://call4.me/mcp');
const ACCOUNT_URL = 'https://call4.me/account';

// get_call long-polls with wait_seconds, so leave room past its own wait.
const UPSTREAM_TIMEOUT_MSEC = 120_000;

const SET_KEY_TOOL = 'call4me_set_api_key';
const FORGET_KEY_TOOL = 'call4me_forget_api_key';

const KEY_TOOLS: Tool[] = [
    {
        name: SET_KEY_TOOL,
        title: 'Connect your call4me account',
        description:
            `Connect this server to the user's own call4me account with their call4me API key (starts with cb_live_). ` +
            `The user creates one at ${ACCOUNT_URL} after signing in with Google or X; creating a new key revokes the old one. ` +
            `Calls are billed per minute to the user's prepaid call4me balance. The key is checked against call4me, ` +
            `then saved in a private key-value store in the user's own Apify account so later sessions are connected too.`,
        inputSchema: {
            type: 'object',
            properties: {
                api_key: { type: 'string', description: 'The call4me API key from https://call4.me/account.' },
            },
            required: ['api_key'],
        },
    },
    {
        name: FORGET_KEY_TOOL,
        title: 'Disconnect your call4me account',
        description:
            'Delete the call4me API key saved in the user’s Apify account. Calls already placed are not affected.',
        inputSchema: { type: 'object', properties: {} },
    },
];

const SNAPSHOT_TOOLS: Tool[] = ToolSchema.array().parse(snapshot.tools);

const NOT_CONNECTED =
    `This call4me server is not connected to a call4me account yet. Every user brings their own call4me API key: ` +
    `calls ring real businesses for that user and bill their prepaid call4me balance. Ask the user to sign in at ` +
    `${ACCOUNT_URL}, create an API key (cb_live_...), and give it to you; then call ${SET_KEY_TOOL} with it. ` +
    `Alternatively connect with the "${KEY_HEADER}" header or the "${KEY_QUERY_PARAM}" query parameter.`;

function textResult(text: string, isError = false): CallToolResult {
    return { content: [{ type: 'text', text }], isError };
}

function isUnauthorized(error: unknown): boolean {
    return error instanceof StreamableHTTPError && error.code === 401;
}

/** Opens an MCP client to call4me acting as the owner of `key`. */
async function connectUpstream(key: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(CALL4ME_MCP_URL, {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
    });
    const client = new Client({ name: 'call4me-apify', version: '1.0.0' });
    await client.connect(transport);
    return client;
}

export interface Call4meSession {
    server: Server;
    close: () => Promise<void>;
}

/**
 * Builds the MCP server for one session. With a working key it mirrors call4me's live
 * tools and instructions; without one it lists call4me's tools from the bundled
 * snapshot, so clients can discover them, and every call4me tool answers with how to
 * connect an account.
 */
export async function createCall4meSession(resolved: ResolvedKey | null): Promise<Call4meSession> {
    let upstream: Client | null = null;
    let rejectedKey = false;

    if (resolved) {
        try {
            upstream = await connectUpstream(resolved.key);
            log.info('Connected to call4me', { keySource: resolved.source });
        } catch (error) {
            rejectedKey = isUnauthorized(error);
            log.warning('Could not connect to call4me', { keySource: resolved.source, rejectedKey });
            if (!rejectedKey) throw error;
        }
    }

    const instructions = upstream?.getInstructions() ?? snapshot.instructions ?? undefined;
    const server = new Server(
        { name: 'call4me', title: 'call4me', version: '1.0.0' },
        { capabilities: { tools: { listChanged: true } }, instructions },
    );

    const notConnectedMessage = rejectedKey
        ? `call4me rejected the API key this session was given (it may have been revoked by a newer key). ${NOT_CONNECTED}`
        : NOT_CONNECTED;

    server.setRequestHandler(ListToolsRequestSchema, async (request) => {
        if (!upstream) return { tools: [...SNAPSHOT_TOOLS, ...KEY_TOOLS] };
        const result = await upstream.listTools(request.params, { timeout: UPSTREAM_TIMEOUT_MSEC });
        return { ...result, tools: [...result.tools, ...KEY_TOOLS] };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (name === SET_KEY_TOOL) {
            const key = typeof args?.api_key === 'string' ? args.api_key.trim() : '';
            if (!key) return textResult(`Pass the call4me API key from ${ACCOUNT_URL} as api_key.`, true);
            let client: Client;
            try {
                client = await connectUpstream(key);
            } catch (error) {
                if (isUnauthorized(error)) {
                    return textResult(`call4me rejected that API key. Create a new one at ${ACCOUNT_URL}.`, true);
                }
                throw error;
            }
            await saveKey(key);
            await upstream?.close();
            upstream = client;
            rejectedKey = false;
            await server.sendToolListChanged();
            const balance = await upstream.callTool({ name: 'call4me_get_balance', arguments: {} }, undefined, {
                timeout: UPSTREAM_TIMEOUT_MSEC,
            });
            return {
                content: [
                    { type: 'text', text: 'Connected to call4me and saved the key in your Apify account.' },
                    ...(balance.content as CallToolResult['content']),
                ],
            };
        }

        if (name === FORGET_KEY_TOOL) {
            await forgetKey();
            return textResult('Deleted the call4me API key saved in your Apify account.');
        }

        if (!upstream) return textResult(notConnectedMessage, true);

        const result = (await upstream.callTool(request.params, undefined, {
            timeout: UPSTREAM_TIMEOUT_MSEC,
        })) as CallToolResult;
        await chargeToolResult(name, result);
        return result;
    });

    return {
        server,
        close: async () => {
            await upstream?.close();
            await server.close();
        },
    };
}
