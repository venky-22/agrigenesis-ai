import React, { useEffect, useState } from 'react';
// @ts-ignore
import { estimateCostsAI } from '../../../agent/aiCosts';
// @ts-ignore - shared JS modules
import { profitEstimate } from '../../../agent/economics';
// @ts-ignore
import { cropIdFromName } from '../../../agent/planContext';
// @ts-ignore
import IncomeHistory from '../../../components/IncomeHistory';

interface FarmMoneyProps {
  cropType: string;
  fieldSize: string;
}

/**
 * Income, cost and profit for this crop and field size, from published sources only:
 * Statistics Canada (Nova Scotia farm-gate values) and government cost-of-production studies.
 */
const FarmMoney: React.FC<FarmMoneyProps> = ({ cropType, fieldSize }) => {
  const acres = parseFloat(fieldSize) || 0;
  const cropId = cropIdFromName(cropType);
  const { income, cost, profit } = cropId ? profitEstimate(cropId, acres) : { income: null, cost: null, profit: null };
  const [ai, setAi] = useState<any>(null);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  useEffect(() => {
    if (!cropId || !acres) return;
    let alive = true;
    setAiState('loading');
    estimateCostsAI([{ crop_id: cropId, acres }])
      .then((r: any[]) => { if (alive) { setAi(r[0] || null); setAiState('done'); } })
      .catch(() => alive && setAiState('error'));
    return () => { alive = false; };
  }, [cropId, acres]);

  const Box = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: string }) => (
    <div className={`rounded-xl p-4 border ${tone}`}>
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <i className="fas fa-sack-dollar text-emerald-400"></i> Money for {acres} acre{acres === 1 ? '' : 's'} of {cropType.toLowerCase()} (CAD, per year)
        </h3>
        <p className="text-sm text-slate-400 mt-1"><span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 mr-2">Not guessed</span>Published figures first, then a separate AI estimate.</p>
      </div>

      {!cropId ? (
        <p className="text-amber-200 text-sm">No published Nova Scotia figures for “{cropType}”. Pick one of the Nova Scotia crops from your farm plan to see income and costs.</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Box label={income && !income.yieldOnly ? `Income (${income.latest.year} report)` : 'Income'} tone="border-emerald-500/30 bg-emerald-500/10"
              value={income?.yieldOnly ? 'No price' : income ? income.latest.text : '—'}
              sub={income?.yieldOnly ? income.text : income ? `${income.latest.perAcreText}${income.change ? ` · ${income.change.pct > 0 ? '+' : ''}${income.change.pct}% vs ${income.change.fromYear}` : ''} · range ${income.period}: ${income.text}` : 'Not published'} />
            <Box label="Cost" tone="border-orange-500/30 bg-orange-500/10"
              value={cost ? cost.text : 'Not published'}
              sub={cost ? cost.perAcreText : 'No Canadian cost study found for this crop'} />
            <Box label={profit ? `Profit (${profit.latest.year} report)` : 'Profit'} tone={profit && profit.latest.high < 0 ? 'border-red-500/30 bg-red-500/10' : 'border-sky-500/30 bg-sky-500/10'}
              value={profit ? profit.latest.text : '—'}
              sub={profit ? `Range ${income.period}: ${profit.text}` : 'Needs both income and cost'} />
          </div>
          <ul className="text-xs text-slate-400 space-y-1">
            {cost?.note && <li>• {cost.note}</li>}
            {income && !income.yieldOnly && <li>• Income: Nova Scotia average farm-gate value, latest report {income.latest.year}; range {income.period}. First-year growers usually earn less.</li>}
            <li>• Sources:{' '}
              {income?.tables?.map((t: { id: string; url: string }) => (
                <a key={t.id} href={t.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline mr-2">Statistics Canada {t.id}</a>
              ))}
              {cost && <a href={cost.source.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">{cost.source.name}</a>}
            </li>
          </ul>
          <IncomeHistory className="text-slate-300" rows={[{ key: cropId, label: cropType, income, profit }]} />
        </>
      )}

      {cropId && (
        <div className="border-t border-slate-700/50 pt-4 space-y-2">
          <p className="text-sm font-semibold text-slate-200"><span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 mr-2">AI estimate</span>Costs and profit for a small Nova Scotia grower</p>
          {aiState === 'loading' && <p className="text-xs text-slate-400">Estimating…</p>}
          {aiState === 'error' && <p className="text-xs text-red-300">The AI estimate is not available right now.</p>}
          {aiState === 'done' && (!ai || ai.failed) && <p className="text-xs text-slate-400">No usable AI estimate.</p>}
          {aiState === 'done' && ai && !ai.failed && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <Box label="AI cost" tone="border-amber-500/30 bg-amber-500/10" value={ai.costText} sub={ai.perAcreText} />
                <Box label="Income used" tone="border-slate-600 bg-slate-700/30" value={ai.income?.text || '—'} sub={ai.income ? (ai.income.from === 'statcan' ? `Statistics Canada, ${ai.income.year} report` : 'AI estimate (no official price)') : ''} />
                <Box label="AI profit" tone="border-amber-500/30 bg-amber-500/10" value={ai.profitText || '—'} sub="Rough guide, not a fact" />
              </div>
              <p className="text-xs text-slate-400">Main costs per acre: {ai.items.map((i: any) => `${i.item} ${i.perAcre}`).join(' · ')}. {ai.assumptions}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FarmMoney;
