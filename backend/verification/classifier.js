import { findMRZLines } from "./utils/mrzParser.js";

/**
 * Intelligent Multi-Factor Document Classifier.
 * Identifies: Passport, Aadhaar, PAN Card, Voter ID, Driving Licence, Visa.
 */
export function classifyDocument({ ocrText = "", qrResult = null, mlDocumentType = null }) {
  const text = (ocrText || "").toUpperCase();
  const scores = {
    Passport: 0,
    Aadhaar: 0,
    "PAN Card": 0,
    "Voter ID": 0,
    "Driving Licence": 0,
    Visa: 0,
  };

  const markers = [];

  // ==========================================
  // 1. MRZ CHECK (Strong indicator for Passport / Visa)
  // ==========================================
  const mrzLines = findMRZLines(ocrText);
  if (mrzLines && mrzLines.length >= 2) {
    const firstLine = mrzLines[0];
    if (firstLine.startsWith("P<") || firstLine.startsWith("P")) {
      scores.Passport += 80;
      markers.push("ICAO Passport TD3 MRZ Detected");
    } else if (firstLine.startsWith("V<") || firstLine.startsWith("V")) {
      scores.Visa += 80;
      markers.push("ICAO Visa MRZ Detected");
    } else {
      scores.Passport += 40;
      markers.push("Generic MRZ Detected");
    }
  }

  // ==========================================
  // 2. QR CODE DATA CHECK
  // ==========================================
  if (qrResult && qrResult.detected) {
    if (qrResult.type === "Aadhaar" || qrResult.type === "Aadhaar Secure QR") {
      scores.Aadhaar += 75;
      markers.push("Aadhaar QR Code Signature Detected");
    } else if (qrResult.type === "Voter ID") {
      scores["Voter ID"] += 75;
      markers.push("Voter ID QR Code Signature Detected");
    }
  }

  // ==========================================
  // 3. PASSPORT KEYWORD & FORMAT CHECK
  // ==========================================
  if (text.includes("PASSPORT") || text.includes("REPUBLIC OF INDIA") || text.includes("PASSPORT NO")) {
    scores.Passport += 45;
    markers.push("Passport Keywords Detected");
  }
  if (/\b[A-Z][0-9]{7}\b/.test(text)) {
    scores.Passport += 20;
    markers.push("Passport Number Pattern (Letter + 7 Digits)");
  }
  if (text.includes("TYPE P") || text.includes("P<IND")) {
    scores.Passport += 30;
  }

  // ==========================================
  // 4. AADHAAR KEYWORD & FORMAT CHECK
  // ==========================================
  if (
    text.includes("UNIQUE IDENTIFICATION AUTHORITY OF INDIA") ||
    text.includes("UIDAI") ||
    text.includes("AADHAAR") ||
    text.includes("MERA AADHAAR") ||
    text.includes("MERI PEHCHAN") ||
    text.includes("HELP@UIDAI.GOV.IN") ||
    text.includes("WWW.UIDAI.GOV.IN")
  ) {
    scores.Aadhaar += 50;
    markers.push("UIDAI / Aadhaar Authority Keywords Detected");
  }
  if (/\b\d{4}\s\d{4}\s\d{4}\b/.test(text) || /\b\d{12}\b/.test(text)) {
    scores.Aadhaar += 35;
    markers.push("12-Digit UID Format Pattern");
  }
  if (/\bXXXX\sXXXX\s\d{4}\b/i.test(text) || /\bX{4}\sX{4}\s\d{4}\b/i.test(text)) {
    scores.Aadhaar += 35;
    markers.push("Masked Aadhaar Number Pattern");
  }

  // ==========================================
  // 5. PAN CARD KEYWORD & FORMAT CHECK
  // ==========================================
  if (
    text.includes("INCOME TAX DEPARTMENT") ||
    text.includes("PERMANENT ACCOUNT NUMBER") ||
    text.includes("GOVT. OF INDIA") ||
    text.includes("GOVERNMENT OF INDIA") && text.includes("INCOME")
  ) {
    scores["PAN Card"] += 50;
    markers.push("Income Tax Department Keywords Detected");
  }
  // PAN regex: 5 uppercase letters, 4 digits, 1 uppercase letter
  if (/\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(text)) {
    scores["PAN Card"] += 45;
    markers.push("Valid PAN Number Format (AAAAA9999A)");
  }
  if (text.includes("FATHER'S NAME") && (text.includes("PERMANENT") || text.includes("INCOME"))) {
    scores["PAN Card"] += 20;
  }

  // ==========================================
  // 6. VOTER ID (EPIC) KEYWORD & FORMAT CHECK
  // ==========================================
  if (
    text.includes("ELECTION COMMISSION OF INDIA") ||
    text.includes("ELECTOR PHOTO IDENTITY CARD") ||
    text.includes("ELECTION COMMISSION") ||
    text.includes("BHARAT NIRVACHAN AYOG") ||
    text.includes("EPIC NO") ||
    text.includes("VOTER")
  ) {
    scores["Voter ID"] += 50;
    markers.push("Election Commission of India Keywords Detected");
  }
  // Standard EPIC regex: 3 letters followed by 7 digits
  if (/\b[A-Z]{3}[0-9]{7}\b/.test(text)) {
    scores["Voter ID"] += 45;
    markers.push("EPIC Number Pattern (3 Letters + 7 Digits)");
  }

  // ==========================================
  // 7. DRIVING LICENCE KEYWORD & FORMAT CHECK
  // ==========================================
  if (
    text.includes("DRIVING LICENCE") ||
    text.includes("DRIVING LICENSE") ||
    text.includes("UNION OF INDIA") ||
    text.includes("TRANSPORT DEPARTMENT") ||
    text.includes("MOTOR VEHICLES") ||
    text.includes("FORM 7") ||
    text.includes("LICENCE TO DRIVE")
  ) {
    scores["Driving Licence"] += 50;
    markers.push("Driving Licence Authority Keywords Detected");
  }
  // Standard DL format: SS-RR-YYYYNNNNNNN or SS-RRYYYYNNNNNNN
  if (/\b[A-Z]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{7}\b/.test(text) || /\b[A-Z]{2}\d{13,15}\b/.test(text)) {
    scores["Driving Licence"] += 45;
    markers.push("Indian National DL Format Pattern");
  }

  // ==========================================
  // 8. VISA KEYWORD CHECK
  // ==========================================
  if (
    (text.includes("VISA") && !text.includes("VISIT")) ||
    text.includes("VISA TYPE") ||
    text.includes("ENTRIES") ||
    text.includes("CONTROL NUMBER") ||
    text.includes("VALID FOR")
  ) {
    // Only if not primarily a passport
    scores.Visa += 40;
    markers.push("Visa Page Markers Detected");
  }

  // ==========================================
  // 9. ML HINT WEIGHTING (IF PROVIDED)
  // ==========================================
  if (mlDocumentType && scores[mlDocumentType] !== undefined) {
    scores[mlDocumentType] += 15;
  }

  // Find top score
  let maxScore = 0;
  let topDocType = "Unknown";

  for (const [docType, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      topDocType = docType;
    }
  }

  // If score is too low, mark as Unknown
  if (maxScore < 25) {
    topDocType = "Unknown";
  }

  const confidence = Math.min(100, Math.round((maxScore / 90) * 100));

  return {
    documentType: topDocType,
    confidence,
    matchedMarkers: markers,
    scores,
  };
}
