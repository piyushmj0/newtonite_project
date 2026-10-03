import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE test (id INTEGER, name TEXT)');
  await db.all('INSERT INTO test (id, name) VALUES (?1, ?2) RETURNING *', [1, 'Alice']);
  try {
    const res = await db.all('SELECT * FROM test WHERE id = ?1 FOR UPDATE', [1]);
    console.log("FOR UPDATE worked:", res);
  } catch(e) {
    console.error("FOR UPDATE failed:", e.message);
  }
}

run();
