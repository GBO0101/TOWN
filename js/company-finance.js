/* 應計收入與費用，收付款另外記錄；每天只執行一次公司現金扣款。 */
const CompanyFinance = (() => {
  function createState() {
    return {payables: [], receivables: [], advances: {}, revenue: 0, expenses: 0, periods: {}, daily: {day: 0, revenue: 0, expenses: 0}, revenueSources: {contracts: 0, products: 0},
      nextId: 1, salaryRemainders: {}, costRemainders: {}, lastAccrualDay: 0,
      lastDebtDay: 0, lastCollectionDay: 0, lastBorrowDay: 0, lastLeadDay: 0,
      lastStaffReviewDay: 0, lastLayoffDay: 0, cashStressDays: 0, programs: [], reputation: 0.5};
  }

  function amountInYuan(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError('金額必須為非負數');
    return Math.round(amount);
  }

  function dueItems() { return sim.finance.payables.filter(item => item.dueDay <= sim.day); }

  function period() {
    const key = Math.ceil(sim.day / ECONOMY.daysPerMonth);
    return sim.finance.periods[key] ||= {revenue: 0, expenses: 0};
  }

  function daily() {
    if (sim.finance.daily.day !== sim.day) sim.finance.daily = {day: sim.day, revenue: 0, expenses: 0};
    return sim.finance.daily;
  }

  function recognizeRevenue(amount, source = 'contracts') {
    amount = amountInYuan(amount);
    sim.finance.revenue += amount;
    sim.finance.revenueSources[source] = (sim.finance.revenueSources[source] || 0) + amount;
    period().revenue += amount;
    daily().revenue += amount;
  }

  function syncExpenses() {
    sim.dailyExpenses = {};
    for (const item of dueItems()) sim.dailyExpenses[item.category] = (sim.dailyExpenses[item.category] || 0) + item.amount;
  }

  function charge(amount, category, details = {}) {
    amount = amountInYuan(amount);
    if (!amount) return;
    const {dueDay = sim.day, kind = 'expense', employeeId = null, loanId = null, productId = null} = details;
    const existing = sim.finance.payables.find(item => item.category === category && item.dueDay === dueDay &&
      item.kind === kind && item.employeeId === employeeId && item.loanId === loanId && item.productId === productId);
    if (existing) existing.amount += amount;
    else sim.finance.payables.push({id: sim.finance.nextId++, category, dueDay, kind, employeeId, loanId, productId, amount});
    if (kind !== 'principal' && kind !== 'liability') { sim.finance.expenses += amount; period().expenses += amount; daily().expenses += amount; }
    syncExpenses();
  }

  function receive(amount) {
    amount = amountInYuan(amount);
    sim.budget += amount;
    sim._budgetChanged = amount > 0;
    sim._budgetDirection = 'up';
  }

  function pendingTotal() { return dueItems().reduce((sum, item) => sum + item.amount, 0); }

  function available() { return sim.budget - sim.finance.payables.reduce((sum, item) => sum + item.amount, 0); }

  function summary() {
    const cash = sim.budget;
    const receivables = sim.finance.receivables.reduce((sum, item) => sum + item.amount, 0);
    const payables = sim.finance.payables.filter(item => item.kind !== 'principal').reduce((sum, item) => sum + item.amount, 0);
    const debt = sim.loans.reduce((sum, loan) => sum + loan.principalRemaining, 0);
    const advances = Object.values(sim.finance.advances).reduce((sum, amount) => sum + amount, 0);
    return {cash, receivables, payables, debt, advances, due: pendingTotal(),
      equity: cash + receivables - payables - debt - advances,
      profit: sim.finance.revenue - sim.finance.expenses, monthProfit: period().revenue - period().expenses,
      dailyProfit: daily().revenue - daily().expenses};
  }

  function collectReceivables() {
    if (sim.finance.lastCollectionDay === sim.day) return;
    sim.finance.lastCollectionDay = sim.day;
    const due = sim.finance.receivables.filter(invoice => invoice.dueDay <= sim.day);
    sim.finance.receivables = sim.finance.receivables.filter(invoice => invoice.dueDay > sim.day);
    for (const invoice of due) {
      receive(invoice.amount);
      if (invoice.commission && invoice.employeeId) charge(invoice.commission, '業務抽成', {kind: 'commission', employeeId: invoice.employeeId});
      officeEvent('invoice_received', `收到「${invoice.projectName}」尾款 $${invoice.amount.toLocaleString()}，應收帳款已結清`);
    }
  }

  function payday() { return Math.ceil(sim.day / ECONOMY.daysPerMonth) * ECONOMY.daysPerMonth; }

  function monthlyBurn(includeProducts = true) {
    const workers = sim.characters.filter(ch => ch.employment !== 'departed');
    const salaries = workers.reduce((sum, ch) => sum + ch.salary, 0);
    const space = CompanyGrowth.spaceCosts();
    return salaries * (1 + ECONOMY.employerOverheadRate) + space.rent + space.utilities +
      ECONOMY.monthlyCloud + workers.length * (ECONOMY.monthlySoftwarePerEmployee + ECONOMY.monthlySuppliesPerEmployee) +
      (includeProducts ? PassiveProducts.monthlyCosts() : 0);
  }

  function roundedAccrual(raw, key, remainders) {
    const exact = raw + (remainders[key] || 0);
    const amount = Math.round(exact);
    remainders[key] = exact - amount;
    return amount;
  }

  function accrueDay() {
    if (sim.finance.lastAccrualDay === sim.day) return;
    sim.finance.lastAccrualDay = sim.day;
    PassiveProducts.settleDay();
    sim._lastBudgetDay = sim.day;
    if (sim.supplierContract && sim.day >= sim.supplierContract.startDay + sim.supplierContract.duration) {
      officeEvent('supplier_contract_end', `${sim.supplierContract.company}的供應合約到期`);
      sim.supplierContract = null;
    }
    const workers = sim.characters.filter(ch => ch.employment !== 'departed' || ch.departDay === sim.day);
    let salaries = 0;
    for (const ch of workers) {
      salaries += ch.salary;
      const amount = roundedAccrual(ch.salary / ECONOMY.daysPerMonth, ch.id, sim.finance.salaryRemainders);
      charge(amount, '月薪', {kind: 'wage', employeeId: ch.id, dueDay: ch.departDay === sim.day ? sim.day : payday()});
    }
    const space = CompanyGrowth.spaceCosts();
    const costs = {租金: space.rent, 水電: space.utilities, 雲端: ECONOMY.monthlyCloud,
      軟體授權: workers.length * ECONOMY.monthlySoftwarePerEmployee,
      辦公耗材: workers.length * ECONOMY.monthlySuppliesPerEmployee,
      人事附加成本: salaries * ECONOMY.employerOverheadRate};
    sim.dailyOpCost = 0;
    for (const [category, monthly] of Object.entries(costs)) {
      const contract = sim.supplierContract;
      const modifier = contract?.costCategory === category ? contract.modifier : 0;
      const amount = roundedAccrual(monthly * (1 + modifier) / ECONOMY.daysPerMonth, category, sim.finance.costRemainders);
      charge(amount, category, {dueDay: payday()});
      sim.dailyOpCost += amount;
    }
    sim.finance.programs = sim.finance.programs.filter(program => program.untilDay > sim.day);
    sim.finance.cashStressDays = available() < 0 ? sim.finance.cashStressDays + 1 : 0;
  }

  function closeEmployment(employeeId) {
    for (const item of sim.finance.payables) if (item.employeeId === employeeId) item.dueDay = Math.min(item.dueDay, sim.day);
    syncExpenses();
  }

  function accrueLoans() {
    if (sim.finance.lastDebtDay === sim.day) return;
    sim.finance.lastDebtDay = sim.day;
    for (const loan of sim.loans) {
      while (loan.lastAccruedDay < sim.day) {
        const endDay = Math.min(sim.day, loan.nextPaymentDay);
        const days = endDay - loan.lastAccruedDay;
        const interest = roundedAccrual(loan.principalRemaining * loan.annualRate * days / (ECONOMY.daysPerMonth * 12), loan.id, sim.finance.costRemainders);
        charge(interest, '利息', {kind: 'interest', loanId: loan.id, dueDay: loan.nextPaymentDay});
        loan.lastAccruedDay = endDay;
        if (endDay === loan.nextPaymentDay) {
          const scheduled = sim.finance.payables.filter(item => item.kind === 'principal' && item.loanId === loan.id).reduce((sum, item) => sum + item.amount, 0);
          const remaining = Math.max(0, loan.principalRemaining - scheduled);
          const principal = Math.min(remaining, loan.installmentsScheduled >= loan.termMonths - 1 ? remaining : Math.round(loan.amount / loan.termMonths));
          charge(principal, '還本', {kind: 'principal', loanId: loan.id, dueDay: loan.nextPaymentDay});
          loan.installmentsScheduled++;
          loan.nextPaymentDay += ECONOMY.daysPerMonth;
        }
      }
    }
  }

  function borrow(requested) {
    const need = requested ?? Math.max(0, pendingTotal() + monthlyBurn() / ECONOMY.daysPerMonth * ECONOMY.cashBufferDays - sim.budget);
    if (!Number.isFinite(need)) throw new RangeError('借款需求必須為有效金額');
    if (need <= 0 || sim.finance.lastBorrowDay === sim.day) return null;
    sim.finance.lastBorrowDay = sim.day;
    const {debt, equity} = summary();
    const monthlyRevenue = sim.finance.revenue / Math.max(1, sim.day / ECONOMY.daysPerMonth);
    const limit = Math.min(ECONOMY.maxDebt, ECONOMY.startingCash * 0.5 + monthlyRevenue * 0.5);
    const credit = Math.max(0, limit - debt);
    const overdueDebt = sim.finance.payables.some(item => item.loanId && item.dueDay < sim.day - 5);
    if (sim.loans.length >= 3 || equity <= 0 || overdueDebt || credit < ECONOMY.minLoan) {
      officeEvent('credit_declined', '資金不足，但本次借款未通過額度或還款能力檢查；未付款項保留待付');
      return null;
    }
    const amount = Math.min(Math.ceil(need / ECONOMY.minLoan) * ECONOMY.minLoan, Math.floor(credit / ECONOMY.minLoan) * ECONOMY.minLoan);
    const loan = {id: `loan_${sim.finance.nextId++}`, amount, principalRemaining: amount,
      annualRate: ECONOMY.annualLoanRate, termMonths: ECONOMY.loanMonths,
      dayTaken: sim.day, lastAccruedDay: sim.day, nextPaymentDay: sim.day + ECONOMY.daysPerMonth, installmentsScheduled: 0};
    sim.loans.push(loan);
    receive(amount);
    officeEvent('loan_received', `取得營運借款 $${amount.toLocaleString()}，年利率 ${(loan.annualRate * 100).toFixed(1)}%，${loan.termMonths} 個月還本；借款不列入收入`);
    return loan;
  }

  function settle() {
    if (sim._lastSettlementDay === sim.day) return;
    const dueTotal = pendingTotal();
    const categories = {};
    let cash = Math.max(0, sim.budget);
    const priority = item => item.employeeId && item.employeeId !== 'boss' ? 0 : item.kind === 'interest' ? 1 : item.employeeId === 'boss' ? 3 : item.kind === 'principal' ? 4 : 2;
    for (const item of dueItems().sort((a, b) => priority(a) - priority(b) || a.dueDay - b.dueDay || a.id - b.id)) {
      const paid = Math.min(cash, item.amount);
      if (!paid) continue;
      cash -= paid;
      item.amount -= paid;
      categories[item.category] = (categories[item.category] || 0) + paid;
      if (item.employeeId) {
        const employee = sim.characters.find(ch => ch.id === item.employeeId);
        if (employee) {
          employee.money += paid;
          if (item.kind === 'commission') sim._salesCommissions[employee.id] = (sim._salesCommissions[employee.id] || 0) + paid;
          addMem(employee.id, `${item.category}入帳 $${paid.toLocaleString()}`, 'finance');
        }
      }
      if (item.kind === 'principal') {
        const loan = sim.loans.find(loan => loan.id === item.loanId);
        if (loan) loan.principalRemaining = Math.max(0, loan.principalRemaining - paid);
      }
    }
    const total = sim.budget - cash;
    sim.budget -= total;
    sim.finance.payables = sim.finance.payables.filter(item => item.amount > 0);
    sim.loans = sim.loans.filter(loan => loan.principalRemaining > 0 || sim.finance.payables.some(item => item.loanId === loan.id));
    sim._lastSettlementDay = sim.day;
    const unpaid = pendingTotal();
    sim.lastSettlement = {day: sim.day, total, categories, dueTotal, unpaid};
    if (categories['月薪']) sim._lastSalaryDay = sim.day;
    sim._budgetChanged = total > 0;
    sim._budgetDirection = 'down';
    syncExpenses();
    const details = Object.entries(categories).map(([name, amount]) => `${name} $${amount.toLocaleString()}`).join('、');
    officeEvent('daily_settlement', `今日統一付款 $${total.toLocaleString()}${details ? `（${details}）` : ''}${unpaid ? `；尚欠 $${unpaid.toLocaleString()}，保留待付` : ''}`);
  }

  return {createState, charge, receive, pendingTotal, available, summary, settle, collectReceivables,
    payday, monthlyBurn, accrueDay, closeEmployment, accrueLoans, borrow, recognizeRevenue};
})();
