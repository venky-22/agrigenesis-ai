import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import { Play, Pause } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { polygonHectares } from '../agent/data';
import { cropById, SEASON, stageFor } from '../agent/crops';

const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ACRE_HA = 0.404686;

// ---- geometry: split the field into strips of the right size -------------

/** Keep the part of a polygon between two latitudes (Sutherland–Hodgman). */
function clipLat(poly, lo, hi) {
    const clip = (pts, inside, cut) => {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const ia = inside(a), ib = inside(b);
            if (ia) out.push(a);
            if (ia !== ib) {
                const t = (cut - a.lat) / (b.lat - a.lat);
                out.push({ lat: cut, lon: a.lon + t * (b.lon - a.lon) });
            }
        }
        return out;
    };
    return clip(clip(poly, (p) => p.lat >= lo, lo), (p) => p.lat <= hi, hi);
}

/** A square of the given area around a point, for farmers who typed a size instead of outlining. */
function squareAround(lat, lon, hectares) {
    const side = Math.sqrt(hectares * 10000) / 2;
    const dLat = side / 111320, dLon = side / (111320 * Math.cos((lat * Math.PI) / 180));
    return [{ lat: lat - dLat, lon: lon - dLon }, { lat: lat - dLat, lon: lon + dLon }, { lat: lat + dLat, lon: lon + dLon }, { lat: lat + dLat, lon: lon - dLon }];
}

/** Cut the field into strips from south to north, one per crop, each with its real area. */
function layoutPlots(field, picks) {
    const lats = field.map((p) => p.lat);
    let cur = Math.min(...lats);
    const top = Math.max(...lats);
    const plots = [];
    for (const pick of picks) {
        const target = pick.acres * ACRE_HA;
        let lo = cur, hi = top;
        for (let i = 0; i < 40; i++) {
            const mid = (lo + hi) / 2;
            if (polygonHectares(clipLat(field, cur, mid)) < target) lo = mid; else hi = mid;
        }
        const shape = clipLat(field, cur, hi);
        if (shape.length >= 3) plots.push({ ...pick, shape });
        cur = hi;
        if (cur >= top) break;
    }
    const rest = cur < top ? clipLat(field, cur, top) : [];
    return { plots, rest: rest.length >= 3 ? rest : null };
}

function Fit({ shapes }) {
    const map = useMap();
    useEffect(() => {
        const pts = shapes.flat().map((p) => [p.lat, p.lon]);
        if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 19 });
    }, [shapes, map]);
    return null;
}

const STAGE_STYLE = {
    bare: { fillColor: '#8b5a2b', fillOpacity: 0.75 },
    planting: { fillColor: '#a16207', fillOpacity: 0.8 },
    growing: { fillOpacity: 0.75 },
    harvest: { fillColor: '#fbbf24', fillOpacity: 0.85 },
    dormant: { fillColor: '#f1f5f9', fillOpacity: 0.85 },
};

/**
 * Animated preview of the planned farm: the farmer's own field on satellite imagery,
 * split into plots at real scale, changing month by month.
 */
export default function FarmPreview({ farm, picks }) {
    const startMonth = new Date().getMonth() + 1;
    const [offset, setOffset] = useState(0);
    const [playing, setPlaying] = useState(true);
    const month = ((startMonth - 1 + offset) % 12) + 1;
    const winter = month === 12 || month <= 3;

    const field = useMemo(() => (farm.boundary?.length >= 3 ? farm.boundary : squareAround(farm.lat, farm.lon, farm.hectares || 0.4)), [farm]);
    const { plots, rest } = useMemo(() => layoutPlots(field, picks), [field, picks]);

    useEffect(() => {
        if (!playing) return undefined;
        const t = setInterval(() => setOffset((o) => (o + 1) % 12), 1400);
        return () => clearInterval(t);
    }, [playing]);

    return (
        <div className="space-y-4">
            <div className="relative">
                <MapContainer center={[farm.lat, farm.lon]} zoom={16} zoomControl={false} scrollWheelZoom={false} dragging={false} doubleClickZoom={false}
                    className="h-[380px] w-full rounded-2xl border border-white/10 z-0">
                    <TileLayer url={IMAGERY} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxZoom={19} maxNativeZoom={17} />
                    <Fit shapes={plots.length ? plots.map((p) => p.shape) : [field]} />
                    {rest && (
                        <Polygon positions={rest.map((p) => [p.lat, p.lon])}
                            pathOptions={{ color: '#ffffff', weight: 1, dashArray: '4 4', fillColor: winter ? '#f1f5f9' : '#000000', fillOpacity: winter ? 0.6 : 0.15 }}>
                            <Tooltip sticky>Rest of your land: kept as it is for now</Tooltip>
                        </Polygon>
                    )}
                    {plots.map((p) => {
                        const st = stageFor(p.crop_id, month);
                        const crop = cropById(p.crop_id);
                        return (
                            <Polygon key={p.crop_id} positions={p.shape.map((x) => [x.lat, x.lon])}
                                pathOptions={{ color: SEASON[p.crop_id]?.colour || '#22c55e', weight: 3, fillColor: SEASON[p.crop_id]?.colour, ...STAGE_STYLE[st.stage] }}>
                                <Tooltip permanent direction="right" offset={[10, 0]} className="!bg-black/70 !text-white !border-0 !shadow-none">
                                    {crop.emoji} {crop.name}
                                </Tooltip>
                            </Polygon>
                        );
                    })}
                </MapContainer>
                <div className="absolute top-3 left-3 z-[500] rounded-xl bg-black/75 px-4 py-2">
                    <p className="text-2xl font-bold">{MONTHS[month - 1]}</p>
                    <p className="text-xs text-muted-foreground">{winter ? 'Winter' : month <= 5 ? 'Spring' : month <= 8 ? 'Summer' : 'Fall'}</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'} className="p-3 rounded-full bg-green-600 hover:bg-green-500">
                    {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <input type="range" min="0" max="11" value={offset} aria-label="Month"
                    onChange={(e) => { setPlaying(false); setOffset(+e.target.value); }} className="flex-1 accent-green-500" />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {plots.map((p) => (
                    <span key={p.crop_id} className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm" style={{ background: SEASON[p.crop_id]?.colour }} />
                        {cropById(p.crop_id).name}: {p.acres} acre · <i className="text-muted-foreground">{stageFor(p.crop_id, month).label}</i>
                    </span>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
                Plot sizes are to scale on your own field. Where each plot sits is only a suggestion. Colours: brown = bare soil, gold = harvest, white = winter.
            </p>
        </div>
    );
}
