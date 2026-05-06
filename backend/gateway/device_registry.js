// backend/gateway/device_registry.js

class DeviceRegistry {
  constructor() {
    this.devices = {};
  }

  update(deviceId, data) {
    this.devices[deviceId] = {
      ...this.devices[deviceId],
      ...data
    };
  }

  get(deviceId) {
    return this.devices[deviceId];
  }

  getAll() {
    return Object.values(this.devices);
  }

  getStats() {
    let online = 0;
    let offline = 0;

    Object.values(this.devices).forEach(d => {
      if (d.status === "online") online++;
      else offline++;
    });

    return { online, offline };
  }
}

// ✅ إنشاء instance قبل الاستخدام
const registry = new DeviceRegistry();

// ✅ إضافة جهاز SSH تجريبي (اختياري)
registry.update("router-1", {
  deviceId: "router-1",
  ip: "192.168.88.232",   // 
  port: 22,
  username: "admin",
  password: "1234",
  method: "ssh",
  status: "online",
  lastSeen: Date.now()
});

// ✅ تصدير instance
module.exports = registry;
