/* ============================================
   AI OFFICE · Data Constants & Helpers
   Extracted from app.js for separation of concerns.
   ============================================ */

// =============================================
// 1. MOOD SYSTEM
// =============================================
var MOODS = [
  { key:'very_bad', emoji:'😱', label:'極差',   min:-1.00 },
  { key:'stressed', emoji:'😰', label:'壓力大', min:0.00 },
  { key:'irritated',emoji:'😤', label:'煩躁',   min:0.05 },
  { key:'tired',    emoji:'😫', label:'疲憊',   min:0.20 },
  { key:'focused',  emoji:'🤔', label:'專注',   min:0.40 },
  { key:'calm',     emoji:'😐', label:'平靜',   min:0.45 },
  { key:'relaxed',  emoji:'😌', label:'放鬆',   min:0.55 },
  { key:'happy',    emoji:'😊', label:'開心',   min:0.70 },
];

function moodFromValue(v) {
  v = Math.max(0,Math.min(1,v));
  let best = MOODS[0];
  for (const m of MOODS) if (v>=m.min && m.min > best.min) best = m;
  return { ...best, value: v };
}
function clamp(v,l,h) { return Math.max(l,Math.min(h,v)); }
function pick(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

// =============================================
// 2. CHARACTERS
// =============================================
var CHARACTERS = [
  { id:'boss', field:'boss', name:'張志強',emoji:'👔',avatar:'assets/avatars/boss.svg',role:'總經理',   color:'#FF6B6B', deskId:'boss_desk',
    initMood:0.70, money: 540000,
    seniority:'veteran', salary:180000, personalityType:'neutral',
    personality:'嚴肅但關心員工。喜歡巡視時給建議。口頭禪："這個想法不錯，但還可以更好。"',
    traits:{ breakiness:0.20, socialBattery:0.5, workEthic:0.80, wanderlust:0.70, speed:0.90, lunchStyle:'desk',
             curiosity:0.6, patience:0.8, energy:0.7 },
    initMems:['晨會大家的提案很有想法','最近大家常加班，要想辦法提升效率'] },
  { id:'tech', field:'tech', name:'李志明',emoji:'💻',avatar:'assets/avatars/tech.svg',role:'技術總監', color:'#4D96FF', deskId:'desk1',
    initMood:0.65, money: 360000,
    seniority:'veteran', salary:120000, personalityType:'neutral',
    personality:'技術狂人，話不多一針見血。看到爛程式會忍不住動手改。專注寫code不愛管閒事。',
    traits:{ breakiness:0.15, socialBattery:0.2, workEthic:0.95, wanderlust:0.10, speed:1.00, lunchStyle:'desk',
             curiosity:0.4, patience:0.9, energy:0.6 },
    initMems:['重構了訂單系統核心，效能提升3倍','新人的程式碼需要好好教一下'] },
  { id:'designer', field:'design', name:'王怡君',emoji:'🎨',avatar:'assets/avatars/designer.svg',role:'UI/UX設計師',color:'#C084FC',deskId:'desk2',
    initMood:0.60,
    seniority:'newcomer', salary:55000, personalityType:'nice', money: 165000,
    personality:'追求完美的細節控。剛來四個月還很菜，不太敢拒絕別人的請求。好好先生一枚。',
    traits:{ breakiness:0.30, socialBattery:0.6, workEthic:0.75, wanderlust:0.30, speed:0.95, lunchStyle:'sofa',
             curiosity:0.8, patience:0.5, energy:0.55 },
    initMems:['新版本設計稿終於定稿','工程師說設計太難實現，我覺得是他們技術不夠'] },
  { id:'admin', field:'admin', name:'林小梅',emoji:'☕',avatar:'assets/avatars/admin.svg',role:'行政專員', color:'#6BCB77', deskId:'desk3',
    initMood:0.75,
    seniority:'veteran', salary:48000, personalityType:'nice', money: 144000,
    personality:'細心負責的辦公室大管家。團購發起人。東西壞了找她就對了，大家都叫她梅姐。',
    traits:{ breakiness:0.40, socialBattery:0.8, workEthic:0.85, wanderlust:0.60, speed:1.10, lunchStyle:'sofa',
             curiosity:0.7, patience:0.7, energy:0.8 },
    initMems:['新咖啡機到了，希望大家會喜歡','下週員工旅遊要統計人數'] },
  { id:'marketing', field:'mkt', name:'陳偉成',emoji:'📊',avatar:'assets/avatars/marketing.svg',role:'行銷經理', color:'#FFD93D', deskId:'desk4',
    initMood:0.72,
    seniority:'veteran', salary:85000, personalityType:'selfish', money: 255000,
    personality:'外向健談的氣氛擔當，但只做對自己有利的事。有功勞搶第一，有黑鍋推出去。',
    traits:{ breakiness:0.35, socialBattery:0.9, workEthic:0.60, wanderlust:0.50, speed:1.05, lunchStyle:'sofa',
             curiosity:0.9, patience:0.3, energy:0.85 },
    initMems:['新客戶對提案非常滿意','在茶水間聽到隔壁公司在裁員'] },
  { id:'backend', field:'tech', name:'劉大鈞',emoji:'🔧',avatar:'assets/avatars/backend.svg',role:'後端工程師',color:'#FF8C42',deskId:'desk5',
    initMood:0.62,
     seniority:'newcomer', salary:58000, personalityType:'neutral', money: 174000,
     personality:'沉穩內斂的Debug高手。剛到職兩個月還在熟悉系統。不喜歡開會，但樂於幫人。',
     traits:{ breakiness:0.20, socialBattery:0.15, workEthic:0.90, wanderlust:0.10, speed:0.90, lunchStyle:'desk',
              curiosity:0.6, patience:0.95, energy:0.45 },
     initMems:['花三天找到隱藏的記憶體洩漏','每次說重構一下都會越改越多'] },
  { id:'sales', field:'sales', name:'吳小琪',emoji:'🤝',avatar:'assets/avatars/marketing.svg',role:'業務經理',  color:'#FF6F61', deskId:'desk6',
    initMood:0.70,
       seniority:'veteran', salary:30000, commissionRate:0.07, personalityType:'nice', money: 90000,
     personality:'業務界的社交達人，人脈廣、口才好。專搞定難纏客戶，常說：「沒問題，包我身上！」',
     traits:{ breakiness:0.25, socialBattery:0.95, workEthic:0.70, wanderlust:0.60, speed:1.15, lunchStyle:'out',
              curiosity:0.8, patience:0.6, energy:0.85 },
     initMems:['上季業績全公司第一','這個客戶我認識他老闆，有緣分'] },
];

// =============================================
// 3. POSITIONS
// =============================================
var POS = {
  desk1:{x:6.9,  y:58.5}, desk2:{x:22.6, y:58.5}, desk3:{x:38.2, y:58.5},
  desk4:{x:6.9,  y:73.5}, desk5:{x:22.6, y:73.5}, desk6:{x:38.2, y:73.5},
  boss_desk:{x:18.6, y:23.1}, coffee:{x:53.2, y:59.5}, sofa:{x:60.4, y:61.4},
  meeting:{x:69.1, y:17.3}, toilet1:{x:76.5, y:61.4}, toilet2:{x:88.5, y:61.4},
  door:{x:50, y:90}, door_out:{x:50, y:105},
};
var DOOR_POS = {x:50,y:90};

/** Deterministic spawn position near the door, spread to avoid overlap */
function getDoorSpawnPos(charId) {
  return { x: 50 + (charId.length * 3 % 15) - 7, y: 90 + (charId.charCodeAt(0) % 5) - 2 };
}

// =============================================
// 4. BLOCKS (cell-based positioning areas)
// =============================================
var BLOCKS = {
  A1:        { x:6.9,  y:58.5, w:22, h:14 },
  dev_1:     { x:6.9,  y:58.5, w:22, h:14 },
  B2:        { x:22.6, y:58.5, w:22, h:14 },
  design_1:  { x:22.6, y:58.5, w:22, h:14 },
  desk1:     { x:6.9,  y:58.5, w:22, h:14 },
  desk2:     { x:22.6, y:58.5, w:22, h:14 },
  desk3:     { x:38.2, y:58.5, w:22, h:14 },
  desk4:     { x:6.9,  y:73.5, w:22, h:14 },
  desk5:     { x:22.6, y:73.5, w:22, h:14 },
  desk6:     { x:38.2, y:73.5, w:22, h:14 },
  boss_desk: { x:18.6, y:23.1, w:24, h:20 },
  coffee:    { x:53.2, y:59.5, w:5,  h:7 },
  sofa:      { x:60.4, y:61.4, w:5,  h:7 },
  toilet1:   { x:76.5, y:61.4, w:8,  h:10 },
  toilet2:   { x:88.5, y:61.4, w:8,  h:10 },
  meeting:   { x:72.6, y:20.7, w:22, h:18 },
  door:      { x:50,   y:90,   w:12, h:12 },
};

/** Place character deterministically within a block using a 4-position grid */
function cellPos(blockId, charId) {
  const blk = BLOCKS[blockId];
  if (!blk) return { x:0, y:0 };
  let h = 0;
  for (let i = 0; i < charId.length; i++) h = ((h << 5) - h + charId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % 8;
  const isOuter = idx >= 4;
  const innerIdx = isOuter ? idx - 4 : idx;
  const margin = 0.18;
  const usableW = blk.w * (1 - 2 * margin);
  const usableH = blk.h * (1 - 2 * margin);
  let cx, cy;
  if (isOuter) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    cx = corners[innerIdx][0] * usableW * 0.35;
    cy = corners[innerIdx][1] * usableH * 0.35;
  } else {
    const col = innerIdx % 2;
    const row = Math.floor(innerIdx / 2);
    cx = -usableW * 0.25 + col * usableW * 0.5;
    cy = -usableH * 0.25 + row * usableH * 0.5;
  }
  const position = { x: blk.x + cx, y: blk.y + cy, w: blk.w, h: blk.h };
  if (blockId === 'meeting' && typeof sim !== 'undefined') {
    const attendee = sim.characters.find(ch => ch.id === charId);
    const occupied = new Set(sim.characters.filter(ch => ch.id !== charId && ch.isPresent && ch.employment !== 'departed')
      .map(ch => ch.targetPos?.meetingSeat));
    let seat = attendee ? attendee.targetPos?.meetingSeat || 1 : 0;
    while (attendee && occupied.has(seat)) seat++;
    position.meetingSeat = seat; // 0 留給訪客；只新增顯示座位，保留原行走座標。
  }
  return position;
}

// =============================================
// 2B. CANDIDATE POOL
// =============================================
var CANDIDATES = [
  { id:'intern1', field:'tech', skill:0.6, name:'趙小華', emoji:'📋', avatar:'assets/avatars/tech.svg', role:'工程實習生', color:'#45B7D1', deskId:'desk6',
    seniority:'intern', salary:30000, personalityType:'nice',
    personality:'剛畢業的社會新鮮人，充滿熱情但什麼都不太會。總是第一個到辦公室，筆記本寫得密密麻麻。',
    initMems:['第一天上班好緊張','希望前輩們好相處'] },
  { id:'intern2', field:'design', skill:0.65, name:'周雅琪', emoji:'📝', avatar:'assets/avatars/designer.svg', role:'設計實習生',color:'#F472B6', deskId:'desk6',
    seniority:'intern', salary:28000, personalityType:'nice',
    personality:'設計系在學生，對UI/UX有自己想法但缺乏實戰經驗。常常因為修改稿子加班到很晚。',
    initMems:['希望能在這裡學到很多','作品集需要更多實際案例'] },
  { id:'senior_dev', field:'tech', skill:1.5, name:'吳國豪', emoji:'⚙️', avatar:'assets/avatars/backend.svg', role:'資深工程師',color:'#A8E6CF', deskId:'desk6',
    seniority:'veteran', salary:130000, personalityType:'neutral',
    personality:'十年經驗的後端老手，曾在大型電商任職。觀念扎實但有點固執，不喜歡用新框架。',
    initMems:['上一家公司文化太官僚','希望能穩定做到退休'] },
  { id:'new_hr', field:'admin', skill:1, name:'黃淑芬', emoji:'📁', avatar:'assets/avatars/admin.svg', role:'人資專員', color:'#FF9FF3', deskId:'desk6',
    seniority:'newcomer', salary:52000, personalityType:'nice',
    personality:'轉職來做HR的媽媽，親切和藹，記得每個人的生日。最喜歡辦員工活動。',
    initMems:['新公司環境很不錯','要好好記住每個人的名字'] },
  { id:'mkt_specialist', field:'mkt', skill:1, name:'鄭伊婷', emoji:'📊', avatar:'assets/avatars/marketing.svg', role:'行銷專員',color:'#FFEAA7', deskId:'desk6',
    seniority:'newcomer', salary:48000, personalityType:'selfish',
    personality:'數位行銷高手，擅長操作社群媒體。做事效率高但功勞搶第一，喜歡在IG限動抱怨同事。',
    initMems:['這間公司看起來很有潛力','希望能快點升遷'] },
];

// =============================================
// 2C. CLIENT POOL
// =============================================
var CLIENTS = [
  { id:'client1', name:'王董',     emoji:'🤵', avatar:'assets/avatars/client1.svg', color:'#636e72',
    personality:'科技公司董事長，為人和善但要求很高。喜歡問尖銳的問題。' },
  { id:'client2', name:'林總',     emoji:'🧑‍💼', avatar:'assets/avatars/client2.svg', color:'#34495e',
    personality:'大型企業總經理，重視效率與成本。不喜歡冗長的簡報。' },
  { id:'client3', name:'陳副總',   emoji:'👔', avatar:'assets/avatars/client3.svg', color:'#16213e',
    personality:'外商公司副總裁，眼光精準。對細節非常挑剔。' },
];
var SUPPLIERS = [
  { id:'supplier1', name:'李經理', emoji:'📋', avatar:'assets/avatars/supplier.svg', color:'#2e86c1',
    company:'鼎盛資訊', desc:'伺服器租賃與雲端服務供應商' },
  { id:'supplier2', name:'周協理', emoji:'📑', avatar:'assets/avatars/supplier.svg', color:'#1a5276',
    company:'永恆水電',  desc:'辦公大樓水電空調維護' },
  { id:'supplier3', name:'蔡專員', emoji:'📊', avatar:'assets/avatars/supplier.svg', color:'#8B4513',
    company:'好室辦公家具', desc:'辦公家具租賃與採購' },
];

// =============================================
// PROJECTS
// =============================================
var PROJECT_POOL = [
  { id:'app_redesign',  name:'App UI 改版',         type:'design', work:120, reward:800000,  desc:'重新設計使用者介面' },
  { id:'api_optimize',  name:'API 效能優化',        type:'tech',  work:140, reward:650000,  desc:'提升後端回應速度' },
  { id:'marketing_site',name:'官網改版',             type:'design',work:100, reward:500000,  desc:'公司官網重新設計' },
  { id:'data_migration',name:'資料庫遷移',           type:'tech',  work:200, reward:1200000, desc:'將資料庫搬遷到新架構' },
  { id:'campaign_q3',   name:'Q3 行銷活動',         type:'mkt',   work:80,  reward:400000,  desc:'第三季整合行銷' },
  { id:'mobile_app',    name:'手機版 App 開發',     type:'tech',  work:250, reward:1500000, desc:'iOS/Android 雙平台' },
  { id:'brand_guide',   name:'品牌識別系統',         type:'design',work:60,  reward:300000,  desc:'建立完整品牌規範' },
  { id:'seo_optimize',  name:'SEO 關鍵字佈局',       type:'mkt',   work:50,  reward:200000,  desc:'搜尋引擎優化' },
  { id:'hr_system',     name:'人資系統導入',         type:'admin', work:90,  reward:350000,  desc:'人事管理系統上線' },
  { id:'qa_automation', name:'自動化測試',           type:'tech',  work:100, reward:450000,  desc:'建立 CI/CD 測試流程' },
  { id:'security_audit',name:'資安稽核',             type:'tech',  work:130, reward:700000,  desc:'系統安全性弱點掃描與修補' },
  { id:'data_dashboard',name:'數據儀表板',           type:'tech',  work:110, reward:550000,  desc:'內部營運數據可視化平台' },
  { id:'landing_page',  name:'活動登陸頁設計',       type:'design',work:70,  reward:350000,  desc:'促銷活動專屬頁面製作' },
  { id:'customer_survey',name:'客戶滿意度調查',      type:'mkt',   work:60,  reward:250000,  desc:'電訪與線上問卷分析報告' },
  { id:'office_relocation',name:'辦公室搬遷計畫',    type:'admin', work:150, reward:900000,  desc:'新辦公空間規劃與搬遷執行' },
];

var CONTRIB_RATE = {
  tech:     { tech:3, design:0.5, mkt:0.2, admin:0.3 },
  designer: { tech:0.3, design:4, mkt:1.5, admin:0.5 },
  admin:    { tech:0.2, design:0.5, mkt:0.8, admin:3 },
  marketing:{ tech:0.2, design:1, mkt:4, admin:0.5 },
  backend:  { tech:3.5, design:0.3, mkt:0.2, admin:0.3 },
  boss:     { tech:1, design:1, mkt:1, admin:1 },
  sales:    { tech:0.5, design:1, mkt:3, admin:0.5 },
};

// =============================================
// NEWS POOL
// =============================================
var NEWS = [
  '新上市的遊戲爆紅，伺服器被塞爆了',
  '隔壁公司推出永久遠端上班政策',
  '最近物價漲得兇，便當默默漲了15元',
  'AI 繪圖又要取代設計師了，大家議論紛紛',
  '年終獎金計算方式改了，有人歡喜有人憂',
  '颱風要來了，大家在猜會不會放假',
  '公司附近開了一家超好吃的拉麵店',
  '聽說有人在茶水間裝了監視器',
  '比特幣又暴漲，辦公室都在討論',
  '新政府的勞工政策要改了',
  '辦公室團購的蛋捲到了，大家都搶著拿',
  '有人離職了，大家開始分擔他的工作',
  '電費要漲價了，冷氣可能有限制',
  '公司要辦員工旅遊，地點投票中',
  '年終尾牙要辦在哪裡，熱烈討論中',
];

// =============================================
// BIG EVENTS
// =============================================
var BIG_EVENTS = [
  { id:'meeting',  emoji:'📋', name:'全員會議',
    desc:'張老闆召集所有人到會議室',
    timeRange:[9.5,12], minDay:2, cdDays:3,
    apply(ch) {
      if (!ch.isPresent) return;
      contributeToProject(ch.id, ch.task);
      ch.targetPos = ch.id==='boss' ? cellPos('meeting',ch.id) : cellPos('meeting', ch.id);
      ch.state = 'walking';
      ch.currentAction = ch.id==='boss' ? '召集全員開會' : '去會議室開會';
      ch.task = { type:'big_meeting', _duration: 0.5+Math.random()*0.5 };
    },
    text:()=>`📋 張老闆召集全員會議！大家放下手邊工作前往會議室`,
    moodEffect:(ch)=>({ boss:0.05, default:-0.02 }), },
  { id:'fire_drill', emoji:'🚨', name:'火災警報',
    desc:'火災警報響起！所有人疏散',
    timeRange:[10,16], minDay:1, cdDays:4,
    apply(ch) {
      if (!ch.isPresent) return;
      contributeToProject(ch.id, ch.task);
      ch.targetPos = cellPos('door', ch.id);
      ch.state = 'walking';
      ch.currentAction = '疏散中！往門口移動';
      ch.task = { type:'big_firedrill', _duration: 0.3+Math.random()*0.3 };
    },
    text:()=>`🚨 火災警報大作！所有人緊急疏散到室外！`,
    moodEffect:(ch)=>({ default:ch.personalityType==='selfish'?0.05:-0.08 }), },
  { id:'birthday', emoji:'🎂', name:'生日驚喜',
    desc:'幫同事慶生，茶水間有蛋糕',
    timeRange:[11,14], minDay:1, cdDays:2,
    apply(ch) {
      if (!ch.isPresent) return;
      if (ch.state==='walking') return;
      contributeToProject(ch.id, ch.task);
      ch.targetPos = cellPos('coffee', ch.id);
      ch.state = 'walking';
      ch.currentAction = '去茶水間吃蛋糕';
      ch.task = { type:'big_birthday', _duration: 0.5+Math.random()*0.4 };
    },
    text:()=>`🎂 茶水間傳來歡呼聲！大家一起幫${pick(['王怡君','林小梅','李志明'])}慶生！`,
    moodEffect:(ch)=>({ default:0.12 }), },
  { id:'server_down', emoji:'💥', name:'伺服器掛了',
    desc:'伺服器突然掛掉，工程師忙翻',
    timeRange:[9,17], minDay:1, cdDays:2,
    apply(ch) {
      if (!ch.isPresent) return;
      contributeToProject(ch.id, ch.task);
      if (professionKey(ch)==='tech') {
        assignDeskTask(ch, { type:'big_serverdown' }, ch.id==='tech'?'修復伺服器':'協助重啟服務', 0.8+Math.random()*0.6);
      }
      else if (Math.random()<0.5) {
        ch.targetPos = cellPos('sofa', ch.id);
        ch.state = 'walking';
        ch.currentAction = '趁機休息一下';
        ch.task = { type:'big_serverdown', _duration: 0.4+Math.random()*0.4 };
      }
    },
    text:()=>`💥 伺服器掛了！${pick(['工程團隊緊急搶修','全公司陷入混亂','大家趁機摸魚'])}`,
    moodEffect:(ch)=>({ tech:-0.15, backend:-0.1, default:0.05 }), },
  { id:'praise_all', emoji:'🏆', name:'業績達標',
    desc:'公司達成里程碑，老闆發獎金',
    timeRange:[10,16], minDay:3, cdDays:5,
    apply(ch) {
      if (!ch.isPresent) return;
      contributeToProject(ch.id, ch.task);
      ch.currentAction = pick(['開心比讚','拍手歡呼','露出滿意的笑容','繼續努力工作']);
      ch.state = 'sitting';
      ch.task = { type:'big_milestone', endGT: sim.gameTime + 0.3+Math.random()*0.3 };
    },
    text:()=>`🏆 ${pick(['季度業績達標！老闆宣布加發獎金','專案順利上線！全公司歡聲雷動','年度目標超前達成！張老闆很滿意'])}`,
    moodEffect:(ch)=>({ default:0.15 }), },
  { id:'client_visit', emoji:'🤝', name:'客戶來訪',
    desc:'重要客戶來訪，全員戒備',
    timeRange:[10,16], minDay:2, cdDays:3,
    condition: (sim) => sim.characters.some(c => c.id === 'boss' && c.isPresent),
    apply(ch) {
      if (!ch.isPresent) return;
      contributeToProject(ch.id, ch.task);
      if (ch.id==='boss'||ch.id==='marketing') {
        ch.targetPos = cellPos('meeting', ch.id);
        ch.state = 'walking';
        ch.currentAction = ch.id==='boss'?'接待客戶':'準備簡報';
        ch.task = { type:'big_client', _duration: 0.6+Math.random()*0.5 };
      } else {
        ch.currentAction = pick(['正襟危坐','假裝很忙','偷偷看客戶來了沒']);
        ch.state = 'sitting';
        ch.task = { type:'big_client', endGT: sim.gameTime + 0.4+Math.random()*0.3 };
      }
    },
    text:()=>`🤝 ${pick(['重要客戶來訪！張老闆和行銷團隊在會議室接待','客戶對產品非常感興趣，會議超出預期','大客戶來了！辦公室瀰漫緊張氣氛'])}`,
    moodEffect:(ch)=>({ boss:0.08, marketing:0.1, default:-0.03 }), },
  { id:'power_out', emoji:'⚡', name:'停電了',
    desc:'突然跳電，辦公室一片漆黑',
    timeRange:[9,17], minDay:1, cdDays:4,
    apply(ch) {
      if (!ch.isPresent) return;
      contributeToProject(ch.id, ch.task);
      ch.currentAction = pick(['拿著手機照明','摸黑站起來查看','大喊：跳電了！']);
      ch.state = 'standing';
      ch.task = { type:'big_powerout', endGT: sim.gameTime + 0.2+Math.random()*0.2 };
    },
    text:()=>`⚡ 突然停電！辦公室一片漆黑，大家驚慌失措`,
    moodEffect:(ch)=>({ default:-0.06 }), },
];

// =============================================
// CFG
// =============================================
var CFG = {
  speed: 0.08,
  tickHz: 20,
  moveSpeed: 35,
  lunchStart: 11.5,
  lunchEnd: 13,
  lunchEfficiency: 0.75,
};

// 可調模擬參數：一日代表一個營業日，金額單位為元。
var ECONOMY = {
  daysPerMonth: 22, hoursPerDay: 8, startingCash: 1000000,
  monthlyRent: 60000, monthlyUtilities: 6000, monthlyCloud: 12000,
  monthlySoftwarePerEmployee: 1500, monthlySuppliesPerEmployee: 600,
  employerOverheadRate: 0.15,
  depositRate: 0.30, receivableDays: 22, failurePenaltyRate: 0.05,
  annualLoanRate: 0.06, loanMonths: 12, maxDebt: 2000000, minLoan: 50000,
  cashBufferDays: 5, leadChance: 0.60, utilization: 0.65, deadlineBuffer: 1.5,
  targetMargin: 0.20, minimumMargin: 0.10, costContingency: 0.15, maxBacklogDays: 30,
};

var STAFFING = {
  initialSeats: 6, setupPerSeat: 20000, monthlyRentPerSeat: 4000, monthlyUtilitiesPerSeat: 400,
  fitoutDays: 3, recruitmentDays: 3, recruitmentCost: 5000,
  demandDays: 3, targetBacklogDays: 8, operatingReserveMonths: 1, reserveMonths: 3, expansionCooldownDays: 10,
};

var PRODUCT_POLICY = {startDay: 88, reserveMonths: 3, cooldownDays: 44, workShare: 0.25, maxOperating: 3, salesIntervalDays: 2, customerGraceDays: 44,
  maintenance: {intervalDays: [10, 18], responseDays: 2, dailyChurn: 0.05}};
var CAREER_LEVELS = [
  {name: '實習', hours: 80, raise: 0.50},
  {name: '初階', hours: 240, raise: 0.10},
  {name: '中階', hours: 480, raise: 0.12},
  {name: '資深', hours: 800, raise: 0.15},
  {name: '專家', hours: null, raise: 0},
];
var HEALTH_POLICY = {minimumEfficiency: 0.5, overtimeMinimum: 0.7, leaveBelow: 0.4, returnAt: 0.75,
  nightlyRecovery: 0.06, leaveRecovery: 0.25, workFatigue: 0.004, overtimeFatigue: 0.05, lifestyleScale: 0.2};
var CAREER_TITLES = {
  tech: ['工程實習生', '初階工程師', '中階工程師', '資深工程師', '技術專家'],
  design: ['設計實習生', '初階設計師', '中階設計師', '資深設計師', '首席設計師'],
  mkt: ['行銷實習生', '行銷助理', '行銷專員', '資深行銷專員', '行銷主管'],
  admin: ['行政實習生', '行政助理', '行政專員', '資深行政專員', '行政主管'],
  sales: ['業務實習生', '業務助理', '業務專員', '資深業務專員', '業務主管'],
};
var PRODUCT_CATALOG = [
  {id: 'website', name: '訂閱工具網站', type: 'tech', work: 80, initialCost: 3000000, revenuePerCustomer: 160,
    customersPerVisit: [2, 5], maintenanceWork: 8,
    costPerCustomer: {伺服器租用: 12, 機房空間: 4, 網路頻寬: 10, 產品維運: 14},
    dailyCosts: {伺服器租用: 1200, 機房空間: 400, 網路頻寬: 300, 產品維運: 600}},
  {id: 'game', name: '線上休閒遊戲', type: 'tech', work: 240, initialCost: 8000000, minDay: 176, revenuePerCustomer: 18,
    customersPerVisit: [100, 200], maintenanceWork: 24,
    costPerCustomer: {伺服器租用: 2, 機房空間: 0.8, 網路頻寬: 1.2, 產品維運: 1},
    dailyCosts: {伺服器租用: 4000, 機房空間: 1600, 網路頻寬: 1400, 產品維運: 1800}},
];

// =============================================
// TASK LABELS
// =============================================
var STATE_LABEL = { sitting:'坐著', standing:'站著', walking:'走動', resting:'休息', meeting:'開會', gone:'已下班' };
var TASK_LABEL = {
  project_work:'專案工作', meeting:'會議', leave:'請假', idle:'閒置',
  coffee:'休息', toilet:'廁所', stretch:'伸展', collaborate:'協作',
  lunch:'午餐', overtime:'加班', walk_to_desk:'走路', walk_to_door:'離開',
  inspect:'巡視', gossip:'八卦', mentor:'指導', news_discuss:'聊天',
  late:'遲到', scold:'挨罵', arrive:'抵達',
  big_meeting:'會議', big_firedrill:'演習', big_birthday:'慶生',
  big_serverdown:'當機', big_milestone:'里程碑', big_client:'接待', big_powerout:'停電',
  code_review:'Code Review', debug:'除錯', research:'研究', refactor:'重構',
  design:'設計', prototype:'原型', user_research:'用戶研究', design_review:'設計審查',
  paperwork:'文書', meeting_plan:'排程', office_supply:'採購', group_order:'團購',
  campaign:'企劃', client_call:'客戶通話', data_analysis:'分析', social_media:'社群',
  api_dev:'開發API', db_optimize:'資料庫優化', system_monitor:'監控', document:'文件',
  review_report:'審閱', strategy:'策略', meeting_client:'會議', review_team:'團隊檢視',
  client_visit:'拜訪客戶', outside_leisure:'在外晃晃', day1_prospecting:'跑單開拓',
  work:'工作', pursue_deal:'談大案', break:'休息',
};

// =============================================
// ROLE ACTIONS
// =============================================
var ROLE_ACTIONS = {
  tech: [
    { type:'code_review', texts:['review同事的程式碼','進行code review','檢查PR'], duration:[0.2,0.4], contrib:0.3 },
    { type:'debug', texts:['debug一個棘手的bug','追查生產環境問題','修復系統異常'], duration:[0.3,0.6], contrib:0.5, moodOnDone:0.06 },
    { type:'research', texts:['研究新技術框架','讀技術文件','學習新工具'], duration:[0.3,0.5], contrib:0.1, moodOnDone:0.04 },
    { type:'refactor', texts:['重構老舊程式碼','優化程式架構','清理技術債'], duration:[0.4,0.7], contrib:0.4, moodOnDone:0.08 },
  ],
  designer: [
    { type:'design', texts:['畫新功能設計稿','調整UI細節','設計使用者流程'], duration:[0.3,0.6], contrib:0.5 },
    { type:'prototype', texts:['製作互動原型','設計prototype','測試使用者體驗'], duration:[0.3,0.5], contrib:0.3 },
    { type:'user_research', texts:['分析使用者回饋','研究競品設計','收集使用者意見'], duration:[0.2,0.4], contrib:0.2 },
    { type:'design_review', texts:['跟工程師對設計稿','確認實作細節','調整設計規格'], duration:[0.15,0.3], contrib:0.2, social:true },
  ],
  admin: [
    { type:'paperwork', texts:['處理請款單據','整理公文檔案','歸檔合約文件'], duration:[0.2,0.4], contrib:0.4 },
    { type:'meeting_plan', texts:['安排會議行程','協調各部門時間','發會議通知'], duration:[0.15,0.3], contrib:0.2 },
    { type:'office_supply', texts:['盤點辦公用品','訂購文具','整理倉庫'], duration:[0.2,0.4], contrib:0.1, wander:true },
    { type:'group_order', texts:['統計團購訂單','收團購費用','發放團購物品'], duration:[0.15,0.25], contrib:0.1, social:true },
  ],
  marketing: [
    { type:'campaign', texts:['撰寫行銷企劃','規劃廣告投放','設計促銷活動'], duration:[0.3,0.5], contrib:0.5 },
    { type:'client_call', texts:['打電話給客戶','跟客戶會議','回覆客戶訊息'], duration:[0.2,0.4], contrib:0.3 },
    { type:'data_analysis', texts:['分析行銷數據','製作成效報表','評估ROI'], duration:[0.25,0.45], contrib:0.3 },
    { type:'social_media', texts:['經營社群媒體','撰寫宣傳文案','回覆粉絲留言'], duration:[0.2,0.35], contrib:0.2 },
  ],
  backend: [
    { type:'api_dev', texts:['開發新API','寫後端邏輯','設計資料庫結構'], duration:[0.4,0.7], contrib:0.6 },
    { type:'db_optimize', texts:['優化資料庫查詢','調整索引效能','分析慢查詢'], duration:[0.3,0.5], contrib:0.4, moodOnDone:0.05 },
    { type:'system_monitor', texts:['監控系統狀態','檢查伺服器日誌','設定監控告警'], duration:[0.15,0.3], contrib:0.2 },
    { type:'document', texts:['撰寫技術文件','更新API文件','整理程式註解'], duration:[0.2,0.4], contrib:0.2 },
  ],
  boss: [
    { type:'review_report', texts:['審閱財務報表','檢查業績數據','分析營運狀況'], duration:[0.3,0.5], contrib:0.3 },
    { type:'strategy', texts:['思考公司發展方向','規劃季度策略','制定年度目標'], duration:[0.3,0.6], contrib:0.2 },
    { type:'meeting_client', texts:['和重要客戶通話','接待合作夥伴','參加高層會議'], duration:[0.3,0.5], contrib:0.3 },
    { type:'review_team', texts:['查看團隊工作進度','檢查專案分工','整理團隊回饋'], duration:[0.2,0.4], contrib:0.1, social:true, moodOnDone:0.05 },
  ],
  boss_pursue: [
    { type:'pursue_deal', texts:['拜訪大客戶','參加商業餐會','談大型合作案','出席業界交流'], duration:[0.8,1.5], contrib:0, wander:true },
  ],
  sales: [
    { type:'client_visit', texts:['拜訪客戶','跑客戶現場','到客戶公司開會'], duration:[0.5,1.0], contrib:0.4, moodOnDone:0.06, wander:true },
    { type:'proposal', texts:['寫提案書','準備標書','規劃專案方案'], duration:[0.3,0.6], contrib:0.3 },
    { type:'negotiate', texts:['跟客戶談價格','協商合約細節','處理客戶異議'], duration:[0.3,0.5], contrib:0.4, moodOnDone:0.08 },
    { type:'follow_up', texts:['回訪老客戶','維繫客戶關係','發送節日問候'], duration:[0.15,0.3], contrib:0.2, social:true },
  ],
};

// =============================================
// INVESTMENTS
// =============================================
var INVESTMENTS = [
  {name:'員工訓練', cost:12000, productivityBonus:0.03, leadBonus:0},
  {name:'行銷開發', cost:15000, productivityBonus:0, leadBonus:0.05},
  {name:'設備維護', cost:8000, productivityBonus:0.015, leadBonus:0},
];

// =============================================
// AFTER-WORK EVENTS
// =============================================
var AFTER_WORK_EVENTS = [
  { text:'在家追劇追到半夜', mood:-0.06, health:-0.04 },
  { text:'和家人一起吃晚飯', mood:0.10, health:0.03 },
  { text:'去健身房運動', mood:0.08, health:0.12 },
  { text:'滑手機滑到睡著', mood:-0.03, health:-0.05 },
  { text:'和朋友出去聚餐', mood:0.12, health:-0.02 },
  { text:'打電動打到天亮', mood:0.05, health:-0.10 },
  { text:'早早睡覺補眠', mood:0.06, health:0.08 },
  { text:'去夜市吃宵夜', mood:0.09, health:-0.03 },
  { text:'在家加班到深夜', mood:-0.08, health:-0.08 },
  { text:'睡前看了一本好書', mood:0.07, health:0.02 },
  { text:'跟伴侶吵架', mood:-0.15, health:-0.03 },
  { text:'失眠到凌晨三點', mood:-0.10, health:-0.10 },
  { text:'泡了個熱水澡放鬆', mood:0.11, health:0.05 },
  { text:'出門慢跑', mood:0.09, health:0.15 },
  { text:'叫外送炸雞配啤酒', mood:0.06, health:-0.06 },
  { text:'接到朋友的關心電話', mood:0.08, health:0.01 },
  { text:'看了一部悲傷的電影', mood:-0.07, health:0.01 },
  { text:'練習冥想放鬆', mood:0.10, health:0.06 },
  { text:'整理房間打掃', mood:0.04, health:0.04 },
  { text:'逛網路購物亂買東西', mood:0.05, health:-0.01 },
];

// =============================================
// LOAN / OUTSIDE LEISURE
// =============================================

var OUTSIDE_LEISURE = [
  { text:'在咖啡廳喝咖啡滑手機', mood:0.06 },
  { text:'去百貨公司逛街', mood:0.08 },
  { text:'和朋友吃午餐', mood:0.10 },
  { text:'在公園散步', mood:0.07 },
  { text:'去電影院看電影', mood:0.09 },
  { text:'在書店看書', mood:0.05 },
  { text:'去按摩放鬆', mood:0.10 },
  { text:'去健身房運動', mood:0.07, health:0.05 },
  { text:'去路邊攤吃小吃', mood:0.06 },
  { text:'去海邊吹風', mood:0.08 },
  { text:'逛夜市', mood:0.09 },
  { text:'一個人發呆滑手機', mood:-0.02 },
  { text:'迷路找不到路', mood:-0.08 },
  { text:'下大雨全身淋濕', mood:-0.10 },
  { text:'遇到塞車動彈不得', mood:-0.06 },
  { text:'錢包掉在路邊', mood:-0.12 },
  { text:'跟路人吵架', mood:-0.10 },
  { text:'肚子痛找不到廁所', mood:-0.08 },
  { text:'被推銷員纏住', mood:-0.05 },
  { text:'手機沒電又忘記帶充電器', mood:-0.07 },
];

// =============================================
// Global exports for characterization tests
// =============================================
if (typeof window !== 'undefined') {
  window.MOODS = MOODS;
  window.STATE_LABEL = STATE_LABEL;
  window.TASK_LABEL = TASK_LABEL;
  window.moodFromValue = moodFromValue;
  window.clamp = clamp;
  window.pick = pick;
  window.cellPos = cellPos;
}
if (typeof globalThis !== 'undefined') {
  globalThis.MOODS = MOODS;
  globalThis.STATE_LABEL = STATE_LABEL;
  globalThis.TASK_LABEL = TASK_LABEL;
  globalThis.moodFromValue = moodFromValue;
  globalThis.clamp = clamp;
  globalThis.pick = pick;
  globalThis.cellPos = cellPos;
}

