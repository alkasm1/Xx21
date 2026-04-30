// frontend/app.js

const ws = new WebSocket("ws://localhost:8080");

const metricsEl = document.getElementById("metrics");
const devicesEl = document.getElementById("devices");
const logsEl = document.getElementById("logs");

function log(msg) {
  logsEl.textContent += msg + "\n";
  logsEl.scrollTop = logsEl.scrollHeight;
}

function renderDevices(devices) {
  devicesEl.innerHTML = "";

  devices.forEach(d => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${d.deviceId}</td>
      <td>${d.status}</td>
      <td>${new Date(d.lastSeen).toLocaleTimeString()}</td>
      <td>${d.lastCommand}</td>
      <td>${d.executionTime}</td>
    `;

    devicesEl.appendChild(row);
  });
}

ws.onopen = () => {
  log("🟢 Connected to Gateway");
};

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === "snapshot") {
    metricsEl.textContent = JSON.stringify(msg.metrics, null, 2);
    renderDevices(msg.devices);
  }

  if (msg.type === "ack") {
    log("✅ ACK " + JSON.stringify(msg.data));
  }

  if (msg.type === "timeout") {
    log("⏱ TIMEOUT " + JSON.stringify(msg.data));
  }

  if (msg.type === "command") {
    log("📤 SENT " + JSON.stringify(msg.data));
  }

  if (msg.type === "job.created") {
    log(`📡 Job started: ${msg.job.jobId}`);
  }

  if (msg.type === "job.update") {
    const j = msg.job;
    log(`📊 Job ${j.jobId}: OK=${j.ok} FAIL=${j.fail} TIMEOUT=${j.timeout}`);
  }

  if (msg.type === "job.done") {
    log(`✅ Job ${msg.job.jobId} DONE`);
  }
};

/* =========================
   SEND COMMANDS (UNICAST)
========================= */

function sendCommand(cmd) {
  ws.send(JSON.stringify({
    type: "command",
    ...cmd
  }));
}

window.sendSetFreq = function () {
  const deviceId = prompt("Device ID:");
  if (!deviceId) return;

  sendCommand({
    command: "SET_FREQ",
    deviceId: Number(deviceId),
    params: {
      freqMHz: 5805,
      bandwidth: 40,
      txPower: 20
    }
  });
};

window.sendReboot = function () {
  const deviceId = prompt("Device ID:");
  if (!deviceId) return;

  sendCommand({
    command: "REBOOT",
    deviceId: Number(deviceId),
    params: { delay: 2 }
  });
};

/* =========================
   BROADCAST COMMANDS
========================= */

function sendBroadcast(cmd) {
  ws.send(JSON.stringify({
    type: "broadcast",
    ...cmd
  }));
}

window.broadcastSetFreq = function () {
  const groupId = prompt("Group ID:");
  if (!groupId) return;

  sendBroadcast({
    command: "SET_FREQ",
    groupId: Number(groupId),
    params: {
      freqMHz: 5805,
      bandwidth: 40,
      txPower: 20
    }
  });
};

window.broadcastReboot = function () {
  const groupId = prompt("Group ID:");
  if (!groupId) return;

  sendBroadcast({
    command: "REBOOT",
    groupId: Number(groupId),
    params: { delay: 2 }
  });
};
