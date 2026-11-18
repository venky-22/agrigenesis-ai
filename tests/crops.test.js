import { describe, it, expect } from 'vitest';
import { rankCrops, chooseCrops, cropsToAvoid, stageFor, CROPS } from '../src/agent/crops';
import { normals, soil, terrain, landCover, goals } from './fixtures';

const measured = { normals, soil, terrain, landCover };

describe('rankCrops (rule-based crop scoring)', () => {
    const ranking = rankCrops(measured, goals);

    it('scores all 14 Nova Scotia crops, best first', () => {
        expect(ranking).toHaveLength(CROPS.length);
        expect(CROPS).toHaveLength(14);
        const scores = ranking.map((c) => c.score);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
        scores.forEach((s) => expect(s).toBeGreaterThanOrEqual(0) && expect(s).toBeLessThanOrEqual(100));
    });

    it('gives the scores shown in the demo for Sam’s land', () => {
        const score = (id) => ranking.find((c) => c.id === id).score;
        expect(ranking[0].id).toBe('potatoes');
        expect(score('potatoes')).toBe(100);
        expect(score('strawberries')).toBe(92);   // pH 5.4 is a little acidic for strawberries
        expect(score('sweet-corn')).toBe(92);
    });

    it('explains every score with reasons', () => {
        ranking.forEach((c) => expect(c.reasons.length).toBeGreaterThan(0));
        const straw = ranking.find((c) => c.id === 'strawberries');
        expect(straw.reasons.some((r) => r.level === 'warn' && r.text.includes('pH 5.4'))).toBe(true);
    });

    it('is deterministic: the same land and goals always give the same ranking', () => {
        expect(rankCrops(measured, goals)).toEqual(ranking);
    });

    it('prefers official frost records over the weather model', () => {
        const model = { frostFreeDays: 60, gdd5: 600 };
        const withOfficial = rankCrops({ ...measured, climate: model }, goals);
        expect(withOfficial.find((c) => c.id === 'potatoes').score).toBe(100);
        const modelOnly = rankCrops({ ...measured, climate: model, normals: { available: false } }, goals);
        expect(modelOnly.find((c) => c.id === 'potatoes').fit).toBe('poor');
    });

    it('rules out land that is mostly wetland', () => {
        const wet = rankCrops({ ...measured, landCover: { ...landCover, wetlandPct: 60 } }, goals);
        expect(wet.every((c) => c.fit === 'poor')).toBe(true);
    });

    it('marks steep slopes as a problem', () => {
        const steep = rankCrops({ ...measured, terrain: { slopePct: 25 } }, goals);
        expect(steep.find((c) => c.id === 'potatoes').fit).toBe('poor');
    });

    it('asks for a soil test when there is no soil estimate', () => {
        const noSoil = rankCrops({ ...measured, soil: { available: false } }, goals);
        expect(noSoil[0].reasons.some((r) => r.text.includes('soil test'))).toBe(true);
    });
});

describe('chooseCrops (fixed picks and plot sizes)', () => {
    const ranking = rankCrops(measured, goals);

    it('picks potatoes, strawberries and sweet corn with the demo’s plot sizes', () => {
        expect(chooseCrops(ranking, goals, 97.9)).toEqual([
            { crop_id: 'potatoes', acres: 0.25 },
            { crop_id: 'strawberries', acres: 0.15 },
            { crop_id: 'sweet-corn', acres: 0.75 },
        ]);
    });

    it('never plans more than half of a small field', () => {
        const picks = chooseCrops(ranking, { ...goals, experience: 'experienced', time: 'fulltime', budget: 'high' }, 2);
        expect(picks.reduce((s, p) => s + p.acres, 0)).toBeLessThanOrEqual(1.05);
    });

    it('gives a new farmer at most one perennial fruit', () => {
        const picks = chooseCrops(ranking, goals, 97.9);
        const fruit = picks.filter((p) => CROPS.find((c) => c.id === p.crop_id).kind.startsWith('fruit'));
        expect(fruit.length).toBeLessThanOrEqual(1);
    });

    it('never picks a crop rated “not recommended”', () => {
        const poorLand = rankCrops({ ...measured, terrain: { slopePct: 14 } }, goals);
        const picked = chooseCrops(poorLand, goals, 10).map((p) => p.crop_id);
        picked.forEach((id) => expect(poorLand.find((c) => c.id === id).fit).not.toBe('poor'));
    });
});

describe('cropsToAvoid and stageFor', () => {
    it('explains why a crop should be avoided', () => {
        const avoid = cropsToAvoid(rankCrops({ ...measured, terrain: { slopePct: 14 } }, goals));
        avoid.forEach((a) => expect(a.why.length).toBeGreaterThan(10));
    });

    it('shows garlic resting under mulch in winter and potatoes harvested in September', () => {
        expect(stageFor('garlic', 1).stage).toBe('dormant');
        expect(stageFor('potatoes', 9).stage).toBe('harvest');
        expect(stageFor('potatoes', 5).stage).toBe('planting');
    });
});
