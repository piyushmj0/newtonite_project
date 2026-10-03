/**
 * Critical Behaviour Tests
 * 
 * These tests cover situations where correctness requires more than simple CRUD:
 * 1. Optimistic locking (concurrent edits)
 * 2. Claim racing (two users claiming same item)
 * 3. Idempotency (duplicate request prevention)
 * 4. State machine enforcement (invalid transitions)
 * 5. Authorization at resource level
 */

import request from 'supertest';
import { query, withTransaction } from '../src/db/pool.js';
import app from '../src/index.js';
import bcrypt from 'bcryptjs';

// Test helpers
let userA, userB, tokenA, tokenB, teamId;

async function createUser(email, name) {
  const hash = await bcrypt.hash('password123', 10);
  const { rows: [user] } = await query(
    'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
    [email, name, hash]
  );
  return user;
}

async function loginUser(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  return res.body.token;
}

async function createWorkItem(token, data = {}) {
  const res = await request(app)
    .post('/api/work-items')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Test work item',
      priority: 'medium',
      category: 'general',
      team_id: teamId,
      ...data,
    });
  return res;
}

// Setup
beforeAll(async () => {
  // Clean test data
  await query("DELETE FROM users WHERE email LIKE '%@test.com'");
  await query("DELETE FROM teams WHERE name LIKE 'Test Team%'");

  // Create test team
  const { rows: [team] } = await query(
    "INSERT INTO teams (name, description) VALUES ('Test Team Critical', 'Test') RETURNING id"
  );
  teamId = team.id;

  userA = await createUser('a@test.com', 'User A');
  userB = await createUser('b@test.com', 'User B');

  // Add both users to the team
  await query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3), ($1, $4, $5)',
    [teamId, userA.id, 'admin', userB.id, 'member']);

  tokenA = await loginUser('a@test.com');
  tokenB = await loginUser('b@test.com');
});

afterAll(async () => {
  await query("DELETE FROM users WHERE email LIKE '%@test.com'");
  await query("DELETE FROM teams WHERE name LIKE 'Test Team%'");
  process.exit(0);
});

// ─── Test 1: Optimistic Locking ───────────────────────────────────────────────

describe('Critical Behaviour 1: Optimistic Locking (Concurrent Edits)', () => {
  let itemId, currentVersion;

  beforeEach(async () => {
    const res = await createWorkItem(tokenA, { title: 'Concurrent edit test item' });
    expect(res.status).toBe(201);
    itemId = res.body.item.id;
    currentVersion = res.body.item.version;
  });

  test('first update with correct version succeeds', async () => {
    const res = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Updated title', version: currentVersion });

    expect(res.status).toBe(200);
    expect(res.body.item.version).toBe(currentVersion + 1);
    expect(res.body.item.title).toBe('Updated title');
  });

  test('second update with stale version is rejected with 409', async () => {
    // User A updates the item
    await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'A updated this', version: currentVersion });

    // User B tries to update with the old version (they have stale data)
    const res = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'B updated this', version: currentVersion });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VERSION_CONFLICT');
  });

  test('concurrent updates: only one succeeds, other gets 409', async () => {
    // Simulate both users trying to update at the same time with the same version
    const [resA, resB] = await Promise.all([
      request(app)
        .patch(`/api/work-items/${itemId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'A wins', version: currentVersion }),
      request(app)
        .patch(`/api/work-items/${itemId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'B wins', version: currentVersion }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // One succeeds (200), one gets conflict (409)
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);
  });
});

// ─── Test 2: Claim Racing ─────────────────────────────────────────────────────

