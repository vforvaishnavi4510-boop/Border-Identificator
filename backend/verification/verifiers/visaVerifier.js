import { findMRZLines, parseVisaMRZ } from "../utils/mrzParser.js";

/**
 * Visa Specific Verification Engine.
 * - Detects MRVA (2x44) and MRVB (2x36) Visa MRZ formats.
 * - Validates ICAO Doc 9303 Part 7 check digits.
 * - Checks visa expiry date and travel authorization period.
 */
export function verifyVisa({ ocrText = "" }) {
  const warnings = [];
  const tamperingDetails = [];
  const text = ocrText || "";
  const upperText = text.toUpperCase();

  // 1. MRZ Extraction & Parsing
  const mrzLines = findMRZLines(text);
  const mrzParsed = mrzLines.length >= 2 ? parseVisaMRZ(mrzLines) : null;

  const mrzValid = !!mrzParsed;
  const checkDigitsValid = mrzParsed ? mrzParsed.allCheckDigitsValid : false;
  let expiryValid = false;
  let visaTypeValid = false;

  // 2. Visa Type Extraction
  const visaTypeMatch = upperText.match(/(?:VISA TYPE|TYPE|CATEGORY)[\s:]*([A-Z0-9\-\/]+)/i) ||
    upperText.match(/\b(TOURIST|BUSINESS|STUDENT|EMPLOYMENT|TRANSIT|ENTRY)\b/i);

  const visaType = visaTypeMatch ? visaTypeMatch[1] : (mrzParsed ? mrzParsed.typeCode : "Standard");
  if (visaType) visaTypeValid = true;

  const extractedDetails = {
    visaNumber: mrzParsed ? mrzParsed.visaNumber : null,
    fullName: mrzParsed ? mrzParsed.fullName : null,
    nationality: mrzParsed ? mrzParsed.nationality : null,
    issuingCountry: mrzParsed ? mrzParsed.issuingCountry : null,
    dob: mrzParsed ? mrzParsed.dob : null,
    gender: mrzParsed ? mrzParsed.gender : null,
    expiryDate: mrzParsed ? mrzParsed.expiryDate : null,
    visaType,
  };

  if (mrzParsed) {
    if (!mrzParsed.isDocNumberCheckValid) {
      warnings.push(`MRZ Check Digit Failed for Visa Number (${mrzParsed.visaNumber}).`);
      tamperingDetails.push({ field: "visaNumber", issue: "Invalid MRZ check digit" });
    }
    if (!mrzParsed.isDobCheckValid) {
      warnings.push(`MRZ Check Digit Failed for Date of Birth (${mrzParsed.dobRaw}).`);
      tamperingDetails.push({ field: "dob", issue: "Invalid MRZ check digit" });
    }
    if (!mrzParsed.isExpiryCheckValid) {
      warnings.push(`MRZ Check Digit Failed for Expiry Date (${mrzParsed.expiryRaw}).`);
      tamperingDetails.push({ field: "expiryDate", issue: "Invalid MRZ check digit" });
    }

    if (mrzParsed.isExpired) {
      expiryValid = false;
      warnings.push(`Visa is EXPIRED. Expiry Date: ${mrzParsed.expiryDate}`);
    } else {
      expiryValid = true;
    }
  } else {
    warnings.push("No standard ICAO MRVA/MRVB Machine Readable Zone detected on Visa.");
  }

  // 3. Risk Score Calculation
  let riskScore = 0;
  if (!mrzValid) riskScore += 35;
  if (!checkDigitsValid) riskScore += 40;
  if (!expiryValid) riskScore += 25;
  if (tamperingDetails.length > 0) riskScore += 30;

  riskScore = Math.min(100, Math.max(0, riskScore));

  let status = "Likely Genuine";
  if (riskScore >= 60 || tamperingDetails.length > 0) {
    status = "High Risk / Likely Tampered";
  } else if (riskScore >= 25 || warnings.length > 0) {
    status = "Suspicious / Review Required";
  }

  return {
    documentType: "Visa",
    riskScore,
    status,
    checks: {
      mrzValid,
      checkDigitsValid,
      expiryValid,
      visaTypeValid,
      dataMatch: mrzValid && checkDigitsValid,
    },
    warnings,
    details: extractedDetails,
    tamperingDetails,
    mrzData: mrzParsed,
  };
}
