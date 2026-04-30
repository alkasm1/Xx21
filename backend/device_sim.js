import { UDPTransport } from "./udp_transport.js";
import { ACL_SECURE } from "../src/acl/alm_acl_secure.js";
import "../src/alm_kernel.js";

const DEVICE_ID = process.argv[2] || "X";

const transport = new UDPTransport({ port: 5050 });

console.log(`📡 Device ${DEVICE_ID} listening...`);

transport.onPacket((packet) => {

  try {

    const cmd = ACL_SECURE.parseSecure(packet);

    console.log(`✅ Device ${DEVICE_ID} received:`, cmd);

    if (cmd.cmd === "SET_FREQ") {

      console.log(
        `⚡ Device ${DEVICE_ID} → ${cmd.freqMHz} MHz | BW=${cmd.bandwidth} | PWR=${cmd.txPower}`
      );
    }

  } catch (e) {

    console.log(`❌ Device ${DEVICE_ID} rejected:`, e.message);
  }
});
