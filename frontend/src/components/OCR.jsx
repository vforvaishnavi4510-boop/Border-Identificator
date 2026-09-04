import { useEffect, useState } from "react";

function OCR({ image }) {
  const [ocrText, setOcrText] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  // ==========================================
  // ML STATE
  // ==========================================

  const [mlAnalysis, setMlAnalysis] = useState(null);
  const [mlDocumentType, setMlDocumentType] = useState("");
  const [mlProcessingTime, setMlProcessingTime] = useState(null);

  // ==========================================
  // CONVERT DATA URL TO FILE
  // ==========================================

  const dataURLtoFile = (dataUrl, filename) => {
    const arr = dataUrl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];

    const bstr = atob(arr[1]);

    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new File([u8arr], filename, {
      type: mime,
    });
  };

  // ==========================================
  // CLEAN OCR TEXT
  // ==========================================

  const cleanOCRText = (text) => {
    if (!text) {
      return "";
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const cleanedLines = [];

    for (let line of lines) {
      // Remove excessive spaces
      line = line.replace(/\s+/g, " ");

      // Remove repeated garbage symbols
      line = line.replace(/[|~`^]{2,}/g, "");

      // Remove long underscores
      line = line.replace(/_{3,}/g, "");

      // Remove unusual symbols
      line = line.replace(
        /[^a-zA-Z0-9\s.,:/()#&'%-]/g,
        ""
      );

      line = line.trim();

      if (!line) {
        continue;
      }

      // Useful characters
      const usefulCharacters = line.replace(
        /[^a-zA-Z0-9]/g,
        ""
      );

      if (usefulCharacters.length < 2) {
        continue;
      }

      // Remove extremely bad lines
      const usefulRatio =
        usefulCharacters.length / line.length;

      if (
        usefulRatio < 0.30 &&
        usefulCharacters.length < 6
      ) {
        continue;
      }

      // Remove repeated characters
      line = line.replace(
        /(.)\1{5,}/g,
        "$1"
      );

      // Remove excessive punctuation
      line = line.replace(
        /[.,:;|]{4,}/g,
        " "
      );

      line = line.replace(/\s+/g, " ");

      line = line.trim();

      if (line) {
        cleanedLines.push(line);
      }
    }

    // Remove duplicate lines
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

  // ==========================================
  // RUN OCR + ML
  // ==========================================

  const runOCR = async () => {
    if (!image) {
      return;
    }

    const startTime = performance.now();

    try {
      setOcrLoading(true);

      // Clear previous results
      setOcrText("");
      setOcrConfidence(0);
      setErrorMessage("");

      // Clear previous ML result
      setMlAnalysis(null);
      setMlDocumentType("");
      setMlProcessingTime(null);

      console.log("");
      console.log("================================");
      console.log("🚀 OCR + ML STARTED");
      console.log("================================");

      // ========================================
      // CREATE IMAGE FILE
      // ========================================

      const imageFile = dataURLtoFile(
        image,
        "document.jpg"
      );

      console.log(
        "Image size:",
        (imageFile.size / 1024).toFixed(2),
        "KB"
      );

      // ========================================
      // CREATE FORM DATA
      // ========================================

      const formData = new FormData();

      formData.append(
        "document",
        imageFile
      );

      // ========================================
      // SEND TO NODE
      // ========================================

      console.log(
        "📡 Sending image to Node server..."
      );

      const response = await fetch(
        "http://localhost:5000/api/capture",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error(
          `Server returned ${response.status}`
        );
      }

      const result = await response.json();

      console.log("");
      console.log("📦 RESPONSE FROM NODE");
      console.log("--------------------------------");
      console.log(result);
      console.log("--------------------------------");

      if (!result.success) {
        throw new Error(
          result.message ||
            "Document processing failed"
        );
      }

      // ========================================
      // GET OCR TEXT
      // ========================================

      const rawText =
        result.text || "";

      console.log("");
      console.log("📄 RAW PADDLEOCR TEXT");
      console.log("--------------------------------");
      console.log(rawText);
      console.log("--------------------------------");

      // ========================================
      // OCR CONFIDENCE
      // ========================================

      const confidence =
        Number(result.confidence) || 0;

      setOcrConfidence(
        Math.round(confidence)
      );

      console.log(
        "OCR Confidence:",
        confidence.toFixed(2) + "%"
      );

      // ========================================
      // CLEAN OCR TEXT
      // ========================================

      const cleanedText =
        cleanOCRText(rawText);

      console.log("");
      console.log("🧹 CLEANED TEXT");
      console.log("--------------------------------");
      console.log(cleanedText);
      console.log("--------------------------------");

      setOcrText(
        cleanedText ||
          "No readable text detected."
      );

      // ========================================
      // GET ML RESULT
      // ========================================

      console.log("");
      console.log("🤖 ML ANALYSIS");
      console.log("--------------------------------");
      console.log(result.mlAnalysis);
      console.log("--------------------------------");

      setMlAnalysis(
        result.mlAnalysis || null
      );

      // ========================================
      // GET ML DOCUMENT TYPE
      // ========================================

      console.log(
        "📄 ML Document Type:",
        result.mlDocumentType
      );

      setMlDocumentType(
        result.mlDocumentType || ""
      );

      // ========================================
      // GET ML PROCESSING TIME
      // ========================================

      console.log(
        "⏱️ ML Processing Time:",
        result.mlProcessingTime
      );

      setMlProcessingTime(
        result.mlProcessingTime ?? null
      );

      // ========================================
      // TOTAL TIME
      // ========================================

      const endTime =
        performance.now();

      const totalTime =
        (endTime - startTime) / 1000;

      console.log("");
      console.log(
        `⏱️ TOTAL OCR + ML TIME: ${totalTime.toFixed(
          2
        )} seconds`
      );

      console.log(
        "================================"
      );
      console.log(
        "✅ OCR + ML COMPLETED"
      );
      console.log(
        "================================");
    } catch (error) {
      console.error(
        "❌ OCR + ML ERROR:",
        error
      );

      setErrorMessage(
        error.message ||
          "Document processing failed. Please try scanning again."
      );

      setOcrText("");

      // Clear ML result if processing failed
      setMlAnalysis(null);
      setMlDocumentType("");
      setMlProcessingTime(null);
    } finally {
      setOcrLoading(false);
    }
  };

  // ==========================================
  // AUTOMATIC OCR + ML
  // ==========================================

  useEffect(() => {
    if (!image) {
      return;
    }

    runOCR();
  }, [image]);

  // ==========================================
  // UI
  // ==========================================

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
        🔎 PaddleOCR Result
      </h2>

      {/* ======================================
          LOADING
      ====================================== */}

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
            OCR and tampering detection are
            running...
          </p>
        </div>
      )}

      {/* ======================================
          OCR RESULT
      ====================================== */}

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

      {/* ======================================
          ML RESULT
      ====================================== */}

      {!ocrLoading && mlAnalysis && (
        <div
          style={{
            marginTop: "25px",
            padding: "20px",
            background: "#0e1117",
            borderRadius: "10px",
            border: "1px solid #303846",
          }}
        >
          <h2
            style={{
              marginTop: 0,
            }}
          >
            🤖 Tampering Detection
          </h2>

          {mlDocumentType && (
            <div
              style={{
                marginBottom: "15px",
              }}
            >
              <strong>
                Document Type:
              </strong>{" "}
              {mlDocumentType}
            </div>
          )}

          {mlProcessingTime !== null && (
            <div
              style={{
                marginBottom: "15px",
              }}
            >
              <strong>
                ML Processing Time:
              </strong>{" "}
              {mlProcessingTime} ms
            </div>
          )}

          <div
            style={{
              marginTop: "15px",
            }}
          >
            <strong>
              ML Analysis:
            </strong>

            <pre
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "#181d27",
                padding: "15px",
                marginTop: "10px",
                borderRadius: "8px",
                lineHeight: "1.5",
                fontSize: "14px",
                color: "#e8edf5",
                overflowX: "auto",
              }}
            >
              {typeof mlAnalysis === "string"
                ? mlAnalysis
                : JSON.stringify(
                    mlAnalysis,
                    null,
                    2
                  )}
            </pre>
          </div>
        </div>
      )}

      {/* ======================================
          NO TEXT
      ====================================== */}

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

      {/* ======================================
          ERROR
      ====================================== */}

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

      {/* ======================================
          RUN AGAIN
      ====================================== */}

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