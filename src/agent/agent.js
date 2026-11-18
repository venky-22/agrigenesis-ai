// The AgriGenesis planning agent.
//
// How it works:
// 1. The AI is given tools that fetch REAL data for the farmer's exact location
//    (frost history, soil, slope, satellite greenness, forecast) and a rule-based
//    crop ranking. The AI decides the order and says why it calls each one.
// 2. Reliability rules enforced in code, not left to the AI:
//    - Tools always use the verified coordinates of the farm; the AI cannot change them.
//    - The AI must check all core data before it may write a plan.
//    - Crop scores come from rules, not the AI. The AI may only recommend ranked crops.
//    - All measured numbers shown on screen come straight from the tools.
//    - If the AI fails, the farmer still gets the measured data and rule-based ranking.

import { AI_ENABLED, aiRequest, outputText, parseJSON } from '../services/ai';
import { getClimateHistory, getStationNormals, getSoil, getTerrain, getVegetation, getLandCover, getForecast } from './data';
import { rankCrops, CROPS, cropById, chooseCrops, cropsToAvoid } from './crops';
import { incomeEstimate } from './economics';
import { verifyPlan, failures } from './verify';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const reasonParam = {
    type: 'object',
    properties: { reason: { type: 'string', description: 'One short sentence: why you are checking this now.' } },
    required: ['reason'],
};

const TOOLS = [
    { name: 'check_official_climate_normals', label: 'Official climate records', description: 'Environment Canada climate normals from the nearest weather station: average last spring frost, first fall frost, frost-free days, degree days. Most trustworthy source for frost dates.' },
    { name: 'check_climate_history', label: 'Recent weather (model)', description: 'Weather-model estimate of the last 10 years of daily weather for this farm: typical last spring frost, first fall frost, frost-free days, growing degree days, summer rain, winter low.' },
    { name: 'check_soil', label: 'Soil', description: 'Estimated topsoil for this farm: pH, sand/silt/clay, texture, organic carbon, drainage hint.' },
    { name: 'check_terrain', label: 'Slope', description: 'Elevation, slope % and which direction the land faces.' },
    { name: 'check_satellite_vegetation', label: 'Satellite greenness', description: 'NASA satellite NDVI over the last 12 months: how green/covered the land is now and at last summer’s peak.' },
    { name: 'check_land_use', label: 'Land use (national map)', description: 'What is actually on this land in the last 3 years from the national Annual Crop Inventory: hay, crops, forest, wetland, buildings. Tells you if land needs clearing and what grew there before.' },
    { name: 'check_weather_forecast', label: 'Forecast', description: 'Next 14 days: temperatures, frost nights and rain.' },
    { name: 'rank_crops', label: 'Crop ranking', description: 'Score Nova Scotia crops against the measured climate, soil and slope and the farmer’s goals (rule-based). Needs official climate records, soil and slope checked first.' },
    {
        name: 'get_crop_details', label: 'Crop details', description: 'Growing needs, planting and harvest timing for one crop.',
        parameters: {
            type: 'object',
            properties: {
                crop_id: { type: 'string', enum: CROPS.map((c) => c.id) },
                reason: { type: 'string', description: 'Why you need these details.' },
            },
            required: ['crop_id', 'reason'],
        },
    },
];

const REQUIRED = ['check_official_climate_normals', 'check_climate_history', 'check_soil', 'check_terrain', 'check_satellite_vegetation', 'check_land_use', 'check_weather_forecast', 'rank_crops'];
const DATA_KEY = {
    check_official_climate_normals: 'normals',
    check_climate_history: 'climate',
    check_soil: 'soil',
    check_terrain: 'terrain',
    check_satellite_vegetation: 'vegetation',
    check_land_use: 'landCover',
    check_weather_forecast: 'forecast',
};

