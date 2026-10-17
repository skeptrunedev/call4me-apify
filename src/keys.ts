/**
 * Resolves which call4me API key a session acts with.
 *
 * Every user brings their own key: calls ring real businesses on that user's behalf and
 * bill that user's prepaid call4me balance. Standby runs are never shared between Apify
 * users and run in the caller's own account, so the named key-value store below is the
 * caller's own private store.
 */
import { Actor } from 'apify';
import type { Request } from 'express';

const KEY_STORE_NAME = 'call4me';
const KEY_RECORD = 'API_KEY';

export const KEY_HEADER = 'x-call4me-api-key';
export const KEY_QUERY_PARAM = 'call4meApiKey';

export type KeySource = 'header' | 'query' | 'input' | 'saved';

export interface ResolvedKey {
    key: string;
    source: KeySource;
}

interface Input {
    call4meApiKey?: string;
}

function clean(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Picks the key for a new session, most specific first: a request header, the
 * `call4meApiKey` query parameter (Standby passes Actor input this way), the Actor
 * input (e.g. a saved Task), then the key saved earlier with `call4me_set_api_key`.
 */
export async function resolveKey(req: Request): Promise<ResolvedKey | null> {
    const header = clean(req.headers[KEY_HEADER]);
    if (header) return { key: header, source: 'header' };

    const query = clean(req.query[KEY_QUERY_PARAM]);
    if (query) return { key: query, source: 'query' };

    const input = await Actor.getInput<Input>();
    const fromInput = clean(input?.call4meApiKey);
    if (fromInput) return { key: fromInput, source: 'input' };

    const saved = await loadSavedKey();
    if (saved) return { key: saved, source: 'saved' };

    return null;
}

export async function loadSavedKey(): Promise<string | null> {
    const store = await Actor.openKeyValueStore(KEY_STORE_NAME);
    return clean(await store.getValue<string>(KEY_RECORD));
}

export async function saveKey(key: string): Promise<void> {
    const store = await Actor.openKeyValueStore(KEY_STORE_NAME);
    await store.setValue(KEY_RECORD, key, { contentType: 'text/plain' });
}

export async function forgetKey(): Promise<void> {
    const store = await Actor.openKeyValueStore(KEY_STORE_NAME);
    await store.setValue(KEY_RECORD, null);
}
