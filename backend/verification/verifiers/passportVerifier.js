import { findMRZLines, parseTD3Passport } from "../utils/mrzParser.js";
import { stringSimilarity, fuzzyIncludes } from "../utils/levenshtein.js";

/**
 * Passport Specific Verification Engine.
 * - Extracts and parses ICAO Doc 9303 TD3 MRZ.
 * - Validates MRZ check digits (7-3-1 weight sum).
 * - Extracts Visual Inspection Zone (VIZ) OCR text.
 * - Cross-validates MRZ vs VIZ fields for tampering.
 * - Validates document expiration.
 */
export function verifyPassport({ ocrText = "", imagePath = null }) {
  const warnings = [];
  const tamperingDetails = [];
  const text = ocrText || "";
  const upperText = text.toUpperCase();

  // 1. MRZ Extraction & Parsing
  const mrzLines = findMRZLines(text);
  const mrzParsed = mrzLines.length >= 2 ? parseTD3Passport(mrzLines) : null;

  const mrzValid = !!mrzParsed;
  const checkDigitsValid = mrzParsed ? mrzParsed.allCheckDigitsValid : false;
  let expiryValid = false;
  let dataMatch = false;

  const extractedDetails = {
    documentNumber: null,
    fullName: null,
    surname: null,
    givenNames: null,
    dob: null,
    gender: null,
    nationality: null,
    issuingCountry: null,
    expiryDate: null,
  };

  const vizDetails = {
    documentNumber: null,
    dob: null,
    expiryDate: null,
    nationality: null,
  };

  // 2. VIZ Extraction from OCR Text
  // Look for Passport Number pattern: 1 uppercase letter followed by 7 digits
  const passNoMatches = upperText.match(/\b([A-Z][0-9]{7})\b/g) || [];
  if (passNoMatches.length > 0) {
    vizDetails.documentNumber = passNoMatches[0];
  }

  // Look for DOB in VIZ: DD/MM/YYYY or DD-MM-YYYY
  const dobMatches = upperText.match(/\b(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})\b/g) || [];
  if (dobMatches.length > 0) {
    vizDetails.dob = dobMatches[0];
  }

  // Look for Expiry in VIZ
  if (dobMatches.length > 1) {
    vizDetails.expiryDate = dobMatches[1];
  }

  // Nationality
  if (upperText.includes("INDIAN") || upperText.includes("REPUBLIC OF INDIA") || upperText.includes("IND")) {
    vizDetails.nationality = "IND";
  }

  // 3. Process MRZ Results
  if (mrzParsed) {
    extractedDetails.documentNumber = mrzParsed.documentNumber;
    extractedDetails.fullName = mrzParsed.fullName;
    extractedDetails.surname = mrzParsed.surname;
    extractedDetails.givenNames = mrzParsed.givenNames;
    extractedDetails.dob = mrzParsed.dob;
    extractedDetails.gender = mrzParsed.gender;
    extractedDetails.nationality = mrzParsed.nationality;
    extractedDetails.issuingCountry = mrzParsed.issuingCountry;
    extractedDetails.expiryDate = mrzParsed.expiryDate;

    // Check Digits Check
    if (!mrzParsed.isDocNumberCheckValid) {
      warnings.push(`MRZ Check Digit Failed for Passport Number (${mrzParsed.documentNumber}). Expected: ${mrzParsed.docNumberCheckDigit}`);
      tamperingDetails.push({ field: "passportNumber", issue: "Invalid MRZ check digit - potential altered document number" });
    }
    if (!mrzParsed.isDobCheckValid) {
      warnings.push(`MRZ Check Digit Failed for Date of Birth (${mrzParsed.dobRaw}).`);
      tamperingDetails.push({ field: "dob", issue: "Invalid MRZ check digit - potential altered birth date" });
    }
    if (!mrzParsed.isExpiryCheckValid) {
      warnings.push(`MRZ Check Digit Failed for Expiry Date (${mrzParsed.expiryRaw}).`);
      tamperingDetails.push({ field: "expiryDate", issue: "Invalid MRZ check digit - potential altered expiry date" });
    }

    // Expiry Check
    if (mrzParsed.isExpired) {
      expiryValid = false;
      warnings.push(`Passport is EXPIRED. Expiry Date: ${mrzParsed.expiryDate}`);
    } else {
      expiryValid = true;
    }

    // 4. Cross-Match MRZ vs VIZ Text
    let matchesFound = 0;
    let comparisons = 0;

    // Compare Passport Number
    if (vizDetails.documentNumber && mrzParsed.documentNumber) {
      comparisons++;
      if (vizDetails.documentNumber === mrzParsed.documentNumber) {
        matchesFound++;
      } else {
        warnings.push(`Passport number mismatch: Printed VIZ (${vizDetails.documentNumber}) vs MRZ (${mrzParsed.documentNumber})`);
        tamperingDetails.push({
          field: "passportNumber",
          vizValue: vizDetails.documentNumber,
          mrzValue: mrzParsed.documentNumber,
          issue: "Visual and MRZ passport numbers do not match",
        });
      }
    }

    // Compare Name
    if (mrzParsed.fullName) {
      comparisons++;
      const nameParts = mrzParsed.fullName.split(" ").filter((p) => p.length > 2);
      let nameMatched = false;
      for (const part of nameParts) {
        if (upperText.includes(part)) {
          nameMatched = true;
          break;
        }
      }
      if (nameMatched || stringSimilarity(upperText, mrzParsed.fullName) > 0.4) {
        matchesFound++;
      } else {
        warnings.push(`Passport holder name (${mrzParsed.fullName}) not clearly detected in printed text`);
      }
    }

    // Compare Nationality
    if (vizDetails.nationality && mrzParsed.nationality) {
      comparisons++;
      if (mrzParsed.nationality.includes(vizDetails.nationality) || vizDetails.nationality.includes(mrzParsed.nationality)) {
        matchesFound++;
      }
    }

    dataMatch = comparisons > 0 ? matchesFound / comparisons >= 0.75 : true;
  } else {
    warnings.push("No valid ICAO MRZ detected on document image.");
    if (vizDetails.documentNumber) {
      extractedDetails.documentNumber = vizDetails.documentNumber;
    }
    if (vizDetails.dob) {
      extractedDetails.dob = vizDetails.dob;
    }
  }

  // 5. Risk Score Calculation (0-100)
  let riskScore = 0;
  if (!mrzValid) riskScore += 35;
  if (!checkDigitsValid) riskScore += 40;
  if (!expiryValid) riskScore += 25;
  if (!dataMatch) riskScore += 30;
  if (tamperingDetails.length > 0) riskScore += 25;

  riskScore = Math.min(100, Math.max(0, riskScore));

  let status = "Likely Genuine";
  if (riskScore >= 60 || tamperingDetails.length > 0) {
    status = "High Risk / Likely Tampered";
  } else if (riskScore >= 25 || warnings.length > 0) {
    status = "Suspicious / Review Required";
  }

  return {
    documentType: "Passport",
    riskScore,
    status,
    checks: {
      mrzValid,
      checkDigitsValid,
      expiryValid,
      dataMatch,
    },
    warnings,
    details: extractedDetails,
    tamperingDetails,
    mrzData: mrzParsed,
  };
}