const goalText = (g) => [
    `Main goal: ${{ income: 'earn income by selling', family: 'feed my household and sell the extra', mixed: 'some of both, start small' }[g.goal] || 'not given'}`,
    `Experience: ${{ new: 'new to farming', some: 'some gardening/farming', experienced: 'experienced farmer' }[g.experience] || 'not given'}`,
    `Start-up budget: ${{ low: 'under $5,000', medium: '$5,000–$25,000', high: 'over $25,000' }[g.budget] || 'not given'}`,
    `Time: ${{ weekends: 'weekends only', parttime: 'part-time', fulltime: 'full-time' }[g.time] || 'not given'}`,
].join('\n');

/** Short verified-facts sheet used when the agent corrects itself. */
function factSheet(site, picks) {
    const n = site.normals?.data, c = site.climate?.data, so = site.soil?.data, t = site.terrain?.data;
    return [
        n?.available && `Official frost (Environment Canada ${n.station}): last spring ${n.lastSpringFrost}, first fall ${n.firstFallFrost}.`,
        c && `Weather model: last spring frost ${c.lastSpringFrost} (1 in 10 years ${c.lastSpringFrostLate}), first fall ${c.firstFallFrost}.`,
        so?.available ? `Soil estimate: ${so.texture}, pH ${so.pH}.` : 'Soil: unknown, lab test needed.',
        t && `Slope ${t.slopePct}%.`,
        `Chosen crops: ${picks.map((p) => `${cropById(p.crop_id).name} (${p.acres} acre; plant ${cropById(p.crop_id).plant}${p.income && !p.income.yieldOnly ? `; income ${p.income.latest.text} in ${p.income.latest.year}, range ${p.income.text}` : ''})`).join('; ')}.`,
        'Only these dollar figures may be used. Do not plant other main crops.',
    ].filter(Boolean).join('\n');
}

function systemPrompt(now) {
    const month = MONTHS[now.getMonth()];
    return `You are AgriGenesis, a careful farm-planning agent for land in Nova Scotia, Canada.
Your job: research a farmer's land with your tools, then write a first-year plan they can follow.

How to work:
- Decide what to check and in what order. Every tool call must include a short "reason".
- Before writing the plan you MUST have called: check_official_climate_normals, check_climate_history, check_soil, check_terrain, check_satellite_vegetation, check_land_use, check_weather_forecast and rank_crops.
- For frost dates, trust check_official_climate_normals over the weather model; the model often misses cold nights. If they differ a lot, say which you used and why.
- To judge what is on the land now (hay, forest, crops, wetland), trust check_land_use. High satellite greenness alone does NOT mean forest; lush hay is also very green.
- Cross-check sources. If the photo, the satellite greenness and the soil estimate disagree, say so plainly.
- Use only facts and numbers from tool results or the farmer's input. Never invent yields, prices, profits, dates or soil values.
- Soil values are model estimates. Always tell the farmer to get a lab soil test before buying lime or fertilizer.
- rank_crops returns "chosen": the crops and start sizes picked by fixed rules. Recommend EXACTLY those crops, in that order. Do not add, drop or swap crops, and do not change the sizes. Your job is to explain them.
- Income figures come only from rank_crops (Statistics Canada averages). Never make up prices or profits.
- If photos are attached, describe only what you can actually see in them and say whether they match the land-use map. If a photo does not show land (for example a leaf, a person or a building), say so.
- Write for someone who is not a farming expert: short sentences, plain words, metric units, Canadian spelling.
- Today is ${month} ${now.getDate()}, ${now.getFullYear()}. Build the calendar from this month forward.

When you have everything, reply with ONLY this JSON (no markdown):
{
  "summary": "2-3 sentences: what this land is like and the overall advice",
  "land_now": "What the land looks like now and what must happen before planting (clearing, drainage, lime, etc.)",
  "cross_check": "Where the photo, satellite and soil data agree or disagree",
  "photo_check": "What the photos show and whether they match the data, or 'No photo provided.'",
  "recommended": [{"crop_id": "id from rank_crops.chosen", "why": "1-2 sentences tied to the measured data and the farmer's goals"}],
  "first_steps": ["ordered actions for the next 4-6 weeks"],
  "calendar": [{"month": "${month}", "tasks": ["..."]}],
  "soil_test": "what to test for and why",
  "risks": [{"risk": "...", "what_to_do": "..."}],
  "confidence": "low | medium | high",
  "confidence_reason": "why",
  "unknowns": ["things the data cannot tell us"]
}
The calendar must have 12 entries, one per month, starting with ${month}.`;
}

