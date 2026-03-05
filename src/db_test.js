require('dotenv').config();
const sql = require('mssql');

const rawServer = process.env.DB_SERVER || 'localhost';
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined;

const config = {
  user: process.env.DB_USER || undefined,
  password: process.env.DB_PASSWORD || undefined,
  server: rawServer.includes('\\') ? rawServer.split('\\')[0] : rawServer,
  port: rawServer.includes('\\') ? undefined : DB_PORT,
  database: process.env.DB_DATABASE || undefined,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true'
  }
};

if (rawServer.includes('\\')) {
  config.options.instanceName = rawServer.split('\\')[1];
}

(async () => {
  try {
    console.log('Using DB config:', {
      server: config.server,
      instanceName: config.options.instanceName,
      port: config.port,
      database: config.database,
      user: config.user ? '***' : '(integrated)'
    });

    const pool = await sql.connect(config);
    console.log('✅ Connected to SQL Server');
    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ SQL Connection Failed:', err.message || err);
    process.exit(1);
  }
})();
