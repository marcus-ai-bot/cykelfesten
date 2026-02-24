import { describe, it, expect } from 'vitest';
import { cascadeChanges } from '../cascade';
import type { Course } from '@/types/database';

type Row = Record<string, any>;

class MockQuery {
  private table: string;
  private db: MockSupabase;
  private filters: ((row: Row) => boolean)[] = [];
  private action: 'select' | 'update' | 'delete' | null = null;
  private payload: Row | null = null;

  constructor(db: MockSupabase, table: string) {
    this.db = db;
    this.table = table;
  }

  eq(column: string, value: any) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push(row => values.includes(row[column]));
    return this;
  }

  select() {
    this.action = this.action ?? 'select';
    return this.execute();
  }

  single() {
    this.action = this.action ?? 'select';
    return this.executeSingle();
  }

  update(payload: Row) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  insert(rows: Row | Row[]) {
    const list = Array.isArray(rows) ? rows : [rows];
    this.db.tables[this.table].push(...list);
    return Promise.resolve({ data: list, error: null });
  }

  private filteredRows() {
    const rows = this.db.tables[this.table];
    return rows.filter(row => this.filters.every(fn => fn(row)));
  }

  private execute() {
    if (this.action === 'update' && this.payload) {
      const rows = this.filteredRows();
      rows.forEach(row => Object.assign(row, this.payload));
      return Promise.resolve({ data: rows, error: null });
    }

    if (this.action === 'delete') {
      const rows = this.filteredRows();
      this.db.tables[this.table] = this.db.tables[this.table].filter(row => !rows.includes(row));
      return Promise.resolve({ data: rows, error: null });
    }

    const rows = this.filteredRows();
    return Promise.resolve({ data: rows, error: null });
  }

  private executeSingle() {
    return this.execute().then(result => ({
      data: result.data?.[0] ?? null,
      error: null,
    }));
  }
}

class MockSupabase {
  tables: Record<string, Row[]>;

  constructor(seed: Record<string, Row[]>) {
    this.tables = seed;
  }

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return new MockQuery(this, table);
  }
}

function createDb(seed: Record<string, Row[]>) {
  return new MockSupabase({
    envelopes: [],
    course_pairings: [],
    assignments: [],
    couples: [],
    ...seed,
  });
}

