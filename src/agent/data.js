// Real-data tools for the AgriGenesis agent.
// Every function calls a free public data service (no keys) and returns
// { data, summary, source: { name, url }, caveat }. Nothing here is simulated:
// if a service has no data for the spot, the function says so instead of guessing.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Fetch JSON, retrying once on a network error, timeout or server error (public services blip). */
async function getJSON(url, opts = {}) {
    if (opts.retry === false) return getJSONOnce(url, opts);
    try {
        return await getJSONOnce(url, opts);
    } catch (err) {
        if (/\b4\d\d\b/.test(err.message)) throw err; // bad request: retrying won't help
        await new Promise((r) => setTimeout(r, 1500));
        return getJSONOnce(url, opts);
    }
}

async function getJSONOnce(url, { timeoutMs = 30000, headers } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal, headers });
        if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
        return await res.json();
    } catch (err) {
        if (err.name === 'AbortError') throw new Error(`${new URL(url).host} timed out`);
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

const round = (n, d = 0) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const median = (arr) => {
    const s = arr.filter((v) => v != null).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (arr, p) => {
    const s = arr.filter((v) => v != null).sort((a, b) => a - b);
    if (!s.length) return null;
    return s[Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)))];
};
/** Day-of-year (1-366) → "May 18" (uses a non-leap year for display). */
export const dayLabel = (doy) => {
    if (doy == null) return '—';
    const d = new Date(Date.UTC(2025, 0, 1));
    d.setUTCDate(Math.round(doy));
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const doyOf = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
};

// ---------------------------------------------------------------------------
// Place search
// ---------------------------------------------------------------------------

/**
 * Search a street address, rural road, community or town (Photon geocoder, OpenStreetMap data),
 * biased toward Nova Scotia. Coordinates like "45.12, -64.3" also work. Returns up to 6 matches.
 */
export async function searchPlaces(query) {
    const q = query.trim();
    const coord = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coord) return [{ name: `${(+coord[1]).toFixed(5)}, ${(+coord[2]).toFixed(5)}`, lat: +coord[1], lon: +coord[2], province: null, exact: true }];
    const data = await getJSON(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&lat=45.0&lon=-63.5`, { timeoutMs: 15000 });
    const seen = new Set();
    return (data.features || []).map((f) => {
        const p = f.properties;
        const street = [p.housenumber, p.street].filter(Boolean).join(' ');
        const name = [p.name !== street ? p.name : null, street, p.city || p.town || p.village || p.county, p.state].filter(Boolean).join(', ');
        return { name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], province: p.state || null, exact: Boolean(p.housenumber), country: p.countrycode };
    }).filter((r) => r.country === 'CA' && !seen.has(r.name) && seen.add(r.name)).slice(0, 6);
}

/** Nearest named place + province for coordinates (BigDataCloud free client endpoint). */
export async function placeInfo(lat, lon) {
    try {
        const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { timeoutMs: 8000 });
        const province = d.principalSubdivision || null;
        return { name: [d.locality || d.city, province].filter(Boolean).join(', ') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`, province };
    } catch {
        return { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, province: null };
    }
}

export async function placeName(lat, lon) {
    return (await placeInfo(lat, lon)).name;
}

// ---------------------------------------------------------------------------
// 1. Climate history: frost dates, growing season length, heat units
// ---------------------------------------------------------------------------

