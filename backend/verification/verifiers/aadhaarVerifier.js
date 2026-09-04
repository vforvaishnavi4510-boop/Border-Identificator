import { validateVerhoeff } from "../utils/verhoeff.js";
import { stringSimilarity, fuzzyIncludes } from "../utils/levenshtein.js";

/**
 * Aadhaar Specific Verification Engine.
 * - Detects 12-digit UID & masked Aadhaar patterns.
 * - Validates 12-digit UID against Verhoeff checksum algorithm.
 * - Cross-validates QR code payload (XML / Secure QR) with printed text.
 * - Flags data tampering and discrepancies.
 */
export function verifyAadhaar({ ocrText = "", qrResult = null }) {
  const warnings = [];
  const tamperingDetails = [];
  const text = ocrText || "";
  const upperText = text.toUpperCase();

  // 1. Extract Printed Details from OCR
  let printedUid = null;
  let isMasked = false;

  // Search for 12 digit pattern: XXXX XXXX XXXX or 12 continuous digits
  const uidPatternMatch = text.match(/\b(\d{4}\s\d{4}\s\d{4})\b/);
  const rawUidMatch = text.match(/\b(\d{12})\b/);
  const maskedMatch = text.match(/\b([X\d]{4}\s[X\d]{4}\s\d{4})\b/i);

  if (uidPatternMatch) {
    printedUid = uidPatternMatch[1].replace(/\s+/g, "");
  } else if (rawUidMatch) {
    printedUid = rawUidMatch[1];
  } else if (maskedMatch) {
    printedUid = maskedMatch[1];
    isMasked = true;
  }

  // Extract DOB/YOB from text
  let printedDob = null;
  const dobMatch = text.match(/(?:DOB|Date of Birth|Birth|जन्म\s*तिथि)[\s:]*([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})/i) ||
    text.match(/\b([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})\b/);
  if (dobMatch) {
    printedDob = dobMatch[1];
  } else {
    const yobMatch = text.match(/(?:Year of Birth|YOB|जन्म\s*वर्ष)[\s:]*([0-9]{4})/i);
    if (yobMatch) {
      printedDob = yobMatch[1];
    }
  }

  // Extract Gender from text
  let printedGender = null;
  if (upperText.includes("FEMALE") || upperText.includes("महिला")) {
    printedGender = "Female";
  } else if (upperText.includes("MALE") || upperText.includes("पुरुष")) {
    printedGender = "Male";
  } else if (upperText.includes("TRANSGENDER")) {
    printedGender = "Transgender";
  }

  // 2. Validate Aadhaar Format & Verhoeff Check Digit
  let formatValid = false;
  let verhoeffValid = false;

  if (printedUid) {
    if (isMasked) {
      formatValid = true;
      verhoeffValid = true; // Masked UID cannot be verified via full Verhoeff
    } else if (/^\d{12}$/.test(printedUid)) {
      formatValid = true;
      verhoeffValid = validateVerhoeff(printedUid);
      if (!verhoeffValid) {
        warnings.push(`Aadhaar 12-digit UID (${printedUid}) failed Verhoeff checksum algorithm.`);
        tamperingDetails.push({
          field: "aadhaarNumber",
          value: printedUid,
          issue: "Verhoeff check digit invalid - potential forged UID number",
        });
      }
    }
  } else {
    warnings.push("No full 12-digit or masked Aadhaar number clearly extracted from OCR.");
  }

  // 3. QR Code Processing & Cross-Validation
  const qrDetected = qrResult && qrResult.detected;
  let qrDataValid = false;
  let dataMatch = true;

  const qrData = qrResult && qrResult.parsedData ? qrResult.parsedData : null;

  const extractedDetails = {
    aadhaarNumber: printedUid,
    isMasked,
    name: qrData && qrData.name ? qrData.name : null,
    dob: printedDob || (qrData ? qrData.dob : null),
    gender: printedGender || (qrData ? qrData.gender : null),
    careOf: qrData && qrData.careOf ? qrData.careOf : null,
    address: qrData && qrData.address ? qrData.address : null,
    pincode: qrData && qrData.pincode ? qrData.pincode : null,
  };

  if (qrDetected) {
    qrDataValid = true;

    if (qrData && qrData.isAadhaarQR) {
      // Cross-check UID if present in QR
      if (qrData.uid && printedUid && !isMasked) {
        const qrCleanUid = String(qrData.uid).replace(/\s+/g, "");
        if (qrCleanUid !== printedUid) {
          dataMatch = false;
          warnings.push(`Aadhaar UID mismatch: Printed (${printedUid}) vs QR Data (${qrCleanUid})`);
          tamperingDetails.push({
            field: "aadhaarNumber",
            printed: printedUid,
            qr: qrCleanUid,
            issue: "Discrepancy between printed Aadhaar number and QR embedded data",
          });
        }
      }

      // Cross-check Name
      if (qrData.name) {
        const nameMatches = fuzzyIncludes(upperText, qrData.name, 0.7);
        if (!nameMatches) {
          dataMatch = false;
          warnings.push(`Holder name mismatch: QR name (${qrData.name}) not found on printed document.`);
          tamperingDetails.push({
            field: "name",
            qr: qrData.name,
            issue: "QR embedded name does not match printed document text",
          });
        }
      }

      // Cross-check Gender
      if (qrData.gender && printedGender) {
        if (qrData.gender.toUpperCase() !== printedGender.toUpperCase()) {
          dataMatch = false;
          warnings.push(`Gender mismatch: Printed (${printedGender}) vs QR Data (${qrData.gender})`);
          tamperingDetails.push({
            field: "gender",
            printed: printedGender,
            qr: qrData.gender,
            issue: "Discrepancy in gender field",
          });
        }
      }

      // Cross-check DOB/YOB
      if (qrData.yob && printedDob) {
        if (!printedDob.includes(qrData.yob)) {
          dataMatch = false;
          warnings.push(`Year of birth mismatch: Printed (${printedDob}) vs QR Data (${qrData.yob})`);
          tamperingDetails.push({
            field: "dob",
            printed: printedDob,
            qr: qrData.yob,
            issue: "Discrepancy in date/year of birth",
          });
        }
      }
    }
  } else {
    warnings.push("Aadhaar QR Code was not detected or could not be decoded.");
  }

  // 4. Calculate Risk Score (0-100)
  let riskScore = 0;
  if (!formatValid) riskScore += 25;
  if (!verhoeffValid) riskScore += 45;
  if (!qrDetected) riskScore += 20;
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
    documentType: "Aadhaar",
    riskScore,
    status,
    checks: {
      formatValid,
      verhoeffValid,
      qrDetected,
      qrDataValid,
      dataMatch,
    },
    warnings,
    details: extractedDetails,
    tamperingDetails,
    qrData,
  };
}
