import React from "react";

function AnalysisResult({ result }) {
  console.log("📊 AnalysisResult received:", result);

  if (!result) {
    return (
      <div
        style={{
          marginTop: "30px",
          background: "#1F2937",
          border: "2px dashed #6B7280",
          borderRadius: "18px",
          padding: "24px",
          color: "#D1D5DB",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0 }}>Waiting for Document Scan...</h2>
        <p style={{ marginTop: "10px", color: "#9CA3AF" }}>
          Capture or upload a document to run real-time forensic verification.
        </p>
      </div>
    );
  }

  // Support both new verification engine schema and existing mlAnalysis fallback
  const docType = result.documentType || result.mlDocumentType || result.mlAnalysis?.document_type || "Unknown";
  const risk = result.riskScore ?? result.mlAnalysis?.risk_score ?? 0;
  const status = result.status || (risk <= 30 ? "Likely Genuine" : risk <= 70 ? "Suspicious / Review Required" : "High Risk / Likely Tampered");

  const isSafe = risk <= 30;
  const isWarning = risk > 30 && risk <= 65;
  const isDanger = risk > 65;

  const color = isSafe ? "#22c55e" : isWarning ? "#f59e0b" : "#ef4444";
  const bgColor = isSafe ? "rgba(34, 197, 94, 0.12)" : isWarning ? "rgba(245, 158, 11, 0.12)" : "rgba(239, 68, 68, 0.12)";

  const checks = result.checks || {};
  const warnings = result.warnings || [];
  const tampering = result.tamperingDetails || [];
  const details = result.details || {};
  const ocrConfidence = Math.round(result.confidence ?? 0);
  const engineTime = result.engineProcessingTime ?? result.processingTime ?? 0;

  // Icon mapping
  const docIcons = {
    Passport: "🛂",
    Aadhaar: "🆔",
    "PAN Card": "💳",
    "Voter ID": "🗳️",
    "Driving Licence": "🚗",
    Visa: "✈️",
    Unknown: "📄",
  };
  const icon = docIcons[docType] || "📄";

  // Friendly check labels mapping
  const checkLabels = {
    mrzValid: "ICAO MRZ Zone Valid",
    checkDigitsValid: "7-3-1 Check Digits Verified",
    expiryValid: "Document Within Validity Period",
    dataMatch: "OCR & Cryptographic Data Match",
    formatValid: "National Identifier Format Valid",
    verhoeffValid: "Verhoeff Checksum Algorithm Passed",
    qrDetected: "Secure QR Code Detected",
    qrDataValid: "QR Payload Cryptographically Valid",
    panFormatValid: "PAN Format (AAAAA9999A) Valid",
    holderTypeValid: "4th Character Entity Category Valid",
    surnameInitialMatches: "5th Char Matches Surname Initial",
    headerValid: "Official Authority Security Header Valid",
    dobValid: "Date of Birth Format Consistent",
    epicFormatValid: "EPIC Identifier Format Valid",
    qrCodeVerified: "Voter QR Code Cross-Validated",
    dlFormatValid: "Sarathi DL Standard Format Valid",
    stateRecognized: "Issuing State Code Recognized",
    issueYearValid: "Issue Date Valid (Non-Future)",
    visaTypeValid: "Visa Category & Authorization Valid",
  };

  return (
    <div
      style={{
        marginTop: "30px",
        background: "#0d131f",
        border: `2px solid ${color}`,
        borderRadius: "20px",
        padding: "26px",
        color: "#f8fafc",
        textAlign: "left",
        boxShadow: `0 12px 36px ${bgColor}`,
      }}
    >
      {/* 1. HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          borderBottom: "1px solid #1e293b",
          paddingBottom: "18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "36px" }}>{icon}</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "24px", color: "white" }}>
                {docType}
              </h2>
              <span
                style={{
                  background: "#1e293b",
                  color: "#38bdf8",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                Verification Engine
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: "14px" }}>
              Automated Forensic Document Fraud & Cross-Validation Report
            </p>
          </div>
        </div>

        <div
          style={{
            background: color,
            color: isWarning ? "#0f172a" : "#ffffff",
            padding: "8px 20px",
            borderRadius: "999px",
            fontWeight: "bold",
            fontSize: "15px",
            boxShadow: `0 4px 14px ${color}44`,
          }}
        >
          {status}
        </div>
      </div>

      {/* 2. RISK METER & KEY METRICS */}
      <div
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "18px",
          alignItems: "center",
        }}
      >
        {/* Conic Risk Gauge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "16px",
            background: "#111827",
            borderRadius: "14px",
            border: "1px solid #1e293b",
          }}
        >
          <div
            style={{
              width: "130px",
              height: "130px",
              borderRadius: "50%",
              background: `conic-gradient(${color} ${risk * 3.6}deg, #1e293b 0deg)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "98px",
                height: "98px",
                borderRadius: "50%",
                background: "#0d131f",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "28px", fontWeight: "bold", color }}>
                {risk}
              </div>
              <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 600 }}>
                RISK SCORE
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: "10px",
              color,
              fontWeight: 700,
              fontSize: "13px",
              letterSpacing: "0.5px",
            }}
          >
            {isSafe ? "LOW RISK (GENUINE)" : isWarning ? "SUSPICIOUS / REVIEW" : "HIGH RISK (ALTERED)"}
          </div>
        </div>

        {/* Quick Stat Cards */}
        <StatCard icon="🎯" title="OCR Confidence" value={`${ocrConfidence}%`} />
        <StatCard icon="⚡" title="Engine Latency" value={`${Math.round(engineTime)} ms`} />
        <StatCard
          icon="🛡️"
          title="Security Rules"
          value={`${Object.values(checks).filter(Boolean).length} / ${Object.keys(checks).length || 1} Passed`}
        />
      </div>

      {/* 3. SECURITY CHECKS GRID */}
      {Object.keys(checks).length > 0 && (
        <div
          style={{
            marginTop: "22px",
            background: "#111827",
            borderRadius: "14px",
            padding: "20px",
            border: "1px solid #1e293b",
          }}
        >
          <h3 style={{ margin: "0 0 14px", fontSize: "17px", color: "#e2e8f0" }}>
            🔒 Document-Specific Verification Rules
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "10px",
            }}
          >
            {Object.entries(checks).map(([key, passed]) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 12px",
                  background: passed ? "rgba(34, 197, 94, 0.08)" : "rgba(239, 68, 68, 0.08)",
                  borderRadius: "8px",
                  border: `1px solid ${passed ? "#166534" : "#991b1b"}`,
                }}
              >
                <span style={{ fontSize: "16px", color: passed ? "#22c55e" : "#ef4444" }}>
                  {passed ? "✔" : "✖"}
                </span>
                <span style={{ fontSize: "13.5px", color: passed ? "#f1f5f9" : "#fca5a5" }}>
                  {checkLabels[key] || key}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. EXTRACTED DETAILS TABLE */}
      {details && Object.keys(details).length > 0 && (
        <div
          style={{
            marginTop: "22px",
            background: "#111827",
            borderRadius: "14px",
            padding: "20px",
            border: "1px solid #1e293b",
          }}
        >
          <h3 style={{ margin: "0 0 14px", fontSize: "17px", color: "#e2e8f0" }}>
            📋 Extracted & Cross-Validated Document Fields
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            {Object.entries(details).map(([key, val]) => {
              if (val === null || val === undefined || typeof val === "object") return null;
              return (
                <div
                  key={key}
                  style={{
                    background: "#182234",
                    padding: "10px 14px",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "14.5px",
                      fontWeight: 600,
                      color: "#f8fafc",
                      wordBreak: "break-word",
                    }}
                  >
                    {String(val)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. TAMPERING & WARNINGS ALERTS */}
      {(warnings.length > 0 || tampering.length > 0) && (
        <div
          style={{
            marginTop: "22px",
            background: isDanger ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
            borderRadius: "14px",
            padding: "20px",
            border: `1px solid ${isDanger ? "#ef4444" : "#f59e0b"}`,
          }}
        >
          <h3
            style={{
              margin: "0 0 12px",
              fontSize: "17px",
              color: isDanger ? "#fca5a5" : "#fcd34d",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            ⚠️ Flagged Discrepancies & Tampering Alerts
          </h3>
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#e2e8f0", fontSize: "14px", lineHeight: "1.7" }}>
            {tampering.map((item, idx) => (
              <li key={`t-${idx}`} style={{ color: "#f87171", fontWeight: 600 }}>
                {item.field ? `[${item.field.toUpperCase()}] ` : ""}{item.issue || JSON.stringify(item)}
              </li>
            ))}
            {warnings.map((w, idx) => (
              <li key={`w-${idx}`}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, title, value }) {
  return (
    <div
      style={{
        background: "#111827",
        borderRadius: "14px",
        padding: "16px 18px",
        border: "1px solid #1e293b",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "18px" }}>{icon}</span>
        <span style={{ color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", fontWeight: 600 }}>
          {title}
        </span>
      </div>
      <div style={{ marginTop: "6px", fontSize: "19px", fontWeight: "bold", color: "#f8fafc" }}>
        {value}
      </div>
    </div>
  );
}

export default AnalysisResult;