const path = require("path");
const fs = require("fs");
const selfsigned = require("selfsigned");
const { X509Certificate } = require("@peculiar/x509");
const { MITM_DIR } = require("../paths");

const ROOT_CA_KEY_PATH = path.join(MITM_DIR, "rootCA.key");
const ROOT_CA_CERT_PATH = path.join(MITM_DIR, "rootCA.crt");

const ROOT_CA_SUBJECT = [
  { name: "commonName", value: "9Router MITM Root CA" },
  { name: "organizationName", value: "9Router" },
  { name: "countryName", value: "US" },
];

const ROOT_CA_EXTENSIONS = [
  {
    name: "basicConstraints",
    cA: true,
    critical: true,
  },
  {
    name: "keyUsage",
    keyCertSign: true,
    cRLSign: true,
    critical: true,
  },
];

/**
 * Check if cert file is expired or expiring within 30 days
 */
function isCertExpired(certPath) {
  try {
    const cert = new X509Certificate(fs.readFileSync(certPath, "utf8"));
    const expiryThreshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return cert.notAfter < expiryThreshold;
  } catch {
    return true; // treat unreadable cert as expired
  }
}

/**
 * Generate Root CA certificate (only once, auto-regenerate if expired)
 * This Root CA will sign all dynamic leaf certificates
 */
async function generateRootCA() {
  const exists = fs.existsSync(ROOT_CA_KEY_PATH) && fs.existsSync(ROOT_CA_CERT_PATH);
  if (exists && !isCertExpired(ROOT_CA_CERT_PATH)) {
    console.log("✅ Root CA already exists");
    return { key: ROOT_CA_KEY_PATH, cert: ROOT_CA_CERT_PATH };
  }
  if (exists) {
    console.log("🔐 Root CA expired or expiring soon — regenerating...");
    try { fs.unlinkSync(ROOT_CA_KEY_PATH); } catch { /* ignore */ }
    try { fs.unlinkSync(ROOT_CA_CERT_PATH); } catch { /* ignore */ }
  }

  if (!fs.existsSync(MITM_DIR)) {
    fs.mkdirSync(MITM_DIR, { recursive: true });
  }

  console.log("🔐 Generating Root CA certificate...");

  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notBefore.getFullYear() + 10);

  const pems = await selfsigned.generate(ROOT_CA_SUBJECT, {
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate: notBefore,
    notAfterDate: notAfter,
    extensions: ROOT_CA_EXTENSIONS,
  });

  fs.writeFileSync(ROOT_CA_KEY_PATH, pems.private);
  fs.writeFileSync(ROOT_CA_CERT_PATH, pems.cert);

  console.log("✅ Root CA generated successfully");
  return { key: ROOT_CA_KEY_PATH, cert: ROOT_CA_CERT_PATH };
}

/**
 * Load Root CA from disk (PEM strings for signing leaf certificates)
 */
function loadRootCA() {
  if (!fs.existsSync(ROOT_CA_KEY_PATH) || !fs.existsSync(ROOT_CA_CERT_PATH)) {
    throw new Error("Root CA not found. Generate it first.");
  }

  return {
    key: fs.readFileSync(ROOT_CA_KEY_PATH, "utf8"),
    cert: fs.readFileSync(ROOT_CA_CERT_PATH, "utf8"),
  };
}

/**
 * Generate leaf certificate for a specific domain, signed by Root CA
 */
async function generateLeafCert(domain, rootCA) {
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notBefore.getFullYear() + 1);

  const pems = await selfsigned.generate([{ name: "commonName", value: domain }], {
    keySize: 2048,
    algorithm: "sha256",
    notBeforeDate: notBefore,
    notAfterDate: notAfter,
    ca: { key: rootCA.key, cert: rootCA.cert },
    extensions: [
      {
        name: "basicConstraints",
        cA: false,
      },
      {
        name: "keyUsage",
        digitalSignature: true,
        keyEncipherment: true,
      },
      {
        name: "extKeyUsage",
        serverAuth: true,
        clientAuth: true,
      },
      {
        name: "subjectAltName",
        altNames: [
          { type: 2, value: domain },
          { type: 2, value: `*.${domain}` },
        ],
      },
    ],
  });

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

module.exports = {
  generateRootCA,
  loadRootCA,
  generateLeafCert,
  isCertExpired,
  ROOT_CA_CERT_PATH,
  ROOT_CA_KEY_PATH,
};
