/**
 * Verhoeff algorithm implementation for validating Indian Aadhaar (12-digit UID) check digits.
 * Based on Dihedral group D5 multiplication table and permutation matrix.
 */

const dTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

const pTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

const invTable = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates whether a given 12-digit Aadhaar number satisfies the Verhoeff checksum.
 * @param {string} numStr 
 * @returns {boolean}
 */
export function validateVerhoeff(numStr) {
  if (!numStr) return false;
  const clean = String(numStr).replace(/\s+/g, "");
  if (!/^\d{12}$/.test(clean)) return false;

  let c = 0;
  const digits = clean.split("").reverse().map(Number);

  for (let i = 0; i < digits.length; i++) {
    c = dTable[c][pTable[i % 8][digits[i]]];
  }

  return c === 0;
}

/**
 * Generates the Verhoeff check digit for an 11-digit prefix.
 * @param {string} numStr 
 * @returns {number}
 */
export function generateVerhoeff(numStr) {
  const clean = String(numStr).replace(/\s+/g, "");
  let c = 0;
  const digits = clean.split("").reverse().map(Number);

  for (let i = 0; i < digits.length; i++) {
    c = dTable[c][pTable[(i + 1) % 8][digits[i]]];
  }

  return invTable[c];
}