export async function getClimateHistory(lat, lon) {
    const lastYear = new Date().getFullYear() - 1;
    const firstYear = lastYear - 9; // 10 full years
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
        `&start_date=${firstYear}-01-01&end_date=${lastYear}-12-31` +
        `&daily=temperature_2m_min,temperature_2m_mean,precipitation_sum&timezone=auto`;
    const json = await getJSON(url, { timeoutMs: 45000 });
    const { time, temperature_2m_min: tmin, temperature_2m_mean: tmean, precipitation_sum: rain } = json.daily;

    const years = {};
    time.forEach((iso, i) => {
        const y = iso.slice(0, 4);
        (years[y] ||= []).push({ doy: doyOf(iso), month: +iso.slice(5, 7), tmin: tmin[i], tmean: tmean[i], rain: rain[i] });
    });

    const perYear = Object.entries(years).map(([year, days]) => {
        const MID = 196; // ~July 15 splits spring and fall frosts
        const springFrosts = days.filter((d) => d.doy < MID && d.tmin != null && d.tmin <= 0);
        const fallFrosts = days.filter((d) => d.doy >= MID && d.tmin != null && d.tmin <= 0);
        const lastSpring = springFrosts.length ? springFrosts[springFrosts.length - 1].doy : null;
        const firstFall = fallFrosts.length ? fallFrosts[0].doy : null;
        const gdd = (base) => days.filter((d) => d.month >= 4 && d.month <= 10 && d.tmean != null)
            .reduce((s, d) => s + Math.max(0, d.tmean - base), 0);
        return {
            year: +year,
            lastSpring,
            firstFall,
            frostFreeDays: lastSpring != null && firstFall != null ? firstFall - lastSpring - 1 : null,
            gdd5: gdd(5),
            gdd10: gdd(10),
            seasonRain: days.filter((d) => d.month >= 5 && d.month <= 9).reduce((s, d) => s + (d.rain || 0), 0),
            winterLow: Math.min(...days.map((d) => d.tmin).filter((v) => v != null)),
        };
    });

    const data = {
        years: `${firstYear}–${lastYear}`,
        lastSpringFrost: dayLabel(median(perYear.map((y) => y.lastSpring))),
        lastSpringFrostLate: dayLabel(percentile(perYear.map((y) => y.lastSpring), 90)),
        firstFallFrost: dayLabel(median(perYear.map((y) => y.firstFall))),
        firstFallFrostEarly: dayLabel(percentile(perYear.map((y) => y.firstFall), 10)),
        frostFreeDays: round(median(perYear.map((y) => y.frostFreeDays))),
        frostFreeDaysShortest: round(Math.min(...perYear.map((y) => y.frostFreeDays).filter((v) => v != null))),
        gdd5: round(median(perYear.map((y) => y.gdd5))),
        gdd10: round(median(perYear.map((y) => y.gdd10))),
        seasonRainMm: round(median(perYear.map((y) => y.seasonRain))),
        winterLowC: round(median(perYear.map((y) => y.winterLow)), 1),
        perYear: perYear.map((y) => ({ ...y, lastSpring: dayLabel(y.lastSpring), firstFall: dayLabel(y.firstFall), gdd5: round(y.gdd5), gdd10: round(y.gdd10), seasonRain: round(y.seasonRain), winterLow: round(y.winterLow, 1) })),
    };

    return {
        data,
        summary: `Weather-model estimate for ${data.years}: the last spring frost was usually around ${data.lastSpringFrost} (1 year in 10 as late as ${data.lastSpringFrostLate}) and the first fall frost around ${data.firstFallFrost}. That gives about ${data.frostFreeDays} frost-free days, ${data.gdd5} growing degree days (base 5 °C) and ${data.seasonRainMm} mm of rain from May to September.`,
        source: { name: 'Open-Meteo Historical Weather (ERA5 reanalysis), 10 years of daily data', url: 'https://open-meteo.com/en/docs/historical-weather-api' },
        caveat: 'Regional weather model (about 9–25 km grid). In Nova Scotia it tends to miss cold nights, so it shows frost-free seasons that are too long. Use official station records for frost dates.',
    };
}

// ---------------------------------------------------------------------------
// 1b. Official climate normals from the nearest Environment Canada station
// ---------------------------------------------------------------------------

const ECCC = 'https://api.weather.gc.ca/collections/climate-normals/items?f=json';
const km = (aLat, aLon, bLat, bLon) => {
    const r = Math.PI / 180;
    const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
    const y = (bLat - aLat) * r;
    return Math.sqrt(x * x + y * y) * 6371;
};

