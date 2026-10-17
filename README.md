## call4me MCP server: let your AI agent make real phone calls

[call4me](https://call4.me) places real phone calls for you. Your AI agent tells it who to call and what to get done, and call4me's voice agent calls the business, has the conversation, and reports back. It books doctor, dentist and vet appointments, reserves restaurant tables, asks car dealerships, salons and home-service companies questions, and handles any other call to a business.

This Actor brings the call4me MCP server to Apify, so you can use it from [mcp.apify.com](https://mcp.apify.com) next to other Apify tools, or connect any MCP client to it directly.

### What your agent can do

- **Check what a call needs**: `call4me_get_requirements` lists the details a business will ask for (name, date of birth, insurance, party size...), so the agent collects them before dialing.
- **Place a call**: `call4me_place_call` dials the business and works toward the goal you set.
- **Follow it live**: `call4me_get_call` waits for updates and the final outcome, with a transcript.
- **Answer questions mid-call**: when the business asks something the agent was not told, `call4me_answer_question` passes your answer while they wait on the line.
- **Join the call yourself**: `call4me_connect_me` rings your phone so you can take over (press 1) or listen in.
- **Schedule calls** for business hours, **hang up**, get **recordings**, manage your **calling profile**, **balance** and **phone numbers**.

### Bring your own call4me account

Every user connects their **own** call4me account. Calls ring real businesses on your behalf, from your call4me number, and are billed to your prepaid call4me balance. Nobody shares a key.

1. Sign in at [call4.me/account](https://call4.me/account) with Google or X and add credit.
2. Create an API key there (it starts with `cb_live_`). Creating a new key revokes the old one.
3. Connect it in one of these ways:
   - **From your agent (works on mcp.apify.com)**: ask your agent to call `call4me_set_api_key` with your key. The Actor checks it with call4me and saves it in a private key-value store named `call4me` in **your own** Apify account, so later sessions are connected automatically. `call4me_forget_api_key` deletes it.
   - **Header**: send `X-Call4me-Api-Key: cb_live_...` when connecting to the Standby URL.
   - **Query string**: append `?call4meApiKey=cb_live_...` to the Standby URL.
   - **Input**: set the secret `call4meApiKey` input on a saved Task of this Actor.

Until a key is connected, the tools are listed so your agent can see what call4me does, and each call4me tool explains how to connect.

### Connect

**Through mcp.apify.com**: add this Actor to the Apify MCP server, for example `https://mcp.apify.com/?tools=<this Actor's name>`, then ask your agent to connect your call4me key.

**Directly** with streamable HTTP, authenticating with your Apify API token:

```json
{
    "mcpServers": {
        "call4me": {
            "url": "https://<username>--call4me.apify.actor/mcp",
            "headers": {
                "Authorization": "Bearer <YOUR_APIFY_API_TOKEN>",
                "X-Call4me-Api-Key": "cb_live_..."
            }
        }
    }
}
```

### Pricing

- **Call minutes** are billed by call4me from your prepaid call4me balance: $0.25 per minute from pickup (phone menus and conversation; hold time at half price). Unanswered calls are free.
- **On Apify** you pay the platform usage of the Standby run, plus the small per-call event shown on the Pricing tab, charged only when a call is actually placed or scheduled. Listing tools, following calls, answering questions and refused calls are never charged.

### Example

> "Call Luigi's on Main St and book a table for 4 tomorrow at 7pm under Sam. If 7 is taken, anything between 6:30 and 8 works."

The agent checks the requirements for a restaurant booking, finds Luigi's number, places the call, follows it, and tells you the outcome.

### Links

- call4me: [call4.me](https://call4.me)
- REST API: [call4.me/api/openapi.json](https://call4.me/api/openapi.json)
- Remote MCP server without Apify: `https://call4.me/mcp` (OAuth sign-in or API key)
- Source: [github.com/skeptrunedev/call4me-apify](https://github.com/skeptrunedev/call4me-apify)
