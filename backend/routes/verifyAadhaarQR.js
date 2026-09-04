import express from "express";
import multer from "multer";
import sharp from "sharp";
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post("/verify-aadhaar-qr", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No document uploaded",
      });
    }

    // Convert image into raw pixels
    const { data, info } = await sharp(req.file.buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminance = new RGBLuminanceSource(data, info.width, info.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminance));

    const reader = new MultiFormatReader();

    let qrText = "";

    try {
      const result = reader.decode(bitmap);
      qrText = result.getText();
    } catch {
      return res.json({
        success: false,
        verified: false,
        message: "No QR Code detected",
      });
    }

    // Temporary verification (real UIDAI signature verification comes later)
    const looksLikeAadhaar =
      qrText.length > 20 ||
      qrText.includes("uidai") ||
      qrText.includes("Aadhaar");

    return res.json({
      success: true,
      verified: looksLikeAadhaar,
      message: looksLikeAadhaar
        ? "Aadhaar Secure QR detected"
        : "QR detected but not recognized as Aadhaar",
      qrData: qrText,
    });
  } catch (error) {
    console.error("QR Verification Error:", error);

    res.status(500).json({
      success: false,
      verified: false,
      message: "QR verification failed",
    });
  }
});

export default router;