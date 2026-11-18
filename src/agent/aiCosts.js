// AI-estimated production costs (and income where no official price exists).
// Clearly separate from the published figures in economics.js: everything here is
// labelled "AI estimate" in the UI. Same crops + sizes on the same day give the same
// answer (temperature 0 + local cache).

import { AI_ENABLED, aiJSON } from '../services/ai';
import { cropById } from './crops';
import { incomeEstimate, COST_PER_ACRE } from './economics';

const CACHE = 'agrigenesis.aiCosts';
const money = (n) => `$${Math.round(n).toLocaleString('en-CA')}`;
const roundNice = (n) => (Math.abs(n) >= 10000 ? Math.round(n / 1000) * 1000 : Math.abs(n) >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10);
const signed = (n) => (n < 0 ? `−${money(-roundNice(n))}` : money(roundNice(n)));
const num = (v) => (Number.isFinite(+v) ? +v : null);

/**
 * @param {{crop_id: string, acres: number}[]} plots
 * @param {{placeName?: string, goals?: object}} farm
 * @returns {Promise<Array<{crop_id, acres, perAcreLow, perAcreHigh, costText, items, assumptions, confidence,
 *   income: {text, from: 'statcan'|'ai'} | null, profitText, profitLow, profitHigh}>>}
 */
export async function estimateCostsAI(plots, farm = {}) {
    if (!AI_ENABLED || !plots.length) return [];
    const key = `v2|${new Date().toISOString().slice(0, 10)}|${farm.placeName || ''}|${plots.map((p) => `${p.crop_id}:${p.acres}`).join(',')}`;
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE) || '{}')[key];
        if (cached) return cached;
    } catch { /* ignore */ }

    const lines = plots.map((p) => {
        const c = cropById(p.crop_id);
        const pub = COST_PER_ACRE[p.crop_id];
        const inc = incomeEstimate(p.crop_id, 1);
        return `- id "${p.crop_id}": ${c.name}, ${p.acres} acre. ` +
            (pub ? `Published cost study for comparison (large farm, may not fit small plots): about $${pub.low}${pub.high !== pub.low ? `–$${pub.high}` : ''}/acre. ` : 'No published cost study. ') +
            (inc && !inc.yieldOnly ? 'Income is known from Statistics Canada, do not estimate it.' : 'No official Nova Scotia price: also estimate gross income per acre.');
    }).join('\n');

    const reply = await aiJSON({
        system: `You are a farm business advisor for small farms in Nova Scotia, Canada, in ${new Date().getFullYear()}. Estimate realistic yearly production costs in Canadian dollars for a small-scale grower (hand labour valued at $16/hour, small equipment, direct sales). Include seed/plants, lime and fertilizer, pest control, mulch/irrigation, equipment and fuel, packaging and marketing, and labour. Give a range, not a single number. Be honest about uncertainty.`,
        temperature: 0,
        maxTokens: 2500,
        prompt: `Crops and plot sizes:\n${lines}\n\nReturn JSON only:\n{"estimates":[{"crop_id":"id","cost_per_acre_low":number,"cost_per_acre_high":number,"main_costs":[{"item":"short name","per_acre":number}],"income_per_acre_low":number or null,"income_per_acre_high":number or null,"assumptions":"one sentence","confidence":"low|medium"}]}\nGive 3-4 main_costs per crop. Only fill income_per_acre_* where asked.`,
    });

    const byId = new Map((reply.estimates || []).map((e) => [e.crop_id, e]));
    const out = plots.map((p) => {
        const e = byId.get(p.crop_id);
        let lo = num(e?.cost_per_acre_low), hi = num(e?.cost_per_acre_high);
        if (lo == null || hi == null || lo <= 0 || hi > 100000) return { crop_id: p.crop_id, acres: p.acres, failed: true };
        if (lo > hi) [lo, hi] = [hi, lo];
        const costLow = lo * p.acres, costHigh = hi * p.acres;

        const official = incomeEstimate(p.crop_id, p.acres);
        let income = null, incLow = null, incHigh = null;
        if (official && !official.yieldOnly) {
            incLow = official.latest.total; incHigh = official.latest.total;
            income = { text: official.latest.text, year: official.latest.year, from: 'statcan' };
        } else {
            const il = num(e.income_per_acre_low), ih = num(e.income_per_acre_high);
            if (il != null && ih != null && il >= 0) {
                incLow = Math.min(il, ih) * p.acres; incHigh = Math.max(il, ih) * p.acres;
                income = { text: `${money(roundNice(incLow))}–${money(roundNice(incHigh))}`, from: 'ai' };
            }
        }
        const profitLow = income ? incLow - costHigh : null;
        const profitHigh = income ? incHigh - costLow : null;
        return {
            crop_id: p.crop_id,
            acres: p.acres,
            perAcreLow: lo,
            perAcreHigh: hi,
            perAcreText: `${money(lo)}–${money(hi)} per acre`,
            costText: `${money(roundNice(costLow))}–${money(roundNice(costHigh))}`,
            items: (e.main_costs || []).filter((i) => i?.item && num(i.per_acre) != null).slice(0, 4).map((i) => ({ item: String(i.item).replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase()), perAcre: money(i.per_acre) })),
            assumptions: e.assumptions || '',
            confidence: e.confidence === 'medium' ? 'medium' : 'low',
            income,
            profitLow, profitHigh,
            profitText: income ? `${signed(profitLow)} to ${signed(profitHigh)}` : null,
        };
    });

    try {
        const all = JSON.parse(localStorage.getItem(CACHE) || '{}');
        all[key] = out;
        const keys = Object.keys(all);
        keys.slice(0, Math.max(0, keys.length - 20)).forEach((k) => delete all[k]);
        localStorage.setItem(CACHE, JSON.stringify(all));
    } catch { /* ignore */ }
    return out;
}
