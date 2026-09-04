/**
 * Tampering Detection & Suspicious Region Locator.
 * Correlates detected tampering issues with estimated visual image regions
 * to highlight altered or inconsistent areas on the document preview.
 */

export function detectSuspiciousRegions({ documentType, tamperingDetails = [], warnings = [] }) {
  const regions = [];

  // Typical layout mapping for each document type (normalized percentages 0-100)
  const layoutMaps = {
    Passport: {
      passportNumber: { x: 65, y: 12, width: 30, height: 10, label: "Passport Number (VIZ)" },
      dob: { x: 35, y: 48, width: 30, height: 8, label: "Date of Birth" },
      expiryDate: { x: 35, y: 62, width: 30, height: 8, label: "Expiry Date" },
      mrz: { x: 5, y: 80, width: 90, height: 18, label: "Machine Readable Zone (MRZ)" },
    },
    Aadhaar: {
      aadhaarNumber: { x: 20, y: 78, width: 60, height: 12, label: "12-Digit Aadhaar UID" },
      name: { x: 30, y: 38, width: 45, height: 10, label: "Resident Name" },
      dob: { x: 30, y: 48, width: 40, height: 8, label: "Date of Birth" },
      gender: { x: 30, y: 56, width: 25, height: 8, label: "Gender" },
      qr: { x: 68, y: 40, width: 28, height: 35, label: "Secure QR Code" },
    },
    "PAN Card": {
      panNumber: { x: 10, y: 75, width: 50, height: 15, label: "PAN Number" },
      name: { x: 10, y: 38, width: 55, height: 10, label: "Cardholder Name" },
      dob: { x: 10, y: 58, width: 35, height: 10, label: "Date of Birth" },
      fatherName: { x: 10, y: 48, width: 55, height: 10, label: "Father's Name" },
    },
    "Voter ID": {
      epicNumber: { x: 55, y: 15, width: 40, height: 12, label: "EPIC Number" },
      voterName: { x: 35, y: 40, width: 55, height: 10, label: "Elector Name" },
      qr: { x: 65, y: 60, width: 30, height: 30, label: "Voter QR Code" },
    },
    "Driving Licence": {
      dlNumber: { x: 30, y: 20, width: 65, height: 12, label: "Licence Number" },
      dob: { x: 30, y: 45, width: 35, height: 10, label: "Date of Birth" },
      validity: { x: 30, y: 65, width: 45, height: 10, label: "Validity Period" },
    },
    Visa: {
      visaNumber: { x: 60, y: 15, width: 35, height: 10, label: "Visa Number" },
      mrz: { x: 5, y: 78, width: 90, height: 20, label: "Visa MRZ Zone" },
    },
  };

  const currentLayout = layoutMaps[documentType] || {};

  // Map each tampering detail to a suspicious visual region
  for (const item of tamperingDetails) {
    const fieldKey = item.field || "";
    const box = currentLayout[fieldKey] || {
      x: 10,
      y: 70,
      width: 80,
      height: 20,
      label: fieldKey || "Suspicious Field",
    };

    regions.push({
      ...box,
      severity: "high",
      reason: item.issue || "Field mismatch or check digit failure",
      field: fieldKey,
    });
  }

  // If there are general warnings but no specific tampering items, highlight relevant zones
  if (regions.length === 0 && warnings.length > 0) {
    for (const w of warnings) {
      if (w.includes("MRZ") && currentLayout.mrz) {
        regions.push({
          ...currentLayout.mrz,
          severity: "medium",
          reason: w,
          field: "mrz",
        });
      } else if (w.includes("QR") && currentLayout.qr) {
        regions.push({
          ...currentLayout.qr,
          severity: "medium",
          reason: w,
          field: "qr",
        });
      }
    }
  }

  return regions;
}
