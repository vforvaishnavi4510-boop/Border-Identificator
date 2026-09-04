import { classifyDocument } from "./classifier.js";
import { decodeQRCodeFromImage } from "./utils/qrDecoder.js";
import { verifyPassport } from "./verifiers/passportVerifier.js";
import { verifyAadhaar } from "./verifiers/aadhaarVerifier.js";
import { verifyPAN } from "./verifiers/panVerifier.js";
import { verifyVoterID } from "./verifiers/voterVerifier.js";
import { verifyDrivingLicence } from "./verifiers/drivingLicenceVerifier.js";
import { verifyVisa } from "./verifiers/visaVerifier.js";
import { detectSuspiciousRegions } from "./tamperingDetector.js";

/**
 * Master Document-Specific Verification Engine.
 *
 * @param {Object} params
 * @param {string} params.ocrText Extracted text from OCR engine
 * @param {Buffer|string} [params.imageInput] Buffer or filepath of the document image
 * @param {Object} [params.qrResult] Optional pre-decoded QR code result
 * @param {string} [params.mlDocumentType] Optional hint from ML model
 * @returns {Promise<Object>} Standardized verification payload
 */
export async function verifyDocument({
  ocrText = "",
  imageInput = null,
  qrResult = null,
  mlDocumentType = null,
}) {
  const startTime = Date.now();

  // 1. Decode QR Code if image is provided and not already decoded
  let decodedQR = qrResult;
  if (!decodedQR && imageInput) {
    try {
      decodedQR = await decodeQRCodeFromImage(imageInput);
    } catch (err) {
      console.warn("⚠️ QR decoding error in verification engine:", err.message);
      decodedQR = { detected: false, text: null };
    }
  }

  // 2. Classify Document Type
  const classification = classifyDocument({
    ocrText,
    qrResult: decodedQR,
    mlDocumentType,
  });

  const docType = classification.documentType;

  // 3. Run Document-Specific Verification Engine
  let result;

  switch (docType) {
    case "Passport":
      result = verifyPassport({ ocrText });
      break;

    case "Aadhaar":
      result = verifyAadhaar({ ocrText, qrResult: decodedQR });
      break;

    case "PAN Card":
      result = verifyPAN({ ocrText });
      break;

    case "Voter ID":
      result = verifyVoterID({ ocrText, qrResult: decodedQR });
      break;

    case "Driving Licence":
      result = verifyDrivingLicence({ ocrText });
      break;

    case "Visa":
      result = verifyVisa({ ocrText });
      break;

    default:
      // Unknown / Unrecognized document
      result = {
        documentType: "Unknown",
        riskScore: 70,
        status: "Suspicious / Review Required",
        checks: {
          documentRecognized: false,
          securityFeaturesValid: false,
          dataMatch: false,
        },
        warnings: [
          "Document type could not be confidently identified.",
          "Ensure document is clearly visible and within the frame.",
        ],
        details: {},
        tamperingDetails: [],
      };
      break;
  }

  // 4. Locate Suspicious Regions for UI highlighting
  const suspiciousRegions = detectSuspiciousRegions({
    documentType: result.documentType,
    tamperingDetails: result.tamperingDetails || [],
    warnings: result.warnings || [],
  });

  const engineProcessingTime = Date.now() - startTime;

  return {
    documentType: result.documentType,
    riskScore: result.riskScore,
    status: result.status,
    checks: result.checks,
    warnings: result.warnings || [],
    details: result.details || {},
    tamperingDetails: result.tamperingDetails || [],
    suspiciousRegions,
    classification: {
      confidence: classification.confidence,
      markers: classification.matchedMarkers,
    },
    qrData: decodedQR && decodedQR.detected ? decodedQR : null,
    engineProcessingTime,
  };
}

export default verifyDocument;