export async function getStationNormals(lat, lon) {
    const bbox = [lon - 1.5, lat - 1, lon + 1.5, lat + 1].map((v) => v.toFixed(3)).join(',');
    // NORMAL_ID 21 = 'Mean length frost-free period in days' (text filters are fuzzy, ids are exact)
    const stations = await getJSON(`${ECCC}&NORMAL_ID=21&MONTH=13&bbox=${bbox}&limit=200&properties=STATION_NAME,CLIMATE_IDENTIFIER,VALUE`, { timeoutMs: 45000 });
    const source = { name: 'Environment and Climate Change Canada, Canadian Climate Normals 1981–2010', url: 'https://climate.weather.gc.ca/climate_normals/index_e.html' };
    const nearest = (stations.features || [])
        .map((f) => ({ name: f.properties.STATION_NAME, id: f.properties.CLIMATE_IDENTIFIER, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }))
        .map((s) => ({ ...s, distanceKm: round(km(lat, lon, s.lat, s.lon)) }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];
    if (!nearest) {
        return { data: { available: false }, summary: 'No Environment Canada station with frost records within about 100 km.', source, caveat: 'No data.' };
    }
    const all = await getJSON(`${ECCC}&CLIMATE_IDENTIFIER=${nearest.id}&MONTH=13&limit=300&properties=E_NORMAL_ELEMENT_NAME,VALUE,CLIMATE_IDENTIFIER`, { timeoutMs: 45000 });
    const v = Object.fromEntries((all.features || []).filter((f) => f.properties.CLIMATE_IDENTIFIER === nearest.id).map((f) => [f.properties.E_NORMAL_ELEMENT_NAME, f.properties.VALUE]));
    const data = {
        available: true,
        station: nearest.name.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase()).replace(/ Cda\b/, ' CDA').replace(/ A$/, ' Airport'),
        distanceKm: nearest.distanceKm,
        period: '1981–2010',
        lastSpringFrost: dayLabel(v['Mean date last frost in spring']),
        firstFallFrost: dayLabel(v['Mean date first frost in fall']),
        frostFreeDays: round(v['Mean length frost-free period in days']),
        gdd5: round(v['Total degree-days Above 5 deg C']),
        gdd10: round(v['Total degree-days Above 10 deg C']),
        yearlyRainMm: round(v['Total rainfall mm']),
        yearlyPrecipMm: round(v['Total precipitation mm']),
    };
    return {
        data,
        summary: `Official records from ${data.station} station (${data.distanceKm} km away, ${data.period}): last spring frost on average ${data.lastSpringFrost}, first fall frost ${data.firstFallFrost}, ${data.frostFreeDays} frost-free days${data.gdd5 ? `, ${data.gdd5} growing degree days above 5 °C` : ''}.`,
        source,
        caveat: data.distanceKm > 40
            ? `The station is ${data.distanceKm} km away, so local conditions may differ. Averages are from 1981–2010; recent seasons have tended to be a little longer.`
            : 'Averages are from 1981–2010; recent seasons have tended to be a little longer. Low spots can still get later frosts.',
    };
}

// ---------------------------------------------------------------------------
// 2. Soil: pH, texture, organic carbon (ISRIC SoilGrids 2.0, 250 m)
// ---------------------------------------------------------------------------

/** USDA texture class from sand/silt/clay percentages. */
export function textureClass(sand, silt, clay) {
    if (sand == null || clay == null) return null;
    if (clay >= 40) return silt >= 40 ? 'silty clay' : sand > 45 ? 'sandy clay' : 'clay';
    if (clay >= 27) return sand > 45 ? 'sandy clay loam' : silt >= 40 ? 'silty clay loam' : 'clay loam';
    if (clay >= 20 && sand > 45) return 'sandy clay loam';
    if (silt >= 80 && clay < 12) return 'silt';
    if (silt >= 50) return 'silt loam';
    if (sand >= 85) return 'sand';
    if (sand >= 70) return 'loamy sand';
    if (sand >= 52 || (clay < 7 && silt < 50)) return 'sandy loam';
    return 'loam';
}

