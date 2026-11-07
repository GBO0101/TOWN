import { afterEach, expect, test } from 'vitest';
import { loadOffice } from './office-helper.js';

let office;
afterEach(() => office?.close());

test('rehiring retains poor health and paid recovery leave without freeing the assigned desk', async () => {
  office = await loadOffice();
  office.evaluate(`
    retireCharacter('backend'); hireCharacter('intern1'); sim.health.intern1 = 0.2;
    fireCharacter('intern1'); sim._hiredToday = false; hireCharacter('intern1'); render();
  `);
  expect(office.evaluate('sim.health.intern1')).toBe(0.2);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").healthLeave')).toBe(true);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").isPresent')).toBe(false);
  expect(office.evaluate('sim.dailyPunch.intern1.punchedIn')).toBe(false);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").deskId')).toBe('desk5');
  expect(office.evaluate('sim.company.vacancies.tech')).toBe(0);
  expect(office.errors).toEqual([]);
});

async function growingOffice() {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99;
    sim.budget = 4000000;
    startNewProject({id: 'large-job', name: '大型工程合約', type: 'tech', work: 1000, reward: 1000000});
  `);
}

function review(day) {
  office.evaluate(`if (sim.day !== ${day}) sim._hiredToday = false; sim.day = ${day}; sim.gameTime = 9; tick(0);`);
}

test('internship conversion requires work experience and rehiring preserves the earned grade and salary', async () => {
  office = await loadOffice();
  office.evaluate(`
    retireCharacter('backend'); hireCharacter('intern1');
    sim.day = 21; sim.gameTime = 10; Math.random = () => 0; tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").seniority')).toBe('intern');
  office.evaluate(`
    Math.random = () => 0.99;
    const employee = sim.characters.find(ch => ch.id === 'intern1');
    employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[employee.deskId]};
    employee.career.hours = 79; employee.career.totalHours = 79;
    assignDeskTask(employee, {type: 'work'}, '實際工作', 1);
    sim.gameTime = 11; tick(0); employee.task = null;
    sim.gameTime = 20.5; tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").role')).toBe('初階工程師');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").salary')).toBe(45000);
  office.evaluate(`fireCharacter('intern1'); sim._hiredToday = false; hireCharacter('intern1');`);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").career.level')).toBe(1);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").career.totalHours')).toBeCloseTo(80);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "intern1").salary')).toBe(45000);
  expect(office.errors).toEqual([]);
});

test.each(['tech', 'backend', 'designer', 'marketing', 'admin', 'sales'])('a retired %s is replaced even without a project backlog', async charId => {
  office = await loadOffice();
  const field = office.evaluate(`sim.characters.find(ch => ch.id === '${charId}').field`);
  const originalCount = office.evaluate(`sim.characters.filter(ch => ch.field === '${field}').length`);
  office.evaluate(`Math.random = () => 0.99; sim.budget = 4000000; retireCharacter('${charId}');`);
  review(1); review(2); review(3); review(6);
  expect(office.evaluate(`sim.characters.filter(ch => ch.employment !== 'departed' && ch.field === '${field}').length`)).toBe(originalCount);
  expect(office.evaluate(`sim.characters.find(ch => ch.id === '${charId}').employment`)).toBe('departed');
  expect(office.evaluate(`sim.company.vacancies['${field}']`)).toBe(0);
  expect(office.evaluate('sim.company.seats')).toBe(6);
  expect(office.errors).toEqual([]);
});

test('a company can fund growth with one month of existing operations and three months of added costs', async () => {
  await growingOffice();
  office.evaluate('sim.budget = 1500000;');
  review(1); review(2); review(3);
  expect(office.evaluate('sim.company.expansion')).toMatchObject({additionalSeats: 1, readyDay: 6});
  review(6); review(9);
  expect(office.evaluate('sim.characters.filter(ch => ch.employment !== "departed").length')).toBe(8);
  expect(office.evaluate('CompanyFinance.available()')).toBeGreaterThan(office.evaluate('CompanyFinance.monthlyBurn()'));
  expect(office.errors).toEqual([]);
});

test('expansion chooses an affordable candidate after including fitout and additional rent reserves', async () => {
  await growingOffice();
  office.evaluate('sim.budget = 1230000;');
  review(1); review(2); review(3);
  expect(office.evaluate('sim.company.expansion')).toMatchObject({additionalSeats: 1});
  review(6);
  expect(office.evaluate('CompanyGrowth.candidates().find(candidate => candidate.id === sim.company.recruitment?.candidateId)?.salary')).toBe(30000);
  review(9);
  expect(office.evaluate('sim.characters.filter(ch => ch.employment !== "departed").length')).toBe(8);
  expect(office.errors).toEqual([]);
});

test('persistent demand expands only the required seats after a fit-out period and pays through the daily batch', async () => {
  await growingOffice();
  review(1); review(2);
  expect(office.evaluate('sim.company.expansion')).toBeNull();
  review(3);
  expect(office.evaluate('sim.company.seats')).toBe(6);
  expect(office.evaluate('sim.company.expansion')).toMatchObject({additionalSeats: 1, readyDay: 6});
  expect(office.evaluate('sim.budget')).toBe(4300000);
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(20000);
  office.evaluate('tick(0);');
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(20000);
  office.evaluate('sim.gameTime = 20.5; tick(0);');
  expect(office.evaluate('sim.budget')).toBe(4280000);
  review(6);
  expect(office.evaluate('sim.company.seats')).toBe(7);
  expect(office.evaluate('CompanyFinance.monthlyBurn()')).toBe(759500);
  expect(office.errors).toEqual([]);
});

test('the boss recruits the missing profession and the employee joins an unlocked desk after the recruitment wait', async () => {
  await growingOffice();
  review(1); review(2); review(3); review(6);
  expect(office.evaluate('sim.company.recruitment')).toMatchObject({candidateId: 'senior_dev', readyDay: 9});
  expect(office.evaluate('sim.characters.length')).toBe(7);
  review(8);
  expect(office.evaluate('sim.characters.length')).toBe(7);
  review(9);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "senior_dev")')).toMatchObject({employment: 'active', deskId: 'desk7', hireDay: 9});
  expect(office.evaluate('sim.characters.find(ch => ch.id === "senior_dev").targetPos')).toEqual({x: 6.9, y: 88.5});
  expect(office.evaluate('sim.dailyPunch.senior_dev.punchedIn')).toBe(true);
  expect(office.evaluate('sim.lateRecords.some(record => record.charId === "senior_dev")')).toBe(false);
  expect(office.evaluate('sim.relationships.tech.senior_dev')).toBeDefined();
  expect(office.errors).toEqual([]);
});

test('a new engineer uses engineering actions and contributes from their own new workstation', async () => {
  await growingOffice();
  review(1); review(2); review(3); review(6); review(9);
  office.evaluate(`
    const employee = sim.characters.find(ch => ch.id === 'senior_dev');
    employee.pos = {...POS[employee.deskId]}; employee.mood = moodFromValue(0.5);
    sim.gameTime = 10; pickRoleAction(employee);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "senior_dev").task.roleAction')).toBeDefined();
  office.evaluate(`
    const employee = sim.characters.find(ch => ch.id === 'senior_dev');
    assignDeskTask(employee, {type: 'work'}, '程式開發', 1);
    sim.gameTime = 11; contributeToProject(employee.id, employee.task);
  `);
  expect(office.evaluate('sim.projects[0].contributions.senior_dev')).toBeCloseTo(1.5);
  expect(office.errors).toEqual([]);
});

