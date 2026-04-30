/* =========================
   SENDER — NODE BACKEND
   Uses ALM + ACL_SECURE_NODE + UDP
========================= */

const UDPTransport = require("./udp_transport");
const ALM = require("../src/alm_kernel_node");
const ACL_SECURE = require("../src/acl/alm_acl_secure_node");

(async () => {

  const udp = new UDPTransport({ port: 5000 });

  console.log("[SENDER] Ready on UDP port 5000");

  // مثال: إرسال أمر SET_FREQ آمن
  const packet = await ACL_SECURE.buildSetFreqSecure({
    groupId: 1,
    freqMHz: 5805,
    bandwidth: 40,
    txPower: 20,
    keyId: 1
  });

  console.log("[SENDER] Built secure packet:", packet.length, "bytes");

  udp.send(packet);

  console.log("[SENDER] Packet sent (broadcast)");

})();
