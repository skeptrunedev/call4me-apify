import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';

import snapshot from '../src/call4me-tools.json' with { type: 'json' };

describe('call4me tool snapshot', () => {
    it('is a valid MCP tool list with the core call tools', () => {
        const names = ToolSchema.array()
            .parse(snapshot.tools)
            .map((tool) => tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                'call4me_get_requirements',
                'call4me_place_call',
                'call4me_get_call',
                'call4me_answer_question',
            ]),
        );
    });
});
