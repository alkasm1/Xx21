// frontend/ws_client.js

export function connectWS(onMessage) {
  const ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => console.log("WS Connected");
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));

  return ws;
}
