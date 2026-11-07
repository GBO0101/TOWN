/* 標題列、辦公室日誌與角色卡；日誌快取只屬於顯示層。 */
const PanelView = (() => {
  let _lastTimelineCount = 0;
  let _lastTimelineId = null;
  let _lastDay;
  let _lastEvents;

  function isTimelineAtBottom(timeline) {
    if (timeline.hidden) return false;
    return timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 30;
  }

  function init() {
    const roster = document.getElementById('charactersBar');
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => document.documentElement.style.setProperty('--roster-height', `${roster.offsetHeight}px`)).observe(roster);
    }
    let followTimeline = true, timelineTop = 0;
    document.querySelector('.timeline-panel').addEventListener('click', event => {
      const button = event.target.closest('[data-panel-toggle]');
      if (!button) return;
      const content = document.getElementById(button.getAttribute('aria-controls'));
      const collapse = button.getAttribute('aria-expanded') === 'true';
      if (content.id === 'timeline' && collapse) { followTimeline = isTimelineAtBottom(content); timelineTop = content.scrollTop; }
      content.hidden = collapse;
      button.closest('[data-collapsible]').classList.toggle('is-collapsed', collapse);
      button.setAttribute('aria-expanded', String(!collapse));
      button.setAttribute('aria-label', `${collapse ? '展開' : '縮小'}${button.dataset.panelLabel}`);
      button.textContent = collapse ? '＋ 展開' : '− 縮小';
      if (content.id === 'timeline' && !collapse) content.scrollTop = followTimeline ? content.scrollHeight : timelineTop;
    });
  }

  function renderProducts(sim) {
    const money = amount => '$' + Math.round(amount).toLocaleString();
    const developing = sim.products.filter(product => product.phase === 'developing').length;
    const operating = sim.products.filter(product => product.phase === 'live').length;
    document.getElementById('productTotals').textContent = `${developing} 開發 · ${operating} 營運`;
    document.getElementById('productDecision').textContent = sim.productDecision;
    const list = document.getElementById('productList');
    const existing = new Map([...list.children].map(card => [card.dataset.productId, card]));
    for (const product of sim.products) {
      const card = existing.get(product.id) || document.createElement('article');
      if (!card.parentElement) {
        card.className = 'project-progress-card'; card.dataset.productId = product.id;
        card.innerHTML = '<h4></h4><p class="product-stage"></p><p class="product-funding"></p><p class="product-customers"></p><p class="product-sales"></p><p class="product-maintenance"></p><p class="product-daily"></p><p class="product-costs"></p><p class="product-balance"></p>';
        list.append(card);
      }
      card.dataset.phase = product.phase;
      card.querySelector('h4').textContent = product.name;
      const development = sim.projects.find(project => project.id === product.projectId);
      card.querySelector('.product-stage').textContent = product.phase === 'developing' ? `開發中 ${development?.progress.toFixed(1) || 0}%`
        : product.phase === 'live' ? `營運中 · 第 ${product.launchedDay} 天上線` : `已停運 · ${product.stopReason || ''}`;
      card.querySelector('.product-funding').textContent = `啟動投入 ${money(product.invested)}`;
      const customers = product.customers || 0;
      card.querySelector('.product-customers').textContent = `${product.phase === 'stopped' ? '停運時客戶' : '付費客戶'} ${customers} 位 · 每位每日 ${money(product.revenuePerCustomer)}`;
      const pending = sim._projectAttempt?.kind === 'product' && sim._projectAttempt.proj.id === product.id;
      const sales = pending && sim.characters.find(ch => ch.id === sim._projectAttempt.salesId);
      card.querySelector('.product-sales').textContent = product.phase === 'developing' ? '上線後由業務開發客戶' : product.phase === 'stopped' ? '已停止獲客' : pending
        ? `${sales?.name || '業務'}正在開發客戶` : product.lastSale ? `第 ${product.lastSale.day} 天最近新增 ${product.lastSale.customers} 位，業務持續拓客` : '等待業務開發客戶';
      const maintenance = sim.projects.find(project => project.maintenance && project.productId === product.id);
      const overdue = maintenance && sim.day > maintenance.deadlineDay;
      const churn = `${PRODUCT_POLICY.maintenance.dailyChurn * 100}%`;
      card.querySelector('.product-maintenance').textContent = product.phase === 'developing' ? '開發中，尚無維護需求' : product.phase === 'stopped' ? '已停止維護'
        : maintenance ? `維護 ${maintenance.progress.toFixed(1)}% · ${overdue ? `已逾期，日結流失 ${churn} 客戶` : `第 ${maintenance.deadlineDay} 天內完成`} · 本次已流失 ${maintenance.lostCustomers || 0} 位`
        : `下次維護：第 ${product.nextMaintenanceDay} 天`;
      card.querySelector('.product-maintenance').classList.toggle('is-overdue', !!overdue);
      const income = product.lastIncome;
      card.querySelector('.product-daily').textContent = (product.phase === 'developing' ? '開發期間沒有被動收入' : product.phase === 'stopped' ? '停運後每日收入 $0' : `目前預估每日收入 ${money(customers * product.revenuePerCustomer)}`) +
        (income ? ` · 最近營業日收入 ${money(income.revenue)}，營運淨額 ${money(income.profit)}` : ' · 尚無營運收支');
      const fixedCost = Object.values(product.dailyCosts).reduce((sum, amount) => sum + amount, 0), cost = PassiveProducts.dailyCost(product);
      card.querySelector('.product-costs').textContent = `${product.phase === 'stopped' ? '停運後每日成本 $0；原營運成本' : product.phase === 'live' ? '每日成本' : '上線後每日成本'} ${money(cost)}（固定 ${money(fixedCost)}＋客戶用量 ${money(cost - fixedCost)}）：` +
        Object.entries(PassiveProducts.costs(product)).map(([category, amount]) => `${category} ${money(amount)}`).join('、');
      card.querySelector('.product-balance').textContent = `累計產品收支 ${money(product.totalRevenue - product.totalOperatingCost - product.invested)}（含啟動費，未分攤薪資）`;
      existing.delete(product.id);
    }
    for (const card of existing.values()) card.remove();
  }

  function renderProjects(sim) {
    const list = document.getElementById('projectList');
    const existing = new Map([...list.children].filter(el => el.dataset.contractKey).map(el => [el.dataset.contractKey, el]));
    const rows = [...sim.projects, ...(sim.lastProjectResult ? [sim.lastProjectResult] : [])];
    list.querySelector('.project-empty')?.remove();
    document.getElementById('projectTotals').textContent = `${sim.projects.length} 案進行中`;
    const hours = value => value.toLocaleString(undefined, {maximumFractionDigits: 1});
    rows.forEach((project, index) => {
      const key = String(project.contractId ?? project.id ?? index);
      const card = existing.get(key) || document.createElement('article');
      if (!card.parentElement) {
        card.className = 'project-progress-card';
        card.dataset.contractKey = key;
        card.innerHTML = '<div class="project-card-heading"><h4></h4><span class="project-percent"></span></div><div class="project-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div><p class="project-work"></p><p class="project-personnel"></p><p class="project-team"></p><p class="project-finance"></p><p class="project-deadline"></p>';
        list.append(card);
      }
      const snapshot = projectWorkSnapshot(project);
      const status = project.status || 'active';
      card.style.order = index;
      card.dataset.projectId = project.id || '';
      card.dataset.status = status;
      card.querySelector('h4').textContent = project.name || '工作專案';
      card.querySelector('.project-percent').textContent = status === 'completed' ? (project.maintenance ? '維護完成' : project.source === 'product' ? '已上線' : '已交付') : status === 'cancelled' ? '已取消' : status === 'failed' ? '未交付' : `${snapshot.progress.toFixed(1)}%`;
      const meter = card.querySelector('.project-meter');
      meter.setAttribute('aria-label', `${project.name || '專案'}工作進度`);
      meter.setAttribute('aria-valuenow', snapshot.progress.toFixed(2));
      meter.querySelector('span').style.width = `${snapshot.progress}%`;
      card.querySelector('.project-work').textContent = `已完成 ${hours(snapshot.done)}/${hours(snapshot.work)} · 剩餘 ${hours(snapshot.remaining)} 標準人時`;
      card.querySelector('.project-personnel').textContent = `工作 ${snapshot.working.length} 人 · 分派 ${snapshot.assigned.length} 人`;
      const names = snapshot.working.map(ch => ch.name);
      const eligible = sim.characters.filter(ch => ch.employment !== 'departed' && ch.field === project.type);
      const waiting = snapshot.assigned.length ? `${snapshot.assigned.map(ch => ch.name).join('、')} · 正在返回座位`
        : !eligible.length ? '缺少對應職能，等待招募評估'
        : project.source === 'product' && !PassiveProducts.canWork(project) ? '本日研發額度已用完，優先處理客戶合約'
        : sim.gameTime < 8 || sim.gameTime >= 17.5 ? '非正常上班時段，下一營業日接續'
        : '等待下一輪派工，人員可能正在休息、會議或其他案件';
      card.querySelector('.project-team').textContent = names.length ? names.join('、') : status === 'active' ? waiting : `第 ${project.closedDay} 天結案`;
      card.querySelector('.project-finance').textContent = project.maintenance ? '產品維護 · 無報酬，逾期將流失客戶' : project.source === 'product' ? '公司自研 · 完成上線後才產生營運收入'
        : Number.isFinite(project.estimatedCost) ? `合約 $${project.reward.toLocaleString()} · 預估成本 $${project.estimatedCost.toLocaleString()} · 預估利潤 $${project.estimatedProfit.toLocaleString()}（${(project.estimatedProfit / project.reward * 100).toFixed(1)}%）` : '';
      const daysLeft = project.deadlineDay - sim.day;
      card.querySelector('.project-deadline').textContent = status !== 'active' ? '' : project.maintenance
        ? daysLeft >= 0 ? `第 ${project.deadlineDay} 天內完成 · 逾期每日流失 ${PRODUCT_POLICY.maintenance.dailyChurn * 100}% 客戶`
          : `維護已逾期 ${-daysLeft} 日 · 每日流失 ${PRODUCT_POLICY.maintenance.dailyChurn * 100}% 客戶，仍可修復`
        : project.source === 'product' ? '開發排程保留客戶交付所需人力' : !Number.isFinite(daysLeft) ? '期限未設定'
        : daysLeft > 0 ? `第 ${project.deadlineDay} 天到期 · 剩 ${daysLeft} 個營業日` : daysLeft === 0 && sim.gameTime < 17.5 ? '今日 17:30 到期' : '已逾期';
      card.querySelector('.project-deadline').classList.toggle('is-overdue', status === 'active' && !!project.maintenance && daysLeft < 0);
      existing.delete(key);
    });
    for (const card of existing.values()) card.remove();
    if (!rows.length) list.innerHTML = '<p class="project-empty">尚無進行中專案</p>';
  }

  function render(sim, hour) {
    if (_lastEvents !== sim.events) {
      document.getElementById('timeline').replaceChildren();
      _lastTimelineCount = 0;
      _lastTimelineId = null;
      _lastDay = undefined;
      _lastEvents = sim.events;
    }
    // 打卡機
    const clockDisplay = document.getElementById('clockDisplay');
    const clockStatus = document.getElementById('clockStatus');
    if (clockDisplay && clockStatus) {
      const lateToday = sim.lateRecords.filter(r => r.date === `${sim.day}`).length;
      clockDisplay.textContent = `🕐 打卡機 (遲到${lateToday})`;
      if (hour >= 8.0 && hour < 17.5) {
        clockStatus.textContent = lateToday > 0 ? `⚠️ ${lateToday}人遲到` : `✅ 今日正常`;
        clockStatus.className = 'clock-status' + (lateToday > 0 ? ' punched-out' : ' punched-in');
      } else if (hour >= 17.5 && hour < 20.0) {
        const leftCount = sim.characters.filter(c =>
          c.employment !== 'departed' && sim.dailyPunch?.[c.id]?.punchedOut
        ).length;
        clockStatus.textContent = `🏠 ${leftCount}人已下班`;
        clockStatus.className = 'clock-status punched-out';
      } else {
        clockStatus.textContent = '🌙 休息中';
        clockStatus.className = 'clock-status';
      }
    }


    // Timeline
    document.getElementById('timelineSummary').textContent = `最近 ${sim.events.length} 則`;
    const tlc = document.getElementById('timeline');
    const wasAtBottom = isTimelineAtBottom(tlc);
    if (!sim.events.length) {
      tlc.innerHTML = '<div class="timeline-empty">模擬進行中，事件即將出現...</div>';
      _lastTimelineCount = 0;
      _lastTimelineId = null;
      _lastDay = undefined;
    } else {
      const lastRendered = sim.events.findIndex(ev => ev.id === _lastTimelineId);
      const rebuild = lastRendered < 0 || sim.events.length - lastRendered !== _lastTimelineCount;
      const newEvents = rebuild ? sim.events : sim.events.slice(0, lastRendered);
      if (newEvents.length) {
        if (rebuild) {
          tlc.innerHTML = '';
          _lastDay = undefined;
        }
        _lastTimelineCount = sim.events.length;
        _lastTimelineId = sim.events[0].id;
        if (tlc.children.length === 1 && tlc.querySelector('.timeline-empty')) {
          tlc.innerHTML = '';
        }
        let html = '';
        for (let i = newEvents.length - 1; i >= 0; i--) {
          const ev = newEvents[i];
          if (ev.day !== _lastDay) {
            html += `<div class="day-sep"><span>📅 第 ${ev.day} 天</span></div>`;
          }
          _lastDay = ev.day;
          const tags = (ev.chars||[]).filter(x=>x&&x.id).map(c => {
            const person = sim.characters.find(x => x.id === c.id) || c;
            return `<span class="event-char" style="--person-color:${escapeHtml(c.color)}">${OfficeArt.portrait(person, 'tag')} ${escapeHtml(c.name)}</span>`;
          }).join('');
          const icon = { arrive:'🚶', work:'💻', collaborate:'🤝', coffee:'☕', lunch:'🍱',
            inspect:'👔', leave:'🚪', overtime:'🌙', toilet:'🚻', stretch:'🧘',
            door_open:'🚪', overtime_note:'📌', new_day:'📅', walk_to_desk:'🚶', walk_to_door:'🚪',
            late:'⏰', scold:'😠', gossip:'🤫', mentor:'📖', news_discuss:'🗣️', payday:'💰', praise:'👏',
            big_meeting:'📋', big_firedrill:'🚨', big_birthday:'🎂', big_serverdown:'💥',
            big_milestone:'🏆', big_client:'🤝', big_powerout:'⚡',
            project_start:'📋', project_done:'🎉', budget_normal:'💰', daily_settlement:'🧾', budget_tight:'📉',
            budget_debt:'💸', finance_win:'🎉', finance_loss:'😰', salary_day:'💳',
            hire:'🎉', fired:'😠', laid_off:'💼', retired:'🎊', intern_convert:'🎊', promotion:'🎊', health_leave:'🛌', health_return:'🌿',
            mentor_assign:'📖', note:'📋', client_arrive:'🤝', client_leave:'🚶', product_prospect:'📣', product_customers:'🤝', product_sale_failed:'📭',
            after_work:'🌙', invest_win:'📈', invest_loss:'📉',
          }[ev.type]||'📌';
          html += `<article class="event-card"><div class="event-time">${icon} ${escapeHtml(ev.time||ev.timeLabel||'')}</div><div class="event-text">${escapeHtml(ev.text)}</div><div class="event-people">${tags}</div></article>`;
        }
        tlc.insertAdjacentHTML('beforeend', html);
        if (wasAtBottom) tlc.scrollTop = tlc.scrollHeight;
      }
    }
    const sdb = document.getElementById('scrollDownBtn');
    if (isTimelineAtBottom(tlc)) { sdb.classList.remove('show'); } else { sdb.classList.add('show'); }

    // Character cards
    const bar = document.getElementById('charactersBar');
    const existingCards = new Map();
    for (const child of bar.children) {
      if (child.dataset && child.dataset.charId) {
        existingCards.set(child.dataset.charId, child);
      }
    }
    for (const ch of sim.characters.filter(ch => ch.employment !== 'departed')) {
      let card = existingCards.get(ch.id);
      if (!card) {
        card = document.createElement('button');
        card.type = 'button';
        card.dataset.charId = ch.id;
        card.addEventListener('click', ()=>openCharPopup(ch.id));
        card.innerHTML = `${OfficeArt.portrait(ch, 'card')}
          <span class="char-info">
            <span class="char-name"></span><span class="char-role"></span><span class="char-career"></span>
            <span class="char-status"><span class="dot"></span><span class="char-status-text"></span></span>
            <span class="char-memory-count"></span>
          </span>`;
        bar.appendChild(card);
      }
      const status = CharacterRules.status(ch);
      card.className = 'char-card'+(['off_duty', 'departed', 'health_leave'].includes(status.key) ? ' away' : '');
      card.dataset.activity = status.key;
      card.style.setProperty('--person-color', ch.color);
      card.setAttribute('aria-label', `${ch.name} · ${ch.role} · 查看角色資訊`);
      OfficeArt.updatePortrait(card.querySelector('.avatar'), ch);
      const moodPct = Math.round((ch.mood.value ?? 0.5)*100);
      const healthInfo = EmployeeHealth.snapshot(ch), health = healthInfo.health;
      card.querySelector('.char-name').textContent = ch.name;
      card.querySelector('.char-role').textContent = ch.role;
      const career = CharacterCareer.snapshot(ch);
      card.querySelector('.char-career').textContent = career.label;
      card.querySelector('.char-career').title = career.details;
      card.querySelector('.char-status-text').textContent = `${OfficeArt.activity(ch)} · ${ch.mood.emoji} ${ch.mood.label}`;
      card.querySelector('.dot').hidden = ['off_duty', 'departed', 'health_leave'].includes(status.key);
      card.querySelector('.char-memory-count').textContent = `🧠 ${ch.memories.length} 條記憶 · ${healthInfo.label}`;
      card.querySelector('.char-memory-count').title = healthInfo.details;
      card.dataset.health = health == null ? 'unknown' : health < 0.4 ? 'low' : 'ok';
      card.dataset.mood = moodPct > 50 ? 'ok' : 'low';
      existingCards.delete(ch.id);
    }
    for (const el of existingCards.values()) el.remove();

    // Clock
    const hh = Math.floor(hour);
    const mm = Math.floor((hour-hh)*60);
    const dayDisplay = sim.day||1;
    document.getElementById('dayCounter').textContent = dayDisplay;
    document.getElementById('timeDisplay').textContent =
      `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}`;

    // Loans
    const loanEl = document.getElementById('loanDisplay');
    if (loanEl) {
      const finance = CompanyFinance.summary();
      document.getElementById('companyProfit').textContent = `本月損益 $${finance.monthProfit.toLocaleString()} · 收入於交付或實際營運時認列`;
      renderProducts(sim);
      const direction = finance.dailyProfit > 0 ? 'up' : finance.dailyProfit < 0 ? 'down' : 'flat';
      const dailyProfit = `${finance.dailyProfit < 0 ? '-' : '+'}$${Math.abs(finance.dailyProfit).toLocaleString()}`;
      loanEl.innerHTML = `💵 現金$${finance.cash.toLocaleString()} 應收$${finance.receivables.toLocaleString()} 預收$${finance.advances.toLocaleString()} 應付$${finance.payables.toLocaleString()} 🏦借款$${finance.debt.toLocaleString()} <span class="equity-balance">淨資產$${finance.equity.toLocaleString()}<span class="daily-profit" data-direction="${direction}">（今日 ${dailyProfit}）</span></span>`;
      loanEl.title = `應付包含未到期月薪與成本；今日到期 $${finance.due.toLocaleString()}。每 ${ECONOMY.daysPerMonth} 個營業日結薪；今日損益依當天認列收入減費用，換日歸零；收款及付款不重複計入損益。`;
    }
    if (!document.getElementById('charPopup').classList.contains('hidden')) {
      updateCharFinance(_popupCharId);
      updateCharActivity(_popupCharId);
    }

    const company = sim.company;
    const occupied = sim.characters.filter(ch => ch.employment !== 'departed' && ch.id !== 'boss').length;
    document.getElementById('companyDisplay').textContent = `🏢 團隊 ${occupied + 1} 人 · 員工座位 ${occupied}/${company.seats} · 月租 $${CompanyGrowth.spaceCosts().rent.toLocaleString()}`;
    document.getElementById('companyExpansion').textContent = company.expansion
      ? `🛠 增設 ${company.expansion.additionalSeats} 席，預計第 ${company.expansion.readyDay} 天完成`
      : `🪑 ${company.seats - occupied} 個空位 · 依人力需求動態擴張`;
    const candidate = company.recruitment && CompanyGrowth.candidates().find(candidate => candidate.id === company.recruitment.candidateId);
    document.getElementById('companyRecruitment').textContent = candidate
      ? `👤 招募 ${candidate.name} · ${candidate.role} · 月薪 $${candidate.salary.toLocaleString()} · 第 ${company.recruitment.readyDay} 天預計報到`
      : '👤 尚無進行中的招募';
    document.getElementById('companyDecision').textContent = company.decision;

    renderProjects(sim);

    // 進行中專案依工作量加權，不以單一案件代表整家公司。
    const projFill = document.getElementById('projectBarFill');
    const projLabel = document.getElementById('projectLabel');
    if (projFill && projLabel) {
      if (sim.projects.length) {
        const totals = sim.projects.map(projectWorkSnapshot).reduce((sum, project) => ({work: sum.work + project.work, done: sum.done + project.done}), {work: 0, done: 0});
        const pct = totals.done / totals.work * 100;
        projFill.style.width = `${pct}%`;
        projLabel.textContent = `📋 進行中 ${sim.projects.length} 案 · 合計 ${pct.toFixed(1)}%`;
        projLabel.title = `已完成 ${totals.done.toFixed(1)}/${totals.work.toFixed(1)} 標準人時；各案詳情見專案進度`;
      } else if (sim.lastProjectResult) {
        const result = sim.lastProjectResult;
        projFill.style.width = `${projectWorkSnapshot(result).progress}%`;
        projLabel.textContent = `📋 最近${result.status === 'completed' ? '交付' : '未交付'}：${result.name}`;
        projLabel.title = `第 ${result.closedDay} 天結案`;
      } else {
        projFill.style.width = '0%';
        projLabel.textContent = '📋 空窗期 — 等待業務接案';
        projLabel.title = '';
      }
      if (sim._projectUpdated && projFill) {
        projFill.classList.add('pulse');
        sim._projectUpdated = false;
        setTimeout(() => projFill.classList.remove('pulse'), 300);
      }
    }

    // Overtime policy
    const policyDisplay = document.getElementById('overtimePolicyDisplay');
    if (policyDisplay) {
      const labels = { strict: '嚴格(不鼓勵)', normal: '正常', flexible: '彈性(鼓勵)' };
      const colors = { strict: 'var(--accent)', normal: 'var(--accent-warn)', flexible: 'var(--accent-ok)' };
      policyDisplay.textContent = `🕐 政策：${labels[sim.overtimePolicy]}`;
      policyDisplay.style.color = colors[sim.overtimePolicy];
    }

  }

  return { render, init };
})();
