'use strict';
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const fs = require('fs');

const apiRoutes = require('./routes/api.js');

const app = express();

/* ======================== Seguridad (FCC checks) ======================== */
// Solo iframes del mismo origen (SAMEORIGIN)
app.use(helmet.frameguard({ action: 'sameorigin' }));
// Deshabilitar DNS prefetch
app.use(helmet.dnsPrefetchControl({ allow: false }));
// Enviar referrer solo a páginas propias
app.use(helmet.referrerPolicy({ policy: 'same-origin' }));

// Es útil no cachear en los tests
app.disable('etag');
app.use((_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
/* ====================================================================== */

app.use(cors());
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ======================== Mongo opcional ======================== */
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[BOOT] Mongo connected'))
    .catch(err => console.error('[BOOT] Mongo error:', err.message));
} else {
  console.log('[BOOT] Mongo disabled (using in-memory store)');
}
/* ================================================================ */

/* ======================== Utilitarios para Render ======================== */
app.get('/_api/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/_api/app-info', (_req, res) => {
  res.json({
    headers: {
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'x-frame-options': 'SAMEORIGIN',
      'cache-control': 'no-store'
    }
  });
});

/* 
 * Ejecutar mocha bajo demanda (como hicimos en el proyecto anterior).
 * No interfiere con los archivos de FCC (fcctesting.js / test-runner.js).
 */
let running = false;
app.get('/_api/get-tests', async (_req, res) => {
  try {
    if (running) return res.json({ status: 'running' });

    const testsFile = path.join(__dirname, 'tests', '2_functional-tests.js');
    if (!fs.existsSync(testsFile)) {
      return res.status(500).json({ status: 'error', error: 'Tests file not found' });
    }

    running = true;
    const Mocha = require('mocha');
    const mocha = new Mocha({ timeout: 20000, color: false });

    delete require.cache[require.resolve(testsFile)];
    mocha.addFile(testsFile);

    const results = [];
    const runner = mocha.run(() => { running = false; });

    runner.on('pass', t => results.push({
      title: t.title, fullTitle: t.fullTitle(), state: 'passed', duration: t.duration
    }));
    runner.on('fail', (t, err) => results.push({
      title: t.title, fullTitle: t.fullTitle(), state: 'failed', err: err?.message || String(err)
    }));
    runner.on('end', () => res.json({
      status: 'finished',
      stats: runner.stats,
      tests: results
    }));
  } catch (e) {
    running = false;
    console.error('[get-tests] error', e);
    res.status(500).json({ status: 'error', error: e.message || String(e) });
  }
});
/* ======================================================================== */

/* ======================== Páginas + API ======================== */
app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'views', 'index.html'));
});

app.use('/api', apiRoutes);

/* 404 */
app.use(function (_req, res) {
  res.status(404).type('text').send('Not Found');
});

/* Listener */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[BOOT] Server running on http://localhost:${PORT}`);
});

module.exports = app;
