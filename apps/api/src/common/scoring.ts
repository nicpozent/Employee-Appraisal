/* Scoring (§4). Rating fields 1–5; section score = mean of rated fields;
   overall weighted score (0–100) over rating sections with weight>0. */

export interface ScoredSection {
  type: string;
  weight: number;
  fieldIds: string[];
}

export function sectionMean(fieldIds: string[], ratings: Record<string, number>): number | null {
  const vals = fieldIds.map((id) => ratings[id]).filter((v) => typeof v === 'number' && v > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function overallScore(sections: ScoredSection[], ratings: Record<string, number>): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const s of sections) {
    if (s.type !== 'rating' || s.weight <= 0) continue;
    const mean = sectionMean(s.fieldIds, ratings);
    if (mean == null) continue;
    weighted += (mean / 5) * s.weight;
    totalWeight += s.weight;
  }
  if (totalWeight === 0) return 0;
  return Math.round((weighted / totalWeight) * 100);
}

export function completionPct(sections: ScoredSection[], ratings: Record<string, number>, texts: Record<string, string>): number {
  const allFields = sections.flatMap((s) => s.fieldIds.map((id) => ({ id, type: s.type })));
  if (allFields.length === 0) return 0;
  let done = 0;
  for (const f of allFields) {
    if (f.type === 'rating' || f.type === 'number') {
      if (typeof ratings[f.id] === 'number' && ratings[f.id] > 0) done++;
    } else {
      if (texts[f.id] && String(texts[f.id]).trim().length > 0) done++;
    }
  }
  return Math.round((done / allFields.length) * 100);
}
