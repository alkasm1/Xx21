// gateway/group_registry.js

class GroupRegistry {
  constructor() {
    this.groups = new Map(); // groupId -> Set(deviceId)
  }

  add(groupId, deviceId) {
    if (!this.groups.has(groupId)) {
      this.groups.set(groupId, new Set());
    }
    this.groups.get(groupId).add(deviceId);
  }

  remove(groupId, deviceId) {
    const g = this.groups.get(groupId);
    if (!g) return;
    g.delete(deviceId);
  }

  get(groupId) {
    return Array.from(this.groups.get(groupId) || []);
  }

  getAll() {
    const out = {};
    this.groups.forEach((set, id) => {
      out[id] = Array.from(set);
    });
    return out;
  }
}

const groupRegistry = new GroupRegistry();

module.exports = { groupRegistry };
