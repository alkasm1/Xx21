// backend/device_sim.js
//
// Simulated ALM Device
// Responds with ACK
//

const dgram = require("dgram");
const ACL = require("../src/acl/alm_acl_secure");

const socket = dgram.createSocket("udp4");

socket.on("message", async (msg, rinfo) => {
  try {
    const ack = {
      ackId: 1,
      status: 0,
      deviceId: 1,
      commandId: msg[2],
      executionTime: Math.floor(Math.random() * 10),
      errorCode: 0
    };

    const ackPacket = Buffer.from([
      0xA1, 0x01, 0xFF, ack.status,
      0x00, 0x01,
      ack.commandId,
      0x00, ack.executionTime,
      ack.errorCode
    ]);

    socket.send(ackPacket, rinfo.port, rinfo.address);

    console.log("📤 Simulated ACK sent");

  } catch (e) {
    console.log("⚠ Invalid packet");
  }
});

socket.bind(5000, () => {
  console.log("🤖 Device Simulator running on 5000");
});
