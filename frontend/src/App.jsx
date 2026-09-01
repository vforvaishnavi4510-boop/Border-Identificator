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
      };

      // Add new document without deleting previous documents
      setDocuments((prev) => [
        ...prev,
        newDocument,
      ]);

      setUploadStatus(
        "✅ Document uploaded and OCR completed"
      );

    } catch (error) {
      console.error("Upload error:", error);

      setUploadStatus(
        "❌ Failed to upload document"
      );
    }
  };

  return (
    <div>
      <CameraScanner
        onCapture={handleCapture}
      />

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
          <h2>
            📄 Uploaded Documents
          </h2>

          {documents.map((document, index) => (
            <div
              key={document.id}
              style={{
                marginTop: "20px",
                padding: "20px",
                background: "#181d27",
                borderRadius: "12px",
                color: "white",
              }}
            >
              <h3>
                Document {index + 1}
              </h3>

              <p>
                <strong>File:</strong>{" "}
                {document.filename}
              </p>

              <p>
                <strong>OCR Confidence:</strong>{" "}
                {document.confidence}%
              </p>

              {document.text ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "#0e1117",
                    padding: "15px",
                    borderRadius: "8px",
                    lineHeight: "1.6",
                    fontSize: "16px",
                  }}
                >
                  {document.text}
                </pre>
              ) : (
                <p>
                  No OCR text detected.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;