describe('cascadeChanges', () => {
  it('guest_dropout cancels envelopes and removes pairings', async () => {
    const db = createDb({
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest', course: 'starter', cancelled: false },
      ],
      course_pairings: [
        { id: 'p1', match_plan_id: 'plan', guest_couple_id: 'guest', host_couple_id: 'host', course: 'starter' },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'guest_dropout',
      coupleId: 'guest',
    });

    expect(result.envelopesCancelled).toBe(1);
    expect(result.pairingsRemoved).toBe(1);
    expect(db.tables.envelopes[0].cancelled).toBe(true);
    expect(db.tables.course_pairings).toHaveLength(0);
  });

  it('host_dropout cancels hosted envelopes and removes pairings', async () => {
    const db = createDb({
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest1', course: 'main', host_couple_id: 'host', cancelled: false },
        { id: 'e2', match_plan_id: 'plan', couple_id: 'host', course: 'starter', host_couple_id: 'x', cancelled: false },
      ],
      course_pairings: [
        { id: 'p1', match_plan_id: 'plan', guest_couple_id: 'guest1', host_couple_id: 'host', course: 'main' },
        { id: 'p2', match_plan_id: 'plan', guest_couple_id: 'host', host_couple_id: 'other', course: 'starter' },
      ],
      assignments: [
        { id: 'a1', event_id: 'event', couple_id: 'host' },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'host_dropout',
      coupleId: 'host',
    });

    expect(result.unplacedGuests).toEqual(['guest1']);
    expect(db.tables.envelopes.find(e => e.id === 'e1')?.cancelled).toBe(true);
    expect(db.tables.envelopes.find(e => e.id === 'e2')?.cancelled).toBe(true);
    expect(db.tables.course_pairings).toHaveLength(0);
    expect(db.tables.assignments).toHaveLength(0);
  });

  it('address_change updates destination address', async () => {
    const db = createDb({
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest', host_couple_id: 'host', course: 'dessert', cancelled: false, destination_address: 'Old' },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'address_change',
      coupleId: 'host',
      details: { newAddress: 'New Address', newAddressNotes: 'Note' },
    });

    expect(result.envelopesUpdated).toBe(1);
    expect(db.tables.envelopes[0].destination_address).toBe('New Address');
  });

  it('reassign cancels envelope by couple+course even if host mismatch', async () => {
    const db = createDb({
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest', course: 'main', host_couple_id: 'wrong', cancelled: false },
      ],
      course_pairings: [
        { id: 'p1', match_plan_id: 'plan', guest_couple_id: 'guest', host_couple_id: 'old', course: 'main' },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'reassign',
      coupleId: 'guest',
      details: { course: 'main', newHostCoupleId: 'new' },
    });

    expect(result.pairingsCreated).toBe(1);
    expect(db.tables.envelopes[0].cancelled).toBe(true);
    expect(db.tables.course_pairings).toHaveLength(1);
    expect(db.tables.course_pairings[0].host_couple_id).toBe('new');
  });

  it('resign_host removes host pairings and cancels envelopes', async () => {
    const db = createDb({
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest1', course: 'starter', host_couple_id: 'host', cancelled: false },
      ],
      course_pairings: [
        { id: 'p1', match_plan_id: 'plan', guest_couple_id: 'guest1', host_couple_id: 'host', course: 'starter' },
      ],
      assignments: [
        { id: 'a1', event_id: 'event', couple_id: 'host', is_host: true },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'resign_host',
      coupleId: 'host',
    });

    expect(result.unplacedGuests).toEqual(['guest1']);
    expect(db.tables.course_pairings).toHaveLength(0);
    expect(db.tables.envelopes[0].cancelled).toBe(true);
    expect(db.tables.assignments).toHaveLength(0);
  });

  it('split returns new couple as unplaced', async () => {
    const db = createDb({});

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'split',
      coupleId: 'original',
      details: { newCoupleId: 'new' },
    });

    expect(result.unplacedGuests).toEqual(['new']);
  });

  it('transfer_host updates assignments, pairings, and envelopes', async () => {
    const db = createDb({
      couples: [
        { id: 'to', address: 'New Addr', address_notes: 'Note' },
      ],
      assignments: [
        { id: 'a1', event_id: 'event', couple_id: 'from', course: 'starter', is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 0, is_emergency_host: false },
      ],
      course_pairings: [
        { id: 'p1', match_plan_id: 'plan', guest_couple_id: 'guest1', host_couple_id: 'from', course: 'starter' },
      ],
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest1', course: 'starter', host_couple_id: 'from', cancelled: false },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'transfer_host',
      coupleId: 'from',
      details: { toCoupleId: 'to', courses: ['starter' as Course] },
    });

    expect(result.assignmentsCreated).toBe(1);
    expect(db.tables.assignments[0].couple_id).toBe('to');
    expect(db.tables.course_pairings[0].host_couple_id).toBe('to');
    expect(db.tables.envelopes[0].host_couple_id).toBe('to');
  });

  it('promote_host removes guest pairing and cancels envelope', async () => {
    const db = createDb({
      course_pairings: [
        { id: 'p1', match_plan_id: 'plan', guest_couple_id: 'guest', host_couple_id: 'host', course: 'dessert' },
      ],
      envelopes: [
        { id: 'e1', match_plan_id: 'plan', couple_id: 'guest', course: 'dessert', host_couple_id: 'host', cancelled: false },
      ],
    });

    const result = await cascadeChanges({
      supabase: db as any,
      eventId: 'event',
      matchPlanId: 'plan',
      type: 'promote_host',
      coupleId: 'guest',
      details: { course: 'dessert' },
    });

    expect(result.pairingsRemoved).toBe(1);
    expect(db.tables.course_pairings).toHaveLength(0);
    expect(db.tables.envelopes[0].cancelled).toBe(true);
  });
});
