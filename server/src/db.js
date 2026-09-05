// src/db.js — pg connection pool
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,                  // cap concurrent connections (default: 10, too low for concurrent reports)
  idleTimeoutMillis: 30000, // release idle connections after 30 s
  statement_timeout: 10000, // kill any query that runs > 10 s — fail loud, not hang
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
