import {
  RiskRequest,
  RiskAssessment,
  WeatherDataPoint,
  ForecastDataPoint,
  CROP_SENSITIVITY,
  CropType,
  SoilType,
  PlantingSuggestion,
  NDVIPoint
} from '../types';

// AI calls go through the shared Adaption client (key stays server-side).
import { aiText, aiJSON, AI_ENABLED } from "../../../services/ai";
// Real satellite greenness (NASA MODIS NDVI), shared with the Plan Farm agent
import { getVegetation } from "../../../agent/data";
// @ts-ignore - shared JS modules
import { cropById } from "../../../agent/crops";
// @ts-ignore
import { planFacts } from "../../../agent/planContext";

const cropName = (id: string) => cropById(id)?.name || id;

export const calculateRisk = async (req: RiskRequest): Promise<RiskAssessment> => {
  const { latitude, longitude, cropType, soilType, month: pastMonth } = req;
  // A past month uses that month's real weather archive; otherwise the last 30 days.
  const period = pastMonth ? monthRange(pastMonth) : null;

  const [historical, forecast, vegetation] = await Promise.all([
    fetchHistoricalWeather(latitude, longitude, period?.start, period?.end),
    fetchForecastWeather(latitude, longitude),
    getVegetation(latitude, longitude).catch(() => null)
  ]);

  // Real NDVI readings. Cloudy/snowy readings are already removed.
  const historicalNdvi: NDVIPoint[] = (vegetation?.data?.series || []).map((p: { date: string; ndvi: number }) => ({ date: p.date, value: p.ndvi }));
  // For a past month, use the clear satellite reading taken in that month (if any).
  const inMonth = period ? historicalNdvi.filter((p) => p.date >= period.start && p.date <= period.end) : [];
  const latestNdvi: number | null = period ? (inMonth.at(-1)?.value ?? null) : vegetation?.data?.available ? vegetation.data.latest : null;
  const latestNdviDate: string | null = period ? (inMonth.at(-1)?.date ?? null) : vegetation?.data?.latestDate || null;
  const peakNdvi: number | null = vegetation?.data?.summerPeak ?? null;
  const month = period ? period.monthNum : new Date().getMonth() + 1;
  const growingSeason = month >= 5 && month <= 9;

  const avgMaxTemp = historical.reduce((acc, d) => acc + d.maxTemp, 0) / historical.length;
  const forecastHeatWaves = period ? 0 : forecast.filter(f => f.temp > 35).length; // the forecast only counts for 'now'
  const baseHeat = Math.min(Math.max((avgMaxTemp - 15) / 25, 0), 1);
  const heatStress = Math.min(baseHeat + (forecastHeatWaves * 0.1), 1);

  const totalRain = historical.reduce((acc, d) => acc + d.precipitation, 0);
  const droughtIndex = Math.min(Math.max((100 - totalRain) / 100, 0), 1);

  // Plants losing green during the growing season (vs. last summer's peak) signals stress.
  // Outside May–September, browning is normal, so satellite greenness is not counted.
  const ndviCounts = growingSeason && latestNdvi != null && peakNdvi != null;
  const vegetationStress = ndviCounts ? Math.min(Math.max((peakNdvi! - latestNdvi!) / 0.4, 0), 1) : 0;

  const rawScore = ndviCounts
    ? (0.4 * heatStress) + (0.35 * droughtIndex) + (0.25 * vegetationStress)
    : (0.53 * heatStress) + (0.47 * droughtIndex);
  const multiplier = CROP_SENSITIVITY[cropType]?.factor ?? 1.0;
  const finalScore = Math.min(Math.round(rawScore * 100 * multiplier), 100);

  let category: RiskAssessment['category'] = 'Low';
  if (finalScore > 75) category = 'Severe';
  else if (finalScore > 50) category = 'High';
  else if (finalScore > 25) category = 'Moderate';

  const [aiExplanation, baseSuggestions] = await Promise.all([
    generateAIExplanation(cropType, soilType, finalScore, { heatStress, droughtIndex, vegetationStress }, latestNdvi, ndviCounts, period?.label),
    generatePlantingSuggestions(latitude, longitude, soilType, historical, forecast)
  ]);

  const plantingSuggestions = await Promise.all(
    baseSuggestions.map(async (suggestion) => {
      const images = await fetchPlantImages(suggestion.crop);
      return { ...suggestion, imageUrl: images?.[0] || null };
    })
  );

  return {
    score: finalScore,
    category,
    indices: {
      heatStress: Number(heatStress.toFixed(2)),
      droughtIndex: Number(droughtIndex.toFixed(2)),
      vegetationStress: Number(vegetationStress.toFixed(2))
    },
    ndvi: latestNdvi,
    ndviDate: latestNdviDate,
    ndviCounted: ndviCounts,
    historicalData: historical,
    historicalNdvi,
    forecast,
    aiExplanation,
    plantingSuggestions,
    timestamp: new Date().toISOString(),
    period: period ? { month: pastMonth!, label: period.label } : null
  };
};

/** 'YYYY-MM' -> first and last day, the month number and a label like 'July 2026'. */
function monthRange(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const label = new Date(Date.UTC(y, mo - 1, 15)).toLocaleString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { start: `${m}-01`, end: `${m}-${String(last).padStart(2, '0')}`, monthNum: mo, label };
}

// ---------------- AI EXPLANATIONS ----------------

