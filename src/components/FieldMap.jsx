import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Satellite imagery with place labels on top, so farmers can recognise their land
const IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

// Below this zoom a click could land hundreds of metres off, so it zooms in instead of marking a corner
const MIN_MARK_ZOOM = 14;

function ClickToAdd({ onAdd }) {
    const map = useMapEvents({
        click: (e) => {
            if (map.getZoom() < MIN_MARK_ZOOM) map.flyTo(e.latlng, 16, { duration: 0.8 });
            else onAdd({ lat: e.latlng.lat, lon: e.latlng.lng });
        },
    });
    return null;
}

function FlyTo({ target }) {
    const map = useMap();
    useEffect(() => {
        if (target?.bounds) map.flyToBounds(target.bounds, { padding: [30, 30], maxZoom: 18, duration: 1.2 });
        else if (target) map.flyTo([target.lat, target.lon], target.zoom || 16, { duration: 1.2 });
    }, [target, map]);
    return null;
}

function FitOnce({ positions }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length >= 2) map.fitBounds(positions, { padding: [30, 30], maxZoom: 18 });
        else if (positions.length === 1) map.setView(positions[0], 16);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

/**
 * Satellite map. Each click adds a corner of the field outline.
 * With readOnly it just shows the outline (and any photo spots) and fits the view to it.
 * @param {{points: {lat,lon}[], onChange?: (pts) => void, flyTo?: {lat,lon,zoom,bounds}, readOnly?: boolean, markers?: {lat,lon,label}[], className?: string}} props
 */
export default function FieldMap({ points, onChange, flyTo, readOnly = false, markers = [], className = 'h-[420px]', showCorners = true, fitTo }) {
    const positions = points.map((p) => [p.lat, p.lon]);
    return (
        <MapContainer
            center={positions[0] || [45.2, -63.4]}
            zoom={positions.length ? 16 : 7}
            scrollWheelZoom={!readOnly}
            className={`${className} w-full rounded-2xl border border-white/10 z-0 ${readOnly ? '' : 'cursor-crosshair'}`}
        >
            <TileLayer url={IMAGERY} attribution="Imagery © Esri, Maxar, Earthstar Geographics" maxZoom={19} maxNativeZoom={17} />
            <TileLayer url={LABELS} attribution="Labels © Esri" maxZoom={19} maxNativeZoom={17} />
            {!readOnly && <ClickToAdd onAdd={(p) => onChange([...points, p])} />}
            {readOnly && <FitOnce positions={fitTo || [...positions, ...markers.map((m) => [m.lat, m.lon])]} />}
            <FlyTo target={flyTo} />
            {positions.length >= 3 && (
                <Polygon positions={positions} pathOptions={{ color: '#4ade80', weight: 3, fillOpacity: 0.25 }} />
            )}
            {positions.length === 2 && <Polyline positions={positions} pathOptions={{ color: '#4ade80', weight: 3 }} />}
            {showCorners && positions.map((pos, i) => (
                <CircleMarker key={i} center={pos} radius={readOnly ? 4 : 6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#22c55e', fillOpacity: 1 }} />
            ))}
            {markers.map((m, i) => (
                <CircleMarker key={`m${i}`} center={[m.lat, m.lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#38bdf8', fillOpacity: 1 }}>
                    {m.label && <Tooltip permanent direction="top" offset={[0, -8]}>{m.label}</Tooltip>}
                </CircleMarker>
            ))}
        </MapContainer>
    );
}