async function soilAt(lat, lon) {
    const props = ['phh2o', 'soc', 'clay', 'sand', 'silt', 'cec'];
    const depths = ['0-5cm', '5-15cm', '15-30cm'];
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}` +
        props.map((p) => `&property=${p}`).join('') + depths.map((d) => `&depth=${d}`).join('') + '&value=mean';
    const json = await getJSON(url, { timeoutMs: 15000, retry: false });
    const weights = { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 };
    const out = {};
    for (const layer of json.properties?.layers || []) {
        let sum = 0, w = 0;
        for (const d of layer.depths) {
            const v = d.values?.mean;
            if (v != null) { sum += v * weights[d.label]; w += weights[d.label]; }
        }
        out[layer.name] = w ? sum / w / (layer.unit_measure?.d_factor || 1) : null;
    }
    return out;
}

// Agriculture and Agri-Food Canada, Soil Landscape Grids of Canada (100 m, trained on Canadian soil pits).
const AAFC_SOIL = 'https://agriculture.canada.ca/imagery-images/rest/services/soil_landscape_grids_100m';
const AAFC_VARS = { phcacl2: 'pHCACL2', sand: 'Sand', clay: 'Clay', silt: 'Silt', soil_organic_carbon: 'Soil Organic Carbon' };

async function aafcSoilAt(lat, lon) {
    const x = (lon * 20037508.34) / 180;
    const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) * 20037508.34) / Math.PI;
    const geometry = encodeURIComponent(JSON.stringify({ x, y, spatialReference: { wkid: 3857 } }));
    const depths = { '-5': 5, '-15': 10, '-30': 15 }; // 0-5, 5-15, 15-30 cm, weighted by thickness
    const one = async (svc, variable, depth) => {
        const rule = encodeURIComponent(JSON.stringify({ mosaicMethod: 'esriMosaicNone', multidimensionalDefinition: [{ variableName: variable, dimensionName: 'Depth', values: [Number(depth)] }] }));
        const j = await getJSON(`${AAFC_SOIL}/${svc}/ImageServer/identify?geometry=${geometry}&geometryType=esriGeometryPoint&mosaicRule=${rule}&returnGeometry=false&returnCatalogItems=false&f=json`, { timeoutMs: 15000, retry: false });
        const v = parseFloat(j.value);
        return Number.isFinite(v) ? v : null;
    };
    const out = {};
    await Promise.all(Object.entries(AAFC_VARS).map(async ([svc, variable]) => {
        const vals = await Promise.all(Object.keys(depths).map((d) => one(svc, variable, d).catch(() => null)));
        let sum = 0, w = 0;
        Object.values(depths).forEach((wt, i) => { if (vals[i] != null) { sum += vals[i] * wt; w += wt; } });
        out[svc] = w ? sum / w : null;
    }));
    return out.phcacl2 != null && out.clay != null && out.sand != null ? out : null;
}

const SOIL_OFFSETS = [[0, 0], [0.003, 0], [-0.003, 0], [0, 0.004], [0, -0.004]];
const drainage = (clay, sand) => (clay >= 35 ? 'heavy soil, likely slow drainage' : sand >= 70 ? 'sandy, drains fast and dries out' : 'moderate drainage likely');

export async function getSoil(lat, lon) {
    const tried = [];
    // 1) Canada's own soil map first
    try {
        for (const [dy, dx] of SOIL_OFFSETS) {
            const r = await aafcSoilAt(lat + dy, lon + dx);
            if (r) {
                const sand = round(r.sand, 0), clay = round(r.clay, 0);
                const silt = r.silt != null ? round(r.silt, 0) : Math.max(0, 100 - sand - clay);
                const pHCaCl2 = round(r.phcacl2, 1);
                // pH measured in CaCl2 reads lower than the usual water pH; +0.6 is a common rule of thumb
                const pH = round(r.phcacl2 + 0.6, 1);
                const data = {
                    available: true, pH, pHCaCl2, sandPct: sand, siltPct: silt, clayPct: clay,
                    texture: textureClass(sand, silt, clay),
                    organicCarbonGkg: r.soil_organic_carbon != null ? round(r.soil_organic_carbon * 10, 0) : null,
                    cec: null,
                    depth: 'top 30 cm (weighted average)',
                    nearbyPoint: dy || dx ? 'Nearest point with data, within ~500 m' : null,
                    drainageHint: drainage(clay, sand),
                    provider: 'aafc',
                };
                return {
                    data,
                    summary: `Estimated topsoil (Agriculture Canada soil map): ${data.texture}, pH about ${pH} (${pHCaCl2} measured the CaCl₂ way), ${clay}% clay, ${sand}% sand${data.organicCarbonGkg != null ? `, organic carbon ${data.organicCarbonGkg} g/kg` : ''} (${data.drainageHint}).`,
                    source: { name: 'Agriculture and Agri-Food Canada, Soil Landscape Grids of Canada (100 m)', url: 'https://agriculture.canada.ca/imagery-images/rest/services/soil_landscape_grids_100m' },
                    caveat: 'Model estimate from Canadian soil samples, not a measurement of this field. The water pH is converted from the CaCl₂ value (+0.6, a rule of thumb). Past liming or manure can change pH a lot. Confirm with a lab soil test.',
                };
            }
        }
        tried.push('Agriculture Canada soil map: no data here');
    } catch (err) {
        tried.push(`Agriculture Canada soil map: ${err.message}`);
    }

    // 2) Backup: SoilGrids global model
    const source = { name: 'ISRIC SoilGrids 2.0 (global soil model, 250 m)', url: 'https://soilgrids.org' };
    let raw = null, usedOffset = null;
    try {
        for (const [dy, dx] of SOIL_OFFSETS) { // SoilGrids allows ~5 calls/min
            const r = await soilAt(round(lat + dy, 5), round(lon + dx, 5));
            if (r.phh2o != null && r.clay != null) { raw = r; usedOffset = [dy, dx]; break; }
        }
        if (!raw) tried.push('SoilGrids: no data here');
    } catch (err) {
        tried.push(`SoilGrids: ${err.message}`);
    }
    if (!raw) {
        return {
            data: { available: false, tried },
            summary: `No soil estimate is available for this spot (${tried.join('; ')}). A lab soil test is needed.`,
            source,
            caveat: 'No data. Do not assume a soil type.',
        };
    }
    const sand = round(raw.sand, 0), silt = round(raw.silt, 0), clay = round(raw.clay, 0);
    const data = {
        available: true,
        pH: round(raw.phh2o, 1),
        sandPct: sand,
        siltPct: silt,
        clayPct: clay,
        texture: textureClass(sand, silt, clay),
        organicCarbonGkg: round(raw.soc, 0),
        cec: round(raw.cec, 0),
        depth: 'top 30 cm (weighted average)',
        nearbyPoint: usedOffset && (usedOffset[0] || usedOffset[1]) ? 'Nearest point with data, within ~500 m' : null,
        drainageHint: drainage(clay, sand),
        provider: 'soilgrids',
    };
    return {
        data,
        summary: `Estimated topsoil (global model; the Canadian soil map had no reading): ${data.texture}, pH ${data.pH}, ${clay}% clay, ${sand}% sand, organic carbon ${data.organicCarbonGkg} g/kg (${data.drainageHint}).`,
        source,
        caveat: 'Model estimate from regional data, not a measurement of this field. Past liming or manure can change pH a lot. Confirm with a lab soil test before buying lime or fertilizer.',
    };
}

// ---------------------------------------------------------------------------
// 3. Terrain: elevation, slope and which way the land faces
// ---------------------------------------------------------------------------

export async function getTerrain(lat, lon, boundary = []) {
    const step = 90; // metres between samples (matches the 90 m elevation model)
    const dLat = step / 111320;
    const dLon = step / (111320 * Math.cos((lat * Math.PI) / 180));
    const pts = [
        [lat, lon], [lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon],
        ...boundary.slice(0, 40).map((p) => [p.lat, p.lon]),
    ];
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(5)).join(',')}&longitude=${pts.map((p) => p[1].toFixed(5)).join(',')}`;
    const { elevation: e } = await getJSON(url);
    const dzdy = (e[1] - e[2]) / (2 * step); // + means rising to the north
    const dzdx = (e[3] - e[4]) / (2 * step); // + means rising to the east
    const slopePct = round(Math.sqrt(dzdx ** 2 + dzdy ** 2) * 100, 1);
    // Land faces downhill: opposite of the uphill gradient
    const faceDeg = (Math.atan2(-dzdx, -dzdy) * 180) / Math.PI;
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const faces = slopePct < 1 ? 'flat' : dirs[Math.round(((faceDeg + 360) % 360) / 45) % 8];
    const all = e.filter((v) => v != null);
    const data = {
        elevationM: round(e[0]),
        slopePct,
        faces,
        reliefM: round(Math.max(...all) - Math.min(...all)),
        slopeClass: slopePct < 2 ? 'nearly flat' : slopePct < 5 ? 'gentle' : slopePct < 9 ? 'moderate' : slopePct < 15 ? 'strong' : 'steep',
    };
    return {
        data,
        summary: `Elevation about ${data.elevationM} m. Slope about ${slopePct}% (${data.slopeClass})${faces !== 'flat' ? `, facing ${faces}` : ''}. Height difference across the sampled area: ${data.reliefM} m.`,
        source: { name: 'Open-Meteo Elevation API (Copernicus DEM, 90 m)', url: 'https://open-meteo.com/en/docs/elevation-api' },
        caveat: 'Averaged over about 180 m, so small dips and wet spots will not show up.',
    };
}