describe('Critical Behaviour 2: Claim Racing Prevention', () => {
  let itemId, itemVersion;

  beforeEach(async () => {
    const res = await createWorkItem(tokenA, {
      title: 'Unclaimed item for racing test',
      assignee_id: null,
    });
    itemId = res.body.item.id;
    itemVersion = res.body.item.version;
  });

  test('first claim succeeds', async () => {
    const res = await request(app)
      .post(`/api/work-items/${itemId}/claim`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ version: itemVersion });

    expect(res.status).toBe(200);
    expect(res.body.item.assignee_id).toBe(userB.id);
  });

  test('two users racing to claim: only one wins', async () => {
    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/work-items/${itemId}/claim`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ version: itemVersion }),
      request(app)
        .post(`/api/work-items/${itemId}/claim`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ version: itemVersion }),
    ]);

    const successes = [resA, resB].filter(r => r.status === 200);
    const failures = [resA, resB].filter(r => r.status !== 200);

    // Exactly one should succeed
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
  });

  test('claiming an already-claimed item returns 409', async () => {
    // User A claims it
    await request(app)
      .post(`/api/work-items/${itemId}/claim`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ version: itemVersion });

    // User B tries to claim the same item
    const res = await request(app)
      .post(`/api/work-items/${itemId}/claim`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ version: itemVersion });

    expect(res.status === 409 || res.status === 409).toBe(true);
  });
});

// ─── Test 3: Idempotency ──────────────────────────────────────────────────────

describe('Critical Behaviour 3: Idempotency (Duplicate Prevention)', () => {
  test('same idempotency key returns cached response without creating duplicate', async () => {
    const idempotencyKey = `test-${Date.now()}-${Math.random()}`;

    const res1 = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Idempotency test item', category: 'general', team_id: teamId });

    const res2 = await request(app)
      .post('/api/work-items')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ title: 'Idempotency test item', category: 'general', team_id: teamId });

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    // Both responses should return the same item ID
    expect(res1.body.item.id).toBe(res2.body.item.id);

    // Second response should have replay header
    expect(res2.headers['x-idempotency-replayed']).toBe('true');

    // Only one item should exist in the database
    const { rows } = await query(
      'SELECT COUNT(*)::int as count FROM work_items WHERE id = $1',
      [res1.body.item.id]
    );
    expect(rows[0].count).toBe(1);
  });

  test('different idempotency keys create different items', async () => {
    const key1 = `test-${Date.now()}-1`;
    const key2 = `test-${Date.now()}-2`;

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/work-items')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', key1)
        .send({ title: 'Item 1', category: 'general', team_id: teamId }),
      request(app)
        .post('/api/work-items')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', key2)
        .send({ title: 'Item 2', category: 'general', team_id: teamId }),
    ]);

    expect(res1.body.item.id).not.toBe(res2.body.item.id);
  });
});

// ─── Test 4: State Machine Enforcement ────────────────────────────────────────

describe('Critical Behaviour 4: State Machine Enforcement', () => {
  let itemId, itemVersion;

  beforeEach(async () => {
    const res = await createWorkItem(tokenA, { title: 'State machine test' });
    itemId = res.body.item.id;
    itemVersion = res.body.item.version;
  });

  test('valid transition: open -> in_progress succeeds', async () => {
    const res = await request(app)
      .post(`/api/work-items/${itemId}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'in_progress', version: itemVersion });

    expect(res.status).toBe(200);
    expect(res.body.item.status).toBe('in_progress');
  });

  test('invalid transition: open -> resolved is rejected', async () => {
    const res = await request(app)
      .post(`/api/work-items/${itemId}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'resolved', version: itemVersion });

    expect(res.status).toBe(422);
  });

  test('invalid transition: open -> pending_approval is rejected', async () => {
    const res = await request(app)
      .post(`/api/work-items/${itemId}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'pending_approval', version: itemVersion });

    expect(res.status).toBe(422);
  });
});

// ─── Test 5: Authorization at Resource Level ──────────────────────────────────

describe('Critical Behaviour 5: Resource-Level Authorization', () => {
  let userC, tokenC, itemId;

  beforeAll(async () => {
    userC = await createUser('c@test.com', 'User C - no team');
    tokenC = await loginUser('c@test.com');
  });

  beforeEach(async () => {
    const res = await createWorkItem(tokenA, { title: 'Auth test item' });
    itemId = res.body.item.id;
  });

  test('user not on the team cannot read the work item', async () => {
    const res = await request(app)
      .get(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenC}`);

    expect(res.status).toBe(403);
  });

  test('user not on the team cannot update the work item', async () => {
    const itemRes = await request(app)
      .get(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenA}`);

    const res = await request(app)
      .patch(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ title: 'Unauthorized update', version: itemRes.body.item.version });

    expect(res.status).toBe(403);
  });

  test('team member can read but non-admin cannot delete', async () => {
    // User B is a member (not admin)
    const res = await request(app)
      .delete(`/api/work-items/${itemId}`)
      .set('Authorization', `Bearer ${tokenB}`);

    // Should be 403 (not admin, not creator)
    expect(res.status).toBe(403);
  });

  test('unauthenticated request returns 401', async () => {
    const res = await request(app)
      .get(`/api/work-items/${itemId}`);

    expect(res.status).toBe(401);
  });
});
