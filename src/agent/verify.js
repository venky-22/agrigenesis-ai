// Fact-checker for the AI-written plan. Every check compares the plan's text with
// the measured data or the crop rules, so the plan cannot quietly contradict the facts.
// Returns a list of checks: { id, label, status: 'pass' | 'fail' | 'skip', detail, problems: [] }.

import { CROPS, SEASON, cropById } from './crops';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthIndex = (s = '') => MONTHS.findIndex((m) => s.toLowerCase().startsWith(m.slice(0, 3).toLowerCase()));

// Words that identify each crop in free text
const WORDS = {
    potatoes: ['potato'], strawberries: ['strawberr'], carrots: ['carrot'], brassicas: ['cabbage', 'broccoli', 'brassica', 'kale'],
    'sweet-corn': ['sweet corn', 'corn'], squash: ['squash', 'pumpkin', 'zucchini'], garlic: ['garlic'], 'mixed-veg': ['tomato', 'bean', 'lettuce', 'mixed vegetable'],
    apples: ['apple'], 'wild-blueberries': ['blueberr'], haskap: ['haskap'], grapes: ['grape', 'vine'], forage: ['hay', 'forage', 'pasture'], cereals: ['barley', 'oat', 'wheat'],
};
const PLANTING = /\b(plant(?!s\b)|sow|direct[- ]seed|seed(?!s\b|\s+potato|\s+garlic|lings?\b|bed)|transplant|set out|put in)\w*/i;
const NOT_PLANTING = /\b(order|buy|book|plan|prepare|source|choose|start(ed)? indoors|indoors|seedlings? indoors)\b/i;
const frostTender = new Set(['sweet-corn', 'squash', 'mixed-veg']);

function planTexts(plan) {
    const out = [];
    const add = (where, t) => typeof t === 'string' && t && out.push({ where, text: t });
    ['summary', 'land_now', 'cross_check', 'soil_test', 'confidence_reason'].forEach((k) => add(k, plan[k]));
    (plan.first_steps || []).forEach((t, i) => add(`first step ${i + 1}`, t));
    (plan.recommended || []).forEach((r) => add(`why ${r.crop_id}`, r.why));
    (plan.risks || []).forEach((r, i) => { add(`risk ${i + 1}`, r.risk); add(`risk ${i + 1}`, r.what_to_do); });
    (plan.calendar || []).forEach((m) => (m.tasks || []).forEach((t) => add(m.month, t)));
    return out;
}

/** Day-of-year for "May 25" style labels. */
function doy(label = '') {
    const m = label.match(/([A-Za-z]{3,})\.?\s+(\d{1,2})/);
    if (!m) return null;
    const mi = monthIndex(m[1]);
    if (mi < 0) return null;
    return mi * 30.5 + Number(m[2]);
}

