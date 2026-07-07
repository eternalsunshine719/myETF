const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:mocrqaZHJIDYntKtBcScSTgWvAnHMNUo@hayabusa.proxy.rlwy.net:26253/railway',
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;