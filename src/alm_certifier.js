/* =========================
   BYTE EQUALITY
========================= */

window.equalBytes = function(a, b) {

  if (!a || !b) return false;

  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
};

/* =========================
   BYTE DRIFT ANALYZER
========================= */

function analyzeDrift(original, recovered, maxReport = 50) {

  const diffs = [];
  const len = Math.min(original.length, recovered.length);

  for (let i = 0; i < len; i++) {

    if (original[i] !== recovered[i]) {

      diffs.push({
        index: i,
        original: original[i],
        recovered: recovered[i],
        delta: recovered[i] - original[i],
        sameParity: (original[i] % 2) === (recovered[i] % 2)
      });

      if (diffs.length >= maxReport) break;
    }
  }

  return {
    lengthMismatch: original.length !== recovered.length
      ? {
          original: original.length,
          recovered: recovered.length
        }
      : null,
    diffs
  };
}

/* =========================
   ALM TRANSPORT CERTIFIER
========================= */

async function certifyALMTransport({ data, text, type = 0x02, meta = 0 }) {

  console.log("=== ALM CERTIFICATION START ===");

  // 🔥 دعم string و binary + توافق قديم
  const input = data ?? text;

  if (input === undefined || input === null) {
    throw new Error("No data provided to certifier");
  }

  // 1) بناء packet
  const originalPacket = ALM.wrap(input, type, meta);

  // 2) encode → decode
  const medium = await transportEncode(originalPacket);
  const recoveredPacket = await transportDecode(medium);

  // 3) فحص byte-level
  const byteOK = equalBytes(originalPacket, recoveredPacket);

  console.log("Byte match:", byteOK);

  if (!byteOK) {

    const report = analyzeDrift(originalPacket, recoveredPacket);

    console.warn("❌ DRIFT DETECTED");
    console.warn(report);

    return {
      ok: false,
      byteOK,
      report
    };
  }

  // 4) semantic check
  const before = ALM.unwrap(originalPacket);
  const after  = ALM.unwrap(recoveredPacket);

  const semanticOK =
    before.type === after.type &&
    before.meta === after.meta &&
    equalBytes(before.data, after.data);

  console.log("Semantic match:", semanticOK);

  // 5) النتيجة النهائية
  return {
    ok: true,
    byteOK,
    semanticOK,
    before,
    after
  };
}

/* =========================
   EXPORT
========================= */

window.certifyALMTransport = certifyALMTransport;
