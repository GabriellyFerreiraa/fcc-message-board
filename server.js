'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');

const apiRoutes = require('./routes/api.js');        // tus endpoints del board (boilerplate)
const app = express();

/* =======================
   Seguridad pedida por FCC
   ======================= */
// 2) Solo permitir que tu sitio se cargue en iFrame en tus propias páginas
app.use(helmet.frameguard({ action: 'sameorigin' }));   // X-Frame-Options: SAMEORIGIN

// 3) No permitir DNS prefetching
app.use(helmet.dnsPrefetchControl({ allow: false }));   // X-DNS-Prefetch-Control: off

// 4) Solo enviar el referrer para tus propias páginas
app.use(helmet.referrerPolicy({ policy: 'same-origin' })); // Referrer-Policy: same-origin

// (opcionales útiles)
app.use(helmet.hidePoweredBy());
app.use(helmet.noSniff());

/* ===============
   App base
   =============== */
app.use(cors({ origin: '*' })); // para pruebas FCC
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Index
app.route('/').get((_req, res) => {
  res.sendFile(path.join(process.cwd(), 'views', 'index.html'));
});

// Rutas del proyecto (threads/replies)
apiRoutes(app);

/* ==========================
   Endpoints utilitarios _api
   ========================== */

// Ping (rápido)
app.get('/_api/ping', (_req, res) => {
  res.type('text/plain').send('pong');
});

// Devolver cabeceras de seguridad efectivas
app.get('/_api/app-info', (req, res) => {
  res.json({ headers: res.getHeaders() });
});

/* -------- Mocha bajo demanda: /_api/get-tests --------
   Ejecuta tests/2_functional-tests.js y devuelve resultados.
   Evita concurrencia entre ejecuciones.
------------------------------------------------------- */
let testing = false;

app.get('/_api/get-tests', async (_req, res) => {
  try {
    if (testing) return res.json({ status: 'running' });

    const testsFile = path.join(__dirname, 'tests', '2_functional-tests.js');
    if (!fs.existsSync(testsFile)) {
      return res.status(500).json({ status: 'error', error: 'Tests file not found' });
    }

    testing = true;

    const Mocha = require('mocha');
    const mocha = new Mocha({ timeout: 20000, color: false });

    // limpiar caché y cargar archivo
    delete require.cache[require.resolve(testsFile)];
    mocha.addFile(testsFile);

    const results = [];
    const runner = mocha.run(() => { testing = false; });

    runner.on('pass', test => {
      results.push({
        title: test.title,
        fullTitle: test.fullTitle(),
        state: 'passed',
        duration: test.duration
      });
    });

    runner.on('fail', (test, err) => {
      results.push({
        title: test.title,
        fullTitle: test.fullTitle(),
        state: 'failed',
        err: (err && (err.message || String(err))) || 'Unknown error'
      });
    });

    runner.on('end', () => {
      res.json({
        status: 'finished',
        stats: {
          tests: runner.stats.tests,
          passes: runner.stats.passes,
          failures: runner.stats.failures,
          duration: runner.stats.duration
        },
        tests: results
      });
    });
  } catch (e) {
    testing = false;
    res.status(500).json({ status: 'error', error: e.message || String(e) });
  }
});

/* 404 */
app.use((_req, res) => res.status(404).type('text').send('Not Found'));

/* Listener */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('[BOOT] Listening on port', PORT);
});

module.exports = app; // para chai-http
