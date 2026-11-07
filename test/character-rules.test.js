import { afterEach, expect, test } from 'vitest';
import { loadOffice } from './office-helper.js';

let office;
afterEach(() => office?.close());

test('a normal workday restores health while two actual overtime hours consume it', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 9;
    sim.characters = sim.characters.filter(ch => ['tech', 'backend'].includes(ch.id));
    for (const employee of sim.characters) {
      sim.health[employee.id] = 0.6; employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[employee.deskId]};
      assignDeskTask(employee, {type: 'work'}, '正常工作', 8);
    }
    sim.gameTime = 17; tick(0); for (const employee of sim.characters) employee.task = null;
    sim.gameTime = 17.5; assignDeskTask(sim.characters.find(ch => ch.id === 'backend'), {type: 'overtime'}, '實際加班', 2);
    sim.gameTime = 19.5; tick(0); for (const employee of sim.characters) employee.task = null;
    sim.gameTime = 20.5; tick(0);
  `);
  expect(office.evaluate('sim.health.tech')).toBeCloseTo(0.628);
  expect(office.evaluate('sim.health.backend')).toBeCloseTo(0.52);
  expect(office.errors).toEqual([]);
});

test('an employee below 70 percent health goes home instead of taking available overtime', async () => {
  await readyEmployee('tech', 18);
  office.evaluate(`sim.health.tech = 0.65; sim.overtimePolicy = 'flexible'; scheduleNext(sim.characters.find(ch => ch.id === 'tech'));`);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.type')).toBe('walk_to_door');
  expect(office.errors).toEqual([]);
});

test('low health triggers paid recovery leave until 75 percent without work, lateness or lost wages', async () => {
  office = await loadOffice();
  office.evaluate(`Math.random = () => 0.99; sim.health.backend = 0.2; sim.gameTime = 20.5; tick(0);`);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").healthLeave')).toBe(true);
  office.evaluate('sim.gameTime = 10; tick(0); render();');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").isPresent')).toBe(false);
  expect(office.evaluate('CharacterRules.status(sim.characters.find(ch => ch.id === "backend")).key')).toBe('health_leave');
  expect(office.evaluate('sim.dailyPunch.backend.punchedIn')).toBe(false);
  office.evaluate('sim.gameTime = 20.5; tick(0);');
  expect(office.evaluate('sim.health.backend')).toBeCloseTo(0.51);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").healthLeave')).toBe(true);
  office.evaluate('sim.gameTime = 10; tick(0); sim.gameTime = 20.5; tick(0);');
  expect(office.evaluate('sim.health.backend')).toBeCloseTo(0.76);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").healthLeave')).toBe(false);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.totalHours')).toBe(0);
  expect(office.evaluate('sim.finance.payables.filter(item => item.employeeId === "backend" && item.category === "月薪").reduce((sum, item) => sum + item.amount, 0)')).toBe(7909);
  expect(office.evaluate('sim.lateRecords.filter(record => record.charId === "backend").length')).toBe(0);
  office.evaluate('sim.gameTime = 8; tick(0);');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").isPresent')).toBe(true);
  expect(office.errors).toEqual([]);
});

async function readyEmployee(id = 'tech', hour = 10) {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99;
    sim.gameTime = ${hour};
    const employee = sim.characters.find(ch => ch.id === '${id}');
    employee.isPresent = true; employee.pos = {...POS[employee.deskId]}; employee.state = 'sitting'; employee.task = null;
    employee.mood = moodFromValue(0.7); sim.hasLeftToday[employee.id] = false;
    startNewProject({id: 'rules-project', name: '行為規則測試', type: 'tech', work: 100, reward: 100000});
  `);
}

