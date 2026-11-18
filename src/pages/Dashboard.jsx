import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import {
    Loader2, CheckCircle2, XCircle, MinusCircle, ShieldCheck, ExternalLink, Snowflake, Layers, Mountain,
    Satellite, CloudRain, ChevronDown, AlertTriangle, Check, X, Printer, RotateCcw, Map as MapIcon, DollarSign, Film, Sprout, CalendarDays, ListChecks, FlaskConical, HelpCircle, MapPin, Leaf, Trees, Target,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { runAgent, loadSavedPlan } from '../agent/agent';
import { describeNdvi, HA_TO_ACRES, NSPRD_ATTRIBUTION, NSPRD_LICENSE } from '../agent/data';
import { cropById, CROP_SOURCES } from '../agent/crops';
import { profitEstimate } from '../agent/economics';
import IncomeHistory from '../components/IncomeHistory';
import { sustainabilityScore } from '../agent/sustainability';
import { estimateCostsAI } from '../agent/aiCosts';
import FarmPreview from '../components/FarmPreview';
import FieldMap from '../components/FieldMap';

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const Panel = ({ title, icon: Icon, children, className = '' }) => (
    <section className={`rounded-3xl border border-white/10 bg-white/[0.03] p-6 md:p-8 ${className}`}>
        {title && (
            <h2 className="text-2xl font-bold flex items-center gap-3 mb-5">
                {Icon && <Icon className="w-6 h-6 text-green-400" />} {title}
            </h2>
        )}
        {children}
    </section>
);

const Source = ({ source }) => source ? (
    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
        Source: {source.name} <ExternalLink className="w-3 h-3" />
    </a>
) : null;

const StatusIcon = ({ status }) => {
    if (status === 'running') return <Loader2 className="w-5 h-5 animate-spin text-green-400 shrink-0" />;
    if (status === 'failed') return <XCircle className="w-5 h-5 text-red-400 shrink-0" />;
    if (status === 'skipped') return <MinusCircle className="w-5 h-5 text-amber-300 shrink-0" />;
    return <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />;
};

// ---------------------------------------------------------------------------
// What the agent did
// ---------------------------------------------------------------------------

function ActivityFeed({ steps, running }) {
    // Open while the agent works, folded once it is done, unless the farmer toggles it
    const [userOpen, setUserOpen] = useState(null);
    const open = userOpen ?? running;
    return (
        <Panel>
            <button onClick={() => setUserOpen(!open)} className="w-full flex items-center justify-between text-left" aria-expanded={open}>
                <span className="text-2xl font-bold flex items-center gap-3">
                    {running ? <Loader2 className="w-6 h-6 animate-spin text-green-400" /> : <ShieldCheck className="w-6 h-6 text-green-400" />}
                    {running ? 'The agent is researching your land…' : `What the agent checked (${steps.filter((s) => s.tool).length} steps)`}
                </span>
                <ChevronDown className={`w-5 h-5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <ol className="mt-5 space-y-3">
                    {steps.map((s) => (
                        <li key={s.id} className={`flex gap-3 rounded-xl p-3 ${s.by === 'system' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-white/[0.03]'}`}>
                            <StatusIcon status={s.status} />
                            <div className="space-y-1 min-w-0">
                                <p className="font-semibold">{s.label}{s.by === 'system' && <span className="ml-2 text-xs font-normal text-amber-200">safety check</span>}</p>
                                {s.reason && <p className="text-sm text-muted-foreground italic">Why: {s.reason}</p>}
                                {s.result && <p className="text-sm">{s.result}</p>}
                                <Source source={s.source} />
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Measured facts about the land
// ---------------------------------------------------------------------------

const Fact = ({ icon: Icon, title, loading, children, source, caveat }) => (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5 flex flex-col gap-3">
        <h3 className="font-semibold flex items-center gap-2 text-green-300"><Icon className="w-5 h-5" /> {title}</h3>
        {loading ? <p className="text-muted-foreground text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</p> : children}
        {caveat && !loading && <p className="text-xs text-muted-foreground">{caveat}</p>}
        {!loading && <Source source={source} />}
    </div>
);

const Big = ({ value, unit, label }) => (
    <div>
        <p className="text-3xl font-bold">{value ?? '—'}{unit && <span className="text-lg font-semibold text-muted-foreground"> {unit}</span>}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
    </div>
);

const LAND_COLOURS = { farmland: '#facc15', forest: '#15803d', wetland: '#38bdf8', water: '#1d4ed8', developed: '#a1a1aa', shrubland: '#84cc16', bare: '#d6b48a' };

function phMeaning(ph) {
    if (ph == null) return '';
    if (ph < 5.0) return 'Very acidic. Most crops need lime; wild blueberries like it.';
    if (ph < 5.5) return 'Acidic. Good for potatoes and blueberries; most vegetables need lime.';
    if (ph < 6.0) return 'Slightly acidic. A little lime helps most vegetables.';
    if (ph <= 7.0) return 'Ideal for most crops.';
    return 'Alkaline. Unusual in Nova Scotia; confirm with a soil test.';
}

function LandFacts({ site, running }) {
    const { normals, climate, soil, terrain, vegetation, forecast, landCover } = site;
    const lc = landCover?.data;
    const n = normals?.data, c = climate?.data, s = soil?.data, t = terrain?.data, v = vegetation?.data, f = forecast?.data;
    return (
        <Panel title="Your land, measured" icon={Layers}>
            <p className="text-muted-foreground mb-5 -mt-2">Real data for your exact location. Every number has its source.</p>
            <div className="grid md:grid-cols-2 gap-4">
                <Fact icon={Snowflake} title="Frost and growing season" loading={running && !normals} source={normals?.source} caveat={normals?.caveat}>
                    {n?.available ? (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <Big value={n.lastSpringFrost} label="Last spring frost (average)" />
                                <Big value={n.firstFallFrost} label="First fall frost (average)" />
                                <Big value={n.frostFreeDays} unit="days" label="Frost-free season" />
                            </div>
                            <p className="text-sm">Measured at <b>{n.station}</b> weather station, {n.distanceKm} km away.</p>
                        </>
                    ) : normals ? <p className="text-sm">{normals.summary}</p> : null}
                    {c && (
                        <p className="text-xs text-muted-foreground border-t border-white/10 pt-2">
                            Cross-check: a weather model for {c.years} estimates {c.frostFreeDays} frost-free days (last frost {c.lastSpringFrost}).
                            {n?.available && c.frostFreeDays - n.frostFreeDays > 20 && ' The model usually misses cold nights here, so the station record is used.'}
                        </p>
                    )}
                </Fact>

                <Fact icon={FlaskConical} title="Soil (estimate)" loading={running && !soil} source={soil?.source} caveat={soil?.caveat}>
                    {s?.available ? (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <Big value={s.pH} label={s.pHCaCl2 != null ? `pH in water (≈; ${s.pHCaCl2} in CaCl₂)` : 'pH (acidity)'} />
                                <Big value={s.texture} label="Texture" />
                                <Big value={s.organicCarbonGkg ?? '—'} unit={s.organicCarbonGkg != null ? 'g/kg' : ''} label="Organic carbon" />
                            </div>
                            <p className="text-sm">{phMeaning(s.pH)} {s.clayPct}% clay, {s.sandPct}% sand: {s.drainageHint}.</p>
                            {s.nearbyPoint && <p className="text-xs text-amber-200">{s.nearbyPoint}.</p>}
                        </>
                    ) : soil ? <p className="text-sm">{soil.summary}</p> : null}
                </Fact>

                <Fact icon={Mountain} title="Slope and height" loading={running && !terrain} source={terrain?.source} caveat={terrain?.caveat}>
                    {t && (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <Big value={t.slopePct} unit="%" label={`Slope (${t.slopeClass})`} />
                                <Big value={t.faces} label="Land faces" />
                                <Big value={t.elevationM} unit="m" label="Above sea level" />
                            </div>
                            <p className="text-sm">
                                {t.slopePct < 5 ? 'Easy to work with machines; watch for wet spots on flat ground.' : t.slopePct < 9 ? 'Workable. Plant rows across the slope to limit erosion.' : 'Steep for row crops. Better for hay, pasture or perennials.'}
                            </p>
                        </>
                    )}
                </Fact>

                <Fact icon={MapIcon} title="What is on the land" loading={running && !landCover} source={landCover?.source} caveat={landCover?.caveat}>
                    {lc?.available ? (
                        <>
                            <Big value={lc.main} label={`Main land use in ${lc.latestYear}`} />
                            <ul className="space-y-2 text-sm">
                                {lc.history.map((h) => (
                                    <li key={h.year}>
                                        <p className="text-muted-foreground mb-1">{h.year}</p>
                                        <div className="flex h-3 rounded-full overflow-hidden bg-white/10" aria-label={h.text}>
                                            {h.classes.map((c) => <div key={c.code} title={`${c.name} ${c.pct}%`} style={{ width: `${c.pct}%`, background: LAND_COLOURS[c.group] || '#64748b' }} />)}
                                        </div>
                                        <p className="mt-1">{h.text}</p>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : landCover ? <p className="text-sm">{landCover.summary}</p> : null}
                </Fact>

                <Fact icon={Satellite} title="Satellite greenness (NDVI)" loading={running && !vegetation} source={vegetation?.source} caveat={vegetation?.caveat}>
                    {v?.available ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Big value={v.summerPeak} label={`Last summer’s peak: ${v.summerMeaning}`} />
                                <Big value={v.latest} label={`Latest (${v.latestDate}): ${describeNdvi(v.latest)}`} />
                            </div>
                            <div className="h-24">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={v.series} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(d) => d.slice(5)} />
                                        <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                        <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                                        <Line type="monotone" dataKey="ndvi" stroke="#4ade80" strokeWidth={2} dot={{ r: 2 }} name="NDVI" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-muted-foreground">NDVI runs from 0 (bare) to 1 (very green). Cloudy readings are removed.</p>
                        </>
                    ) : vegetation ? <p className="text-sm">{vegetation.summary}</p> : null}
                </Fact>

                <Fact icon={CloudRain} title="Next 14 days" loading={running && !forecast} source={forecast?.source} caveat={forecast?.caveat} >
                    {f && (
                        <>
                            <div className="grid grid-cols-3 gap-3">
                                <Big value={f.frostNights} label="Frost nights" />
                                <Big value={f.totalRainMm} unit="mm" label="Rain expected" />
                                <Big value={`${Math.round(f.coldest)} to ${Math.round(f.warmest)}`} unit="°C" label="Temperature range" />
                            </div>
                            <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
                                {f.days.map((d) => (
                                    <div key={d.date} className={`min-w-[52px] text-center rounded-lg p-1.5 text-xs ${d.min <= 0 ? 'bg-sky-500/20' : 'bg-white/5'}`}>
                                        <p className="text-muted-foreground">{new Date(`${d.date}T12:00`).toLocaleDateString('en-CA', { weekday: 'short' })}</p>
                                        <p className="font-semibold">{Math.round(d.max)}°</p>
                                        <p className="text-sky-300">{Math.round(d.min)}°</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </Fact>

                {c && (
                    <Fact icon={CalendarDays} title="Recent seasons (weather model)" source={climate.source} caveat="Model estimate, used to show year-to-year variation and summer heat. Frost dates above come from the station record.">
                        <div className="grid grid-cols-3 gap-3">
                            <Big value={n?.gdd5 ?? c.gdd5} label={`Growing degree days ${n?.gdd5 ? '(station)' : '(model)'}`} />
                            <Big value={c.seasonRainMm} unit="mm" label="Rain, May–Sep" />
                            <Big value={c.winterLowC} unit="°C" label="Typical coldest night" />
                        </div>
                    </Fact>
                )}
            </div>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Crop ranking (rules) + the agent's picks
// ---------------------------------------------------------------------------

const fitStyle = {
    good: 'bg-green-500/15 text-green-300 border-green-500/30',
    possible: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    poor: 'bg-red-500/10 text-red-300 border-red-500/20',
};

function CropRow({ crop, pick }) {
    const [open, setOpen] = useState(Boolean(pick));
    return (
        <li className={`rounded-2xl border ${pick ? 'border-green-400/50 bg-green-500/[0.06]' : 'border-white/10 bg-black/20'}`}>
            <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-4 p-4 text-left" aria-expanded={open}>
                <span className="text-3xl" aria-hidden>{crop.emoji}</span>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold flex flex-wrap items-center gap-2">
                        {crop.name}
                        {pick && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500 text-black font-bold">Agent’s pick</span>}
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                        <div className={`h-full ${crop.fit === 'good' ? 'bg-green-400' : crop.fit === 'possible' ? 'bg-amber-300' : 'bg-red-400'}`} style={{ width: `${crop.score}%` }} />
                    </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full border whitespace-nowrap ${fitStyle[crop.fit]}`}>{crop.fitLabel} · {crop.score}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-4 pb-4 pl-[4.5rem] space-y-3 text-sm">
                    {pick && (
                        <div className="rounded-xl bg-green-500/10 p-3">
                            <p><b>Why the agent picked it:</b> {pick.why}</p>
                            {pick.acres && <p className="mt-1"><b>Start with:</b> {pick.acres} acre</p>}
                            {pick.income && !pick.income.yieldOnly && <p className="mt-1"><b>Expected gross income:</b> {pick.income.latest.text} a year once established, based on the {pick.income.latest.year} Statistics Canada report ({pick.income.latest.perAcreText}; {pick.income.period} range {pick.income.text})</p>}
                        </div>
                    )}
                    <ul className="space-y-1">
                        {crop.reasons.map((r, i) => (
                            <li key={i} className="flex gap-2">
                                {r.level === 'ok' ? <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" /> : r.level === 'warn' ? <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                                <span>{r.text}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-muted-foreground"><b>Plant:</b> {crop.plant}. <b>Harvest:</b> {crop.harvest}. {crop.note}</p>
                </div>
            )}
        </li>
    );
}

function CropRanking({ ranking, plan, chosen = [] }) {
    const [showAll, setShowAll] = useState(false);
    const why = new Map((plan?.recommended || []).map((r) => [r.crop_id, r.why]));
    const picks = new Map(chosen.map((p) => [p.crop_id, { ...p, why: why.get(p.crop_id) || 'Highest rule-based score for your land and goals.' }]));
    const ordered = [...ranking.filter((c) => picks.has(c.id)), ...ranking.filter((c) => !picks.has(c.id))];
    const visible = showAll ? ordered : ordered.slice(0, 6);
    return (
        <Panel title="Which crops fit this land" icon={Sprout}>
            <p className="text-muted-foreground mb-5 -mt-2">
                Scores come from fixed rules that compare each crop’s needs with your measured frost season, heat, soil, slope and goals. The AI does not set these scores. Tap a crop to see why.
            </p>
            <ul className="space-y-3">
                {visible.map((c) => <CropRow key={c.id} crop={c} pick={picks.get(c.id)} />)}
            </ul>
            {ordered.length > 6 && (
                <button onClick={() => setShowAll(!showAll)} className="mt-4 text-sm text-green-300 hover:underline">
                    {showAll ? 'Show fewer crops' : `Show all ${ordered.length} crops`}
                </button>
            )}
            <p className="mt-4 text-xs text-muted-foreground">
                Crop needs are general guideline values from {CROP_SOURCES.map((s, i) => (
                    <span key={s.url}>{i > 0 && ', '}<a className="text-sky-300 hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>
                ))}.
            </p>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// The plan written by the agent
// ---------------------------------------------------------------------------

const confidenceStyle = { high: 'bg-green-500/20 text-green-300', medium: 'bg-amber-500/20 text-amber-200', low: 'bg-red-500/20 text-red-300' };

function PlanView({ plan, avoid = [] }) {
    const [done, setDone] = useState({});
    return (
        <>
            <Panel className="border-green-500/30 bg-green-500/[0.05]">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h2 className="text-2xl font-bold">Your plan in short</h2>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${confidenceStyle[plan.confidence]}`}>{plan.confidence} confidence</span>
                </div>
                <p className="text-lg leading-relaxed">{plan.summary}</p>
                {plan.confidence_reason && <p className="text-sm text-muted-foreground mt-3"><b>Confidence:</b> {plan.confidence_reason}</p>}
                <div className="grid md:grid-cols-2 gap-4 mt-5">
                    {plan.land_now && <div className="rounded-xl bg-black/20 p-4"><p className="font-semibold mb-1">The land today</p><p className="text-sm">{plan.land_now}</p></div>}
                    {plan.cross_check && <div className="rounded-xl bg-black/20 p-4"><p className="font-semibold mb-1">Do the sources agree?</p><p className="text-sm">{plan.cross_check}</p></div>}
                    {plan.photo_check && <div className="rounded-xl bg-black/20 p-4 md:col-span-2"><p className="font-semibold mb-1">What your photos show</p><p className="text-sm">{plan.photo_check}</p></div>}
                </div>
            </Panel>

            <div className="grid lg:grid-cols-2 gap-6">
                <Panel title="First steps" icon={ListChecks}>
                    <ol className="space-y-2">
                        {(plan.first_steps || []).map((t, i) => (
                            <li key={i}>
                                <label className="flex gap-3 items-start rounded-xl p-3 bg-black/20 cursor-pointer">
                                    <input type="checkbox" className="mt-1 accent-green-500 w-4 h-4" checked={!!done[i]} onChange={() => setDone({ ...done, [i]: !done[i] })} />
                                    <span className={done[i] ? 'line-through text-muted-foreground' : ''}><b>{i + 1}.</b> {t}</span>
                                </label>
                            </li>
                        ))}
                    </ol>
                </Panel>
                <div className="space-y-6">
                    {plan.soil_test && (
                        <Panel title="Get a soil test" icon={FlaskConical}>
                            <p>{plan.soil_test}</p>
                            <p className="text-sm text-muted-foreground mt-3">The soil numbers above are estimates from a global model. A lab test of your own field is the only way to know for sure.</p>
                        </Panel>
                    )}
                    {!!plan.risks?.length && (
                        <Panel title="Risks to watch" icon={AlertTriangle}>
                            <ul className="space-y-3">
                                {plan.risks.map((r, i) => (
                                    <li key={i} className="rounded-xl bg-black/20 p-3 text-sm"><p className="font-semibold">{r.risk}</p><p className="text-muted-foreground">{r.what_to_do}</p></li>
                                ))}
                            </ul>
                        </Panel>
                    )}
                </div>
            </div>

            {!!plan.calendar?.length && (
                <Panel title="Your next 12 months" icon={CalendarDays}>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {plan.calendar.map((m, i) => (
                            <div key={i} className="rounded-xl bg-black/20 p-4">
                                <p className="font-semibold text-green-300">{m.month}</p>
                                <ul className="mt-2 space-y-1 text-sm list-disc pl-4">
                                    {(m.tasks || []).map((t, j) => <li key={j}>{t}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
                {!!avoid.length && (
                    <Panel title="Better to avoid for now" icon={X}>
                        <ul className="space-y-2 text-sm">
                            {avoid.map((a, i) => (
                                <li key={i}><b>{cropById(a.crop_id)?.emoji} {cropById(a.crop_id)?.name}:</b> {a.why}</li>
                            ))}
                        </ul>
                    </Panel>
                )}
                {!!plan.unknowns?.length && (
                    <Panel title="What the data can’t tell us" icon={HelpCircle}>
                        <ul className="space-y-2 text-sm list-disc pl-5">
                            {plan.unknowns.map((u, i) => <li key={i}>{u}</li>)}
                        </ul>
                    </Panel>
                )}
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// At-a-glance facts, fact check and where to get help
// ---------------------------------------------------------------------------

function GlanceStats({ site = {}, picks = [], factCheck, sustain }) {
    const n = site.normals?.data, c = site.climate?.data, so = site.soil?.data, t = site.terrain?.data, lc = site.landCover?.data;
    const top = picks.find((p) => p.income && !p.income.yieldOnly);
    const passed = factCheck ? factCheck.checks.filter((x) => x.status === 'pass').length : null;
    const total = factCheck ? factCheck.checks.filter((x) => x.status !== 'skip').length : null;
    const tiles = [
        n?.available ? { icon: Snowflake, label: 'Frost-free season', value: `${n.frostFreeDays} days`, sub: `${n.lastSpringFrost} → ${n.firstFallFrost} · Environment Canada` }
            : c && { icon: Snowflake, label: 'Frost-free season', value: `${c.frostFreeDays} days`, sub: `${c.lastSpringFrost} → ${c.firstFallFrost} · weather model` },
        so?.available ? { icon: Layers, label: 'Soil (estimate)', value: `pH ${so.pH}`, sub: `${so.texture} · ${so.provider === 'aafc' ? 'Agriculture Canada' : 'SoilGrids'}` } : { icon: Layers, label: 'Soil', value: 'Lab test', sub: 'No estimate available' },
        t && { icon: Mountain, label: 'Slope', value: `${t.slopePct}%`, sub: t.faces && t.faces !== 'flat' ? `${t.slopeClass} · faces ${t.faces}` : t.slopeClass },
        lc?.available && { icon: Satellite, label: `Land use ${lc.latestYear}`, value: lc.main || '—', sub: `${lc.farmlandPct}% farmland · Agriculture Canada` },
        top && { icon: DollarSign, label: `${cropById(top.crop_id).name}, ${top.income.latest.year}`, value: top.income.latest.text, sub: `${top.acres} acre · Statistics Canada` },
        sustain && { icon: Leaf, label: 'Sustainability', value: `${sustain.score}/100 · ${sustain.grade}`, sub: `${sustain.parts.length} measured factors · see below` },
        factCheck && { icon: ShieldCheck, label: 'Fact check', value: `${passed}/${total}`, sub: factCheck.revised ? 'Agent corrected itself' : factCheck.problemsLeft ? `${factCheck.problemsLeft} flagged` : 'All checks passed', tone: factCheck.problemsLeft ? 'amber' : 'green' },
    ].filter(Boolean);
    if (!tiles.length) return null;
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiles.map(({ icon: Icon, label, value, sub, tone }) => (
                <div key={label} className={`rounded-2xl border p-4 bg-gradient-to-br ${tone === 'amber' ? 'border-amber-500/30 from-amber-500/10' : 'border-white/10 from-green-500/[0.07]'} to-transparent`}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5 text-green-400" /> {label}</p>
                    <p className="text-2xl font-bold mt-1 truncate" title={String(value)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</p>
                </div>
            ))}
        </div>
    );
}

function FactCheckPanel({ factCheck }) {
    if (!factCheck) return null;
    const icon = (st) => st === 'pass' ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> : st === 'skip' ? <MinusCircle className="w-5 h-5 text-muted-foreground shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />;
    return (
        <Panel title="Fact check" icon={ShieldCheck}>
            <p className="text-sm text-muted-foreground mb-4">
                Before showing you the plan, AgriGenesis AI checked the AI’s writing against the measured data and the crop rules.
                {factCheck.revised && <> It found {factCheck.problemsFound} problem{factCheck.problemsFound === 1 ? '' : 's'} and <b className="text-green-300">the agent corrected its own plan</b>.</>}
                {!factCheck.revised && factCheck.problemsFound > 0 && <> The problems below could not be fixed automatically, so treat those lines with care.</>}
            </p>
            <ul className="grid md:grid-cols-2 gap-2">
                {factCheck.checks.map((c) => (
                    <li key={c.id} className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                        <div className="flex items-start gap-2">{icon(c.status)}<span className="font-medium">{c.label}</span></div>
                        {c.status === 'skip' && <p className="text-xs text-muted-foreground mt-1 ml-7">Not checked: data unavailable.</p>}
                        {c.problems?.length > 0 && <ul className="mt-1 ml-7 text-xs text-amber-200 space-y-1">{c.problems.slice(0, 3).map((x) => <li key={x}>• {x}</li>)}</ul>}
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

const HELP = [
    { name: 'Program for Accessing Agricultural Land (PAAL)', who: 'NS Farm Loan Board', text: 'Lease options for new and expanding farmers, including a lease that builds equity towards buying.', url: 'https://nsfarmloan.ca/program-for-accessing-agricultural-land' },
    { name: 'Farm succession planning', who: 'NS Federation of Agriculture', text: 'Step-by-step succession resources and links to farm-seeker matchmaking.', url: 'https://nsfa-fane.ca/succession-planning/' },
    { name: 'Crop and soil advice', who: 'Perennia', text: 'Nova Scotia’s agriculture advisors: crop specialists, soil and pest guidance.', url: 'https://www.perennia.ca/' },
    { name: 'Newcomer support', who: 'ISANS', text: 'Settlement and employment help for newcomers to Nova Scotia, including farming pathways.', url: 'https://www.isans.ca/' },
];

function HelpPanel() {
    return (
        <Panel title="Help to get started" icon={HelpCircle}>
            <p className="text-sm text-muted-foreground mb-4">The plan tells you what the land can do. These Nova Scotia programs help with the rest: land, money, advice and the handover.</p>
            <div className="grid md:grid-cols-2 gap-3">
                {HELP.map((h) => (
                    <a key={h.url} href={h.url} target="_blank" rel="noreferrer" className="group rounded-2xl border border-white/10 bg-white/[0.03] p-4 hover:border-green-500/40 hover:bg-green-500/[0.06] transition-colors">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-green-400">{h.who}</p>
                        <p className="font-semibold mt-1 flex items-center gap-1.5">{h.name} <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" /></p>
                        <p className="text-sm text-muted-foreground mt-1">{h.text}</p>
                    </a>
                ))}
            </div>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Money (CAD) and farm preview
// ---------------------------------------------------------------------------

function MoneyPanel({ picks, farm }) {
    const rows = picks.map((p) => ({ ...p, crop: cropById(p.crop_id), ...profitEstimate(p.crop_id, p.acres) }));
    const sources = [
        ...new Map(rows.flatMap((r) => r.income?.tables || []).map((t) => [t.id, { name: `Statistics Canada ${t.id}`, url: t.url }])).values(),
        ...new Map(rows.filter((r) => r.cost).map((r) => [r.cost.source.url, r.cost.source])).values(),
    ];
    const withProfit = rows.filter((r) => r.profit);
    return (
        <Panel title="Money: what to expect (CAD)" icon={DollarSign}>
            <h3 className="font-semibold flex flex-wrap items-center gap-2 -mt-1 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">Not guessed</span>
                1. From published studies
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
                Income is what Nova Scotia farms were actually paid on average (Statistics Canada), scaled to your plot sizes. Costs come from published
                government cost studies. Where no study exists, the cell says so.
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="text-left text-muted-foreground">
                        <tr>
                            <th className="py-2 pr-3">Crop</th><th className="py-2 pr-3">Size</th>
                            <th className="py-2 pr-3">Income (latest report)</th><th className="py-2 pr-3">Cost per year</th><th className="py-2">Profit (latest report)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 align-top">
                        {rows.map((r) => (
                            <tr key={r.crop_id}>
                                <td className="py-3 pr-3 font-semibold whitespace-nowrap">{r.crop.emoji} {r.crop.name}</td>
                                <td className="py-3 pr-3 whitespace-nowrap">{r.acres} acre</td>
                                <td className="py-3 pr-3">
                                    {r.income?.yieldOnly ? <span className="text-muted-foreground">No NS price published</span>
                                        : r.income ? <>
                                            <b className="text-green-300">{r.income.latest.text}</b> <span className="text-xs text-muted-foreground">in {r.income.latest.year}</span>
                                            {r.income.change && <span className={`ml-1 text-xs ${r.income.change.pct < 0 ? 'text-red-300' : 'text-green-300'}`}>{r.income.change.pct > 0 ? '+' : ''}{r.income.change.pct}% vs {r.income.change.fromYear}</span>}
                                            <br /><span className="text-xs text-muted-foreground">{r.income.latest.perAcreText} · range {r.income.period}: {r.income.text}</span>
                                        </> : '—'}
                                </td>
                                <td className="py-3 pr-3">
                                    {r.cost ? <><b>{r.cost.text}</b><br /><span className="text-xs text-muted-foreground">{r.cost.perAcreText}</span></>
                                        : <span className="text-muted-foreground">No published cost study</span>}
                                </td>
                                <td className="py-3">
                                    {r.profit ? <>
                                        <b className={r.profit.latest.high < 0 ? 'text-red-300' : r.profit.latest.low < 0 ? 'text-amber-200' : 'text-green-300'}>{r.profit.latest.text}</b> <span className="text-xs text-muted-foreground">in {r.profit.latest.year}</span>
                                        <br /><span className="text-xs text-muted-foreground">range {r.income.period}: {r.profit.text}</span>
                                    </>
                                        : <span className="text-muted-foreground">Needs both income and cost</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.some((r) => r.cost?.note) && (
                <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                    {rows.filter((r) => r.cost?.note).map((r) => <li key={r.crop_id}>• <b>{r.crop.name} cost:</b> {r.cost.note}</li>)}
                </ul>
            )}
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                <li>• The main figure is the latest Statistics Canada report for that crop; the range is the lowest and highest year, {[...new Set(rows.map((r) => r.income?.period).filter(Boolean))].join(', ')}. First-year growers usually earn less than the provincial average.</li>
                <li>• Fruit crops take 1–4 years before the first real harvest; the numbers above are for producing years.</li>
                {withProfit.some((r) => r.profit.low < 0) && <li>• A range that starts below zero means some years lost money in the published studies. Small plots sold directly (farm stand, market) often get better prices than these averages.</li>}
                <li>• Sources: {sources.map((s, i) => (
                    <span key={s.url}>{i > 0 && ' · '}<a className="text-sky-300 hover:underline" href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>
                ))}</li>
            </ul>
            <IncomeHistory className="mt-6" rows={rows.map((r) => ({ key: r.crop_id, label: `${r.crop.emoji} ${r.crop.name} (${r.acres} acre)`, income: r.income, profit: r.profit }))} />
            <AiCostEstimate picks={picks} farm={farm} />
        </Panel>
    );
}

function AiCostEstimate({ picks, farm }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let alive = true;
        estimateCostsAI(picks.map((p) => ({ crop_id: p.crop_id, acres: p.acres })), farm)
            .then((r) => alive && setRows(r))
            .catch((e) => alive && setError(e.message));
        return () => { alive = false; };
    }, [picks, farm]);

    return (
        <div className="mt-8 pt-6 border-t border-white/10">
            <h3 className="font-semibold flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/30">AI estimate</span>
                2. AI-estimated costs and profit, for every crop
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
                The AI estimates what a small Nova Scotia grower would spend, including the crops above that already have published figures, so you can compare.
                Income still comes from Statistics Canada where it exists. Treat these as rough guides, not facts.
            </p>
            {error && <p className="text-sm text-red-300">The AI estimate is not available right now ({error}).</p>}
            {!rows && !error && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Estimating costs…</p>}
            {rows && !rows.length && !error && <p className="text-sm text-muted-foreground">AI is not connected, so no estimate is shown.</p>}
            {rows?.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[640px]">
                        <thead className="text-left text-muted-foreground">
                            <tr><th className="py-2 pr-3">Crop</th><th className="py-2 pr-3">AI cost per year</th><th className="py-2 pr-3">Income used</th><th className="py-2 pr-3">AI profit per year</th><th className="py-2">Main costs (per acre)</th></tr>
                        </thead>
                        <tbody className="divide-y divide-white/10 align-top">
                            {rows.map((r) => {
                                const c = cropById(r.crop_id);
                                if (r.failed) return <tr key={r.crop_id}><td className="py-3 pr-3 font-semibold">{c.emoji} {c.name}</td><td className="py-3 text-muted-foreground" colSpan={4}>The AI did not give a usable estimate.</td></tr>;
                                return (
                                    <tr key={r.crop_id}>
                                        <td className="py-3 pr-3 font-semibold whitespace-nowrap">{c.emoji} {c.name}<br /><span className="text-xs font-normal text-muted-foreground">{r.acres} acre</span></td>
                                        <td className="py-3 pr-3"><b>{r.costText}</b><br /><span className="text-xs text-muted-foreground">{r.perAcreText}</span></td>
                                        <td className="py-3 pr-3">
                                            {r.income ? <>{r.income.text}<br /><span className="text-xs text-muted-foreground">{r.income.from === 'statcan' ? `Statistics Canada, ${r.income.year} report` : 'AI estimate (no official price)'}</span></> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="py-3 pr-3">
                                            {r.profitText ? <b className={r.profitHigh < 0 ? 'text-red-300' : r.profitLow < 0 ? 'text-amber-200' : 'text-green-300'}>{r.profitText}</b> : <span className="text-muted-foreground">—</span>}
                                        </td>
                                        <td className="py-3 text-xs text-muted-foreground">
                                            {r.items.map((i) => <div key={i.item}>{i.item}: {i.perAcre}</div>)}
                                            {r.assumptions && <div className="mt-1 italic">{r.assumptions}</div>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}



/** Sustainability score: one clear number, what is good, what to improve, and five measured factors. */
const SUSTAIN_ICON = { land: Trees, cover: Sprout, slope: Mountain, fit: Target, soil: Layers };
function SustainabilityPanel({ sustain }) {
    if (!sustain) return null;
    const tone = (pts, max) => (pts / max >= 0.8 ? 'green' : pts / max >= 0.5 ? 'amber' : 'red');
    const C = {
        green: { bar: 'bg-green-400', text: 'text-green-300', ring: '#4ade80' },
        amber: { bar: 'bg-amber-400', text: 'text-amber-300', ring: '#fbbf24' },
        red: { bar: 'bg-red-400', text: 'text-red-300', ring: '#f87171' },
    };
    const main = C[sustain.score >= 65 ? 'green' : sustain.score >= 50 ? 'amber' : 'red'];
    const strong = sustain.parts.filter((p) => p.points / p.max >= 0.8);
    const improve = [...sustain.parts].filter((p) => p.points / p.max < 0.8).sort((a, b) => a.points / a.max - b.points / b.max);
    return (
        <Panel title="Sustainability score" icon={Leaf}>
            <div className="grid md:grid-cols-[auto,1fr] gap-6 items-center">
                <div className="flex items-center gap-5">
                    <div className="relative w-32 h-32 shrink-0 rounded-full grid place-items-center" style={{ background: `conic-gradient(${main.ring} ${sustain.score * 3.6}deg, rgba(255,255,255,.08) 0deg)` }}
                        role="img" aria-label={`Sustainability score ${sustain.score} out of 100, grade ${sustain.grade}`}>
                        <div className="absolute inset-[10px] rounded-full bg-background grid place-items-center text-center">
                            <div><p className="text-4xl font-bold leading-none">{sustain.score}</p><p className="text-xs text-muted-foreground mt-1">out of 100</p></div>
                        </div>
                    </div>
                    <div>
                        <p className={`text-5xl font-black ${main.text}`}>{sustain.grade}</p>
                        <p className="font-semibold mt-1">{sustain.verdict}</p>
                    </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
                        <p className="font-semibold text-green-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Already good</p>
                        <ul className="mt-2 space-y-1">{strong.length ? strong.map((p) => <li key={p.id}>{p.label}</li>) : <li className="text-muted-foreground">Nothing scores high yet.</li>}</ul>
                    </div>
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <p className="font-semibold text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> How to raise it</p>
                        <ul className="mt-2 space-y-1">{improve.length ? improve.map((p) => <li key={p.id}>{p.tip}</li>) : <li className="text-muted-foreground">Keep doing what the plan says.</li>}</ul>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
                {sustain.parts.map((p) => {
                    const Icon = SUSTAIN_ICON[p.id] || Leaf;
                    const c = C[tone(p.points, p.max)];
                    return (
                        <div key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" title={`${p.value}. ${p.why} Source: ${p.source}.`}>
                            <div className="flex items-center justify-between">
                                <Icon className={`w-5 h-5 ${c.text}`} />
                                <span className="text-xs font-bold tabular-nums text-muted-foreground">{p.points}/{p.max}</span>
                            </div>
                            <p className="font-semibold mt-2">{p.short}</p>
                            <p className={`text-sm ${c.text}`}>{p.stat}</p>
                            <div className="h-2 rounded-full bg-white/10 mt-3"><div className={`h-2 rounded-full ${c.bar}`} style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
                        </div>
                    );
                })}
            </div>

            <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-white">How the score is worked out</summary>
                <ul className="mt-3 space-y-2">
                    {sustain.parts.map((p) => (
                        <li key={p.id} className="rounded-xl bg-black/20 p-3">
                            <b>{p.label} ({p.points}/{p.max}).</b> {p.value}. <span className="text-muted-foreground">{p.why}</span> <span className="text-green-400/80">Source: {p.source}.</span>
                        </li>
                    ))}
                    {!!sustain.skipped.length && <li className="text-xs text-muted-foreground">Not scored (no data): {sustain.skipped.join('; ')}.</li>}
                </ul>
                <p className="text-xs text-muted-foreground mt-2">This is AgriGenesis AI’s own rule-based index from measured data, not an official certification.</p>
            </details>
        </Panel>
    );
}

/** Metres between two points (haversine). */
function metresBetween(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** What the farmer gave us: the boundary on the satellite map and the photos they added. */
function YourLandPanel({ farm }) {
    if (!farm?.lat) return null;
    const boundary = farm.boundary || [];
    const shape = boundary.length >= 3 ? boundary : farm.pin ? [farm.pin] : [{ lat: farm.lat, lon: farm.lon }];
    const photos = farm.thumbs?.length ? farm.thumbs : farm.photos || [];
    const meta = farm.photoMeta || [];
    // Photo spots are drawn only when they are near the land; far-away photos are flagged in their captions instead
    const markers = meta.map((m, i) => (m.gps && metresBetween(m.gps, farm) < 3000 ? { ...m.gps, label: `Photo ${i + 1}` } : null)).filter(Boolean);
    const how = farm.parcel?.pid
        ? `Whole property, PID ${farm.parcel.pid}, from the Nova Scotia property registry (approximate, not surveyed${farm.parcel.updated ? `; record updated ${farm.parcel.updated.slice(0, 4)}-${farm.parcel.updated.slice(4, 6)}-${farm.parcel.updated.slice(6, 8)}` : ''}).`
        : boundary.length >= 3 ? `Field you outlined: ${boundary.length} corners.` : 'Spot you marked; the size is the area you typed.';
    return (
        <Panel title="The land and photos you gave" icon={MapPin}>
            <div className="grid md:grid-cols-5 gap-5">
                <div className="md:col-span-3 space-y-2">
                    <FieldMap points={shape.length >= 3 ? shape : []} markers={shape.length < 3 ? [{ ...shape[0], label: 'Your land' }, ...markers] : markers} readOnly className="h-72"
                        showCorners={!farm.parcel?.pid} />
                    <p className="text-sm">{how} {farm.hectares ? <b>{farm.hectares.toFixed(2)} ha ({(farm.hectares * HA_TO_ACRES).toFixed(1)} acres).</b> : null}</p>
                    {farm.parcel?.pid && <p className="text-[11px] text-muted-foreground">{NSPRD_ATTRIBUTION} <a href={NSPRD_LICENSE} target="_blank" rel="noreferrer" className="underline">Licence</a></p>}
                </div>
                <div className="md:col-span-2 space-y-3">
                    <p className="text-sm font-semibold">Your photos</p>
                    {!photos.length && <p className="text-sm text-muted-foreground">{farm.photoCount ? `${farm.photoCount} photo(s) were used for this plan, but they are not saved on this device.` : 'No photos were added.'}</p>}
                    <div className="grid grid-cols-2 gap-2">
                        {photos.map((src, i) => {
                            const g = meta[i]?.gps;
                            const d = g ? metresBetween(g, { lat: farm.lat, lon: farm.lon }) : null;
                            return (
                                <figure key={i} className="rounded-xl overflow-hidden border border-white/10 bg-black/20">
                                    <img src={src} alt={`Photo ${i + 1} of the land${meta[i]?.name ? ` (${meta[i].name})` : ''}`} className="w-full h-28 object-cover" />
                                    <figcaption className="text-[11px] px-2 py-1.5 opacity-80">
                                        Photo {i + 1}{' · '}
                                        {d == null ? 'no location saved' : d < 1000 ? `taken ${Math.round(d)} m from the field centre` : `taken ${(d / 1000).toFixed(1)} km away, may not show this land`}
                                    </figcaption>
                                </figure>
                            );
                        })}
                    </div>
                </div>
            </div>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------


export default function Dashboard() {
    const { state } = useLocation();
    const navigate = useNavigate();
    const farm = state?.farm;
    const [live, setLive] = useState({ steps: [], site: {}, ranking: null });
    const [result, setResult] = useState(() => (farm ? null : loadSavedPlan()));
    const [error, setError] = useState('');
    const started = useRef(false);

    useEffect(() => {
        if (!farm) {
            if (!loadSavedPlan()) navigate('/plan-farm', { replace: true });
            return;
        }
        if (started.current) return; // React dev mode runs effects twice
        started.current = true;
        runAgent(farm, setLive)
            .then(setResult)
            .catch((err) => setError(err.message));
    }, [farm, navigate]);

    const running = !result && !error;
    const view = result || { ...live, farm };
    const f = view.farm || farm || {};
    const topPick = result?.picks?.[0]?.crop_id || result?.ranking?.find((c) => c.fit !== 'poor')?.id;
    const topCrop = cropById(topPick);
    const sustain = result?.picks?.length ? sustainabilityScore({ site: result.site, picks: result.picks, ranking: result.ranking, farm: result.farm }) : null;

    return (
        <div className="max-w-5xl mx-auto space-y-6 print:text-black">
            <header className="relative overflow-hidden rounded-3xl border border-green-500/20 bg-gradient-to-br from-green-500/15 via-emerald-500/5 to-sky-500/10 p-6 md:p-8 space-y-2">
                <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-green-400/10 blur-3xl pointer-events-none" aria-hidden="true" />
                <p className="text-xs font-bold uppercase tracking-widest text-green-400 flex items-center gap-2"><Sprout className="w-4 h-4" /> Farm plan{result?.mode === 'agent' && ' · researched by the agent, checked against official data'}</p>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{f.placeName || 'Your land'}</h1>
                <p className="text-muted-foreground">
                    {f.hectares ? `${f.hectares.toFixed(2)} ha (${(f.hectares * HA_TO_ACRES).toFixed(1)} acres) · ` : ''}
                    {f.lat?.toFixed?.(4)}, {f.lon?.toFixed?.(4)}
                    {result?.createdAt && ` · made ${new Date(result.createdAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}`}
                </p>
            </header>
            {result && <GlanceStats site={result.site} picks={result.picks} factCheck={result.plan?.fact_check} sustain={sustain} />}

            {error && <Panel><p className="text-red-300">Something went wrong: {error}</p></Panel>}
            {result?.note && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" /> <p>{result.note}</p>
                </div>
            )}

            <ActivityFeed steps={view.steps || []} running={running} />
            {result?.fromCache && (
                <p className="text-sm text-muted-foreground">You asked for this same land and goals earlier today, so this is the same plan. Answers only change when the land, goals, photos or data change.</p>
            )}
            {result && <YourLandPanel farm={{ ...result.farm, photos: farm?.photos, thumbs: result.farm?.thumbs || farm?.thumbs, photoMeta: result.farm?.photoMeta || farm?.photoMeta }} />}
            {result?.plan && <PlanView plan={result.plan} avoid={result.avoid} />}
            {result?.plan?.fact_check && <FactCheckPanel factCheck={result.plan.fact_check} />}
            <SustainabilityPanel sustain={sustain} />
            {!!result?.picks?.length && (
                <Panel title="How your farm could look through the year" icon={Film}>
                    <FarmPreview farm={result.farm} picks={result.picks} />
                </Panel>
            )}
            {!!result?.picks?.length && <MoneyPanel picks={result.picks} farm={result.farm} />}
            {view.ranking && <CropRanking ranking={view.ranking} plan={result?.plan} chosen={result?.picks} />}
            <LandFacts site={view.site || {}} running={running} />
            {result && <HelpPanel />}

            {result && (
                <div className="flex flex-wrap gap-3 print:hidden">
                    {topCrop && (
                        <Link to={`/crop-care?crop=${encodeURIComponent(topCrop.name)}&location=${encodeURIComponent(f.placeName || '')}&acres=${result.picks?.[0]?.acres ?? ''}`}
                            className="px-5 py-3 rounded-xl bg-green-600 hover:bg-green-500 font-semibold">
                            Care for {topCrop.name.toLowerCase()} through the season →
                        </Link>
                    )}
                    <Link to={`/climate-risk?lat=${f.lat}&lon=${f.lon}${topPick ? `&crop=${topPick}` : ''}`}
                        className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 font-semibold">
                        Check this month’s climate risk →
                    </Link>
                    <button onClick={() => window.print()} className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2">
                        <Printer className="w-4 h-4" /> Print or save as PDF
                    </button>
                    <Link to="/plan-farm" className="px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2">
                        <RotateCcw className="w-4 h-4" /> Plan another piece of land
                    </Link>
                </div>
            )}
        </div>
    );
}