// ---------------------------------------------------------------------------
// 4. Vegetation from satellite: NASA MODIS NDVI, 250 m, every 16 days
// ---------------------------------------------------------------------------

const MODIS = 'https://modis.ornl.gov/rst/api/v1/MOD13Q1';

export function describeNdvi(v) {
    if (v == null) return 'unknown';
    if (v < 0.1) return 'water, rock, snow or buildings';
    if (v < 0.25) return 'bare soil or very sparse plants';
    if (v < 0.5) return 'thin grass, crop stubble or mixed cover';
    if (v < 0.75) return 'grass, hay or growing crops';
    return 'lush cover: hay, crops, shrubs or forest';
}

const modisDate = (d) => `A${d.getUTCFullYear()}${String(Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1).padStart(3, '0')}`;

export async function getVegetation(lat, lon) {
    const headers = { Accept: 'application/json' };
    const now = new Date();
    const day = 86400000;
    // Most recent full summer (June–August), plus the latest ~3 months of readings
    const summerYear = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const windows = [
        [modisDate(new Date(Date.UTC(summerYear, 5, 1))), modisDate(new Date(Date.UTC(summerYear, 7, 31)))],
        [modisDate(new Date(now - 100 * day)), modisDate(now)],
    ];
    const fetchBand = (band, [start, end]) => getJSON(
        `${MODIS}/subset?latitude=${lat}&longitude=${lon}&band=${band}&startDate=${start}&endDate=${end}&kmAboveBelow=0&kmLeftRight=0`,
        { headers, timeoutMs: 45000 },
    ).then((j) => j.subset || []);
    const [ndviParts, relParts] = await Promise.all([
        Promise.all(windows.map((w) => fetchBand('250m_16_days_NDVI', w))),
        Promise.all(windows.map((w) => fetchBand('250m_16_days_pixel_reliability', w))),
    ]);
    const reliability = Object.fromEntries(relParts.flat().map((r) => [r.calendar_date, r.data[0]]));
    // Reliability 0 = good, 1 = marginal; 2 = snow/ice, 3 = cloudy (dropped)
    const seen = new Set();
    const series = ndviParts.flat().map((r) => ({
        date: r.calendar_date,
        ndvi: r.data[0] > -3000 ? round(r.data[0] * 0.0001, 2) : null,
        quality: reliability[r.calendar_date],
    })).filter((r) => r.ndvi != null && (r.quality === 0 || r.quality === 1) && !seen.has(r.date) && seen.add(r.date))
        .sort((a, b) => a.date.localeCompare(b.date));

    const source = { name: 'NASA MODIS MOD13Q1 NDVI (250 m, 16-day), via ORNL DAAC', url: 'https://modis.ornl.gov/sites/?id=&subset=MOD13Q1' };
    if (!series.length) {
        return { data: { available: false, series: [] }, summary: 'No clear satellite readings in the last year (cloud or snow).', source, caveat: 'No data.' };
    }
    const summer = series.filter((r) => ['06', '07', '08'].includes(r.date.slice(5, 7)));
    const peak = summer.length ? summer.reduce((a, b) => (b.ndvi > a.ndvi ? b : a)) : null;
    const latest = series[series.length - 1];
    const data = {
        available: true,
        latest: latest.ndvi,
        latestDate: latest.date,
        summerPeak: peak?.ndvi ?? null,
        summerPeakDate: peak?.date ?? null,
        summerMeaning: describeNdvi(peak?.ndvi),
        series,
    };
    return {
        data,
        summary: `Satellite greenness (NDVI) peaked at ${data.summerPeak ?? 'n/a'} last summer (${data.summerMeaning}). Latest clear reading: ${data.latest} on ${data.latestDate}.`,
        source,
        caveat: 'Each satellite pixel covers about 6 hectares, so it can mix this land with roads, woods or neighbouring fields.',
    };
}

