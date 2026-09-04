from flask import Flask, request, jsonify
from rapidocr import (
    RapidOCR,
    EngineType,
    LangDet,
    LangRec,
    ModelType,
    OCRVersion,
)
from PIL import Image
import os
import time


app = Flask(__name__)


# ============================================================
# RAPIDOCR CONFIGURATION
# ============================================================

ocr = RapidOCR(
    params={

        # ----------------------------------------------------
        # GLOBAL SETTINGS
        # ----------------------------------------------------

        # We are scanning normal documents.
        # Orientation classification is not required.
        "Global.use_cls": False,

        # Maximum input image size.
        "Global.max_side_len": 1200,


        # ----------------------------------------------------
        # TEXT DETECTION
        # ----------------------------------------------------

        "Det.engine_type": EngineType.ONNXRUNTIME,
        "Det.lang_type": LangDet.EN,
        "Det.model_type": ModelType.MOBILE,
        "Det.ocr_version": OCRVersion.PPOCRV4,

        # Do not allow very large images to reach the
        # detector.
        "Det.limit_side_len": 736,

        # IMPORTANT:
        # "max" means the image will be reduced when its
        # longest side is larger than 736 pixels.
        "Det.limit_type": "max",

        # Faster detection mode.
        "Det.score_mode": "fast",


        # ----------------------------------------------------
        # TEXT RECOGNITION
        # ----------------------------------------------------

        "Rec.engine_type": EngineType.ONNXRUNTIME,
        "Rec.lang_type": LangRec.EN,
        "Rec.model_type": ModelType.MOBILE,
        "Rec.ocr_version": OCRVersion.PPOCRV4,


        # ----------------------------------------------------
        # CLASSIFICATION
        # ----------------------------------------------------

        "Cls.engine_type": EngineType.ONNXRUNTIME,
        "Cls.lang_type": LangDet.CH,
        "Cls.model_type": ModelType.MOBILE,
        "Cls.ocr_version": OCRVersion.PPOCRV4,
    }
)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.route("/health", methods=["GET"])
def health():

    return jsonify({
        "status": "ok",
        "service": "RapidOCR",
        "engine": "ONNX Runtime",
        "model": "PP-OCRv4 Mobile English"
    })


# ============================================================
# OCR ENDPOINT
# ============================================================

