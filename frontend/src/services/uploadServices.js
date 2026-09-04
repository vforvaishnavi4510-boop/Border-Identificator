const uploadDocument = async (imageData) => {
  try {
    if (!imageData) {
      throw new Error("No image received");
    }

    const response = await fetch(imageData);

    if (!response.ok) {
      throw new Error("Could not convert image");
    }

    const blob = await response.blob();

    const serverHost = window.location.hostname;

    // =========================
    // DOCUMENT UPLOAD
    // =========================
    const uploadFormData = new FormData();
    uploadFormData.append(
      "document",
      blob,
      `document-${Date.now()}.jpg`
    );

    const uploadResponse = await fetch(
      `http://${serverHost}:5000/api/capture`,
      {
        method: "POST",
        body: uploadFormData,
      }
    );

    const result = await uploadResponse.json();

    if (!uploadResponse.ok || !result.success) {
      throw new Error(result.message || "Upload failed");
    }

    // =========================
    // AADHAAR SECURE QR VERIFICATION
    // =========================
    let qrVerification = {
      success: false,
      message: "QR verification not performed",
    };

    try {
      const qrFormData = new FormData();
      qrFormData.append(
        "document",
        blob,
        `document-${Date.now()}.jpg`
      );

      const qrResponse = await fetch(
        `http://${serverHost}:5000/api/verify-aadhaar-qr`,
        {
          method: "POST",
          body: qrFormData,
        }
      );

      qrVerification = await qrResponse.json();

      console.log("");
      console.log("🔐 AADHAAR SECURE QR RESULT");
      console.log("--------------------------------");
      console.log(JSON.stringify(qrVerification, null, 2));
      console.log("--------------------------------");
    } catch (err) {
      console.log("⚠️ QR verification skipped:", err.message);
    }

    // =========================
    // OCR RESULT
    // =========================
    console.log("✅ Document uploaded");
    console.log("📄 OCR received from laptop:");
    console.log(result.text || result.ocrText || "");

    console.log(
      "📊 OCR confidence:",
      result.confidence ??
        result.ocrConfidence ??
        result.ocr?.confidence ??
        0
    );

    // =========================
    // ML RESULT
    // =========================
    const ml = result.mlAnalysis || {};

    console.log("");
    console.log("🤖 ML ANALYSIS RECEIVED:");
    console.log("--------------------------------");
    console.log(JSON.stringify(result, null, 2));
    console.log("--------------------------------");

    console.log(
      "📄 ML Document Type:",
      ml.document_type ||
        ml.documentType ||
        result.mlDocumentType ||
        "unknown"
    );

    console.log(
      "🎯 ML Confidence:",
      `${ml.classification_confidence}%`
    );

    console.log(
      "⏱️ ML Processing Time:",
      ml.processing_time ||
        ml.processingTime ||
        result.mlProcessingTime ||
        "N/A"
    );

    // Return everything together
    return {
      ...result,
      qrVerification,
    };
  } catch (error) {
    console.error("❌ Upload error:", error);
    throw error;
  }
};

export default uploadDocument;