// ---------------------------------------------------------------------------
// 4b. What is actually on the land: AAFC Annual Crop Inventory (30 m, yearly)
// ---------------------------------------------------------------------------

const ACI = 'https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory';
const ACI_NAMES = {
    20: 'Water', 30: 'Bare land', 34: 'Buildings and roads', 35: 'Greenhouses', 50: 'Shrubland', 80: 'Wetland', 85: 'Peatland',
    110: 'Grassland', 120: 'Farmland', 122: 'Hay and pasture', 130: 'Too wet to seed', 131: 'Fallow', 132: 'Cereals', 133: 'Barley',
    136: 'Oats', 137: 'Rye', 140: 'Wheat', 145: 'Winter wheat', 146: 'Spring wheat', 147: 'Corn', 153: 'Canola', 158: 'Soybeans',
    162: 'Peas', 167: 'Beans', 175: 'Vegetables', 177: 'Potatoes', 179: 'Other vegetables', 180: 'Fruits', 181: 'Berries',
    182: 'Blueberries', 183: 'Cranberries', 185: 'Other berries', 188: 'Orchard', 190: 'Vineyard', 192: 'Sod', 194: 'Nursery',
    199: 'Other crops', 200: 'Forest', 210: 'Coniferous forest', 220: 'Broadleaf forest', 230: 'Mixed forest',
};
const aciGroup = (code) => {
    if (code === 20) return 'water';
    if (code === 34 || code === 35) return 'developed';
    if (code === 50) return 'shrubland';
    if (code === 80 || code === 85 || code === 130) return 'wetland';
    if (code === 30) return 'bare';
    if (code === 110 || (code >= 120 && code < 200)) return 'farmland';
    if (code >= 200 && code <= 230) return 'forest';
    return 'other';
};

function insidePolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
    }
    return inside;
}

/** Up to ~40 sample points spread over the field (or a small circle around the pin). */
function samplePoints(lat, lon, boundary) {
    if (boundary?.length >= 3) {
        const lats = boundary.map((p) => p.lat), lons = boundary.map((p) => p.lon);
        const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
        const pts = [];
        for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
            const p = { lat: a + ((i + 0.5) / 7) * (b - a), lon: c + ((j + 0.5) / 7) * (d - c) };
            if (insidePolygon(p, boundary)) pts.push(p);
        }
        if (pts.length >= 4) return pts;
    }
    const r = 60 / 111320;
    const pts = [{ lat, lon }];
    for (let k = 0; k < 8; k++) {
        const t = (k / 8) * 2 * Math.PI;
        pts.push({ lat: lat + r * Math.sin(t), lon: lon + (r * Math.cos(t)) / Math.cos((lat * Math.PI) / 180) });
    }
    return pts;
}

export async function getLandCover(lat, lon, boundary = []) {
    const pts = samplePoints(lat, lon, boundary);
    const geometry = encodeURIComponent(JSON.stringify({ points: pts.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)]), spatialReference: { wkid: 4326 } }));
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 1, thisYear - 2, thisYear - 3];
    const results = await Promise.all(years.map((y) =>
        getJSON(`${ACI}/${y}/ImageServer/getSamples?geometry=${geometry}&geometryType=esriGeometryMultipoint&returnFirstValueOnly=true&f=json`, { timeoutMs: 30000 })
            .then((j) => ({ year: y, codes: (j.samples || []).map((s) => Number(s.value)).filter((v) => v && v !== 10) }))
            .catch(() => ({ year: y, codes: [] }))));
    const source = { name: 'Agriculture and Agri-Food Canada, Annual Crop Inventory (30 m satellite land-use map)', url: 'https://open.canada.ca/data/en/dataset/ba2645d5-4458-414d-b196-6303ac06c1c9' };
    const perYear = results.filter((r) => r.codes.length).map(({ year, codes }) => {
        const count = {};
        codes.forEach((c) => { count[c] = (count[c] || 0) + 1; });
        const classes = Object.entries(count).map(([code, n]) => ({ code: +code, name: ACI_NAMES[code] || `Class ${code}`, group: aciGroup(+code), pct: Math.round((n / codes.length) * 100) }))
            .sort((x, y) => y.pct - x.pct);
        const groups = {};
        classes.forEach((c) => { groups[c.group] = (groups[c.group] || 0) + c.pct; });
        return { year, classes, groups };
    });
    if (!perYear.length) {
        return { data: { available: false }, summary: 'The national land-use map has no readings for this spot.', source, caveat: 'No data.' };
    }
    const latest = perYear[0];
    const g = latest.groups;
    const describe = (y) => y.classes.slice(0, 3).map((c) => `${c.name} ${c.pct}%`).join(', ');
    const data = {
        available: true,
        latestYear: latest.year,
        main: latest.classes[0].name,
        farmlandPct: g.farmland || 0,
        forestPct: g.forest || 0,
        wetlandPct: g.wetland || 0,
        developedPct: g.developed || 0,
        waterPct: g.water || 0,
        shrubPct: g.shrubland || 0,
        history: perYear.map((y) => ({ year: y.year, text: describe(y), classes: y.classes.slice(0, 4) })),
        samplePoints: pts.length,
    };
    return {
        data,
        summary: `National land-use map, ${latest.year}: ${describe(latest)}. ` +
            perYear.slice(1).map((y) => `${y.year}: ${describe(y)}.`).join(' '),
        source,
        caveat: `Based on ${pts.length} points across the land, mapped from satellite at 30 m. Field edges, hedgerows and small patches can be misclassified.`,
    };
}

// ---------------------------------------------------------------------------
// 5. Next 14 days of weather
// ---------------------------------------------------------------------------

