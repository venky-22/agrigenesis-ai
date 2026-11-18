// Crops commonly grown in Nova Scotia, with rule-of-thumb growing needs.
// These are general guideline values from extension guides (Perennia, OMAFRA,
// Agriculture and Agri-Food Canada). They are a starting point for screening,
// not a replacement for local agronomy advice.

export const CROP_SOURCES = [
    { name: 'Perennia (Nova Scotia agriculture extension) crop guides', url: 'https://www.perennia.ca' },
    { name: 'Ontario Ministry of Agriculture (OMAFRA) crop production guides', url: 'https://www.ontario.ca/page/crop-production' },
    { name: 'Agriculture and Agri-Food Canada, crop profiles', url: 'https://agriculture.canada.ca/en/sector/horticulture/reports' },
];

/**
 * frostFree: minimum frost-free days (0 °C) for a reliable crop
 * gdd5 / gdd10: minimum growing degree days, April–October (base 5 °C / 10 °C)
 * pH: [idealLow, idealHigh]; pHLimits: [hardLow, hardHigh] before yield suffers badly
 * maxSlope: % slope above which the crop gets hard to manage (erosion, machinery)
 * soil: 'light' prefers sandy/loamy well-drained soil; 'any' tolerates heavier soil
 * yearsToHarvest: years from planting to the first real harvest
 * startup: rough relative start-up cost per acre ('low' | 'medium' | 'high')
 * labour: relative labour need ('low' | 'medium' | 'high')
 */
