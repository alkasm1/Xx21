// backend/sender.js
//
// Manual sender for testing ALM packets
//

const dgram = require("dgram");
const ACL = require("../src/acl/alm_acl_secure");

const socket = dgram.createSocket("udp4");

async function sendTest() {
  const packet = await ACL.buildSetFreqSecure({
    groupId: 1,
    freqMHz: 5805,
    bandwidth: 40,
    txPower: 20,
    keyId: 1
  });

  socket.send(packet, 5001, "127.0.0.1", () => {
    console.log("📤 Sent test packet to Gateway");
  });
}

sendTest();
