const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { initDB, saveDB } = require('./db');

const app = express();
const PORT = 3001;
const JWT_SECRET = 'vulnforge-secret-key-2024';

let db;

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());



// Helper: run a query and return all rows
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: get single row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

// Helper: run a statement
function run(sql, params = []) {
  db.run(sql, params);
  saveDB();
  return { changes: db.getRowsModified() };
}

// ==================== AUTH ROUTES ====================

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });

  const existing = get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
  if (existing) return res.status(409).json({ error: 'User already exists' });

  run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
  res.json({ success: true, message: 'Registered successfully' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

// ==================== DEBUG / MISCONFIG ====================
app.get('/api/debug', (req, res) => {
  const tables = all("SELECT name FROM sqlite_master WHERE type='table'");
  const users = all('SELECT id, username, email, password, role FROM users');
  res.json({
    environment: process.env.NODE_ENV || 'development',
    server_uptime: process.uptime(),
    node_version: process.version,
    platform: process.platform,
    memory_usage: process.memoryUsage(),
    env_vars: {
      NODE_ENV: 'development',
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_NAME: 'vulnforge_prod',
      DB_USER: 'root',
      DB_PASSWORD: 'S3cur3D4t4b4s3!',
      AWS_ACCESS_KEY_ID: 'AKIAIOSFODNN7EXAMPLE',
      AWS_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      AWS_REGION: 'us-east-1',
      S3_BUCKET: 'vulnforge-prod-data',
      JWT_SECRET: 'vulnforge-secret-key-2024',
      API_REDIS_URL: 'redis://:r3d1sP@ss@10.0.0.10:6379'
    },
    database: { tables },
    users,
    server_uptime: process.uptime()
  });
});

// ==================== USERS / ACCESS CONTROL ====================
app.get('/api/user/:id', (req, res) => {
  const user = get('SELECT id, username, email, password, role FROM users WHERE id = ?', [req.params.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

app.get('/api/user/:id/notes', (req, res) => {
  const notes = all('SELECT * FROM notes WHERE user_id = ?', [req.params.id]);
  res.json(notes);
});

// ==================== SEARCH / SQLI ====================
app.get('/api/search', (req, res) => {
  const query_param = req.query.q || '';
  try {
    const sql = `SELECT id, name, price, description FROM products WHERE name LIKE '%${query_param}%' OR description LIKE '%${query_param}%'`;
    const results = all(sql);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TRANSFER / INSECURE DESIGN ====================
app.post('/api/transfer', (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;
  const from = get('SELECT * FROM accounts WHERE account_number = ?', [fromAccount]);
  const to = get('SELECT * FROM accounts WHERE account_number = ?', [toAccount]);
  if (!from || !to) return res.status(404).json({ error: 'Account not found' });

  run('UPDATE accounts SET balance = balance - ? WHERE account_number = ?', [amount, fromAccount]);
  run('UPDATE accounts SET balance = balance + ? WHERE account_number = ?', [amount, toAccount]);

  const updatedFrom = get('SELECT * FROM accounts WHERE account_number = ?', [fromAccount]);
  res.json({ success: true, fromBalance: updatedFrom.balance });
});

// ==================== XML PARSE / XXE ====================
app.post('/api/parse', (req, res) => {
  const xmlData = req.body.xml;
  if (!xmlData) return res.status(400).json({ error: 'XML data required' });

  if (xmlData.includes('<!ENTITY')) {
    const extract = xmlData.match(/file:\/\/([^"]+)/);
    if (extract) {
      // Map realistic paths to local files
      let filePath = extract[1];
      if (filePath === '/etc/shadow') filePath = path.join(__dirname, 'shadow.txt');
      else if (filePath === '/etc/passwd') filePath = path.join(__dirname, 'passwd.txt');
      else if (filePath.includes('.aws/credentials') || filePath.includes('aws/credentials')) filePath = path.join(__dirname, 'aws_creds.txt');
      try {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        return res.json({ parsed: content });
      } catch { }
    }
  }
  const match = xmlData.match(/<data>([^<]*)<\/data>/);
  res.json({ parsed: match ? match[1] : 'Parse complete' });
});

// ==================== UPLOAD / INTEGRITY ====================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const targetPath = path.join(uploadDir, req.file.originalname);
  try { fs.renameSync(req.file.path, targetPath); } catch (e) {
    fs.copyFileSync(req.file.path, targetPath);
  }
  const content = fs.readFileSync(targetPath, 'utf8');
  res.json({ url: '/uploads/' + req.file.originalname, name: req.file.originalname, size: req.file.size, content });
});

// ==================== LOGGING ====================
app.get('/api/logs', (req, res) => {
  const logs = all('SELECT * FROM logs ORDER BY created_at DESC');
  res.json(logs);
});

app.post('/api/log-action', (req, res) => {
  const { action, details } = req.body;
  run('INSERT INTO logs (action, details) VALUES (?, ?)', [action, details]);
  res.json({ success: true });
});

// ==================== SSRF ====================
app.get('/api/fetch', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'URL required' });

  http.get(targetUrl, (response) => {
    let data = '';
    response.on('data', (chunk) => data += chunk);
    response.on('end', () => res.json({ url: targetUrl, status: response.statusCode, data: data.substring(0, 2000) }));
  }).on('error', (err) => res.json({ error: err.message }));
});

// ==================== AWS Metadata Service (for SSRF) ====================
app.get('/internal/flag', (req, res) => {
  res.json({ 'instance-id': 'ami-0c55b159cbfafe1f0', service: 'EC2 Metadata Service', region: 'us-east-1' });
});

// Simulated cloud metadata endpoint for SSRF challenge
app.get('/latest/meta-data/instance-id', (req, res) => {
  res.send('ami-0c55b159cbfafe1f0');
});

app.get('/latest/meta-data/', (req, res) => {
  res.send('instance-id\nami-id\nhostname\npublic-ipv4\n');
});

// ==================== EXPERT CHAIN ENDPOINTS ====================
// Step 2: Insecure Design - trusts client-provided key
app.post('/api/verify-service', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });
  if (key === 'svc-key-expert-789') {
    res.json({ authenticated: true, internal_endpoint: 'http://localhost:3001/internal/vault' });
  } else {
    res.status(401).json({ error: 'Invalid key. Hint: check admin notes' });
  }
});

// Step 3 target: Internal vault (only accessible via SSRF)
app.get('/api/internal/vault', (req, res) => {
  res.json({ secret: 'VAULT_SECRET_a1b2c3d4e5', message: 'You chained all 3 vulnerabilities!' });
});

// ==================== CHALLENGES ====================
app.get('/api/challenges', (req, res) => {
  const challenges = all('SELECT id, name, description, category, difficulty, order_num FROM challenges ORDER BY order_num');
  res.json(challenges);
});

app.get('/api/challenges/:id', (req, res) => {
  const challenge = get('SELECT * FROM challenges WHERE id = ?', [req.params.id]);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
  challenge.hints = JSON.parse(challenge.hints || '[]');
  res.json(challenge);
});

app.post('/api/challenges/:id/verify', (req, res) => {
  const { flag } = req.body;
  const challenge = get('SELECT * FROM challenges WHERE id = ?', [req.params.id]);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

  if (flag === challenge.flag) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const existing = get('SELECT id FROM progress WHERE user_id = ? AND challenge_id = ?', [decoded.id, challenge.id]);
        if (existing) {
          run('UPDATE progress SET completed = 1, completed_at = datetime("now") WHERE user_id = ? AND challenge_id = ?', [decoded.id, challenge.id]);
        } else {
          run('INSERT INTO progress (user_id, challenge_id, completed, completed_at) VALUES (?, ?, 1, datetime("now"))', [decoded.id, challenge.id]);
        }
      } catch {}
    }
    res.json({ success: true, message: 'Correct! Challenge completed!' });
  } else {
    res.json({ success: false, message: 'Incorrect flag. Try again!' });
  }
});

// ==================== PROGRESS ====================
app.get('/api/progress', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const progress = all('SELECT * FROM progress WHERE user_id = ?', [decoded.id]);
    res.json(progress);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ==================== HINT LOGGING ====================
app.post('/api/hints/:id/use', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const challengeId = req.params.id;

    const existing = get('SELECT id FROM progress WHERE user_id = ? AND challenge_id = ?', [decoded.id, challengeId]);
    if (existing) {
      run('UPDATE progress SET hints_used = hints_used + 1 WHERE user_id = ? AND challenge_id = ?', [decoded.id, challengeId]);
    } else {
      run('INSERT INTO progress (user_id, challenge_id, hints_used) VALUES (?, ?, 1)', [decoded.id, challengeId]);
    }

    res.json({ success: true });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ==================== STATIC FILES ====================
app.use('/uploads', express.static(uploadDir));

// ==================== START ====================
async function start() {
  db = await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VulnForge Backend running on http://localhost:${PORT}`);
    console.log(`Debug endpoint: http://localhost:${PORT}/api/debug`);
  });
}

start();
