require('dotenv').config();

const path = require('path');
const express = require('express');

require('./db/init');

const authRoutes  = require('./routes/auth');
const cardsRoutes = require('./routes/cards');
const decksRoutes = require('./routes/decks');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

app.use(express.json({ limit: '1mb' }));

app.use('/api/auth',  authRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/decks', decksRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(express.static(PUBLIC_DIR));

// SPA fallback for any non-API path.
app.get(/^(?!\/api).+/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`CZN Deck Builder listening on http://localhost:${PORT}`);
});
