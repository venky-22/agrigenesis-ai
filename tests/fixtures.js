// Measured data for a parcel like Sam's (98 acres near Pugwash, NS), in the shapes the
// data tools return. Used by the tests to check the rules give the results shown in the demo.

export const normals = { available: true, frostFreeDays: 156, gdd5: 1600, lastSpringFrost: 'May 11', firstFallFrost: 'Oct 15' };
export const soil = { available: true, pH: 5.4, texture: 'sandy loam', clayPct: 10, sandPct: 60, organicCarbonGkg: 24, provider: 'aafc' };
export const terrain = { slopePct: 3.7, slopeClass: 'gentle' };
export const landCover = {
    available: true, latestYear: 2024, main: 'Hay and pasture',
    farmlandPct: 85, shrubPct: 6, forestPct: 9, wetlandPct: 0, waterPct: 0, developedPct: 0, history: [],
};

export const goals = { goal: 'income', experience: 'new', budget: 'low', time: 'parttime' };

// The same data wrapped the way the agent stores it ({ data } per tool)
export const site = {
    normals: { data: normals }, soil: { data: soil }, terrain: { data: terrain }, landCover: { data: landCover },
};