export function verifyPlan(plan, { site = {}, picks = [], now = new Date() } = {}) {
    const checks = [];
    const texts = planTexts(plan);
    const n = site.normals?.data, c = site.climate?.data, s = site.soil?.data;

    // 1. Calendar shape
    {
        const cal = plan.calendar || [];
        const problems = [];
        if (cal.length !== 12) problems.push(`The calendar has ${cal.length} months instead of 12.`);
        if (cal.length && monthIndex(cal[0].month) !== now.getMonth()) problems.push(`The calendar should start with ${MONTHS[now.getMonth()]}, not ${cal[0].month}.`);
        checks.push({ id: 'calendar', label: 'Calendar covers the next 12 months', status: problems.length ? 'fail' : 'pass', problems });
    }

    // 2. Planting months match the crop rules (and frost-tender crops wait for the last frost)
    {
        const frostMonth = n?.available ? monthIndex(n.lastSpringFrost) : c ? monthIndex(c.lastSpringFrost) : -1;
        const problems = [];
        for (const m of plan.calendar || []) {
            const mi = monthIndex(m.month);
            if (mi < 0) continue;
            for (const t of m.tasks || []) {
                if (!PLANTING.test(t) || NOT_PLANTING.test(t)) continue;
                const low = t.toLowerCase();
                for (const [id, words] of Object.entries(WORDS)) {
                    if (!words.some((w) => low.includes(w))) continue;
                    if (id === 'sweet-corn' && low.includes('corn salad')) continue;
                    const season = SEASON[id];
                    const name = cropById(id)?.name || id;
                    if (season?.plant && !season.plant.includes(mi + 1) && !season.plant.includes(mi)) { // allow one month late
                        problems.push(`${m.month}: “${t}” — ${name} is planted in ${season.plant.map((x) => MONTHS[x - 1]).join('/')} in Nova Scotia (${cropById(id)?.plant}).`);
                    } else if (frostTender.has(id) && frostMonth >= 0 && mi < frostMonth) {
                        problems.push(`${m.month}: “${t}” — ${name} is frost-tender and the official last spring frost is ${n?.lastSpringFrost || c?.lastSpringFrost}.`);
                    }
                }
            }
        }
        checks.push({ id: 'planting', label: 'Planting dates follow the crop rules and frost dates', status: problems.length ? 'fail' : 'pass', problems });
    }

    // 3. Frost dates quoted in the plan match the measured ones
    {
        const allowed = [n?.lastSpringFrost, n?.firstFallFrost, c?.lastSpringFrost, c?.lastSpringFrostLate, c?.firstFallFrost, c?.firstFallFrostEarly].map(doy).filter((x) => x != null);
        const problems = [];
        if (allowed.length) {
            const re = /frost[^.]{0,60}?\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})\b|\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})\b[^.]{0,40}?frost/gi;
            for (const { where, text } of texts) {
                for (const m of text.matchAll(re)) {
                    const d = doy(m[1] || m[2]);
                    if (d != null && !allowed.some((a) => Math.abs(a - d) <= 3)) problems.push(`${where}: “${m[1] || m[2]}” is not one of the measured frost dates (${[n?.lastSpringFrost, n?.firstFallFrost].filter(Boolean).join(', ') || c?.lastSpringFrost}).`);
                }
            }
        }
        checks.push({ id: 'frost', label: 'Frost dates match official records', status: !allowed.length ? 'skip' : problems.length ? 'fail' : 'pass', problems });
    }

    // 4. No invented money figures
    {
        const allowed = new Set();
        const addNum = (v) => v != null && allowed.add(Math.round(Number(String(v).replace(/[^0-9.]/g, ''))));
        for (const p of picks) {
            const i = p.income;
            if (!i || i.yieldOnly) continue;
            [i.low, i.high, i.perAcreLow, i.perAcreHigh, i.latest?.total, i.latest?.perAcre, i.average?.total].forEach(addNum);
            (i.history || []).forEach((h) => { addNum(h.total); addNum(h.perAcre); });
        }
        ['under $5,000', '$5,000', '$25,000'].forEach(addNum); // budget bands the farmer chose from
        const problems = [];
        for (const { where, text } of texts) {
            for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)(\s?k\b)?/gi)) {
                const v = Math.round(Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
                const ok = [...allowed].some((a) => a && Math.abs(a - v) / a <= 0.05);
                if (!ok) problems.push(`${where}: “${m[0].trim()}” is not a published figure.`);
            }
        }
        checks.push({ id: 'money', label: 'Every dollar figure is from Statistics Canada', status: problems.length ? 'fail' : 'pass', problems });
    }

    // 5. Soil pH quoted matches the estimate
    {
        const problems = [];
        if (s?.available && s.pH) {
            for (const { where, text } of texts) {
                for (const m of text.matchAll(/\bpH\s*(?:of|is|around|about|near|≈|~)?\s*(\d(?:\.\d)?)/gi)) {
                    const v = Number(m[1]);
                    if (/target|aim|raise|bring|between|ideal|prefer|needs?|like/i.test(text.slice(Math.max(0, m.index - 40), m.index))) continue; // target values are advice, not measurements
                    if (Math.abs(v - s.pH) > 0.5) problems.push(`${where}: says pH ${v}, the soil estimate is pH ${s.pH}.`);
                }
            }
        }
        checks.push({ id: 'ph', label: 'Soil pH matches the soil estimate', status: !s?.available ? 'skip' : problems.length ? 'fail' : 'pass', problems });
    }

    // 6. Crops in the plan are the chosen ones (calendar may not plant other main crops)
    {
        const chosen = new Set(picks.map((p) => p.crop_id));
        const problems = [];
        for (const m of plan.calendar || []) {
            for (const t of m.tasks || []) {
                if (!PLANTING.test(t) || NOT_PLANTING.test(t) || /cover crop|green manure|buckwheat|clover|rye/i.test(t)) continue;
                const low = t.toLowerCase();
                for (const [id, words] of Object.entries(WORDS)) {
                    if (!chosen.has(id) && words.some((w) => low.includes(w)) && CROPS.some((x) => x.id === id)) {
                        if (id === 'sweet-corn' && chosen.has('mixed-veg')) continue;
                        if (id === 'mixed-veg' && [...chosen].some((x) => ['potatoes', 'carrots', 'brassicas', 'squash', 'garlic', 'sweet-corn'].includes(x))) continue;
                        problems.push(`${m.month}: “${t}” plants ${cropById(id).name}, which is not in your chosen crops.`);
                    }
                }
            }
        }
        checks.push({ id: 'crops', label: 'Calendar only plants the chosen crops', status: problems.length ? 'fail' : 'pass', problems });
    }

    // 7. Soil test advice is present
    {
        const has = typeof plan.soil_test === 'string' && plan.soil_test.length > 20;
        checks.push({ id: 'soiltest', label: 'Recommends a lab soil test', status: has ? 'pass' : 'fail', problems: has ? [] : ['The plan does not say what to test the soil for.'] });
    }

    return checks;
}

export const failures = (checks) => checks.filter((c) => c.status === 'fail');
