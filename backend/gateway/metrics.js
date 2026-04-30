// gateway/metrics.js

class Metrics {
  constructor(eventBus, registry) {
    this.bus = eventBus;
    this.registry = registry;

    this.reset();

    this._bindEvents();
    this._startReporter();
  }

  reset() {
    this.commandsSent = 0;
    this.commandsOK = 0;
    this.commandsFail = 0;
    this.timeouts = 0;

    this.execTimes = new Map(); // commandId -> [times]
  }

  _bindEvents() {
    this.bus.on("command.sent", () => {
      this.commandsSent++;
    });

    this.bus.on("device.ack", (ack) => {
      if (ack.status === 0) {
        this.commandsOK++;
      } else {
        this.commandsFail++;
      }

      if (!this.execTimes.has(ack.commandId)) {
        this.execTimes.set(ack.commandId, []);
      }
      this.execTimes.get(ack.commandId).push(ack.executionTime || 0);
    });

    this.bus.on("command.timeout", () => {
      this.timeouts++;
    });
  }

  _avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  snapshot() {
    const avgExec = {};

    for (const [cmdId, arr] of this.execTimes.entries()) {
      avgExec[cmdId] = this._avg(arr).toFixed(2);
    }

    const stats = this.registry.getStats();

    return {
      commands_sent: this.commandsSent,
      commands_ok: this.commandsOK,
      commands_fail: this.commandsFail,
      timeouts: this.timeouts,
      avg_exec_ms: avgExec,
      devices_online: stats.online,
      devices_offline: stats.offline
    };
  }

  _startReporter() {
    setInterval(() => {
      const s = this.snapshot();

      console.log("\n📊 METRICS");
      console.log("commands_sent: ", s.commands_sent);
      console.log("commands_ok:   ", s.commands_ok);
      console.log("commands_fail: ", s.commands_fail);
      console.log("timeouts:      ", s.timeouts);
      console.log("devices_online:", s.devices_online);
      console.log("devices_off:   ", s.devices_offline);
      console.log("avg_exec_ms:", s.avg_exec_ms);
    }, 5000);
  }
}

module.exports = Metrics;
