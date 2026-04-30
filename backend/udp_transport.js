import dgram from "dgram";

export class UDPTransport {

  constructor({ port = 5050 }) {

    this.port = port;
    this.socket = dgram.createSocket("udp4");

    this.socket.bind(() => {
      this.socket.setBroadcast(true);
    });
  }

  send(packet, address = "255.255.255.255") {

    const buf = Buffer.from(packet);

    this.socket.send(buf, 0, buf.length, this.port, address);
  }

  onPacket(callback) {

    this.socket.on("message", (msg) => {
      callback(new Uint8Array(msg));
    });
  }
}