async function generateAIExplanation(
  crop: CropType,
  soil: SoilType,
  score: number,
  indices: { heatStress: number; droughtIndex: number; vegetationStress: number },
  ndvi: number | null,
  ndviCounted: boolean,
  pastLabel?: string
): Promise<string> {

  if (!AI_ENABLED) {
    return `Analysis for ${cropName(crop)} in ${soil} soil indicates a ${score}/100 risk level. Moisture management is important.`;
  }

  try {
    const text = await aiText({
      system: `You are an agricultural climate risk expert. Write in plain language for a small-scale farmer. Today is ${new Date().toDateString()}.\n\n${planFacts()}`,
      temperature: 0.6,
      prompt: `
Generate a 2-3 sentence climate risk explanation for a farmer growing ${cropName(crop)} in ${soil} soil, ${pastLabel ? `looking back at ${pastLabel} (a past month of measured weather on this land; the farmer did not grow this crop here then, so say what that weather would have meant for it and how to prepare next year)` : 'for the season we are in now'}.

Risk Score: ${score}/100
Heat Stress: ${indices.heatStress}
Drought Index: ${indices.droughtIndex}
Vegetation Stress: ${indices.vegetationStress}
Satellite greenness (NASA MODIS NDVI, latest): ${ndvi ?? 'no clear reading'}${ndviCounted ? '' : ' (outside the growing season, so not counted in the score)'}\nKeep it to plain words; do not invent numbers.
`,
    });
    return text || "AI insights unavailable.";
  } catch (error) {
    console.error("AI Explanation Error:", error);
    return "Insights unavailable.";
  }
}

// ---------------- PLANTING SUGGESTIONS ----------------

async function generatePlantingSuggestions(
  lat: number,
  lon: number,
  soil: SoilType,
  historical: WeatherDataPoint[],
  forecast: ForecastDataPoint[]
): Promise<PlantingSuggestion[]> {

  if (!AI_ENABLED) {
    return []; // no AI: show nothing rather than generic examples
  }

  try {
    const recentRain = historical.reduce((acc, d) => acc + (d.precipitation || 0), 0).toFixed(0);
    const nextWeek = forecast.map(f => `${f.date}: ${f.temp}°C ${f.condition}`).join('; ');
    return await aiJSON({
      temperature: 0,
      system: `You advise small farms in Nova Scotia. Only suggest things a farmer can realistically plant outdoors in Nova Scotia this month (in late fall that means garlic, fall rye or other cover crops; in winter, nothing outdoors). If nothing can be planted outdoors now, say so in the reason and suggest what to prepare instead.\n\n${planFacts()}`,
      prompt: `
Suggest up to 3 crops suitable for planting now (today is ${new Date().toISOString().slice(0, 10)}) at:
Latitude: ${lat}
Longitude: ${lon}
Soil: ${soil}
Rain in the last 30 days: ${recentRain} mm
Next 7 days: ${nextWeek}

Return a JSON array in this format:
[
  { "crop": "", "suitability": "High or Medium", "reason": "" }
]
`,
    });
  } catch (error) {
    console.error("Suggestions Error:", error);
    return [];
  }
}

// ---------------- PLANT IMAGES ----------------

async function fetchPlantImages(plantName: string): Promise<string[]> {
  // Wikipedia article thumbnail for the crop
  const placeholder = [`https://placehold.co/400x300/1e293b/94a3b8?text=${encodeURIComponent(plantName)}`];
  try {
    // "Winter Garlic" -> "Garlic", otherwise the search lands on "Winter wheat"
    const name = plantName.replace(/\b(winter|spring|summer|fall|autumn|early|late|hardy|cover)\b/gi, '').trim() || plantName;
    // Search a few results and keep the first that Wikipedia describes as a plant, so
    // "Crimson Clover" finds the plant, not the song "Crimson and Clover"
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search` +
      `&gsrsearch=${encodeURIComponent(name + ' plant')}&gsrlimit=5&prop=pageimages|description&piprop=thumbnail&pithumbsize=400`;
    const json = await (await fetch(url)).json();
    const pages: any[] = Object.values(json.query?.pages || {}).sort((a: any, b: any) => a.index - b.index);
    const isPlant = /plant|species|crop|grain|cereal|vegetable|fruit|berr|grass|legume|herb|cultivar|genus|flowering|tuber|root/i;
    const page = pages.find((p) => p.thumbnail?.source && isPlant.test(p.description || ''));
    return page ? [page.thumbnail.source] : placeholder;
  } catch (err) {
    console.error("Wikipedia image fetch error:", err);
    return placeholder;
  }
}

// ---------------- WEATHER DATA ----------------

async function fetchHistoricalWeather(lat: number, lon: number, from?: string, to?: string): Promise<WeatherDataPoint[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);

  const startStr = from || start.toISOString().split('T')[0];
  const endStr = to || end.toISOString().split('T')[0];

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_max,precipitation_sum&timezone=auto`;

  const response = await fetch(url);
  const data = await response.json();
  if (!data.daily) return [];

  return data.daily.time.map((time: string, i: number) => ({
    date: time,
    maxTemp: data.daily.temperature_2m_max[i],
    precipitation: data.daily.precipitation_sum[i]
  }));
}

async function fetchForecastWeather(lat: number, lon: number): Promise<ForecastDataPoint[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,weathercode&timezone=auto`;

  const response = await fetch(url);
  const data = await response.json();
  if (!data.daily) return [];

  return data.daily.time.map((time: string, i: number) => ({
    date: time,
    temp: data.daily.temperature_2m_max[i],
    condition: getWeatherCondition(data.daily.weathercode[i])
  }));
}

function getWeatherCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly Cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  return 'Stormy';
}