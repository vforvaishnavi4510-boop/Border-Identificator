import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
    
from paddleocr import PaddleOCR


# ============================================================
# SETTINGS
# ============================================================

HOST = "127.0.0.1"
PORT = 8000


# ============================================================
# LOAD PADDLEOCR ONCE
# ============================================================

print("")
print("==============================================")
print(" STARTING PADDLEOCR SERVICE")
print("==============================================")
print("Loading PaddleOCR model...")
print("Please wait...")
print("")


ocr = PaddleOCR(
    lang="en",
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)


print("")
print("==============================================")
print("PADDLEOCR READY")
print("==============================================")
print(f"OCR service running on http://{HOST}:{PORT}")
print("Model will stay loaded.")
print("Waiting for documents...")
print("==============================================")
print("")


# ============================================================
# OCR FUNCTION
# ============================================================

def perform_ocr(image_path):

    print("")
    print("=============================================")
    print(" PROCESSING DOCUMENT")
    print("==============================================")

    print("Image:")
    print(image_path)

    # --------------------------------------------------------
    # CHECK IMAGE
    # --------------------------------------------------------

    if not os.path.exists(image_path):

        raise FileNotFoundError(
            f"Image not found: {image_path}"
        )

    # --------------------------------------------------------
    # RUN PADDLEOCR
    # --------------------------------------------------------

    result = ocr.predict(
        image_path
    )

    texts = []
    confidences = []

    # --------------------------------------------------------
    # EXTRACT OCR RESULTS
    # --------------------------------------------------------

    for page in result:

        try:

            data = page.json

            if callable(data):
                data = data()

            if isinstance(data, str):
                data = json.loads(data)

        except Exception:

            try:
                data = page.to_json()

                if isinstance(data, str):
                    data = json.loads(data)

            except Exception:

                continue

        # ----------------------------------------------------
        # FIND OCR DATA
        # ----------------------------------------------------

        if not isinstance(data, dict):
            continue

        # Some PaddleOCR versions return OCR information
        # inside a "res" object.

        res = data.get("res", data)

        # ----------------------------------------------------
        # TEXT
        # ----------------------------------------------------

        rec_texts = res.get(
            "rec_texts",
            []
        )

        rec_scores = res.get(
            "rec_scores",
            []
        )

        # ----------------------------------------------------
        # SAVE TEXT
        # ----------------------------------------------------

        if rec_texts:

            for text in rec_texts:

                if not text:
                    continue

                text = str(text).strip()

                if len(text) < 1:
                    continue

                texts.append(text)

        # ----------------------------------------------------
        # SAVE CONFIDENCE
        # ----------------------------------------------------

        if rec_scores:

            for score in rec_scores:

                try:

                    confidences.append(
                        float(score)
                    )

                except Exception:

                    pass

    # ========================================================
    # CALCULATE CONFIDENCE
    # ========================================================

    if confidences:

        average_confidence = (
            sum(confidences)
            / len(confidences)
        )

    else:

        average_confidence = 0

    # ========================================================
    # CLEAN TEXT
    # ========================================================

    cleaned_text = "\n".join(
        texts
    ).strip()

    # ========================================================
    # RESULT
    # ========================================================

    output = {

        "success": True,

        "text": cleaned_text,

        "confidence":
            average_confidence * 100,

    }

    print("")
    print(" OCR RESULT")
    print("----------------------------------------------")

    print(
        cleaned_text
        if cleaned_text
        else "No text detected."
    )

    print("----------------------------------------------")

    print(
        "Confidence:",
        f"{average_confidence * 100:.2f}%"
    )

    print("==============================================")
    print(" DOCUMENT OCR COMPLETED")
    print("==============================================")
    print("")

    return output


# ============================================================
# HTTP SERVER
# ============================================================

class OCRRequestHandler(
    BaseHTTPRequestHandler
):

    # --------------------------------------------------------
    # POST /ocr
    # --------------------------------------------------------

    def do_POST(self):

        if self.path != "/ocr":

            self.send_response(404)

            self.end_headers()

            return

        try:

            # ------------------------------------------------
            # READ REQUEST
            # ------------------------------------------------

            content_length = int(
                self.headers.get(
                    "Content-Length",
                    0
                )
            )

            body = self.rfile.read(
                content_length
            )

            request_data = json.loads(
                body.decode("utf-8")
            )

            image_path = request_data.get(
                "imagePath"
            )

            # ------------------------------------------------
            # CHECK PATH
            # ------------------------------------------------

            if not image_path:

                raise ValueError(
                    "imagePath was not provided"
                )

            # ------------------------------------------------
            # RUN OCR
            # ------------------------------------------------

            result = perform_ocr(
                image_path
            )

            # ------------------------------------------------
            # SEND RESULT
            # ------------------------------------------------

            response = json.dumps(
                result
            ).encode("utf-8")

            self.send_response(200)

            self.send_header(
                "Content-Type",
                "application/json"
            )

            self.send_header(
                "Content-Length",
                str(len(response))
            )

            self.end_headers()

            self.wfile.write(
                response
            )

        except Exception as error:

            print("")
            print("OCR ERROR:")
            print(error)
            print("")

            response = json.dumps({

                "success": False,

                "text": "",

                "confidence": 0,

                "message": str(error)

            }).encode("utf-8")

            self.send_response(500)

            self.send_header(
                "Content-Type",
                "application/json"
            )

            self.send_header(
                "Content-Length",
                str(len(response))
            )

            self.end_headers()

            self.wfile.write(
                response
            )

    # --------------------------------------------------------
    # GET /health
    # --------------------------------------------------------

    def do_GET(self):

        if self.path == "/health":

            response = json.dumps({

                "success": True,

                "status": "ready",

                "service":
                    "PaddleOCR"

            }).encode("utf-8")

            self.send_response(200)

            self.send_header(
                "Content-Type",
                "application/json"
            )

            self.send_header(
                "Content-Length",
                str(len(response))
            )

            self.end_headers()

            self.wfile.write(
                response
            )

            return

        self.send_response(404)

        self.end_headers()

    # --------------------------------------------------------
    # REMOVE DEFAULT HTTP LOGGING
    # --------------------------------------------------------

    def log_message(
        self,
        format,
        *args
    ):

        return


# ============================================================
# START OCR SERVER
# ============================================================

server = HTTPServer(
    (HOST, PORT),
    OCRRequestHandler
)

print(
    " OCR SERVICE IS READY"
)

print(
    "Waiting for Node.js requests..."
)

print("")


try:

    server.serve_forever()

except KeyboardInterrupt:

    print("")
    print(
        "Stopping OCR service..."
    )

finally:

    server.server_close()

    print(
        "OCR service stopped."
    )