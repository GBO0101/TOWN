/* 接案估價共用實際薪資、營運成本及已簽工作量；報價不改寫已成立合約。 */
function projectDailyCapacity(type, reserveResearch = true) {
    const capacity = sim.characters.filter(ch => ch.employment !== 'departed' && ch.field === type)
        .reduce((sum, ch) => sum + projectSkill(ch, type) * EmployeeHealth.efficiency(ch), 0) * ECONOMY.hoursPerDay * ECONOMY.utilization;
    return capacity * (reserveResearch && sim.projects.some(project => project.source === 'product' && project.type === type) ? 1 - PRODUCT_POLICY.workShare : 1);
}

function projectEstimate(project, salesId) {
    const capacity = ['tech', 'design', 'mkt', 'admin'].reduce((sum, type) => sum + projectDailyCapacity(type), 0) * ECONOMY.daysPerMonth;
    const estimatedCost = Math.ceil(project.work * CompanyFinance.monthlyBurn(false) / Math.max(1, capacity) * (1 + ECONOMY.costContingency));
    const sales = sim.characters.find(ch => ch.id === salesId);
    const commissionRate = sales?.commissionRate || 0;
    const reward = Math.ceil(estimatedCost / Math.max(0.1, 1 - ECONOMY.targetMargin - commissionRate) / 1000) * 1000;
    return {estimatedCost, estimatedCommission: Math.round(reward * commissionRate),
        estimatedProfit: reward - estimatedCost - Math.round(reward * commissionRate), reward};
}

function canTakeProject(project) {
    const capacity = projectDailyCapacity(project.type);
    const booked = sim.projects.filter(item => item.source !== 'product' && item.type === project.type)
        .reduce((sum, item) => sum + Math.max(0, item.work - (item.workDone || 0)), 0);
    return capacity > 0 && (booked + project.work) / capacity <= ECONOMY.maxBacklogDays;
}