export const CROPS = [
    {
        id: 'potatoes', name: 'Potatoes', emoji: '🥔', kind: 'vegetable',
        frostFree: 100, gdd5: 1100, pH: [5.0, 6.0], pHLimits: [4.8, 6.8], maxSlope: 8, soil: 'light',
        yearsToHarvest: 0, startup: 'medium', labour: 'medium',
        plant: 'Mid-May to early June, after soil reaches 7 °C', harvest: 'August (early) to early October',
        note: 'A major Atlantic Canada crop. Slightly acidic soil reduces scab.',
    },
    {
        id: 'wild-blueberries', name: 'Wild blueberries', emoji: '🫐', kind: 'fruit (perennial)',
        frostFree: 90, gdd5: 900, pH: [4.2, 5.2], pHLimits: [4.0, 5.5], maxSlope: 20, soil: 'light',
        yearsToHarvest: 3, startup: 'medium', labour: 'low',
        plant: 'Managed from existing native plants; spread by planting sods or plugs in spring', harvest: 'August, every second year',
        note: 'Nova Scotia’s top fruit export. Works best where wild blueberry plants already grow on acidic, sandy land.',
        needsAcid: true,
    },
    {
        id: 'apples', name: 'Apples', emoji: '🍎', kind: 'fruit (tree)',
        frostFree: 125, gdd5: 1300, pH: [6.0, 7.0], pHLimits: [5.3, 7.5], maxSlope: 15, soil: 'light',
        yearsToHarvest: 4, startup: 'high', labour: 'high',
        plant: 'Trees planted in April or May', harvest: 'September to October',
        note: 'Annapolis Valley speciality. Gentle slopes help cold air drain away from blossoms.',
    },
    {
        id: 'strawberries', name: 'Strawberries', emoji: '🍓', kind: 'fruit (perennial)',
        frostFree: 110, gdd5: 1100, pH: [5.5, 6.5], pHLimits: [5.0, 7.0], maxSlope: 8, soil: 'light',
        yearsToHarvest: 1, startup: 'medium', labour: 'high',
        plant: 'Plants set out in May', harvest: 'Late June to July of the following year',
        note: 'Good for direct sale and U-pick. Needs straw mulch over winter.',
    },
    {
        id: 'carrots', name: 'Carrots', emoji: '🥕', kind: 'vegetable',
        frostFree: 100, gdd5: 1000, pH: [6.0, 6.8], pHLimits: [5.5, 7.5], maxSlope: 6, soil: 'light',
        yearsToHarvest: 0, startup: 'low', labour: 'medium',
        plant: 'Seeded May to June', harvest: 'August to October',
        note: 'Needs loose, stone-free soil for straight roots.',
    },
    {
        id: 'brassicas', name: 'Cabbage & broccoli', emoji: '🥦', kind: 'vegetable',
        frostFree: 90, gdd5: 1000, pH: [6.2, 7.2], pHLimits: [5.6, 7.8], maxSlope: 8, soil: 'any',
        yearsToHarvest: 0, startup: 'low', labour: 'medium',
        plant: 'Transplants set out mid-May to June', harvest: 'July to October; handles light frost',
        note: 'Likes cool weather. Keep pH near 7 to prevent clubroot.',
    },
    {
        id: 'sweet-corn', name: 'Sweet corn', emoji: '🌽', kind: 'vegetable',
        frostFree: 110, gdd5: 1400, pH: [5.8, 7.0], pHLimits: [5.3, 7.5], maxSlope: 8, soil: 'light',
        yearsToHarvest: 0, startup: 'low', labour: 'low',
        plant: 'Seeded late May to early June', harvest: 'August to September',
        note: 'Popular at farm stands. Needs warm summers.',
    },
    {
        id: 'squash', name: 'Pumpkins & squash', emoji: '🎃', kind: 'vegetable',
        frostFree: 110, gdd5: 1300, pH: [6.0, 6.8], pHLimits: [5.5, 7.5], maxSlope: 8, soil: 'light',
        yearsToHarvest: 0, startup: 'low', labour: 'low',
        plant: 'Seeded or transplanted early June', harvest: 'September to early October, before frost',
        note: 'Frost-tender. Large plants, low labour once established.',
    },
    {
        id: 'garlic', name: 'Garlic', emoji: '🧄', kind: 'vegetable',
        frostFree: 90, gdd5: 900, pH: [6.0, 7.0], pHLimits: [5.5, 7.5], maxSlope: 8, soil: 'light',
        yearsToHarvest: 0, startup: 'medium', labour: 'medium',
        plant: 'Cloves planted in October', harvest: 'Mid to late July',
        note: 'Hardy and well suited to cold winters. Sells well locally.',
    },
    {
        id: 'mixed-veg', name: 'Mixed vegetables (market garden)', emoji: '🥬', kind: 'vegetable',
        frostFree: 100, gdd5: 1100, pH: [6.0, 7.0], pHLimits: [5.5, 7.5], maxSlope: 6, soil: 'light',
        yearsToHarvest: 0, startup: 'low', labour: 'high',
        plant: 'Staggered plantings April to July', harvest: 'June to October',
        note: 'Small area, many crops. Suits feeding a family and selling extra at markets.',
    },
    {
        id: 'forage', name: 'Hay & pasture', emoji: '🌾', kind: 'forage (perennial)',
        frostFree: 80, gdd5: 800, pH: [6.0, 7.0], pHLimits: [5.3, 7.8], maxSlope: 20, soil: 'any',
        yearsToHarvest: 1, startup: 'low', labour: 'low',
        plant: 'Seeded in May, or August for fall establishment', harvest: 'Cut June to August, two cuts most years',
        note: 'Timothy and clover handle heavier, wetter soils. Protects soil on slopes.',
    },
    {
        id: 'cereals', name: 'Barley & oats', emoji: '🌾', kind: 'grain',
        frostFree: 90, gdd5: 1100, pH: [6.0, 7.0], pHLimits: [5.5, 7.8], maxSlope: 10, soil: 'any',
        yearsToHarvest: 0, startup: 'low', labour: 'low',
        plant: 'Seeded late April to May', harvest: 'August',
        note: 'Good rotation crop. Oats tolerate more acidic soil than barley.',
    },
    {
        id: 'haskap', name: 'Haskap berries', emoji: '🫐', kind: 'fruit (perennial)',
        frostFree: 80, gdd5: 900, pH: [5.5, 7.0], pHLimits: [5.0, 7.8], maxSlope: 12, soil: 'any',
        yearsToHarvest: 3, startup: 'medium', labour: 'medium',
        plant: 'Bushes planted in spring', harvest: 'Late June, earliest fruit of the year',
        note: 'Very cold hardy. A newer niche crop in Nova Scotia.',
    },
    {
        id: 'grapes', name: 'Wine grapes', emoji: '🍇', kind: 'fruit (vine)',
        frostFree: 150, gdd5: 1500, gdd10: 950, pH: [6.0, 7.0], pHLimits: [5.5, 7.5], maxSlope: 15, soil: 'light',
        yearsToHarvest: 3, startup: 'high', labour: 'high',
        plant: 'Vines planted in May', harvest: 'October',
        note: 'Cold-hardy varieties such as L’Acadie blanc. Needs warm, sheltered sites.',
    },
];

