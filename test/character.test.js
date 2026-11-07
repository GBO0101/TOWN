import vm from 'node:vm';
import { describe, expect, test } from 'vitest';
import { readOfficePage } from './office-scripts.js';

function createOffice(random = 0, includeSales = false) {
  const context = vm.createContext({ document: { addEventListener() {} } });
  for (const { path, source } of readOfficePage().scripts) {
    vm.runInContext(source, context, { filename: path });
  }
  context.random = () => random;
  context.includeSales = includeSales;
  vm.runInContext(`
    Math.random = random;
    sim.day = 3;
    sim.gameTime = 10;
    sim.punchRecords = {};
    sim.dailyPunch = {};
    sim.health = {};
    sim.characters = CHARACTERS.filter(c => includeSales || c.id !== 'sales').map(c => ({
      ...c, employment: 'active', mood: moodFromValue(c.initMood), memories: [],
      isPresent: true, state: 'sitting', pos: { ...POS[c.deskId] }, task: null
    }));
  `, context);
  return { context, sim: vm.runInContext('sim', context) };
}

describe('hireCharacter()', () => {
  test('new hires receive three months of personal savings', () => {
    const { context, sim } = createOffice();
    expect(context.hireCharacter('intern2').money).toBe(84000);
    expect(sim.health.intern2).toBe(1);
  });

  test('design interns receive a design mentor instead of the boss or an engineer', () => {
    const { context, sim } = createOffice();
    sim.characters.find(c => c.id === 'designer').seniority = 'veteran';
    context.hireCharacter('intern2');
    const assignment = sim.events.find(e => e.type === 'mentor_assign');
    expect(assignment?.chars[0].id).toBe('designer');
  });

  test('rehiring a departed candidate replaces the old record and restores health', () => {
    const { context, sim } = createOffice();
    context.hireCharacter('new_hr');
    context.retireCharacter('new_hr');
    sim._hiredToday = false;
    sim.health.new_hr = 0.2;
    const rehired = context.hireCharacter('new_hr');
    expect(sim.characters.filter(ch => ch.id === 'new_hr')).toHaveLength(1);
    expect(sim.characters.find(ch => ch.id === 'new_hr') === rehired).toBe(true);
    expect(rehired.employment).toBe('active');
    expect(sim.health.new_hr).toBe(1);
  });
});

describe('scheduleNext()', () => {
  test.each(['boss', 'tech', 'designer', 'admin', 'marketing', 'backend', 'sales'])(
    '%s returns to their assigned seat before starting office work', id => {
      const { context, sim } = createOffice(0.5, true);
      sim.projects = [{ id: 'active-project' }];
      const employee = sim.characters.find(ch => ch.id === id);
      employee.pos = { ...context.POS.coffee };
      employee.targetPos = { ...context.POS.coffee };

      context.scheduleNext(employee);

      expect(employee.targetPos).toEqual(context.POS[employee.deskId]);
      expect(employee.state).toBe('walking');
      expect(employee.task.endGT).toBeUndefined();
      expect(employee.task._duration).toBeGreaterThan(0);
    }
  );

  test('low work ethic does not send an employee home before 17:30', () => {
    const { context, sim } = createOffice();
    sim.gameTime = 17.2;
    const tech = sim.characters.find(c => c.id === 'tech');
    tech.traits = { ...tech.traits, workEthic: 0 };
    context.scheduleNext(tech);
    expect(tech.task.type).not.toBe('walk_to_door');
  });

  test('only the boss enters at 07:30 on the first day; staff enter at 08:00', () => {
    const { context, sim } = createOffice();
    sim.day = 1;
    sim.gameTime = 7.5;
    const boss = sim.characters.find(c => c.id === 'boss');
    const tech = sim.characters.find(c => c.id === 'tech');
    for (const ch of [boss, tech]) {
      ch.isPresent = false;
      ch.state = 'gone';
      context.scheduleNext(ch);
    }
    expect(boss.isPresent).toBe(true);
    expect(sim.punchRecords.boss.in).toBe(7.5);
    expect(tech.isPresent).toBe(false);
    expect(sim.punchRecords.tech).toBeUndefined();

    sim.gameTime = 8;
    context.scheduleNext(tech);
    expect(tech.isPresent).toBe(true);
    expect(sim.punchRecords.tech.in).toBe(8);
  });

  test('ordinary work schedules the employee at their desk without throwing', () => {
    const { context, sim } = createOffice(0.5);
    const tech = sim.characters.find(c => c.id === 'tech');
    expect(() => context.scheduleNext(tech)).not.toThrow();
    expect(context.isProjectWorkTask(tech.task)).toBe(true);
    expect(tech.targetPos).toEqual({ x: 6.9, y: 58.5 });
  });

  test('lunch at the desk replaces the previous walking destination', () => {
    const { context, sim } = createOffice(0.5);
    sim.gameTime = 12;
    const tech = sim.characters.find(c => c.id === 'tech');
    tech.pos = { x: 53.2, y: 59.5 };
    tech.targetPos = { ...tech.pos };
    context.scheduleNext(tech);
    expect(tech.task.type).toBe('lunch');
    expect(tech.targetPos).toEqual({ x: 6.9, y: 58.5 });
  });

  test('an employee can choose desk work during lunch and returns to their own seat first', () => {
    const { context, sim } = createOffice(0);
    sim.gameTime = 12;
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.pos = {...context.POS.coffee};
    context.scheduleNext(tech);
    expect(context.isProjectWorkTask(tech.task)).toBe(true);
    expect(tech.targetPos).toEqual({x: 6.9, y: 58.5});
    expect(tech.state).toBe('walking');
    expect(tech.task.endGT).toBeUndefined();
    expect(tech.task._duration).toBeGreaterThan(0);
  });

  test('a pending project interrupts outside leisure and preserves the original punch-in', () => {
    const { context, sim } = createOffice(0.99);
    const sales = vm.runInContext(`({
      ...CHARACTERS.find(c => c.id === 'sales'),
      employment: 'active', mood: moodFromValue(0.7), memories: [],
      isPresent: false, state: 'gone', pos: { x: 50, y: 95 },
      task: { type: 'outside_leisure', endGT: 12 }
    })`, context);
    sim.characters.push(sales);
    sim._projectAttempt = { proj: { id: 'pending' } };
    sim.dailyPunch.sales = { punchedIn: true, punchedOut: false };
    sim.punchRecords.sales = { in: 8, overtimeHours: 0 };

    context.scheduleNext(sales);

    expect(sales.isPresent).toBe(true);
    expect(sales.task.type).toBe('walk_to_desk');
    expect(sales.pos).toEqual({ x: 43, y: 88 });
    expect(sim.punchRecords.sales.in).toBe(8);
    expect(sim._projectAttempt.proj.id).toBe('pending');
  });
});

