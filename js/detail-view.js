/* 家具互動、角色詳情與記錄彈窗。 */
function initFurniture() {
  document.getElementById('officeScene').addEventListener('click', function(e) {
      const furniture = e.target.closest('.furniture.interactive');
      if (!furniture) return;
      e.stopPropagation();
      const type = furniture.dataset.furniture;
      const msgs = {};
      for (const dk of [...CompanyGrowth.desks(), 'boss_desk']) {
        msgs[dk] = ()=>{
          const ch = sim.characters.find(x => x.deskId === dk && x.employment !== 'departed');
          if (!ch) return '🪑 空座位';
          return `${ch.emoji} ${ch.name}的座位 · ${OfficeArt.activity(ch)} ${ch.mood.emoji}`;
        };
      }
      msgs['coffee'] = ()=>{ const ch=pick(sim.characters.filter(x=>x.isPresent)); if(ch)updateMood(ch.id,0.05); return '☕ 咖啡香氣四溢！來一杯提提神吧'; };
      msgs['sofa'] = ()=>'🛋️ 休息區 — 午休時間可以在這裡放鬆';
      msgs['bossdesk'] = ()=>'📋 老闆的辦公桌 — 看起來很整齊';
      msgs['toilet1'] = ()=>'🚽 廁間 A — 目前無人使用';
      msgs['toilet2'] = ()=>'🚽 廁間 B — 目前無人使用';
      const fn = msgs[type];
      if (fn) notify(fn(), 2500);
  });

  document.getElementById('mainDoor').addEventListener('click', function(e) {
    e.stopPropagation();
    const present = sim.characters.filter(c=>c.isPresent).length;
    const hour = sim.gameTime % 24;
    const isOpen = hour >= 17.5 || hour < 8.0;
    notify(isOpen?`🚪 大門開啟中 · ${present} 位同仁還在辦公室`:`🚪 大門關閉 · ${present} 人上班中`, 2500);
  });

  // 打卡機
  const timeClock = document.getElementById('timeClock');
  const latePopup = document.getElementById('latePopup');
  const latePopupBody = document.getElementById('latePopupBody');
  const latePopupClose = document.getElementById('latePopupClose');
  if (timeClock && latePopup) {
    timeClock.addEventListener('click', function(e) {
      e.stopPropagation();
      const isHidden = latePopup.classList.contains('hidden');
      if (isHidden) {
        if (latePopupBody && sim.lateRecords.length > 0) {
          latePopupBody.innerHTML = sim.lateRecords.slice(-20).reverse().map(r =>
            `<div class="late-record-item">
              <span class="late-record-name">${r.name}</span>
              <span class="late-record-time">${Math.floor(r.punchTime)}:${Math.floor((r.punchTime-Math.floor(r.punchTime))*60).toString().padStart(2,'0')}</span>
              <span class="late-record-fine">${r.lateMinutes || 0} 分鐘</span>
            </div>`
          ).join('');
        } else if (latePopupBody) {
          latePopupBody.innerHTML = '<div class="late-popup-empty">目前無遲到記錄</div>';
        }
        latePopup.classList.remove('hidden');
      } else {
        latePopup.classList.add('hidden');
      }
    });
    if (latePopupClose) {
      latePopupClose.addEventListener('click', function(e) {
        e.stopPropagation();
        latePopup.classList.add('hidden');
      });
    }
    document.addEventListener('click', function(e) {
      if (latePopup && !latePopup.classList.contains('hidden') && !timeClock.contains(e.target) && !latePopup.contains(e.target)) {
        latePopup.classList.add('hidden');
      }
    });
  }

}

