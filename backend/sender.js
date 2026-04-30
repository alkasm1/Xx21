import { UDPTransport } from "./udp_transport.js";
import { ACL_SECURE } from "../src/acl/alm_acl_secure.js";
import "../src/alm_kernel.js";

const transport = new UDPTransport({ port: 5050 });

async function run() {

  const packet = ACL_SECURE.buildSetFreqSecure({
    groupId: 1,
    freqMHz: 5805,
    bandwidth: 40,
    txPower: 20
  });

  console.log("🚀 Sending SET_FREQ broadcast...");

  transport.send(packet);

  // 🔥 اختبار replay
  setTimeout(() => {
    console.log("🔁 Sending again (should be rejected)");
    transport.send(packet);
  }, 1000);
}

run();
