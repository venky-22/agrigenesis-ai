import { describe, it, expect } from 'vitest';
import { incomeEstimate, NS_INCOME_PER_ACRE, STATCAN_TABLES } from '../src/agent/economics';
import { sustainabilityScore } from '../src/agent/sustainability';
import { rankCrops } from '../src/agent/crops';
import { normals, soil, terrain, landCover, goals, site } from './fixtures';

describe('incomeEstimate (Statistics Canada income)', () => {
    it('gives the demo’s figures: $4,100 from 0.15 acre of strawberries, $1,200 from 0.25 acre of potatoes', () => {
        expect(incomeEstimate('strawberries', 0.15).latest.total).toBe(4100);
        expect(incomeEstimate('potatoes', 0.25).latest.total).toBe(1200);
    });

    it('shows every reported year, 2021–2025', () => {
        const years = incomeEstimate('strawberries', 0.15).history.map((h) => h.year);
        expect(years).toEqual([2021, 2022, 2023, 2024, 2025]);
    });

    it('cites a real Statistics Canada table for every crop with income', () => {
        for (const [id, e] of Object.entries(NS_INCOME_PER_ACRE)) {
            expect(e.tables.length, id).toBeGreaterThan(0);
            e.tables.forEach((t) => expect(STATCAN_TABLES[t], `${id} → ${t}`).toBeDefined());
        }
    });

    it('returns nothing rather than a made-up number for a crop with no published data', () => {
        expect(incomeEstimate('not-a-crop', 1)).toBeNull();
    });
});

describe('sustainabilityScore (0–100 index from 5 measured factors)', () => {
    const ranking = rankCrops({ normals, soil, terrain, landCover }, goals);
    const picks = [
        { crop_id: 'potatoes', acres: 0.25 },
        { crop_id: 'strawberries', acres: 0.15 },
        { crop_id: 'sweet-corn', acres: 0.75 },
    ];
    const result = sustainabilityScore({ site, picks, ranking, farm: { hectares: 39.61 } });

    it('gives Sam’s plan 72, grade B, as in the demo', () => {
        expect(result.score).toBe(72);
        expect(result.grade).toBe('B');
    });

    it('scores each of the five factors with its source', () => {
        const points = Object.fromEntries(result.parts.map((p) => [p.id, p.points]));
        expect(points).toEqual({ land: 20, cover: 4, slope: 16, fit: 20, soil: 12 });
        result.parts.forEach((p) => expect(p.source).toBeTruthy());
    });

    it('rewards perennial cover and flat land', () => {
        const better = sustainabilityScore({ site, picks: [{ crop_id: 'forage', acres: 1 }], ranking, farm: { hectares: 39.61 } });
        expect(better.parts.find((p) => p.id === 'cover').points).toBe(20);
    });

    it('skips a factor it has no data for instead of guessing', () => {
        const partial = sustainabilityScore({ site: { terrain: site.terrain }, picks, ranking, farm: {} });
        expect(partial.skipped.length).toBeGreaterThan(0);
        expect(partial.parts.map((p) => p.id)).not.toContain('land');
    });

    it('returns nothing when no crops are picked', () => {
        expect(sustainabilityScore({ site, picks: [] })).toBeNull();
    });
});
