import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Leaderboard from './Leaderboard';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export default function App() {
  const canvasRef = useRef(null);
  const socketRef = useRef(null);
  const [world, setWorld] = useState({ w: 800, h: 600 });
  const [players, setPlayers] = useState([]);
  const [coin, setCoin] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [name, setName] = useState('');
  const sessionIdRef = useRef(localStorage.getItem('sessionId') || null);

  useEffect(() => {
    const socket = io(SERVER, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { name: name || 'Player', sessionId: sessionIdRef.current });
    });

    socket.on('joined', (data) => {
      if (data.sessionId) {
        sessionIdRef.current = data.sessionId;
        localStorage.setItem('sessionId', data.sessionId);
      }
      if (data.world) setWorld(data.world);
      if (data.coin) setCoin(data.coin);
    });

    socket.on('state', (s) => {
      setPlayers(s.players);
      setCoin(s.coin);
    });

    socket.on('leaderboard', (top) => setLeaderboard(top));
    socket.on('scoreUpdate', (u) => {
      setPlayers(prev => prev.map(p => p.id === u.id ? { ...p, score: u.score } : p));
    });

    return () => socket.disconnect();
  }, []); // eslint-disable-line

  // send input to server
  useEffect(() => {
    const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                   w: 'up', s: 'down', a: 'left', d: 'right' };
    const state = { up: false, down: false, left: false, right: false };

    function emit() {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('input', state);
      }
    }
    function handler(e) {
      const k = keys[e.key];
      if (!k) return;
      const isDown = e.type === 'keydown';
      if (state[k] === isDown) return;
      state[k] = isDown;
      emit();
    }
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', handler);
    };
  }, []);

  // draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (coin) {
        ctx.beginPath();
        ctx.fillStyle = '#f59e0b';
        ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI*2);
        ctx.fill();
      }

      players.forEach(p => {
        ctx.beginPath();
        ctx.fillStyle = '#06b6d4';
        ctx.arc(p.x, p.y, 12, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${p.name} (${p.score})`, p.x + 14, p.y + 4);
      });

      requestAnimationFrame(draw);
    }
    draw();
  }, [players, coin]);

  return (
    <div style={{ display: 'flex', gap: 16, padding: 16 }}>
      <div>
        <div style={{ marginBottom: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" />
          <button onClick={() => {
            if (socketRef.current && socketRef.current.connected) {
              socketRef.current.emit('join', { name, sessionId: sessionIdRef.current });
              localStorage.setItem('sessionId', sessionIdRef.current);
            }
          }}>Set name & (re)join</button>
        </div>
        <canvas ref={canvasRef} width={world.w} height={world.h} style={{ border: '1px solid #ccc' }} />
      </div>

      <div style={{ width: 300 }}>
        <h3>Leaderboard</h3>
        <Leaderboard items={leaderboard} />
        <h4>Players (live)</h4>
        <ul>
          {players.map(p => <li key={p.id}>{p.name} — {p.score}</li>)}
        </ul>
      </div>
    </div>
  );
}
