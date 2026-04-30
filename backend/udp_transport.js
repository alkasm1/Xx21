/* =========================
   UDP TRANSPORT — NODE VERSION
   Stable Organized Build
========================= */

const dgram = require("dgram");

class UDPTransport {

  constructor({ port = 5000, broadcast = true } = {}) {

    this.port = port;
    this.socket = dgram.createSocket("udp4");
    this.handlers = [];

    // استقبال الرسائل
    this.socket.on("message", (msg, rinfo) => {
      this.handlers.forEach(h => h(msg, rinfo));
    });

    // تشغيل السوكيت
    this.socket.bind(port, () => {
      if (broadcast) {
        this.socket.setBroadcast(true);
      }
      console.log(`[UDP] Listening on port ${port}`);
    });
  }

  // تسجيل callback للاستقبال
  onPacket(handler) {
    this.handlers.push(handler);
  }

  // إرسال حزمة
  send(buffer, address = "255.255.255.255") {
    const buf = Buffer.from(buffer);
    this.socket.send(buf, 0, buf.length, this.port, address);
  }
}

module.exports = UDPTransport;
