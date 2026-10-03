import { query } from './pool.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  try {
    console.log('Seeding database...');

    const engId = crypto.randomUUID();
    const opsId = crypto.randomUUID();
    const supportId = crypto.randomUUID();
    const financeId = crypto.randomUUID();

    // Create teams
    await query(`
      INSERT INTO teams (id, name, description) VALUES
        ($1, 'Engineering', 'Software Engineering team'),
        ($2, 'Operations', 'Business Operations team'),
        ($3, 'Support', 'Customer Support team'),
        ($4, 'Finance', 'Finance and Compliance team')
      ON CONFLICT (name) DO NOTHING
    `, [engId, opsId, supportId, financeId]);

    const aliceId = crypto.randomUUID();
    const bobId = crypto.randomUUID();
    const carolId = crypto.randomUUID();
    const daveId = crypto.randomUUID();
    const eveId = crypto.randomUUID();

    // Create users
    const passwordHash = await bcrypt.hash('password123', 10);
    await query(`
      INSERT INTO users (id, email, name, password_hash) VALUES
        ($2, 'alice@company.com', 'Alice Johnson', $1),
        ($3, 'bob@company.com', 'Bob Smith', $1),
        ($4, 'carol@company.com', 'Carol White', $1),
        ($5, 'dave@company.com', 'Dave Brown', $1),
        ($6, 'eve@company.com', 'Eve Davis', $1)
      ON CONFLICT (email) DO NOTHING
    `, [passwordHash, aliceId, bobId, carolId, daveId, eveId]);

    // Fetch all teams and users
    const { rows: teams } = await query('SELECT id, name FROM teams');
    const { rows: users } = await query('SELECT id, email FROM users');

    const getTeam = (name) => teams.find(t => t.name === name);
    const getUser = (email) => users.find(u => u.email === email);

    const alice = getUser('alice@company.com');
    const bob = getUser('bob@company.com');
    const carol = getUser('carol@company.com');
    const dave = getUser('dave@company.com');
    const eve = getUser('eve@company.com');
    const eng = getTeam('Engineering');
    const ops = getTeam('Operations');
    const support = getTeam('Support');
    const finance = getTeam('Finance');

    if (!alice || !eng) {
      console.log('Users/teams already seeded, skipping...');
      process.exit(0);
    }

    // Team memberships
    await query(`
      INSERT INTO team_members (team_id, user_id, role) VALUES
        ($1, $2, 'admin'), ($1, $3, 'member'),
        ($4, $5, 'admin'), ($4, $6, 'member'),
        ($7, $8, 'member'), ($7, $9, 'member'),
        ($10, $11, 'admin')
      ON CONFLICT DO NOTHING
    `, [eng.id, alice.id, bob.id, ops.id, carol.id, dave.id, support.id, bob.id, eve.id, finance.id, eve.id]);

    // Create sample work items
    const items = [
      {
        title: 'Payment gateway timeout errors - production',
        description: 'Multiple customers reporting payment failures since 14:00. Error rate at 15%. Needs immediate investigation.',
        status: 'in_progress',
        priority: 'critical',
        category: 'payment',
        created_by: carol.id,
        assignee_id: alice.id,
        team_id: eng.id,
      },
      {
        title: 'Customer data export compliance request',
        description: 'Customer ID #4421 requesting GDPR data export. Must be completed within 72 hours per regulation.',
        status: 'open',
        priority: 'high',
        category: 'compliance',
        created_by: eve.id,
        assignee_id: eve.id,
        team_id: finance.id,
      },
      {
        title: 'Onboarding flow broken for enterprise accounts',
        description: 'Enterprise accounts with SSO cannot complete onboarding step 3. Regression from last deploy.',
        status: 'open',
        priority: 'high',
        category: 'engineering',
        created_by: carol.id,
        assignee_id: bob.id,
        team_id: eng.id,
      },
      {
        title: 'Q4 vendor contract renewal approval',
        description: 'Annual contract with AWS needs renewal. Cost: $45k/year. Requires manager approval.',
        status: 'pending_approval',
        priority: 'medium',
        category: 'operational',
        created_by: dave.id,
        team_id: ops.id,
      },
      {
        title: 'Database query performance degradation',
        description: 'Slow query warnings increasing. P99 latency up 40% since Tuesday. Index analysis needed.',
        status: 'in_progress',
        priority: 'high',
        category: 'engineering',
        created_by: alice.id,
        assignee_id: alice.id,
        team_id: eng.id,
      },
    ];

    for (const item of items) {
      const id = crypto.randomUUID();
      const { rows: [wi] } = await query(`
        INSERT INTO work_items (id, title, description, status, priority, category, created_by, assignee_id, team_id)
        VALUES ($9, $1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `, [item.title, item.description, item.status, item.priority, item.category,
          item.created_by, item.assignee_id || null, item.team_id || null, id]);

      const eventId = crypto.randomUUID();
      // Seed event log for each item
      await query(`
        INSERT INTO work_item_events (id, work_item_id, user_id, event_type, payload)
        VALUES ($4, $1, $2, 'created', $3)
      `, [wi.id, item.created_by, JSON.stringify({ title: item.title, status: item.status, priority: item.priority }), eventId]);

      if (item.assignee_id) {
        const assignEventId = crypto.randomUUID();
        await query(`
          INSERT INTO work_item_events (id, work_item_id, user_id, event_type, payload)
          VALUES ($4, $1, $2, 'assigned', $3)
        `, [wi.id, item.created_by, JSON.stringify({ assignee_id: item.assignee_id }), assignEventId]);
      }
    }

    console.log('Database seeded successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
