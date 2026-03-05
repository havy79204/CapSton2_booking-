require('dotenv').config();
const sql = require('mssql/msnodesqlv8');

const {
  DB_SERVER,
  DB_DATABASE,
  DB_USER,
  DB_PASSWORD,
  DB_PORT,
  DB_ENCRYPT,
  DB_TRUST_SERVER_CERT
} = process.env;

const server = DB_SERVER || 'localhost';
const database = DB_DATABASE || 'master';
const port = DB_PORT ? parseInt(DB_PORT, 10) : 1433;

// build the common part of the configuration
const config = {
  server,
  database,
  port,
  options: {
    // encryption settings can be controlled via env variables
    encrypt: DB_ENCRYPT === 'true',              // default false
    trustServerCertificate: DB_TRUST_SERVER_CERT === 'true'
  }
};

// if credentials were provided (non-empty), use SQL Server authentication
if (DB_USER && DB_PASSWORD) {
  config.user = DB_USER;
  config.password = DB_PASSWORD;
} else {
  // fall back to Integrated Security (Windows authentication)
  config.options.trustedConnection = true;
}


let poolPromise = null;

const connectDB = async () => {
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    try {
      const pool = await sql.connect(config);
      console.log('✅ Connected to SQL Server');
      return pool;
    } catch (err) {
      poolPromise = null;
      // log full error for easier troubleshooting (login issues, network, etc.)
      console.error('❌ SQL Connection Failed:', err);
      throw err;
    }
  })();

  return poolPromise;
};

module.exports = connectDB;
