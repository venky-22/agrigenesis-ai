import { sustainabilityScore } from './sustainability';
// Shares the saved farm plan with Crop Care and Climate Risk, so every page uses
// the same verified facts (official frost dates, soil, slope, chosen crops).

import { CROPS, cropById } from './crops';

export function loadPlan() {
    try {
        const plan = JSON.parse(localStorage.getItem('agrigenesis.plan'));
        return plan?.farm?.lat != null ? plan : null;
    } catch {
        return null;
    }
}

/** Match a free-text crop name ("Potatoes", "sweet corn") to a crop id, or null. */
export function cropIdFromName(name = '') {
    const n = name.toLowerCase().trim();
    if (!n) return null;
    const exact = CROPS.find((c) => c.id === n || c.name.toLowerCase() === n);
    if (exact) return exact.id;
    const words = { potato: 'potatoes', blueberr: 'wild-blueberries', apple: 'apples', strawberr: 'strawberries', carrot: 'carrots', cabbage: 'brassicas', broccoli: 'brassicas', corn: 'sweet-corn', squash: 'squash', pumpkin: 'squash', garlic: 'garlic', vegetable: 'mixed-veg', hay: 'forage', pasture: 'forage', forage: 'forage', barley: 'cereals', oat: 'cereals', wheat: 'cereals', grain: 'cereals', tomato: 'mixed-veg', haskap: 'haskap', grape: 'grapes' };
    const hit = Object.entries(words).find(([k]) => n.includes(k));
    return hit ? hit[1] : null;
}

/** Map a SoilGrids texture ("sandy clay loam") to the simple soil types used by Climate Risk. */
export function simpleSoil(texture = '') {
    const t = texture.toLowerCase();
    if (!t) return null;
    if (t.includes('clay') && !t.includes('loam')) return 'clay';
    if (t.includes('sand') && !t.includes('loam')) return 'sandy';
    if (t.startsWith('silt')) return 'silt';
    return 'loamy';
}

/**
 * Plain-text facts for AI prompts. Empty string when there is no saved plan.
 * The AI is told to treat these as verified and never contradict them.
 */
export function planFacts(plan = loadPlan()) {
    if (!plan) return '';
    const { farm, site = {}, picks = [] } = plan;
    const n = site.normals?.data, s = site.soil?.data, t = site.terrain?.data, lc = site.landCover?.data, c = site.climate?.data;
    const lines = [
        `Farm: ${farm.placeName} (lat ${farm.lat}, lon ${farm.lon})${farm.hectares ? `, ${(farm.hectares * 2.47105).toFixed(1)} acres` : ''}.`,
        n?.available && `Official frost record (Environment Canada, ${n.station} station, ${n.distanceKm} km away, ${n.period}): average last spring frost ${n.lastSpringFrost}, average first fall frost ${n.firstFallFrost}, ${n.frostFreeDays} frost-free days, ${n.gdd5} growing degree days above 5 °C.`,
        c && `Recent seasons (gridded weather model ${c.years}, NOT the official record; it can differ from the station): May–September rain about ${c.seasonRainMm} mm.${n?.available ? ' For frost dates use only the official Environment Canada dates above.' : ` Model frost dates: last spring frost ${c.lastSpringFrost} on average, as late as ${c.lastSpringFrostLate} one year in 10.`}`,
        s?.available ? `Soil estimate (${s.provider === 'aafc' ? 'Agriculture Canada soil map' : 'SoilGrids'}, not a lab test): ${s.texture}, pH ${s.pH}, ${s.clayPct}% clay, ${s.sandPct}% sand, ${s.drainageHint}.` : 'Soil: no estimate available; a lab soil test is needed.',
        t && `Slope ${t.slopePct}% (${t.slopeClass}), facing ${t.faces}, elevation ${t.elevationM} m.`,
        lc?.available && `Land use ${lc.latestYear} (Agriculture Canada crop inventory): ${lc.history?.[0]?.text}.`,
        (() => { const sc = sustainabilityScore(plan); return sc && `Sustainability score (AgriGenesis AI rule-based index, not official): ${sc.score}/100, grade ${sc.grade}. ${sc.parts.map((x) => `${x.label}: ${x.points}/${x.max} (${x.value})`).join('; ')}.`; })(),
        picks.length && `Crops in the farm plan: ${picks.map((p) => `${cropById(p.crop_id)?.name} (${p.acres} acre)`).join(', ')}.`,
    ].filter(Boolean);
    return `VERIFIED FARM FACTS (from official data; use them and never contradict them; base all planting dates on the official last spring frost):\n${lines.join('\n')}`;
}
