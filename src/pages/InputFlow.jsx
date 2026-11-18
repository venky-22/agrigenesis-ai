import React, { useState } from 'react';
import { Search, LocateFixed, Undo2, Trash2, ArrowRight, Loader2, MapPin, Camera, X, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import exifr from 'exifr';
import FieldMap from '../components/FieldMap';
import { searchPlaces, placeInfo, polygonHectares, polygonCentre, HA_TO_ACRES, parcelByPid, NSPRD_LICENSE, NSPRD_ATTRIBUTION, NSPRD_DISCLAIMER } from '../agent/data';

const CHOICES = {
    goal: {
        label: 'Main goal',
        options: [
            { id: 'income', text: 'Earn income' },
            { id: 'family', text: 'Feed my household, sell the extra' },
            { id: 'mixed', text: 'A bit of both, start small' },
        ],
    },
    experience: {
        label: 'Farming experience',
        options: [
            { id: 'new', text: 'New to farming' },
            { id: 'some', text: 'Some (gardening, helped on a farm)' },
            { id: 'experienced', text: 'Experienced' },
        ],
    },
    budget: {
        label: 'Money to start',
        options: [
            { id: 'low', text: 'Under $5,000' },
            { id: 'medium', text: '$5,000–$25,000' },
            { id: 'high', text: 'Over $25,000' },
        ],
    },
    time: {
        label: 'Time you can give',
        options: [
            { id: 'weekends', text: 'Weekends' },
            { id: 'parttime', text: 'Part-time' },
            { id: 'fulltime', text: 'Full-time' },
        ],
    },
};

const MAX_PHOTOS = 3;

const Card = ({ step, title, hint, done, children }) => (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8 space-y-5">
        <div>
            <p className="text-xs font-bold uppercase tracking-widest text-green-400 flex items-center gap-2">
                Step {step} {done && <CheckCircle2 className="w-4 h-4" />}
            </p>
            <h2 className="text-2xl font-bold mt-1">{title}</h2>
            {hint && <p className="text-muted-foreground mt-1">{hint}</p>}
        </div>
        {children}
    </section>
);

const btn = 'flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10';

/** Read a photo as a data URL plus the GPS position stored by the phone camera, if any. */
async function readPhoto(file) {
    const preview = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
    let gps = null;
    try {
        const g = await exifr.gps(file);
        if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) gps = { lat: g.latitude, lon: g.longitude };
    } catch { /* no location in this photo */ }
    return { name: file.name, preview, gps, thumb: await shrink(preview) };
}

/** Small copy of a photo (max 480 px) so it can be saved with the plan and shown again later. */
function shrink(dataUrl, max = 480) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
    });
}

