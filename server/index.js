require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const PlayerSession = require('./models/PlayerSession');
const Score = require('./models/Score');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/realtime_game';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Mongo connected'))
  .catch(err => console.error('Mongo connection error', err));

// Game constants
const TICK_RATE = 20;
const WORLD_W = 800, WORLD_H = 600;

let players = {}; // keyed by socket.id
let coin = spawnCoin();

function spawnCoin() {
  return {
    x: Math.floor(Math.random() * (WORLD_W - 40)) + 20,
    y: Math.floor(Math.random() * (WORLD_H - 40)) + 20,
    radius: 10
  };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

// REST endpoint for top leaderboard (optional)
app.get('/leaderboard', async (req, res) => {
  try {
    const top = await Score.find().sort({ score: -1 }).limit(10).lean();
    res.json({ ok: true, top });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'db error' });
  }
});

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('join', async (payload) => {
    const name = payload && payload.name ? String(payload.name).slice(0, 24) : 'Anonymous';
    const sessionId = payload && payload.sessionId ? payload.sessionId : uuidv4();

    const startX = Math.random() * (WORLD_W - 40) + 20;
    const startY = Math.random() * (WORLD_H - 40) + 20;

    players[socket.id] = {
      socketId: socket.id,
      sessionId,
      name,
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      radius: 12,
      score: 0
    };

    // upsert player session
    try {
      await PlayerSession.findOneAndUpdate(
        { sessionId },
        { name, lastSeen: new Date(), score: 0 },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.warn('session db upsert error', err);
    }

    socket.emit('joined', { sessionId, world: { w: WORLD_W, h: WORLD_H }, coin });
    io.emit('playerJoined', { id: socket.id, name, x: startX, y: startY });
  });

  socket.on('input', (data) => {
    const p = players[socket.id];
    if (!p) return;
    const speed = 180; // pixels/sec
    p.vx = 0; p.vy = 0;
    if (data.left) p.vx -= speed;
    if (data.right) p.vx += speed;
    if (data.up) p.vy -= speed;
    if (data.down) p.vy += speed;
  });

  socket.on('disconnect', async () => {
    const p = players[socket.id];
    if (p) {
      try {
        await PlayerSession.findOneAndUpdate(
          { sessionId: p.sessionId },
          { lastSeen: new Date(), score: p.score, name: p.name }
        );
        await Score.create({ name: p.name, score: p.score });
      } catch (err) {
        console.warn('db save err on disconnect', err);
      }
    }
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
    console.log('client disconnected', socket.id);
  });
});

// Game loop
let lastTime = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  for (const id in players) {
    const p = players[id];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = Math.max(p.radius, Math.min(WORLD_W - p.radius, p.x));
    p.y = Math.max(p.radius, Math.min(WORLD_H - p.radius, p.y));

    if (distance(p, coin) < p.radius + coin.radius) {
      p.score += 1;
      PlayerSession.findOneAndUpdate(
        { sessionId: p.sessionId },
        { score: p.score, lastSeen: new Date(), name: p.name }
      ).catch(e => console.warn('session update err', e));
      Score.create({ name: p.name, score: p.score }).catch(() => {});
      coin = spawnCoin();
      io.emit('scoreUpdate', { id: p.socketId, score: p.score });
    }
  }

  const state = {
    players: Object.values(players).map(p => ({ id: p.socketId, x: Math.round(p.x), y: Math.round(p.y), name: p.name, score: p.score })),
    coin
  };
  io.emit('state', state);
}, 1000 / TICK_RATE);

// Periodic leaderboard broadcast
setInterval(async () => {
  try {
    const top = await Score.find().sort({ score: -1 }).limit(10).lean();
    io.emit('leaderboard', top);
  } catch (err) {
    console.warn('leaderboard err', err);
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
