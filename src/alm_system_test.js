/* =========================
   ALM SYSTEM TEST (GLOBAL)
========================= */

window.runALMSystemTest = async function () {

  const out = document.getElementById("output");
  out.textContent = "Running ALM System Test...\n\n";

  /* =========================
     TEXT TEST CASES
  ========================= */

  const cases = [
    { text: "1 + 2 * 3", type: 0x02 },
    { text: "1915265\n19757432", type: 0x04 },
    { text: "QR_PAYLOAD_TEST", type: 0x05 }
  ];

  for (const c of cases) {

    const packet = ALM.wrap(c.text, c.type, 0);

    const canvas = await transportEncode(packet);
    const recovered = await transportDecode(canvas);

    const byteOK = equalBytes(packet, recovered);

    let semanticOK = false;

    if (byteOK) {
      const before = new TextDecoder().decode(ALM.unwrap(packet).data);
      const after = new TextDecoder().decode(ALM.unwrap(recovered).data);

      semanticOK = before === after;
    }

    const line = `TYPE ${c.type} → BYTE:${byteOK} | SEM:${semanticOK}\n`;

    console.log(line);
    out.textContent += line;
  }

  /* =========================
     BINARY TEST
  ========================= */

  out.textContent += "\n--- BINARY TEST ---\n";

  const binary = new Uint8Array([1, 2, 3, 4, 255, 128, 64, 32]);

  const packet = ALM.wrap(binary, 0x03, 0);

  const canvas = await transportEncode(packet);
  const recovered = await transportDecode(canvas);

  const byteOK = equalBytes(packet, recovered);

  let integrityOK = false;

  if (byteOK) {
    const { data } = ALM.unwrap(recovered);
    integrityOK = equalBytes(binary, data);
  }

  const line = `BINARY → BYTE:${byteOK} | DATA:${integrityOK}\n`;

  console.log(line);
  out.textContent += line;

  out.textContent += "\n=== DONE ===\n";
};
