// src/transports/udp_transport.js
//
// UDP Transport for Node.js
// Sends and receives Uint8Array packets
//

const dgram = require("dgram");

class UDPTransport {

  constructor(port, onPacket) {
    this.port = port;
    this.onPacket = onPacket;

    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (msg, rinfo) => {
      if (this.onPacket) {
        this.onPacket(new Uint8Array(msg), rinfo);
      }
    });

    this.socket.bind(port, () => {
      console.log(`[UDP] Listening on ${port}`);
    });
  }

  send(packet, port, host) {
    if (!(packet instanceof Uint8Array)) {
      throw new Error("UDPTransport.send expects Uint8Array");
    }

    this.socket.send(Buffer.from(packet), port, host);
  }
}

module.exports = UDPTransport;
