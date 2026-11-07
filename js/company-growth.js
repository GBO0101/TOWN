/* 老闆每日評估職能缺口，管理擴張、招募與報到。 */
const CompanyGrowth = (() => {
  function createState() {
    return {seats: STAFFING.initialSeats, expansion: null, recruitment: null, candidates: [], vacancies: {},
      nextCandidateId: 1, lastReviewDay: 0, pressureDays: 0, lastExpansionDay: 0,
      nextRecruitmentDay: 0, decision: '等待老闆評估人力與空間'};
  }

  function desks() { return Array.from({length: sim.company.seats}, (_, index) => `desk${index + 1}`); }

  function spaceCosts(extraSeats = 0) {
    const extra = sim.company.seats + extraSeats - STAFFING.initialSeats;
    return {rent: ECONOMY.monthlyRent + extra * STAFFING.monthlyRentPerSeat,
      utilities: ECONOMY.monthlyUtilities + extra * STAFFING.monthlyUtilitiesPerSeat};
  }

  function candidates() {
    return [...CANDIDATES, ...sim.company.candidates].map(candidate => {
      const former = sim.characters.find(ch => ch.id === candidate.id && ch.employment === 'departed');
      return former?.career ? {...candidate, role: former.role, seniority: former.seniority, salary: Math.max(candidate.salary, former.salary)} : candidate;
    });
  }

  function candidateFor(field, extraSeats) {
    let available = candidates().filter(candidate => candidate.field === field &&
      !sim.characters.some(ch => ch.id === candidate.id && (ch.employment !== 'departed' || ch.departReason === 'retired')));
    if (!available.length) {
      const source = [...CANDIDATES, ...CHARACTERS].find(ch => ch.field === field && ch.seniority !== 'intern');
      const number = sim.company.nextCandidateId++;
      const surnames = ['陳', '林', '黃', '張', '吳', '劉', '蔡', '楊', '許', '鄭'];
      const names = ['宇辰', '品妤', '冠廷', '雅涵', '柏翰', '怡安', '子軒', '欣妤'];
      let name = surnames[(number - 1) % surnames.length] + names[Math.floor((number - 1) / surnames.length) % names.length];
      if (sim.characters.some(ch => ch.name === name) || candidates().some(ch => ch.name === name)) name += ` ${number}`;
      const candidate = {...source, id: `recruit_${number}`, name, field, skill: 1, seniority: 'newcomer',
        salary: {tech: 75000, design: 55000, mkt: 48000, admin: 52000, sales: 35000}[field],
        role: {tech: '軟體工程師', design: '介面設計師', mkt: '行銷專員', admin: '行政專員', sales: '業務專員'}[field],
        initMems: ['完成面試，期待加入團隊']};
      sim.company.candidates.push(candidate);
      available = [candidate];
    }
    available.sort((a, b) => (b.skill || 1) - (a.skill || 1) || a.salary - b.salary);
    return available.find(candidate => CompanyFinance.available() >= hiringReserve(candidate, extraSeats) + extraSeats * STAFFING.setupPerSeat + STAFFING.recruitmentCost) || available[0];
  }

  function hiringReserve(candidate, extraSeats = 0) {
    const addedCosts = extraSeats * (STAFFING.monthlyRentPerSeat + STAFFING.monthlyUtilitiesPerSeat) +
      candidate.salary * (1 + ECONOMY.employerOverheadRate) + ECONOMY.monthlySoftwarePerEmployee + ECONOMY.monthlySuppliesPerEmployee;
    return CompanyFinance.monthlyBurn() * STAFFING.operatingReserveMonths + addedCosts * STAFFING.reserveMonths;
  }

  function decide(text, type = 'staff_review') {
    if (sim.company.decision === text) return;
    sim.company.decision = text;
    officeEvent(type, text);
  }

  function needs() {
    const workers = sim.characters.filter(ch => ch.employment !== 'departed');
    const result = [];
    for (const field of ['tech', 'design', 'mkt', 'admin']) {
      const projects = sim.projects.filter(project => project.type === field);
      const hours = projects.reduce((sum, project) => sum + Math.max(0, project.work - (project.workDone || 0)), 0);
      const skill = workers.reduce((sum, ch) => sum + (projectSkill(ch, field) >= 0.5 ? projectSkill(ch, field) * EmployeeHealth.efficiency(ch) : 0), 0);
      const targetDays = Math.min(STAFFING.targetBacklogDays, ...projects.map(project => Math.max(3, project.deadlineDay - sim.day)));
      const missing = hours / (ECONOMY.hoursPerDay * ECONOMY.utilization * targetDays) - skill;
      if (missing > 0.5) result.push({field, missing, hours});
    }
    for (const field of ['sales', 'admin', 'tech', 'design', 'mkt']) {
      const replacement = sim.company.vacancies[field] || 0;
      const essential = !workers.some(ch => ch.field === field) && workers.length >= 3;
      if (replacement || essential) {
        const existing = result.find(need => need.field === field);
        if (existing) { existing.essential = essential; existing.replacement = replacement; existing.missing = Math.max(existing.missing, replacement); }
        else result.push({field, missing: Math.max(1, replacement), hours: 0, essential, replacement});
      }
    }
    return result.sort((a, b) => Number(!!b.essential) - Number(!!a.essential) || Number(!!b.replacement) - Number(!!a.replacement) || b.missing - a.missing);
  }

  function registerDesks() {
    for (let index = 6; index < sim.company.seats; index++) {
      const id = `desk${index + 1}`;
      POS[id] = {x: [6.9, 22.6, 38.2][index % 3], y: 58.5 + Math.floor(index / 3) * 15};
      BLOCKS[id] = {...POS[id], w: 22, h: 14};
    }
  }

  function tick(hour) {
    if (hour < 9 || hour >= 17 || sim.company.lastReviewDay === sim.day) return;
    sim.company.lastReviewDay = sim.day;
    if (!sim.characters.some(ch => ch.id === 'boss' && ch.employment !== 'departed')) return;
    if (sim.company.expansion && sim.day >= sim.company.expansion.readyDay) {
      sim.company.seats += sim.company.expansion.additionalSeats;
      sim.company.expansion = null;
      registerDesks();
      sim.maxProjects = Math.max(sim.maxProjects, 3 + Math.floor((sim.company.seats - STAFFING.initialSeats) / 3));
      decide(`空間整備完成，現有 ${sim.company.seats} 個員工座位`, 'office_expanded');
    }
    const demand = needs();
    const recruitment = sim.company.recruitment;
    if (recruitment && sim.day >= recruitment.readyDay) {
      const candidate = candidates().find(candidate => candidate.id === recruitment.candidateId);
      const stillNeeded = demand.some(need => need.field === recruitment.field);
      const funded = candidate && CompanyFinance.available() >= hiringReserve(candidate);
      const joined = stillNeeded && funded ? hireCharacter(candidate.id) : null;
      sim.company.recruitment = null;
      sim.company.nextRecruitmentDay = sim.day + STAFFING.recruitmentDays;
      if (joined) decide(`${joined.name}完成招募並報到，職位 ${joined.role}、月薪 $${joined.salary.toLocaleString()}`, 'recruitment_joined');
      else decide('招募重新評估：需求、空位或資金已變動，取消本次聘任，已發生的招募費保留', 'recruitment_cancelled');
    }
    sim.company.pressureDays = demand.length ? sim.company.pressureDays + 1 : 0;
    if (!demand.length) { decide('目前人力足以處理已簽合約，暫不擴編'); return; }
    if (sim.company.expansion || sim.company.recruitment || sim.company.pressureDays < STAFFING.demandDays || sim.day < sim.company.nextRecruitmentDay) return;
    const occupied = sim.characters.filter(ch => ch.employment !== 'departed' && ch.id !== 'boss').length;
    const additionalSeats = occupied < sim.company.seats ? 0 : Math.min(Math.ceil(demand[0].missing), Math.max(1, Math.floor(occupied / 4)));
    const candidate = candidateFor(demand[0].field, additionalSeats);
    if (occupied < sim.company.seats) {
      if (CompanyFinance.available() < STAFFING.recruitmentCost + hiringReserve(candidate)) {
        decide('有空位與人力缺口，但不足以保留 1 個月既有營運及 3 個月新增成本，暫緩招募'); return;
      }
      CompanyFinance.charge(STAFFING.recruitmentCost, '招募費');
      sim.company.recruitment = {candidateId: candidate.id, field: demand[0].field, readyDay: sim.day + STAFFING.recruitmentDays};
      decide(`老闆${demand[0].replacement ? '補足離職缺額，招募' : '依職能缺口招募'} ${candidate.name}（${candidate.role}），月薪 $${candidate.salary.toLocaleString()}，第 ${sim.company.recruitment.readyDay} 天預計報到`, 'recruitment_started');
      return;
    }
    if (sim.company.lastExpansionDay && sim.day - sim.company.lastExpansionDay < STAFFING.expansionCooldownDays) return;
    const cost = additionalSeats * STAFFING.setupPerSeat;
    if (CompanyFinance.available() < cost + STAFFING.recruitmentCost + hiringReserve(candidate, additionalSeats)) {
      decide('存在人力缺口，但不足以支付整備並保留 1 個月既有營運及 3 個月新增成本，暫緩擴編'); return;
    }
    CompanyFinance.charge(cost, '空間整備');
    sim.company.expansion = {additionalSeats, cost, readyDay: sim.day + STAFFING.fitoutDays};
    sim.company.lastExpansionDay = sim.day;
    decide(`老闆因已簽合約的人力缺口增設 ${additionalSeats} 席，整備費 $${cost.toLocaleString()}，第 ${sim.company.expansion.readyDay} 天完成`, 'office_expansion');
  }

  return {createState, desks, spaceCosts, candidates, tick};
})();
