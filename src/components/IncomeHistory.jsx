// Year-by-year Statistics Canada figures (2021–2025) for each crop, scaled to the plot size.
// Shows income, and profit where a published cost study exists. Suppressed years are marked.

const YEARS = [2021, 2022, 2023, 2024, 2025];

export default function IncomeHistory({ rows, className = '' }) {
    // rows: [{ key, label, income, profit }]  (income/profit from economics.profitEstimate)
    const usable = rows.filter((r) => r.income);
    if (!usable.length) return null;
    const max = Math.max(1, ...usable.flatMap((r) => (r.income.yieldOnly ? [] : r.income.history.filter((h) => !h.suppressed).map((h) => h.total))));
    return (
        <div className={className}>
            <h4 className="font-semibold text-sm mb-1">Year by year (Statistics Canada reports, 2021–2025)</h4>
            <p className="text-xs opacity-70 mb-3">Income for your plot size in each reported year. Profit is shown where a published cost study exists (cost held at the study figure). The latest year is highlighted.</p>
            <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[600px]">
                    <thead className="text-left opacity-70">
                        <tr>
                            <th className="py-1.5 pr-3">Crop</th>
                            {YEARS.map((y) => <th key={y} className="py-1.5 pr-3">{y}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 align-top">
                        {usable.map((r) => {
                            const latestYear = r.income.latest?.year;
                            return (
                                <tr key={r.key}>
                                    <td className="py-2 pr-3 font-semibold whitespace-nowrap">{r.label}</td>
                                    {r.income.history.map((h) => {
                                        const isLatest = h.year === latestYear;
                                        const cell = `py-2 pr-3 ${isLatest ? 'bg-emerald-500/10' : ''}`;
                                        if (h.suppressed) return <td key={h.year} className={`${cell} opacity-50`} title="Statistics Canada did not publish this value (confidential or too unreliable)">not published</td>;
                                        if (r.income.yieldOnly) return <td key={h.year} className={cell}>{h.text}<div className="opacity-60">no price</div></td>;
                                        const p = r.profit?.history.find((x) => x.year === h.year);
                                        return (
                                            <td key={h.year} className={cell}>
                                                <div className="h-1.5 rounded bg-emerald-400/70 mb-1" style={{ width: `${Math.max(6, (h.total / max) * 100)}%` }} />
                                                <b className={isLatest ? 'text-emerald-300' : ''}>{h.text}</b>
                                                <div className="opacity-60">{h.perAcreText}</div>
                                                {p && <div className={p.value < 0 ? 'text-red-300' : 'text-sky-300'}>profit {p.text}</div>}
                                                {isLatest && <div className="text-emerald-300 font-semibold">latest</div>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
