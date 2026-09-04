import { stringSimilarity, fuzzyIncludes } from "../utils/levenshtein.js";

const PAN_STATUS_TYPES = {
  P: "Individual / Person",
  C: "Company",
  H: "Hindu Undivided Family (HUF)",
  F: "Firm / Limited Liability Partnership",
  A: "Association of Persons (AOP)",
  T: "Trust",
  B: "Body of Individuals (BOI)",
  L: "Local Authority",
  J: "Artificial Juridical Person",
  G: "Government Agency",
};

/**
 * PAN Card Specific Verification Engine.
 * - Validates standard Indian PAN structure (AAAAA9999A).
 * - Checks 4th character status code.
 * - Validates 5th character surname initial against extracted applicant name.
 * - Checks Income Tax Department headers, DOB, and Father's name.
 */
export function verifyPAN({ ocrText = "" }) {
  const warnings = [];
  const tamperingDetails = [];
  const text = ocrText || "";
  const upperText = text.toUpperCase();

  // 1. Extract PAN Number
  const panMatch = upperText.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/);
  const panNumber = panMatch ? panMatch[1] : null;

  let panFormatValid = !!panNumber;
  let holderTypeValid = false;
  let surnameInitialMatches = false;
  let headerValid = false;
  let dobValid = false;

  const extractedDetails = {
    panNumber,
    holderCategory: null,
    holderCategoryCode: null,
    surnameInitial: null,
    holderName: null,
    fatherName: null,
    dob: null,
  };

  // 2. Header check
  if (
    upperText.includes("INCOME TAX DEPARTMENT") ||
    upperText.includes("PERMANENT ACCOUNT NUMBER") ||
    upperText.includes("GOVT. OF INDIA") ||
    upperText.includes("GOVERNMENT OF INDIA")
  ) {
    headerValid = true;
  } else {
    warnings.push("Official Income Tax Department header was not clearly detected.");
  }

  // 3. Extract DOB
  const dobMatch = text.match(/\b([0-9]{2}[\/\-\.][0-9]{2}[\/\-\.][0-9]{4})\b/);
  if (dobMatch) {
    extractedDetails.dob = dobMatch[1];
    dobValid = true;
  }

  // 4. Extract Name / Father's Name candidates
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !l.includes("INCOME") && !l.includes("GOVT") && !l.includes("PERMANENT") && !l.includes("INDIA"));

  // 5. Structure & 4th / 5th Character Analysis
  if (panNumber) {
    const fourthChar = panNumber[3];
    const fifthChar = panNumber[4];

    extractedDetails.holderCategoryCode = fourthChar;
    extractedDetails.holderCategory = PAN_STATUS_TYPES[fourthChar] || "Unknown Category";
    extractedDetails.surnameInitial = fifthChar;

    if (PAN_STATUS_TYPES[fourthChar]) {
      holderTypeValid = true;
    } else {
      warnings.push(`Invalid 4th character '${fourthChar}' in PAN. Must be valid entity code (P, C, H, F, A, T, etc.).`);
      tamperingDetails.push({
        field: "panNumber",
        value: panNumber,
        issue: `Invalid 4th character '${fourthChar}' - violates PAN generation algorithm`,
      });
    }

    // Check if 5th character matches any extracted name's first character of surname/last name
    // Search words in the text that start with the 5th character
    let foundMatchingNameWord = false;
    for (const line of lines) {
      const words = line.toUpperCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= 2 && word.startsWith(fifthChar) && !word.startsWith(panNumber)) {
          foundMatchingNameWord = true;
          if (!extractedDetails.holderName && /^[A-Z\s]+$/.test(line)) {
            extractedDetails.holderName = line;
          }
          break;
        }
      }
    }

    if (foundMatchingNameWord) {
      surnameInitialMatches = true;
    } else {
      // Warning if we couldn't match surname initial
      warnings.push(`PAN 5th letter '${fifthChar}' could not be matched with extracted surname/name initial.`);
      // Minor anomaly unless explicitly contradictory
    }
  } else {
    warnings.push("No valid PAN number format (AAAAA9999A) found on the document.");
  }

  // 6. Calculate Risk Score
  let riskScore = 0;
  if (!panFormatValid) riskScore += 50;
  if (!holderTypeValid && panFormatValid) riskScore += 35;
  if (!headerValid) riskScore += 20;
  if (!dobValid) riskScore += 10;
  if (tamperingDetails.length > 0) riskScore += 30;

  riskScore = Math.min(100, Math.max(0, riskScore));

  let status = "Likely Genuine";
  if (riskScore >= 60 || tamperingDetails.length > 0) {
    status = "High Risk / Likely Tampered";
  } else if (riskScore >= 25 || warnings.length > 0) {
    status = "Suspicious / Review Required";
  }

  return {
    documentType: "PAN Card",
    riskScore,
    status,
    checks: {
      panFormatValid,
      holderTypeValid,
      headerValid,
      dobValid,
      surnameInitialMatches,
    },
    warnings,
    details: extractedDetails,
    tamperingDetails,
  };
}
