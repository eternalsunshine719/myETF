const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'tobby_job',
  user: 'postgres',
  password: 'tkdgh#2096'
});

module.exports = pool;