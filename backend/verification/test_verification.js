import { verifyDocument } from "./index.js";
import { validateVerhoeff } from "./utils/verhoeff.js";
import { calculateCheckDigit } from "./utils/mrzParser.js";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 TESTING DOCUMENT-SPECIFIC VERIFICATION ENGINE");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Verhoeff Checksum Algorithm
  // ----------------------------------------------------
  console.log("--- 1. Testing Verhoeff Algorithm ---");
  assert(validateVerhoeff("548967219043") === true || validateVerhoeff("218237927181") === true, "Verhoeff executed");
  assert(validateVerhoeff("123456789012") === false, "Invalid Verhoeff rejected");

  // ----------------------------------------------------
  // TEST 2: Passport MRZ Verification with Exact ICAO 9303 Check Digits
  // ----------------------------------------------------
  console.log("\n--- 2. Testing Passport Verification ---");
  // Check digits:
  // J1234567< -> 9
  // 900815 -> 7
  // 300814 -> 4
  const validPassportText = `
PASSPORT
REPUBLIC OF INDIA
PASSPORT NO: J1234567
SURNAME: SHARMA
GIVEN NAMES: RAHUL
NATIONALITY: INDIAN
DATE OF BIRTH: 15/08/1990
DATE OF EXPIRY: 14/08/2030

P<INDSHARMA<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<<
J1234567<9IND9008157M3008144<<<<<<<<<<<<<<<4
`;

  const passportRes = await verifyDocument({ ocrText: validPassportText });
  console.log("Passport Result:", JSON.stringify({
    type: passportRes.documentType,
    risk: passportRes.riskScore,
    status: passportRes.status,
    checks: passportRes.checks,
    details: passportRes.details,
  }, null, 2));

  assert(passportRes.documentType === "Passport", "Passport classified correctly");
  assert(passportRes.checks.mrzValid === true, "Passport MRZ valid");
  assert(passportRes.checks.checkDigitsValid === true, "Passport check digits valid");
  assert(passportRes.checks.expiryValid === true, "Passport not expired");
  assert(passportRes.status === "Likely Genuine", "Passport marked Likely Genuine");

  // ----------------------------------------------------
  // TEST 3: Aadhaar Verification
  // ----------------------------------------------------
  console.log("\n--- 3. Testing Aadhaar Verification ---");
  const aadhaarText = `
GOVERNMENT OF INDIA
UNIQUE IDENTIFICATION AUTHORITY OF INDIA
Aadhaar
Mera Aadhaar, Meri Pehchan
Rajesh Kumar
DOB: 12/05/1988
Male
5489 6721 9043
`;
  const qrMock = {
    detected: true,
    type: "Aadhaar",
    parsedData: {
      isAadhaarQR: true,
      name: "Rajesh Kumar",
      gender: "Male",
      yob: "1988",
      dob: "12/05/1988",
      uid: "548967219043",
    },
  };

  const aadhaarRes = await verifyDocument({ ocrText: aadhaarText, qrResult: qrMock });
  console.log("Aadhaar Result:", JSON.stringify({
    type: aadhaarRes.documentType,
    risk: aadhaarRes.riskScore,
    status: aadhaarRes.status,
    checks: aadhaarRes.checks,
  }, null, 2));

  assert(aadhaarRes.documentType === "Aadhaar", "Aadhaar classified correctly");
  assert(aadhaarRes.checks.formatValid === true, "Aadhaar format valid");
  assert(aadhaarRes.checks.qrDetected === true, "Aadhaar QR detected");
  assert(aadhaarRes.checks.dataMatch === true, "Aadhaar QR cross-matched text");

  // ----------------------------------------------------
  // TEST 4: PAN Card Verification (4th char 'P' for Individual, 5th char 'S' for Sharma)
  // ----------------------------------------------------
  console.log("\n--- 4. Testing PAN Card Verification ---");
  const panText = `
INCOME TAX DEPARTMENT
GOVT. OF INDIA
PERMANENT ACCOUNT NUMBER
ABCPS1234F
NAME: AMIT SHARMA
FATHER'S NAME: RAMESH SHARMA
DATE OF BIRTH: 01/01/1995
`;

  const panRes = await verifyDocument({ ocrText: panText });
  console.log("PAN Result:", JSON.stringify({
    type: panRes.documentType,
    risk: panRes.riskScore,
    status: panRes.status,
    checks: panRes.checks,
    details: panRes.details,
  }, null, 2));

  assert(panRes.documentType === "PAN Card", "PAN classified correctly");
  assert(panRes.checks.panFormatValid === true, "PAN format valid (ABCPS1234F)");
  assert(panRes.checks.holderTypeValid === true, "4th character 'P' (Person/Individual) recognized");
  assert(panRes.checks.surnameInitialMatches === true, "5th character 'S' matches surname 'SHARMA'");
  assert(panRes.checks.headerValid === true, "Income Tax header valid");
  assert(panRes.status === "Likely Genuine", "Valid PAN marked Likely Genuine");

  // ----------------------------------------------------
  // TEST 5: Voter ID Verification
  // ----------------------------------------------------
  console.log("\n--- 5. Testing Voter ID Verification ---");
  const voterText = `
ELECTION COMMISSION OF INDIA
ELECTOR PHOTO IDENTITY CARD
EPIC NO: WBD1234567
NAME: SUNIL DAS
FATHER'S NAME: KISHORE DAS
GENDER: MALE
AGE: 34
`;

  const voterRes = await verifyDocument({ ocrText: voterText });
  console.log("Voter Result:", JSON.stringify({
    type: voterRes.documentType,
    risk: voterRes.riskScore,
    status: voterRes.status,
    checks: voterRes.checks,
  }, null, 2));

  assert(voterRes.documentType === "Voter ID", "Voter ID classified correctly");
  assert(voterRes.checks.epicFormatValid === true, "EPIC format valid");
  assert(voterRes.checks.headerValid === true, "Election Commission header valid");

  // ----------------------------------------------------
  // TEST 6: Driving Licence Verification
  // ----------------------------------------------------
  console.log("\n--- 6. Testing Driving Licence Verification ---");
  const dlText = `
UNION OF INDIA
TRANSPORT DEPARTMENT
DRIVING LICENCE
DL NO: MH-12-20200012345
NAME: VIKRAM PATIL
DOB: 10/10/1992
VALIDITY: 09/10/2040
`;

  const dlRes = await verifyDocument({ ocrText: dlText });
  console.log("DL Result:", JSON.stringify({
    type: dlRes.documentType,
    risk: dlRes.riskScore,
    status: dlRes.status,
    checks: dlRes.checks,
    details: dlRes.details,
  }, null, 2));

  assert(dlRes.documentType === "Driving Licence", "Driving Licence classified correctly");
  assert(dlRes.checks.dlFormatValid === true, "Sarathi DL format valid");
  assert(dlRes.checks.stateRecognized === true, "MH recognized as Maharashtra");

  // ----------------------------------------------------
  // TEST 7: Tampered Passport (Check Digit Failure & VIZ Mismatch)
  // ----------------------------------------------------
  console.log("\n--- 7. Testing Tampered Document Detection ---");
  const tamperedPassportText = `
PASSPORT
REPUBLIC OF INDIA
PASSPORT NO: K9999999
SURNAME: KHAN
GIVEN NAMES: IMRAN

P<INDKHAN<<IMRAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<
J1234567<8IND9008158M3008144<<<<<<<<<<<<<<04
`;

  const tamperedRes = await verifyDocument({ ocrText: tamperedPassportText });
  console.log("Tampered Result:", JSON.stringify({
    type: tamperedRes.documentType,
    risk: tamperedRes.riskScore,
    status: tamperedRes.status,
    tampering: tamperedRes.tamperingDetails,
    warnings: tamperedRes.warnings,
  }, null, 2));

  assert(tamperedRes.tamperingDetails.length > 0, "Tampered passport number mismatch detected");
  assert(tamperedRes.riskScore >= 50, "Tampered document risk score elevated");

  console.log("\n==================================================");
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");
}

runTests().catch(console.error);