/** Shrink a photo before sending it to the AI (keeps requests fast and small). */
async function shrinkImage(dataUrl, max = 1024) {
    if (!dataUrl || typeof document === 'undefined') return dataUrl;
    const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
}

/** What the model sees from each tool: the summary plus compact numbers (no long series). */
function forModel(result) {
    const { data } = result;
    const compact = { ...data };
    delete compact.series;
    delete compact.days;
    delete compact.perYear;
    return { summary: result.summary, data: compact, source: result.source.name, caveat: result.caveat };
}

/**
 * Run the agent.
 * @param {object} farm  { lat, lon, placeName, hectares, boundary, goals, photo }
 * @param {(event) => void} onEvent  progress callback for the live activity list
 */
export async function runAgent(farm, onEvent = () => {}) {
    const photos = (farm.photos || (farm.photo ? [farm.photo] : [])).slice(0, 3);
    // Same land + same goals + same photos on the same day = the same plan (no re-rolling the AI)
    const cacheKey = makeKey(farm, photos);
    const cached = readCache(cacheKey);
    if (cached) {
        onEvent({ steps: cached.steps, site: cached.site, ranking: cached.ranking });
        return { ...cached, fromCache: true };
    }
    const site = {};      // full tool results, keyed by climate/soil/terrain/vegetation/forecast
    const steps = [];     // activity log shown to the farmer
    let ranking = null;
    const called = new Set();

    const step = (s) => {
        const existing = steps.find((x) => x.id === s.id);
        if (existing) Object.assign(existing, s); else steps.push(s);
        onEvent({ steps: steps.map((x) => ({ ...x })), site: { ...site }, ranking });
    };

    const fetchers = {
        check_official_climate_normals: () => getStationNormals(farm.lat, farm.lon),
        check_climate_history: () => getClimateHistory(farm.lat, farm.lon),
        check_soil: () => getSoil(farm.lat, farm.lon),
        check_terrain: () => getTerrain(farm.lat, farm.lon, farm.boundary),
        check_satellite_vegetation: () => getVegetation(farm.lat, farm.lon),
        check_land_use: () => getLandCover(farm.lat, farm.lon, farm.boundary),
        check_weather_forecast: () => getForecast(farm.lat, farm.lon),
    };

    const doRank = () => {
        ranking = rankCrops({
            climate: site.climate?.data,
            normals: site.normals?.data,
            soil: site.soil?.data,
            terrain: site.terrain?.data,
            vegetation: site.vegetation?.data,
            landCover: site.landCover?.data,
        }, farm.goals);
        return ranking;
    };

    const fieldAcres = (farm.hectares || 0) * 2.47105;
    let picks = null;
    const getPicks = () => {
        if (!picks) {
            picks = chooseCrops(ranking || doRank(), farm.goals, fieldAcres).map((p) => ({ ...p, income: incomeEstimate(p.crop_id, p.acres) }));
        }
        return picks;
    };

    /** Execute one tool; returns what the model should see. */
    async function execute(name, args, callId, by = 'agent') {
        const tool = TOOLS.find((t) => t.name === name);
        const id = `${name}-${callId}`;
        step({ id, tool: name, label: tool?.label || name, reason: args.reason || '', status: 'running', by });
        called.add(name);
        try {
            if (fetchers[name]) {
                const result = await fetchers[name]();
                site[DATA_KEY[name]] = result;
                step({ id, status: 'done', result: result.summary, source: result.source });
                return forModel(result);
            }
            if (name === 'rank_crops') {
                // Needs these checks to have been tried; if one failed, rank anyway and say the data is missing
                const missing = ['check_official_climate_normals', 'check_soil', 'check_terrain'].filter((t) => !called.has(t));
                if (missing.length && by === 'agent') {
                    step({ id, status: 'skipped', result: `Needs ${missing.join(', ')} first.` });
                    return { error: `Call ${missing.join(', ')} before rank_crops.` };
                }
                const r = doRank();
                const chosen = getPicks();
                step({ id, status: 'done', result: chosen.length ? `Picked by the rules: ${chosen.map((c) => `${cropById(c.crop_id).name} (${c.acres} acre)`).join(', ')}.` : 'No crop is a clear fit with the current data.' });
                return {
                    chosen: chosen.map((c) => ({ crop_id: c.crop_id, name: cropById(c.crop_id).name, start_acres: c.acres, gross_income_estimate_cad: c.income && !c.income.yieldOnly ? `${c.income.latest.text} (${c.income.latest.year} Statistics Canada report; ${c.income.period} range ${c.income.text})` : c.income?.yieldOnly && c.income.text || 'not published' })),
                    ranking: r.map((c) => ({ id: c.id, name: c.name, score: c.score, fit: c.fit, concerns: c.reasons.filter((x) => x.level !== 'ok').map((x) => x.text) })),
                };
            }
            if (name === 'get_crop_details') {
                const c = cropById(args.crop_id);
                step({ id, label: `Crop details: ${c?.name || args.crop_id}`, status: c ? 'done' : 'failed', result: c ? c.note : 'Unknown crop.' });
                return c || { error: 'Unknown crop id.' };
            }
            step({ id, status: 'failed', result: 'Unknown tool.' });
            return { error: 'Unknown tool.' };
        } catch (err) {
            step({ id, status: 'failed', result: err.message });
            return { error: `${err.message}. Treat this data as unavailable and say so.` };
        }
    }

    const finish = (plan, mode, note) => {
        const result = {
            farm: { ...farm, photo: undefined, photos: undefined, photoCount: photos.length }, // full photos are too big to save; farm.thumbs (small copies) are kept
            site, ranking: ranking || doRank(), picks: getPicks(), avoid: cropsToAvoid(ranking || doRank()),
            plan, mode, note, steps, createdAt: new Date().toISOString(), cacheKey,
        };
        saveResult(result);
        return result;
    };

    // ---- No AI available: still give the farmer real data and rule-based ranking
    async function dataOnly(note) {
        for (const name of REQUIRED) {
            const already = name === 'rank_crops' ? ranking : site[DATA_KEY[name]];
            if (!already) await execute(name, { reason: 'Checked automatically.' }, 'auto', 'system');
        }
        return finish(null, 'data-only', note);
    }

    if (!AI_ENABLED) return dataOnly('AI is not connected, so this shows measured data and the rule-based crop ranking only.');

    // ---- Agent loop
    const now = new Date();
    const intro = [
        `Farm location: ${farm.placeName} (lat ${farm.lat.toFixed(4)}, lon ${farm.lon.toFixed(4)}).`,
        farm.hectares ? `Land area: ${farm.hectares.toFixed(2)} ha (${(farm.hectares * 2.47105).toFixed(1)} acres), ${farm.parcel?.pid ? `the whole property (PID ${farm.parcel.pid}) from the Nova Scotia property registry, approximate and not surveyed; it may include woods, buildings or wet ground that cannot be farmed` : farm.boundary?.length >= 3 ? 'drawn on a map by the farmer' : 'entered by the farmer'}.` : 'Land area: not given.',
        goalText(farm.goals || {}),
        farm.notes ? `Farmer's notes: ${farm.notes}` : '',
        photos.length ? `${photos.length} photo(s) of the land are attached. Describe only what you can actually see; do not guess soil type from them.` : 'No photo was provided.',
        'Research this land with your tools, then write the plan.',
    ].filter(Boolean).join('\n');

    const userContent = [{ type: 'input_text', text: intro }];
    for (const ph of photos) {
        try { userContent.push({ type: 'input_image', image_url: await shrinkImage(ph) }); } catch { /* unreadable image: skip */ }
    }

    const input = [{ type: 'message', role: 'user', content: userContent }];
    const tools = TOOLS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters || reasonParam }));
    step({ id: 'start', label: 'Reading your land details and goals', status: 'done', by: 'agent', result: `${farm.placeName}${farm.hectares ? ` · ${(farm.hectares * 2.47105).toFixed(1)} acres` : ''}` });

    let finalText = null;
    try {
        for (let turn = 0; turn < 12; turn++) {
            const data = await aiRequest({ instructions: systemPrompt(now), input, tools, temperature: 0, max_output_tokens: 4000 });
            const calls = (data.output || []).filter((o) => o.type === 'function_call');
            const text = outputText(data);

            if (calls.length) {
                if (text) step({ id: `think-${turn}`, label: 'Agent note', status: 'done', by: 'agent', result: text.slice(0, 300) });
                // Run this turn's calls in parallel, then give all results back
                // Data tools run in parallel; rank_crops waits for them so it sees their results
                const parse = (c) => { try { return JSON.parse(c.arguments || '{}'); } catch { return {}; } };
                const results = new Array(calls.length);
                await Promise.all(calls.map(async (c, i) => { if (c.name !== 'rank_crops') results[i] = await execute(c.name, parse(c), c.call_id); }));
                for (const [i, c] of calls.entries()) if (c.name === 'rank_crops') results[i] = await execute(c.name, parse(c), c.call_id);
                calls.forEach((c, i) => {
                    input.push({ type: 'function_call', call_id: c.call_id, name: c.name, arguments: c.arguments || '{}' });
                    input.push({ type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(results[i]) });
                });
                continue;
            }

            const missing = REQUIRED.filter((t) => !called.has(t));
            if (missing.length) {
                step({ id: `guard-${turn}`, label: 'Checking the agent’s work', status: 'done', by: 'system', result: `The agent tried to finish early. Sent it back to check: ${missing.join(', ')}.` });
                if (text) input.push({ type: 'message', role: 'assistant', content: text });
                input.push({ type: 'message', role: 'user', content: `Before writing the plan you still need to call: ${missing.join(', ')}.` });
                continue;
            }
            finalText = text;
            break;
        }
    } catch (err) {
        return dataOnly(`The AI could not finish (${err.message}). Showing measured data and the rule-based crop ranking.`);
    }

    if (!finalText) return dataOnly('The AI did not finish its plan in time. Showing measured data and the rule-based crop ranking.');

    step({ id: 'write', label: 'Writing your plan', status: 'running', by: 'agent' });
    let plan = null;
    try {
        plan = parseJSON(finalText);
    } catch {
        try {
            const fix = await aiRequest({
                instructions: 'Convert the text into the exact JSON structure it describes. Reply with JSON only.',
                input: [{ type: 'message', role: 'user', content: finalText }],
                temperature: 0,
                max_output_tokens: 4000,
            });
            plan = parseJSON(outputText(fix));
        } catch {
            plan = null;
        }
    }
    if (!plan) {
        step({ id: 'write', status: 'failed', result: 'The plan text could not be read.' });
        return dataOnly('The AI’s plan could not be read. Showing measured data and the rule-based crop ranking.');
    }

    // The crops are fixed by the rules; the AI only supplies the explanation
    const normalize = (pl) => {
        const whyById = new Map((pl.recommended || []).filter((r) => r && r.crop_id).map((r) => [r.crop_id, r.why]));
        const changedCrops = (pl.recommended || []).some((r) => !getPicks().some((p) => p.crop_id === r.crop_id));
        pl.recommended = getPicks().map((p) => ({
            crop_id: p.crop_id,
            why: whyById.get(p.crop_id) || 'Highest rule-based score for the measured conditions and your goals.',
        }));
        delete pl.avoid;
        if (!['low', 'medium', 'high'].includes(pl.confidence)) pl.confidence = 'medium';
        if (!site.soil?.data?.available && pl.confidence === 'high') pl.confidence = 'medium';
        return changedCrops;
    };
    const changed = normalize(plan);
    step({
        id: 'write', status: 'done',
        result: changed ? 'The AI suggested different crops; kept the rule-based picks so the answer stays consistent.' : 'Plan matches the rule-based crop picks.',
    });

    // ---- Self-review: fact-check the plan against the measured data, let the agent fix it once
    const ctx = { site, picks: getPicks(), now };
    step({ id: 'verify', label: 'Fact-checking the plan against official data', status: 'running', by: 'system' });
    let checks = verifyPlan(plan, ctx);
    let bad = failures(checks);
    const firstProblems = bad.flatMap((c) => c.problems);
    step({ id: 'verify', status: 'done', result: bad.length ? `${firstProblems.length} problem(s) found: ${firstProblems.slice(0, 2).join(' ')}${firstProblems.length > 2 ? ' …' : ''}` : `All ${checks.filter((c) => c.status === 'pass').length} checks passed.` });
    let revised = false;
    if (bad.length) {
        step({ id: 'revise', label: 'Agent is correcting its plan', status: 'running', by: 'agent', reason: 'The fact-checker found statements that do not match the data.' });
        try {
            const fix = await aiRequest({
                instructions: systemPrompt(now) + '\n\nYou are now correcting your own plan. Change ONLY what the fact-checker flagged, using the verified facts. Keep everything else the same. Reply with the full corrected JSON only.',
                input: [{ type: 'message', role: 'user', content: `VERIFIED FACTS:\n${factSheet(site, getPicks())}\n\nYOUR PLAN:\n${JSON.stringify(plan)}\n\nFACT-CHECKER PROBLEMS:\n${firstProblems.map((x) => `- ${x}`).join('\n')}` }],
                temperature: 0,
                max_output_tokens: 4000,
            });
            const fixed = parseJSON(outputText(fix));
            if (fixed && fixed.calendar) {
                normalize(fixed);
                const again = verifyPlan(fixed, ctx);
                if (failures(again).flatMap((c) => c.problems).length < firstProblems.length) {
                    plan = fixed; checks = again; bad = failures(again); revised = true;
                }
            }
            step({ id: 'revise', status: revised ? 'done' : 'failed', result: revised ? (bad.length ? `Fixed some problems; ${bad.flatMap((c) => c.problems).length} still flagged below.` : 'All flagged problems fixed and re-checked.') : 'The correction did not improve the plan; the problems are flagged below.' });
        } catch (err) {
            step({ id: 'revise', status: 'failed', result: `Could not revise (${err.message}); the problems are flagged below.` });
        }
    }
    plan.fact_check = { checks, revised, problemsFound: firstProblems.length, problemsLeft: bad.flatMap((c) => c.problems).length };
    return finish(plan, 'agent');
}

