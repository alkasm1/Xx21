// frontend/ws_client.js

function connectWS(onMessage) {
  const statusEl = document.getElementById("wsStatus");

  const ws = new WebSocket(`ws://${location.hostname}:5001`);

  ws.onopen = () => {
    if (statusEl) statusEl.textContent = "WS: ✅ Connected";
  };

  ws.onerror = () => {
    if (statusEl) statusEl.textContent = "WS: ❌ Error";
  };

  ws.onclose = () => {
    if (statusEl) statusEl.textContent = "WS: ⚠️ Closed";
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onMessage(data);
    } catch (err) {
      console.error("WS parse error:", err);
    }
  };

  return ws; // ← مهم جدًا
}

export { connectWS };
