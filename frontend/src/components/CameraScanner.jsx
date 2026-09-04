import { useEffect, useRef, useState } from "react";
import AnalysisResult from "./AnalysisResult";

function CameraScanner({ onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  // Kept for the visual alignment guide (green/red frame) — no longer triggers auto-capture
  const [documentDetected, setDocumentDetected] = useState(false);

  const [capturedImage, setCapturedImage] = useState(null);

  const [errorMessage, setErrorMessage] = useState("");

  const [uploading, setUploading] = useState(false);

  const [scanResult, setScanResult] = useState(null);

  // NEW: which physical camera we're using ("environment" = back, "user" = front)
  const [facingMode, setFacingMode] = useState("environment");

  // NEW: flashlight / torch
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // NEW: zoom
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [zoomValue, setZoomValue] = useState(1);

  // NEW: tap-to-focus
  const [focusSupported, setFocusSupported] = useState(false);
  // Screen-space position (px, relative to the video container) of the
  // focus ring animation, or null when hidden.
  const [focusRing, setFocusRing] = useState(null);

  const stableFramesRef = useRef(0);
  const capturingRef = useRef(false);
  const detectingRef = useRef(false);
  const previousBoxRef = useRef(null);

  // NEW: pinch-to-zoom tracking (kept in a ref so it doesn't retrigger renders)
  const pinchStateRef = useRef({
    isPinching: false,
    startDistance: 0,
    startZoom: 1,
  });
  const focusRingTimeoutRef = useRef(null);

  // =========================================================
  // START CAMERA
  // =========================================================

  const startCamera = async (requestedFacingMode) => {
    const facing = requestedFacingMode || facingMode;

    try {
      setErrorMessage("");
      setCapturedImage(null);
      setDocumentDetected(false);

      stableFramesRef.current = 0;
      capturingRef.current = false;
      detectingRef.current = false;
      previousBoxRef.current = null;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setFacingMode(facing);
      setCameraStream(stream);
      setCameraOpen(true);

      // Reset torch/zoom/focus UI state — capabilities are (re)detected in
      // the effect below once the stream is attached.
      setTorchOn(false);
      setTorchSupported(false);
      setZoomSupported(false);
      setFocusSupported(false);

      console.log("CAMERA STARTED");
    } catch (error) {
      console.error("Camera error:", error);
      setErrorMessage(`${error.name}: ${error.message}`);
    }
  };

  // =========================================================
  // CONNECT CAMERA
  // =========================================================

  useEffect(() => {
    if (!videoRef.current || !cameraStream) return;

    const video = videoRef.current;
    video.srcObject = cameraStream;

    video.play().catch((error) => {
      console.error("Video play error:", error);
    });
  }, [cameraStream]);

  // =========================================================
  // DETECT TORCH / ZOOM CAPABILITIES
  // =========================================================

  useEffect(() => {
    if (!cameraStream) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== "function") return;

    try {
      const capabilities = track.getCapabilities();

      // Torch
      if (capabilities.torch) {
        setTorchSupported(true);
      } else {
        setTorchSupported(false);
      }

      // Zoom
      if (capabilities.zoom) {
        setZoomSupported(true);
        setZoomMin(capabilities.zoom.min ?? 1);
        setZoomMax(capabilities.zoom.max ?? 1);
        setZoomStep(capabilities.zoom.step ?? 0.1);

        const settings = track.getSettings ? track.getSettings() : {};
        setZoomValue(settings.zoom ?? capabilities.zoom.min ?? 1);
      } else {
        setZoomSupported(false);
      }

      // Tap-to-focus — needs the camera to support manual/single-shot focus
      // with a point of interest.
      const focusModes = capabilities.focusMode || [];
      if (focusModes.includes("manual") || focusModes.includes("single-shot")) {
        setFocusSupported(true);
      } else {
        setFocusSupported(false);
      }
    } catch (error) {
      console.error("Capability check failed:", error);
    }
  }, [cameraStream]);

  // =========================================================
  // STOP CAMERA
  // =========================================================

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    setCameraStream(null);
    setCameraOpen(false);
    setTorchOn(false);
    setTorchSupported(false);
    setZoomSupported(false);
    setFocusSupported(false);

    if (focusRingTimeoutRef.current) {
      clearTimeout(focusRingTimeoutRef.current);
    }
    setFocusRing(null);
  };

  // =========================================================
  // RESET SCANNER
  // =========================================================

  const resetScanner = () => {
    setCapturedImage(null);
    setDocumentDetected(false);
    setUploading(false);

    setScanResult(null);

    stableFramesRef.current = 0;
    capturingRef.current = false;
    detectingRef.current = false;
    previousBoxRef.current = null;
  };

  // =========================================================
  // TOGGLE FLASHLIGHT (TORCH)
  // =========================================================

  const toggleTorch = async () => {
    if (!cameraStream || !torchSupported) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;

    const nextTorchState = !torchOn;

    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }],
      });
      setTorchOn(nextTorchState);
    } catch (error) {
      console.error("Torch toggle failed:", error);
      setErrorMessage("Flashlight isn't available on this camera.");
    }
  };

  // =========================================================
  // SWITCH CAMERA (FRONT / BACK)
  // =========================================================

  const switchCamera = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";

    stopCamera();
    await startCamera(nextFacing);
  };

  // =========================================================
  // ZOOM (slider + pinch share this)
  // =========================================================

  const applyZoom = async (value) => {
    if (!cameraStream) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;

    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] });
    } catch (error) {
      console.error("Zoom change failed:", error);
    }
  };

  const handleZoomChange = (event) => {
    const value = parseFloat(event.target.value);
    setZoomValue(value);
    applyZoom(value);
  };

  // NEW: distance between two touch points, for pinch-to-zoom
  const getTouchDistance = (touches) => {
    const [t1, t2] = touches;
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handlePreviewTouchStart = (event) => {
    if (event.touches.length === 2 && zoomSupported) {
      pinchStateRef.current = {
        isPinching: true,
        startDistance: getTouchDistance(event.touches),
        startZoom: zoomValue,
      };
    }
  };

  const handlePreviewTouchMove = (event) => {
    if (!pinchStateRef.current.isPinching || event.touches.length !== 2) return;

    const currentDistance = getTouchDistance(event.touches);
    if (pinchStateRef.current.startDistance <= 0) return;

    const scaleFactor = currentDistance / pinchStateRef.current.startDistance;
    let nextZoom = pinchStateRef.current.startZoom * scaleFactor;
    nextZoom = Math.min(zoomMax, Math.max(zoomMin, nextZoom));

    setZoomValue(nextZoom);
    applyZoom(nextZoom);
  };

  const handlePreviewTouchEnd = (event) => {
    if (event.touches.length < 2) {
      pinchStateRef.current.isPinching = false;
    }
  };

  // =========================================================
  // TAP TO FOCUS
  // =========================================================

  const applyFocus = async (relX, relY) => {
    if (!cameraStream || !focusSupported) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track || typeof track.getCapabilities !== "function") return;

    const capabilities = track.getCapabilities();
    const focusModes = capabilities.focusMode || [];
    const mode = focusModes.includes("manual")
      ? "manual"
      : focusModes.includes("single-shot")
      ? "single-shot"
      : null;

    if (!mode) return;

    try {
      await track.applyConstraints({
        advanced: [{ focusMode: mode, pointsOfInterest: [{ x: relX, y: relY }] }],
      });
    } catch (error) {
      console.error("Focus failed:", error);
    }
  };

  const handlePreviewTap = (event) => {
    // Ignore the tap that ends a two-finger pinch gesture.
    if (pinchStateRef.current.isPinching) return;

    const container = event.currentTarget;
    const rect = container.getBoundingClientRect();

    const clientX =
      event.clientX ?? (event.changedTouches && event.changedTouches[0]?.clientX);
    const clientY =
      event.clientY ?? (event.changedTouches && event.changedTouches[0]?.clientY);

    if (clientX == null || clientY == null) return;

    const ringX = clientX - rect.left;
    const ringY = clientY - rect.top;

    // Show a focus ring animation right where the user tapped.
    if (focusRingTimeoutRef.current) {
      clearTimeout(focusRingTimeoutRef.current);
    }
    setFocusRing({ x: ringX, y: ringY });
    focusRingTimeoutRef.current = setTimeout(() => setFocusRing(null), 700);

    if (!focusSupported) return;

    let relX = ringX / rect.width;
    let relY = ringY / rect.height;

    // The front camera preview is mirrored with CSS (see the <video> style
    // below), so the tapped screen position needs to be mirrored back to
    // match the actual, un-mirrored sensor coordinates.
    if (facingMode === "user") {
      relX = 1 - relX;
    }

    relX = Math.min(1, Math.max(0, relX));
    relY = Math.min(1, Math.max(0, relY));

    applyFocus(relX, relY);
  };

  // =========================================================
  // CAPTURE DOCUMENT
  // =========================================================

  const captureDocument = () => {
    if (capturingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    capturingRef.current = true;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      capturingRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const image = canvas.toDataURL("image/jpeg", 0.95);

    console.log("================================");
    console.log("DOCUMENT CAPTURED (manual)");
    console.log("Resolution:", video.videoWidth, "x", video.videoHeight);
    console.log("================================");

    setCapturedImage(image);
    setDocumentDetected(true);

    stopCamera();
  };

  // NEW: this is the only way a capture now happens — the shutter button
  // calls this directly. Detection is purely visual guidance below.
  const handleManualCapture = () => {
    captureDocument();
  };

  // =========================================================
  // UPLOAD DOCUMENT
  // =========================================================

  const uploadCurrentDocument = async () => {
    if (!capturedImage || uploading) return false;

    try {
      setUploading(true);

      console.log("📤 UPLOADING DOCUMENT...");

      if (onCapture) {
        const result = await onCapture(capturedImage);

        setScanResult(result);
      }

      console.log("✅ DOCUMENT UPLOADED");

      setUploading(false);
      return true;
    } catch (error) {
      console.error("❌ DOCUMENT UPLOAD FAILED:", error);

      setUploading(false);
      setErrorMessage("Failed to upload document.");

      return false;
    }
  };

  const handleRetake = () => {
    console.log("🔄 RETAKING DOCUMENT");
    resetScanner();
    startCamera();
  };

  const handleUpload = async () => {
    await uploadCurrentDocument();
  };

  const handleUploadAndScanAnother = async () => {
    const uploaded = await uploadCurrentDocument();
    if (!uploaded) return;

    console.log("📷 READY FOR NEXT DOCUMENT");

    resetScanner();
    startCamera();
  };

  // =========================================================
  // GET BRIGHTNESS
  // =========================================================

  const getBrightness = (data, width, height, x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;

    const index = (y * width + x) * 4;

    return (
      0.299 * data[index] +
      0.587 * data[index + 1] +
      0.114 * data[index + 2]
    );
  };

  // =========================================================
  // DOCUMENT DETECTION (VISUAL GUIDE ONLY — DOES NOT AUTO CAPTURE)
  // =========================================================

  const detectDocument = () => {
    if (capturingRef.current || detectingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    detectingRef.current = true;

    const W = 640;
    const scale = W / video.videoWidth;
    const H = Math.round(video.videoHeight * scale);

    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (!ctx) {
      detectingRef.current = false;
      return;
    }

    ctx.drawImage(video, 0, 0, W, H);

    const frame = ctx.getImageData(0, 0, W, H);
    const data = frame.data;

    const guideLeft = Math.floor(W * 0.1);
    const guideRight = Math.floor(W * 0.9);
    const guideTop = Math.floor(H * 0.12);
    const guideBottom = Math.floor(H * 0.9);

    const guideWidth = guideRight - guideLeft;
    const guideHeight = guideBottom - guideTop;

    const verticalDifference = (x, y) => {
      const a = getBrightness(data, W, H, x - 3, y);
      const b = getBrightness(data, W, H, x + 3, y);
      return Math.abs(a - b);
    };

    const horizontalDifference = (x, y) => {
      const a = getBrightness(data, W, H, x, y - 3);
      const b = getBrightness(data, W, H, x, y + 3);
      return Math.abs(a - b);
    };

    const horizontalScore = (y) => {
      let strong = 0;
      let total = 0;

      const start = guideLeft + Math.floor(guideWidth * 0.08);
      const end = guideRight - Math.floor(guideWidth * 0.08);

      for (let x = start; x < end; x += 5) {
        const value = horizontalDifference(x, y);
        total++;
        if (value > 35) strong++;
      }

      return total > 0 ? strong / total : 0;
    };

    const verticalScore = (x) => {
      let strong = 0;
      let total = 0;

      const start = guideTop + Math.floor(guideHeight * 0.08);
      const end = guideBottom - Math.floor(guideHeight * 0.08);

      for (let y = start; y < end; y += 5) {
        const value = verticalDifference(x, y);
        total++;
        if (value > 35) strong++;
      }

      return total > 0 ? strong / total : 0;
    };

    const findHorizontalEdge = (expectedY) => {
      let bestScore = 0;
      let bestY = expectedY;

      const search = Math.floor(guideHeight * 0.12);

      for (let y = expectedY - search; y <= expectedY + search; y += 4) {
        if (y < 5 || y >= H - 5) continue;

        const score = horizontalScore(y);

        if (score > bestScore) {
          bestScore = score;
          bestY = y;
        }
      }

      return { score: bestScore, position: bestY };
    };

    const findVerticalEdge = (expectedX) => {
      let bestScore = 0;
      let bestX = expectedX;

      const search = Math.floor(guideWidth * 0.12);

      for (let x = expectedX - search; x <= expectedX + search; x += 4) {
        if (x < 5 || x >= W - 5) continue;

        const score = verticalScore(x);

        if (score > bestScore) {
          bestScore = score;
          bestX = x;
        }
      }

      return { score: bestScore, position: bestX };
    };

    const top = findHorizontalEdge(guideTop);
    const bottom = findHorizontalEdge(guideBottom);
    const left = findVerticalEdge(guideLeft);
    const right = findVerticalEdge(guideRight);

    const EDGE_THRESHOLD = 0.2;

    const topOK = top.score > EDGE_THRESHOLD;
    const bottomOK = bottom.score > EDGE_THRESHOLD;
    const leftOK = left.score > EDGE_THRESHOLD;
    const rightOK = right.score > EDGE_THRESHOLD;

    const edgeCount = [topOK, bottomOK, leftOK, rightOK].filter(Boolean).length;

    const detectedLeft = left.position;
    const detectedRight = right.position;
    const detectedTop = top.position;
    const detectedBottom = bottom.position;

    const detectedWidth = detectedRight - detectedLeft;
    const detectedHeight = detectedBottom - detectedTop;

    const widthRatio = detectedWidth / guideWidth;
    const heightRatio = detectedHeight / guideHeight;

    const sizeOK =
      widthRatio >= 0.45 &&
      widthRatio <= 1.15 &&
      heightRatio >= 0.3 &&
      heightRatio <= 1.15;

    const aspectRatio =
      detectedHeight > 0 ? detectedWidth / detectedHeight : 0;

    const aspectOK = aspectRatio >= 0.55 && aspectRatio <= 2.2;

    const centerX = (detectedLeft + detectedRight) / 2;
    const centerY = (detectedTop + detectedBottom) / 2;

    const guideCenterX = W / 2;
    const guideCenterY = (guideTop + guideBottom) / 2;

    const centerOK =
      Math.abs(centerX - guideCenterX) < guideWidth * 0.25 &&
      Math.abs(centerY - guideCenterY) < guideHeight * 0.25;

    const topBottomLeft = topOK && bottomOK && leftOK;
    const topBottomRight = topOK && bottomOK && rightOK;
    const topLeftRight = topOK && leftOK && rightOK;
    const bottomLeftRight = bottomOK && leftOK && rightOK;

    const validThreeEdges =
      topBottomLeft || topBottomRight || topLeftRight || bottomLeftRight;

    const geometryOK = detectedWidth > 0 && detectedHeight > 0;

    let movementOK = true;

    const currentBox = {
      left: detectedLeft,
      right: detectedRight,
      top: detectedTop,
      bottom: detectedBottom,
    };

    const previousBox = previousBoxRef.current;

    if (previousBox) {
      const movement =
        Math.abs(currentBox.left - previousBox.left) +
        Math.abs(currentBox.right - previousBox.right) +
        Math.abs(currentBox.top - previousBox.top) +
        Math.abs(currentBox.bottom - previousBox.bottom);

      if (movement > W * 0.45) {
        movementOK = false;
      }
    }

    previousBoxRef.current = currentBox;

    const documentFound =
      edgeCount >= 3 &&
      validThreeEdges &&
      sizeOK &&
      aspectOK &&
      centerOK &&
      geometryOK &&
      movementOK;

    if (documentFound) {
      stableFramesRef.current = Math.min(stableFramesRef.current + 1, 3);
    } else {
      stableFramesRef.current = Math.max(stableFramesRef.current - 1, 0);
    }

    const ready = stableFramesRef.current >= 2;

    // Only used to color the guide frame green/red — capture is manual now.
    setDocumentDetected(ready);

    detectingRef.current = false;
  };

  // =========================================================
  // DETECTION LOOP (VISUAL GUIDE ONLY)
  // =========================================================

  useEffect(() => {
    if (!cameraOpen) return;

    console.log("ALIGNMENT GUIDE STARTED");

    const interval = setInterval(() => {
      detectDocument();
    }, 100);

    return () => clearInterval(interval);
  }, [cameraOpen]);

  // =========================================================
  // CLEANUP
  // =========================================================

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (focusRingTimeoutRef.current) {
        clearTimeout(focusRingTimeoutRef.current);
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
      <style>{`
        @keyframes focusRingPulse {
          0% { transform: scale(1.4); opacity: 0; }
          40% { opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      <h1 style={{ fontSize: "42px", marginBottom: "10px" }}>
        Border Identificator
      </h1>

      <p style={{ fontSize: "19px", color: "#9db7d4" }}>
        AI-Based Fake Identity & Document Screening System
      </p>

      {!cameraOpen && !capturedImage && (
        <button
          onClick={() => startCamera()}
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

      {cameraOpen && (
        <div style={{ marginTop: "25px" }}>
          <h2>Scan Document</h2>

          <p style={{ color: "#b8c7d9", fontSize: "16px" }}>
            Place the document inside the box.
            <br />
            Pinch to zoom, tap anywhere to focus, then tap the shutter
            button to capture.
          </p>

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
                // Mirror the PREVIEW only when using the front (selfie) camera,
                // so it behaves like a mirror instead of feeling reversed.
                // The underlying video frame data is untouched, so
                // captureDocument() below still grabs a correctly-oriented
                // (non-mirrored) image either way.
                transform:
                  facingMode === "user" ? "scaleX(-1)" : "none",
              }}
            />

            {/* NEW: transparent layer that handles tap-to-focus and
                two-finger pinch-to-zoom over the live preview. */}
            <div
              onClick={handlePreviewTap}
              onTouchStart={handlePreviewTouchStart}
              onTouchMove={handlePreviewTouchMove}
              onTouchEnd={handlePreviewTouchEnd}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                zIndex: 1,
                // Disable the browser's own pinch-to-zoom/scroll on this
                // area so our custom pinch handling gets the gesture.
                touchAction: "none",
              }}
            />

            {/* NEW: focus ring animation shown briefly where the user tapped */}
            {focusRing && (
              <div
                style={{
                  position: "absolute",
                  top: focusRing.y - 35,
                  left: focusRing.x - 35,
                  width: "70px",
                  height: "70px",
                  borderRadius: "50%",
                  border: "3px solid #ffd23f",
                  pointerEvents: "none",
                  zIndex: 3,
                  animation: "focusRingPulse 0.7s ease-out",
                }}
              />
            )}

            {/* NEW: top toolbar — flashlight + camera switch */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                display: "flex",
                gap: "10px",
                zIndex: 2,
              }}
            >
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  aria-label="Toggle flashlight"
                  style={{
                    width: "46px",
                    height: "46px",
                    borderRadius: "50%",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "20px",
                    background: torchOn
                      ? "#ffd23f"
                      : "rgba(0,0,0,0.55)",
                    color: torchOn ? "#10131a" : "white",
                  }}
                >
                  {torchOn ? "🔦" : "💡"}
                </button>
              )}

              <button
                onClick={switchCamera}
                aria-label="Switch camera"
                style={{
                  width: "46px",
                  height: "46px",
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "20px",
                  background: "rgba(0,0,0,0.55)",
                  color: "white",
                }}
              >
                🔄
              </button>
            </div>

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
                zIndex: 1,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  left: -5,
                  width: "45px",
                  height: "45px",
                  borderTop: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                  borderLeft: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: -5,
                  right: -5,
                  width: "45px",
                  height: "45px",
                  borderTop: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                  borderRight: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -5,
                  left: -5,
                  width: "45px",
                  height: "45px",
                  borderBottom: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                  borderLeft: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -5,
                  right: -5,
                  width: "45px",
                  height: "45px",
                  borderBottom: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                  borderRight: `6px solid ${documentDetected ? "#00ff66" : "#ff2020"}`,
                }}
              />
            </div>

            {/* NEW: manual shutter button, overlaid at the bottom of the frame */}
            <button
              onClick={handleManualCapture}
              aria-label="Capture document"
              style={{
                position: "absolute",
                bottom: "20px",
                left: "50%",
                transform: "translateX(-50%)",
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                border: "5px solid white",
                background: "#ff2020",
                cursor: "pointer",
                boxShadow: "0 0 18px rgba(255,32,32,0.8)",
                zIndex: 2,
              }}
            />
          </div>

          {/* NEW: zoom slider, shown only if the camera supports it */}
          {zoomSupported && (
            <div
              style={{
                width: "min(900px, 92vw)",
                margin: "10px auto 0",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                color: "#b8c7d9",
              }}
            >
              <span>🔍-</span>
              <input
                type="range"
                min={zoomMin}
                max={zoomMax}
                step={zoomStep}
                value={zoomValue}
                onChange={handleZoomChange}
                style={{ flex: 1 }}
              />
              <span>🔍+</span>
            </div>
          )}

          <div
            style={{
              width: "min(900px, 92vw)",
              margin: "20px auto",
              padding: "18px",
              borderRadius: "12px",
              background: documentDetected ? "#123d24" : "#4a1515",
              color: documentDetected ? "#00ff66" : "#ff4444",
              fontSize: "21px",
              fontWeight: "bold",
            }}
          >
            {documentDetected ? (
              <>
                🟢 DOCUMENT ALIGNED
                <br />
                <span style={{ fontSize: "16px" }}>
                  Tap the red button to capture
                </span>
              </>
            ) : (
              <>
                🔴 ALIGN THE DOCUMENT
                <br />
                <span style={{ fontSize: "16px" }}>
                  Place it inside the box, then tap the red button
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

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {capturedImage && (
        <div
          style={{
            marginTop: "30px",
            width: "min(900px, 92vw)",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <h2>Captured Document</h2>

          <img
            src={capturedImage}
            alt="Captured document"
            style={{
              width: "100%",
              borderRadius: "12px",
              display: "block",
            }}
          />

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              justifyContent: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleRetake}
              disabled={uploading}
              style={{
                padding: "12px 22px",
                fontSize: "17px",
                cursor: uploading ? "not-allowed" : "pointer",
                border: "none",
                borderRadius: "8px",
              }}
            >
              🔄 Retake
            </button>

            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                padding: "12px 22px",
                fontSize: "17px",
                cursor: uploading ? "not-allowed" : "pointer",
                border: "none",
                borderRadius: "8px",
              }}
            >
              {uploading ? "⏳ Uploading..." : "📤 Upload"}
            </button>

            <button
              onClick={handleUploadAndScanAnother}
              disabled={uploading}
              style={{
                padding: "12px 22px",
                fontSize: "17px",
                cursor: uploading ? "not-allowed" : "pointer",
                border: "none",
                borderRadius: "8px",
              }}
            >
              {uploading ? "⏳ Uploading..." : "📤 Upload & Scan Another"}
            </button>
          </div>

          {/* AI RESULT CARD */}
          <AnalysisResult result={scanResult} />
        </div>
      )}

      {errorMessage && (
        <div style={{ marginTop: "25px", color: "#ff7777" }}>
          <h3>Camera Error</h3>
          <p>{errorMessage}</p>
        </div>
      )}
    </div>
  );
}

export default CameraScanner;
