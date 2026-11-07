import { afterEach, expect, test } from 'vitest';
import { loadOffice } from './office-helper.js';

let office;
afterEach(() => office?.close());

test('experience promotes an employee on the next workday and raises future payroll without changing accrued wages', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.gameTime = 10;
    sim.characters = sim.characters.filter(ch => ch.id === 'backend');
    const employee = sim.characters[0];
    employee.career.hours = 239; employee.career.totalHours = 239;
    employee.isPresent = true; employee.state = 'sitting'; employee.pos = {...POS[employee.deskId]};
    assignDeskTask(employee, {type: 'work'}, '內部工作', 1);
    sim.gameTime = 11; tick(0); employee.task = null;
    window.beforePromotionBurn = CompanyFinance.monthlyBurn();
  `);
  expect(office.evaluate('sim.characters[0].salary')).toBe(58000);
  office.evaluate('sim.gameTime = 20.5; tick(0); render();');
  expect(office.evaluate('sim.characters[0].role')).toBe('中階工程師');
  expect(office.evaluate('sim.characters[0].salary')).toBe(63800);
  expect(office.evaluate('sim.characters[0].career.level')).toBe(2);
  expect(office.evaluate('CompanyFinance.monthlyBurn() - window.beforePromotionBurn')).toBeCloseTo(6670);
  expect(office.evaluate('sim.finance.payables.find(item => item.category === "月薪").amount')).toBe(2636);
  office.evaluate('CompanyFinance.accrueDay();');
  expect(office.evaluate('sim.finance.payables.find(item => item.category === "月薪").amount')).toBe(5536);
  expect(office.evaluate('sim.characters[0].career.promotions.length')).toBe(1);
  office.evaluate(`for (let day = 3; day <= 22; day++) { sim.day = day; CompanyFinance.accrueDay(); } CompanyFinance.settle(); CompanyFinance.settle();`);
  expect(office.evaluate('sim.characters[0].money')).toBe(174000 + 63536);
  expect(office.errors).toEqual([]);
});

test.each([['designer', 240, '中階設計師', 60500], ['admin', 800, '行政主管', 55200]])('experience upgrades %s within the same profession', async (id, hours, role, salary) => {
  office = await loadOffice();
  office.evaluate(`
    const employee = sim.characters.find(ch => ch.id === '${id}');
    employee.career.hours = ${hours}; employee.career.totalHours = ${hours}; employee.career.lastWorkedDay = 1;
    sim.gameTime = 20.5; tick(0);
  `);
  expect(office.evaluate(`sim.characters.find(ch => ch.id === '${id}').role`)).toBe(role);
  expect(office.evaluate(`sim.characters.find(ch => ch.id === '${id}').salary`)).toBe(salary);
  expect(office.errors).toEqual([]);
});

test('promotion retains surplus experience and advances at most one grade per workday', async () => {
  office = await loadOffice();
  office.evaluate(`const employee = sim.characters.find(ch => ch.id === 'backend'); employee.career.hours = 1000; employee.career.totalHours = 1000; sim.gameTime = 20.5; tick(0); tick(0);`);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.hours')).toBe(760);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.level')).toBe(2);
  office.evaluate('sim.gameTime = 20.5; tick(0);');
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.hours')).toBe(280);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").career.level')).toBe(3);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "backend").salary')).toBe(71456);
  expect(office.errors).toEqual([]);
});

test('owners and existing top roles retain their titles and do not receive unlimited automatic raises', async () => {
  office = await loadOffice();
  office.evaluate(`
    for (const ch of sim.characters.filter(ch => ['tech', 'marketing', 'sales'].includes(ch.id))) {
      ch.career.hours = 10000; ch.career.totalHours = 10000;
    }
    sim.gameTime = 20.5; tick(0);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "boss").career')).toBeNull();
  expect(office.evaluate('sim.characters.filter(ch => ["tech", "marketing", "sales"].includes(ch.id)).map(ch => [ch.role, ch.salary])')).toEqual([
    ['技術總監', 120000], ['行銷經理', 85000], ['業務經理', 30000],
  ]);
  expect(office.errors).toEqual([]);
});

