// Income estimates in Canadian dollars, from Statistics Canada data for Nova Scotia (2021–2025).
// Values are GROSS farm-gate income per acre: what Nova Scotia farms were paid on average,
// before any costs. Computed once from the official tables listed below.

export const STATCAN_TABLES = {
    '32-10-0365-01': { name: 'Marketed vegetables: area, production and farm gate value', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210036501' },
    '32-10-0364-01': { name: 'Fresh and processed fruits: area, production and farm gate value', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210036401' },
    '32-10-0358-01': { name: 'Potatoes: area, production and farm value', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210035801' },
    '32-10-0359-01': { name: 'Principal field crops: area, yield, production, price and value', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210035901' },
    '32-10-0077-01': { name: 'Farm product prices, crops and livestock', url: 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3210007701' },
};

// $ per acre by year (gaps = Statistics Canada suppressed the value)
export const NS_INCOME_PER_ACRE = {
    potatoes: { years: { 2021: 5561, 2022: 5718, 2023: 5581, 2024: 5584, 2025: 4969 }, basis: 'Average Nova Scotia potato yield × average Nova Scotia farm price', tables: ['32-10-0358-01', '32-10-0077-01'] },
    carrots: { years: { 2021: 3256, 2023: 3102, 2024: 2908, 2025: 2334 }, basis: 'Fresh carrots: farm-gate value ÷ harvested acres', tables: ['32-10-0365-01'] },
    brassicas: { years: { 2021: 4989, 2022: 4053, 2023: 4850, 2025: 4159 }, basis: 'Fresh broccoli: farm-gate value ÷ harvested acres', tables: ['32-10-0365-01'] },
    'sweet-corn': { years: { 2021: 2757, 2022: 3005, 2023: 3133, 2024: 3554, 2025: 3798 }, basis: 'Fresh sweet corn: farm-gate value ÷ harvested acres', tables: ['32-10-0365-01'] },
    squash: { years: { 2021: 5050, 2022: 5288, 2023: 6138, 2024: 7019, 2025: 7076 }, basis: 'Fresh squash and zucchini: farm-gate value ÷ harvested acres', tables: ['32-10-0365-01'] },
    garlic: { years: { 2021: 5939, 2023: 6367, 2025: 14143 }, basis: 'Fresh garlic: farm-gate value ÷ harvested acres', tables: ['32-10-0365-01'] },
    'mixed-veg': { years: { 2021: 5691, 2022: 6024, 2023: 6441, 2024: 6642, 2025: 5254 }, basis: 'All fresh vegetables: farm-gate value ÷ harvested acres', tables: ['32-10-0365-01'] },
    strawberries: { years: { 2021: 16290, 2022: 19414, 2023: 13985, 2024: 21967, 2025: 27171 }, basis: 'Strawberries: farm-gate value ÷ cultivated acres', tables: ['32-10-0364-01'] },
    apples: { years: { 2021: 4645, 2022: 4821, 2023: 5304, 2024: 6785, 2025: 6031 }, basis: 'Apples: farm-gate value ÷ cultivated acres', tables: ['32-10-0364-01'] },
    'wild-blueberries': { years: { 2021: 1083, 2022: 1211, 2023: 485, 2024: 495, 2025: 746 }, basis: 'Wild (lowbush) blueberries: farm-gate value ÷ cultivated acres', tables: ['32-10-0364-01'] },
    haskap: { years: { 2021: 2012, 2023: 1817, 2025: 2201 }, basis: 'Haskaps: farm-gate value ÷ cultivated acres', tables: ['32-10-0364-01'] },
    grapes: { years: { 2021: 4313, 2022: 4579, 2023: 1566 }, basis: 'Grapes: farm-gate value ÷ cultivated acres', tables: ['32-10-0364-01'] },
    cereals: { years: { 2021: 371, 2022: 368, 2023: 332, 2024: 313, 2025: 318 }, basis: 'Barley: average Nova Scotia yield × average Nova Scotia farm price', tables: ['32-10-0359-01', '32-10-0077-01'] },
    forage: { yieldOnly: true, years: { 2021: 2.29, 2022: 1.8, 2023: 1.99, 2024: 2.65, 2025: 2.26 }, unit: 'tons of hay per acre', basis: 'Tame hay: average Nova Scotia yield (no Nova Scotia hay price is published)', tables: ['32-10-0359-01'] },
};

const money = (n) => `$${Math.round(n).toLocaleString('en-CA')}`;
const roundNice = (n) => (n >= 10000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10);

const ALL_YEARS = [2021, 2022, 2023, 2024, 2025];

/**
 * Gross income estimate for growing `acres` of a crop.
 * `latest` is the most recent Statistics Canada year (the headline figure);
 * `history` lists every year 2021–2025 (suppressed years are marked), and
 * low/high are the lowest and highest of those years.
 * Returns null if Statistics Canada publishes nothing usable for the crop.
 */
export function incomeEstimate(cropId, acres) {
    const e = NS_INCOME_PER_ACRE[cropId];
    if (!e) return null;
    const values = Object.values(e.years);
    const years = Object.keys(e.years).map(Number);
    const period = `${years[0]}–${years[years.length - 1]}`;
    const tables = e.tables.map((id) => ({ id, ...STATCAN_TABLES[id] }));
    const lo = Math.min(...values), hi = Math.max(...values);
    const latestYear = Math.max(...years);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    if (e.yieldOnly) {
        const history = ALL_YEARS.map((y) => (e.years[y] == null ? { year: y, suppressed: true } : { year: y, value: e.years[y], text: `${e.years[y]} t/acre` }));
        return {
            yieldOnly: true,
            text: `Nova Scotia hay fields averaged ${lo}–${hi} ${e.unit} (${period}); ${e.years[latestYear]} in ${latestYear}. No Nova Scotia hay price is published, so no dollar estimate is shown.`,
            latest: { year: latestYear, value: e.years[latestYear], text: `${e.years[latestYear]} ${e.unit}` },
            history, unit: e.unit, basis: e.basis, tables, period,
        };
    }
    const total = (perAcre) => roundNice(perAcre * acres);
    const history = ALL_YEARS.map((y) => (e.years[y] == null
        ? { year: y, suppressed: true }
        : { year: y, perAcre: e.years[y], total: total(e.years[y]), text: money(total(e.years[y])), perAcreText: `${money(e.years[y])}/acre` }));
    const latest = history.find((h) => h.year === latestYear);
    const prev = history.filter((h) => !h.suppressed && h.year < latestYear).pop();
    return {
        perAcreLow: lo,
        perAcreHigh: hi,
        perAcreText: `${money(lo)}–${money(hi)} per acre`,
        acres,
        low: total(lo),
        high: total(hi),
        text: `${money(total(lo))}–${money(total(hi))}`,
        latest: { ...latest, perAcreText: `${money(latest.perAcre)} per acre` },
        change: prev ? { fromYear: prev.year, pct: Math.round(((latest.perAcre - prev.perAcre) / prev.perAcre) * 100) } : null,
        average: { perAcre: Math.round(avg), total: total(avg), text: money(total(avg)) },
        history,
        basis: e.basis, tables, period,
    };
}

export const formatCAD = money;

// ---------------------------------------------------------------------------
// Production costs per acre (CAD), only where a published Canadian study exists.
// Nova Scotia studies are used first; otherwise the most recent Manitoba Agriculture guide.
// ---------------------------------------------------------------------------

export const COST_SOURCES = {
    mbPotato: { name: 'Manitoba Agriculture, Irrigated Processing Potato Cost of Production 2022/2023', url: 'https://www.gov.mb.ca/agriculture/farm-management/cost-production/pubs/cop-crop-irrigated-potato.pdf' },
    mbStrawberry: { name: 'Manitoba Agriculture, Strawberry Production Costs (June 2025)', url: 'https://www.gov.mb.ca/agriculture/farm-management/cost-production/pubs/cop-crop-strawberry.pdf' },
    mbCrops: { name: 'Manitoba Agriculture, Crop Production Costs 2026', url: 'https://www.gov.mb.ca/agriculture/farm-management/cost-production/pubs/cop-crop-production.pdf' },
    nsForage: { name: 'Nova Scotia Department of Agriculture, Forage Establishment and Cost of Production (2011)', url: 'https://novascotia.ca/agri/documents/business-research/ForageCOPReport.pdf' },
    nsGrape: { name: 'Nova Scotia Wine Grape Cost of Production 2014 (via Perennia)', url: 'https://www.perennia.ca/wp-content/uploads/2018/04/ns-wine-grape-cost-of-production-and-cash-flow-analysis.pdf' },
};

/** low/high = total cost per acre in a normal production year (includes land, machinery and owner labour). */
export const COST_PER_ACRE = {
    potatoes: { low: 4927, high: 4927, operating: 3533, source: 'mbPotato', note: 'Large irrigated processing farm in Manitoba; small Nova Scotia table-potato plots differ.' },
    strawberries: { low: 12972, high: 12972, operating: 7541, setup: 10806, source: 'mbStrawberry', note: 'Picking years. The planting year costs about $10,806 per acre with no harvest.' },
    cereals: { low: 509, high: 509, operating: 289, source: 'mbCrops', note: 'Barley in Manitoba, 2026 prices.' },
    forage: { low: 282, high: 282, setup: 492, source: 'nsForage', note: 'Nova Scotia hay, production year, 2011 prices (costs have risen since). Seeding year costs about $492 per acre.' },
    grapes: { low: 7003, high: 7970, setup: 34315, source: 'nsGrape', note: 'Nova Scotia vineyard, typical production year, 2014. Setting up takes 4 years and about $34,000–$38,000 per acre.' },
};

/**
 * Income, cost and profit for `acres` of a crop. Profit is only given when both
 * income and cost come from published sources; otherwise it says what is missing.
 */
export function profitEstimate(cropId, acres) {
    const income = incomeEstimate(cropId, acres);
    const c = COST_PER_ACRE[cropId];
    const cost = c ? {
        low: roundNice(c.low * acres),
        high: roundNice(c.high * acres),
        text: c.low === c.high ? money(roundNice(c.low * acres)) : `${money(roundNice(c.low * acres))}–${money(roundNice(c.high * acres))}`,
        perAcreText: c.low === c.high ? `${money(c.low)} per acre` : `${money(c.low)}–${money(c.high)} per acre`,
        note: c.note,
        source: COST_SOURCES[c.source],
    } : null;
    let profit = null;
    if (income && !income.yieldOnly && cost) {
        // Work from unrounded per-acre figures so small plots don't round to $0.
        const r = (n) => Math.sign(n) * roundNice(Math.abs(n));
        const fmt = (n) => (n < 0 ? `−${money(-r(n))}` : money(r(n)));
        const lowFor = (perAcre) => (perAcre - c.high) * acres, highFor = (perAcre) => (perAcre - c.low) * acres;
        const range = (perAcre) => (c.low === c.high ? fmt(lowFor(perAcre)) : `${fmt(lowFor(perAcre))} to ${fmt(highFor(perAcre))}`);
        const low = r(lowFor(income.perAcreLow)), high = r(highFor(income.perAcreHigh));
        const lp = income.latest.perAcre;
        profit = {
            low, high, text: `${fmt(low)} to ${fmt(high)}`,
            latest: { year: income.latest.year, low: r(lowFor(lp)), high: r(highFor(lp)), text: range(lp) },
            history: income.history.map((h) => (h.suppressed ? h : { year: h.year, value: r(lowFor(h.perAcre)), text: range(h.perAcre) })),
        };
    }
    return { income, cost, profit };
}