export default function InputFlow() {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [message, setMessage] = useState('');
    const [flyTo, setFlyTo] = useState(null);
    const [points, setPoints] = useState([]);
    const [acresTyped, setAcresTyped] = useState('');
    const [photos, setPhotos] = useState([]);
    const [notes, setNotes] = useState('');
    const [goals, setGoals] = useState({ goal: 'mixed', experience: 'new', budget: 'low', time: 'parttime' });
    const [starting, setStarting] = useState(false);
    const [outsideNS, setOutsideNS] = useState(null);
    const [pid, setPid] = useState('');
    const [pidBusy, setPidBusy] = useState(false);
    const [parcel, setParcel] = useState(null);
    const [askTerms, setAskTerms] = useState(false);
    const [agreed, setAgreed] = useState(false);

    // Map clicks after a property was loaded start the farmer's own outline instead
    const editPoints = (pts) => {
        if (parcel) { setParcel(null); setPoints(pts.slice(-1)); setMessage('Started your own outline. Click the other corners of the field you will farm.'); }
        else setPoints(pts);
    };

    async function findParcel(e, accepted = agreed) {
        e?.preventDefault();
        if (!pid.trim()) return;
        if (!accepted) return setAskTerms(true); // the province's licence requires accepting its disclaimer first
        setPidBusy(true);
        setMessage('');
        try {
            const p = await parcelByPid(pid);
            if (!p) { setMessage(`No property found with PID ${pid.replace(/\D/g, '')}. Check the 8 digits on your deed or tax notice.`); return; }
            setParcel(p);
            setPoints(p.boundary);
            setAcresTyped('');
            const lats = p.boundary.map((x) => x.lat), lons = p.boundary.map((x) => x.lon);
            setFlyTo({ bounds: [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]], t: Date.now() });
        } catch (err) {
            setMessage(err.message?.includes('8 digits') ? err.message : 'The province’s property map is not responding. Try again, or type your address instead.');
        } finally {
            setPidBusy(false);
        }
    }

    const hectares = points.length >= 3 ? polygonHectares(points) : acresTyped ? Number(acresTyped) / HA_TO_ACRES : 0;
    const centre = points.length >= 3 ? polygonCentre(points) : points[0];
    const hasLand = Boolean(centre) && (points.length >= 3 || Number(acresTyped) > 0);
    const gpsPhoto = photos.find((p) => p.gps);

    const goTo = (place, zoom = 16) => {
        setFlyTo({ lat: place.lat, lon: place.lon, zoom, t: Date.now() });
        setResults([]);
        setMessage(place.exact === false ? 'Showing the area. Zoom in and find your land on the map.' : '');
    };

    async function runSearch(e) {
        e?.preventDefault();
        if (!query.trim()) return;
        setSearching(true);
        setMessage('');
        try {
            const found = await searchPlaces(query);
            if (!found.length) setMessage('Nothing found. Try the road and community, e.g. “Highway 1, Grand Pré”, or upload a photo taken on the land.');
            else if (found.length === 1) goTo(found[0], found[0].exact ? 17 : 15);
            else setResults(found);
        } catch {
            setMessage('Address search is not responding. Try again, use “My location”, or upload a photo taken on the land.');
        } finally {
            setSearching(false);
        }
    }

    function useMyLocation() {
        if (!navigator.geolocation) return setMessage('Your browser cannot share its location.');
        navigator.geolocation.getCurrentPosition(
            (pos) => goTo({ lat: pos.coords.latitude, lon: pos.coords.longitude }, 17),
            () => setMessage('Could not get your location. Type your address instead.'),
            { timeout: 8000 },
        );
    }

    async function addPhotos(files) {
        const room = MAX_PHOTOS - photos.length;
        const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room);
        if (!picked.length) return;
        const read = await Promise.all(picked.map(readPhoto));
        setPhotos((prev) => [...prev, ...read]);
        const withGps = read.find((p) => p.gps);
        if (withGps && !centre) {
            goTo({ ...withGps.gps, exact: true }, 17);
            setMessage('Found where this photo was taken. Now outline your field around it.');
        } else if (!withGps && !centre) {
            setMessage('This photo has no location saved in it. Search your address instead.');
        }
    }

    async function start(force = false) {
        setStarting(true);
        const info = await placeInfo(centre.lat, centre.lon);
        if (!force && info.province && info.province !== 'Nova Scotia') {
            setOutsideNS(info.province);
            setStarting(false);
            return;
        }
        navigate('/farm-plan', {
            state: {
                farm: {
                    lat: +centre.lat.toFixed(5),
                    lon: +centre.lon.toFixed(5),
                    placeName: info.name,
                    province: info.province,
                    hectares,
                    boundary: points.length >= 3 ? points : [],
                    parcel: parcel ? { pid: parcel.pid, updated: parcel.updated } : null,
                    pin: points.length > 0 && points.length < 3 ? points[0] : null,
                    thumbs: photos.map((p) => p.thumb).filter(Boolean),
                    photoMeta: photos.map((p) => ({ name: p.name, gps: p.gps })),
                    goals,
                    notes: notes.trim(),
                    photos: photos.map((p) => p.preview),
                },
            },
        });
    }

    const missing = [];
    if (!centre) missing.push('find your land on the map');
    else if (!hasLand) missing.push('outline the field (3+ points) or enter its size');

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <header className="text-center space-y-3">
                <h1 className="text-4xl font-bold tracking-tight">Plan your farm</h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Show us your land and tell us what you want. The agent checks official climate records, soil, slope, satellite and
                    land-use data for that exact spot, and builds a first-year plan with income estimates in Canadian dollars.
                </p>
            </header>

            <Card step={1} title="Find your land" done={Boolean(centre)} hint="Use whichever is easiest: your address, your phone's location, or a photo taken on the land.">
                <form onSubmit={runSearch} className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Address or community, e.g. 1500 Highway 1, Grand Pré"
                        aria-label="Search for an address"
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                    />
                    <button type="submit" className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold">
                        {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Find
                    </button>
                </form>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={useMyLocation} className={btn}><LocateFixed className="w-4 h-4" /> I’m on the land now</button>
                    <label className={`${btn} cursor-pointer`}>
                        <Camera className="w-4 h-4" /> Use a photo taken on the land
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                    </label>
                </div>
                <form onSubmit={findParcel} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
                    <label htmlFor="pid" className="text-sm font-semibold flex items-center gap-2"><FileText className="w-4 h-4 text-green-400" /> Have your PID? (8-digit property number on your deed or property tax notice)</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input id="pid" inputMode="numeric" value={pid} onChange={(e) => setPid(e.target.value)} placeholder="e.g. 01249465"
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-green-500/50" />
                        <button type="submit" className={btn}>{pidBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Load my property</button>
                    </div>
                    {askTerms && !agreed && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-2">
                            <p>Property boundaries come from the Province of Nova Scotia. Please read and accept its disclaimer first:</p>
                            <p className="opacity-80 italic">“{NSPRD_DISCLAIMER}”</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => { setAgreed(true); setAskTerms(false); findParcel(null, true); }} className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 font-semibold">I agree, load my property</button>
                                <button type="button" onClick={() => setAskTerms(false)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">Cancel</button>
                            </div>
                        </div>
                    )}
                    {parcel && (
                        <p className="text-xs text-green-300">
                            Loaded property PID {parcel.pid}: about {polygonHectares(parcel.boundary).toFixed(2)} ha ({(polygonHectares(parcel.boundary) * HA_TO_ACRES).toFixed(1)} acres). This is the whole property and the boundary is approximate, not surveyed.
                            If you will farm only part of it, click on the map to draw that field instead.
                        </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">{NSPRD_ATTRIBUTION} <a href={NSPRD_LICENSE} target="_blank" rel="noreferrer" className="underline">Licence</a></p>
                </form>
                {message && <p className="text-amber-200 text-sm">{message}</p>}
                {results.length > 1 && (
                    <ul className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                        {results.map((r) => (
                            <li key={`${r.lat},${r.lon}`}>
                                <button type="button" onClick={() => goTo(r, r.exact ? 17 : 15)} className="w-full text-left px-4 py-3 hover:bg-white/5 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-green-400 shrink-0" /> {r.name}
                                    {r.province && r.province !== 'Nova Scotia' && <span className="text-xs text-amber-300 ml-auto">outside Nova Scotia</span>}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {gpsPhoto && centre && (
                    <button type="button" onClick={() => goTo({ ...gpsPhoto.gps, exact: true }, 17)} className="text-sm text-sky-300 hover:underline flex items-center gap-1">
                        <Camera className="w-4 h-4" /> Go to where “{gpsPhoto.name}” was taken
                    </button>
                )}

                <div className="rounded-2xl bg-green-500/5 border border-green-500/20 p-4 text-sm">
                    <b>Easiest way:</b> have your property tax notice handy. Find the address, click once on your land, and type the land area from the notice.
                    <span className="block mt-1 opacity-80">Want it exact? Click each corner of the field and the area is measured for you, or load your property with its PID above. If the map is zoomed out, your first click zooms in to that spot.</span>
                </div>
                <FieldMap points={points} onChange={editPoints} flyTo={flyTo} showCorners={!parcel} />
                <div className="flex flex-wrap items-center gap-3">
                    <button type="button" disabled={!points.length} onClick={() => { if (parcel) { setPoints([]); setParcel(null); } else setPoints(points.slice(0, -1)); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40">
                        <Undo2 className="w-4 h-4" /> Undo point
                    </button>
                    <button type="button" disabled={!points.length} onClick={() => { setPoints([]); setParcel(null); }} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40">
                        <Trash2 className="w-4 h-4" /> Clear
                    </button>
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                        {points.length === 0 && 'No points yet.'}
                        {points.length > 0 && points.length < 3 && `${points.length} point${points.length > 1 ? 's' : ''}. Add ${3 - points.length} more to outline, or type the size below.`}
                        {points.length >= 3 && (
                            <span className="text-green-300 font-semibold">
                                {parcel ? 'Property loaded' : 'Field outlined'}: {hectares.toFixed(2)} ha ({(hectares * HA_TO_ACRES).toFixed(1)} acres){parcel ? ` · PID ${parcel.pid}` : `, ${points.length} corners`}
                            </span>
                        )}
                    </p>
                </div>
                {points.length > 0 && points.length < 3 && (
                    <label className="flex flex-wrap items-center gap-3 text-sm">
                        Land size in acres
                        <input type="number" min="0.1" step="0.1" value={acresTyped} onChange={(e) => setAcresTyped(e.target.value)} className="w-28 bg-white/5 border border-white/10 rounded-lg px-3 py-2" />
                    </label>
                )}
            </Card>

            <Card step={2} title="Photos of the land" done={photos.length > 0} hint={`Add 1–${MAX_PHOTOS} photos of the land as it looks today. The agent compares them with the satellite and land-use data.`}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {photos.map((p, i) => (
                        <figure key={i} className="relative rounded-xl overflow-hidden border border-white/10 aspect-square">
                            <img src={p.preview} alt={`Land photo ${i + 1}`} className="w-full h-full object-cover" />
                            <figcaption className={`absolute bottom-0 inset-x-0 text-[11px] px-2 py-1 ${p.gps ? 'bg-green-900/80' : 'bg-black/70'}`}>
                                {p.gps ? '📍 location found' : 'no location saved'}
                            </figcaption>
                            <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-black">
                                <X className="w-4 h-4" />
                            </button>
                        </figure>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                        <label className="aspect-square rounded-xl border-2 border-dashed border-white/15 hover:border-green-500/50 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground cursor-pointer">
                            <Camera className="w-6 h-6" /> Add photo
                            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                        </label>
                    )}
                </div>
                <label className="flex flex-col gap-2 text-sm">
                    Anything we should know? (optional)
                    <textarea
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. used to be a hay field, wet in spring, has a well, near a farmers' market"
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-green-500/50"
                    />
                </label>
            </Card>

            <Card step={3} title="What do you want from this land?" done hint="This helps the agent pick crops that fit your life, not just the soil.">
                <div className="grid gap-5">
                    {Object.entries(CHOICES).map(([key, group]) => (
                        <fieldset key={key}>
                            <legend className="text-sm font-semibold text-muted-foreground mb-2">{group.label}</legend>
                            <div className="flex flex-wrap gap-2">
                                {group.options.map((o) => (
                                    <button
                                        key={o.id}
                                        type="button"
                                        aria-pressed={goals[key] === o.id}
                                        onClick={() => setGoals({ ...goals, [key]: o.id })}
                                        className={`px-4 py-2 rounded-full border text-sm transition-colors ${goals[key] === o.id ? 'bg-green-500/20 border-green-400 text-green-200' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                    >
                                        {o.text}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                    ))}
                </div>
            </Card>

            <div className="flex flex-col items-center gap-3">
                {outsideNS && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 max-w-xl text-sm space-y-3">
                        <p className="flex gap-2"><AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" /> This land is in {outsideNS}. AgriGenesis AI is starting in Nova Scotia, so its crop rules and price data are for Nova Scotia and may not fit.</p>
                        <button onClick={() => start(true)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20">Continue anyway</button>
                    </div>
                )}
                {hasLand && photos.length === 0 && (
                    <p className="text-sm text-amber-200">Tip: adding a photo lets the agent check the land with its own eyes. You can continue without one.</p>
                )}
                <button
                    onClick={() => start(false)}
                    disabled={!hasLand || starting}
                    className="flex items-center gap-2 px-8 py-4 rounded-2xl text-lg font-bold bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {starting && <Loader2 className="w-5 h-5 animate-spin" />}
                    Build my farm plan <ArrowRight className="w-5 h-5" />
                </button>
                {missing.length > 0 && <p className="text-sm text-muted-foreground">To continue: {missing.join(', ')}.</p>}
            </div>
        </div>
    );
}