@app.route("/ocr", methods=["POST"])
def perform_ocr():

    start_total = time.time()

    print()
    print("=" * 60)
    print("NEW OCR REQUEST")
    print("=" * 60)

    try:

        # ----------------------------------------------------
        # GET IMAGE PATH
        # ----------------------------------------------------

        data = request.get_json()

        if not data or "imagePath" not in data:

            return jsonify({
                "success": False,
                "error": "imagePath is required"
            }), 400

        image_path = data["imagePath"]

        print(f"Image: {image_path}")


        # ----------------------------------------------------
        # CHECK IMAGE FILE
        # ----------------------------------------------------

        if not os.path.exists(image_path):

            return jsonify({
                "success": False,
                "error": "Image file not found"
            }), 404

        file_size = os.path.getsize(image_path)

        print(
            f"File size: {file_size / 1024:.1f} KB"
        )


        # ----------------------------------------------------
        # OPEN IMAGE
        # ----------------------------------------------------

        image = Image.open(image_path)

        original_width, original_height = image.size

        print(
            f"Original image size: "
            f"{original_width} x {original_height}"
        )


        # ----------------------------------------------------
        # RESIZE IMAGE
        # ----------------------------------------------------

        MAX_IMAGE_SIDE = 1200

        max_original_side = max(
            original_width,
            original_height
        )

        if max_original_side > MAX_IMAGE_SIDE:

            scale = (
                MAX_IMAGE_SIDE /
                max_original_side
            )

            new_width = int(
                original_width * scale
            )

            new_height = int(
                original_height * scale
            )

            print(
                f"Resizing image to: "
                f"{new_width} x {new_height}"
            )

            image = image.resize(
                (new_width, new_height),
                Image.Resampling.LANCZOS
            )

        else:

            print("No resize required")


        # ----------------------------------------------------
        # CREATE TEMP OCR IMAGE
        # ----------------------------------------------------

        base, extension = os.path.splitext(
            image_path
        )

        temp_path = base + "_ocr.jpg"

        image = image.convert("RGB")

        image.save(
            temp_path,
            format="JPEG",
            quality=90,
            optimize=True
        )


        preprocess_time = (
            time.time() - start_total
        )

        print(
            f"Image preprocessing: "
            f"{preprocess_time:.3f} seconds"
        )


        # ----------------------------------------------------
        # RUN RAPIDOCR
        # ----------------------------------------------------

        print()
        print("Running RapidOCR...")

        ocr_start = time.time()

        result = ocr(temp_path)

        ocr_time = time.time() - ocr_start

        print(
            f"🔥 RapidOCR inference: "
            f"{ocr_time:.3f} seconds"
        )


        # ----------------------------------------------------
        # EXTRACT OCR RESULTS
        # ----------------------------------------------------

        texts = []
        scores = []

        if result is not None:

            if hasattr(result, "txts"):

                if result.txts:
                    texts = result.txts

            if hasattr(result, "scores"):

                if result.scores:
                    scores = result.scores


        # ----------------------------------------------------
        # CLEAN OCR TEXT
        # ----------------------------------------------------

        cleaned_texts = []

        for text in texts:

            if text is None:
                continue

            text = str(text).strip()

            if not text:
                continue

            cleaned_texts.append(text)


        final_text = "\n".join(
            cleaned_texts
        )


        # ----------------------------------------------------
        # CALCULATE CONFIDENCE
        # ----------------------------------------------------

        if scores:

            average_confidence = (
                sum(scores) /
                len(scores)
            ) * 100

        else:

            average_confidence = 0


        # ----------------------------------------------------
        # TOTAL PROCESSING TIME
        # ----------------------------------------------------

        total_time = (
            time.time() - start_total
        )


        # ----------------------------------------------------
        # PRINT RESULTS
        # ----------------------------------------------------

        print()
        print("-" * 60)

        print(
            f"Text regions detected: "
            f"{len(cleaned_texts)}"
        )

        print(
            f"Average confidence: "
            f"{average_confidence:.1f}%"
        )

        print(
            f"Characters extracted: "
            f"{len(final_text)}"
        )

        print(
            f"🔥 OCR TIME: "
            f"{ocr_time:.3f} seconds"
        )

        print(
            f"🔥 TOTAL PROCESSING TIME: "
            f"{total_time:.3f} seconds"
        )

        print("-" * 60)

        print()
        print("EXTRACTED TEXT:")

        print(final_text)


        # ----------------------------------------------------
        # DELETE TEMP IMAGE
        # ----------------------------------------------------

        try:

            if os.path.exists(temp_path):
                os.remove(temp_path)

        except Exception:
            pass


        # ----------------------------------------------------
        # SEND RESPONSE TO NODE
        # ----------------------------------------------------

        return jsonify({

            "success": True,

            "text": final_text,

            "confidence": round(
                average_confidence,
                2
            ),

            "regions": len(
                cleaned_texts
            ),

            "ocrTime": round(
                ocr_time,
                3
            ),

            "totalTime": round(
                total_time,
                3
            )

        })


    except Exception as error:

        print()
        print("❌ OCR ERROR:")
        print(str(error))

        return jsonify({

            "success": False,

            "error": str(error)

        }), 500


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    print()
    print("=" * 60)
    print("🚀 RAPIDOCR SERVICE")
    print("=" * 60)

    print("OCR Engine: RapidOCR")
    print("Runtime: ONNX Runtime")
    print("Model: PP-OCRv4 Mobile English")

    print()
    print("Optimizations:")
    print("✔ Classification disabled")
    print("✔ Detector limit_type = max")
    print("✔ Detector limit_side_len = 736")
    print("✔ Maximum input image = 1200px")

    print()
    print("Server: http://127.0.0.1:8000")
    print("=" * 60)
    print()

    app.run(
        host="127.0.0.1",
        port=8000,
        debug=False,
        threaded=True
    )