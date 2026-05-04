// backend/gateway/storage.js

const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "state.json");

// -----------------------------
// Save State
// -----------------------------
function saveState(pendingRequests, broadcastRequests) {
  try {
    const data = {
      pendingRequests: serializePending(pendingRequests),
      broadcastRequests
    };

    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("❌ Failed to save state:", e);
  }
}

// -----------------------------
// Load State
// -----------------------------
function loadState() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return { pendingRequests: {}, broadcastRequests: {} };
    }

    const raw = fs.readFileSync(FILE_PATH);
    const data = JSON.parse(raw);

    return {
      pendingRequests: data.pendingRequests || {},
      broadcastRequests: data.broadcastRequests || {}
    };

  } catch (e) {
    console.error("❌ Failed to load state:", e);
    return { pendingRequests: {}, broadcastRequests: {} };
  }
}

// -----------------------------
// Remove runtime fields
// -----------------------------
function serializePending(pending) {
  const clean = {};

  Object.keys(pending).forEach((id) => {
    const r = pending[id];

    clean[id] = {
      requestId: r.requestId,
      deviceId: r.deviceId,
      commandId: r.commandId,
      meta: r.meta,
      broadcastId: r.broadcastId,
      retries: r.retries,
      state: r.state
    };
  });

  return clean;
}

module.exports = {
  saveState,
  loadState
};
