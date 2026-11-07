import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { readOfficePage } from './office-scripts.js';

function loadOffice() {
  const context = createContext({
    document, console, setTimeout, clearTimeout,
    requestAnimationFrame: vi.fn(), cancelAnimationFrame: vi.fn(),
  });
  for (const { path, source } of readOfficePage().scripts) {
    runInContext(source, context, { filename: path });
  }
  return { context, run: code => runInContext(code, context) };
}

beforeEach(() => {
  const { html } = readOfficePage();
  document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)[1]
    .replace(/<script\b[\s\S]*?<\/script>/gi, '');
});

describe('initSim()', () => {
  test('starts each game with fresh policies, counters, projects and employee health', () => {
    const office = loadOffice();
    office.run(`
      initSim();
      sim.overtimePolicy = 'flexible';
      sim._projectAttempt = { proj: { id: 'old-project' } };
      sim._bossPolicyDay = 7;
      sim._bossDrinkingDay = 7;
      sim._bigEventDay = 7;
      sim._bigEventCooldown = 39;
      sim._clientVisitCount = 5;
      sim._doorNotified = true;
      sim._otNotified = true;
      sim._salesCommissions = { sales: 100 };
      sim._lastSalaryDay = 7;
      sim._lastCleanupDay = 7;
      sim._forcedProjectDay = 7;
      sim._daysNoProject = 7;
      sim.speed = 3;
      sim.health = { departed_employee: 0.2 };
      sim.dailyExpenses = {營運: 100};
      sim.lastSettlement = {day: 5, total: 100};
      sim._lastSettlementDay = 5;
      CompanyFinance.charge(300, '舊帳');
      sim.finance.receivables.push({amount: 500, dueDay: 22});
      sim.finance.advances.old = 100;
      sim.finance.revenue = 600;
      sim.finance.programs.push({untilDay: 22});
      bossTakeLoan(100000);
      sim.company.seats = 20;
      sim.company.expansion = {additionalSeats: 2, readyDay: 9};
      sim.company.recruitment = {candidateId: 'old', readyDay: 9};
      sim.company.candidates.push({id: 'old'});
      sim.lastProjectResult = {name: '舊專案', status: 'completed'};
      sim.nextProjectId = 80;
      sim.characters.push({ id: 'departed_employee' });
      initSim();
    `);
    expect(office.run(`({
      policy: sim.overtimePolicy, attempt: sim._projectAttempt,
      policyDay: sim._bossPolicyDay, drinkingDay: sim._bossDrinkingDay,
      eventDay: sim._bigEventDay, cooldown: sim._bigEventCooldown,
      visits: sim._clientVisitCount, door: sim._doorNotified, overtime: sim._otNotified,
      commissions: sim._salesCommissions, speed: sim.speed,
      salaryDay: sim._lastSalaryDay, cleanupDay: sim._lastCleanupDay,
      forcedProjectDay: sim._forcedProjectDay, daysNoProject: sim._daysNoProject,
      health: sim.health, day: sim.day, gameTime: sim.gameTime,
      expenses: sim.dailyExpenses, settlement: sim.lastSettlement, settlementDay: sim._lastSettlementDay,
      financeFresh: JSON.stringify(sim.finance) === JSON.stringify(CompanyFinance.createState()),
      cash: sim.budget, loans: sim.loans,
      companyFresh: JSON.stringify(sim.company) === JSON.stringify(CompanyGrowth.createState()),
      lastProject: sim.lastProjectResult, nextProjectId: sim.nextProjectId,
    })`)).toEqual({
      policy: 'strict', attempt: null, policyDay: 0, drinkingDay: 0,
      eventDay: -99, cooldown: 0, visits: 0, door: false, overtime: false,
      commissions: {}, speed: 1,
      salaryDay: 0, cleanupDay: 0, forcedProjectDay: 0, daysNoProject: 0,
      health: { boss: 1, tech: 1, designer: 1, admin: 1, marketing: 1, backend: 1, sales: 1 },
      day: 1, gameTime: 7.5,
      expenses: {}, settlement: null, settlementDay: 0,
      financeFresh: true, cash: 1000000, loans: [],
      companyFresh: true,
      lastProject: null, nextProjectId: 0,
    });
  });
});

describe('render()', () => {
  test('draws the current state without starting additional animation loops', () => {
    const office = loadOffice();
    office.run('initSim(); render(); render();');
    expect(document.getElementById('timeDisplay').textContent).toBe('07:30');
    expect(document.querySelectorAll('.char-card')).toHaveLength(7);
    expect(office.context.requestAnimationFrame).not.toHaveBeenCalled();
  });

  test('keeps the timeline current when old events are removed', () => {
    const office = loadOffice();
    office.run(`
      initSim();
      sim.events = [
        { id: 2, day: 1, type: 'note', text: '第二筆' },
        { id: 1, day: 1, type: 'note', text: '第一筆' },
      ];
      render();
      sim.events = [{ id: 3, day: 1, type: 'note', text: '最新事件' }, sim.events[0]];
      render();
    `);
    const visibleEvents = () => [...document.querySelectorAll('.event-text')].map(el => el.textContent);
    expect(visibleEvents()).toEqual(['第二筆', '最新事件']);
    office.run('sim.events = sim.events.slice(0, 1); render();');
    expect(visibleEvents()).toEqual(['最新事件']);
  });

  test('groups the timeline by day and refreshes after a new simulation reuses event ids', () => {
    const office = loadOffice();
    office.run(`
      initSim();
      sim.events = [
        {id: 3, day: 2, type: 'note', text: '第三筆'},
        {id: 2, day: 2, type: 'note', text: '第二筆'},
        {id: 1, day: 1, type: 'note', text: '第一筆'},
      ];
      render();
    `);
    expect([...document.querySelectorAll('.day-sep')].map(el => el.textContent)).toEqual(['📅 第 1 天', '📅 第 2 天']);
    office.run(`
      initSim();
      sim.events = [
        {id: 3, day: 2, type: 'note', text: '新模擬第三筆'},
        {id: 2, day: 2, type: 'note', text: '新模擬第二筆'},
        {id: 1, day: 1, type: 'note', text: '新模擬第一筆'},
      ];
      render();
    `);
    expect([...document.querySelectorAll('.event-text')].map(el => el.textContent)).toEqual([
      '新模擬第一筆', '新模擬第二筆', '新模擬第三筆',
    ]);
  });
});
