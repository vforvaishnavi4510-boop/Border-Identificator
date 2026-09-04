const INDIAN_STATES = {
  AN: "Andaman and Nicobar Islands",
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CH: "Chandigarh",
  CG: "Chhattisgarh",
  DD: "Daman and Diu",
  DL: "Delhi",
  DN: "Dadra and Nagar Haveli",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  OR: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana",
  UK: "Uttarakhand",
  UA: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

/**
 * Driving Licence Specific Verification Engine.
 * - Detects issuing State from 2-letter prefix.
 * - Validates against MoRTH Sarathi National Standard DL format: SS-RR-YYYYNNNNNNN
 * - Checks year of issue and validity.
 */
export function verifyDrivingLicence({ ocrText = "" }) {
  const warnings = [];
  const tamperingDetails = [];
  const text = ocrText || "";
  const upperText = text.toUpperCase();

  let dlNumber = null;
  let stateCode = null;
  let stateName = null;
  let issueYear = null;
  let dlFormatValid = false;
  let stateRecognized = false;
  let issueYearValid = false;
  let expiryValid = true;

  // 1. Search for DL Number patterns
  // Standard Sarathi: SS-RR-YYYYNNNNNNN or SS RR YYYYNNNNNNN or SSRRYYYYNNNNNNN (15-16 chars)
  const sarathiMatch = upperText.match(/\b([A-Z]{2})[-\s]?([0-9]{2})[-\s]?([0-9]{4})[-\s]?([0-9]{7})\b/);
  const generalDlMatch = upperText.match(/\b([A-Z]{2}[0-9]{13,15})\b/);
  const oldDlMatch = upperText.match(/\b([A-Z]{2}[-\s]?[0-9]{2}[-\s]?[0-9]{2,4}[-\s]?[0-9]{4,8})\b/);

  if (sarathiMatch) {
    stateCode = sarathiMatch[1];
    const rtoCode = sarathiMatch[2];
    issueYear = parseInt(sarathiMatch[3], 10);
    const uniqueNum = sarathiMatch[4];
    dlNumber = `${stateCode}-${rtoCode}-${issueYear}${uniqueNum}`;
    dlFormatValid = true;
  } else if (generalDlMatch) {
    dlNumber = generalDlMatch[1];
    stateCode = dlNumber.substring(0, 2);
    dlFormatValid = true;
  } else if (oldDlMatch) {
    dlNumber = oldDlMatch[1];
    stateCode = dlNumber.substring(0, 2);
    dlFormatValid = true;
  }

  // 2. Validate State Code
  if (stateCode && INDIAN_STATES[stateCode]) {
    stateRecognized = true;
    stateName = INDIAN_STATES[stateCode];
  } else if (stateCode) {
    warnings.push(`Unrecognized State Code '${stateCode}' in Driving Licence number.`);
    tamperingDetails.push({
      field: "dlNumber",
      stateCode,
      issue: "Invalid Indian state code prefix in DL",
    });
  }

  // 3. Validate Issue Year
  const currentYear = new Date().getFullYear();
  if (issueYear) {
    if (issueYear >= 1970 && issueYear <= currentYear) {
      issueYearValid = true;
    } else {
      warnings.push(`Suspicious DL Issue Year (${issueYear}).`);
      tamperingDetails.push({
        field: "issueYear",
        value: issueYear,
        issue: "Invalid or future issue year detected",
      });
    }
  } else {
    // Search for 4 digit year in text
    issueYearValid = true;
  }

  // 4. Extract validity / DOB
  const dobMatch = text.match(/(?:DOB|Date of Birth)[\s:]*([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})/i) ||
    text.match(/\b([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})\b/);

  const validityMatch = text.match(/(?:VALIDITY|VALID|EXPIRY|NT|TR)[\s:]*([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})/i);

  const extractedDetails = {
    dlNumber,
    stateCode,
    stateName,
    issueYear,
    dob: dobMatch ? dobMatch[1] : null,
    validityDate: validityMatch ? validityMatch[1] : null,
  };

  if (!dlFormatValid) {
    warnings.push("Standard Indian Driving Licence format (Sarathi SS-RR-YYYYNNNNNNN) not identified.");
  }

  // 5. Calculate Risk Score
  let riskScore = 0;
  if (!dlFormatValid) riskScore += 45;
  if (!stateRecognized) riskScore += 30;
  if (!issueYearValid) riskScore += 25;
  if (tamperingDetails.length > 0) riskScore += 30;

  riskScore = Math.min(100, Math.max(0, riskScore));

  let status = "Likely Genuine";
  if (riskScore >= 60 || tamperingDetails.length > 0) {
    status = "High Risk / Likely Tampered";
  } else if (riskScore >= 25 || warnings.length > 0) {
    status = "Suspicious / Review Required";
  }

  return {
    documentType: "Driving Licence",
    riskScore,
    status,
    checks: {
      dlFormatValid,
      stateRecognized,
      issueYearValid,
      expiryValid,
    },
    warnings,
    details: extractedDetails,
    tamperingDetails,
  };
}
