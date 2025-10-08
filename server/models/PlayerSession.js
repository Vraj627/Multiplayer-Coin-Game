const mongoose = require('mongoose');

const PlayerSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  name: String,
  lastSeen: Date,
  score: { type: Number, default: 0 }
});

module.exports = mongoose.model('PlayerSession', PlayerSessionSchema);