test('rescheduling keeps an active task and its destination until the task completes', async () => {
  await readyEmployee();
  office.evaluate(`
    const employee = sim.characters.find(ch => ch.id === 'tech');
    assignDeskTask(employee, {type: 'work'}, '既定工作', 0.8);
    window.activeTask = employee.task;
    sim.gameTime = 10.2; scheduleNext(employee);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task === window.activeTask')).toBe(true);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").targetPos')).toEqual({x: 6.9, y: 58.5});
  expect(office.errors).toEqual([]);
});

test('overtime policy changes a qualified employee’s actual action rather than only the office label', async () => {
  await readyEmployee('tech', 18);
  office.evaluate('sim.overtimePolicy = "normal"; scheduleNext(sim.characters.find(ch => ch.id === "tech"));');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.type')).toBe('overtime');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.endGT')).toBeLessThanOrEqual(18.5);
  expect(office.errors).toEqual([]);
});

test('a lunch task is protected from sales dispatch', async () => {
  await readyEmployee('sales', 13);
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === 'sales');
    assignDeskTask(sales, {type: 'lunch'}, '午餐中', 0.5);
    window.mealTask = sales.task;
    sim._projectAttempt = {proj: pickProject(), salesId: sales.id, visitsDone: 0, visitsNeeded: 1, successRate: 1};
    ProjectPipeline.tick(13);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").task === window.mealTask')).toBe(true);
  expect(office.errors).toEqual([]);
});

test('an employee chooses lunch once and resumes work after eating instead of starting another meal', async () => {
  await readyEmployee('tech', 12);
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    scheduleNext(tech);
    sim.gameTime = tech.task.endGT;
    CharacterSimulation.tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").behavior.lunchDone')).toBe(true);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.type')).not.toBe('lunch');
  expect(office.errors).toEqual([]);
});

test('field assignments are shown consistently and health is separate from mood', async () => {
  await readyEmployee('sales', 10);
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = false; sales.state = 'gone'; sales.currentAction = '拜訪客戶';
    sales.task = {type: 'client_visit', isOutside: true, endGT: 12, maxProgress: 3, progress: 1};
    sim.health.sales = 0.25; render(); openCharPopup('sales');
  `);
  const document = office.window.document;
  const card = document.querySelector('.char-card[data-char-id="sales"]');
  expect(card.querySelector('.char-status-text').textContent).toContain('外勤');
  expect(card.querySelector('.char-status-text').textContent).not.toContain('💤');
  expect(card.querySelector('.char-memory-count').textContent).toContain('25%');
  expect(document.querySelector('.office-char[data-char-id="sales"]').getAttribute('aria-label')).toContain('外勤');
  expect(document.getElementById('popupAction').textContent).toContain('外勤');
  office.evaluate('retireCharacter("sales"); render();');
  expect(document.getElementById('popupAction').textContent).toContain('已退休');
  expect(office.errors).toEqual([]);
});

test('a pending sales lead does not recall a person who already clocked out', async () => {
  await readyEmployee('sales', 20.1);
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = false; sales.state = 'gone'; sales.task = null;
    sim.hasLeftToday.sales = true;
    sim.dailyPunch.sales = {punchedIn: true, punchedOut: true};
    sim.punchRecords.sales = {in: 8, out: 17.5};
    sim._projectAttempt = {proj: pickProject(), salesId: sales.id};
    scheduleNext(sales); ProjectPipeline.tick(20.1);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").isPresent')).toBe(false);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").task')).toBeNull();
  expect(office.evaluate('sim.hasLeftToday.sales')).toBe(true);
});

test('sales visits return through the office before the next dispatch and do not duplicate clock-in', async () => {
  await readyEmployee('sales', 9);
  const result = office.evaluate(`(() => {
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sim.dailyPunch.sales = {punchedIn: true, punchedOut: false};
    sim.punchRecords.sales = {in: 8, overtimeHours: 0};
    sales.task = {type: 'break', endGT: 10};
    sim._projectAttempt = {proj: pickProject(), salesId: sales.id, visitsDone: 0, visitsNeeded: 2, successRate: 1};
    let returned = false, firstFinished = false, secondStarted = false;
    for (let n = 0; n < 2600 && sim._projectAttempt; n++) {
      tick(1 / CFG.tickHz);
      if (sim._projectAttempt?.visitsDone === 1) {
        firstFinished = true;
        if (sales.isPresent && distance(sales.pos, POS[sales.deskId]) < 0.5) returned = true;
        if (sales.task?.type === 'client_visit' && sales.task._projectAttemptId === sim._projectAttempt.proj.id) {
          if (!returned) throw Error('Second visit started before returning to the desk');
          secondStarted = true;
        }
      }
    }
    return {firstFinished, returned, secondStarted, accepted: sim.projects.length, clockIn: sim.punchRecords.sales.in};
  })()`);
  expect(result).toEqual({firstFinished: true, returned: true, secondStarted: true, accepted: 2, clockIn: 8});
  expect(office.errors).toEqual([]);
});