test('new workstations appear in the office with their employee and furniture interaction, then reset removes them', async () => {
  await growingOffice();
  review(1); review(2); review(3); review(6); review(9);
  office.evaluate('render();');
  const document = office.window.document;
  const desk = document.querySelector('[data-furniture="desk7"]');
  expect(desk).not.toBeNull();
  expect(desk.textContent).toContain('吳國豪');
  desk.click();
  expect(document.querySelector('.notification').textContent).toContain('吳國豪');
  office.evaluate('resetAll();');
  expect(document.querySelector('[data-furniture="desk7"]')).toBeNull();
  expect(document.querySelectorAll('.room-a [data-furniture^="desk"]')).toHaveLength(6);
  expect(office.errors).toEqual([]);
});

test('the office displays its capacity, expansion date, recruitment and the boss decision without management buttons', async () => {
  await growingOffice();
  review(1); review(2); review(3);
  office.evaluate('render();');
  const document = office.window.document;
  expect(document.getElementById('companyDisplay').textContent).toContain('6/6');
  expect(document.getElementById('companyExpansion').textContent).toContain('第 6 天');
  review(6); office.evaluate('render();');
  expect(document.getElementById('companyRecruitment').textContent).toContain('吳國豪');
  expect(document.getElementById('companyDecision').textContent).toContain('職能缺口');
});

