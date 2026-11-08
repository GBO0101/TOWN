/* 場景人物依身分更新，保留節點以維持移動、說話動畫與鍵盤焦點。 */
const SceneView = (() => {
  function createActor(person, visitor) {
    const el = document.createElement(visitor ? 'div' : 'button');
    if (!visitor) {
      el.type = 'button';
      el.dataset.charId = person.id;
    }
    el.innerHTML = `${OfficeArt.portrait(person, 'scene')}
      <span class="actor-labels"><span class="char-name-badge"></span><span class="char-state-badge"></span></span>
      <span class="char-thought"></span>
      <span class="char-progress-bar" hidden><span class="char-progress-fill"></span></span>
      <span class="char-speech-bubble" hidden></span>`;
    return el;
  }

  function updateActor(el, person, visitor, outside, gameTime) {
    const className = `office-char state-${person.state}${visitor ? ' client-char' : ''}${outside ? ' silhouette-sales' : ''}`;
    const speaking = person.speech?.timer > 0;
    el.className = className + (speaking ? ' has-speech' : '');
    const position = OfficeLayout.position(person, outside);
    const x = position.x;
    el.style.left = `${x}%`;
    el.style.top = `${position.y}%`;
    el.style.setProperty('--person-color', person.color);
    el.dataset.edge = x < 12 ? 'left' : x > 88 ? 'right' : 'center';
    el.dataset.meeting = String(!outside && (Number.isInteger(person.targetPos?.meetingSeat) || person.state !== 'walking' && Number.isInteger(person.pos.meetingSeat)));
    if (!visitor) el.dataset.activity = CharacterRules.status(person).key;
    OfficeArt.updatePortrait(el.querySelector('.avatar'), person);
    setViewText(el.querySelector('.char-name-badge'), person.name);
    const action = visitor ? person.currentAction || '拜訪中' : OfficeArt.activity(person);
    setViewText(el.querySelector('.char-state-badge'), action + (person.mood ? ` · ${person.mood.emoji}` : ''));
    el.setAttribute('aria-label', `${person.name} · ${action}`);
    el.title = `${person.name} · ${action}`;
    setViewText(el.querySelector('.char-thought'), visitor ? person.currentAction || '' : action);
    const progress = el.querySelector('.char-progress-bar');
    const task = person.task;
    const timedWork = isProjectWorkTask(task) && person.isPresent && person.state !== 'walking' &&
      Number.isFinite(task.startedGT) && task.endGT > task.startedGT && POS[person.deskId] && distance(person.pos, POS[person.deskId]) < 0.5;
    const maximum = timedWork ? task.endGT - task.startedGT : task?.maxProgress;
    const elapsed = timedWork ? Math.min(gameTime, task.endGT) - task.startedGT : task?.progress || 0;
    const percent = maximum > 0 ? Math.min(100, Math.max(0, elapsed / maximum * 100)) : 0;
    progress.hidden = !(maximum > 0);
    progress.setAttribute('role', 'progressbar');
    progress.setAttribute('aria-label', '目前任務進度');
    progress.setAttribute('aria-valuemin', '0');
    progress.setAttribute('aria-valuemax', '100');
    progress.setAttribute('aria-valuenow', Math.round(percent));
    el.querySelector('.char-progress-fill').style.width = `${percent}%`;
    const speech = el.querySelector('.char-speech-bubble');
    speech.hidden = !speaking;
    setViewText(speech, speaking ? person.speech.text : '');
  }

  function flashMood(el, person, sim) {
    if (sim._lastMoodDelta?.charId === person.id) {
      const now = Date.now();
      if (!person._lastMoodFlash || now - person._lastMoodFlash > 2000) {
        person._moodFlashEnd = now + 600;
        person._moodFlashColor = sim._lastMoodDelta.delta > 0 ? 'var(--accent-ok)' : 'var(--accent)';
        person._lastMoodFlash = now;
      }
      sim._lastMoodDelta = null;
    }
    if (person._moodFlashEnd && Date.now() < person._moodFlashEnd) {
      el.style.setProperty('--flash-color', person._moodFlashColor);
      el.classList.add('mood-flash');
    } else if (person._moodFlashEnd) {
      delete person._moodFlashEnd;
      delete person._moodFlashColor;
    }
  }

  function render(sim, hour) {
    OfficeLayout.mount(document.getElementById('officeScene'));
    const layer = document.getElementById('charactersLayer');
    const stale = new Map([...layer.children].map(el => [el.dataset.actorKey, el]));
    function show(person, visitor = false, outside = false) {
      const key = `${visitor ? 'visitor' : 'employee'}:${person.id}`;
      const el = stale.get(key) || createActor(person, visitor);
      if (!el.parentElement) {
        el.dataset.actorKey = key;
        layer.appendChild(el);
      }
      updateActor(el, person, visitor, outside, sim.gameTime);
      if (!visitor) flashMood(el, person, sim);
      stale.delete(key);
    }
    for (const person of sim.characters) {
      if (person.employment === 'departed') continue;
      const outside = !person.isPresent && (person.task?.isOutside || person.task?.type === 'outside_leisure');
      if (person.isPresent || outside) show(person, false, outside);
    }
    if (sim.client) show(sim.client, true);
    if (sim.supplier) show(sim.supplier, true);
    for (const el of stale.values()) el.remove();

    const isDoorOpen = (hour >= 8 && hour < 8.5) || (hour >= 17.5 && hour < 20);
    setViewText(document.getElementById('doorStatus'), isDoorOpen ? '🚪 大門開啟' : '🚪 大門關閉');
    document.getElementById('doorArrow').classList.toggle('active', isDoorOpen);
    const workers = sim.characters.filter(ch => ch.employment !== 'departed');
    const working = workers.filter(ch => ['working', 'internal'].includes(CharacterRules.status(ch).key)).length;
    const outside = workers.filter(ch => CharacterRules.status(ch).key === 'outside').length;
    setViewText(document.getElementById('officeStatus'), isLunchTime(hour) ? `🟡 午餐時段 · ${working} 人工作 · 效率 ${Math.round(CFG.lunchEfficiency * 100)}%`
      : hour >= 17.5 ? (working ? `🟠 ${working} 人加班中` : '⚫ 下班時段')
      : hour >= 8 ? `🟢 ${working} 人工作 · ${outside} 人外勤` : '⚫ 上班前準備');

    for (const desk of [...CompanyGrowth.desks(), 'boss_desk']) {
      const el = document.getElementById(`deskLabel_${desk}`);
      const person = sim.characters.find(ch => ch.deskId === desk && ch.employment !== 'departed');
      const status = person && CharacterRules.status(person);
      setViewText(el, person ? `${person.emoji} ${person.name}${person.isPresent ? '' : ['outside', 'lunch'].includes(status.key) ? ' ↗' : ' 💤'}` : '🪑 空座位');
      el.title = person ? `${person.name} · ${OfficeArt.activity(person)}` : '空座位';
      el.style.color = person?.isPresent ? person.color : 'var(--text-dim)';
    }

    const event = sim._activeBigEvent;
    document.getElementById('eventBanner').classList.toggle('hidden', !event);
    if (event) {
      document.getElementById('eventBannerIcon').textContent = event.emoji || '📋';
      document.getElementById('eventBannerName').textContent = event.name || '';
      const minutes = Math.ceil(Math.max(0, event.endGT - sim.gameTime) * 60);
      document.getElementById('eventBannerTime').textContent = minutes > 0 ? `剩 ${minutes} 分鐘` : '即將結束';
    }
  }

  return { render };
})();
