import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parse } from '../parse';
import * as path from 'path';
import * as fs from 'fs';

describe('Circular Reference Protection', () => {
    const fileA = path.resolve(__dirname, 'circular_a.sg');
    const fileB = path.resolve(__dirname, 'circular_b.sg');

    beforeAll(() => {
        fs.writeFileSync(fileA, 'ref @circular_b.sg');
        fs.writeFileSync(fileB, 'ref @circular_a.sg');
    });

    afterAll(() => {
        if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
        if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
    });

    it('should throw ParseError with circular dependency message', () => {
        const content = fs.readFileSync(fileA, 'utf-8');

        try {
            parse(content, { baseDir: __dirname });
            expect(true).toBe(false); // Should not reach here
        } catch (error: any) {
            expect(error.message).toMatch(/Circular dependency detected/);
            // The error message should contain the path of the file that completed the cycle.
            // A -> B -> A -> B (detected here)
            expect(error.message).toContain(fileB);
        }
    });
});


