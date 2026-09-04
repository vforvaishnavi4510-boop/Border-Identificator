import { useState } from "react";
import CameraScanner from "./components/CameraScanner";
import uploadDocument from "./services/uploadServices";

function App() {
  const [uploadStatus, setUploadStatus] = useState("");

  // Store all uploaded documents
  const [documents, setDocuments] = useState([]);

  const handleCapture = async (imageData) => {
    try {
      setUploadStatus("📤 Uploading document to laptop...");

      // Upload image to backend
      const result = await uploadDocument(imageData);

      // Create new document entry
      const newDocument = {
        id: Date.now(),
        filename: result.filename || "Document",
        text: result.text || "",
        confidence: Math.round(result.confidence || 0),
        documentType: result.documentType || "Unknown",
        riskScore: result.riskScore ?? 0,
        status: result.status || "Completed",
        checks: result.checks || {},
        warnings: result.warnings || [],

        // ML data
        mlAnalysis: result.mlAnalysis || null,
        mlDocumentType: result.mlDocumentType || "",
        mlProcessingTime: result.mlProcessingTime || 0,
      };

      // Add new document without deleting previous documents
      setDocuments((prev) => [
        ...prev,
        newDocument,
      ]);

      setUploadStatus(
        `✅ Document verified: ${newDocument.documentType} (${newDocument.status})`
      );

      return result;

    } catch (error) {
      console.error("Upload error:", error);

      setUploadStatus(
        "❌ Failed to upload document"
      );

      throw error;
    }
  };

  return (
    <div>
      <CameraScanner onCapture={handleCapture} />

      {/* STATUS */}
      {uploadStatus && (
        <div
          style={{
            marginTop: "15px",
            fontSize: "17px",
            textAlign: "center",
          }}
        >
          {uploadStatus}
        </div>
      )}

      {/* ALL DOCUMENTS */}
      {documents.length > 0 && (
        <div
          style={{
            width: "min(900px, 92vw)",
            margin: "30px auto",
          }}
        >
          <h2>📄 Uploaded Documents History</h2>

          {documents.map((document, index) => {
            const isSafe = document.riskScore <= 30;
            const isWarning = document.riskScore > 30 && document.riskScore <= 65;
            const badgeColor = isSafe ? "#22c55e" : isWarning ? "#f59e0b" : "#ef4444";

            return (
              <div
                key={document.id}
                style={{
                  marginTop: "20px",
                  padding: "20px",
                  background: "#181d27",
                  borderRadius: "14px",
                  color: "white",
                  borderLeft: `5px solid ${badgeColor}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <h3 style={{ margin: 0 }}>
                    Document {index + 1}: {document.documentType}
                  </h3>
                  <div style={{ background: badgeColor, color: isWarning ? "#0f172a" : "#fff", padding: "4px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: "bold" }}>
                    {document.status} (Risk: {document.riskScore})
                  </div>
                </div>

                <div style={{ marginTop: "12px", display: "flex", gap: "20px", flexWrap: "wrap", fontSize: "14px", color: "#94a3b8" }}>
                  <span><strong>File:</strong> {document.filename}</span>
                  <span><strong>OCR Confidence:</strong> {document.confidence}%</span>
                  <span><strong>Rules Passed:</strong> {Object.values(document.checks).filter(Boolean).length}/{Object.keys(document.checks).length || 1}</span>
                </div>

                {document.text ? (
                  <pre
                    style={{
                      marginTop: "14px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      background: "#0e1117",
                      padding: "15px",
                      borderRadius: "8px",
                      lineHeight: "1.6",
                      fontSize: "15px",
                      color: "#cbd5e1",
                    }}
                  >
                    {document.text}
                  </pre>
                ) : (
                  <p style={{ marginTop: "10px", color: "#64748b" }}>No OCR text detected.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;