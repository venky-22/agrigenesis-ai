
/** A crop id from src/agent/crops.js (the 14 Nova Scotia crops). */
export type CropType = string;
export type SoilType = 'clay' | 'sandy' | 'loamy' | 'silt' | 'peaty' | 'chalky';

export interface RiskRequest {
  latitude: number;
  longitude: number;
  cropType: CropType;
  soilType: SoilType;
  /** Optional past month to look back at, 'YYYY-MM'. Default: the last 30 days. */
  month?: string;
}

export interface WeatherDataPoint {
  date: string;
  maxTemp: number;
  precipitation: number;
}

export interface NDVIPoint {
  date: string;
  value: number;
}

export interface ForecastDataPoint {
  date: string;
  temp: number;
  condition: string;
}

export interface PlantingSuggestion {
  crop: string;
  suitability: 'High' | 'Medium';
  reason: string;
  imageUrl?: string;
}

export interface RiskAssessment {
  score: number;
  category: 'Low' | 'Moderate' | 'High' | 'Severe';
  indices: {
    heatStress: number;
    droughtIndex: number;
    vegetationStress: number;
  };
  ndvi: number | null;
  ndviDate: string | null;
  ndviCounted: boolean;
  historicalData: WeatherDataPoint[];
  historicalNdvi: NDVIPoint[];
  forecast: ForecastDataPoint[];
  aiExplanation: string;
  plantingSuggestions: PlantingSuggestion[];
  timestamp: string;
  /** Set when the score is for a past month instead of the last 30 days. */
  period?: { month: string; label: string } | null;
}

/**
 * How strongly heat and drought hurt each crop, relative to an average crop (1.0).
 * Guideline values: shallow roots and fruit set during summer raise sensitivity;
 * deep-rooted perennials and cool-season grains lower it.
 */
export const CROP_SENSITIVITY: Record<string, { factor: number; why: string }> = {
  potatoes: { factor: 1.15, why: 'tubers stop forming in heat and need steady moisture' },
  strawberries: { factor: 1.2, why: 'shallow roots dry out fast' },
  'mixed-veg': { factor: 1.15, why: 'many shallow-rooted vegetables' },
  carrots: { factor: 1.0, why: 'average sensitivity' },
  brassicas: { factor: 1.1, why: 'cool-season crop that bolts in heat' },
  'sweet-corn': { factor: 1.0, why: 'heat-loving but needs water at tasselling' },
  squash: { factor: 1.0, why: 'heat-loving, deep roots' },
  garlic: { factor: 0.9, why: 'grows mostly in spring, harvested by July' },
  apples: { factor: 0.95, why: 'deep-rooted trees; heat affects fruit size' },
  'wild-blueberries': { factor: 1.05, why: 'shallow rhizomes on sandy soil' },
  haskap: { factor: 0.9, why: 'fruits in June, before summer heat' },
  grapes: { factor: 0.85, why: 'deep roots; likes warmth' },
  forage: { factor: 0.85, why: 'perennial grasses recover after dry spells' },
  cereals: { factor: 0.9, why: 'cool-season grain, harvested in August' },
};