test('a recruited salesperson continues a departed colleague’s lead and owns the new contract', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.budget = 4000000;
    sim._projectAttempt = {proj: pickProject(), salesId: 'sales', visitsDone: 0, visitsNeeded: 1, successRate: 1};
    retireCharacter('sales');
  `);
  review(1); review(2); review(3); review(6);
  const id = office.evaluate('sim.characters.find(ch => ch.employment !== "departed" && ch.field === "sales").id');
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === '${id}');
    sales.isPresent = true; sales.pos = {...POS[sales.deskId]}; sales.state = 'sitting'; sales.task = {type: 'break', endGT: 20};
    sim.gameTime = 10; ProjectPipeline.tick(10);
  `);
  expect(office.evaluate(`sim.characters.find(ch => ch.id === '${id}').task.type`)).toBe('client_visit');
  office.evaluate(`
    const sales = sim.characters.find(ch => ch.id === '${id}');
    sales.pos = {...DOOR_POS}; CharacterSimulation.tick(0);
    sim.gameTime = sales.task.endGT; Math.random = () => 0;
    CharacterSimulation.tick(0);
  `);
  expect(office.evaluate('sim.projects[0].salesId')).toBe(id);
  expect(office.errors).toEqual([]);
});

test('insufficient cash reserves prevent expansion and recruitment even when work is waiting', async () => {
  await growingOffice();
  office.evaluate('sim.budget = 100000;');
  review(1); review(2); review(3);
  expect(office.evaluate('sim.company.expansion')).toBeNull();
  expect(office.evaluate('sim.company.recruitment')).toBeNull();
  expect(office.evaluate('sim.characters.length')).toBe(7);
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(0);
});

test('a withdrawn project cancels a pending hire instead of adding an unnecessary employee', async () => {
  await growingOffice();
  review(1); review(2); review(3); review(6);
  office.evaluate('failProject(sim.projects[0]);');
  review(9);
  expect(office.evaluate('sim.company.recruitment')).toBeNull();
  expect(office.evaluate('sim.characters.some(ch => ch.id === "senior_dev")')).toBe(false);
  expect(office.evaluate('sim.events.some(event => event.type === "recruitment_cancelled")')).toBe(true);
  expect(office.errors).toEqual([]);
});

test('growth can continue beyond twelve seats and the original candidate list with unique staff and desks', async () => {
  await growingOffice();
  office.evaluate('sim.budget = 100000000; sim.projects[0].work = 10000; sim.projects[0].deadlineDay = 500;');
  for (let day = 1; day <= 100; day++) review(day);
  office.evaluate('render();');
  expect(office.evaluate('sim.company.seats')).toBeGreaterThan(12);
  expect(office.evaluate('sim.characters.filter(ch => ch.employment !== "departed").length')).toBeGreaterThan(12);
  expect(office.evaluate('new Set(sim.characters.map(ch => ch.id)).size')).toBe(office.evaluate('sim.characters.length'));
  expect(office.evaluate('new Set(sim.characters.filter(ch => ch.employment !== "departed").map(ch => ch.deskId)).size')).toBe(office.evaluate('sim.characters.filter(ch => ch.employment !== "departed").length'));
  expect(office.window.document.querySelectorAll('.room-a [data-furniture^="desk"]')).toHaveLength(office.evaluate('sim.company.seats'));
  expect(office.errors).toEqual([]);
});

test('the boss replaces an absent sales function before expanding an already staffed engineering team', async () => {
  await growingOffice();
  office.evaluate('retireCharacter("sales");');
  review(1); review(2); review(3);
  expect(office.evaluate('sim.company.recruitment.field')).toBe('sales');
  expect(office.evaluate('sim.company.expansion')).toBeNull();
});

test('the boss rechecks cash reserves on the joining date and cancels an unaffordable hire', async () => {
  await growingOffice();
  review(1); review(2); review(3); review(6);
  office.evaluate('sim.budget = 50000;');
  review(9);
  expect(office.evaluate('sim.company.recruitment')).toBeNull();
  expect(office.evaluate('sim.characters.some(ch => ch.id === "senior_dev")')).toBe(false);
  expect(office.evaluate('sim.events.some(event => event.type === "recruitment_cancelled")')).toBe(true);
  expect(office.evaluate('sim.budget')).toBe(50000);
  expect(office.errors).toEqual([]);
});
