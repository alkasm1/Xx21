// frontend/app.js

// -----------------------------
// WebSocket
// -----------------------------
const ws = new WebSocket("ws://127.0.0.1:5001");

ws.onopen = () => {
  console.log("✅ WS Connected");
  setWsStatus(true);
};

ws.onclose = () => {
  console.log("❌ WS Disconnected");
  setWsStatus(false);
};

ws.onerror = (err) => {
  console.error("WS Error:", err);
};

// -----------------------------
// Helpers
// -----------------------------
function log(msg) {
  const logs = document.getElementById("logs");
  logs.textContent += msg + "\n";
  logs.scrollTop = logs.scrollHeight;
}

function setWsStatus(connected) {
  const el = document.getElementById("wsStatus");
  if (connected) {
    el.textContent = "WS: ✅ Connected";
    el.style.background = "#0a0";
  } else {
    el.textContent = "WS: ❌ Disconnected";
    el.style.background = "#a00";
  }
}

// -----------------------------
// Core Send
// -----------------------------
function send(commandId, deviceId, params = {}) {
  const payload = {
    type: "ui.command",
    deviceId,
    commandId,
    params
  };

  console.log("📤 SEND:", payload);
  log(`📤 SEND → ${deviceId} cmd=${commandId}`);

  ws.send(JSON.stringify(payload));
}

// -----------------------------
// Device Commands (Expose globally)
// -----------------------------
window.setFreq = function (id) {
  send(17, id, {
    freqMHz: 433,
    bandwidth: 20,
    txPower: 10
  });
};

window.reboot = function (id) {
  send(18, id, { delay: 1 });
};

// -----------------------------
// Broadcast (Bind to buttons)
// -----------------------------
document.getElementById("btn-bc-setfreq").onclick = () => {
  const payload = {
    type: "ui.broadcast",
    commandId: 17,
    params: {
      freqMHz: 433,
      bandwidth: 20,
      txPower: 10
    }
  };

  console.log("📡 BROADCAST SET_FREQ");
  log("📡 BROADCAST SET_FREQ");

  ws.send(JSON.stringify(payload));
};

document.getElementById("btn-bc-reboot").onclick = () => {
  const payload = {
    type: "ui.broadcast",
    commandId: 18,
    params: { delay: 1 }
  };

  console.log("📡 BROADCAST REBOOT");
  log("📡 BROADCAST REBOOT");

  ws.send(JSON.stringify(payload));
};

// -----------------------------
// Handle Incoming Snapshots
// -----------------------------
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "snapshot") {
    renderMetrics(data.metrics);
    renderDevices(data.devices);
  }
};

// -----------------------------
// Render Metrics
// -----------------------------
function renderMetrics(metrics) {
  document.getElementById("metrics").textContent =
    JSON.stringify(metrics, null, 2);
}

// -----------------------------
// Render Devices Table
// -----------------------------
function renderDevices(devices) {
  const tbody = document.getElementById("devices");
  tbody.innerHTML = "";

  devices.forEach((d) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${d.deviceId}</td>
      <td>${d.status}</td>
      <td>${new Date(d.lastSeen).toLocaleTimeString()}</td>
      <td>-</td>
      <td>-</td>
      <td>
        <button onclick="setFreq(${d.deviceId})">Set Freq</button>
        <button onclick="reboot(${d.deviceId})">Reboot</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}
