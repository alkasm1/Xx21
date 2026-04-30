// gateway/pending_commands.js

const pending = new Map();
/*
 key = deviceId:commandId
 value = {
   deviceId,
   commandId,
   jobId,
   retries,
   maxRetries,
   timeout,
   timer,
   payloadBuilder,
   sendFn,
   createdAt
 }
*/

function makeKey(deviceId, commandId) {
  return `${deviceId}:${commandId}`;
}

function add(entry) {
  const key = makeKey(entry.deviceId, entry.commandId);
  pending.set(key, entry);
}

function get(deviceId, commandId) {
  return pending.get(makeKey(deviceId, commandId));
}

function remove(deviceId, commandId) {
  pending.delete(makeKey(deviceId, commandId));
}

function list() {
  return Array.from(pending.values());
}

module.exports = {
  add,
  get,
  remove,
  list
};
