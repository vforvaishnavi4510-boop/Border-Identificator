
import { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";

function OCR({ image }) {
  const [ocrText, setOcrText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const workerRef = useRef(null);

  // =========================================================
  // CREATE TESSERACT WORKER
  // =========================================================

  const getWorker = async () => {
    if (workerRef.current) {
      return workerRef.current;
    }

    console.log("CREATING TESSERACT WORKER...");

    const worker = await createWorker("eng");

    workerRef.current = worker;

    console.log("TESSERACT WORKER READY");

    return worker;
  };

  // =========================================================
  // IMAGE PREPROCESSING
  // =========================================================

  const preprocessImage = (image) => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          console.log("PREPROCESSING IMAGE...");

          const canvas = document.createElement("canvas");

          const ctx = canvas.getContext("2d", {
            willReadFrequently: true,
          });

          if (!ctx) {
            reject(
              new Error("Could not create canvas context")
            );
            return;
          }

          // Keep original resolution
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw image
          ctx.drawImage(
            img,
            0,
            0,
            canvas.width,
            canvas.height
          );

          const imageData = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );

          const data = imageData.data;

          // =================================================
          // GRAYSCALE + MILD CONTRAST
          // =================================================

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Convert to grayscale
            let gray =
              0.299 * r +
              0.587 * g +
              0.114 * b;

            // Mild contrast enhancement
            gray =
              (gray - 128) * 1.15 + 128;

            // Keep value between 0 and 255
            gray = Math.max(
              0,
              Math.min(255, gray)
            );

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }

          ctx.putImageData(
            imageData,
            0,
            0
          );

          console.log(
            "IMAGE PREPROCESSING COMPLETE"
          );

          // Return processed image
          resolve(
            canvas.toDataURL("image/png")
          );

        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(
          new Error(
            "Could not load image for preprocessing"
          )
        );
      };

      img.src = image;
    });
  };

  // =========================================================
  // CLEAN OCR TEXT
  // =========================================================

  const cleanOCRText = (text) => {
    if (!text) {
      return "";
    }

    console.log("CLEANING OCR TEXT...");

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const cleanedLines = [];

    for (let line of lines) {
      // Remove excessive spaces
      line = line.replace(/\s+/g, " ");

      // Remove repeated garbage symbols
      line = line.replace(
        /[|~`^]{2,}/g,
        ""
      );

      // Remove long sequences of underscores
      line = line.replace(
        /_{3,}/g,
        ""
      );

      // Remove unusual symbols
      line = line.replace(
        /[^a-zA-Z0-9\s.,:/()#&'%-]/g,
        ""
      );

      line = line.trim();

      if (!line) {
        continue;
      }

      // =====================================================
      // CHECK USEFUL CHARACTERS
      // =====================================================

      const usefulCharacters =
        line.replace(
          /[^a-zA-Z0-9]/g,
          ""
        );

      // Ignore extremely short garbage
      if (usefulCharacters.length < 2) {
        continue;
      }

      // =====================================================
      // USEFUL CHARACTER RATIO
      // =====================================================

      const usefulRatio =
        usefulCharacters.length /
        line.length;

      /*
        Ignore a line when it contains very
        little useful information.
      */

      if (
        usefulRatio < 0.30 &&
        usefulCharacters.length < 6
      ) {
        continue;
      }

      // =====================================================
      // REMOVE REPEATED CHARACTERS
      // =====================================================

      line = line.replace(
        /(.)\1{5,}/g,
        "$1"
      );

      // =====================================================
      // REMOVE EXCESSIVE PUNCTUATION
      // =====================================================

      line = line.replace(
        /[.,:;|]{4,}/g,
        " "
      );

      line = line.replace(
        /\s+/g,
        " "
      );

      line = line.trim();

      if (line) {
        cleanedLines.push(line);
      }
    }

    // =====================================================
    // REMOVE DUPLICATE LINES
    // =====================================================

    const finalLines = [];

    for (const line of cleanedLines) {
      if (
        finalLines.length === 0 ||
        finalLines[
          finalLines.length - 1
        ].toLowerCase() !== line.toLowerCase()
      ) {
        finalLines.push(line);
      }
    }

    return finalLines.join("\n").trim();
  };

  // =========================================================
  // RUN OCR
  // =========================================================

  const runOCR = async () => {
    if (!image) {
      return;
    }

    try {
      setOcrLoading(true);
      setOcrText("");
      setOcrConfidence(0);
      setErrorMessage("");

      console.log(
        "================================"
      );

      console.log("OCR STARTED");

      console.log(
        "================================"
      );

      // =====================================================
      // STEP 1 - PREPROCESS IMAGE
      // =====================================================

      const processedImage =
        await preprocessImage(image);

      // =====================================================
      // STEP 2 - CREATE WORKER
      // =====================================================

      const worker =
        await getWorker();

      // =====================================================
      // STEP 3 - RUN TESSERACT
      // =====================================================

      console.log(
        "RUNNING TESSERACT..."
      );

      const result =
        await worker.recognize(
          processedImage
        );

      // =====================================================
      // STEP 4 - GET RAW TEXT
      // =====================================================

      const rawText =
        result.data.text || "";

      console.log(
        "RAW OCR RESULT:"
      );

      console.log(rawText);

      // =====================================================
      // STEP 5 - GET CONFIDENCE
      // =====================================================

      const confidence =
        Number(result.data.confidence) || 0;

      setOcrConfidence(
        Math.round(confidence)
      );

      console.log(
        "OCR CONFIDENCE:",
        confidence
      );

      // =====================================================
      // STEP 6 - CLEAN TEXT
      // =====================================================

      const cleanedText =
        cleanOCRText(rawText);

      console.log(
        "CLEANED OCR RESULT:"
      );

      console.log(cleanedText);

      console.log(
        "================================"
      );

      // =====================================================
      // STEP 7 - SHOW RESULT
      // =====================================================

      if (cleanedText.length > 0) {
        setOcrText(cleanedText);
      } else {
        setOcrText(
          "No readable text detected. Please scan the document again."
        );
      }

    } catch (error) {
      console.error(
        "OCR ERROR:",
        error
      );

      setErrorMessage(
        "OCR failed. Please try scanning the document again."
      );

      setOcrText("");

    } finally {
      setOcrLoading(false);
    }
  };

  // =========================================================
  // AUTOMATIC OCR WHEN IMAGE CHANGES
  // =========================================================

  useEffect(() => {
    if (!image) {
      return;
    }

    runOCR();
  }, [image]);

  // =========================================================
  // CLEANUP TESSERACT WORKER
  // =========================================================

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current
          .terminate()
          .catch((error) => {
            console.error(
              "WORKER TERMINATION ERROR:",
              error
            );
          });

        workerRef.current = null;
      }
    };
  }, []);

  // =========================================================
  // UI
  // =========================================================

  return (
    <div
      style={{
        marginTop: "25px",
        padding: "20px",
        background: "#181d27",
        borderRadius: "12px",
        textAlign: "left",
      }}
    >
      <h2
        style={{
          marginTop: 0,
        }}
      >
        🔎 OCR Result
      </h2>

      {/* =====================================================
          LOADING
      ====================================================== */}

      {ocrLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "25px",
            fontSize: "18px",
          }}
        >
          <div
            style={{
              fontSize: "35px",
            }}
          >
            🔄
          </div>

          <p>
            Processing document...
          </p>

          <p
            style={{
              color: "#9db7d4",
              fontSize: "14px",
            }}
          >
            Enhancing image and
            extracting text
          </p>
        </div>
      )}

      {/* =====================================================
          OCR RESULT
      ====================================================== */}

      {!ocrLoading && ocrText && (
        <>
          <div
            style={{
              marginBottom: "15px",
              padding: "12px",
              background: "#0e1117",
              borderRadius: "8px",
            }}
          >
            <strong>
              OCR Confidence:
            </strong>{" "}
            {ocrConfidence}%
          </div>

          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#0e1117",
              padding: "15px",
              borderRadius: "8px",
              lineHeight: "1.6",
              fontSize: "16px",
              color: "#e8edf5",
              minHeight: "100px",
            }}
          >
            {ocrText}
          </pre>

          {ocrConfidence < 60 && (
            <div
              style={{
                marginTop: "15px",
                padding: "12px",
                background: "#4a3515",
                color: "#ffd166",
                borderRadius: "8px",
              }}
            >
              ⚠️ OCR confidence is low.
              The document may be blurry
              or poorly illuminated.
            </div>
          )}
        </>
      )}

      {/* =====================================================
          NO TEXT
      ====================================================== */}

      {!ocrLoading &&
        !ocrText &&
        !errorMessage && (
          <p
            style={{
              color: "#9db7d4",
            }}
          >
            No text detected.
          </p>
        )}

      {/* =====================================================
          ERROR
      ====================================================== */}

      {errorMessage && (
        <div
          style={{
            padding: "15px",
            background: "#4a1515",
            color: "#ff7777",
            borderRadius: "8px",
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* =====================================================
          RUN OCR AGAIN
      ====================================================== */}

      {!ocrLoading && image && (
        <button
          onClick={runOCR}
          style={{
            marginTop: "15px",
            padding: "10px 20px",
            fontSize: "16px",
            cursor: "pointer",
            border: "none",
            borderRadius: "8px",
          }}
        >
          🔄 Run OCR Again
        </button>
      )}
    </div>
  );
}

export default OCR;

