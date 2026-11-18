import React from 'react';
import { ArrowRight, Droplets, Sun, Sprout, ExternalLink, MapPin, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

// Facts behind the problem, each linked to its source
const NSFA = 'https://nsfa-fane.ca/wp-content/uploads/2026/03/Report_SuccessionPlan_2026.pdf';
const STATCAN = 'https://www150.statcan.gc.ca/n1/pub/96-325-x/2021001/article/00003-eng.htm';
const FACTS = [
    { big: '280,000 acres', text: 'over a quarter of Nova Scotia’s farmland, expected to change hands by 2033', source: 'NS Federation of Agriculture, 2026', url: NSFA },
    { big: '35.7%', text: 'of farmers have no successor in mind, although 79% want their farm to keep going', source: 'NS Federation of Agriculture, 2026', url: NSFA },
    { big: '58.2 years', text: 'average age of Nova Scotia farm operators, the oldest in Canada; only 8.1% of farms have a succession plan', source: 'Statistics Canada, 2021 Census', url: STATCAN },
    { big: '−21.2%', text: 'of Nova Scotia’s farms lost from 2016 to 2021 (down to 2,741), the biggest drop in Canada', source: 'Statistics Canada, 2021 Census', url: STATCAN },
];

const Landing = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-10 py-6">

            {/* Hero Section */}
            <div className="space-y-6 max-w-4xl relative">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium"
                >
                    <Sprout className="w-4 h-4" />
                    <span>Free · for your exact field · every number sourced</span>
                </motion.div>

                <motion.h1
                    className="text-5xl md:text-7xl font-bold tracking-tight text-white"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                >
                    Nova Scotia’s farmland is <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-500 to-teal-500">
                        changing hands
                    </span>
                </motion.h1>

                <motion.p
                    className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    A quarter of the province’s farmland will get a new owner by 2033, and a third of farmers have no one to take over.
                    The next person on the land often doesn’t know what it can do, so it is sold or left idle.
                    AgriGenesis AI turns <i>“I have land but no idea”</i> into <i>“I know where to start”</i>.
                </motion.p>
            </div>

            {/* The facts behind it */}
            <motion.div
                className="w-full max-w-5xl space-y-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {FACTS.map((f) => (
                        <a key={f.big} href={f.url} target="_blank" rel="noreferrer"
                            className="group rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 text-left hover:border-green-500/40 transition-colors">
                            <p className="text-3xl md:text-4xl font-bold text-white">{f.big}</p>
                            <p className="text-sm text-muted-foreground mt-2 leading-snug">{f.text}</p>
                            <p className="text-[11px] text-green-400/80 mt-3 flex items-center gap-1 group-hover:underline">
                                {f.source} <ExternalLink className="w-3 h-3" />
                            </p>
                        </a>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground max-w-3xl mx-auto">
                    Farmland is mostly not lost because of soil or climate. It is lost when farms change hands and the next person can’t make a plan work.
                    New and inheriting farmers are “uncertain about assuming the risks” and Nova Scotia “lacks a centralized resource hub”
                    (<a className="underline" href={NSFA} target="_blank" rel="noreferrer">NSFA, 2026</a>).
                </p>
            </motion.div>

            {/* What AgriGenesis does */}
            <motion.div
                className="w-full max-w-4xl rounded-3xl border border-green-500/20 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-sky-500/10 p-6 md:p-8 space-y-5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                <h2 className="text-2xl md:text-3xl font-bold text-white">A free first-year plan for your land, in minutes</h2>
                <div className="grid sm:grid-cols-3 gap-4 text-left text-sm">
                    <Step icon={MapPin} title="Show us the land" text="Type the address, your PID, or use a photo taken on the land. Add the size from your tax notice." />
                    <Step icon={Search} title="The agent researches it" text="Official frost dates, Agriculture Canada soil, slope, NASA satellite greenness, land use and Statistics Canada prices." />
                    <Step icon={ShieldCheck} title="Then checks itself" text="Crops, money, first steps and a 12-month calendar, fact-checked against the data before you see it." />
                </div>
                <Link
                    to="/plan-farm"
                    className="group relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full bg-white px-8 font-medium text-black transition-all duration-300 hover:bg-white/90 hover:ring-2 hover:ring-white/50 hover:ring-offset-2 hover:ring-offset-background"
                >
                    <span className="mr-2">Plan my land</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Link>
            </motion.div>

            {/* Feature Grid */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl pt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
            >
                <FeatureCard
                    to="/plan-farm"
                    icon={Sprout}
                    title="1. Plan Farm"
                    desc="Outline your field and set your goals. The agent researches real public data and ranks Nova Scotia crops, with first steps and a 12-month calendar."
                    color="text-green-400"
                    bg="bg-green-500/10"
                />
                <FeatureCard
                    to="/climate-risk"
                    icon={Sun}
                    title="2. Climate Risk"
                    desc="Heat, drought and real satellite greenness from 30 days of weather and the 7-day forecast, plus crops to plant now."
                    color="text-yellow-400"
                    bg="bg-yellow-500/10"
                />
                <FeatureCard
                    to="/crop-care"
                    icon={Droplets}
                    title="3. Crop Care"
                    desc="Through the season: diagnose plant photos, live forecast with frost alerts, yield and cost projections, and a farm chat assistant."
                    color="text-cyan-400"
                    bg="bg-cyan-500/10"
                />
            </motion.div>
        </div>
    );
};

const Step = ({ icon: Icon, title, text }) => (
    <div className="rounded-2xl bg-black/20 border border-white/5 p-4 space-y-2">
        <div className="p-2 rounded-lg w-fit bg-green-500/15"><Icon className="w-5 h-5 text-green-400" /></div>
        <p className="font-semibold text-white">{title}</p>
        <p className="text-muted-foreground leading-relaxed">{text}</p>
    </div>
);

const FeatureCard = ({ to, icon: Icon, title, desc, color, bg }) => (
    <Link to={to} className="block p-6 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors text-left space-y-4">
        <div className={`p-3 rounded-xl w-fit ${bg}`}>
            <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{desc}</p>
        </div>
    </Link>
);

export default Landing;
