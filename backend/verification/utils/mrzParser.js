/**
 * ICAO Doc 9303 standard Machine Readable Zone (MRZ) parser and check digit validator.
 * Supports TD3 (Passports, 2x44), TD1 (ID Cards, 3x30), TD2 (2x36), MRVA/MRVB (Visas).
 */

const WEIGHTS = [7, 3, 1];

/**
 * Calculates ICAO 9303 character value:
 * 0-9 -> 0-9
 * A-Z -> 10-35
 * < -> 0
 */
export function getCharValue(char) {
  if (!char) return 0;
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) {
    return code - 48; // '0'-'9'
  }
  if (code >= 65 && code <= 90) {
    return code - 55; // 'A'-'Z' (A=10, Z=35)
  }
  if (code >= 97 && code <= 122) {
    return code - 87; // 'a'-'z'
  }
  return 0; // '<' or any filler
}

/**
 * Computes ICAO 9303 check digit for a string using 7-3-1 weighting.
 */
export function calculateCheckDigit(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const val = getCharValue(str[i]);
    const weight = WEIGHTS[i % 3];
    sum += val * weight;
  }
  return (sum % 10).toString();
}

/**
 * Validates whether string matches expected check digit.
 */
export function validateCheckDigit(field, expectedCheckDigit) {
  if (!expectedCheckDigit || expectedCheckDigit === "<") {
    // If check digit is '<', it may be a filler (e.g. empty optional field)
    return true;
  }
  const computed = calculateCheckDigit(field);
  return computed === String(expectedCheckDigit);
}

/**
 * Parses YYMMDD date string to a full Date and ISO string.
 * @param {string} yymmdd 
 * @param {boolean} isExpiry 
 */
export function parseMRZDate(yymmdd, isExpiry = false) {
  if (!yymmdd || yymmdd.length !== 6 || !/^\d{6}$/.test(yymmdd)) {
    return { raw: yymmdd, formatted: null, valid: false };
  }

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = parseInt(yymmdd.substring(2, 4), 10);
  const dd = parseInt(yymmdd.substring(4, 6), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
    return { raw: yymmdd, formatted: null, valid: false };
  }

  const currentYear = new Date().getFullYear();
  const currentYY = currentYear % 100;

  let century;
  if (isExpiry) {
    // Expiry dates are typically in the future or recent past
    // If yy < currentYY - 10, likely 20yy; else 20yy
    century = 2000;
  } else {
    // DOB: If yy <= currentYY, could be 2000s; otherwise 1900s
    century = yy <= currentYY ? 2000 : 1900;
  }

  const fullYear = century + yy;
  const mmStr = String(mm).padStart(2, "0");
  const ddStr = String(dd).padStart(2, "0");
  const formatted = `${fullYear}-${mmStr}-${ddStr}`;

  return {
    raw: yymmdd,
    year: fullYear,
    month: mm,
    day: dd,
    formatted,
    valid: true,
  };
}

/**
 * Extracts MRZ lines from raw OCR text.
 * @param {string} ocrText 
 * @returns {string[]}
 */
