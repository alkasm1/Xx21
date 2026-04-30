// gateway/retry_engine.js

const pending = require("./pending_commands");
const eventBus = require("./event_bus");
const { broadcastJobs } = require("./broadcast_jobs");

function startTracking({ deviceId, commandId, payloadBuilder, sendFn, jobId }) {
  const entry = {
    deviceId,
    commandId,
    jobId: jobId || null,
    retries: 0,
    maxRetries: 3,
    timeout: 2000,
    createdAt: Date.now(),
    payloadBuilder,
    sendFn,
    timer: null
  };

  function schedule() {
    entry.timer = setTimeout(async () => {
      entry.retries++;

      if (entry.retries > entry.maxRetries) {
        console.log(`❌ Device ${entry.deviceId} FAILED after retries`);

        pending.remove(entry.deviceId, entry.commandId);

        eventBus.emit("command.timeout", {
          deviceId: entry.deviceId,
          commandId: entry.commandId,
          jobId: entry.jobId || null
        });

        if (entry.jobId) {
          const job = broadcastJobs.get(entry.jobId);
          if (job) {
            broadcastJobs.markTIMEOUT(job, entry.deviceId);
          }
        }

        return;
      }

      console.log(`🔁 Retry ${entry.retries} → device ${entry.deviceId}`);

      const packet = await entry.payloadBuilder();
      entry.sendFn(packet);

      schedule();
    }, entry.timeout);
  }

  pending.add(entry);
  schedule();
}

function handleAck(ack) {
  const entry = pending.get(ack.deviceId, ack.commandId);
  if (!entry) return;

  clearTimeout(entry.timer);
  pending.remove(ack.deviceId, ack.commandId);
}

module.exports = {
  startTracking,
  handleAck
};
