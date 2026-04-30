// gateway/broadcast_engine.js

const { groupRegistry } = require("./group_registry");
const registry = require("./device_registry");
const { dispatchCommand } = require("./command_dispatcher");
const eventBus = require("./event_bus");
const { broadcastJobs } = require("./broadcast_jobs");

async function broadcastToGroup({ groupId, commandId, build, udp }) {
  const deviceIds = groupRegistry.get(groupId);

  if (!deviceIds.length) {
    console.log("⚠ No devices in group:", groupId);
    return;
  }

  const job = broadcastJobs.create({
    groupId,
    commandId,
    deviceIds
  });

  console.log(`📡 Broadcast → Group ${groupId} (${deviceIds.length} devices), Job ${job.jobId}`);

  deviceIds.forEach((deviceId) => {
    const device = registry.get(deviceId);
    if (!device) return;

    dispatchCommand(udp, {
      deviceId,
      ip: device.ip,
      port: device.port,
      commandId,
      build,
      meta: { jobId: job.jobId }
    });
  });

  eventBus.emit("broadcast.sent", {
    groupId,
    count: deviceIds.length,
    commandId,
    jobId: job.jobId
  });
}

module.exports = { broadcastToGroup };
