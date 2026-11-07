// Shared geometry, profession and room helpers.

function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function isLunchTime(hour) {
    return hour >= CFG.lunchStart && hour < CFG.lunchEnd;
}

function professionKey(ch) {
    return {tech: 'tech', design: 'designer', mkt: 'marketing', admin: 'admin', sales: 'sales', boss: 'boss'}[ch.field] || ch.id;
}

// Prevent character stacking: spread characters around shared positions
function offsetSpread(basePos, charId, spread) {
    let h = 0;
    for (let i = 0; i < charId.length; i++) h = ((h << 5) - h + charId.charCodeAt(i)) | 0;
    const angle = (Math.abs(h) % 360) * (Math.PI / 180);
    const d = spread + (Math.abs(h) % 7) * 0.3;
    return {
        x: basePos.x + Math.cos(angle) * d,
        y: basePos.y + Math.sin(angle) * d
    };
}

function sameField(mentorRole, menteeRole) {
    // General intern (just "實�??? with no prefix) ??anyone can mentor
    if (menteeRole === '實習生') return true;
    // Define keyword groups for each field
    const fields = [
        ['研發', '工程', '技術'],
        ['設計'],
        ['行政', '人資'],
        ['行銷'],
        ['業務'],
    ];
    for (const f of fields) {
        const mentorMatch = f.some(k => mentorRole.includes(k));
        const menteeMatch = f.some(k => menteeRole.includes(k));
        if (mentorMatch && menteeMatch) return true;
    }
    return false;
}

// =============================================
// ROOM HELPER FUNCTIONS
// =============================================
function getRoomAtPos(x, y) {
    // 此處判斷模擬房間；畫面位置由 OfficeLayout 轉換。
    const workEnd = Math.max(100, POS[`desk${sim.company.seats}`].y + 7);
    if (x >= 0.5 && x < 49.5 && y >= 50 && y <= workEnd) return 'work';
    if (x >= 50.5 && x < 99.5 && y >= 0.5 && y < 48.5) return 'meeting';
    if (x >= 0.5 && x < 49.5 && y >= 0.5 && y < 48.5) return 'boss';
    if (x >= 50.5 && x < 68.5 && y >= 50 && y <= 100) return 'break';
    if (x >= 69 && x <= 100 && y >= 50 && y <= 100) return 'toilet';
    return 'unknown';
}

function getAllowedActivitiesForRoom(room) {
    const restrictions = {
        work: ['work', 'collaborate', 'meeting', 'role_action', 'coffee', 'lunch', 'stretch', 'gossip', 'news_discuss', 'mentor', 'inspect'],
        break: ['coffee', 'lunch', 'stretch', 'gossip', 'news_discuss'],
        boss: ['work', 'inspect', 'meeting', 'role_action', 'coffee'],
        meeting: ['meeting', 'collaborate', 'inspect', 'big_client'],
        toilet: ['toilet'],
        unknown: []
    };
    return restrictions[room] || [];
}
