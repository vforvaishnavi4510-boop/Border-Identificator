import { stringSimilarity, fuzzyIncludes } from "../utils/levenshtein.js";

/**
 * Voter ID (EPIC) Specific Verification Engine.
 * - Detects and validates Election Photo Identity Card (EPIC) number.
 * - Standard format: 3 uppercase letters followed by 7 digits (e.g., ABC1234567).
 * - Decodes QR code and cross-checks with OCR text.
 * - Verifies Election Commission of India security headers.
 */
export function verifyVoterID({ ocrText = "", qrResult = null }) {
  const warnings = [];
  const tamperingDetails = [];
  const text = ocrText || "";
  const upperText = text.toUpperCase();

  // 1. Extract EPIC Number from text
  const epicMatch = upperText.match(/\b([A-Z]{3}[0-9]{7})\b/);
  const printedEpic = epicMatch ? epicMatch[1] : null;

  let epicFormatValid = !!printedEpic;
  let headerValid = false;
  let qrCodeVerified = false;
  let dataMatch = true;

  // 2. Check Election Commission of India Headers
  if (
    upperText.includes("ELECTION COMMISSION OF INDIA") ||
    upperText.includes("ELECTOR PHOTO IDENTITY CARD") ||
    upperText.includes("BHARAT NIRVACHAN AYOG") ||
    upperText.includes("ELECTION COMMISSION")
  ) {
    headerValid = true;
  } else {
    warnings.push("Election Commission of India header was not clearly identified.");
  }

  // 3. Extract Voter Details from text
  const extractedDetails = {
    epicNumber: printedEpic,
    voterName: null,
    fatherOrHusbandName: null,
    gender: null,
    ageOrDob: null,
  };

  if (upperText.includes("FEMALE")) {
    extractedDetails.gender = "Female";
  } else if (upperText.includes("MALE")) {
    extractedDetails.gender = "Male";
  }

  // Age / DOB
  const dobMatch = text.match(/\b([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})\b/);
  if (dobMatch) {
    extractedDetails.ageOrDob = dobMatch[1];
  } else {
    const ageMatch = text.match(/(?:AGE|आयु)[\s:]*([0-9]{2})/i);
    if (ageMatch) {
      extractedDetails.ageOrDob = `Age ${ageMatch[1]}`;
    }
  }

  // 4. QR Code Cross-Validation
  if (qrResult && qrResult.detected) {
    const qrData = qrResult.parsedData;
    if (qrData) {
      qrCodeVerified = true;

      // Cross-check EPIC number
      if (qrData.epicNo && printedEpic) {
        if (qrData.epicNo.toUpperCase() === printedEpic.toUpperCase()) {
          // match!
        } else {
          dataMatch = false;
          warnings.push(`EPIC Number mismatch: Printed (${printedEpic}) vs QR (${qrData.epicNo})`);
          tamperingDetails.push({
            field: "epicNumber",
            printed: printedEpic,
            qr: qrData.epicNo,
            issue: "Discrepancy between printed EPIC number and QR data",
          });
        }
      }

      // Cross-check Name
      if (qrData.name) {
        extractedDetails.voterName = qrData.name;
        if (!fuzzyIncludes(upperText, qrData.name, 0.7)) {
          dataMatch = false;
          warnings.push(`Voter name in QR (${qrData.name}) does not match printed text.`);
          tamperingDetails.push({
            field: "voterName",
            qr: qrData.name,
            issue: "QR embedded voter name mismatch",
          });
        }
      }
    }
  }

  if (!epicFormatValid) {
    warnings.push("Standard 10-character EPIC format (3 letters + 7 digits) not found.");
  }

  // 5. Risk Score Calculation
  let riskScore = 0;
  if (!epicFormatValid) riskScore += 45;
  if (!headerValid) riskScore += 25;
  if (!dataMatch) riskScore += 35;
  if (tamperingDetails.length > 0) riskScore += 30;

  riskScore = Math.min(100, Math.max(0, riskScore));

  let status = "Likely Genuine";
  if (riskScore >= 60 || tamperingDetails.length > 0) {
    status = "High Risk / Likely Tampered";
  } else if (riskScore >= 25 || warnings.length > 0) {
    status = "Suspicious / Review Required";
  }

  return {
    documentType: "Voter ID",
    riskScore,
    status,
    checks: {
      epicFormatValid,
      headerValid,
      qrCodeVerified,
      dataMatch,
    },
    warnings,
    details: extractedDetails,
    tamperingDetails,
  };
}
