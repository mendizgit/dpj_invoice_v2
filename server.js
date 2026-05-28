const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();

// Helmet with relaxed CSP to allow inline scripts in index.html
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],   // ← needed for inline <script> blocks
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(express.json());
app.use(express.static('public'));

// Block direct browser access to API (only allow fetch/XHR)
function apiOnly(req, res, next) {
  const accept = req.headers['accept'] || '';
  if (accept.includes('text/html')) {
    return res.status(403).json({ error: 'Direct browser access not allowed' });
  }
  next();
}

// Quotation data
app.get('/api/quotations', apiOnly, (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data/quotations.json');
    const data = fs.readFileSync(filePath, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    console.error('Error reading quotations.json:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Next ref number (peek — no increment yet)
app.get('/api/next-ref', apiOnly, (req, res) => {
  try {
    const seqPath = path.join(__dirname, 'data/sequence.json');
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm   = String(today.getMonth() + 1).padStart(2, '0');
    const dd   = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    let stored = { date: '', seq: 0 };
    try { stored = JSON.parse(fs.readFileSync(seqPath, 'utf8')); } catch (e) {}

    const nextSeq = stored.date === dateStr ? stored.seq + 1 : 1;
    const ref = `DPJ/EC/${yyyy}/${mm}${dd}-${String(nextSeq).padStart(3, '0')}`;
    res.json({ ref });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoice route
const invoiceRouter = require('./routes/invoice');
app.use('/api/invoice', invoiceRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));