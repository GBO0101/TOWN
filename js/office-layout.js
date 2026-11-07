/* 平面圖的顯示座標獨立於模擬座標，調整房間不改變排程與抵達時間。 */
const OfficeLayout = (() => {
  const rooms = {
    work: {selector: '.room-a', frame: [25, 25, 50, 50], sourceSize: [49, 50]},
    boss: {selector: '.room-boss', frame: [4, 4, 32, 19], sourceSize: [49, 48]},
    meeting: {selector: '.room-meeting', frame: [38, 4, 58, 19], sourceSize: [49, 48]},
    break: {selector: '.room-break', frame: [4, 25, 19, 50], sourceSize: [18, 38]},
    toilet: {selector: '.room-toilet', frame: [77, 25, 19, 50], sourceSize: [30, 38]},
  };
  const stations = {
    boss_desk: ['boss', 25, 60], meeting: ['meeting', 50, 60],
    coffee: ['break', 24, 30], sofa: ['break', 76, 30],
    toilet1: ['toilet', 24, 32], toilet2: ['toilet', 76, 32],
  };
  const decorations = {
    books: [75, 60], projector: [18, 60], tea: [82, 60],
    fridge: [24, 72], water: [76, 72], wash: [50, 72],
  };
  const mounted = new WeakMap();
  let movements = new WeakMap();
  let meetingHeight = 148;

  function project(point) {
    if (Number.isInteger(point.meetingSeat)) {
      const [x, y, width, height] = rooms.meeting.frame;
      return {x: x + width * [0.1, 0.3, 0.7, 0.9][point.meetingSeat % 4],
        y: y + height * (69 + Math.floor(point.meetingSeat / 4) * 76) / meetingHeight};
    }
    let nearest = 'door';
    let distance = Math.hypot(point.x - POS.door.x, point.y - POS.door.y);
    for (const key of Object.keys(stations)) {
      const candidate = Math.hypot(point.x - POS[key].x, point.y - POS[key].y);
      if (candidate < distance) { nearest = key; distance = candidate; }
    }
    if (nearest === 'door') return {x: point.x, y: point.y};
    const [room, localX, localY] = stations[nearest];
    const {frame: [x, y, width, height], sourceSize: [sourceWidth, sourceHeight]} = rooms[room];
    return {
      x: x + width * localX / 100 + (point.x - POS[nearest].x) * width / sourceWidth,
      y: y + height * localY / 100 + (point.y - POS[nearest].y) * height / sourceHeight,
    };
  }

  function mount(scene) {
    const deskIds = CompanyGrowth.desks();
    const seats = [...sim.characters.filter(ch => ch.isPresent && ch.employment !== 'departed'), sim.client].filter(Boolean)
      .flatMap(person => [person.pos?.meetingSeat, person.targetPos?.meetingSeat]).filter(Number.isInteger);
    const nextMeetingHeight = Math.max(148, Math.ceil((Math.max(-1, ...seats) + 1) / 4) * 76 + 48);
    const layoutKey = `${deskIds.length}:${nextMeetingHeight}`;
    if (mounted.get(scene) === layoutKey) return;
    const firstMount = !mounted.has(scene);
    mounted.set(scene, layoutKey);
    movements = new WeakMap();
    meetingHeight = nextMeetingHeight;
    const workHeight = Math.ceil(deskIds.length / 3) * 112 + 64;
    const workTop = meetingHeight + 42;
    const floorHeight = workHeight + workTop * 2;
    const sideHeight = Math.min(260, workHeight);
    rooms.work.frame = [25, workTop / floorHeight * 100, 50, workHeight / floorHeight * 100];
    rooms.work.sourceSize = [49, Math.max(50, Math.ceil(deskIds.length / 3) * 15)];
    rooms.boss.frame = [4, 16 / floorHeight * 100, 32, 148 / floorHeight * 100];
    rooms.meeting.frame = [38, 16 / floorHeight * 100, 58, meetingHeight / floorHeight * 100];
    rooms.break.frame = [4, (floorHeight - sideHeight) / 2 / floorHeight * 100, 19, sideHeight / floorHeight * 100];
    rooms.toilet.frame = [77, (floorHeight - sideHeight) / 2 / floorHeight * 100, 19, sideHeight / floorHeight * 100];
    document.documentElement.style.setProperty('--scene-min-height', `${floorHeight}px`);
    const workRoom = scene.querySelector('.room-a');
    workRoom.querySelector('.room-label').textContent = `💻 中央工作區 · ${deskIds.length} 席`;
    for (const element of workRoom.querySelectorAll('[data-furniture^="desk"]')) {
      if (!deskIds.includes(element.dataset.furniture)) element.remove();
    }
    for (const key of Object.keys(stations)) if (key.startsWith('desk')) delete stations[key];
    deskIds.forEach((id, index) => {
      stations[id] = ['work', [17, 50, 83][index % 3], (76 + Math.floor(index / 3) * 112) / workHeight * 100];
      if (!workRoom.querySelector(`[data-furniture="${id}"]`)) {
        const desk = document.createElement('button');
        desk.type = 'button';
        desk.className = 'furniture interactive';
        desk.dataset.furniture = id;
        desk.innerHTML = `<img src="assets/icons/desk.svg" class="furn-icon-svg" alt=""><span class="furn-label" id="deskLabel_${id}">空座位</span>`;
        workRoom.append(desk);
      }
    });
    for (const [name, {selector, frame}] of Object.entries(rooms)) {
      const room = scene.querySelector(selector);
      room.dataset.room = name;
      ['x', 'y', 'width', 'height'].forEach((property, index) => room.style.setProperty(`--room-${property}`, `${frame[index]}%`));
    }
    for (const [key, [, x, y]] of Object.entries(stations)) {
      const furniture = scene.querySelector(`[data-furniture="${key === 'boss_desk' ? 'bossdesk' : key}"]`);
      furniture.style.setProperty('--x', `${x}%`);
      furniture.style.setProperty('--y', `${y}%`);
    }
    for (const [key, [x, y]] of Object.entries(decorations)) {
      const furniture = scene.querySelector(`[data-furniture="${key}"]`);
      furniture.style.setProperty('--x', `${x}%`);
      furniture.style.setProperty('--y', `${key === 'projector' || key === 'tea' ? 24 / meetingHeight * 100 : y}%`);
    }
    center(scene);
    if (firstMount && typeof ResizeObserver !== 'undefined') {
      // 容器單位在尺寸通知後重算，下一影格再置中。
      const observer = new ResizeObserver(() => requestAnimationFrame(() => center(scene)));
      observer.observe(scene);
      observer.observe(scene.querySelector('.scene-content'));
    }
  }

  function center(scene) {
    const content = scene.querySelector('.scene-content');
    scene.scrollLeft = Math.max(0, content.offsetLeft + (content.offsetWidth - scene.clientWidth) / 2);
    scene.scrollTop = Math.max(0, content.offsetTop + (content.offsetHeight - scene.clientHeight) / 2);
  }

  function position(person, outside) {
    if (outside || person.state !== 'walking' || !person.targetPos) {
      movements.delete(person);
      return outside ? {x: 50, y: 95} : project(person.pos);
    }
    let movement = movements.get(person);
    if (!movement || movement.target.x !== person.targetPos.x || movement.target.y !== person.targetPos.y) {
      movement = {
        target: {...person.targetPos},
        distance: Math.hypot(person.pos.x - person.targetPos.x, person.pos.y - person.targetPos.y),
        start: movement?.position || project(person.pos),
        finish: project(person.targetPos),
      };
      movements.set(person, movement);
    }
    const remaining = Math.hypot(person.pos.x - movement.target.x, person.pos.y - movement.target.y);
    const progress = movement.distance ? Math.max(0, Math.min(1, 1 - remaining / movement.distance)) : 1;
    movement.position = {
      x: movement.start.x + (movement.finish.x - movement.start.x) * progress,
      y: movement.start.y + (movement.finish.y - movement.start.y) * progress,
    };
    return movement.position;
  }

  return { mount, position, center };
})();
