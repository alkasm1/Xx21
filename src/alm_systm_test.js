async function runALMSystemTest() {

  console.log("=== ALM SYSTEM TEST ===");

  const cases = [
    { text: "1 + 2 * 3", type: 0x02 },
    { text: "1915265\n19757432", type: 0x04 },
    { text: "QR_PAYLOAD_TEST", type: 0x05 }
  ];

  for (const c of cases) {

    const packet = ALM.wrap(c.text, c.type, 0);

    const canvas = await transportEncode(packet);
    const recovered = await transportDecode(canvas);

    const ok =
      equalBytes(packet, recovered);

    console.log("TYPE:", c.type, "BYTE_OK:", ok);
  }
}