describe('office role actions', () => {
  test.each([[10, 1.12], [12, 0.84], [13, 1.12]])('an hour of work starting at %s has the correct lunch efficiency', (hour, expected) => {
    const { context, sim } = createOffice(0.5);
    sim.gameTime = hour + 1;
    sim.projects = [{type: 'tech', progress: 0, contributions: {}}];
    context.contributeToProject('tech', {type: 'work', startedGT: hour, endGT: hour + 1});
    expect(sim.projects[0].progress).toBeCloseTo(expected);
    expect(sim.projects[0].contributions.tech).toBeCloseTo(expected);
  });

  test.each([[11, 12], [12.5, 13.5]])('a task from %s to %s weights only time inside lunch', (start, end) => {
    const { context, sim } = createOffice(0.5);
    const tech = sim.characters.find(ch => ch.id === 'tech');
    sim.projects = [{type: 'tech', progress: 0, contributions: {}}];
    sim.gameTime = start;
    context.assignDeskTask(tech, {type: 'work'}, '工作中', end - start);
    sim.gameTime = end;
    context.contributeToProject('tech', tech.task);
    expect(sim.projects[0].progress).toBeCloseTo(0.98);
  });

  test('meetings can move employees away from their desks', () => {
    const { context, sim } = createOffice();
    const employee = sim.characters.find(ch => ch.id === 'tech');
    context.BIG_EVENTS.find(event => event.id === 'meeting').apply(employee);
    expect(context.getRoomAtPos(employee.targetPos.x, employee.targetPos.y)).toBe('meeting');
    expect(employee.task.type).toBe('big_meeting');
  });

  test('sales desk actions stay at their seat while client visits are dispatched separately', () => {
    const { context, sim } = createOffice(0, true);
    const sales = sim.characters.find(ch => ch.id === 'sales');
    context.pickRoleAction(sales);
    expect(sales.targetPos).toEqual(context.POS[sales.deskId]);
    expect(sales.task.isOutside).not.toBe(true);
    expect(sales.state).toBe('sitting');
  });

  test.each([['designer', 0.99], ['admin', 0.5], ['admin', 0.99]])(
    '%s performs professional tasks at their own seat (selection %s)', (id, random) => {
      const { context, sim } = createOffice(random);
      const employee = sim.characters.find(ch => ch.id === id);
      employee.pos = { ...context.POS.sofa };
      employee.targetPos = { ...context.POS.sofa };

      context.pickRoleAction(employee);

      expect(employee.targetPos).toEqual(context.POS[employee.deskId]);
      expect(employee.state).toBe('walking');
      expect(employee.task.endGT).toBeUndefined();
      expect(employee.task._duration).toBeGreaterThan(0);
    }
  );

  test.each(['tech', 'backend'])('%s repairs the server from their own seat', id => {
    const { context, sim } = createOffice();
    const employee = sim.characters.find(ch => ch.id === id);
    employee.pos = { ...context.POS.coffee };

    context.BIG_EVENTS.find(event => event.id === 'server_down').apply(employee);

    expect(employee.targetPos).toEqual(context.POS[employee.deskId]);
    expect(employee.state).toBe('walking');
    expect(employee.task.endGT).toBeUndefined();
  });
});