// ---------------------------------------------------------------------------
// Saved plans and cache
// ---------------------------------------------------------------------------

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
}

function makeKey(farm, photos) {
    const day = new Date().toISOString().slice(0, 10); // forecast and satellite data change daily
    return hash(JSON.stringify({
        lat: farm.lat?.toFixed(4), lon: farm.lon?.toFixed(4), ha: farm.hectares?.toFixed(2),
        b: (farm.boundary || []).map((p) => [p.lat.toFixed(5), p.lon.toFixed(5)]),
        g: farm.goals, n: farm.notes || '', p: photos.map((x) => hash(x)), day,
    }));
}

const CACHE = 'agrigenesis.cache';
function readCache(key) {
    try { return (JSON.parse(localStorage.getItem(CACHE)) || {})[key] || null; } catch { return null; }
}
function saveResult(result) {
    try {
        localStorage.setItem('agrigenesis.plan', JSON.stringify(result));
        if (result.mode !== 'agent') return; // only cache complete AI plans
        const all = JSON.parse(localStorage.getItem(CACHE) || '{}');
        all[result.cacheKey] = result;
        const keys = Object.keys(all);
        keys.slice(0, Math.max(0, keys.length - 5)).forEach((k) => delete all[k]); // keep the last 5
        localStorage.setItem(CACHE, JSON.stringify(all));
    } catch { /* storage full or blocked */ }
}

export function loadSavedPlan() {
    try { return JSON.parse(localStorage.getItem('agrigenesis.plan')); } catch { return null; }
}
