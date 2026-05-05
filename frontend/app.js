// frontend/app.js

const ws = new WebSocket("ws://localhost:5001");

// -----------------------------
// UI Elements
// -----------------------------
const wsStatus = document.getElementById("wsStatus");
const metricsEl = document.getElementById("metrics");
const devicesEl = document.getElementById("devices");
const logsEl = document.getElementById("logs");
const broadcastsEl = document.getElementById("broadcasts"); // NEW

// -----------------------------
// Local State
// -----------------------------
let devicesMap = {};   
let metricsState = {
  commands_ok: 0,
  commands_fail: 0
};

// -----------------------------
// WebSocket Lifecycle
// -----------------------------
ws.onopen = () => {
  wsStatus.textContent = "WS: ✅ Connected";
  wsStatus.style.background = "#0a0";
};

ws.onclose = () => {
  wsStatus.textContent = "WS: ❌ Disconnected";
  wsStatus.style.background = "#a00";
};

// -----------------------------
// WebSocket Messages
// -----------------------------
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  // =============================
  // SNAPSHOT (كل 2 ثانية)
  // =============================
  if (msg.type === "snapshot") {
    renderMetrics(msg.metrics);
    renderDevices(msg.devices);

    // NEW: عرض broadcast في الواجهة
    broadcastsEl.textContent = JSON.stringify(msg.broadcasts, null, 2);
  }

  // =============================
  // COMMAND COMPLETED
  // =============================
  if (msg.type === "cmd_completed") {
    metricsState.commands_ok++;

    updateDevice(msg.deviceId, {
      lastCmd: msg.commandId,
      execMs: msg.execMs
    });

    addLog(`✅ ACK cmd=${msg.commandId} dev=${msg.deviceId} (${msg.execMs}ms)`);
  }

  // =============================
  // COMMAND FAILED
  // =============================
  if (msg.type === "cmd_failed") {
    metricsState.commands_fail++;

    addLog(`❌ FAILED cmd=${msg.commandId} dev=${msg.deviceId}`);
  }

  // =============================
  // BROADCAST DONE (NEW)
  // =============================
  if (msg.type === "broadcast_done") {
    addLog(`📡 BROADCAST ${msg.broadcastId} → ${msg.status}`);
  }
};

// -----------------------------
// Render Metrics
// -----------------------------
function renderMetrics(metrics) {
  metricsEl.textContent = JSON.stringify(metrics, null, 2);
}

// -----------------------------
// Render Devices Table
// -----------------------------
function renderDevices(devices) {
  devicesEl.innerHTML = "";

  devices.forEach(d => {
    devicesMap[d.deviceId] = devicesMap[d.deviceId] || {};

    const tr = document.createElement("tr");
    tr.setAttribute("data-id", d.deviceId);

    tr.innerHTML = `
      <td>${d.deviceId}</td>
      <td>${d.status}</td>
      <td>${new Date(d.lastSeen).toLocaleTimeString()}</td>
      <td class="lastCmd">${devicesMap[d.deviceId].lastCmd || "-"}</td>
      <td class="execMs">${devicesMap[d.deviceId].execMs || "-"}</td>
      <td>
        <button onclick="sendCmd(${d.deviceId},17)">SetFreq</button>
        <button onclick="sendCmd(${d.deviceId},18)">Reboot</button>
      </td>
    `;

    devicesEl.appendChild(tr);
  });
}

// -----------------------------
// Update Device Row (Realtime)
// -----------------------------
function updateDevice(deviceId, data) {
  devicesMap[deviceId] = {
    ...devicesMap[deviceId],
    ...data
  };

  const row = document.querySelector(`[data-id="${deviceId}"]`);
  if (!row) return;

  if (data.lastCmd !== undefined) {
    row.querySelector(".lastCmd").textContent = data.lastCmd;
  }

  if (data.execMs !== undefined) {
    row.querySelector(".execMs").textContent = data.execMs + " ms";
  }
}

// -----------------------------
// Logs
// -----------------------------
function addLog(text) {
  logsEl.textContent += text + "\n";
  logsEl.scrollTop = logsEl.scrollHeight;
}

// -----------------------------
// Send Commands
// -----------------------------
window.sendCmd = function (deviceId, commandId) {
  ws.send(JSON.stringify({
    type: "ui.command",
    deviceId,
    commandId
  }));
};

// -----------------------------
// Broadcast Buttons
// -----------------------------
document.getElementById("btn-bc-setfreq").onclick = () => {
  ws.send(JSON.stringify({
    type: "ui.broadcast",
    commandId: 17
  }));
};

document.getElementById("btn-bc-reboot").onclick = () => {
  ws.send(JSON.stringify({
    type: "ui.broadcast",
    commandId: 18
  }));
};
