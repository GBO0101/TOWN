import { afterEach, expect, test } from 'vitest';
import { loadOffice } from './office-helper.js';

let office;
afterEach(() => office?.close());

test.each([[1, 7 / 6, 6.0666666667], [0.8, 1.05, 5.46], [0.5, 0.875, 4.55]])('health %s scales delivered work and capacity without reducing actual experience hours', async (health, work, capacity) => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 10;
    sim.characters = sim.characters.filter(ch => ch.id === 'backend');
    const employee = sim.characters[0]; sim.health.backend = ${health};
    startNewProject({id: 'health-work', name: '健康效率', type: 'tech', work: 100, reward: 200000});
    employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[employee.deskId]}; employee.mood = moodFromValue(0.5);
    assignDeskTask(employee, {type: 'work'}, '實際開發', 1);
    sim.gameTime = 11; tick(0); tick(0);
  `);
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(work);
  expect(office.evaluate('projectDailyCapacity("tech")')).toBeCloseTo(capacity);
  expect(office.evaluate('sim.characters[0].career.totalHours')).toBeCloseTo(1);
  expect(office.errors).toEqual([]);
});

test('an employee earns experience from actual desk work without crediting the same interval twice', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 10;
    startNewProject({id: 'career-work', name: '累積經驗', type: 'tech', work: 100, reward: 200000});
    const employee = sim.characters.find(ch => ch.id === 'backend');
    employee.isPresent = true; employee.pos = {...POS[employee.deskId]}; employee.state = 'sitting';
    assignDeskTask(employee, {type: 'work'}, '專案工作', 1);
    sim.gameTime = 11; tick(0); tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career?.totalHours')).toBeCloseTo(1);
  expect(office.errors).toEqual([]);
});

test.each([
  ['lunch work', 'work', 12, 13, true, 0.75],
  ['internal work', 'work', 10, 11, true, 1],
  ['coffee break', 'coffee', 10, 11, true, 0],
  ['lunch break', 'lunch', 12, 13, true, 0],
  ['waiting to return to the desk', 'work', 10, 11, false, 0],
])('experience reflects %s rather than merely elapsed time', async (_label, type, start, end, atDesk, expected) => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = ${start};
    const employee = sim.characters.find(ch => ch.id === 'backend');
    employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[${atDesk} ? employee.deskId : 'sofa']};
    assignDeskTask(employee, {type: '${type}'}, '經驗邊界', 1);
    sim.gameTime = ${end}; tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.totalHours')).toBeCloseTo(expected);
  expect(office.errors).toEqual([]);
});

test('real sales visits earn experience and departure stops further accrual', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.day = 2; sim.gameTime = 10;
    const sales = sim.characters.find(ch => ch.id === 'sales');
    sales.isPresent = true; sales.pos = {...POS[sales.deskId]}; sales.state = 'sitting'; sales.task = null;
    sim._projectAttempt = {proj: pickProject(sales.id), salesId: sales.id, visitsNeeded: 1, visitsDone: 0, successRate: 1};
    ProjectPipeline.tick(10);
    for (let n = 0; n < 100; n++) CharacterSimulation.tick(1 / CFG.tickHz);
    sim.gameTime = 11; tick(0); tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").career.totalHours')).toBeCloseTo(1);
  office.evaluate(`sim.gameTime = 11.5; retireCharacter('sales'); sim.gameTime = 12; tick(0);`);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").career.totalHours')).toBeCloseTo(1.5);
  expect(office.errors).toEqual([]);
});

async function workingOffice(work = 100, start = 10, duration = 1) {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99;
    sim.gameTime = ${start};
    startNewProject({id: 'work-a', name: '工程專案 A', type: 'tech', work: ${work}, reward: 100000});
    const employee = sim.characters.find(ch => ch.id === 'tech');
    employee.isPresent = true; employee.pos = {...POS.desk1}; employee.mood = moodFromValue(0.5);
    assignDeskTask(employee, {type: 'work'}, '開發中', ${duration});
  `);
}

test('a large backlog cannot leave a smaller unfinished contract without any assigned worker', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 9;
    sim.characters = sim.characters.filter(ch => ['tech', 'backend'].includes(ch.id));
    startNewProject({id: 'large', name: '大型工程', type: 'tech', work: 1000, reward: 3000000});
    startNewProject({id: 'small', name: '小型維護', type: 'tech', work: 10, reward: 50000});
    for (const ch of sim.characters) {
      ch.isPresent = true; ch.state = 'sitting'; ch.pos = {...POS[ch.deskId]}; ch.task = null;
      assignDeskTask(ch, {type: 'work'}, '處理已簽專案', 0.5);
    }
    sim.gameTime = 9.5; updateProjectWork();
  `);
  expect(office.evaluate('sim.projects.map(project => projectWorkSnapshot(project).assigned.length)')).toEqual([1, 1]);
  expect(office.evaluate('sim.projects.find(project => project.id === "small").workDone')).toBeGreaterThan(0);
  expect(office.errors).toEqual([]);
});

test('an almost finished contract is delivered before a large backlog takes the only engineer', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 9;
    sim.characters = sim.characters.filter(ch => ch.id === 'tech');
    startNewProject({id: 'large', name: '大型工程', type: 'tech', work: 1000, reward: 3000000});
    const finishing = startNewProject({id: 'finishing', name: '即將完成', type: 'tech', work: 10, reward: 50000});
    finishing.workDone = 9.8; finishing.progress = 98; finishing.contributions.tech = 9.8;
    const tech = sim.characters[0]; tech.isPresent = true; tech.state = 'sitting'; tech.pos = {...POS[tech.deskId]}; tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '完成收尾', 0.5);
    sim.gameTime = 9.5; updateProjectWork();
  `);
  expect(office.evaluate('sim.projects.some(project => project.id === "finishing")')).toBe(false);
  expect(office.evaluate('sim.lastProjectResult.id')).toBe('finishing');
  expect(office.errors).toEqual([]);
});