const LABEL = { good: 'Good fit', possible: 'Possible with work', poor: 'Not recommended' };

/**
 * Score every crop against the measured site. Pure rules, no AI.
 * @returns {Array<{id,name,emoji,score,fit,fitLabel,reasons:[{level:'ok'|'warn'|'bad',text}]}>}
 */
export function rankCrops({ climate: model, normals, soil, terrain, landCover }, goals = {}) {
    // Prefer official station records; fall back to the weather model
    const climate = normals?.available
        ? { frostFreeDays: normals.frostFreeDays, gdd5: normals.gdd5 ?? model?.gdd5, gdd10: normals.gdd10 ?? model?.gdd10, frostFreeDaysShortest: null }
        : model;
    return CROPS.map((c) => {
        let score = 100;
        const reasons = [];
        const add = (level, text, penalty = 0) => { reasons.push({ level, text }); score -= penalty; };

        // Season length
        const ffd = climate?.frostFreeDays;
        if (ffd != null) {
            const short = climate.frostFreeDaysShortest;
            if (ffd >= c.frostFree + 15) add('ok', `Frost-free season (${ffd} days) is long enough (needs ~${c.frostFree}).`);
            else if (ffd >= c.frostFree) add('warn', `Frost-free season (${ffd} days) just meets the ~${c.frostFree} days needed${short != null && short < c.frostFree ? `; in the shortest year it was only ${short}` : ''}.`, 10);
            else if (ffd >= c.frostFree - 15) add('warn', `Season is a bit short: ${ffd} frost-free days vs ~${c.frostFree} needed. Use early varieties or transplants.`, 25);
            else add('bad', `Season too short: ${ffd} frost-free days vs ~${c.frostFree} needed.`, 50);
        }

        // Heat
        const gdd = climate?.gdd5;
        if (gdd != null) {
            if (gdd >= c.gdd5 + 100) add('ok', `Enough summer heat (${gdd} growing degree days, needs ~${c.gdd5}).`);
            else if (gdd >= c.gdd5 - 100) add('warn', `Summer heat is borderline (${gdd} vs ~${c.gdd5} growing degree days).`, 12);
            else add('bad', `Not enough summer heat (${gdd} vs ~${c.gdd5} growing degree days).`, 35);
        }
        if (c.gdd10 && climate?.gdd10 != null && climate.gdd10 < c.gdd10) {
            add('warn', `Heat above 10 °C (${climate.gdd10}) is below the ~${c.gdd10} this crop likes.`, 15);
        }

        // Soil acidity
        if (soil?.available) {
            const ph = soil.pH;
            const [lo, hi] = c.pH;
            const [hardLo, hardHi] = c.pHLimits;
            if (ph >= lo && ph <= hi) add('ok', `Estimated soil pH ${ph} is in the ideal range (${lo}–${hi}).`);
            else if (ph < lo) {
                if (c.needsAcid) add('bad', `Soil pH ${ph} is too low even for this crop.`, 30);
                else if (ph >= hardLo) add('warn', `Soil pH ${ph} is a little acidic (ideal ${lo}–${hi}). Lime can fix this.`, 8);
                else add('warn', `Soil pH ${ph} is quite acidic (ideal ${lo}–${hi}). Needs lime, ideally a year before planting.`, 18);
            } else if (ph > hi) {
                if (c.needsAcid && ph <= hardHi) add('warn', `Soil pH ${ph} is slightly high for this crop (ideal ${lo}–${hi}); sulphur can lower it slowly.`, 12);
                else if (c.needsAcid) add('bad', `Soil pH ${ph} is too high; this crop needs acidic soil (${lo}–${hi}) and that is hard to change.`, 45);
                else if (ph <= hardHi) add('warn', `Soil pH ${ph} is slightly high (ideal ${lo}–${hi}).`, 8);
                else add('warn', `Soil pH ${ph} is high (ideal ${lo}–${hi}).`, 20);
            }

            // Texture and drainage
            if (c.soil === 'light' && soil.clayPct >= 35) add('warn', `Heavy ${soil.texture} soil (${soil.clayPct}% clay) may stay wet; this crop wants loose, well-drained soil. Raised beds or drainage help.`, 18);
            else if (c.soil === 'light' && soil.clayPct >= 27) add('warn', `${cap(soil.texture)} soil is on the heavy side for this crop.`, 8);
            else if (soil.sandPct >= 70 && c.soil === 'any') add('warn', 'Sandy soil dries out fast; plan for irrigation in dry spells.', 8);
            else add('ok', `${cap(soil.texture)} soil suits this crop.`);
        } else {
            add('warn', 'No soil estimate for this spot. A soil test is needed before deciding.', 10);
        }

        // Slope
        const slope = terrain?.slopePct;
        if (slope != null) {
            if (slope <= c.maxSlope * 0.6) add('ok', `Slope (${slope}%) is fine.`);
            else if (slope <= c.maxSlope) add('warn', `Slope (${slope}%) is workable but watch for erosion.`, 6);
            else if (slope <= c.maxSlope * 1.5) add('warn', `Slope (${slope}%) is steeper than ideal (max ~${c.maxSlope}%). Plant across the slope or pick the flattest part.`, 15);
            else add('bad', `Slope (${slope}%) is too steep for this crop (max ~${c.maxSlope}%).`, 30);
        }

        // What is on the land now (national land-use map)
        if (landCover?.available) {
            const unusable = (landCover.waterPct || 0) + (landCover.developedPct || 0);
            if (unusable >= 60) add('bad', `About ${unusable}% of the outlined area is mapped as water, buildings or roads. Check the outline on the map.`, 50);
            if (landCover.wetlandPct >= 40) add('bad', `About ${landCover.wetlandPct}% of the land is mapped as wetland. Wet ground rules out most crops, and wetlands are protected in Nova Scotia.`, 40);
            else if (landCover.wetlandPct >= 15) add('warn', `About ${landCover.wetlandPct}% is mapped as wetland; avoid those parts.`, 10);
            if (landCover.forestPct >= 50) add('warn', `About ${landCover.forestPct}% is forest. Clearing takes time and money, and trees protect soil and wildlife; start on any open part first.`, c.kind.includes('forage') ? 10 : 15);
            if (landCover.farmlandPct >= 50 && c.id === 'forage' && landCover.main === 'Hay and pasture') add('ok', 'Already used for hay or pasture, so this is the easiest start.');
        }
        // Wild blueberries rely on native plants already present
        if (c.needsAcid && landCover?.available && !landCover.history?.some((h) => h.classes.some((x) => x.name === 'Blueberries'))) {
            add('warn', 'No blueberry fields mapped here; new fields are slow to establish without native plants.', 8);
        }

        // Fit with the farmer's goals (small adjustments only)
        if (goals.goal === 'family' && ['cereals', 'grapes', 'wild-blueberries'].includes(c.id)) add('warn', 'Less useful for feeding a household directly.', 8);
        if (goals.budget === 'low' && c.startup === 'high') add('warn', 'High start-up cost for a small budget.', 12);
        if (goals.time === 'weekends' && c.labour === 'high') add('warn', 'Needs a lot of labour for weekend-only time.', 10);
        if (goals.experience === 'new' && c.yearsToHarvest >= 3) add('warn', `First real harvest takes about ${c.yearsToHarvest} years.`, 6);

        score = Math.max(0, Math.min(100, Math.round(score)));
        const hasBad = reasons.some((r) => r.level === 'bad');
        const fit = hasBad || score < 50 ? 'poor' : score >= 75 ? 'good' : 'possible';
        return { id: c.id, name: c.name, emoji: c.emoji, kind: c.kind, score, fit, fitLabel: LABEL[fit], reasons, plant: c.plant, harvest: c.harvest, note: c.note, yearsToHarvest: c.yearsToHarvest };
    }).sort((a, b) => b.score - a.score);
}

