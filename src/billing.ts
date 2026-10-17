/**
 * Pay-per-event billing on the Apify side. Call minutes are billed by call4me itself from
 * the user's prepaid balance, so Apify charges at most a small fee per call that actually
 * went out. Nothing is charged for listing tools, following a call, refused calls
 * ("Not calling yet") or connecting an account.
 *
 * `Actor.charge` is a no-op unless the Actor's pricing model in Apify Console is
 * pay-per-event with the `call-placed` event defined (see .actor/pay_per_event.json).
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Actor, log } from 'apify';

const CALL_TOOLS = new Set(['call4me_place_call', 'call4me_schedule_call']);

export async function chargeToolResult(toolName: string, result: CallToolResult): Promise<void> {
    if (!CALL_TOOLS.has(toolName) || result.isError) return;
    try {
        const { chargedCount } = await Actor.charge({ eventName: 'call-placed' });
        log.info('call-placed', { toolName, chargedCount });
    } catch (error) {
        log.exception(error as Error, 'Charging call-placed failed', { toolName });
    }
}
