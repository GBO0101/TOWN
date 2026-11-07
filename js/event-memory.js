function officeEvent(type, text, chars = []) {
    const hour = sim.gameTime % 24;
    const time = Math.floor(hour).toString().padStart(2, '0') + ':' + Math.floor((hour % 1) * 60).toString().padStart(2, '0');
    sim.events.unshift({ id: sim.eventId++, day: sim.day, time, type, chars, text });
}

// event-memory.js - Event generation and memory system
// Extracted from app.js Phase 4

/* global sim, pick, addMem, updateMood, updateRel, NEWS */

// =============================================
// 7. EVENT GENERATION
// =============================================

function generateEvent(ch, taskType, extra) {
    const gt = sim.gameTime;
    const hour = Math.floor(gt);
    const min = Math.floor((gt - hour) * 60);
    const timeStr = `${hour.toString().padStart(2,'0')}:${min.toString().padStart(2,'0')}`;
    let text = '';

    switch (taskType) {
        case 'arrive':
            text = `${ch.name}${pick(['💳走進辦公室','☕踩點進門','😤神清氣爽','😎踩著點走進'])}`;
            break;
        case 'work':
            text = `${ch.name}${pick(['認真工作中','敲擊鍵盤中','處理郵件中','專注螢幕中'])}`;
            break;
        case 'coffee':
            text = `${ch.name}在茶水間休息${pick(['，順便伸了個懶腰','，順便跟同事聊了幾句','，沖了杯咖啡'])}`;
            addMem(ch.id, `在茶水間休息`, 'coffee');
            break;
        case 'toilet':
            text = `${ch.name}起身去廁所`;
            break;
        case 'stretch':
            text = `${ch.name}站起來伸展一下${pick(['，看了看窗外','，活動了一下筋骨'])}`;
            break;
        case 'collaborate': {
            const other = extra?.withId ? sim.characters.find(x => x.id === extra.withId) : null;
            text = other ? `${ch.name}走到${other.name}旁邊${pick(['討論問題','請教問題','分享發現','確認細節'])}` : `${ch.name}跟同事討論工作`;
            if (other) updateRel(ch.id, other.id);
            if (other) addMem(ch.id, `跟${other.name}討論工作`, 'collaborate');
            break;
        }
        case 'inspect': {
            const other = extra?.withId ? sim.characters.find(x => x.id === extra.withId) : null;
            text = other ? `張董事長走到${other.name}那邊${pick(['關心進度','給他一些建議','點頭表示滿意'])}` : '張董事長巡視辦公室';
            if (other) {
                updateRel('boss', other.id);
                updateMood(other.id, Math.random() < 0.6 ? 0.12 : -0.08);
            }
            break;
        }
        case 'lunch':
            text = `${ch.name}${pick(['去吃飯了','在座位上吃便當','去餐廳吃飯'])}`;
            addMem(ch.id, `去吃午餐`, 'lunch');
            updateMood(ch.id, 0.08);
            break;
        case 'overtime':
            text = `${ch.name}還在加班${pick(['辦公室只剩大燈','窗外天全黑了','繼續趕進度'])}`;
            addMem(ch.id, `加班工作中`, 'overtime');
            updateMood(ch.id, -0.1);
            break;
        case 'walk_to_desk':
            text = `${ch.name}走到座位，開始準備工作`;
            updateMood(ch.id, 0.03);
            break;
        case 'walk_to_door':
            text = `${ch.name}${pick(['打卡下班','收拾東西離開','走出辦公室大門','跟大家說再見'])}`;
            addMem(ch.id, `下班回家`, 'leave');
            updateMood(ch.id, 0.1);
            break;
        case 'late':
            text = `${ch.name}${pick(['姍姍來遲趕緊打卡','滿懷歉意地遲到了','踩線到公司邊緣辦公室','遲到了，被同事看到'])}`;
            addMem(ch.id, `今天遲到了`, 'mistake');
            updateMood(ch.id, -0.15);
            break;
        case 'scold': {
            const other = extra?.withId ? sim.characters.find(x => x.id === extra.withId) : null;
            text = other ? `張董事長走到${other.name}旁邊${pick(['唸了一頓「怎麼又遲到」','嚴肅說「下次注意點」','嘆了口氣「年輕人真是」'])}` : '張董事長在碎念';
            if (other) {
                updateMood(other.id, -0.2);
                updateRel('boss', other.id);
                addMem(other.id, `被老闆念遲到`, 'mistake');
            }
            break;
        }
        case 'gossip': {
            const other = extra?.withId ? sim.characters.find(x => x.id === extra.withId) : null;
            text = other ? `${ch.name}${pick([`跑去跟${other.name}講悄悄話「你知道嗎」`,`神秘兮兮地跟${other.name}說八卦`])}` : `${ch.name}在聊八卦`;
            if (other) {
                updateMood(other.id, -0.05);
                updateRel(ch.id, other.id);
                addMem(other.id, `聽到一些辦公室八卦`, 'gossip');
            }
            break;
        }
        case 'mentor': {
            const other = extra?.withId ? sim.characters.find(x => x.id === extra.withId) : null;
            text = other ? `${ch.name}走到${other.name}旁邊${pick(['分享了怎麼處理這個case','分享了一些經驗','幫忙review一下程式碼','給他一些建議'])}` : `${ch.name}在帶新人`;
            if (other) {
                updateMood(other.id, 0.12);
                updateMood(ch.id, 0.05);
                updateRel(ch.id, other.id);
                addMem(other.id, `${ch.name}幫了忙`, 'mentor');
            }
            break;
        }
        case 'news_discuss': {
            const other = extra?.withId ? sim.characters.find(x => x.id === extra.withId) : null;
            const topic = extra?.news || pick(NEWS);
            text = other ? `${ch.name}跟${other.name}聊到「${topic}」` : `${ch.name}在聊時事話題`;
            if (other) {
                updateRel(ch.id, other.id);
            }
            break;
        }
        default:
            text = `${ch.name}完成「${extra?.actionText || ch.currentAction}」`;
    }

    if (!text) return;

    sim.events.unshift({
        id: sim.eventId++,
        day: sim.day,
        time: timeStr,
        timeLabel: timeStr,
        type: taskType,
        chars: [{
            id: ch.id,
            name: ch.name,
            emoji: ch.emoji,
            color: ch.color
        }],
        text,
    });
}