const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

export const cropById = (id) => CROPS.find((c) => c.id === id);

// Months (1–12) for the season preview. perennial = stays in the ground all year.
export const SEASON = {
    potatoes: { plant: [5, 6], harvest: [8, 9, 10], colour: '#a3e635' },
    'wild-blueberries': { perennial: true, harvest: [8], colour: '#6366f1' },
    apples: { perennial: true, harvest: [9, 10], colour: '#ef4444' },
    strawberries: { perennial: true, plant: [5], harvest: [6, 7], colour: '#f43f5e' },
    carrots: { plant: [5, 6], harvest: [8, 9, 10], colour: '#fb923c' },
    brassicas: { plant: [5, 6], harvest: [7, 8, 9, 10], colour: '#22c55e' },
    'sweet-corn': { plant: [5, 6], harvest: [8, 9], colour: '#facc15' },
    squash: { plant: [6], harvest: [9, 10], colour: '#f97316' },
    garlic: { plant: [10], harvest: [7], overwinter: true, colour: '#e9d5ff' },
    'mixed-veg': { plant: [4, 5, 6, 7], harvest: [6, 7, 8, 9, 10], colour: '#10b981' },
    forage: { perennial: true, harvest: [6, 7, 8], colour: '#84cc16' },
    cereals: { plant: [4, 5], harvest: [8], colour: '#eab308' },
    haskap: { perennial: true, harvest: [6, 7], colour: '#8b5cf6' },
    grapes: { perennial: true, harvest: [10], colour: '#a855f7' },
};

