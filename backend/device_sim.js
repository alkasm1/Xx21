/* =========================
   DEVICE SIMULATOR — NODE BACKEND
   Uses ALM + ACL_SECURE_NODE + UDP
========================= */

const UDPTransport = require("./udp_transport");
const ALM = require("../src/alm_kernel_node");
const ACL_SECURE = require("../src/acl/alm_acl_secure_node");

const udp = new UDPTransport({ port: 5000 });

console.log("[DEVICE] Listening on UDP port 5000...");

udp.onPacket(async (msg, rinfo) => {

  console.log("\n[DEVICE] Raw packet from", rinfo.address, "len =", msg.length);

  try {
    const parsed = await ACL_SECURE.parseSecure(msg);

    console.log("[DEVICE] Parsed secure ACL command:");
    console.log(parsed);

  } catch (e) {
    console.log("[DEVICE] ERROR:", e.message);
  }
});
