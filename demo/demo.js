// demo/demo.js
//
// Simple ALM + UDP demo
// Sends SetFreq to a simulated device
//

const dgram = require("dgram");
const ACL = require("../src/acl/alm_acl_secure");

const socket = dgram.createSocket("udp4");

async function runDemo() {

  console.log("🚀 Running ALM Demo...");

  const packet = await ACL.buildSetFreqSecure({
    groupId: 1,
    freqMHz: 5805,
    bandwidth: 40,
    txPower: 20,
    keyId: 1
  });

  socket.send(packet, 5000, "127.0.0.1", () => {
    console.log("📤 Sent SetFreq packet");
  });

  socket.on("message", (msg) => {
    try {
      const ack = ACL.parseAck(msg);
      console.log("✅ ACK:", ack);
    } catch {
      console.log("⚠ Received non-ACK packet");
    }
  });
}

runDemo();
