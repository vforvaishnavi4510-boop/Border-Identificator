import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { performance } from "perf_hooks";
import verifyAadhaarQR from "./routes/verifyAadhaarQR.js";
import verifyDocumentRoute from "./routes/verifyDocument.js";
import { verifyDocument } from "./verification/index.js";

const app = express();
const PORT = 5000;
app.use(express.json());
app.use("/api", verifyAadhaarQR);
app.use("/api", verifyDocumentRoute);
// ==========================================
// CORS
// ==========================================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// ==========================================
// FOLDERS
// ==========================================

const capturesFolder = path.join(
  process.cwd(),
  "captures"
);

if (!fs.existsSync(capturesFolder)) {
  fs.mkdirSync(capturesFolder, {
    recursive: true,
  });
}

// ==========================================
// MULTER
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 15 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(
        new Error("Only image files are allowed")
      );
    }
  },
});

// ==========================================
// RAPIDOCR SERVICE
// ==========================================

const PYTHON_OCR_BASE_URL =
  "http://127.0.0.1:8000";

const PYTHON_OCR_URL =
  `${PYTHON_OCR_BASE_URL}/ocr`;

const PYTHON_HEALTH_URL =
  `${PYTHON_OCR_BASE_URL}/health`;

// ==========================================
// ML FORGERY DETECTION SERVICE
// ==========================================

const ML_API_BASE_URL =
  "http://127.0.0.1:5001";

const ML_VERIFY_URL =
  `${ML_API_BASE_URL}/api/verify`;

const ML_HEALTH_URL =
  `${ML_API_BASE_URL}/api/health`;

// ==========================================
// CHECK RAPIDOCR SERVICE
// ==========================================

const checkOCRService = async () => {
  try {
    const response = await fetch(PYTHON_HEALTH_URL, {
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === "ok";
  } catch (error) {
    return false;
  }
};

const checkMLService = async () => {
  try {
    const response = await fetch(ML_HEALTH_URL, {
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.status === "running";
  } catch (error) {
    return false;
  }
};

// ==========================================
// OCR
// ==========================================

const performOCR = async (imagePath) => {

  console.log("\n");
  console.log("########################################");
  console.log("🔎 OCR STEP STARTED");
  console.log("########################################");

  // ----------------------------------------
  // STEP 1 — CHECK PYTHON OCR
  // ----------------------------------------

  const healthStart =
    performance.now();

  console.log(
    "1️⃣ Checking RapidOCR service..."
  );

  const serviceReady =
    await checkOCRService();

  console.log(
    `   Python health check: ${(
      performance.now() - healthStart
    ).toFixed(0)} ms`
  );

  if (!serviceReady) {

    throw new Error(
      "RapidOCR service is not running."
    );
  }

  console.log(
    "   ✅ RapidOCR service is ONLINE"
  );

  // ----------------------------------------
  // STEP 2 — SEND IMAGE TO RAPIDOCR
  // ----------------------------------------

  console.log(
    "\n2️⃣ Sending image to RapidOCR..."
  );

  const pythonStart =
    performance.now();

  console.log(
    "   Image:",
    imagePath
  );

  let response;

  try {

    response = await fetch(
      PYTHON_OCR_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          imagePath: imagePath,
        }),
      }
    );

  } catch (error) {

    console.error(
      "❌ Could not connect to RapidOCR:"
    );

    console.error(
      error.message
    );

    throw new Error(
      "Could not connect to RapidOCR service."
    );
  }

  const pythonResponseTime =
    performance.now() - pythonStart;

  console.log(
    `3️⃣ RapidOCR RESPONSE received after: ${pythonResponseTime.toFixed(0)} ms`
  );

  console.log(
    "   HTTP status:",
    response.status
  );

  // ----------------------------------------
  // STEP 3 — READ PYTHON RESPONSE
  // ----------------------------------------

  console.log(
    "\n4️⃣ Reading RapidOCR response..."
  );

  const jsonStart =
    performance.now();

  const data =
    await response.json();

  console.log(
    `   Response JSON read: ${(
      performance.now() - jsonStart
    ).toFixed(0)} ms`
  );

  // ----------------------------------------
  // CHECK RESULT
  // ----------------------------------------

  if (!response.ok) {

    throw new Error(
      data.error ||
      data.message ||
      `RapidOCR returned HTTP ${response.status}`
    );
  }

  if (!data.success) {

    throw new Error(
      data.error ||
      data.message ||
      "RapidOCR failed"
    );
  }

  // ----------------------------------------
  // DISPLAY OCR RESULT
  // ----------------------------------------

  console.log(
    "\n5️⃣ OCR RESULT"
  );

  console.log(
    "----------------------------------------"
  );

  console.log(
    "Text regions:",
    data.regions ?? "N/A"
  );

  console.log(
    "Confidence:",
    Number(
      data.confidence || 0
    ).toFixed(2) + "%"
  );

  console.log(
    "RapidOCR inference time:",
    data.ocrTime ?? "N/A",
    "seconds"
  );

  console.log(
    "RapidOCR total processing time:",
    data.totalTime ?? "N/A",
    "seconds"
  );

  console.log(
    "----------------------------------------"
  );

  console.log(
    data.text ||
    "No text detected."
  );

  console.log(
    "----------------------------------------"
  );

  console.log(
    "✅ OCR STEP FINISHED"
  );

  console.log(
    "########################################\n"
  );

  return {

    text:
      data.text || "",

    confidence:
      Number(
        data.confidence || 0
      ),
  };
};

// ==========================================
// ML TAMPERING / FORGERY DETECTION
// ==========================================

const performMLVerification = async (
  imagePath
) => {

  console.log("\n");
  console.log("########################################");
  console.log("🤖 ML VERIFICATION STARTED");
  console.log("########################################");

  const mlStart =
    performance.now();

  try {

    // ----------------------------------------
    // READ SAVED IMAGE
    // ----------------------------------------

    console.log(
      "1️⃣ Reading saved document..."
    );

    const imageBuffer =
      fs.readFileSync(
        imagePath
      );

    console.log(
      `   Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`
    );

    // ----------------------------------------
    // CREATE FORM DATA
    // ----------------------------------------

    const formData =
      new FormData();

    const imageBlob =
      new Blob(
        [imageBuffer],
        {
          type: "image/jpeg",
        }
      );

    // ----------------------------------------
    // ADD IMAGE
    // ----------------------------------------

    formData.append(
      "file",
      imageBlob,
      path.basename(imagePath)
    );

    console.log(
      "2️⃣ Sending document to ML API..."
    );

    console.log(
      "   URL:",
      ML_VERIFY_URL
    );

    // ----------------------------------------
    // CALL ML API
    // ----------------------------------------

    const response = await fetch(ML_VERIFY_URL, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(3000),
    });

    console.log(
      "3️⃣ ML response received"
    );

    console.log(
      "   HTTP status:",
      response.status
    );

    // ----------------------------------------
    // READ RESPONSE
    // ----------------------------------------

    const data =
      await response.json();

    // ----------------------------------------
    // CHECK HTTP STATUS
    // ----------------------------------------

    if (!response.ok) {

      throw new Error(
        data.error ||
        data.message ||
        `ML API returned HTTP ${response.status}`
      );
    }

    // ----------------------------------------
    // CHECK API SUCCESS
    // ----------------------------------------

    if (!data.success) {

      throw new Error(
        data.error ||
        data.message ||
        "ML verification failed"
      );
    }

    // ----------------------------------------
    // ML COMPLETE
    // ----------------------------------------

    const mlTime =
      performance.now() -
      mlStart;

    console.log(
      `🤖 ML completed in ${mlTime.toFixed(0)} ms`
    );

    console.log(
      "🧠 ML ANALYSIS:"
    );

    console.log(
      data.analysis
    );

    console.log(
      "########################################"
    );

    return {

      success:
        true,

      analysis:
        data.analysis,

      filename:
        data.filename,

      doc_type:
        data.doc_type,

      processingTime:
        mlTime,
    };

  } catch (error) {

    console.error(
      "❌ ML VERIFICATION ERROR:",
      error.message
    );

    throw error;
  }
};