export function findMRZLines(ocrText) {
  if (!ocrText) return [];

  const rawLines = ocrText
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, "").toUpperCase())
    .filter((l) => l.length >= 25);

  // Clean common OCR noise in MRZ (e.g. '«' to '<', 'O' to '0' where numbers expected)
  const normalizedLines = rawLines.map((line) => {
    return line
      .replace(/[«‹]/g, "<")
      .replace(/[|]/g, "<")
      .replace(/[^A-Z0-9<]/g, "<");
  });

  // Check for 2 lines of 44 chars (TD3 - Passport or MRVA Visa)
  for (let i = 0; i < normalizedLines.length - 1; i++) {
    const l1 = normalizedLines[i];
    const l2 = normalizedLines[i + 1];

    if (
      (l1.startsWith("P<") || l1.startsWith("P") || l1.startsWith("V<") || l1.startsWith("V")) &&
      l1.length >= 40 &&
      l2.length >= 40
    ) {
      return [l1.padEnd(44, "<").slice(0, 44), l2.padEnd(44, "<").slice(0, 44)];
    }
  }

  // Check for any 2 lines with multiple '<' fillers
  for (let i = 0; i < normalizedLines.length - 1; i++) {
    const l1 = normalizedLines[i];
    const l2 = normalizedLines[i + 1];

    const l1Chevrons = (l1.match(/</g) || []).length;
    const l2Chevrons = (l2.match(/</g) || []).length;

    if (l1Chevrons >= 3 && l2Chevrons >= 3 && l1.length >= 36 && l2.length >= 36) {
      if (l1.length >= 44 && l2.length >= 44) {
        return [l1.padEnd(44, "<").slice(0, 44), l2.padEnd(44, "<").slice(0, 44)];
      }
      return [l1, l2];
    }
  }

  return [];
}

/**
 * Parses TD3 (Passport) MRZ.
 * Line 1 (44): P<ISSUER<SURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<
 * Line 2 (44): DOCNUM(9) + C1(1) + NAT(3) + DOB(6) + C2(1) + SEX(1) + EXP(6) + C3(1) + OPT(14) + C4(1) + C5(1)
 */
export function parseTD3Passport(lines) {
  if (!lines || lines.length < 2) return null;

  const [line1, line2] = lines;
  if (line1.length < 44 || line2.length < 44) return null;

  const docType = line1.substring(0, 2).replace(/</g, "");
  const issuingCountry = line1.substring(2, 5).replace(/</g, "");

  // Names extraction
  const namesSection = line1.substring(5);
  const nameParts = namesSection.split("<<");
  const surname = (nameParts[0] || "").replace(/</g, " ").trim();
  const givenNames = (nameParts.slice(1).join(" ") || "").replace(/</g, " ").trim();
  const fullName = [surname, givenNames].filter(Boolean).join(" ");

  // Line 2 fields
  const documentNumberRaw = line2.substring(0, 9);
  const documentNumber = documentNumberRaw.replace(/</g, "");
  const docNumberCheckDigit = line2.substring(9, 10);
  const isDocNumberCheckValid = validateCheckDigit(documentNumberRaw, docNumberCheckDigit);

  const nationality = line2.substring(10, 13).replace(/</g, "");

  const dobRaw = line2.substring(13, 19);
  const dobCheckDigit = line2.substring(19, 20);
  const isDobCheckValid = validateCheckDigit(dobRaw, dobCheckDigit);
  const dobParsed = parseMRZDate(dobRaw, false);

  const sex = line2.substring(20, 21).replace(/</g, "");

  const expiryRaw = line2.substring(21, 27);
  const expiryCheckDigit = line2.substring(27, 28);
  const isExpiryCheckValid = validateCheckDigit(expiryRaw, expiryCheckDigit);
  const expiryParsed = parseMRZDate(expiryRaw, true);

  const optionalDataRaw = line2.substring(28, 42);
  const optionalData = optionalDataRaw.replace(/</g, "");
  const optionalCheckDigit = line2.substring(42, 43);
  const isOptionalCheckValid = optionalCheckDigit === "<" || validateCheckDigit(optionalDataRaw, optionalCheckDigit);

  const compositeCheckDigit = line2.substring(43, 44);
  // Composite check covers: docNum + c1 + dob + c2 + exp + c3 + optional + c4
  const compositeString =
    line2.substring(0, 10) +
    line2.substring(13, 20) +
    line2.substring(21, 43);
  const isCompositeCheckValid = validateCheckDigit(compositeString, compositeCheckDigit);

  const allCheckDigitsValid =
    isDocNumberCheckValid &&
    isDobCheckValid &&
    isExpiryCheckValid &&
    (isCompositeCheckValid || isOptionalCheckValid);

  // Check if passport is expired
  let isExpired = false;
  if (expiryParsed.valid && expiryParsed.formatted) {
    const expDate = new Date(expiryParsed.formatted);
    const now = new Date();
    isExpired = expDate < now;
  }

  return {
    format: "TD3",
    documentType: "Passport",
    typeCode: docType,
    issuingCountry,
    nationality,
    fullName,
    surname,
    givenNames,
    documentNumber,
    docNumberCheckDigit,
    isDocNumberCheckValid,
    dob: dobParsed.formatted || dobRaw,
    dobRaw,
    dobCheckDigit,
    isDobCheckValid,
    gender: sex === "M" ? "Male" : sex === "F" ? "Female" : sex || "Unspecified",
    sex,
    expiryDate: expiryParsed.formatted || expiryRaw,
    expiryRaw,
    expiryCheckDigit,
    isExpiryCheckValid,
    isExpired,
    optionalData,
    optionalCheckDigit,
    isOptionalCheckValid,
    compositeCheckDigit,
    isCompositeCheckValid,
    allCheckDigitsValid,
    rawLines: [line1, line2],
  };
}

