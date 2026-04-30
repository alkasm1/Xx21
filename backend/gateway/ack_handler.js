// gateway/ack_handler.js

const ACL_SECURE = require("../../src/acl/alm_acl_secure"); // عدّل المسار حسب ملفك
const eventBus = require("./event_bus");
const registry = require("./device_registry");
const retry = require("./retry_engine");
const { broadcastJobs } = require("./broadcast_jobs");

function handlePacket(msg, rinfo) {
  try {
    const ack = ACL_SECURE.parseAck(msg);

    eventBus.emit("device.ack", ack);

    registry.updateDevice(ack, rinfo);

    retry.handleAck(ack);

    // ربط ACK بالـJob (OK / FAIL)
    // نفترض أن status === 0 → OK
    // لو تحتاج ربط أدق استخدم pending entry كما فعلت سابقًا
    // هنا نكتفي بالـeventBus + retry_engine + broadcastJobs
  } catch (e) {
    // ليس ACK صالح
  }
}

module.exports = handlePacket;
