# call4me Apify Actor

Standby Actor that serves the call4me remote MCP server (https://call4.me/mcp) on Apify, so it is reachable through mcp.apify.com. Entry point `src/main.ts`; config `.actor/actor.json`.

- `src/server.ts`: streamable HTTP `/mcp` endpoint, one call4me session per MCP session. Never log request bodies: they carry call details and API keys.
- `src/call4me.ts`: per-session MCP server. Forwards tools to call4me with the session's key; adds `call4me_set_api_key` / `call4me_forget_api_key`. Without a key it lists `src/call4me-tools.json`.
- `src/keys.ts`: key resolution order is `X-Call4me-Api-Key` header, `call4meApiKey` query param, Actor input, then the key saved in the caller's own `call4me` key-value store. Standby runs are per user and run in the caller's account.
- `src/billing.ts`: the only pay-per-event charge is `call-placed`, on a successful place/schedule call.

Every user brings their own call4me key. Never add a shared or default key.

## Commands

```bash
npm run build && npm test
CALL4ME_API_KEY=cb_live_... npm run snapshot-tools   # refresh the keyless tool list
apify push                                           # deploy (ask first)
```
