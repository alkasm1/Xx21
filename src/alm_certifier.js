/* =========================
   BYTE EQUALITY
========================= */

window.equalBytes = function (a, b) {

  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) {
    return false;
  }

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
        delta: recovered[i] - original[i]
      });

      if (diffs.length >= maxReport) break;
    }
  }

  return {
    lengthMismatch:
      original.length !== recovered.length
        ? { original: original.length, recovered: recovered.length }
        : null,
    diffs
  };
}


/* =========================
   ALM TRANSPORT CERTIFIER
========================= */

async function certifyALMTransport({
  data,
  text,
  type = 0x02,
  meta = 0
} = {}) {

  console.log("=== ALM CERTIFICATION START ===");

  try {

    /* =========================
       INPUT NORMALIZATION
    ========================= */
    const input = data ?? text ?? "1 + 2 * 3";

    /* =========================
       BUILD PACKET
    ========================= */
    const originalPacket = ALM.wrap(input, type, meta);

    /* =========================
       TRANSPORT
    ========================= */
    const medium = await transportEncode(originalPacket);
    const recoveredPacket = await transportDecode(medium);

    /* =========================
       BYTE CHECK
    ========================= */
    const byteOK = equalBytes(originalPacket, recoveredPacket);

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

    /* =========================
       SAFE UNWRAP
    ========================= */
    let before, after;

    try {
      before = ALM.unwrap(originalPacket);
      after = ALM.unwrap(recoveredPacket);

    } catch (e) {

      console.error("❌ UNWRAP FAILED:", e.message);

      return {
        ok: false,
        byteOK,
        error: "UNWRAP_FAILED",
        message: e.message
      };
    }

    /* =========================
       SEMANTIC CHECK
    ========================= */
    const semanticOK =
      before.type === after.type &&
      before.meta === after.meta &&
      equalBytes(before.data, after.data);

    /* =========================
       RESULT
    ========================= */
    return {
      ok: true,
      byteOK,
      semanticOK,
      before,
      after
    };

  } catch (e) {

    console.error("❌ CERTIFIER ERROR:", e.message);

    return {
      ok: false,
      error: e.message
    };
  }
}


/* =========================
   EXPORT
========================= */

window.certifyALMTransport = certifyALMTransport;
