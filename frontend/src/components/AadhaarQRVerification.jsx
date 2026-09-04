import React, { useState } from "react";

const AadhaarQRVerification = () => {
  const [image, setImage] = useState(null);
  const [result, setResult] = useState(null);

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImage(URL.createObjectURL(file));
    setResult(null);
  };

  const verifyQR = async () => {
    // Backend API will be connected later
    setResult({
      status: "Processing...",
      message: "Scanning Secure QR Code..."
    });
  };

  return (
    <div className="border rounded-xl p-5 shadow-md bg-white">
      <h2 className="text-xl font-bold mb-4">
        Aadhaar Secure QR Verification
      </h2>

      <input type="file" accept="image/*" onChange={handleImage} />

      {image && (
        <img
          src={image}
          alt="Aadhaar Preview"
          className="mt-4 w-72 rounded-lg border"
        />
      )}

      <button
        onClick={verifyQR}
        className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-lg"
      >
        Verify QR
      </button>

      {result && (
        <div className="mt-4 p-3 border rounded bg-gray-100">
          <p><strong>Status:</strong> {result.status}</p>
          <p>{result.message}</p>
        </div>
      )}
    </div>
  );
};

export default AadhaarQRVerification;