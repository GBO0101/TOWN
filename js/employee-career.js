/* 記錄實際工作區間，分別累積經驗與健康負荷，不重複計時。 */
const CharacterCareer = (() => {
  function create(ch) {
    if (ch.id === 'boss' || ch.field === 'boss') return null;
    const level = /總監|經理|主管|首席|專家/.test(ch.role) ? 4 : ch.seniority === 'intern' ? 0 : ch.seniority === 'veteran' ? 3 : 1;
    return {level, hours: 0, totalHours: 0, promotions: []};
  }

  function record(ch, task) {
    if (ch.employment === 'departed' || EmployeeHealth.onLeave(ch) || ch.state === 'walking' || sim.hasLeftToday[ch.id] ||
        !Number.isFinite(task?.startedGT) || (task.startedDay != null && task.startedDay !== sim.day)) return;
    const deskWork = ch.isPresent && isProjectWorkTask(task) && POS[ch.deskId] && distance(ch.pos, POS[ch.deskId]) < 0.5;
    const fieldWork = !ch.isPresent && task.isOutside && ['client_visit', 'day1_prospecting', 'pursue_deal'].includes(task.type);
    if (!deskWork && !fieldWork) return;
    const start = Math.max(task.startedGT, task.experienceGT ?? task.startedGT);
    const end = Math.min(sim.gameTime, task.endGT ?? sim.gameTime, 20.5);
    if (end <= start) return;
    const lunch = Math.max(0, Math.min(end, CFG.lunchEnd) - Math.max(start, CFG.lunchStart));
    const hours = end - start - lunch * (1 - CFG.lunchEfficiency);
    task.experienceGT = end;
    EmployeeHealth.record(ch, end - start, Math.max(0, end - Math.max(start, 17.5)));
    if (!ch.career) return;
    ch.career.hours += hours;
    ch.career.totalHours += hours;
    ch.career.lastWorkedDay = sim.day;
  }

  function review(ch) {
    const career = ch?.career;
    if (!career || ch.employment === 'departed' || career.lastWorkedDay === sim.day || career.promotions.at(-1)?.day === sim.day) return false;
    const current = CAREER_LEVELS[career.level];
    if (current.hours == null || career.hours + 1e-9 < current.hours) return false;
    const previousSalary = ch.salary, previousRole = ch.role;
    career.hours = Math.max(0, career.hours - current.hours);
    career.level++;
    ch.salary = Math.round(ch.salary * (1 + current.raise));
    ch.role = CAREER_TITLES[ch.field]?.[career.level] || ch.role;
    ch.seniority = career.level >= 3 ? 'veteran' : 'newcomer';
    career.promotions.push({day: sim.day, level: career.level, previousRole, role: ch.role, previousSalary, salary: ch.salary});
    updateMood(ch.id, 0.1);
    addMem(ch.id, `累積工作經驗後晉升為${ch.role}，月薪調整為 $${ch.salary.toLocaleString()}`, 'promotion');
    officeEvent(career.level === 1 ? 'intern_convert' : 'promotion', `${ch.name}由${previousRole}晉升為${ch.role}，月薪 $${previousSalary.toLocaleString()} → $${ch.salary.toLocaleString()}，今日起生效`,
      [{id: ch.id, name: ch.name, emoji: ch.emoji, color: ch.color}]);
    return true;
  }

  function snapshot(ch) {
    const career = ch.career;
    if (!career) return {label: '公司負責人', details: '負責人不適用員工職等晉升'};
    const level = CAREER_LEVELS[career.level];
    const hours = value => Math.floor(value * 10) / 10;
    const label = level.hours == null ? `${level.name} · 最高職等` : `${level.name} · ${hours(career.hours)}/${level.hours} 小時`;
    const next = level.hours == null ? '' : ` · 達標後次一營業日晉升${CAREER_TITLES[ch.field]?.[career.level + 1] || CAREER_LEVELS[career.level + 1].name}，月薪 $${Math.round(ch.salary * (1 + level.raise)).toLocaleString()}（+${Math.round(level.raise * 100)}%）`;
    return {label, details: `${label} · 累積 ${hours(career.totalHours)} 有效小時${next}`};
  }

  return {create, record, review, snapshot};
})();
