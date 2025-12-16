const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = 4000;
const wss = new WebSocket.Server({ port: PORT }, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});

// Supported tickers and initial prices
const TICKERS = {
  GOOG: 1500,
  TSLA: 700,
  AMZN: 3300,
  META: 300,
  NVDA: 400
};

// Copy into mutable prices
let prices = {};
for (const key of Object.keys(TICKERS)) {
  prices[key] = TICKERS[key];
}

// Store connected clients
const clients = new Map(); // ws -> { id, email, subscriptions: Set }

function randomWalk(oldPrice) {
  const change = (Math.random() - 0.5) * 0.01; // -0.5% to +0.5%
  return +(oldPrice * (1 + change)).toFixed(2);
}

// Update prices every second
setInterval(() => {
  // Update all global prices
  for (const ticker of Object.keys(prices)) {
    prices[ticker] = randomWalk(prices[ticker]);
  }

  // Send updates only to each client's subscribed tickers
  for (const [ws, meta] of clients.entries()) {
    if (ws.readyState !== WebSocket.OPEN) continue;

    const subs = Array.from(meta.subscriptions);
    const update = {};

    subs.forEach(t => {
      if (prices[t] !== undefined) {
        update[t] = prices[t];
      }
    });

    if (Object.keys(update).length > 0) {
      ws.send(JSON.stringify({
        type: 'prices',
        prices: update,
        timestamp: Date.now()
      }));
    }
  }
}, 1000);

// Handle new connections
wss.on('connection', (ws) => {
  const id = uuidv4();
  clients.set(ws, { id, email: null, subscriptions: new Set() });

  console.log(`Client connected: ${id}`);

  // Send initial supported tickers
  ws.send(JSON.stringify({
    type: 'welcome',
    id,
    supported: Object.keys(TICKERS)
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      const meta = clients.get(ws);

      // Handle login
      if (msg.type === 'login') {
        meta.email = msg.email;
        ws.send(JSON.stringify({ type: 'login_ack', email: meta.email }));
      }

      // Handle subscribe
      if (msg.type === 'subscribe') {
        meta.subscriptions = new Set(msg.tickers);
        ws.send(JSON.stringify({
          type: 'sub_ack',
          tickers: Array.from(meta.subscriptions)
        }));
      }

    } catch (err) {
      console.error('Invalid message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${clients.get(ws)?.id}`);
    clients.delete(ws);
  });
});
