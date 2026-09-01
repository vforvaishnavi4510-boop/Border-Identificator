import { createWorker } from "tesseract.js";

const extractText = async (image) => {
  if (!image) {
    throw new Error("No image provided for OCR");
  }

  console.log("🔎 OCR STARTED");

  const worker = await createWorker("eng");

  console.log("✅ TESSERACT WORKER READY");

  try {
    const result = await worker.recognize(image);

    const text = result.data.text.trim();

    console.log("📄 OCR RESULT:");
    console.log(text);

    return text;
  } finally {
    await worker.terminate();

    console.log("✅ OCR FINISHED");
  }
};

export default extractText;