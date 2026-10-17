// Refreshes src/call4me-tools.json, the tool list served to sessions without a call4me key.
// Usage: CALL4ME_API_KEY=cb_live_... node scripts/snapshot-tools.mjs
import { writeFile } from 'node:fs/promises';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const key = process.env.CALL4ME_API_KEY;
if (!key) throw new Error('Set CALL4ME_API_KEY to a call4me API key from https://call4.me/account');

const client = new Client({ name: 'call4me-apify-snapshot', version: '1.0.0' });
await client.connect(
    new StreamableHTTPClientTransport(new URL(process.env.CALL4ME_MCP_URL || 'https://call4.me/mcp'), {
        requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
);
const { tools } = await client.listTools();
const snapshot = { instructions: client.getInstructions() ?? null, tools };
await writeFile(new URL('../src/call4me-tools.json', import.meta.url), `${JSON.stringify(snapshot, null, 2)}\n`);
await client.close();
console.log(`Wrote ${tools.length} tools to src/call4me-tools.json`);
