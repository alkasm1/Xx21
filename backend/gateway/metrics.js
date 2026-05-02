// backend/gateway/metrics.js

class Metrics {
  constructor(eventBus, registry) {
    this.registry = registry;

    this.commands_sent = 0;
    this.commands_ok = 0;
    this.commands_fail = 0;
    this.timeouts = 0;

    this.execTimes = {}; // commandId -> [times]

    // Events
    eventBus.on("command.sent", ({ commandId }) => {
      this.commands_sent++;
    });

    eventBus.on("device.ack", ({ commandId, execMs }) => {
      this.commands_ok++;

      if (!this.execTimes[commandId]) {
        this.execTimes[commandId] = [];
      }

      this.execTimes[commandId].push(execMs || 0);
    });

    eventBus.on("command.timeout", () => {
      this.timeouts++;
    });
  }

  _avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  snapshot() {
    const avgexecms = {};

    for (const cmd in this.execTimes) {
      avgexecms[cmd] = this._avg(this.execTimes[cmd]);
    }

    const { online, offline } = this.registry.getStats();

    return {
      commands_sent: this.commands_sent,
      commands_ok: this.commands_ok,
      commands_fail: this.commands_fail,
      timeouts: this.timeouts,
      avgexecms,
      devices_online: online,
      devices_off: offline
    };
  }
}

module.exports = Metrics;
