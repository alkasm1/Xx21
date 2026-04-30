// gateway/command_dispatcher.js

const eventBus = require("./event_bus");
const retry = require("./retry_engine");
const ACL_SECURE = require("../../src/acl/alm_acl_secure"); // عدّل المسار حسب اسم ملفك الفعلي

async function dispatchCommand(udp, { deviceId, ip, port, commandId, build, meta }) {
  const payloadBuilder = async () => {
    return await build();
  };

  const packet = await payloadBuilder();

  udp.send(packet, port, ip);

  eventBus.emit("command.sent", {
    deviceId,
    commandId,
    meta: meta || null
  });

  retry.startTracking({
    deviceId,
    commandId,
    payloadBuilder,
    sendFn: (pkt) => udp.send(pkt, port, ip),
    jobId: meta?.jobId || null
  });
}

function buildSetFreq(params) {
  return ACL_SECURE.buildSetFreqSecure(params);
}

function buildReboot(params) {
  return ACL_SECURE.buildRebootSecure(params);
}

module.exports = {
  dispatchCommand,
  buildSetFreq,
  buildReboot
};