test('new contract deadlines include the work already promised to the same specialists', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.characters = sim.characters.filter(ch => ch.id === 'tech');
    const first = startNewProject({id: 'first', name: '已簽案', type: 'tech', work: 100, reward: 200000});
    window.firstDeadline = first.deadlineDay;
    window.second = startNewProject({id: 'second', name: '後簽案', type: 'tech', work: 100, reward: 200000});
  `);
  expect(office.evaluate('window.second.deadlineDay')).toBeGreaterThan(office.evaluate('window.firstDeadline'));
});

test('a contract waiting over two hours receives work even when another backlog is much larger', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.gameTime = 9; sim.characters = sim.characters.filter(ch => ch.id === 'tech');
    const large = startNewProject({id: 'large', name: '大型工程', type: 'tech', work: 1000, reward: 3000000});
    startNewProject({id: 'waiting', name: '等待中的合約', type: 'tech', work: 10, reward: 50000});
    sim.gameTime = 11.1; large.lastWorkedAt = sim.day * 24 + sim.gameTime;
    const tech = sim.characters[0]; tech.isPresent = true; tech.pos = {...POS[tech.deskId]}; tech.state = 'sitting'; tech.task = null;
    assignDeskTask(tech, {type: 'work'}, '接續已簽案件', 0.5);
  `);
  expect(office.evaluate('sim.characters[0].task.projectId')).toBe('waiting');
  expect(office.errors).toEqual([]);
});

test('work advances during a task and completion cannot credit the same interval twice', async () => {
  await workingOffice();
  office.evaluate('sim.gameTime = 10.5; tick(0);');
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(0.5);
  office.evaluate(`
    const task = sim.characters.find(ch => ch.id === 'tech').task;
    contributeToProject('tech', task); contributeToProject('tech', task);
  `);
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(0.5);
  office.evaluate('sim.gameTime = 11; tick(0);');
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(1);
  expect(office.errors).toEqual([]);
});

test('a meeting preserves earlier desk work and does not count meeting or walking time', async () => {
  await workingOffice();
  office.evaluate(`
    sim.gameTime = 10.5;
    BIG_EVENTS.find(event => event.id === 'meeting').apply(sim.characters.find(ch => ch.id === 'tech'));
    sim.gameTime = 11; tick(0);
  `);
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(0.5);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.type')).toBe('big_meeting');
  expect(office.errors).toEqual([]);
});

test('leaving employment keeps completed time and releases the unfinished task', async () => {
  await workingOffice();
  office.evaluate('sim.gameTime = 10.5; retireCharacter("tech"); sim.gameTime = 11; tick(0);');
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(0.5);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task')).toBeNull();
  expect(office.errors).toEqual([]);
});

test('day closing credits work up to 20:30 before clearing the task', async () => {
  await workingOffice(100, 20, 1);
  office.evaluate('sim.gameTime = 20.5; tick(0); tick(0);');
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(0.5);
  expect(office.evaluate('sim.day')).toBe(2);
  expect(office.errors).toEqual([]);
});

test('incremental progress applies lunch efficiency only to the actual lunch interval', async () => {
  await workingOffice(100, 11, 2);
  office.evaluate('sim.gameTime = 12; tick(0);');
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(0.875);
  office.evaluate('sim.gameTime = 13; tick(0);');
  expect(office.evaluate('sim.projects[0].workDone')).toBeCloseTo(1.625);
  expect(office.errors).toEqual([]);
});

