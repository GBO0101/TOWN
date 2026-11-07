/* 健康效率、實際工作負荷與帶薪休養；薪資仍由既有財務流程處理。 */
const EmployeeHealth = (() => {
  function onLeave(ch) { return ch.employment !== 'departed' && ch.healthLeave === true; }

  function efficiency(ch) {
    if (ch.employment === 'departed' || onLeave(ch)) return 0;
    return HEALTH_POLICY.minimumEfficiency + (1 - HEALTH_POLICY.minimumEfficiency) * clamp(sim.health[ch.id] ?? 1, 0, 1);
  }

  function workday(ch) {
    if (ch.healthWork?.day !== sim.day) ch.healthWork = {day: sim.day, hours: 0, overtimeHours: 0, lifestyle: 0};
    return ch.healthWork;
  }

  function record(ch, hours, overtimeHours) {
    if (ch.employment === 'departed' || onLeave(ch)) return;
    const work = workday(ch);
    work.hours += hours; work.overtimeHours += overtimeHours;
  }

  function lifestyle(ch, change) {
    if (ch.employment !== 'departed' && !onLeave(ch)) workday(ch).lifestyle += change * HEALTH_POLICY.lifestyleScale;
  }

  function finishDay(ch) {
    if (ch.employment === 'departed' || ch._healthSettledDay === sim.day) return;
    ch._healthSettledDay = sim.day;
    const work = workday(ch), previous = sim.health[ch.id] ?? 1;
    const recovery = onLeave(ch) ? HEALTH_POLICY.leaveRecovery : HEALTH_POLICY.nightlyRecovery;
    const fatigue = work.hours * HEALTH_POLICY.workFatigue + work.overtimeHours * HEALTH_POLICY.overtimeFatigue;
    sim.health[ch.id] = clamp(previous + recovery - fatigue + work.lifestyle, 0, 1);
    ch.healthSummary = {day: sim.day, previous, health: sim.health[ch.id], hours: work.hours, overtimeHours: work.overtimeHours, recovery};
  }

  function beginDay(ch) {
    if (ch.employment === 'departed') return;
    const wasOnLeave = onLeave(ch), health = sim.health[ch.id] ?? 1;
    ch.healthLeave = wasOnLeave ? health < HEALTH_POLICY.returnAt : health < HEALTH_POLICY.leaveBelow;
    workday(ch);
    if (wasOnLeave === ch.healthLeave) return;
    const message = ch.healthLeave ? `${ch.name}健康 ${Math.round(health * 100)}%，安排帶薪休養，恢復至 ${Math.round(HEALTH_POLICY.returnAt * 100)}% 後返工` : `${ch.name}健康恢復至 ${Math.round(health * 100)}%，結束休養並恢復上班`;
    officeEvent(ch.healthLeave ? 'health_leave' : 'health_return', message, [{id: ch.id, name: ch.name, emoji: ch.emoji, color: ch.color}]);
    addMem(ch.id, message, 'health');
  }

  function snapshot(ch) {
    const health = sim.health[ch.id] ?? ch.healthAtDeparture;
    if (health == null) return {health: null, label: '未記錄', details: '沒有健康紀錄'};
    const label = `❤️ ${Math.round(health * 100)}% · 效率 ${Math.round(efficiency(ch) * 100)}%`;
    const details = onLeave(ch) ? `帶薪休養中，健康恢復至 ${Math.round(HEALTH_POLICY.returnAt * 100)}% 後返工` : `減少加班與正常休息可恢復健康；低於 ${Math.round(HEALTH_POLICY.overtimeMinimum * 100)}% 不加班，低於 ${Math.round(HEALTH_POLICY.leaveBelow * 100)}% 帶薪休養`;
    return {health, label, details};
  }

  return {onLeave, efficiency, record, lifestyle, finishDay, beginDay, snapshot};
})();
