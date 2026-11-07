/* 共用人物圖形與顯示文字；場景、卡片、日誌、詳情皆使用同一份角色資料。 */
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function taskLabel(task) {
  if (!task?.type) return '';
  return TASK_LABEL[task.type] || (task.type.startsWith('big_') ? '大事件' : '');
}

const OfficeArt = (() => {
  const portraits = new Map([...CHARACTERS, ...CANDIDATES, ...CLIENTS, ...SUPPLIERS]
    .map(person => [person.id, person.avatar]));

  function avatarSource(person) {
    return person.avatar || portraits.get(person.id) || 'assets/avatars/unknown.svg';
  }

  function portrait(person, size) {
    return `<img class="avatar avatar--${size}" src="${escapeHtml(avatarSource(person))}" alt="${escapeHtml(person.name)}" draggable="false">`;
  }

  function updatePortrait(image, person) {
    const source = avatarSource(person);
    if (image.getAttribute('src') !== source) image.setAttribute('src', source);
    if (image.alt !== person.name) image.alt = person.name;
  }

  function activity(person) {
    const status = CharacterRules.status(person);
    if (['off_duty', 'departed', 'health_leave', 'arriving', 'returning'].includes(status.key) || person.state === 'walking' && isProjectWorkTask(person.task)) return status.label;
    const action = person.task?.actionText || (status.key === 'outside' ? taskLabel(person.task) : '');
    return action && action !== status.label ? `${status.label} · ${action}` : status.label;
  }

  return { portrait, updatePortrait, activity };
})();
