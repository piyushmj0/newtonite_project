import { test } from 'node:test';
import assert from 'node:assert';
import { query } from '../src/db/pool.js';

const API_URL = 'http://localhost:3001/api';

// Helper to get tokens
async function login(email, password = 'password123') {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  return data.token;
}

test('Concurrency: Prevents Lost Updates via Optimistic Locking', async (t) => {
  const aliceToken = await login('alice@company.com'); // Admin

  // 1. Create a work item
  const createRes = await fetch(`${API_URL}/work-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}`, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ title: 'Test Ticket for Concurrency', priority: 'medium' })
  });
  const { item } = await createRes.json();
  
  // Both User A and User B "fetch" the item at version 1
  const versionFetchedByUserA = item.version;
  const versionFetchedByUserB = item.version;

  // User A updates it successfully
  const updateA = await fetch(`${API_URL}/work-items/${item.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}`, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ priority: 'high', version: versionFetchedByUserA })
  });
  assert.strictEqual(updateA.status, 200, 'User A should succeed');

  // User B tries to update it with the old version
  const updateB = await fetch(`${API_URL}/work-items/${item.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}`, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ priority: 'low', version: versionFetchedByUserB })
  });
  
  assert.strictEqual(updateB.status, 409, 'User B should fail with a 409 Conflict due to version mismatch');
});

test('Authorization: Only Team Admins can Approve', async (t) => {
  const aliceToken = await login('alice@company.com'); // Eng Admin
  const bobToken = await login('bob@company.com'); // Eng Member
  const carolToken = await login('carol@company.com'); // Ops Admin (Not Eng)

  // 1. Fetch Engineering team via direct DB query
  const { rows } = await query(`SELECT id FROM teams WHERE name = 'Engineering' LIMIT 1`);
  const engTeam = rows[0];

  // 2. Create a ticket in Engineering
  const createRes = await fetch(`${API_URL}/work-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}`, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ title: 'Require Approval Ticket', priority: 'medium', team_id: engTeam.id })
  });
  let { item } = await createRes.json();

  // 3. Move to pending_approval
  let statusRes = await fetch(`${API_URL}/work-items/${item.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}`, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ status: 'in_progress', version: item.version })
  });
  item = (await statusRes.json()).item;

  statusRes = await fetch(`${API_URL}/work-items/${item.id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}`, 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ status: 'pending_approval', version: item.version })
  });
  item = (await statusRes.json()).item;
  
  // 3. Bob (member) attempts to approve -> Should Fail 403
  const bobApprove = await fetch(`${API_URL}/work-items/${item.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bobToken}` },
    body: JSON.stringify({ decision: 'approved', version: item.version })
  });
  assert.strictEqual(bobApprove.status, 403, 'Member should not be able to approve');

  // 4. Carol (Admin of DIFFERENT team) attempts to approve -> Should Fail 403
  const carolApprove = await fetch(`${API_URL}/work-items/${item.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${carolToken}` },
    body: JSON.stringify({ decision: 'approved', version: item.version })
  });
  assert.strictEqual(carolApprove.status, 403, 'Admin of another team should not be able to approve');

  // 5. Alice (Admin of correct team) attempts to approve -> Should Succeed 200
  const aliceApprove = await fetch(`${API_URL}/work-items/${item.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aliceToken}` },
    body: JSON.stringify({ decision: 'approved', version: item.version })
  });
  assert.strictEqual(aliceApprove.status, 200, 'Team Admin should successfully approve');
});

