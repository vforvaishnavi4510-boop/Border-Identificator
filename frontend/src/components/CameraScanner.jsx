import { useEffect, useRef, useState } from "react";

function CameraScanner({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const [documentDetected, setDocumentDetected] =
    useState(false);

  const [capturedImage, setCapturedImage] =
    useState(null);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [uploading, setUploading] =
    useState(false);

  const stableFramesRef = useRef(0);
  const capturingRef = useRef(false);
  const detectingRef = useRef(false);
  const previousBoxRef = useRef(null);

  // =========================================================
  // START CAMERA
  // =========================================================

  const startCamera = async () => {
    try {
      setErrorMessage("");
      setCapturedImage(null);
      setDocumentDetected(false);

      stableFramesRef.current = 0;
      capturingRef.current = false;
      detectingRef.current = false;
      previousBoxRef.current = null;

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
          audio: false,
        });

      setCameraStream(stream);
      setCameraOpen(true);

      console.log("CAMERA STARTED");
    } catch (error) {
      console.error("Camera error:", error);

      setErrorMessage(
        `${error.name}: ${error.message}`
      );
    }
  };

  // =========================================================
  // CONNECT CAMERA
  // =========================================================

  useEffect(() => {
    if (!videoRef.current || !cameraStream) {
      return;
    }

    const video = videoRef.current;

    video.srcObject = cameraStream;

    video.play().catch((error) => {
      console.error(
        "Video play error:",
        error
      );
    });
  }, [cameraStream]);

  // =========================================================
  // STOP CAMERA
  // =========================================================

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream
        .getTracks()
        .forEach((track) => {
          track.stop();
        });
    }

    setCameraStream(null);
    setCameraOpen(false);
  };

  // =========================================================
  // RESET SCANNER
  // =========================================================

  const resetScanner = () => {
    setCapturedImage(null);
    setDocumentDetected(false);
    setUploading(false);

    stableFramesRef.current = 0;
    capturingRef.current = false;
    detectingRef.current = false;
    previousBoxRef.current = null;
  };

  // =========================================================
  // CAPTURE DOCUMENT
  // =========================================================

  const captureDocument = () => {
    if (capturingRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return;
    }

    capturingRef.current = true;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      capturingRef.current = false;
      return;
    }

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const image = canvas.toDataURL(
      "image/jpeg",
      0.95
    );

    console.log("================================");
    console.log("DOCUMENT CAPTURED");
    console.log(
      "Resolution:",
      video.videoWidth,
      "x",
      video.videoHeight
    );
    console.log("================================");

    // IMPORTANT:
    // DO NOT upload here.
    // The image is only stored for preview.

    setCapturedImage(image);
    setDocumentDetected(true);

    stopCamera();
  };

  // =========================================================
  // UPLOAD DOCUMENT
  // =========================================================

  const uploadCurrentDocument = async () => {
    if (!capturedImage) {
      return false;
    }

    if (uploading) {
      return false;
    }

    try {
      setUploading(true);

      console.log(
        "📤 UPLOADING DOCUMENT..."
      );

      if (onCapture) {
        await onCapture(capturedImage);
      }

      console.log(
        "✅ DOCUMENT UPLOADED"
      );

      setUploading(false);

      return true;
    } catch (error) {
      console.error(
        "❌ DOCUMENT UPLOAD FAILED:",
        error
      );

      setUploading(false);

      setErrorMessage(
        "Failed to upload document."
      );

      return false;
    }
  };

  // =========================================================
  // RETAKE
  // =========================================================

  const handleRetake = () => {
    console.log(
      "🔄 RETAKING DOCUMENT"
    );

    resetScanner();
    startCamera();
  };

  // =========================================================
  // UPLOAD ONLY
  // =========================================================

  const handleUpload = async () => {
    await uploadCurrentDocument();
  };

  // =========================================================
  // UPLOAD AND SCAN ANOTHER
  // =========================================================

  const handleUploadAndScanAnother =
    async () => {
      const uploaded =
        await uploadCurrentDocument();

      if (!uploaded) {
        return;
      }

      console.log(
        "📷 READY FOR NEXT DOCUMENT"
      );

      resetScanner();
      startCamera();
    };

  // =========================================================
  // GET BRIGHTNESS
  // =========================================================

  const getBrightness = (
    data,
    width,
    height,
    x,
    y
  ) => {
    if (
      x < 0 ||
      y < 0 ||
      x >= width ||
      y >= height
    ) {
      return 0;
    }

    const index =
      (y * width + x) * 4;

    return (
      0.299 * data[index] +
      0.587 * data[index + 1] +
      0.114 * data[index + 2]
    );
  };

  // =========================================================
  // DOCUMENT DETECTION
  // =========================================================

  const detectDocument = () => {
    if (capturingRef.current) {
      return;
    }

    if (detectingRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      return;
    }

    if (
      video.readyState <
      HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return;
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return;
    }

    detectingRef.current = true;

    // =======================================================
    // SMALL IMAGE FOR FAST DETECTION
    // =======================================================

    const W = 640;

    const scale =
      W / video.videoWidth;

    const H = Math.round(
      video.videoHeight * scale
    );

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext(
      "2d",
      {
        willReadFrequently: true,
      }
    );

    if (!ctx) {
      detectingRef.current = false;
      return;
    }

    ctx.drawImage(
      video,
      0,
      0,
      W,
      H
    );

    const frame =
      ctx.getImageData(
        0,
        0,
        W,
        H
      );

    const data = frame.data;

    // =======================================================
    // SCANNER BOX
    // =======================================================

    const guideLeft =
      Math.floor(W * 0.10);

    const guideRight =
      Math.floor(W * 0.90);

    const guideTop =
      Math.floor(H * 0.12);

    const guideBottom =
      Math.floor(H * 0.90);

    const guideWidth =
      guideRight - guideLeft;

    const guideHeight =
      guideBottom - guideTop;

    // =======================================================
    // EDGE DIFFERENCE
    // =======================================================

    const verticalDifference = (
      x,
      y
    ) => {
      const a =
        getBrightness(
          data,
          W,
          H,
          x - 3,
          y
        );

      const b =
        getBrightness(
          data,
          W,
          H,
          x + 3,
          y
        );

      return Math.abs(a - b);
    };

    const horizontalDifference = (
      x,
      y
    ) => {
      const a =
        getBrightness(
          data,
          W,
          H,
          x,
          y - 3
        );

      const b =
        getBrightness(
          data,
          W,
          H,
          x,
          y + 3
        );

      return Math.abs(a - b);
    };

    // =======================================================
    // HORIZONTAL SCORE
    // =======================================================

    const horizontalScore = (y) => {
      let strong = 0;
      let total = 0;

      const start =
        guideLeft +
        Math.floor(
          guideWidth * 0.08
        );

      const end =
        guideRight -
        Math.floor(
          guideWidth * 0.08
        );

      for (
        let x = start;
        x < end;
        x += 5
      ) {
        const value =
          horizontalDifference(
            x,
            y
          );

        total++;

        if (value > 35) {
          strong++;
        }
      }

      return total > 0
        ? strong / total
        : 0;
    };

    // =======================================================
    // VERTICAL SCORE
    // =======================================================

    const verticalScore = (x) => {
      let strong = 0;
      let total = 0;

      const start =
        guideTop +
        Math.floor(
          guideHeight * 0.08
        );

      const end =
        guideBottom -
        Math.floor(
          guideHeight * 0.08
        );

      for (
        let y = start;
        y < end;
        y += 5
      ) {
        const value =
          verticalDifference(
            x,
            y
          );

        total++;

        if (value > 35) {
          strong++;
        }
      }

      return total > 0
        ? strong / total
        : 0;
    };

    // =======================================================
    // FIND HORIZONTAL EDGE
    // =======================================================

    const findHorizontalEdge = (
      expectedY
    ) => {
      let bestScore = 0;
      let bestY = expectedY;

      const search =
        Math.floor(
          guideHeight * 0.12
        );

      for (
        let y =
          expectedY - search;
        y <=
        expectedY + search;
        y += 4
      ) {
        if (
          y < 5 ||
          y >= H - 5
        ) {
          continue;
        }

        const score =
          horizontalScore(y);

        if (
          score >
          bestScore
        ) {
          bestScore = score;
          bestY = y;
        }
      }

      return {
        score: bestScore,
        position: bestY,
      };
    };

    // =======================================================
    // FIND VERTICAL EDGE
    // =======================================================

    const findVerticalEdge = (
      expectedX
    ) => {
      let bestScore = 0;
      let bestX = expectedX;

      const search =
        Math.floor(
          guideWidth * 0.12
        );

      for (
        let x =
          expectedX - search;
        x <=
        expectedX + search;
        x += 4
      ) {
        if (
          x < 5 ||
          x >= W - 5
        ) {
          continue;
        }

        const score =
          verticalScore(x);

        if (
          score >
          bestScore
        ) {
          bestScore = score;
          bestX = x;
        }
      }

      return {
        score: bestScore,
        position: bestX,
      };
    };

    // =======================================================
    // FIND EDGES
    // =======================================================

    const top =
      findHorizontalEdge(
        guideTop
      );

    const bottom =
      findHorizontalEdge(
        guideBottom
      );

    const left =
      findVerticalEdge(
        guideLeft
      );

    const right =
      findVerticalEdge(
        guideRight
      );

    // =======================================================
    // EDGE THRESHOLD
    // =======================================================

    const EDGE_THRESHOLD = 0.20;

    const topOK =
      top.score >
      EDGE_THRESHOLD;

    const bottomOK =
      bottom.score >
      EDGE_THRESHOLD;

    const leftOK =
      left.score >
      EDGE_THRESHOLD;

    const rightOK =
      right.score >
      EDGE_THRESHOLD;

    // =======================================================
    // EDGE COUNT
    // =======================================================

    const edgeCount = [
      topOK,
      bottomOK,
      leftOK,
      rightOK,
    ].filter(Boolean).length;

    // =======================================================
    // DETECTED BOX
    // =======================================================

    const detectedLeft =
      left.position;

    const detectedRight =
      right.position;

    const detectedTop =
      top.position;

    const detectedBottom =
      bottom.position;

    const detectedWidth =
      detectedRight -
      detectedLeft;

    const detectedHeight =
      detectedBottom -
      detectedTop;

    // =======================================================
    // SIZE CHECK
    // =======================================================

    const widthRatio =
      detectedWidth /
      guideWidth;

    const heightRatio =
      detectedHeight /
      guideHeight;

    const sizeOK =
      widthRatio >= 0.45 &&
      widthRatio <= 1.15 &&
      heightRatio >= 0.30 &&
      heightRatio <= 1.15;

    // =======================================================
    // ASPECT RATIO
    // =======================================================

    const aspectRatio =
      detectedHeight > 0
        ? detectedWidth /
          detectedHeight
        : 0;

    const aspectOK =
      aspectRatio >= 0.55 &&
      aspectRatio <= 2.20;

    // =======================================================
    // CENTER CHECK
    // =======================================================

    const centerX =
      (detectedLeft +
        detectedRight) /
      2;

    const centerY =
      (detectedTop +
        detectedBottom) /
      2;

    const guideCenterX =
      W / 2;

    const guideCenterY =
      (guideTop +
        guideBottom) /
      2;

    const centerOK =
      Math.abs(
        centerX -
        guideCenterX
      ) <
        guideWidth * 0.25 &&
      Math.abs(
        centerY -
        guideCenterY
      ) <
        guideHeight * 0.25;

    // =======================================================
    // VALID 3 EDGE COMBINATIONS
    // =======================================================

    const topBottomLeft =
      topOK &&
      bottomOK &&
      leftOK;

    const topBottomRight =
      topOK &&
      bottomOK &&
      rightOK;

    const topLeftRight =
      topOK &&
      leftOK &&
      rightOK;

    const bottomLeftRight =
      bottomOK &&
      leftOK &&
      rightOK;

    const validThreeEdges =
      topBottomLeft ||
      topBottomRight ||
      topLeftRight ||
      bottomLeftRight;

    // =======================================================
    // GEOMETRY
    // =======================================================

    const geometryOK =
      detectedWidth > 0 &&
      detectedHeight > 0;

    // =======================================================
    // MOVEMENT CHECK
    // =======================================================

    let movementOK = true;

    const currentBox = {
      left: detectedLeft,
      right: detectedRight,
      top: detectedTop,
      bottom: detectedBottom,
    };

    const previousBox =
      previousBoxRef.current;

    if (previousBox) {
      const movement =
        Math.abs(
          currentBox.left -
          previousBox.left
        ) +
        Math.abs(
          currentBox.right -
          previousBox.right
        ) +
        Math.abs(
          currentBox.top -
          previousBox.top
        ) +
        Math.abs(
          currentBox.bottom -
          previousBox.bottom
        );

      if (
        movement >
        W * 0.45
      ) {
        movementOK = false;
      }
    }

    previousBoxRef.current =
      currentBox;

    // =======================================================
    // FINAL DOCUMENT DECISION
    // =======================================================

    const documentFound =
      edgeCount >= 3 &&
      validThreeEdges &&
      sizeOK &&
      aspectOK &&
      centerOK &&
      geometryOK &&
      movementOK;

    console.log(
      "EDGES:",
      edgeCount,
      "| TOP:",
      top.score.toFixed(2),
      "| BOTTOM:",
      bottom.score.toFixed(2),
      "| LEFT:",
      left.score.toFixed(2),
      "| RIGHT:",
      right.score.toFixed(2),
      "| DOCUMENT:",
      documentFound
    );

    // =======================================================
    // STABILITY
    // =======================================================

    if (documentFound) {
      stableFramesRef.current =
        Math.min(
          stableFramesRef.current + 1,
          3
        );
    } else {
      stableFramesRef.current =
        Math.max(
          stableFramesRef.current - 1,
          0
        );
    }

    const ready =
      stableFramesRef.current >= 2;

    setDocumentDetected(ready);

    // =======================================================
    // AUTO CAPTURE
    // =======================================================

    if (
      ready &&
      !capturingRef.current
    ) {
      console.log(
        "DOCUMENT CONFIRMED"
      );

      requestAnimationFrame(() => {
        captureDocument();
      });
    }

    detectingRef.current = false;
  };

  // =========================================================
  // DETECTION LOOP
  // =========================================================

  useEffect(() => {
    if (!cameraOpen) {
      return;
    }

    console.log(
      "DOCUMENT DETECTION STARTED"
    );

    const interval =
      setInterval(() => {
        detectDocument();
      }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [cameraOpen]);

  // =========================================================
  // CLEANUP
  // =========================================================

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream
          .getTracks()
          .forEach((track) => {
            track.stop();
          });
      }
    };
  }, [cameraStream]);

  // =========================================================
  // UI
  // =========================================================

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#10131a",
        color: "white",
        textAlign: "center",
        padding: "30px",
        boxSizing: "border-box",
      }}
    >
      <h1
        style={{
          fontSize: "42px",
          marginBottom: "10px",
        }}
      >
        Border Identificator
      </h1>

      <p
        style={{
          fontSize: "19px",
          color: "#9db7d4",
        }}
      >
        AI-Based Fake Identity & Document
        Screening System
      </p>

      {/* =====================================================
          START BUTTON
      ====================================================== */}

      {!cameraOpen &&
        !capturedImage && (
          <button
            onClick={startCamera}
            style={{
              marginTop: "20px",
              padding: "15px 30px",
              fontSize: "19px",
              cursor: "pointer",
              border: "none",
              borderRadius: "10px",
              fontWeight: "bold",
            }}
          >
            📷 Scan Document
          </button>
        )}

      {/* =====================================================
          CAMERA
      ====================================================== */}

      {cameraOpen && (
        <div
          style={{
            marginTop: "25px",
          }}
        >
          <h2>
            Scan Document
          </h2>

          <p
            style={{
              color: "#b8c7d9",
              fontSize: "16px",
            }}
          >
            Place the document inside
            the red box.
            <br />
            You may hold one edge.
            <br />
            The scanner will capture
            automatically.
          </p>

          {/* CAMERA FRAME */}

          <div
            style={{
              position: "relative",
              width: "min(900px, 92vw)",
              margin: "20px auto",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                display: "block",
                borderRadius: "15px",
              }}
            />

            {/* RED / GREEN DOCUMENT BOX */}

            <div
              style={{
                position: "absolute",
                top: "12%",
                left: "10%",
                width: "80%",
                height: "78%",
                border: documentDetected
                  ? "5px solid #00ff66"
                  : "5px solid #ff2020",
                borderRadius: "15px",
                pointerEvents: "none",
                boxSizing: "border-box",
                transition:
                  "border-color 0.15s ease, box-shadow 0.15s ease",
                boxShadow: documentDetected
                  ? "0 0 35px rgba(0,255,100,0.9)"
                  : "0 0 25px rgba(255,0,0,0.7)",
              }}
            >
              {/* TOP LEFT */}

              <div
                style={{
                  position: "absolute",
                  top: -5,
                  left: -5,
                  width: "45px",
                  height: "45px",
                  borderTop: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                  borderLeft: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                }}
              />

              {/* TOP RIGHT */}

              <div
                style={{
                  position: "absolute",
                  top: -5,
                  right: -5,
                  width: "45px",
                  height: "45px",
                  borderTop: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                  borderRight: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                }}
              />

              {/* BOTTOM LEFT */}

              <div
                style={{
                  position: "absolute",
                  bottom: -5,
                  left: -5,
                  width: "45px",
                  height: "45px",
                  borderBottom: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                  borderLeft: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                }}
              />

              {/* BOTTOM RIGHT */}

              <div
                style={{
                  position: "absolute",
                  bottom: -5,
                  right: -5,
                  width: "45px",
                  height: "45px",
                  borderBottom: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                  borderRight: `6px solid ${
                    documentDetected
                      ? "#00ff66"
                      : "#ff2020"
                  }`,
                }}
              />
            </div>
          </div>

          {/* STATUS */}

          <div
            style={{
              width: "min(900px, 92vw)",
              margin: "20px auto",
              padding: "18px",
              borderRadius: "12px",
              background: documentDetected
                ? "#123d24"
                : "#4a1515",
              color: documentDetected
                ? "#00ff66"
                : "#ff4444",
              fontSize: "21px",
              fontWeight: "bold",
            }}
          >
            {documentDetected ? (
              <>
                🟢 DOCUMENT DETECTED
                <br />

                <span
                  style={{
                    fontSize: "16px",
                  }}
                >
                  Capturing...
                </span>
              </>
            ) : (
              <>
                🔴 DOCUMENT NOT DETECTED
                <br />

                <span
                  style={{
                    fontSize: "16px",
                  }}
                >
                  Place the document
                  inside the box
                </span>
              </>
            )}
          </div>

          <button
            onClick={stopCamera}
            style={{
              padding: "10px 22px",
              fontSize: "16px",
              cursor: "pointer",
              border: "none",
              borderRadius: "8px",
            }}
          >
            ❌ Cancel
          </button>
        </div>
      )}

      {/* =====================================================
          HIDDEN CANVAS
      ====================================================== */}

      <canvas
        ref={canvasRef}
        style={{
          display: "none",
        }}
      />

      {/* =====================================================
          CAPTURED DOCUMENT
      ====================================================== */}

      {capturedImage && (
        <div
          style={{
            marginTop: "30px",
            width: "min(900px, 92vw)",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <h2>
            Captured Document
          </h2>

          <img
            src={capturedImage}
            alt="Captured document"
            style={{
              width: "100%",
              borderRadius: "12px",
              display: "block",
            }}
          />

          {/* =================================================
              ACTION BUTTONS
          ================================================== */}

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              justifyContent: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {/* RETAKE */}

            <button
              onClick={handleRetake}
              disabled={uploading}
              style={{
                padding: "12px 22px",
                fontSize: "17px",
                cursor: uploading
                  ? "not-allowed"
                  : "pointer",
                border: "none",
                borderRadius: "8px",
              }}
            >
              🔄 Retake
            </button>

            {/* UPLOAD */}

            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                padding: "12px 22px",
                fontSize: "17px",
                cursor: uploading
                  ? "not-allowed"
                  : "pointer",
                border: "none",
                borderRadius: "8px",
              }}
            >
              {uploading
                ? "⏳ Uploading..."
                : "📤 Upload"}
            </button>

            {/* UPLOAD AND SCAN ANOTHER */}

            <button
              onClick={
                handleUploadAndScanAnother
              }
              disabled={uploading}
              style={{
                padding: "12px 22px",
                fontSize: "17px",
                cursor: uploading
                  ? "not-allowed"
                  : "pointer",
                border: "none",
                borderRadius: "8px",
              }}
            >
              {uploading
                ? "⏳ Uploading..."
                : "📤 Upload & Scan Another"}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================
          ERROR
      ====================================================== */}

      {errorMessage && (
        <div
          style={{
            marginTop: "25px",
            color: "#ff7777",
          }}
        >
          <h3>
            Camera Error
          </h3>

          <p>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  );
}

export default CameraScanner;