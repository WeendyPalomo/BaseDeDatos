// dbConnections.js
require('dotenv').config();
const sql = require('mssql');

const configByCity = {
  QUITO: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_QUITO,
    options: { encrypt: true, trustServerCertificate: true }
  },
  GUAYAQUIL: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_GUAYAQUIL,
    options: { encrypt: true, trustServerCertificate: true }
  },
  CUENCA: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_CUENCA,
    options: { encrypt: true, trustServerCertificate: true }
  },
  MANTA: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_MANTA,
    options: { encrypt: true, trustServerCertificate: true }
  }
};

const getConnection = async (ciudad) => {
  const dbConfig = configByCity[ciudad.toUpperCase()];
  if (!dbConfig) throw new Error(`Ciudad no válida: ${ciudad}`);
  return await sql.connect(dbConfig);
};

module.exports = { getConnection, sql };
