import express from "express";
import multer from "multer";
import { verifyDocument } from "../verification/index.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/verify-document", upload.single("document"), async (req, res) => {
  try {
    const ocrText = req.body.text || req.body.ocrText || "";
    const imageInput = req.file ? req.file.buffer : null;
    const mlDocumentType = req.body.mlDocumentType || null;

    const verificationResult = await verifyDocument({
      ocrText,
      imageInput,
      mlDocumentType,
    });

    res.json({
      success: true,
      ...verificationResult,
    });
  } catch (error) {
    console.error("Verification Route Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Document verification failed",
    });
  }
});

export default router;
