const mysql = require("mysql2/promise");
const { db } = require("./config");

const pool = mysql.createPool({
  ...db,
  waitForConnections: true,
  queueLimit: 0,
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function testConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

async function withTransaction(callback) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function execute(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return rows;
}

module.exports = {
  pool,
  query,
  execute,
  testConnection,
  withTransaction,
};
