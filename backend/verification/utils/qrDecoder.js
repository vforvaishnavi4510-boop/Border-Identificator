import sharp from "sharp";
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";

/**
 * Parses XML attributes from UIDAI standard XML QR code string.
 */
export function parseAadhaarXmlQR(xmlText) {
  if (!xmlText || typeof xmlText !== "string") return null;
  if (!xmlText.includes("PrintLetterBarcodeData") && !xmlText.includes("uidai") && !xmlText.includes("uid=")) {
    return null;
  }

  const getAttr = (attr) => {
    const match = xmlText.match(new RegExp(`${attr}=["']([^"']*)["']`, "i"));
    return match ? match[1] : null;
  };

  const uid = getAttr("uid");
  const name = getAttr("name");
  const gender = getAttr("gender");
  const yob = getAttr("yob");
  const dob = getAttr("dob");
  const co = getAttr("co"); // Care of / Father / Husband
  const loc = getAttr("loc");
  const vtc = getAttr("vtc");
  const po = getAttr("po");
  const dist = getAttr("dist");
  const subdist = getAttr("subdist");
  const state = getAttr("state");
  const pc = getAttr("pc"); // Pincode

  return {
    isAadhaarQR: true,
    qrType: "Aadhaar XML QR",
    uid,
    name,
    gender: gender === "M" ? "Male" : gender === "F" ? "Female" : gender,
    yob,
    dob: dob || (yob ? `${yob}` : null),
    careOf: co,
    address: [loc, vtc, po, subdist, dist, state, pc].filter(Boolean).join(", "),
    pincode: pc,
    state,
    raw: xmlText,
  };
}

/**
 * Parses Voter ID QR payloads.
 */
export function parseVoterQR(qrText) {
  if (!qrText) return null;
  const str = String(qrText).trim();

  // JSON voter payload
  if (str.startsWith("{") && str.endsWith("}")) {
    try {
      const parsed = JSON.parse(str);
      return {
        isVoterQR: true,
        epicNo: parsed.epic_no || parsed.epicNo || parsed.id || null,
        name: parsed.name || parsed.applicant_name || null,
        relativeName: parsed.r_name || parsed.father_name || parsed.relation_name || null,
        gender: parsed.gender || null,
        age: parsed.age || null,
        raw: str,
      };
    } catch {
      // not json
    }
  }

  // Key-value or pipe-separated
  if (str.includes("EPIC") || /^[A-Z]{3}\d{7}/.test(str)) {
    const epicMatch = str.match(/([A-Z]{3}\d{7})/i);
    return {
      isVoterQR: true,
      epicNo: epicMatch ? epicMatch[1].toUpperCase() : null,
      raw: str,
    };
  }

  return null;
}

/**
 * Attempts to decode QR code bitmap.
 */
function tryDecodeBitmap(reader, luminanceSource) {
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const result = reader.decode(bitmap);
    return result ? result.getText() : null;
  } catch {
    return null;
  }
}

/**
 * Comprehensive multi-pass QR decoder with image enhancements.
 * @param {Buffer|string} imageInput Buffer or filepath
 */
export async function decodeQRCodeFromImage(imageInput) {
  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new MultiFormatReader();
    reader.setHints(hints);

    // Pass 1: Raw original image
    try {
      const { data, info } = await sharp(imageInput)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const luminance = new RGBLuminanceSource(data, info.width, info.height);
      const text = tryDecodeBitmap(reader, luminance);
      if (text) {
        return processDecodedQR(text);
      }
    } catch (e) {
      // pass
    }

    // Pass 2: Grayscale + normalized contrast
    try {
      const { data, info } = await sharp(imageInput)
        .grayscale()
        .normalize()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const luminance = new RGBLuminanceSource(data, info.width, info.height);
      const text = tryDecodeBitmap(reader, luminance);
      if (text) {
        return processDecodedQR(text);
      }
    } catch (e) {
      // pass
    }

    // Pass 3: Threshold binarization & sharpen
    try {
      const { data, info } = await sharp(imageInput)
        .grayscale()
        .sharpen()
        .threshold(128)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const luminance = new RGBLuminanceSource(data, info.width, info.height);
      const text = tryDecodeBitmap(reader, luminance);
      if (text) {
        return processDecodedQR(text);
      }
    } catch (e) {
      // pass
    }

    // Pass 4: Quadrant scanning (Corners where QRs typically appear)
    try {
      const metadata = await sharp(imageInput).metadata();
      const w = metadata.width || 800;
      const h = metadata.height || 600;

      const crops = [
        { left: Math.floor(w * 0.5), top: Math.floor(h * 0.4), width: Math.floor(w * 0.5), height: Math.floor(h * 0.6) }, // bottom-right
        { left: 0, top: Math.floor(h * 0.4), width: Math.floor(w * 0.5), height: Math.floor(h * 0.6) }, // bottom-left
        { left: Math.floor(w * 0.5), top: 0, width: Math.floor(w * 0.5), height: Math.floor(h * 0.5) }, // top-right
      ];

      for (const crop of crops) {
        try {
          const { data, info } = await sharp(imageInput)
            .extract(crop)
            .grayscale()
            .normalize()
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const luminance = new RGBLuminanceSource(data, info.width, info.height);
          const text = tryDecodeBitmap(reader, luminance);
          if (text) {
            return processDecodedQR(text);
          }
        } catch {
          // continue
        }
      }
    } catch {
      // pass
    }

    return {
      detected: false,
      text: null,
      parsedData: null,
    };
  } catch (error) {
    return {
      detected: false,
      text: null,
      error: error.message,
    };
  }
}

function processDecodedQR(rawText) {
  const aadhaarData = parseAadhaarXmlQR(rawText);
  if (aadhaarData) {
    return {
      detected: true,
      type: "Aadhaar",
      text: rawText,
      parsedData: aadhaarData,
    };
  }

  const voterData = parseVoterQR(rawText);
  if (voterData) {
    return {
      detected: true,
      type: "Voter ID",
      text: rawText,
      parsedData: voterData,
    };
  }

  const looksLikeAadhaar =
    rawText.includes("uidai") ||
    rawText.includes("Aadhaar") ||
    rawText.length > 300;

  return {
    detected: true,
    type: looksLikeAadhaar ? "Aadhaar Secure QR" : "Generic",
    text: rawText,
    parsedData: {
      raw: rawText,
      isAadhaarQR: looksLikeAadhaar,
    },
  };
}