test('the header shows signed daily profit beside equity and resets it without recounting cash movements', async () => {
  office = await loadOffice();
  office.evaluate(`
    CompanyFinance.charge(10000, '今日費用', {dueDay: 22});
    completeProject(startNewProject({id: 'daily', name: '每日損益', type: 'tech', work: 50, reward: 50000}));
    render();
  `);
  const document = office.window.document;
  expect(office.evaluate('CompanyFinance.summary().dailyProfit')).toBe(40000);
  expect(document.querySelector('#loanDisplay .equity-balance')?.textContent).toContain('淨資產$1,040,000');
  expect(document.querySelector('#loanDisplay .daily-profit')?.textContent).toContain('+$40,000');
  expect(document.querySelector('#loanDisplay .daily-profit')?.dataset.direction).toBe('up');
  office.evaluate('sim.day = 2; CompanyFinance.charge(1500, "次日費用"); render();');
  expect(office.evaluate('CompanyFinance.summary().dailyProfit')).toBe(-1500);
  expect(document.querySelector('#loanDisplay .daily-profit').textContent).toContain('-$1,500');
  expect(document.querySelector('#loanDisplay .daily-profit').dataset.direction).toBe('down');
  office.evaluate('sim.day = 23; CompanyFinance.collectReceivables(); CompanyFinance.settle(); render();');
  expect(office.evaluate('CompanyFinance.summary().dailyProfit')).toBe(0);
  expect(document.querySelector('#loanDisplay .daily-profit').textContent).toContain('+$0');
  expect(document.querySelector('#loanDisplay .daily-profit').dataset.direction).toBe('flat');
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(38500);
  expect(office.errors).toEqual([]);
});

test('automatic quotes cover loaded costs, a contingency and a 20 percent target margin', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.characters = sim.characters.filter(ch => ch.id === 'tech'); sim.characters[0].salary = 88000;
    Object.assign(ECONOMY, {monthlyRent: 0, monthlyUtilities: 0, monthlyCloud: 0,
      monthlySoftwarePerEmployee: 0, monthlySuppliesPerEmployee: 0, employerOverheadRate: 0});
    PROJECT_POOL = [{id: 'priced', name: '估價案例', type: 'tech', work: 100, reward: 200000}];
    window.quoted = pickProject();
  `);
  expect(office.evaluate('window.quoted.reward')).toBe(111000);
  expect(office.evaluate('window.quoted.estimatedCost')).toBe(88462);
  expect(office.evaluate('window.quoted.estimatedProfit')).toBe(22538);
  office.evaluate('startNewProject(window.quoted); render();');
  const card = office.window.document.querySelector('.project-finance');
  expect(card.textContent).toContain('預估成本 $88,462');
  expect(card.textContent).toContain('預估利潤 $22,538');
  expect(office.errors).toEqual([]);
});

test('monthly profit follows earned revenue and accrued costs rather than a later invoice collection', async () => {
  office = await loadOffice();
  office.evaluate(`
    CompanyFinance.charge(10000, '月度成本', {dueDay: 50});
    completeProject(startNewProject({id: 'period-test', name: '跨月收款', type: 'tech', work: 50, reward: 50000}));
  `);
  expect(office.evaluate('CompanyFinance.summary().monthProfit')).toBe(40000);
  office.evaluate('sim.day = 23; CompanyFinance.collectReceivables();');
  expect(office.evaluate('CompanyFinance.summary().monthProfit')).toBe(0);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(40000);
  expect(office.errors).toEqual([]);
});

test('automatic opportunities reject work without delivery staff or with more work than their capacity', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.characters = sim.characters.filter(ch => ch.id === 'tech');
    PROJECT_POOL = [{id: 'wrong-role', name: '缺設計師', type: 'design', work: 50, reward: 500000},
      {id: 'overloaded', name: '超出產能', type: 'tech', work: 10000, reward: 50000000}];
  `);
  expect(office.evaluate('pickProject()')).toBeNull();
  expect(office.errors).toEqual([]);
});

test('a quotation is rechecked at signing when its delivery staff have left', async () => {
  office = await loadOffice();
  office.evaluate(`
    PROJECT_POOL = [{id: 'design-quote', name: '設計報價', type: 'design', work: 50, reward: 500000}];
    window.offer = pickProject(); retireCharacter('designer');
  `);
  expect(office.evaluate('startNewProject(window.offer)')).toBeNull();
  expect(office.evaluate('sim.finance.revenue')).toBe(0);
  expect(office.evaluate('Object.keys(sim.finance.advances)')).toEqual([]);
});

