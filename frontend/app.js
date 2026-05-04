const ws = new WebSocket("ws://localhost:5001");

const metricsEl = document.getElementById("metrics");
const devicesEl = document.getElementById("devices");
const logsEl = document.getElementById("logs");
const statusEl = document.getElementById("wsStatus");

let devicesMap = {};

// -----------------------------
// WS Status
// -----------------------------
ws.onopen = () => {
  statusEl.textContent = "WS: ✅ Connected";
};

ws.onclose = () => {
  statusEl.textContent = "WS: ❌ Disconnected";
};

// -----------------------------
// Message Handler
// -----------------------------
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  // -----------------------------
  // Snapshot
  // -----------------------------
  if (msg.type === "snapshot") {
    renderMetrics(msg.metrics);
    renderDevices(msg.devices);
  }

  // -----------------------------
  // Command Sent
  // -----------------------------
  if (msg.type === "cmd_sent") {
    addLog(`📤 cmd=${msg.commandId} → ${msg.deviceId}`);
  }

  // -----------------------------
  // Command Completed
  // -----------------------------
  if (msg.type === "cmd_completed") {
    addLog(`✅ cmd=${msg.commandId} → ${msg.deviceId} (${msg.execMs}ms)`);

    updateDevice(msg.deviceId, {
      lastCmd: msg.commandId,
      execTime: msg.execMs
    });
  }

  // -----------------------------
  // Command Failed
  // -----------------------------
  if (msg.type === "cmd_failed") {
    addLog(`❌ cmd=${msg.commandId} → ${msg.deviceId}`);
  }

  // -----------------------------
  // Broadcast Done
  // -----------------------------
  if (msg.type === "broadcast_done") {
    addLog(`📡 broadcast ${msg.broadcastId} → ${msg.status}`);
  }
};

// -----------------------------
// Render Metrics
// -----------------------------
function renderMetrics(metrics) {
  metricsEl.textContent = JSON.stringify(metrics, null, 2);
}

// -----------------------------
// Render Devices
// -----------------------------
function renderDevices(devices) {
  devicesEl.innerHTML = "";

  devices.forEach(d => {
    devicesMap[d.deviceId] = d;

    const row = document.createElement("tr");
    row.setAttribute("data-id", d.deviceId);

    row.innerHTML = `
      <td>${d.deviceId}</td>
      <td>${d.status}</td>
      <td>${new Date(d.lastSeen).toLocaleTimeString()}</td>
      <td class="lastCmd">-</td>
      <td class="execTime">-</td>
      <td>
        <button onclick="sendCmd(${d.deviceId},17)">SetFreq</button>
        <button onclick="sendCmd(${d.deviceId},18)">Reboot</button>
      </td>
    `;

    devicesEl.appendChild(row);
  });
}

// -----------------------------
// Update Device Row
// -----------------------------
function updateDevice(deviceId, data) {
  const row = document.querySelector(`[data-id="${deviceId}"]`);
  if (!row) return;

  if (data.lastCmd !== undefined) {
    row.querySelector(".lastCmd").textContent = data.lastCmd;
  }

  if (data.execTime !== undefined) {
    row.querySelector(".execTime").textContent = data.execTime + " ms";
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
// Commands
// -----------------------------
function sendCmd(deviceId, commandId) {
  ws.send(JSON.stringify({
    type: "ui.command",
    deviceId,
    commandId
  }));
}

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