/** What a plot looks like in a given month (1–12). */
export function stageFor(cropId, month) {
    const s = SEASON[cropId];
    if (!s) return { stage: 'bare', label: 'Bare soil' };
    if (month === 12 || month <= 3) {
        if (s.perennial) return { stage: 'dormant', label: 'Dormant under snow' };
        if (s.overwinter) return { stage: 'dormant', label: 'Cloves resting under mulch' };
        return { stage: 'bare', label: 'Resting, snow cover' };
    }
    if (s.harvest.includes(month)) return { stage: 'harvest', label: 'Harvest' };
    if (s.plant?.includes(month) && !s.perennial) return { stage: 'planting', label: 'Planting' };
    const first = s.plant ? Math.min(...s.plant) : 4;
    const lastHarvest = Math.max(...s.harvest);
    if (s.perennial || s.overwinter) return { stage: 'growing', label: s.overwinter && month > lastHarvest && month < 10 ? 'Bed resting until fall planting' : 'Growing' };
    if (month > first && month < lastHarvest) return { stage: 'growing', label: 'Growing' };
    return { stage: 'bare', label: month < first ? 'Preparing soil' : 'Finished, cover crop' };
}

const BASE_ACRES = { new: 0.25, some: 0.5, experienced: 1.5 };
const TIME_FACTOR = { weekends: 0.5, parttime: 1, fulltime: 2 };
const BUDGET_FACTOR = { low: 1, medium: 2, high: 4 };
const roundStep = (a) => (a < 1 ? Math.max(0.1, Math.round(a * 20) / 20) : Math.round(a * 4) / 4);

/**
 * Deterministic crop picks: same data + same goals always gives the same choice.
 * Takes the top "good"/"possible" crops by rule score, prefers variety
 * (at most one perennial fruit for new farmers), and sizes each start plot from
 * experience, time and budget, never using more than half the land.
 */
export function chooseCrops(ranking, goals = {}, fieldAcres = 0) {
    const ok = ranking.filter((c) => c.fit !== 'poor');
    const picks = [];
    for (const c of ok) {
        if (picks.length >= 3) break;
        const isFruit = c.kind.startsWith('fruit');
        if (isFruit && goals.experience === 'new' && picks.some((p) => p.kind.startsWith('fruit'))) continue;
        picks.push(c);
    }
    const base = (BASE_ACRES[goals.experience] ?? 0.5) * (TIME_FACTOR[goals.time] ?? 1) * (BUDGET_FACTOR[goals.budget] ?? 1);
    let sized = picks.map((c) => {
        const crop = cropById(c.id);
        const factor = crop.labour === 'low' ? 3 : crop.labour === 'high' ? 0.5 : 1;
        return { crop_id: c.id, acres: base * factor };
    });
    const cap = fieldAcres > 0 ? fieldAcres * 0.5 : Infinity;
    const total = sized.reduce((s, p) => s + p.acres, 0);
    if (total > cap) sized = sized.map((p) => ({ ...p, acres: (p.acres * cap) / total }));
    return sized.map((p) => ({ ...p, acres: roundStep(p.acres) }));
}

/** Crops to avoid: the "not recommended" ones, with their main problem. Deterministic. */
export function cropsToAvoid(ranking, max = 3) {
    return ranking.filter((c) => c.fit === 'poor').slice(-max).reverse().map((c) => ({
        crop_id: c.id,
        why: (c.reasons.find((r) => r.level === 'bad') || c.reasons.find((r) => r.level === 'warn'))?.text || 'Low score for this land.',
    }));
}