test('equally urgent projects receive separate engineering workers instead of all workers choosing the first project', async () => {
  await workingOffice();
  office.evaluate(`
    startNewProject({id: 'work-b', name: '工程專案 B', type: 'tech', work: 100, reward: 100000});
    sim.projects.forEach(project => project.deadlineDay = 6);
    const backend = sim.characters.find(ch => ch.id === 'backend');
    backend.isPresent = true; backend.pos = {...POS.desk5}; backend.mood = moodFromValue(0.5);
    assignDeskTask(backend, {type: 'work'}, '開發中', 1);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").task.projectId')).toBe('work-a');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").task.projectId')).toBe('work-b');
  office.evaluate('sim.gameTime = 11; tick(0);');
  expect(office.evaluate('sim.projects.find(project => project.id === "work-a").workDone')).toBeCloseTo(1);
  expect(office.evaluate('sim.projects.find(project => project.id === "work-b").workDone')).toBeCloseTo(7 / 6);
  expect(office.errors).toEqual([]);
});

test('delivery releases the other workers and retains the result for the progress display', async () => {
  await workingOffice(0.25);
  office.evaluate(`
    const backend = sim.characters.find(ch => ch.id === 'backend');
    backend.isPresent = true; backend.pos = {...POS.desk5};
    assignDeskTask(backend, {type: 'work'}, '開發中', 1);
    sim.gameTime = 10.5;
    const tech = sim.characters.find(ch => ch.id === 'tech');
    contributeToProject(tech.id, tech.task);
  `);
  expect(office.evaluate('sim.projects.length')).toBe(0);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").task')).toBeNull();
  expect(office.evaluate('sim.lastProjectResult')).toMatchObject({name: '工程專案 A', status: 'completed', workDone: 0.25, progress: 100});
  expect(office.evaluate('sim.finance.revenue')).toBe(100000);
  expect(office.errors).toEqual([]);
});

test('an old task cannot add work to a later contract with the same project template id', async () => {
  await workingOffice(0.25);
  office.evaluate(`
    window.previousTask = sim.characters.find(ch => ch.id === 'tech').task;
    sim.gameTime = 10.25; contributeToProject('tech', window.previousTask);
    startNewProject({id: 'work-a', name: '新一期工程', type: 'tech', work: 100, reward: 100000});
    sim.gameTime = 10.5; contributeToProject('tech', window.previousTask);
  `);
  expect(office.evaluate('sim.projects[0].workDone')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('the page shows each project, its current worker count and remaining standard hours with a weighted overall bar', async () => {
  await workingOffice();
  office.evaluate(`
    startNewProject({id: 'design-job', name: '設計專案', type: 'design', work: 200, reward: 100000});
    sim.gameTime = 10.5; tick(0); render();
  `);
  const document = office.window.document;
  const cards = document.querySelectorAll('.project-progress-card[data-status="active"]');
  expect(cards).toHaveLength(2);
  const engineering = document.querySelector('.project-progress-card[data-project-id="work-a"]');
  expect(engineering.textContent).toContain('剩餘 99.5 標準人時');
  expect(engineering.textContent).toContain('工作 1 人');
  expect(engineering.textContent).toContain('李志明');
  expect(parseFloat(document.getElementById('projectBarFill').style.width)).toBeCloseTo(0.166667);
  const actor = document.querySelector('.office-char[data-char-id="tech"]');
  expect(actor.querySelector('.char-progress-bar').hidden).toBe(false);
  expect(actor.querySelector('.char-progress-fill').style.width).toBe('50%');
  expect(office.errors).toEqual([]);
});

test('worker counts exclude people walking to their desks and former contributors who have left', async () => {
  await workingOffice();
  office.evaluate(`
    const backend = sim.characters.find(ch => ch.id === 'backend');
    backend.isPresent = true; backend.pos = {...POS.sofa};
    assignDeskTask(backend, {type: 'work'}, '開發中', 1);
    sim.gameTime = 10.5; tick(0); render();
  `);
  const document = office.window.document;
  expect(document.querySelector('.project-personnel').textContent).toBe('工作 1 人 · 分派 2 人');
  office.evaluate('retireCharacter("tech"); render();');
  expect(document.querySelector('.project-personnel').textContent).toBe('工作 0 人 · 分派 1 人');
  expect(document.querySelector('.project-team').textContent).not.toContain('李志明');
  expect(office.evaluate('sim.projects[0].contributions.tech')).toBeCloseTo(0.5);
  expect(office.errors).toEqual([]);
});

test('work completed exactly at the contract deadline is delivered before expiry processing', async () => {
  await workingOffice(0.5, 17, 1);
  office.evaluate('sim.projects[0].deadlineDay = 1; sim.gameTime = 17.5; tick(0); render();');
  expect(office.evaluate('sim.lastProjectResult.status')).toBe('completed');
  expect(office.evaluate('sim.finance.revenue')).toBe(100000);
  expect(office.window.document.querySelector('.project-progress-card').dataset.status).toBe('completed');
  expect(office.window.document.getElementById('projectLabel').textContent).toContain('最近交付');
  expect(office.errors).toEqual([]);
});

test('work begun without a contract is not later charged to a newly signed project', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.gameTime = 10;
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = true; tech.pos = {...POS.desk1}; tech.mood = moodFromValue(0.5);
    assignDeskTask(tech, {type: 'work'}, '內部工作', 1);
    window.internalTask = tech.task;
    sim.gameTime = 10.5;
    startNewProject({id: 'new-job', name: '新合約', type: 'tech', work: 100, reward: 100000});
    contributeToProject('tech', window.internalTask);
  `);
  expect(office.evaluate('sim.projects[0].workDone')).toBe(0);
  expect(office.errors).toEqual([]);
});