export async function getForecast(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=14`;
    const json = await getJSON(url);
    const d = json.daily;
    const days = d.time.map((date, i) => ({
        date,
        max: d.temperature_2m_max[i],
        min: d.temperature_2m_min[i],
        rainMm: d.precipitation_sum[i],
        rainChance: d.precipitation_probability_max[i],
        windKmh: d.wind_speed_10m_max[i],
    }));
    const frostNights = days.filter((x) => x.min <= 0).length;
    const data = {
        days,
        frostNights,
        totalRainMm: round(days.reduce((s, x) => s + (x.rainMm || 0), 0)),
        warmest: round(Math.max(...days.map((x) => x.max)), 1),
        coldest: round(Math.min(...days.map((x) => x.min)), 1),
    };
    return {
        data,
        summary: `Next 14 days: ${data.coldest} °C to ${data.warmest} °C, ${frostNights} frost night(s), about ${data.totalRainMm} mm of rain.`,
        source: { name: 'Open-Meteo Forecast API', url: 'https://open-meteo.com/en/docs' },
        caveat: 'Forecasts beyond 7 days are less reliable.',
    };
}

// ---------------------------------------------------------------------------
// Boundary helpers
// ---------------------------------------------------------------------------

/** Area of a lat/lon polygon in hectares (spherical excess formula). */
export function polygonHectares(points) {
    if (!points || points.length < 3) return 0;
    const R = 6378137;
    const rad = Math.PI / 180;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        sum += (b.lon - a.lon) * rad * (2 + Math.sin(a.lat * rad) + Math.sin(b.lat * rad));
    }
    return Math.abs((sum * R * R) / 2) / 10000;
}

export function polygonCentre(points) {
    const n = points.length;
    return { lat: points.reduce((s, p) => s + p.lat, 0) / n, lon: points.reduce((s, p) => s + p.lon, 0) / n };
}

export const HA_TO_ACRES = 2.47105;

// ---------------------------------------------------------------------------
// Property parcels: Nova Scotia Property Records Database (NSPRD), Service Nova Scotia.
// Free to view under the province's Restricted Geographic Services License; boundaries
// come from the land registry, are not surveyed and are approximate.
// ---------------------------------------------------------------------------
const NSPRD = 'https://nsgiwa2.novascotia.ca/arcgis/rest/services/PLAN/PLAN_NSPRD_WM84/MapServer/0/query';
export const NSPRD_LICENSE = 'https://nsgiwa.novascotia.ca/documents/licenses/MapService/Restricted%20Map%20Services%20License%20-%20NSPRD%20v1.pdf';
export const NSPRD_ATTRIBUTION = 'Contains information obtained under license from the Province of Nova Scotia which is provided without warranty or liability for errors or omissions.';
export const NSPRD_DISCLAIMER = 'The Province of Nova Scotia makes no representations, expressed or implied, as to the accuracy, completeness and timeliness of the information, maps and other data, including PID numbers or property boundaries, which are displayed in this map that is presented in this application. The map is provided on the understanding that it is not guaranteed to be correct or complete or current, is subject to change, and conclusions drawn or decisions made, based on an interpretation of the data, are the responsibility of the user. By continuing to use this application, you agree to the terms of this disclaimer.';

function parcelFromGeojson(feature) {
    const g = feature?.geometry;
    if (!g) return null;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    if (!polys.length) return null;
    const rings = polys.map((p) => p[0].map(([lon, lat]) => ({ lat, lon })));
    // keep the biggest piece; drop the repeated closing point
    let ring = rings.sort((a, b) => polygonHectares(b) - polygonHectares(a))[0];
    if (ring.length > 1 && ring[0].lat === ring.at(-1).lat && ring[0].lon === ring.at(-1).lon) ring = ring.slice(0, -1);
    if (ring.length < 3) return null;
    return { pid: feature.properties?.PID, updated: feature.properties?.UPDAT_DATE, boundary: ring, pieces: rings.length };
}

async function nsprdQuery(params) {
    const qs = new URLSearchParams({ outFields: 'PID,UPDAT_DATE', outSR: '4326', returnGeometry: 'true', f: 'geojson', ...params });
    const res = await fetch(`${NSPRD}?${qs}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Property map service error ${res.status}`);
    const d = await res.json();
    if (d.error) throw new Error(d.error.message || 'Property map service error');
    return d.features || [];
}

/** Property boundary for an 8-digit Nova Scotia PID, or null if there is no such parcel. */
export async function parcelByPid(pid) {
    const clean = String(pid).replace(/\D/g, '');
    if (clean.length !== 8) throw new Error('A Nova Scotia PID has 8 digits.');
    const f = await nsprdQuery({ where: `PID='${clean}'` });
    return f.length ? parcelFromGeojson(f[0]) : null;
}