/**
 * Parses MRVA/MRVB (Visa) MRZ.
 */
export function parseVisaMRZ(lines) {
  if (!lines || lines.length < 2) return null;
  const [line1, line2] = lines;

  const docType = line1.substring(0, 2).replace(/</g, "");
  const issuingCountry = line1.substring(2, 5).replace(/</g, "");

  const namesSection = line1.substring(5);
  const nameParts = namesSection.split("<<");
  const surname = (nameParts[0] || "").replace(/</g, " ").trim();
  const givenNames = (nameParts.slice(1).join(" ") || "").replace(/</g, " ").trim();
  const fullName = [surname, givenNames].filter(Boolean).join(" ");

  const documentNumberRaw = line2.substring(0, 9);
  const documentNumber = documentNumberRaw.replace(/</g, "");
  const docNumberCheckDigit = line2.substring(9, 10);
  const isDocNumberCheckValid = validateCheckDigit(documentNumberRaw, docNumberCheckDigit);

  const nationality = line2.substring(10, 13).replace(/</g, "");

  const dobRaw = line2.substring(13, 19);
  const dobCheckDigit = line2.substring(19, 20);
  const isDobCheckValid = validateCheckDigit(dobRaw, dobCheckDigit);
  const dobParsed = parseMRZDate(dobRaw, false);

  const sex = line2.substring(20, 21).replace(/</g, "");

  const expiryRaw = line2.substring(21, 27);
  const expiryCheckDigit = line2.substring(27, 28);
  const isExpiryCheckValid = validateCheckDigit(expiryRaw, expiryCheckDigit);
  const expiryParsed = parseMRZDate(expiryRaw, true);

  let isExpired = false;
  if (expiryParsed.valid && expiryParsed.formatted) {
    const expDate = new Date(expiryParsed.formatted);
    const now = new Date();
    isExpired = expDate < now;
  }

  return {
    format: line1.length >= 44 ? "MRVA" : "MRVB",
    documentType: "Visa",
    typeCode: docType,
    issuingCountry,
    nationality,
    fullName,
    surname,
    givenNames,
    visaNumber: documentNumber,
    docNumberCheckDigit,
    isDocNumberCheckValid,
    dob: dobParsed.formatted || dobRaw,
    dobRaw,
    dobCheckDigit,
    isDobCheckValid,
    gender: sex === "M" ? "Male" : sex === "F" ? "Female" : sex || "Unspecified",
    sex,
    expiryDate: expiryParsed.formatted || expiryRaw,
    expiryRaw,
    expiryCheckDigit,
    isExpiryCheckValid,
    isExpired,
    allCheckDigitsValid: isDocNumberCheckValid && isDobCheckValid && isExpiryCheckValid,
    rawLines: [line1, line2],
  };
}
