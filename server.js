require('dotenv').config({ path: '.env.local' });

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const port = Number(process.env.PORT || 4000);
const dataDirectory = path.join(__dirname, '.data');
const databasePath = process.env.DB_PATH || path.join(dataDirectory, 'wolf-supps.sqlite');
const categories = new Set(['Protein', 'Performance', 'Wellness']);
const adminTokens = new Set();
const customerTokens = new Map();

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    detail TEXT NOT NULL,
    price REAL NOT NULL CHECK(price > 0),
    category TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER REFERENCES customers(id),
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'Lebanon',
    payment_method TEXT NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'New',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const orderColumns = database.prepare('PRAGMA table_info(orders)').all().map((column) => column.name);
if (!orderColumns.includes('customer_id')) {
  database.exec('ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)');
}
database.exec('CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)');

const productCount = database.prepare('SELECT COUNT(*) AS count FROM products').get().count;
if (productCount === 0) {
  const seedProducts = [
    ['Whey Protein', 'Vanilla bean · 24 servings', 34, 'Protein', 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?auto=format&fit=crop&w=900&q=80'],
    ['Creatine Monohydrate', 'Unflavored · 60 servings', 22, 'Performance', 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?auto=format&fit=crop&w=900&q=80'],
    ['Plant Protein', 'Chocolate cacao · 20 servings', 32, 'Protein', 'https://images.unsplash.com/photo-1622484212850-eb596d769edc?auto=format&fit=crop&w=900&q=80'],
    ['Pre-Workout', 'Citrus punch · 30 servings', 29, 'Performance', 'https://images.unsplash.com/photo-1594498653385-d5172c532c00?auto=format&fit=crop&w=900&q=80'],
    ['Omega-3 Softgels', 'Lemon softgels · 60 capsules', 18, 'Wellness', 'https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?auto=format&fit=crop&w=900&q=80'],
  ];
  const insertProduct = database.prepare('INSERT INTO products (name, detail, price, category, image) VALUES (?, ?, ?, ?, ?)');
  const seedTransaction = database.transaction((items) => items.forEach((item) => insertProduct.run(...item)));
  seedTransaction(seedProducts);
}

app.use(express.json({ limit: '32kb' }));

function authenticateAdmin(request, response, next) {
  const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !adminTokens.has(token)) {
    return response.status(401).json({ error: 'Sign in to manage the store.' });
  }
  return next();
}

function authenticateCustomer(request, response, next) {
  const token = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  const customerId = token && customerTokens.get(token);
  if (!customerId) return response.status(401).json({ error: 'Sign in to access your account.' });
  request.customerId = customerId;
  request.customerToken = token;
  return next();
}

function validProduct(input) {
  return input
    && typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 100
    && typeof input.detail === 'string' && input.detail.trim().length > 0 && input.detail.length <= 180
    && Number.isFinite(Number(input.price)) && Number(input.price) > 0 && Number(input.price) <= 100000
    && categories.has(input.category)
    && typeof (input.image || '') === 'string' && (input.image || '').length <= 1000;
}

app.get('/api/store', (request, response) => {
  response.json({ brand: 'Wolf Supps', country: 'Lebanon', wishMoneyNumber: process.env.WISH_MONEY_NUMBER || '' });
});

app.get('/api/products', (request, response) => {
  response.json(database.prepare('SELECT id, name, detail, price, category, image FROM products ORDER BY id DESC').all());
});

app.post('/api/customers/register', (request, response) => {
  const { name, email, phone, password } = request.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120
    || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 180
    || typeof phone !== 'string' || !phone.trim() || phone.length > 40
    || typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return response.status(400).json({ error: 'Enter a name, valid email, phone number, and password of at least 10 characters.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(password, salt, 64).toString('hex');
  let customer;
  try {
    const result = database.prepare('INSERT INTO customers (name, email, phone, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), email.trim().toLowerCase(), phone.trim(), salt, passwordHash);
    customer = database.prepare('SELECT id, name, email, phone FROM customers WHERE id = ?').get(result.lastInsertRowid);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return response.status(409).json({ error: 'An account already exists for that email.' });
    throw error;
  }

  const token = crypto.randomBytes(32).toString('hex');
  customerTokens.set(token, customer.id);
  return response.status(201).json({ token, customer });
});

app.post('/api/customers/login', (request, response) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const record = database.prepare('SELECT id, name, email, phone, password_salt, password_hash FROM customers WHERE email = ?').get(email);
  if (!record || !password || password.length > 128) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const submittedHash = crypto.scryptSync(password, record.password_salt, 64);
  const storedHash = Buffer.from(record.password_hash, 'hex');
  if (submittedHash.length !== storedHash.length || !crypto.timingSafeEqual(submittedHash, storedHash)) {
    return response.status(401).json({ error: 'Email or password is incorrect.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  customerTokens.set(token, record.id);
  return response.json({
    token,
    customer: { id: record.id, name: record.name, email: record.email, phone: record.phone },
  });
});

app.get('/api/customers/me', authenticateCustomer, (request, response) => {
  const customer = database.prepare('SELECT id, name, email, phone FROM customers WHERE id = ?').get(request.customerId);
  if (!customer) return response.status(401).json({ error: 'Sign in to access your account.' });
  const orders = database.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC').all(request.customerId)
    .map((order) => ({ ...order, items: JSON.parse(order.items) }));
  return response.json({ customer, orders });
});

app.post('/api/customers/logout', authenticateCustomer, (request, response) => {
  customerTokens.delete(request.customerToken);
  return response.json({ success: true });
});

app.post('/api/admin/login', (request, response) => {
  const configuredPassword = process.env.ADMIN_PASSWORD || '';
  const submittedPassword = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!configuredPassword) {
    return response.status(503).json({ error: 'Set ADMIN_PASSWORD in .env.local to enable admin access.' });
  }
  const expected = Buffer.from(configuredPassword);
  const actual = Buffer.from(submittedPassword);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return response.status(401).json({ error: 'That password did not match.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  adminTokens.add(token);
  return response.json({ token });
});

app.get('/api/admin/orders', authenticateAdmin, (request, response) => {
  const orders = database.prepare('SELECT * FROM orders ORDER BY id DESC').all().map((order) => ({
    ...order,
    items: JSON.parse(order.items),
  }));
  response.json(orders);
});

app.patch('/api/admin/orders/:id', authenticateAdmin, (request, response) => {
  const allowedStatuses = new Set(['New', 'Awaiting Wish Money', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled']);
  if (!allowedStatuses.has(request.body?.status)) {
    return response.status(400).json({ error: 'Choose a valid order status.' });
  }
  const result = database.prepare('UPDATE orders SET status = ? WHERE id = ?').run(request.body.status, request.params.id);
  if (!result.changes) return response.status(404).json({ error: 'Order not found.' });
  return response.json({ success: true });
});

app.post('/api/admin/products', authenticateAdmin, (request, response) => {
  if (!validProduct(request.body)) return response.status(400).json({ error: 'Check the product details and try again.' });
  const { name, detail, price, category, image } = request.body;
  const result = database.prepare('INSERT INTO products (name, detail, price, category, image) VALUES (?, ?, ?, ?, ?)')
    .run(name.trim(), detail.trim(), Number(price), category, (image || '').trim());
  return response.status(201).json(database.prepare('SELECT id, name, detail, price, category, image FROM products WHERE id = ?').get(result.lastInsertRowid));
});

app.delete('/api/admin/products/:id', authenticateAdmin, (request, response) => {
  const result = database.prepare('DELETE FROM products WHERE id = ?').run(request.params.id);
  if (!result.changes) return response.status(404).json({ error: 'Product not found.' });
  return response.json({ success: true });
});

app.post('/api/orders', (request, response) => {
  const customerToken = request.get('authorization')?.replace(/^Bearer\s+/i, '');
  const customerId = customerToken ? customerTokens.get(customerToken) : null;
  if (!customerId) return response.status(401).json({ error: 'Create an account or sign in before placing an order.' });

  const { customer, items, paymentMethod, country } = request.body || {};
  const requiredFields = ['name', 'phone', 'address', 'city'];
  if (!customer || requiredFields.some((field) => typeof customer[field] !== 'string' || !customer[field].trim())) {
    return response.status(400).json({ error: 'Complete your name, phone, city, and delivery address.' });
  }
  if (country !== 'Lebanon') return response.status(400).json({ error: 'Wolf Supps currently delivers in Lebanon only.' });
  if (!['wish', 'cod'].includes(paymentMethod)) return response.status(400).json({ error: 'Choose Wish Money or cash on delivery.' });
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return response.status(400).json({ error: 'Your cart is empty.' });

  const getProduct = database.prepare('SELECT id, name, detail, price, category, image FROM products WHERE id = ?');
  const orderItems = [];
  for (const entry of items) {
    const quantity = Number(entry.quantity);
    const product = getProduct.get(Number(entry.id));
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) {
      return response.status(400).json({ error: 'A product in your cart is no longer available. Refresh and try again.' });
    }
    orderItems.push({ ...product, quantity });
  }

  const total = orderItems.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const result = database.prepare(`
    INSERT INTO orders (customer_id, customer_name, phone, address, city, payment_method, items, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customerId, customer.name.trim().slice(0, 120), customer.phone.trim().slice(0, 40), customer.address.trim().slice(0, 240),
    customer.city.trim().slice(0, 80), paymentMethod, JSON.stringify(orderItems), total,
    paymentMethod === 'wish' ? 'Awaiting Wish Money' : 'New',
  );
  return response.status(201).json({ orderId: result.lastInsertRowid, total, paymentMethod });
});

app.post('/api/contact', (request, response) => {
  const { name, email, subject, message } = request.body || {};
  if (![name, email, subject, message].every((value) => typeof value === 'string' && value.trim())) {
    return response.status(400).json({ error: 'Complete each field before sending your message.' });
  }
  if (name.length > 120 || email.length > 180 || subject.length > 160 || message.length > 3000) {
    return response.status(400).json({ error: 'One of your fields is too long.' });
  }
  database.prepare('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.trim(), subject.trim(), message.trim());
  return response.status(201).json({ success: true });
});

app.get('/api/admin/messages', authenticateAdmin, (request, response) => {
  response.json(database.prepare('SELECT * FROM messages ORDER BY id DESC').all());
});

const buildDirectory = path.join(__dirname, 'build');
if (fs.existsSync(buildDirectory)) {
  app.use(express.static(buildDirectory));
  app.get(/^\/(?!api).*/, (request, response) => response.sendFile(path.join(buildDirectory, 'index.html')));
}

app.listen(port, () => {
  console.log(`Wolf Supps API ready at http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});