import React from 'react';

export default function Leaderboard({ items = [] }) {
  return (
    <div style={{ background: '#fff', padding: 8, borderRadius: 8 }}>
      {items.length === 0 ? <div>No scores yet</div> : (
        <ol>
          {items.map((it, idx) => (
            <li key={idx}>
              <strong>{it.name}</strong> — {it.score}
              <div style={{ fontSize: 11, color: '#666' }}>{new Date(it.date).toLocaleString()}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
