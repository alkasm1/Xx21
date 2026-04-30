// src/alm_kernel.js
//
// ALM Kernel (wrap/unwrap)
// Minimal stable version
//

function wrap(payload) {
  if (!(payload instanceof Uint8Array)) {
    throw new Error("ALM.wrap expects Uint8Array");
  }
  return payload;
}

function unwrap(packet) {
  if (!(packet instanceof Uint8Array)) {
    throw new Error("ALM.unwrap expects Uint8Array");
  }
  return packet;
}

module.exports = {
  wrap,
  unwrap
};
