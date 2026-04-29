function equalBytes(a, b) {

  if (a.byteLength !== b.byteLength) return false;

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function analyzeDrift(original, recovered) {

  const diffs = [];

  for (let i = 0; i < Math.min(original.length, recovered.length); i++) {
    if (original[i] !== recovered[i]) {
      diffs.push({
        index: i,
        original: original[i],
        recovered: recovered[i]
      });
    }
  }

  return diffs;
}

async function certifyALMTransport({ text, type = 0x02, meta = 0 }) {

  const original = ALM.wrap(text, type, meta);

  const canvas = await transportEncode(original);
  const recovered = await transportDecode(canvas);

  const byteOK = equalBytes(original, recovered);

  if (!byteOK) {
    return {
      ok: false,
      drift: analyzeDrift(original, recovered)
    };
  }

  const a = ALM.unwrap(original);
  const b = ALM.unwrap(recovered);

  return {
    ok: true,
    semantic:
      a.type === b.type &&
      a.meta === b.meta &&
      a.data === b.data
  };
}