test('unpaid bills remain liabilities and cannot make company cash negative', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.budget = 100;
    CompanyFinance.charge(150, '測試費用');
    CompanyFinance.settle();
  `);
  expect(office.evaluate('sim.budget')).toBe(0);
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(50);
  expect(office.evaluate('sim.lastSettlement.unpaid')).toBe(50);
  office.evaluate('CompanyFinance.settle();');
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(50);
  expect(office.errors).toEqual([]);
});

test('a contract separates its deposit, earned revenue and later invoice collection', async () => {
  office = await loadOffice();
  office.evaluate(`
    window.economyContract = startNewProject({id: 'contract', name: '測試合約', type: 'tech', work: 100, reward: 100000});
  `);
  expect(office.evaluate('sim.budget')).toBe(1030000);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(0);
  expect(office.evaluate('CompanyFinance.summary().equity')).toBe(1000000);
  office.evaluate('completeProject(window.economyContract); completeProject(window.economyContract);');
  expect(office.evaluate('sim.budget')).toBe(1030000);
  expect(office.evaluate('CompanyFinance.summary().receivables')).toBe(70000);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(100000);
  office.evaluate('sim.day = 23; sim._lastBudgetDay = 23; SimulationDay.settleFinances(9); SimulationDay.settleFinances(9);');
  expect(office.evaluate('sim.budget')).toBe(1100000);
  expect(office.evaluate('CompanyFinance.summary().receivables')).toBe(0);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(100000);
  expect(office.errors).toEqual([]);
});

test('collected commission is an expense and reaches the salesperson only when paid', async () => {
  office = await loadOffice();
  const savings = office.evaluate('sim.characters.find(ch => ch.id === "sales").money');
  office.evaluate(`
    const project = startNewProject({id: 'sale', name: '業務合約', type: 'mkt', work: 100, reward: 100000}, 'sales');
    completeProject(project);
    sim.day = 23; sim._lastBudgetDay = 23; SimulationDay.settleFinances(9);
  `);
  expect(office.evaluate('sim.budget')).toBe(1100000);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").money')).toBe(savings);
  office.evaluate('CompanyFinance.settle();');
  expect(office.evaluate('sim.budget')).toBe(1093000);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "sales").money')).toBe(savings + 7000);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(93000);
  expect(office.errors).toEqual([]);
});

test('a failed contract refunds its advance without counting the refund as an expense', async () => {
  office = await loadOffice();
  office.evaluate(`
    const project = startNewProject({id: 'failed', name: '取消合約', type: 'tech', work: 100, reward: 100000});
    failProject(project); failProject(project);
    CompanyFinance.settle();
  `);
  expect(office.evaluate('sim.budget')).toBe(995000);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(-5000);
  expect(office.evaluate('CompanyFinance.summary().equity')).toBe(995000);
  expect(office.errors).toEqual([]);
});

test('monthly wages accrue daily and pay exactly one month after 22 operating days', async () => {
  office = await loadOffice();
  office.evaluate(`sim.characters = sim.characters.filter(ch => ch.id === 'tech'); sim.characters[0].salary = 52000;`);
  const savings = office.evaluate('sim.characters[0].money');
  office.evaluate('for (let day = 0; day < 21; day++) { sim.gameTime = 20.5; tick(0); }');
  expect(office.evaluate('sim.characters[0].money')).toBe(savings);
  expect(office.evaluate('sim.budget')).toBe(1000000);
  office.evaluate('sim.gameTime = 20.5; tick(0);');
  expect(office.evaluate('sim.characters[0].money')).toBe(savings + 52000);
  expect(office.evaluate('sim.budget')).toBe(860100);
  expect(office.evaluate('CompanyFinance.summary().equity')).toBe(860100);
  expect(office.errors).toEqual([]);
});

test('borrowing does not create profit and monthly principal repayment is not an expense', async () => {
  office = await loadOffice();
  office.evaluate('sim.budget = 100000; bossTakeLoan(100000);');
  expect(office.evaluate('sim.budget')).toBe(200000);
  expect(office.evaluate('CompanyFinance.summary().equity')).toBe(100000);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(0);
  office.evaluate('sim.day = 23; CompanyFinance.accrueLoans(); CompanyFinance.settle();');
  expect(office.evaluate('sim.loans[0].principalRemaining')).toBe(91667);
  expect(office.evaluate('sim.lastSettlement.categories')).toEqual({利息: 500, 還本: 8333});
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(-500);
  expect(office.evaluate('CompanyFinance.summary().equity')).toBe(99500);
  office.evaluate('sim.day = 24; CompanyFinance.accrueLoans();');
  expect(office.evaluate('sim.finance.payables.find(item => item.kind === "interest").amount')).toBe(21);
  expect(office.errors).toEqual([]);
});

test('overtime is accrued once and actually transferred to the employee on payday', async () => {
  office = await loadOffice();
  const savings = office.evaluate('sim.characters.find(ch => ch.id === "tech").money');
  office.evaluate(`
    sim.characters.find(ch => ch.id === 'tech').salary = 36000;
    sim.punchRecords.tech = {in: 8, overtimeHours: 0};
    sim.dailyPunch.tech = {punchedIn: true, punchedOut: false};
    sim.gameTime = 18.5; punchOut('tech');
    sim.gameTime = 19.5; punchOut('tech'); punchOut('tech');
    CompanyFinance.settle();
  `);
  expect(office.evaluate('sim.budget')).toBe(1000000);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").money')).toBe(savings);
  office.evaluate('sim.day = 22; CompanyFinance.settle();');
  expect(office.evaluate('sim.budget')).toBe(999600);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").money')).toBe(savings + 400);
  expect(office.errors).toEqual([]);
});

test('operating investment spends a budget on future capability rather than creating instant profit', async () => {
  office = await loadOffice();
  office.evaluate('Math.random = () => 0; sim.budget = 3000000; bossInvest(); bossInvest();');
  expect(office.evaluate('sim.budget')).toBe(3000000);
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(12000);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(-12000);
  expect(office.evaluate('sim.finance.programs.length')).toBe(1);
  expect(office.errors).toEqual([]);
});

test('project progress uses actual person-hours and assigns one project per task', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.gameTime = 10;
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = true; tech.pos = {...POS.desk1}; tech.mood = moodFromValue(0.5);
    startNewProject({id: 'tech-job', name: '工程合約', type: 'tech', work: 100, reward: 100000});
    startNewProject({id: 'design-job', name: '設計合約', type: 'design', work: 100, reward: 100000});
    assignDeskTask(tech, {type: 'work'}, '工作中', 1);
    sim.gameTime = 11;
    contributeToProject('tech', tech.task);
  `);
  expect(office.evaluate('sim.projects.find(project => project.id === "tech-job").workDone')).toBeCloseTo(1);
  expect(office.evaluate('sim.projects.find(project => project.id === "design-job").progress')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('an empty project list does not create a free contract on the second day', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0.99; sim.day = 2; sim.gameTime = 9;
    sim.characters.forEach(ch => { ch.isPresent = true; ch.state = 'sitting'; ch.task = {type: 'break', endGT: 20}; });
    tick(0); tick(0);
  `);
  expect(office.evaluate('sim.projects.length')).toBe(0);
  expect(office.evaluate('sim.budget')).toBe(1000000);
  expect(office.errors).toEqual([]);
});

test('today’s bills are paid in one end-of-day batch while later bills remain unpaid', async () => {
  office = await loadOffice();
  office.evaluate(`
    CompanyFinance.charge(3000, '修繕');
    CompanyFinance.charge(2000, '交通');
    sim.gameTime = 20.5; tick(0);
  `);
  expect(office.evaluate('sim.budget')).toBe(995000);
  expect(office.evaluate('sim.lastSettlement.categories')).toEqual({修繕: 3000, 交通: 2000});
  expect(office.evaluate('sim.finance.payables.length')).toBeGreaterThan(0);
  expect(office.evaluate('sim.events.filter(event => event.type === "daily_settlement").length')).toBe(1);
  office.evaluate('tick(0);');
  expect(office.evaluate('sim.budget')).toBe(995000);
  expect(office.errors).toEqual([]);
});

test('a fully amortized loan removes its final principal and interest without rounding debt left over', async () => {
  office = await loadOffice();
  office.evaluate(`
    sim.budget = 100000; bossTakeLoan(100000);
    for (let month = 1; month <= 12; month++) {
      sim.day = 1 + month * 22; CompanyFinance.accrueLoans(); CompanyFinance.settle();
    }
  `);
  expect(office.evaluate('sim.loans.length')).toBe(0);
  expect(office.evaluate('sim.finance.payables.length')).toBe(0);
  expect(office.evaluate('CompanyFinance.summary().profit')).toBe(-3250);
  expect(office.evaluate('sim.budget')).toBe(96750);
  expect(office.errors).toEqual([]);
});

test('late arrival keeps attendance records without inventing a penalty expense or taking personal cash', async () => {
  office = await loadOffice();
  const savings = office.evaluate('sim.characters.find(ch => ch.id === "tech").money');
  office.evaluate(`
    sim.gameTime = 8.25; punchIn('tech');
    const tech = sim.characters.find(ch => ch.id === 'tech');
    tech.isPresent = false; tech._outsideLunch = true; tech.task = null;
    sim.gameTime = 13.5; scheduleNext(tech);
  `);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").money')).toBe(savings);
  expect(office.evaluate('sim.budget')).toBe(1000000);
  expect(office.evaluate('sim.lateRecords[0].lateMinutes')).toBe(15);
  expect(office.evaluate('sim.finance.expenses')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('insufficient cash pays the employee partially and preserves the rest as a wage liability', async () => {
  office = await loadOffice();
  const savings = office.evaluate('sim.characters.find(ch => ch.id === "tech").money');
  office.evaluate(`
    sim.budget = 100;
    CompanyFinance.charge(150, '月薪', {kind: 'wage', employeeId: 'tech'});
    CompanyFinance.charge(100, '雲端');
    CompanyFinance.settle();
  `);
  expect(office.evaluate('sim.budget')).toBe(0);
  expect(office.evaluate('sim.characters.find(ch => ch.id === "tech").money')).toBe(savings + 100);
  expect(office.evaluate('CompanyFinance.pendingTotal()')).toBe(150);
  expect(office.errors).toEqual([]);
});

test('a contract outside the active list cannot create revenue or a refund obligation', async () => {
  office = await loadOffice();
  office.evaluate(`completeProject({id: 'foreign', name: '不存在的合約', reward: 100000});`);
  expect(office.evaluate('sim.finance.revenue')).toBe(0);
  expect(office.evaluate('sim.finance.receivables.length')).toBe(0);
  expect(office.errors).toEqual([]);
});

test('the credit ceiling caps borrowing and unpaid bank installments prevent further loans', async () => {
  office = await loadOffice();
  office.evaluate('bossTakeLoan(3000000); bossTakeLoan(100000);');
  expect(office.evaluate('CompanyFinance.summary().debt')).toBe(500000);
  office.evaluate('sim.day = 2; bossTakeLoan(100000);');
  expect(office.evaluate('CompanyFinance.summary().debt')).toBe(500000);
  office.evaluate(`
    initSim(); bossTakeLoan(100000);
    sim.day = 23; CompanyFinance.accrueLoans();
    sim.day = 29; bossTakeLoan(100000);
  `);
  expect(office.evaluate('sim.loans.length')).toBe(1);
  expect(office.errors).toEqual([]);
});

test('after-work networking creates the same contract, deposit and person-hour records as other sales', async () => {
  office = await loadOffice();
  office.evaluate(`
    Math.random = () => 0;
    sim.gameTime = 18;
    for (const ch of sim.characters) { ch.isPresent = false; ch.state = 'gone'; ch.task = null; ch._afterWorkDone = ch.id !== 'boss'; sim.hasLeftToday[ch.id] = true; }
    OfficeEvents.tick(0, 18);
  `);
  expect(office.evaluate('sim.projects[0].status')).toBe('active');
  expect(office.evaluate('sim.projects[0].workDone')).toBe(0);
  expect(office.evaluate('CompanyFinance.summary().advances')).toBe(office.evaluate('sim.projects[0].deposit'));
  expect(office.evaluate('sim.budget')).toBe(office.evaluate('ECONOMY.startingCash + sim.projects[0].deposit'));
  expect(office.errors).toEqual([]);
});

test('networking goodwill does not invent completed person-hours', async () => {
  office = await loadOffice();
  office.evaluate(`
    startNewProject({id: 'network', name: '進行中合約', type: 'tech', work: 100, reward: 100000});
    let choices = [0, 0.9]; Math.random = () => choices.shift() ?? 0.99;
    sim.gameTime = 18;
    for (const ch of sim.characters) { ch.isPresent = false; ch.state = 'gone'; ch.task = null; ch._afterWorkDone = ch.id !== 'boss'; sim.hasLeftToday[ch.id] = true; }
    OfficeEvents.tick(0, 18);
  `);
  expect(office.evaluate('sim.projects[0].progress')).toBe(0);
  expect(office.evaluate('sim.projects[0].workDone')).toBe(0);
  expect(office.errors).toEqual([]);
});
