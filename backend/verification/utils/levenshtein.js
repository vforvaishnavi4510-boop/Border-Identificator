/**
 * Levenshtein distance and similarity calculation for resilient OCR vs QR/MRZ cross-matching.
 */

export function levenshteinDistance(a = "", b = "") {
  const s1 = String(a).toUpperCase().trim();
  const s2 = String(b).toUpperCase().trim();

  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const row = Array(s2.length + 1).fill(0);
  for (let j = 0; j <= s2.length; j++) {
    row[j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    let prev = i;
    for (let j = 1; j <= s2.length; j++) {
      let val;
      if (s1[i - 1] === s2[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[s2.length] = prev;
  }

  return row[s2.length];
}

export function stringSimilarity(a = "", b = "") {
  const s1 = String(a).toUpperCase().trim();
  const s2 = String(b).toUpperCase().trim();

  if (!s1 && !s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1 === s2) return 1.0;

  const maxLen = Math.max(s1.length, s2.length);
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Checks if target is contained in source with fuzzy tolerance.
 */
export function fuzzyIncludes(source = "", target = "", threshold = 0.75) {
  const src = String(source).toUpperCase().replace(/\s+/g, " ");
  const tgt = String(target).toUpperCase().replace(/\s+/g, " ").trim();

  if (!tgt) return true;
  if (src.includes(tgt)) return true;

  // Sliding window over source words
  const srcWords = src.split(" ");
  const tgtWords = tgt.split(" ");
  const windowLen = tgtWords.length;

  if (srcWords.length >= windowLen) {
    for (let i = 0; i <= srcWords.length - windowLen; i++) {
      const chunk = srcWords.slice(i, i + windowLen).join(" ");
      if (stringSimilarity(chunk, tgt) >= threshold) {
        return true;
      }
    }
  }

  return stringSimilarity(src, tgt) >= threshold;
}
