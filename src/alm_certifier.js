/* =========================
   BYTE EQUALITY
========================= */

window.equalBytes = function(a, b) {

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

async function certifyALMTransport({ data, type = 0x02, meta = 0 }) {

  // 🔥 دعم string و binary
  const originalPacket = ALM.wrap(data, type, meta);

  const medium = await transportEncode(originalPacket);
  const recoveredPacket = await transportDecode(medium);

  const byteOK = equalBytes(originalPacket, recoveredPacket);

  if (!byteOK) {
    const report = analyzeDrift(originalPacket, recoveredPacket);
    return {
      ok: false,
      byteOK,
      report
    };
  }

  const before = ALM.unwrap(originalPacket);
  const after  = ALM.unwrap(recoveredPacket);

  // 🔥 المقارنة الصحيحة للـ bytes
  const semanticOK =
    before.type === after.type &&
    before.meta === after.meta &&
    equalBytes(before.data, after.data);

  return {
    ok: true,
    byteOK,
    semanticOK,
    before,
    after
  };
}

/* =========================
   EXPORT TO WINDOW
========================= */

window.certifyALMTransport = certifyALMTransport;
