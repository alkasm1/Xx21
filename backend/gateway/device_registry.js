// gateway/device_registry.js

const devices = new Map(); // deviceId -> device info

// 🔥 هذه الدالة هي التي يستدعيها gateway.js
function update(deviceId, info) {
  devices.set(deviceId, {
    ...info,
    deviceId,
    lastSeen: Date.now()
  });
}

// 🔥 هذه الدالة تُستخدم فقط للـACK (احتفظنا بها)
function updateDevice(ack, rinfo) {
  const now = Date.now();

  devices.set(ack.deviceId, {
    deviceId: ack.deviceId,
    lastSeen: now,
    lastCommand: ack.commandId,
    status: ack.status === 0 ? "OK" : "FAIL",
    executionTime: ack.executionTime,
    errorCode: ack.errorCode,
    ip: rinfo.address,
    port: rinfo.port
  });
}

function markOffline(timeout = 5000) {
  const now = Date.now();

  for (const dev of devices.values()) {
    if (now - dev.lastSeen > timeout) {
      dev.status = "OFFLINE";
    }
  }
}

function getAll() {
  return Array.from(devices.values());
}

function get(deviceId) {
  return devices.get(deviceId);
}

function getStats() {
  let online = 0;
  let offline = 0;
  const now = Date.now();

  for (const dev of devices.values()) {
    if (now - dev.lastSeen < 10000 && dev.status !== "OFFLINE") {
      online++;
    } else {
      offline++;
    }
  }

  return { online, offline };
}

module.exports = {
  update,        // ← 🔥 هذه هي الدالة التي كانت ناقصة
  updateDevice,
  markOffline,
  getAll,
  get,
  getStats
};
