import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let dbInstance = null;

async function getDb() {
  if (!dbInstance) {
    dbInstance = await open({
      filename: path.join(process.cwd(), 'newtonite.sqlite'),
      driver: sqlite3.Database
    });
    
    // Enable foreign keys
    await dbInstance.exec('PRAGMA foreign_keys = ON;');
    // Improve concurrency
    await dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  return dbInstance;
}

// Convert PostgreSQL query format to SQLite format
function adaptQuery(text) {
  return text
    // Replace $1, $2 with ?1, ?2
    .replace(/\$(\d+)/g, '?$1')
    // Remove FOR UPDATE since SQLite locks the whole DB for writes anyway
    .replace(/FOR UPDATE/g, '')
    // Replace NOW() with CURRENT_TIMESTAMP or datetime('now')
    .replace(/NOW\(\)/g, "datetime('now')");
}

export const query = async (text, params = []) => {
  const db = await getDb();
  const sql = adaptQuery(text);
  
  try {
    // If it's a SELECT or has RETURNING, we use .all()
    if (sql.trim().match(/^(SELECT|[\s\S]*RETURNING)/i)) {
      const rows = await db.all(sql, params);
      return { rows, rowCount: rows.length };
    } else {
      const result = await db.run(sql, params);
      return { rows: [], rowCount: result.changes };
    }
  } catch (e) {
    // Make errors look a bit more like pg for the catch blocks
    if (e.message.includes('UNIQUE constraint failed')) {
      e.code = '23505';
    }
    console.error('SQL Error:', e.message, '\nQuery:', sql, '\nParams:', params);
    throw e;
  }
};

export const withTransaction = async (fn) => {
  const db = await getDb();
  // SQLite doesn't do connection pooling the same way, we just use the main db instance
  // Since we use WAL, readers can read while a writer writes.
  await db.run('BEGIN TRANSACTION');
  try {
    // Provide a mock client that has a .query method for the transaction callbacks
    const mockClient = { query: (t, p) => query(t, p) };
    const result = await fn(mockClient);
    await db.run('COMMIT');
    return result;
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
};

export default { query, withTransaction };
