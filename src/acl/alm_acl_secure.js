// src/acl/alm_acl_secure.js
//
// ALM Secure ACL (HMAC + ACK + Commands)
// Final stable version
//

const crypto = require("crypto");

const MAGIC = 0xA1;
const VERSION = 0x01;

const KEY = Buffer.from("00112233445566778899AABBCCDDEEFF", "hex");

function hmac(data) {
  return crypto.createHmac("sha256", KEY).update(data).digest();
}

function writeUInt16(buf, offset, value) {
  buf[offset] = (value >> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

function readUInt16(buf, offset) {
  return (buf[offset] << 8) | buf[offset + 1];
}

/* =========================
   BUILD COMMAND PACKETS
========================= */

async function buildSetFreqSecure(params) {
  const payload = Buffer.alloc(6);
  payload[0] = params.groupId;
  writeUInt16(payload, 1, params.freqMHz);
  payload[3] = params.bandwidth;
  payload[4] = params.txPower;
  payload[5] = params.keyId;

  return buildPacket(0x11, params.deviceId || 1, payload);
}

async function buildRebootSecure(params) {
  const payload = Buffer.alloc(2);
  payload[0] = params.delay;
  payload[1] = params.keyId;

  return buildPacket(0x12, params.deviceId || 1, payload);
}

/* =========================
   BUILD GENERIC PACKET
========================= */

function buildPacket(cmdId, deviceId, payload) {
  const header = Buffer.alloc(8);

  header[0] = MAGIC;
  header[1] = VERSION;
  header[2] = cmdId;
  header[3] = 0x00; // FLAGS

  writeUInt16(header, 4, deviceId);
  writeUInt16(header, 6, payload.length);

  const raw = Buffer.concat([header, payload]);
  const mac = hmac(raw);

  return new Uint8Array(Buffer.concat([raw, mac]));
}

/* =========================
   PARSE ACK
========================= */

function parseAck(buf) {
  const b = Buffer.from(buf);

  if (b[0] !== MAGIC) throw new Error("Invalid MAGIC");
  if (b[1] !== VERSION) throw new Error("Invalid VERSION");

  const ackId = b[2];
  const status = b[3];
  const deviceId = readUInt16(b, 4);
  const commandId = b[6];
  const execTime = readUInt16(b, 7);
  const errorCode = b[9];

  return {
    ackId,
    status,
    deviceId,
    commandId,
    executionTime: execTime,
    errorCode
  };
}

module.exports = {
  buildSetFreqSecure,
  buildRebootSecure,
  parseAck
};
