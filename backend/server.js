import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";

const app = express();
const PORT = 5000;

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
        new Error(
          "Only image files are allowed"
        )
      );
    }
  },
});

// ==========================================
// PYTHON OCR SERVICE
// ==========================================

const PYTHON_OCR_URL =
  "http://127.0.0.1:8000/ocr";

// ==========================================
// CHECK PYTHON OCR SERVICE
// ==========================================

const checkOCRService = async () => {
  try {
    const response = await fetch(
      "http://127.0.0.1:8000/health"
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();

    return (
      data.success === true &&
      data.status === "ready"
    );
  } catch {
    return false;
  }
};

// ==========================================
// SEND IMAGE TO PYTHON
// ==========================================

// ==========================================
// SEND IMAGE TO PYTHON PADDLEOCR SERVICE
// ==========================================

const performOCR = async (imagePath) => {
  console.log("");
  console.log("================================");
  console.log("🔎 SENDING IMAGE TO PADDLEOCR");
  console.log("================================");

  console.log("Image:", imagePath);

  return new Promise((resolve, reject) => {
    const requestData = JSON.stringify({
      imagePath,
    });

    const options = {
      hostname: "127.0.0.1",
      port: 8000,
      path: "/ocr",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestData),
      },
    };

    const request = http.request(options, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        try {
          const result = JSON.parse(data);

          if (!result.success) {
            reject(
              new Error(
                result.message || "PaddleOCR failed"
              )
            );
            return;
          }

          console.log("");
          console.log("📄 PADDLEOCR RESULT");
          console.log("--------------------------------");
          console.log(
            result.text || "No text detected."
          );
          console.log("--------------------------------");

          console.log(
            "Confidence:",
            Number(result.confidence || 0).toFixed(2) + "%"
          );

          console.log("================================");
          console.log("✅ PADDLEOCR COMPLETED");
          console.log("================================");

          resolve({
            text: result.text || "",
            confidence: Number(result.confidence) || 0,
          });

        } catch (error) {
          reject(
            new Error(
              "Invalid response from OCR service"
            )
          );
        }
      });
    });

    request.on("error", (error) => {
      reject(
        new Error(
          "Could not connect to PaddleOCR service. " +
          "Make sure ocr_service.py is running."
        )
      );
    });

    request.write(requestData);
    request.end();
  });
};

// ==========================================
// RECEIVE DOCUMENT
// ==========================================

app.post(
  "/api/capture",
  upload.single("document"),
  async (req, res) => {

    try {

      console.log("");
      console.log(
        "================================"
      );

      console.log(
        "DOCUMENT RECEIVING..."
      );

      console.log(
        "================================"
      );

      // --------------------------------------
      // CHECK FILE
      // --------------------------------------

      if (!req.file) {

        return res.status(400).json({
          success: false,
          message:
            "No document received",
        });

      }

      // --------------------------------------
      // CREATE FILE NAME
      // --------------------------------------

      const filename =
        `document-${Date.now()}.jpg`;

      const filepath =
        path.join(
          capturesFolder,
          filename
        );

      // --------------------------------------
      // SAVE IMAGE
      // --------------------------------------

      fs.writeFileSync(
        filepath,
        req.file.buffer
      );

      console.log(
        "DOCUMENT SAVED"
      );

      console.log(
        "File:",
        filename
      );

      console.log(
        "Size:",
        (
          req.file.size / 1024
        ).toFixed(2),
        "KB"
      );

      // --------------------------------------
      // SEND TO PYTHON
      // --------------------------------------

      const ocrResult =
        await performOCR(
          filepath
        );

      // --------------------------------------
      // SEND RESULT TO FRONTEND
      // --------------------------------------

      res.json({

        success: true,

        filename,

        text:
          ocrResult.text,

        confidence:
          ocrResult.confidence,

        message:
          "Document saved and OCR completed",

      });

      console.log("");
      console.log(
        "================================"
      );

      console.log(
        "DOCUMENT PROCESSING COMPLETE"
      );

      console.log(
        "================================"
      );

    } catch (error) {

      console.error("");
      console.error(
        "CAPTURE/OCR ERROR:"
      );

      console.error(
        error.message
      );

      res.status(500).json({

        success: false,

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

    const ready =
      await checkOCRService();

    res.json({

      server: "running",

      paddleOCR:
        ready
          ? "ready"
          : "offline",

    });

  }
);

// ==========================================
// ERROR HANDLER
// ==========================================

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error.message
    );

    res.status(400).json({

      success: false,

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

    console.log("");

    console.log(
      "================================"
    );

    console.log(
      "LOCAL DOCUMENT SERVER STARTED"
    );

    console.log(
      "================================"
    );

    console.log(
      `Node Server: http://localhost:${PORT}`
    );

    console.log(
      "OCR Engine: PaddleOCR"
    );

    console.log(
      "Python OCR: http://127.0.0.1:8000"
    );

    console.log(
      "Waiting for phone uploads..."
    );

    console.log(
      "================================"
    );

    console.log("");

  }
);