// =============================================
// MODAL
// =============================================
let _modalReturnFocus = null;
function openModal(charId) {
  const ch = sim.characters.find(c=>c.id===charId);
  if (!ch) return;
  const modal = document.getElementById('memoryModal');
  _modalReturnFocus = document.activeElement;
  modal.classList.remove('hidden');
  document.getElementById('modalCharName').innerHTML = `${OfficeArt.portrait(ch, 'detail')} ${escapeHtml(ch.name)}`;
  document.getElementById('modalCharRole').textContent = ch.role;
  document.getElementById('modalCharPersonality').textContent = `💭 ${ch.personality}`;

  const ml = document.getElementById('modalMemoryList');
  const sorted = [...ch.memories].reverse();
  ml.innerHTML = sorted.map(m =>
    `<div class="memory-item"><span class="mem-icon">${m.type==='collaborate'||m.type==='inspect'?'💬':m.type==='initial'?'💭':'👀'}</span><div><div class="mem-text">${escapeHtml(m.text)}</div><div class="mem-time">第${m.day}天 · ${escapeHtml(m.timeLabel||'')}</div></div></div>`
  ).join('');

  const rl = document.getElementById('modalRelationsList');
  const rels = sim.relationships[charId]||{};
  const entries = Object.entries(rels).filter(([id])=>sim.characters.some(c=>c.id===id));
  rl.innerHTML = entries.length ? entries.map(([oid,rel])=>{
    const oc = sim.characters.find(c=>c.id===oid);
    if(!oc) return '';
    const fam = Math.round((rel.familiarity||0)*10)/10;
    const sent = Math.round((rel.sentiment||0.5)*100);
    return `<div class="relation-item">${OfficeArt.portrait(oc, 'tag')}<span class="rel-text">${escapeHtml(oc.name)}</span><span class="rel-score">熟悉${fam} · ${sent>=60?'友好':sent>=40?'中立':'疏遠'} · ${rel.interactions||0}次互動</span></div>`;
  }).join('') : '<div class="detail-empty">暫無同事關係</div>';
  document.getElementById('modalCloseBtn').focus();
}

function closeModal() {
  document.getElementById('memoryModal').classList.add('hidden');
  _modalReturnFocus?.focus();
}

// =============================================
// CHARACTER POPUP
// =============================================
let _popupCharId = null;
let _popupReturnFocus = null;

function updateCharFinance(charId) {
  const ch = sim.characters.find(ch => ch.id === charId);
  if (!ch) return;
  const payable = sim.finance.payables.filter(item => item.employeeId === charId).reduce((sum, item) => sum + item.amount, 0);
  document.getElementById('popupFinance').textContent = `月薪 $${ch.salary.toLocaleString()} · 存款 $${ch.money.toLocaleString()} · 待領 $${payable.toLocaleString()}`;
}

function updateCharActivity(charId) {
  const ch = sim.characters.find(ch => ch.id === charId);
  if (!ch) return;
    document.getElementById('popupRole').textContent = ch.role;
    document.getElementById('popupCareer').textContent = CharacterCareer.snapshot(ch).details;
  document.getElementById('popupAction').textContent = OfficeArt.activity(ch);
  document.getElementById('popupMood').textContent = `${ch.mood.emoji} ${ch.mood.label} (${Math.round(ch.mood.value * 100)}%)`;
  const healthInfo = EmployeeHealth.snapshot(ch), health = healthInfo.health;
  const element = document.getElementById('popupHealth');
  element.textContent = healthInfo.label;
  element.title = healthInfo.details;
  element.style.color = health == null ? 'var(--text-dim)' : health > 0.7 ? 'var(--accent-ok)' : health > 0.4 ? 'var(--accent-warn)' : 'var(--accent)';
  document.getElementById('popupThought').textContent = ch.currentThought?.text ? `💭 ${ch.currentThought.text}` : ch._afterWorkEvent ? `🌙 ${ch._afterWorkEvent.text}` : '—';
}

function closeCharPopup() {
  document.getElementById('charPopup').classList.add('hidden');
  (_popupReturnFocus?.isConnected ? _popupReturnFocus : document.querySelector('#charactersBar .char-card'))?.focus();
}

