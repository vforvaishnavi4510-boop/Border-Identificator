
const uploadDocument = async (imageData) => {
  try {
    if (!imageData) {
      throw new Error("No image received");
    }

    // Convert Base64 image to Blob
    const response = await fetch(imageData);

    if (!response.ok) {
      throw new Error("Could not convert image");
    }

    const blob = await response.blob();

    // Create FormData
    const formData = new FormData();

    formData.append(
      "document",
      blob,
      `document-${Date.now()}.jpg`
    );

    // Laptop IP address
    const serverHost =
      window.location.hostname;

    // Send document to backend
    const uploadResponse = await fetch(
      `http://${serverHost}:5000/api/capture`,
      {
        method: "POST",
        body: formData,
      }
    );

    const result =
      await uploadResponse.json();

    if (
      !uploadResponse.ok ||
      !result.success
    ) {
      throw new Error(
        result.message ||
        "Upload failed"
      );
    }

    console.log(
      "✅ Document uploaded"
    );

    console.log(
      "📄 OCR received from laptop:"
    );

    console.log(result.text);

    console.log(
      "📊 OCR confidence:",
      result.confidence
    );

    // Return complete backend response
    return result;

  } catch (error) {
    console.error(
      "❌ Upload error:",
      error
    );

    throw error;
  }
};

export default uploadDocument;

