/**
 * call4me MCP server on Apify: a Standby Actor that proxies the call4me remote MCP
 * server (https://call4.me/mcp) so it is reachable through mcp.apify.com and any MCP
 * client, with each user acting through their own call4me API key.
 */
import { Actor, log } from 'apify';

import { startServer } from './server.js';

const STANDBY_MODE = process.env.APIFY_META_ORIGIN === 'STANDBY';
const SERVER_PORT = parseInt(process.env.ACTOR_WEB_SERVER_PORT || '3001', 10);

await Actor.init();

if (!STANDBY_MODE) {
    const msg =
        'This Actor is an MCP server and only runs in Standby mode. Add it to https://mcp.apify.com or connect an MCP client to its Standby URL with /mcp.';
    log.error(msg);
    await Actor.exit({ statusMessage: msg });
}

startServer({ serverPort: SERVER_PORT });
