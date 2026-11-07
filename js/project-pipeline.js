// 接案機會每日評估一次，成交後才建立合約。
const ProjectPipeline = (() => {
  function dispatchSales(sales, attempt) {
    contributeToProject(sales.id, sales.task);
    attempt.salesId = sales.id;
    sales.targetPos = {...DOOR_POS};
    sales.state = 'walking';
    sales.currentAction = attempt.kind === 'product' ? `開發「${attempt.proj.name}」付費客戶` : `出門爭取「${attempt.proj.name}」`;
    sales.task = {type: 'client_visit', actionText: sales.currentAction, _duration: 3, returnByGT: 17.5, _projectAttemptId: attempt.proj.id,
      isOutside: true, progress: 0, maxProgress: 3};
  }

  function tick(hour) {
    PassiveProducts.maintain(hour);
    for (const project of [...sim.projects]) {
      if (!project.maintenance && (sim.day > project.deadlineDay || (sim.day === project.deadlineDay && hour >= 17.5))) failProject(project);
    }
    if (sim.projects.length) sim._daysNoProject = 0;
    if (sim._projectAttempt?.kind === 'product' && sim._projectAttempt.proj.phase !== 'live') sim._projectAttempt = null;
    const sales = sim.characters.find(ch => CharacterRules.canDispatchSales(ch, hour) &&
      (!sim._projectAttempt?.salesId || sim._projectAttempt.salesId === ch.id));
    const contractRoom = sim.projects.filter(project => project.source !== 'product').length < sim.maxProjects;
    if (!sim._projectAttempt && sales && (contractRoom || sim.products.some(product => product.phase === 'live')) && hour >= 9 && hour < 16.5 && sim.finance.lastLeadDay !== sim.day) {
      sim.finance.lastLeadDay = sim.day;
      const product = PassiveProducts.salesTarget();
      const lastProductSalesDay = Math.max(0, ...sim.products.map(item => item.lastProspectedDay || 0));
      const productDue = product && (sim.day - lastProductSalesDay >= PRODUCT_POLICY.salesIntervalDays || !contractRoom);
      const marketing = sim.finance.programs.filter(program => program.untilDay > sim.day).reduce((sum, program) => sum + program.leadBonus, 0);
      const leadChance = Math.min(0.9, ECONOMY.leadChance + marketing + (sim.finance.reputation - 0.5) * 0.2);
      if (!productDue && contractRoom && Math.random() < leadChance) {
        const project = pickProject(sales.id);
        if (project) {
          project.salesId = sales.id;
          sim._projectAttempt = {proj: project, salesId: sales.id, visitsNeeded: 1 + Math.floor(Math.random() * 2), visitsDone: 0,
            successRate: Math.min(0.9, 0.4 + sim.finance.reputation * 0.25 + sales.mood.value * 0.15)};
          officeEvent('note', `取得「${project.name}」接洽機會，需拜訪 ${sim._projectAttempt.visitsNeeded} 次；尚未成交`, [sales]);
        }
      }
      if (!sim._projectAttempt && product) {
        product.lastProspectedDay = sim.day;
        sim._projectAttempt = {kind: 'product', proj: product, salesId: sales.id, visitsNeeded: 1, visitsDone: 0,
          successRate: Math.min(0.9, 0.4 + sim.finance.reputation * 0.25 + sales.mood.value * 0.15)};
        officeEvent('product_prospect', `安排${sales.name}開發「${product.name}」付費客戶，完成拜訪後才判定成交`, [sales]);
      }
    }
    if (sim._projectAttempt && sales && hour >= 8 && hour < 18 && sales.task?.type !== 'client_visit') {
      dispatchSales(sales, sim._projectAttempt);
    }
    const boss = sim.characters.find(ch => ch.id === 'boss' && ch.isPresent);
    if (boss && sim.day > 2 && sim._bossPolicyDay !== sim.day && hour >= 10 && hour < 11) {
      sim._bossPolicyDay = sim.day;
      const active = sim.characters.filter(ch => ch.isPresent);
      const mood = active.reduce((sum, ch) => sum + ch.mood.value, 0) / Math.max(1, active.length);
      const policy = CompanyFinance.available() < CompanyFinance.monthlyBurn() / 2 || mood < 0.35 ? 'strict' : sim.projects.length >= 2 ? 'normal' : 'flexible';
      if (policy !== sim.overtimePolicy) {
        sim.overtimePolicy = policy;
        officeEvent('note', `老闆依工作量與資金調整加班政策：${{strict: '嚴格', normal: '正常', flexible: '彈性'}[policy]}`, [boss]);
      }
    }
  }
  return {tick};
})();