test('late evening departure still reaches the door and records overtime', async () => {
  await readyEmployee('tech', 20.125);
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.salary = 36000;
    sim.dailyPunch.tech = {punchedIn: true, punchedOut: false}; sim.punchRecords.tech = {in: 8};
    scheduleNext(tech); tech.pos = {...DOOR_POS}; CharacterSimulation.tick(0);
  `);
  expect(office.evaluate('sim.dailyPunch.tech.punchedOut')).toBe(true);
  expect(office.evaluate('sim.punchRecords.tech.out')).toBe(20.125);
  expect(office.evaluate('sim.finance.payables.find(item => item.category === "加班費" && item.employeeId === "tech").amount')).toBe(557);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").isPresent')).toBe(false);
  expect(office.errors).toEqual([]);
});

test('strict overtime policy sends the employee home and does not claim anyone is working overtime', async () => {
  await readyEmployee('tech', 18);
  office.evaluate('sim.overtimePolicy = "strict"; scheduleNext(sim.characters.find(ch => ch.id === "tech")); render();');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.type')).toBe('walk_to_door');
  expect(office.window.document.getElementById('officeStatus').textContent).not.toContain('加班中');
});

test('retired employees keep their last health record and no longer receive after-work or mood events', async () => {
  await readyEmployee();
  office.evaluate(`
    sim.health.tech = 0.25;
    retireCharacter('tech'); window.retiredMood = sim.characters.find(ch => ch.id === 'tech').mood.value;
    sim.gameTime = 18; OfficeEvents.tick(0, 18);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").healthAtDeparture')).toBe(0.25);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").mood.value')).toBe(office.evaluate('window.retiredMood'));
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech")._afterWorkEvent')).toBeNull();
  expect(office.errors).toEqual([]);
});

test('returning to the desk cannot extend work past the strict policy cutoff', async () => {
  await readyEmployee('tech', 17.49);
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    sim.overtimePolicy = 'strict'; tech.pos = {...POS.sofa};
    scheduleNext(tech);
    sim.gameTime = 17.6; tech.pos = {...POS[tech.deskId]}; CharacterSimulation.tick(0);
    sim.gameTime = 17.65; updateProjectWork();
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.type')).toBe('walk_to_door');
  expect(office.evaluate('sim.projects[0].workDone')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('day close records missing clock-out before accruing the day’s payables', async () => {
  await readyEmployee('tech', 20.5);
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech'); tech.salary = 36000;
    sim.dailyPunch.tech = {punchedIn: true, punchedOut: false}; sim.punchRecords.tech = {in: 8};
    SimulationDay.startNextDay();
  `);
  expect(office.evaluate('sim.finance.payables.filter(item => item.category === "加班費" && item.employeeId === "tech").map(item => item.amount)')).toEqual([650]);
  expect(office.evaluate('sim.day')).toBe(2);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task')).toBeNull();
  expect(office.errors).toEqual([]);
});

test('newly hired engineers follow the same server repair rules as the original engineers', async () => {
  await readyEmployee();
  office.evaluate(`
    const tech = sim.characters.find(ch => ch.id === 'tech');
    const recruit = {...tech, id: 'new-engineer', field: 'tech', role: '工程師', pos: {...POS.sofa}, task: null};
    sim.characters.push(recruit); sim.health[recruit.id] = 1;
    BIG_EVENTS.find(event => event.id === 'server_down').apply(recruit);
    window.recruit = recruit;
  `);
  expect(office.evaluate('window.recruit.task.type')).toBe('big_serverdown');
  expect(office.evaluate('window.recruit.targetPos')).toEqual(office.evaluate('POS[window.recruit.deskId]'));
  expect(office.evaluate('window.recruit.state')).toBe('walking');
  expect(office.errors).toEqual([]);
});