function openCharPopup(charId) {
  const ch = sim.characters.find(x => x.id === charId);
  if (!ch) return;
  _popupReturnFocus = document.activeElement;
  _popupCharId = charId;
  updateCharFinance(charId);
  updateCharActivity(charId);
  const popup = document.getElementById('charPopup');
  document.getElementById('popupEmoji').innerHTML = OfficeArt.portrait(ch, 'detail');
  document.getElementById('popupName').textContent = ch.name;
  // Memories summary
  const memList = document.getElementById('popupMemories');
  memList.innerHTML = '';
  const mems = ch.memories || [];
  if (mems.length === 0) {
    memList.innerHTML = '<div class="popup-mem-empty">尚無記憶</div>';
  } else {
    const groups = {};
    for (const m of mems) {
      const t = m.type || 'other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(m);
    }
    const parts = [];
    const projCnt = (groups.project||[]).length;
    const failCnt = (groups.project_fail||[]).length;
    if (projCnt > 0 || failCnt > 0) {
      const projParts = [];
      if (projCnt > 0) projParts.push(`${projCnt} 個完成`);
      if (failCnt > 0) projParts.push(`${failCnt} 個逾期`);
      parts.push(`💼 專案${projParts.join('、')}`);
    }
    if ((groups.overtime||[]).length > 0) {
      const ot = groups.overtime;
      parts.push(`⏰ ${ot.length} 筆加班紀錄，實領金額依薪資入帳`);
    }
    const lifeParts = [];
    if ((groups.lunch||[]).length > 0) lifeParts.push(`吃了 ${groups.lunch.length} 次午餐`);
    if ((groups.coffee||[]).length > 0) lifeParts.push(`喝了 ${groups.coffee.length} 次咖啡`);
    if ((groups.gossip||[]).length > 0) lifeParts.push(`聊了 ${groups.gossip.length} 次八卦`);
    if (lifeParts.length > 0) parts.push(`🍽️ ${lifeParts.join('、')}`);
    if ((groups.collaborate||[]).length > 0) {
      const partners = new Set(groups.collaborate.map(m => {
        const n = m.text.match(/和(.+?)討論/);
        return n ? n[1] : null;
      }));
      parts.push(`🤝 討論 ${groups.collaborate.length} 次` + (partners.size ? `（${[...partners].join('、')}）` : ''));
    }
    if ((groups.mentor||[]).length > 0) parts.push(`📚 指導 ${groups.mentor.length} 次`);
    if ((groups.praise||[]).length > 0) parts.push(`⭐ 獲表揚 ${groups.praise.length} 次`);
    if ((groups.promotion||[]).length > 0) parts.push(`🎉 晉升 ${groups.promotion.length} 次`);
    if ((groups.mistake||[]).length > 0) {
      const lateCount = groups.mistake.filter(m => m.text.includes('遲到')).length;
      const otherMistakes = groups.mistake.length - lateCount;
      const mParts = [];
      if (lateCount > 0) mParts.push(`遲到 ${lateCount} 次`);
      if (otherMistakes > 0) mParts.push(`失誤 ${otherMistakes} 次`);
      parts.push(`⚠️ ${mParts.join('、')}`);
    }
    if ((groups.finance||[]).length > 0) parts.push(`💰 ${groups.finance.length} 筆財務`);
    const classified = new Set(['project','project_fail','overtime','lunch','coffee','collaborate','gossip','mentor','praise','promotion','mistake','finance','leave']);
    const otherCount = Object.entries(groups)
      .filter(([t]) => !classified.has(t))
      .reduce((s, [,arr]) => s + arr.length, 0);
    if (otherCount > 0) parts.push(`📋 其他 ${otherCount} 條`);

    const summaryText = parts.length > 0
      ? `📊 ${parts.join(' · ')}`
      : `📊 共 ${mems.length} 條日常記錄`;

    const summary = document.createElement('div');
    summary.className = 'popup-mem-item popup-mem-summary';
    summary.textContent = summaryText;
    memList.appendChild(summary);

    const recent = mems.slice(-2).reverse();
    if (recent.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'popup-mem-divider';
      divider.textContent = '🕐 最近';
      memList.appendChild(divider);
      for (const m of recent) {
        const el = document.createElement('div');
        el.className = 'popup-mem-item popup-mem-recent';
        el.textContent = `📌 ${m.text}`;
        memList.appendChild(el);
      }
    }
  }
  popup.classList.remove('hidden');
  document.getElementById('charPopupClose').focus();
}

// =============================================
// NOTIFICATION
// =============================================
function notify(text, dur=3000) {
  const old = document.querySelector('.notification');
  if (old) old.remove();
  const n = document.createElement('div'); n.className='notification'; n.textContent=text;
  document.body.appendChild(n);
  setTimeout(()=>{ n.style.opacity='0'; n.style.transition='opacity 0.5s'; setTimeout(()=>n.remove(),500); }, dur);
}
