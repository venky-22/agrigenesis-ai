// Sustainability score for a farm plan.
// A transparent, rule-based index (0–100) built only from the measured data and the chosen crops.
// It is AgriGenesis AI's own index, not an official certification. Every part says what it used.

import { cropById } from './crops';

const PERENNIAL = new Set(['forage', 'wild-blueberries', 'haskap', 'strawberries', 'apples', 'grapes']);
const ACRES_PER_HA = 2.47105;

/**
 * @param {{site: object, picks: {crop_id, acres}[], ranking?: object[], farm?: {hectares?: number}}} args
 * @returns {{score, grade, parts: {id, label, points, max, value, why, source}[], skipped: string[]} | null}
 */
export function sustainabilityScore({ site = {}, picks = [], ranking = [], farm = {} }) {
    if (!picks.length) return null;
    const lc = site.landCover?.data, t = site.terrain?.data, so = site.soil?.data;
    const planned = picks.reduce((s, p) => s + (p.acres || 0), 0);
    const parts = [], skipped = [];

    // 1. Uses land that is already open (no clearing forest or draining wetland)
    if (lc?.available && farm.hectares) {
        const openPct = (lc.farmlandPct || 0) + (lc.shrubPct || 0);
        const openAcres = (farm.hectares * ACRES_PER_HA * openPct) / 100;
        const share = planned ? Math.min(1, openAcres / planned) : 1;
        parts.push({
            id: 'land', label: 'Farms open land, keeps forest and wetland', short: 'Open land', stat: `${openPct}% open`, tip: 'Plant only on the open part of the land and keep the forest and wetland.', max: 20, points: Math.round(20 * share),
            value: `${openPct}% of the land is already open (farmland, grass or shrubs): about ${openAcres.toFixed(1)} acres for ${planned.toFixed(2)} acres planned`,
            why: 'Planting on land that is already open avoids clearing forest or draining wetland, which store carbon and protect water.',
            source: `Agriculture and Agri-Food Canada land-use map, ${lc.latestYear}`,
        });
    } else skipped.push('Land use (no land-use reading or land size)');

    // 2. Living cover all year (perennial crops protect the soil)
    {
        const perennialAcres = picks.filter((p) => PERENNIAL.has(p.crop_id)).reduce((s, p) => s + (p.acres || 0), 0);
        const share = planned ? perennialAcres / planned : 0;
        const names = picks.filter((p) => PERENNIAL.has(p.crop_id)).map((p) => cropById(p.crop_id)?.name).join(', ');
        parts.push({
            id: 'cover', label: 'Keeps the soil covered all year', short: 'Soil cover', stat: `${Math.round(share * 100)}% year-round`, tip: 'After annual crops are harvested, sow a cover crop such as winter rye or clover.', max: 20, points: Math.max(4, Math.round(20 * share)),
            value: `${Math.round(share * 100)}% of the planned area is in crops that stay in the ground${names ? ` (${names})` : ''}`,
            why: 'Perennial crops keep roots and cover on the soil through winter, which reduces erosion and builds organic matter. Annual crops can still score with a cover crop after harvest.',
            source: 'Crops chosen in this plan',
        });
    }

    // 3. Low erosion risk from slope
    if (t?.slopePct != null) {
        const s = t.slopePct;
        const points = s < 2 ? 20 : s < 5 ? 16 : s < 9 ? 10 : s < 15 ? 5 : 0;
        parts.push({
            id: 'slope', label: 'Low erosion risk from slope', short: 'Slope', stat: `${s}% slope`, tip: 'Plant across the slope and keep grass strips to hold the soil.', max: 20, points,
            value: `Slope about ${s}% (${t.slopeClass})`,
            why: 'Water washes bare soil off sloping fields; flatter land loses less topsoil.',
            source: 'Copernicus 90 m elevation model',
        });
    } else skipped.push('Slope (no elevation reading)');

    // 4. Crops suited to this climate (fewer inputs, less crop loss)
    {
        const fits = picks.map((p) => ranking.find((r) => r.id === p.crop_id)?.fit).filter(Boolean);
        if (fits.length) {
            const pts = fits.map((f) => (f === 'good' ? 20 : f === 'possible' ? 12 : 0));
            const good = fits.filter((f) => f === 'good').length;
            parts.push({
                id: 'fit', label: 'Crops suited to this land and climate', short: 'Crop fit', stat: `${good} of ${fits.length} good fit`, tip: 'Start the “possible with work” crops small, and follow the soil test advice.', max: 20, points: Math.round(pts.reduce((a, b) => a + b, 0) / pts.length),
                value: `${good} of ${fits.length} chosen crops are a good fit; the rest are possible with work`,
                why: 'Crops that suit the frost-free season, soil and slope need less fertiliser, spraying and replanting, and fail less often.',
                source: 'Crop rules checked against Environment Canada frost dates, soil and slope',
            });
        } else skipped.push('Crop fit (no ranking)');
    }

    // 5. Soil organic matter to protect
    if (so?.available && so.organicCarbonGkg != null) {
        const oc = so.organicCarbonGkg;
        const points = oc >= 40 ? 20 : oc >= 30 ? 16 : oc >= 20 ? 12 : oc >= 10 ? 7 : 3;
        parts.push({
            id: 'soil', label: 'Healthy soil carbon to build on', short: 'Soil carbon', stat: `${oc} g/kg`, tip: 'Add compost or manure and till less to build soil carbon.', max: 20, points,
            value: `Topsoil organic carbon about ${oc} g/kg (estimate)`,
            why: 'Soil carbon holds water and nutrients. More of it means fewer inputs; the plan protects it with cover and less tillage.',
            source: so.provider === 'aafc' ? 'Agriculture and Agri-Food Canada, Soil Landscape Grids' : 'ISRIC SoilGrids',
        });
    } else skipped.push('Soil carbon (no soil estimate)');

    const max = parts.reduce((s, p) => s + p.max, 0);
    if (!max) return null;
    const score = Math.round((parts.reduce((s, p) => s + p.points, 0) / max) * 100);
    const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D';
    const verdict = { A: 'Excellent: this plan protects the land', B: 'Good: this plan protects the land well', C: 'Fair: a few changes would help', D: 'Needs work before planting' }[grade];
    return { score, grade, verdict, parts, skipped };
}