// ==========================================
// RECEIVE DOCUMENT
// ==========================================

app.post(
  "/api/capture",

  upload.single("document"),

  async (req, res) => {

    const totalStart =
      performance.now();

    console.log("\n\n");

    console.log(
      "========================================"
    );

    console.log(
      "📥 NEW DOCUMENT REQUEST"
    );

    console.log(
      "========================================"
    );

    try {

      // --------------------------------------
      // STEP 1 — RECEIVE FILE
      // --------------------------------------

      console.log(
        "1️⃣ Checking uploaded file..."
      );

      if (!req.file) {

        console.log(
          "❌ No file received"
        );

        return res.status(400).json({

          success:
            false,

          message:
            "No document received",
        });
      }

      console.log(
        "   ✅ File received"
      );

      console.log(
        "   Size:",
        (req.file.size / 1024).toFixed(2),
        "KB"
      );

      console.log(
        "   Type:",
        req.file.mimetype
      );

      // --------------------------------------
      // STEP 2 — SAVE IMAGE
      // --------------------------------------

      console.log(
        "\n2️⃣ Saving image..."
      );

      const saveStart =
        performance.now();

      const filename =
        `document-${Date.now()}.jpg`;

      const filepath =
        path.join(
          capturesFolder,
          filename
        );

      fs.writeFileSync(
        filepath,
        req.file.buffer
      );

      console.log(
        `   ✅ Image saved in ${(
          performance.now() -
          saveStart
        ).toFixed(0)} ms`
      );

      console.log(
        "   File:",
        filename
      );

      // --------------------------------------
      // --------------------------------------
      // STEP 3 — OCR + ML + VERIFICATION ENGINE
      // --------------------------------------

      console.log(
        "\n3️⃣ STARTING OCR + ML IN PARALLEL..."
      );

      const analysisStart =
        performance.now();

      // Run OCR & ML in parallel (with safe fallback for ML)
      const ocrPromise = performOCR(filepath);
      const mlPromise = performMLVerification(filepath).catch((err) => {
        console.warn("   ⚠️ ML Service offline or skipped:", err.message);
        return {
          success: false,
          analysis: null,
          doc_type: null,
          processingTime: 0,
        };
      });

      const [ocrResult, mlResult] = await Promise.all([
        ocrPromise,
        mlPromise,
      ]);

      const analysisTime =
        performance.now() -
        analysisStart;

      console.log(
        `\n⚡ OCR + ML completed in ${analysisTime.toFixed(0)} ms`
      );

      // --------------------------------------
      // STEP 4 — DOCUMENT-SPECIFIC VERIFICATION ENGINE
      // --------------------------------------
      console.log(
        "\n🛡️ RUNNING DOCUMENT-SPECIFIC VERIFICATION ENGINE..."
      );

      const verifyStart = performance.now();
      const verification = await verifyDocument({
        ocrText: ocrResult.text,
        imageInput: req.file.buffer,
        mlDocumentType: mlResult?.doc_type,
      });

      const verifyTime = performance.now() - verifyStart;
      console.log(
        `✅ Verification Engine completed in ${verifyTime.toFixed(0)} ms (${verification.documentType}, Risk: ${verification.riskScore}, Status: ${verification.status})`
      );

      // --------------------------------------
      // STEP 5 — TOTAL TIME
      // --------------------------------------

      const totalTime =
        performance.now() -
        totalStart;

      console.log(
        "\n========================================"
      );

      console.log(
        `🔥 TOTAL DOCUMENT TIME: ${totalTime.toFixed(0)} ms`
      );

      console.log(
        `🔥 TOTAL DOCUMENT TIME: ${(totalTime / 1000).toFixed(2)} seconds`
      );

      console.log(
        "========================================"
      );

      // --------------------------------------
      // STEP 6 — SEND RESULT TO FRONTEND
      // --------------------------------------

      console.log(
        "\n4️⃣ Sending result to frontend..."
      );

      res.json({
        success: true,
        filename: filename,

        // ==============================
        // VERIFICATION ENGINE RESULT
        // ==============================
        documentType: verification.documentType,
        riskScore: verification.riskScore,
        status: verification.status,
        checks: verification.checks,
        warnings: verification.warnings,
        details: verification.details,
        tamperingDetails: verification.tamperingDetails,
        suspiciousRegions: verification.suspiciousRegions,
        classification: verification.classification,
        qrData: verification.qrData,

        // ==============================
        // OCR RESULT
        // ==============================
        text: ocrResult.text,
        confidence: ocrResult.confidence,

        // ==============================
        // ML RESULT
        // ==============================
        mlAnalysis: mlResult.analysis,
        mlDocumentType: mlResult.doc_type,
        mlProcessingTime: mlResult.processingTime,

        // ==============================
        // TIMING
        // ==============================
        processingTime: totalTime,
        engineProcessingTime: verifyTime,
        message: "Document OCR and forensic verification completed",
      });

      console.log(
        "✅ RESPONSE SENT TO FRONTEND"
      );

      console.log(
        "========================================\n"
      );

    } catch (error) {

      console.error("\n");

      console.error(
        "========================================"
      );

      console.error(
        "❌ DOCUMENT PROCESSING ERROR"
      );

      console.error(
        "========================================"
      );

      console.error(
        error.message
      );

      console.error(
        "========================================\n"
      );

      res.status(500).json({

        success:
          false,

        message:
          error.message ||
          "Failed to process document",

      });
    }
  }
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get(
  "/api/health",

  async (req, res) => {

    const [
      ocrReady,
      mlReady
    ] =
      await Promise.all([

        checkOCRService(),

        checkMLService(),

      ]);

    res.json({

      server:
        "running",

      rapidOCR:
        ocrReady
          ? "ready"
          : "offline",

      mlService:
        mlReady
          ? "ready"
          : "offline",

    });

  }
);

// ==========================================
// ERROR HANDLER
// ==========================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {

    console.error(
      "SERVER ERROR:",
      error.message
    );

    res.status(400).json({

      success:
        false,

      message:
        error.message ||
        "Server error",

    });
  }
);

// ==========================================
// START SERVER
// ==========================================

app.listen(
  PORT,
  "0.0.0.0",

  () => {

    console.log("\n");

    console.log(
      "========================================"
    );

    console.log(
      "🚀 LOCAL DOCUMENT SERVER STARTED"
    );

    console.log(
      "========================================"
    );

    console.log(
      `Node Server: http://localhost:${PORT}`
    );

    console.log(
      "OCR Engine: RapidOCR + ONNX Runtime"
    );

    console.log(
      "Python OCR: http://127.0.0.1:8000"
    );

    console.log(
      "ML Forgery Detection: http://127.0.0.1:5001"
    );

    console.log(
      "========================================"
    );

    console.log(
      "Waiting for document uploads..."
    );

    console.log(
      "========================================"
    );

    console.log("\n");
  }
);