// Crop Care AI service, using the shared Adaption client in src/services/ai.js.
import { Message, CropRisk } from "../types";
import { aiText, aiJSON } from "../../../services/ai";
// @ts-ignore - shared JS modules
import { planFacts, cropIdFromName } from "../../../agent/planContext";
// @ts-ignore
import { incomeEstimate } from "../../../agent/economics";

/** Today's date plus the verified facts from the saved farm plan, added to every prompt. */
const grounding = () => {
  const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  const facts = planFacts();
  return `Today is ${today}. Location: Nova Scotia, Canada. Use metric units and Canadian dollars.${facts ? `\n\n${facts}` : ''}`;
};

export const analyzeCropRisk = async (crop: string, location: string): Promise<{ risks: CropRisk[], explanation: string }> => {
  return aiJSON({
    system: `You are an agricultural climate risk analyst. Base scores on the verified facts and the season we are in now; do not invent data.\n\n${grounding()}`,
    temperature: 0,
    prompt: `Analyze climate risks for ${crop} in ${location}. Return a JSON object with this exact structure:
{
  "risks": [
    {"label": "Heat", "score": <0-100>, "color": "#ff6b35", "description": "description here"},
    {"label": "Drought", "score": <0-100>, "color": "#f7931e", "description": "description here"},
    {"label": "Flood", "score": <0-100>, "color": "#4a90e2", "description": "description here"},
    {"label": "Frost", "score": <0-100>, "color": "#7dd3fc", "description": "description here"}
  ],
  "explanation": "brief explanation here"
}`,
  });
};

export const getPlantHealthDiagnosis = async (imageData: string, mimeType: string): Promise<string> => {
  const text = await aiText({
    system: `You are a plant pathologist helping a small-scale farmer. Use plain language. If you are not sure between similar diseases, say so and explain how to tell them apart.\n\n${grounding()}`,
    image: `data:${mimeType};base64,${imageData}`,
    prompt: "Diagnose this plant's health. Identify the plant if you can, then any diseases, pests, or nutrient deficiencies visible. Say how confident you are, and suggest organic and chemical treatments if applicable. If the photo is unclear, say what photo would help.",
    temperature: 0.4,
  });
  return text || "Unable to diagnose plant health.";
};

export const generateFarmVisualization = async (_prompt: string): Promise<string | undefined> => {
  return undefined; // image generation not supported by the text models
};

export const getWeatherForecast = async (crop: string, location: string) => {
  const text = await aiText({
    system: `You are a helpful agricultural weather assistant. You do not have live data, so frame this as typical conditions and seasonal guidance, and point the farmer to the live 7-day forecast on the page for actual numbers.\n\n${grounding()}`,
    prompt: `Give agricultural weather guidance for ${location} for this week, focused on ${crop} farming (temperature, humidity, precipitation, wind, frost risk). Include any relevant farming advice for this time of year. Use metric units.`,
  });
  return { text, sources: [] as any[] };
};

export const getChatResponse = async (history: Message[], userInput: string, context?: any) => {
  const text = await aiText({
    system: `You are the AgriGenesis farm assistant, an expert agricultural consultant. Help farmers with crop management, weather risks, and sustainable practices. Farm context: ${JSON.stringify(context)}. Be concise, practical, and supportive. For planting dates, use the official last spring frost in the verified facts (plant frost-tender crops after it). If you don't know something, say so.\n\n${grounding()}`,
    history: history.map(msg => ({ role: msg.role === 'model' ? 'assistant' : 'user', content: msg.content })),
    prompt: userInput,
    temperature: 0.3,
  });
  return { text, sources: [] as any[] };
};

export interface YieldPrediction {
  expectedYield: {
    low: number;
    medium: number;
    high: number;
    unit: string;
  };
  confidence: number;
  harvestDate: string;
  revenueProjection: {
    low: number;
    medium: number;
    high: number;
  };
  factors: {
    positive: string[];
    negative: string[];
  };
  regionalAverage: number;
  recommendations: string[];
  lastUpdated: string;
  revenueSource?: string;
}

export const predictYield = async (
  crop: string,
  location: string,
  fieldSize: string,
  risks: CropRisk[]
): Promise<YieldPrediction> => {
  const currentDate = new Date().toISOString().split('T')[0];
  const risksContext = risks.map(r => `${r.label}: ${r.score}% (${r.description})`).join(', ');
  const prediction: YieldPrediction = await aiJSON({
    system: `You are an agricultural data scientist. Use realistic Nova Scotia figures; never invent precision.\n\n${grounding()}`,
    temperature: 0,
    prompt: `Predict crop yield for ${crop} in ${location} (field size: ${fieldSize}).

Current date: ${currentDate}
Current risk factors: ${risksContext}

Rules: expectedYield and regionalAverage are PER ACRE and must be realistic for this crop in Nova Scotia (for example, Statistics Canada reports Nova Scotia potatoes at 250-311 hundredweight per acre in 2021-2025, about 12.5-15.5 tons per acre). harvestDate must be the next realistic harvest for this crop in Nova Scotia, not necessarily this month. Return JSON with this exact structure:
{
  "expectedYield": { "low": <number>, "medium": <number>, "high": <number>, "unit": "bushels" or "tons" or "pounds" },
  "confidence": <number 0-100>,
  "harvestDate": "YYYY-MM-DD",
  "revenueProjection": { "low": <number>, "medium": <number>, "high": <number> },
  "factors": { "positive": ["factor1", "factor2"], "negative": ["factor1", "factor2"] },
  "regionalAverage": <number>,
  "recommendations": ["rec1", "rec2", "rec3"],
  "lastUpdated": "${currentDate}"
}`,
  });

  // Revenue never comes from the AI: use Statistics Canada farm-gate values for Nova Scotia when available
  const acres = parseFloat(fieldSize) || 0;
  const income = incomeEstimate(cropIdFromName(crop), acres);
  if (income && !income.yieldOnly) {
    prediction.revenueProjection = { low: income.low, medium: Math.round((income.low + income.high) / 2), high: income.high };
    prediction.revenueSource = `Statistics Canada, Nova Scotia average farm-gate value ${income.period} (${income.perAcreText})`;
  } else {
    prediction.revenueProjection = { low: 0, medium: 0, high: 0 };
    prediction.revenueSource = 'No published Nova Scotia price for this crop, so no revenue is shown.';
  }
  return prediction;
};
