export function metascoreTone(score) {
  return score >= 61 ? "positive" : score >= 40 ? "mixed" : "negative";
}

export function tomatoTone(score) {
  return score >= 60 ? "fresh" : "rotten";
}
