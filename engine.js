/* 青葉高校 陸上部 — deterministic school-club simulation, April–March. */
(function (root) {
  'use strict';
  const VERSION = 2;
  const START_YEAR = 2026;
  const MAX_COUNT = Number.MAX_SAFE_INTEGER;
  const MAX_YEAR = MAX_COUNT - START_YEAR - 2;
  const LEGACY_STAT_KEYS = ['speed', 'stamina', 'power', 'technique', 'agility', 'flexibility', 'mental'];
  const STAT_KEYS = ['acceleration', 'speed', 'speedEndurance', 'stamina', 'power', 'agility', 'flexibility', 'technique', 'mental'];
  const STAT_NAMES = { acceleration: '加速力', speed: '最高速度', speedEndurance: 'スピード持久力', stamina: '有酸素持久力', power: '瞬発力', agility: '動作制御', flexibility: '可動性', technique: '種目技術', mental: '集中力' };
  // Legacy attributes remain readable without changing a loaded save. New
  // dimensions are derived from related capacities, never initialized to zero.
  function getStat(athlete, key) {
    const s = athlete?.stats || {};
    if (Number.isFinite(s[key])) return s[key];
    if (key === 'acceleration') return round((Number(s.speed) || 0) * .5 + (Number(s.power) || 0) * .3 + (Number(s.agility) || 0) * .2);
    if (key === 'speedEndurance') return round((Number(s.speed) || 0) * .55 + (Number(s.stamina) || 0) * .45);
    return 0;
  }
  function getAbilityRank(value) { return value >= 90 ? 'S' : value >= 80 ? 'A' : value >= 70 ? 'B' : value >= 60 ? 'C' : value >= 50 ? 'D' : value >= 40 ? 'E' : value >= 20 ? 'F' : 'G'; }
  function migrateAbilities(state) {
    for (const a of [...state.athletes, ...state.candidates, ...state.scouted, ...(state.career?.alumni || [])]) {
      if (a.stats.acceleration === undefined || a.stats.speedEndurance === undefined) a.stats = Object.fromEntries(STAT_KEYS.map(key => [key, getStat(a, key)]));
    }
  }
  const EVENTS = [
    { id: '100m', name: '100m', unit: '秒', lowerBetter: true, description: '加速と最高速度。スピード・パワーが武器。', weights: { speed: .50, power: .25, agility: .15, technique: .05, mental: .05 } },
    { id: '400m', name: '400m', unit: '秒', lowerBetter: true, description: '速さを維持する持久力と、最後まで粘る精神力。', weights: { speed: .35, stamina: .35, power: .10, technique: .05, mental: .15 } },
    { id: '1500m', name: '1500m', unit: '秒', lowerBetter: true, description: '持久力を軸に、ラストスパートを磨く。', weights: { stamina: .60, speed: .15, technique: .05, mental: .20 } },
    { id: '110mh', name: '110mハードル', gender: 'boys', unit: '秒', lowerBetter: true, description: '男子種目。スピード・技術・敏捷性でリズムを刻む。', weights: { speed: .30, technique: .30, agility: .20, flexibility: .15, mental: .05 } },
    { id: '100mh', name: '100mハードル', gender: 'girls', unit: '秒', lowerBetter: true, description: '女子種目。スピード・技術・敏捷性でリズムを刻む。', weights: { speed: .30, technique: .30, agility: .20, flexibility: .15, mental: .05 } },
    { id: 'longjump', name: '走幅跳', unit: 'm', lowerBetter: false, description: '助走の速さと踏み切りのパワー・技術をつなぐ。', weights: { speed: .25, power: .30, technique: .25, agility: .10, flexibility: .10 } },
    { id: 'highjump', name: '走高跳', unit: 'm', lowerBetter: false, description: 'パワー・技術・柔軟性でバーを越える。', weights: { power: .30, technique: .30, flexibility: .25, agility: .10, mental: .05 } },
    { id: 'polevault', name: '棒高跳', unit: 'm', lowerBetter: false, description: '技術を軸に、助走・筋力・柔軟性をまとめる。', weights: { technique: .40, power: .25, speed: .15, flexibility: .15, mental: .05 } },
    { id: 'triplejump', name: '三段跳', unit: 'm', lowerBetter: false, description: '三歩をつなぐパワー・技術・敏捷性。', weights: { power: .30, technique: .30, agility: .20, speed: .15, flexibility: .05 } },
    { id: 'relay', name: '4×100mリレー', unit: '秒', lowerBetter: true, teamSize: 4, description: '男女別の4人編成。個人種目と兼任でき、走順にも適性がある。', weights: { speed: .45, technique: .20, power: .20, agility: .10, mental: .05 } },
    { id: '60m', name: '60m', indoor: true, unit: '秒', lowerBetter: true, description: '室内短距離。スタートと加速を競う。', weights: { speed: .45, power: .30, agility: .20, mental: .05 } },
    { id: '60mh', name: '60mハードル', indoor: true, unit: '秒', lowerBetter: true, description: '室内の5台ハードル。屋外ハードルの公認記録で参加資格を判定。', weights: { speed: .25, technique: .30, agility: .25, flexibility: .15, mental: .05 } }
  ];
  const INDIVIDUAL_EVENTS = EVENTS.filter(event => !event.teamSize && !event.indoor);
  // Separate acceleration and speed endurance while retaining the established
  // 0–100 performance curves and the same total weight in every event.
  const EVENT_WEIGHTS = {
    '100m': { acceleration: .20, speed: .35, speedEndurance: .05, power: .20, agility: .10, technique: .05, mental: .05 },
    '400m': { acceleration: .05, speed: .25, speedEndurance: .35, stamina: .15, power: .05, technique: .05, mental: .10 },
    '1500m': { speed: .10, speedEndurance: .15, stamina: .55, technique: .05, mental: .15 },
    '110mh': { acceleration: .10, speed: .20, technique: .30, agility: .20, flexibility: .15, mental: .05 },
    '100mh': { acceleration: .10, speed: .20, technique: .30, agility: .20, flexibility: .15, mental: .05 },
    longjump: { acceleration: .10, speed: .15, power: .30, technique: .25, agility: .10, flexibility: .10 },
    highjump: { power: .30, technique: .30, flexibility: .25, agility: .10, mental: .05 },
    polevault: { technique: .40, power: .25, acceleration: .05, speed: .10, flexibility: .15, mental: .05 },
    triplejump: { power: .30, technique: .30, agility: .20, speed: .10, acceleration: .05, flexibility: .05 },
    relay: { acceleration: .15, speed: .30, technique: .20, power: .20, agility: .10, mental: .05 },
    '60m': { acceleration: .30, speed: .25, power: .20, agility: .20, mental: .05 },
    '60mh': { acceleration: .20, speed: .10, technique: .30, agility: .20, flexibility: .15, mental: .05 }
  };
  const LEGACY_EVENT_WEIGHTS = Object.fromEntries(EVENTS.map(e => [e.id, { ...e.weights }]));
  for (const event of EVENTS) event.weights = EVENT_WEIGHTS[event.id];
  for (const event of EVENTS) event.description = ({
    '100m': '加速力と最高速度を軸に、瞬発力で地面を押す。',
    '400m': '最高速度とスピード持久力をつなぎ、最後まで走り切る。',
    '1500m': '有酸素持久力を軸に、スピード持久力でラストスパート。',
    '110mh': '男子種目。加速力・種目技術・動作制御でリズムを刻む。',
    '100mh': '女子種目。加速力・種目技術・動作制御でリズムを刻む。',
    longjump: '助走の最高速度と踏み切りの瞬発力・種目技術をつなぐ。',
    highjump: '瞬発力・種目技術・可動性でバーを越える。',
    polevault: '種目技術を軸に、助走・瞬発力・可動性をまとめる。',
    triplejump: '三歩をつなぐ瞬発力・種目技術・動作制御。',
    relay: '男女別の4人編成。加速力・最高速度・種目技術を走順に生かす。',
    '60m': '室内短距離。加速力と瞬発力でスタートを決める。',
    '60mh': '室内の5台ハードル。加速力と種目技術で攻略する。'
  })[event.id];
  const RELAY_LEGS = [
    { acceleration: .20, speed: .20, power: .15, technique: .25, agility: .15, mental: .05 },
    { acceleration: .10, speed: .50, speedEndurance: .10, power: .15, technique: .05, agility: .05, mental: .05 },
    { acceleration: .10, speed: .25, power: .15, technique: .25, agility: .20, mental: .05 },
    { acceleration: .10, speed: .35, speedEndurance: .10, power: .10, technique: .10, agility: .05, mental: .20 }
  ];
  const FOCUSES = STAT_KEYS.map(id => ({ id, name: STAT_NAMES[id], description: STAT_NAMES[id] + 'を重点的に伸ばす。' })).concat({ id: 'balanced', name: 'バランス', description: '9つの能力を少しずつ伸ばす。' });
  const TRAININGS = [
    { id: 'sprint', name: '短距離', description: '加速力・最高速度・瞬発力。', stats: { acceleration: .35, speed: .40, power: .15, speedEndurance: .10 }, fatigue: 12 },
    { id: 'endurance', name: '持久走', description: '有酸素持久力・スピード持久力。', stats: { stamina: .65, speedEndurance: .25, mental: .10 }, fatigue: 13 },
    { id: 'power', name: '筋力', description: '瞬発力・加速力・動作制御。', stats: { power: .65, acceleration: .20, agility: .15 }, fatigue: 12 },
    { id: 'technique', name: '技術', description: '種目技術・動作制御・集中力。', stats: { technique: .60, agility: .25, mental: .15 }, fatigue: 10 },
    { id: 'hurdles', name: 'ハードル', description: '種目技術・動作制御・可動性。', stats: { technique: .35, agility: .30, flexibility: .25, speed: .10 }, fatigue: 12 },
    { id: 'jump', name: '跳躍', description: '瞬発力・種目技術・可動性。', stats: { power: .35, technique: .35, flexibility: .30 }, fatigue: 11 },
    { id: 'relay', name: 'リレー', description: '加速力・最高速度・種目技術。', stats: { acceleration: .15, speed: .25, technique: .40, mental: .20 }, fatigue: 10 },
    { id: 'balanced', name: '総合', description: '全能力を均等に育てる。', stats: Object.fromEntries(STAT_KEYS.map(key => [key, .15])), fatigue: 11 },
    { id: 'rest', name: '休養', description: '今週は重点育成を休み、コンディションと意欲を回復。', stats: { mental: .10 }, fatigue: -34 }
  ];
  const PRACTICE_CARDS = [
    { id: 'basic', name: '基礎を積み重ねる', description: '成長と疲労が標準。地道な反復練習。', growth: 1, fatigue: 1, cost: 0, stats: {} },
    { id: 'technical', name: 'フォーム研究', description: '技術 +0.35、敏捷性 +0.15。疲労は控えめ。', growth: .95, fatigue: .85, cost: 0, stats: { technique: .35, agility: .15 } },
    { id: 'condition', name: '積極的休養', description: '成長は60%。全員の体力を12回復。', growth: .60, fatigue: .30, recovery: 12, cost: 0, stats: { flexibility: .30 } },
    { id: 'teamwork', name: 'バトンをつなぐ', description: '技術・精神力 +0.25、部の士気 +4。', growth: .95, fatigue: .85, spirit: 4, cost: 0, stats: { technique: .25, mental: .25 } },
    { id: 'camp', name: '集中強化練習', description: '成長130%、疲労125%。部費8,000円。', growth: 1.30, fatigue: 1.25, cost: 8000, stats: { power: .20 } },
    { id: 'mobility', name: '動きづくり', description: '敏捷性・柔軟性 +0.35。疲労80%。', growth: .95, fatigue: .80, cost: 0, stats: { agility: .35, flexibility: .35 } }
  ];
  // Previous v2 cards are accepted verbatim on import, but fresh cards no
  // longer advertise costs or outdated attributes. They remain a compatibility
  // entry point for tools that still use choosePracticeCard.
  const LEGACY_PRACTICE_CARDS = PRACTICE_CARDS.map(c => ({ ...c, stats: { ...c.stats } }));
  const practiceDescriptions = { basic: '最高速度・種目技術を育て、週末に回復する。', technical: '動作制御を整えてから、種目技術を重点的に磨く。', condition: '練習量を減らし、コンディションの回復を優先。', teamwork: '種目技術からスピード練習へつなぎ、週末に回復。', camp: '3ブロックとも強化練習。成長と引き換えに疲労が大きい。', mobility: '動作制御・可動性から種目技術へ。週末は回復する。' };
  for (const card of PRACTICE_CARDS) { card.cost = 0; card.description = practiceDescriptions[card.id]; }
  const FACILITIES = [
    { id: 'track', name: 'トラック', description: '短距離・持久走・ハードル・リレーの練習効果が12%ずつ上昇。', baseCost: 65000 },
    { id: 'gym', name: 'トレーニング室', description: '筋力・技術・跳躍の練習効果が12%ずつ上昇。', baseCost: 55000 },
    { id: 'recovery', name: 'ケア設備', description: '毎週の疲労を軽減し、休養の回復量を増やす。', baseCost: 45000 },
    { id: 'club', name: '部室', description: '練習意欲と全員の成長を後押し。', baseCost: 75000 }
  ];
  const WEEK_BLOCKS = [
    { id: 'load', name: '強化練習', description: '大きな成長を狙う。負荷が高く、後半の回復と組み合わせたい。', kind: 'power', growth: 1.20, fatigue: 1.35, stats: { power: .18, acceleration: .12 } },
    { id: 'speed', name: 'スピード練習', description: '加速から最高速度へ。速さを保つ力も磨く。', kind: 'sprint', growth: 1.05, fatigue: 1.15, stats: { acceleration: .25, speed: .20, speedEndurance: .15 } },
    { id: 'aerobic', name: '持久力づくり', description: '一定のペースで走り込み、有酸素持久力を育てる。', kind: 'endurance', growth: 1, fatigue: 1.05, stats: { stamina: .35, speedEndurance: .15 } },
    { id: 'skill', name: '種目別の技術', description: '一人ずつフォームを確認。強化の後に置くと技術定着。', kind: 'technique', growth: .95, fatigue: .85, stats: { technique: .30, agility: .15 } },
    { id: 'mobility', name: '動きづくり', description: '動作制御と可動性。軽い負荷で体の使い方を磨く。', kind: 'mobility', growth: .85, fatigue: .65, stats: { agility: .25, flexibility: .30 } },
    { id: 'recovery', name: '回復と振り返り', description: '負荷を下げて回復。最後に置くと翌週への余力が増す。', kind: 'rest', growth: .55, fatigue: .25, recovery: 12, stats: { flexibility: .20, mental: .10 } }
  ];
  const BLOCK_DAYS = [2, 3, 2];
  const DEFAULT_WEEK_ROUTE = ['speed', 'skill', 'recovery'];
  function validWeekRoute(route) { return Array.isArray(route) && route.length === 3 && route.every(id => WEEK_BLOCKS.some(b => b.id === id)); }
  function weekEffects(route) {
    const effect = { name: '週間プログラム', growth: 0, fatigue: 0, recovery: 0, stats: {}, notes: [] };
    route.forEach((id, i) => { const b = WEEK_BLOCKS.find(b => b.id === id), weight = BLOCK_DAYS[i] / 7; effect.growth += b.growth * weight; effect.fatigue += b.fatigue * weight; effect.recovery += (b.recovery || 0) * weight; for (const [key, gain] of Object.entries(b.stats)) effect.stats[key] = (effect.stats[key] || 0) + gain * weight; });
    if (route.some((id, i) => i && id === 'skill' && ['load', 'speed'].includes(route[i - 1]))) { effect.stats.technique = (effect.stats.technique || 0) + .18; effect.notes.push('強化→技術：種目技術の定着 +0.18'); }
    if (route[2] === 'recovery') { effect.recovery += 4; effect.notes.push('週末の回復：翌週のコンディション +4'); }
    if (route[0] === 'mobility' && ['load','speed'].includes(route[1])) { effect.fatigue *= .90; effect.notes.push('動きづくり→強化：週間疲労を10%軽減'); }
    if (route.every(id => ['load','speed','aerobic'].includes(id))) { effect.fatigue *= 1.15; effect.notes.push('高負荷の連続：週間疲労が15%増加'); }
    return effect;
  }
  function getWeekJourney(state) {
    const route = validWeekRoute(state.weekRoute) ? [...state.weekRoute] : [...DEFAULT_WEEK_ROUTE], effect = weekEffects(route), healthy = state.athletes.filter(a => !a.injury), pool = healthy.length ? healthy : state.athletes;
    const index = ((state.year - 1) * 48 + state.week - 1) % pool.length, target = [...pool].sort((a,b) => a.energy-b.energy)[index];
    const next = getNextMeet(state), nearMeet = next.weeksUntil <= 2, tired = target.energy < 55;
    const eventId = tired ? 'fatigue' : nearMeet ? 'competition' : ['breakthrough','rhythm','teamwork'][(state.week + state.year) % 3];
    const content = { fatigue: ['少し、脚が重いです', '疲れが見え始めた' + target.name + '。残りの練習をどう進めよう。'], competition: ['大会まで、あと少し', target.name + 'が動きを確認している。大会を前に、何を大切にする？'], breakthrough: ['つかめそうな感覚', target.name + 'が今日の練習で手応えを感じている。ここからの指導は？'], rhythm: ['自分のリズムを探して', target.name + 'がフォームを確かめている。チームにかける言葉を選ぼう。'], teamwork: ['仲間同士、声をかけ合って', target.name + 'が仲間と声をかけ合っている。後半の練習をどうまとめる？'] }[eventId];
    let day = 0; const labels = ['月','火','水','木','金','土','日'], days = route.flatMap((id, i) => Array.from({length: BLOCK_DAYS[i]}, () => ({day: ++day, label: labels[day-1], blockId: id})));
    return { route, days, event: { id: eventId, title: content[0], text: content[1], athleteId: target.id, choices: [
      { id: 'balanced', label: '丁寧に積み重ねる', description: '予定どおりの負荷。個別指導は重点能力 最大+0.35（高能力ほど減衰・休養中なし）。' },
      { id: 'push', label: 'もう一段、挑戦しよう', description: '全体の成長係数×1.12、練習負荷×1.20。個別指導は最大+0.60（高能力ほど減衰・休養中なし）。' },
      { id: 'care', label: '質を保って、量を減らそう', description: '成長係数×0.88、練習負荷×0.70、回復+5。個別指導は最大+0.25（高能力ほど減衰・休養中なし）。' }
    ] }, forecast: { growth: round(effect.growth, 2), fatigue: round(effect.fatigue, 2), recovery: round(effect.recovery, 1), note: effect.notes.join(' / ') || '練習の配分で、成長と翌週の余力が変わります。' } };
  }
  function setWeekRoute(state, route) {
    if (!validState(state) || !validWeekRoute(route)) return fail('週間プログラムは3つの練習で組み立ててください。');
    if (state.pendingMeet) return fail('大会を終えてから、次の練習を組み立てましょう。');
    state.weekRoute = [...route]; return { ok: true, message: '7日間の週間プログラムを更新しました。' };
  }
  const CAREER_GOALS = [
    { id: 'personalBests', name: '一人ひとりの自己ベスト', description: '公認の個人種目で自己ベストを20回。初記録も数えます。', target: 20, reward: 50000 },
    { id: 'allRound', name: '種目の垣根を越えて', description: '男女・種目別の6区分で公認大会3位以内。', target: 6, reward: 60000 },
    { id: 'relay', name: '男女でつなぐバトン', description: '男子・女子の両リレーで公認大会3位以内。', target: 2, reward: 60000 },
    { id: 'interhigh', name: '全国のスタートライン', description: 'インターハイ本大会に正式出場する。', target: 1, reward: 80000 },
    { id: 'champion', name: '全国の頂点へ', description: 'インターハイ本大会で金メダルを獲得する。', target: 1, reward: 100000 },
    { id: 'indoor', name: '冬にも輝くチーム', description: 'U18・U20室内日本選手権で3位以内。', target: 1, reward: 80000 }
  ];
  const CAREER_MODES = [
    { id: 'normal', name: '通常', rivalBonus: 0, nationalBonus: 0, description: 'いつもの相手と競い、部の歴史を積み重ねます。' },
    { id: 'challenge', name: '強豪校チャレンジ', rivalBonus: 4, nationalBonus: 8, description: '相手の能力が地区・県・地方で+4、全国大会で+8。育成効果は通常と同じ。自チームの能力への直接補正はありません。' }
  ];
  const MEETS = [
    { id: 'district', name: 'インターハイ 地区予選', week: 5, dateLabel: '5月1週', kind: 'school', level: 1, rating: 75, prize: 14000, next: 'prefecture', description: '個人トラック16位、跳躍・リレー8位以内で県大会へ。通常モードの100m通過目安は男子11.40秒・女子13.20秒。' },
    { id: 'prefecture', name: 'インターハイ 県大会', week: 7, dateLabel: '5月3週', kind: 'school', level: 2, rating: 85, prize: 22000, next: 'regional', description: '地区予選を通過した選手が競う。6位以内で地方大会へ。' },
    { id: 'regional', name: 'インターハイ 地方大会', week: 11, dateLabel: '6月3週・中旬', kind: 'school', level: 3, rating: 92, prize: 35000, next: 'nationals', description: '県大会を通過した選手が競う。6位以内でインターハイへ。' },
    { id: 'nationals', name: 'インターハイ', week: 16, dateLabel: '7月4週・月末', kind: 'school', level: 4, rating: 97, prize: 60000, description: '高校陸上の頂点。ここでの優勝が部の大きな目標。' },
    { id: 'rookieDistrict', name: '新人戦 地区予選', week: 21, dateLabel: '9月1週・上旬', kind: 'school', rookie: true, level: 1, rating: 75, prize: 14000, next: 'rookiePrefecture', description: '1・2年生の大会。個人トラック16位、跳躍・リレー8位以内で県大会へ。' },
    { id: 'rookiePrefecture', name: '新人戦 県大会', week: 23, dateLabel: '9月3週', kind: 'school', rookie: true, level: 2, rating: 85, prize: 22000, next: 'rookieRegional', description: '1・2年生の県大会。6位以内で地方大会へ。' },
    { id: 'rookieRegional', name: '新人戦 地方大会', week: 25, dateLabel: '10月1週', kind: 'school', rookie: true, level: 3, rating: 92, prize: 35000, description: '来年のインターハイにつながる秋の大舞台。' },
    { id: 'u18nationals', name: 'U18日本選手権', week: 27, dateLabel: '10月3週', kind: 'championship', category: 'U18', minAge: 16, maxAge: 17, level: 4, rating: 97, prize: 50000, description: '暦年で16・17歳。ゲーム独自の参加標準記録が必要。男女ハードルはU18規格。' },
    { id: 'u20nationals', name: 'U20日本選手権', week: 27, dateLabel: '10月3週', kind: 'championship', category: 'U20', minAge: 16, maxAge: 19, level: 4, rating: 98, prize: 60000, description: '暦年で16〜19歳。ゲーム独自の参加標準記録が必要。同週のU18との重複出場不可。' },
    { id: 'indoorU18', name: 'U18室内日本選手権', week: 41, dateLabel: '2月1週', kind: 'indoor', category: 'U18', minAge: 16, maxAge: 17, level: 4, rating: 97, prize: 50000, description: '2025年大阪室内の種目・年齢区分・標準記録を参照した再現大会。' },
    { id: 'indoorU20', name: 'U20室内日本選手権', week: 41, dateLabel: '2月1週', kind: 'indoor', category: 'U20', minAge: 18, maxAge: 19, level: 4, rating: 98, prize: 60000, description: '2025年大阪室内を参照。女子棒高跳・男女三段跳はU18選手も出場可能。' }
  ];
  const TRAITS = [
    { name: 'スプリンター', description: '短距離練習の成長15%増。', training: 'sprint' },
    { name: '努力家', description: 'すべての練習の成長8%増。', training: 'all' },
    { name: '鉄の心', description: '大会での記録のばらつきが小さい。', training: '' },
    { name: 'スタミナ自慢', description: '持久走の成長15%増。', training: 'endurance' },
    { name: '跳躍センス', description: '跳躍練習の成長15%増。', training: 'jump' },
    { name: 'タフネス', description: '練習疲労20%減。', training: '' }
  ];
  const COLORS = ['#f5a84f', '#7bb0e9', '#d7a1e8', '#79c9a2', '#ed8880', '#c7ba72', '#83b8bd', '#efa8bd'];
  const FIRST_NAMES = { boys: ['翔太', '陸', '悠真', '湊', '颯太', '大和', '悠', '蓮'], girls: ['結衣', '陽菜', '凛', '葵', '美咲', '紬', '花音', '七海'] };
  const LAST_NAMES = ['佐藤', '高橋', '小林', '中村', '山本', '渡辺', '石川', '田中', '松本', '森', '藤原', '吉田'];
  const RIVAL_SCHOOLS = ['北陵高校', '桜丘高校', '西原高校', '朝日学院', '東雲高校', '白河学園', '城南高校', ...['山城','若葉','清峰','瑞穂','青雲','桃山','海星','大和','高森','日向','南陽','松風','紅葉','藤ヶ丘','常盤','白鷺','鳴海','光陵','泉野','八雲','花咲','鳳凰','向陽','蒼風','星見','橘','緑川','水鏡','北斗','春日'].flatMap(name=>[name+'高校',name+'学園'])];
  // Fictional fields: total starters and schools include the player's entry.
  const FIELD_SIZES = {1:{track:[48,24],field:[24,16],relay:[24,24]},2:{track:[64,40],field:[32,24],relay:[32,32]},3:{track:[48,36],field:[32,24],relay:[24,24]},4:{track:[64,56],field:[40,32],relay:[48,48]}};
  const RESULT_RATINGS = [0,40,60,75,90,100,105];
  // Continuous curves retain development headroom instead of subtracting a
  // fixed time at every level. Index 3 is the ordinary district qualifying level.
  const RESULT_CURVES = {
    '100m':{boys:[18,13,11.95,11.4,10.7,10.2,10.05],girls:[22,15.3,13.9,13.2,12.3,11.6,11.4]},
    '400m':{boys:[100,62,54.8,51.5,48.2,46.2,45.7],girls:[120,74,65,61.5,56.8,53.8,53.2]},
    '1500m':{boys:[600,320,270,250,229,217,213],girls:[720,390,322,300,275,255,250]},
    '110mh':{boys:[30,19.6,16.8,15.6,14.1,13.4,13.2]},
    '100mh':{girls:[31,20,17.2,15.5,14,13.1,12.9]},
    longjump:{boys:[2.2,4.9,5.95,6.4,7.15,7.8,8],girls:[1.8,3.9,4.75,5.1,5.85,6.4,6.55]},
    highjump:{boys:[.75,1.42,1.72,1.88,2.08,2.22,2.27],girls:[.6,1.2,1.45,1.56,1.75,1.9,1.94]},
    polevault:{boys:[.8,2.6,3.65,4.1,4.95,5.5,5.65],girls:[.6,1.9,2.95,3.25,3.95,4.35,4.5]},
    triplejump:{boys:[6,10.7,12.65,13.4,14.75,15.85,16.05],girls:[5,8.9,10.2,10.9,12,12.95,13.2]},
    relay:{boys:[74,49.5,45.5,43.7,41.35,39.9,39.3],girls:[86,58,53.5,51.5,47.7,45.2,44.7]},
    '60m':{boys:[12,8.3,7.6,7.3,6.93,6.65,6.57],girls:[14,9.6,8.72,8.4,7.95,7.5,7.41]},
    '60mh':{boys:[18,11.5,9.5,8.85,8.08,7.65,7.55],girls:[19,12.5,10.5,9.9,9.02,8.3,8.15]}
  };
  const GENDER_NAMES = { boys: '男子', girls: '女子' };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const round = (v, places = 1) => Number(v.toFixed(places));
  const safeAdd = (value, increase) => Math.min(MAX_COUNT, value + increase);
  const copy = value => JSON.parse(JSON.stringify(value));
  const findEvent = id => EVENTS.find(event => event.id === id);
  const fail = message => ({ ok: false, message });
  const validState = state => !!state && state.version === VERSION && Array.isArray(state.athletes);
  const better = (value, old, eventId) => old == null || (findEvent(eventId).lowerBetter ? value < old : value > old);
  function random(state) { let x = state.rng >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; state.rng = x >>> 0 || 1; return state.rng / 4294967296; }
  function seedValue(seed) { if (typeof seed === 'number' && Number.isFinite(seed)) return (seed >>> 0) || 1; let hash = 2166136261; const text = String(seed == null ? Date.now() : seed); for (const c of text) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0 || 1; }
  function addLog(state, text) { state.logs.unshift({ year: state.year, week: state.week, text }); state.logs.length = Math.min(state.logs.length, 100); }
  function getCalendar(state) {
    const offset = Math.floor((state.week - 1) / 4), month = (offset + 3) % 12 + 1, weekOfMonth = (state.week - 1) % 4 + 1;
    return { year: state.year, week: state.week, month, monthName: month + '月', weekOfMonth, monthWeek: weekOfMonth, calendarYear: START_YEAR + state.year - 1 + (month < 4 ? 1 : 0), label: state.year + '年目 ' + month + '月' + weekOfMonth + '週', season: month >= 3 && month <= 5 ? '春' : month <= 8 && month >= 6 ? '夏' : month <= 11 && month >= 9 ? '秋' : '冬' };
  }
  function getAge(state, athlete, meet) { const month = meet ? (Math.floor((meet.week - 1) / 4) + 3) % 12 + 1 : getCalendar(state).month; return START_YEAR + state.year - 1 + (month < 4 ? 1 : 0) - athlete.birthYear; }
  function getDefaultTraining(eventId) { return ({ '100m': 'sprint', '60m': 'sprint', '400m': 'balanced', '1500m': 'endurance', '110mh': 'hurdles', '100mh': 'hurdles', '60mh': 'hurdles', longjump: 'jump', highjump: 'jump', polevault: 'technique', triplejump: 'jump', relay: 'relay' })[eventId] || 'balanced'; }
  function getAthleteRating(athlete, eventId) { const event = findEvent(eventId); return !event || !athlete?.stats ? 0 : round(Object.entries(event.weights).reduce((sum, [key, weight]) => sum + getStat(athlete, key) * weight, 0)); }
  function getSuitability(athlete) { return INDIVIDUAL_EVENTS.filter(e => !e.gender || e.gender === athlete.gender).map(event => { const rating = getAthleteRating(athlete, event.id); return { eventId: event.id, name: event.name, rating, rank: getAbilityRank(rating), description: event.description }; }).sort((a, b) => b.rating - a.rating); }
  function freshCareerStats() { return { personalBests: 0, podiumDivisions: [], relayPodiums: [], interhighEntries: 0, interhighWins: 0, indoorPodiums: 0, meetCount: 0, medals: { gold: 0, silver: 0, bronze: 0 } }; }
  function freshCareerSeason(year, goalId = 'personalBests', mode = 'normal') { return { year, goalId, mode, goalRewarded: false, goalAchievedWeek: null, stats: freshCareerStats() }; }
  function careerGoalProgress(season) {
    const goal = CAREER_GOALS.find(g => g.id === season.goalId), stats = season.stats;
    const current = ({ personalBests: stats.personalBests, allRound: stats.podiumDivisions.length, relay: stats.relayPodiums.length, interhigh: stats.interhighEntries, champion: stats.interhighWins, indoor: stats.indoorPodiums })[goal.id];
    return { ...goal, current, achieved: current >= goal.target, rewarded: season.goalRewarded };
  }
  function countCareerMeet(stats, meet) {
    if (meet.results.length) stats.meetCount = safeAdd(stats.meetCount, 1);
    for (const r of meet.results) {
      if (!r.official) continue;
      if (!findEvent(r.eventId).teamSize && (r.personalBest ?? r.newBest)) stats.personalBests = safeAdd(stats.personalBests, 1);
      if (r.medal) stats.medals[r.medal] = safeAdd(stats.medals[r.medal], 1);
      if (r.rank <= 3) {
        if (!stats.podiumDivisions.includes(r.divisionKey)) stats.podiumDivisions.push(r.divisionKey);
        if (r.eventId === 'relay' && !stats.relayPodiums.includes(r.gender)) stats.relayPodiums.push(r.gender);
        if (meet.kind === 'indoor') stats.indoorPodiums = safeAdd(stats.indoorPodiums, 1);
      }
      if (meet.id === 'nationals') { stats.interhighEntries = safeAdd(stats.interhighEntries, 1); if (r.rank === 1) stats.interhighWins = safeAdd(stats.interhighWins, 1); }
    }
  }
  function registerSchoolRecord(career, meet, result) {
    if (!result.official) return false;
    const recordKey = getRecordKey(result.eventId, result.hurdleHeight), key = result.gender + ':' + recordKey;
    const old = career.schoolRecords.find(r => r.key === key);
    if (!better(result.value, old?.value, result.eventId)) return false;
    const record = { key, recordKey, eventId: result.eventId, gender: result.gender, value: result.value, athleteId: result.athleteId, athleteName: result.athleteName, year: meet.year, week: meet.week, meetId: meet.id, meetName: meet.name, mode: meet.mode || 'normal', ...(result.hurdleHeight ? { hurdleHeight: result.hurdleHeight } : {}), ...(result.members ? { members: copy(result.members), athleteIds: [...result.athleteIds] } : {}) };
    career.schoolRecords = [record, ...career.schoolRecords.filter(r => r.key !== key)];
    return true;
  }
  function careerSeasonSummary(season, partial = false) {
    return { year: season.year, mode: season.mode, goalId: partial ? null : season.goalId, achieved: !partial && season.goalRewarded, reward: 0, medals: { ...season.stats.medals }, personalBests: season.stats.personalBests, meetCount: season.stats.meetCount, interhighWins: season.stats.interhighWins, partial };
  }
  function makeCareer(state) {
    const career = { version: 1, startedYear: state.year, season: freshCareerSeason(state.year), schoolRecords: [], alumni: [], seasons: [], lifetime: { completedSeasons: state.year - 1, goalsAchieved: 0, interhighTitles: 0, currentStreak: 0, bestStreak: 0, graduates: Math.min(MAX_COUNT, Math.max(0, state.year - 3) * 12), lastTitleYear: null }, migrated: state.year > 1 || state.week > 1 || state.history.length > 0 };
    const years = new Map();
    for (const meet of [...state.history].reverse()) {
      let season = years.get(meet.year);
      if (!season) { season = freshCareerSeason(meet.year, 'personalBests', meet.mode || 'normal'); years.set(meet.year, season); }
      countCareerMeet(season.stats, meet);
      for (const result of meet.results) registerSchoolRecord(career, meet, result);
    }
    const recovered = [...years.values()].sort((a,b) => a.year-b.year);
    let streak = 0, lastWin = null;
    for (const season of recovered) {
      if (season.year === state.year) { career.season.stats = season.stats; career.season.mode = season.mode; }
      else career.seasons.unshift(careerSeasonSummary(season, true));
      if (season.stats.interhighWins) {
        streak = lastWin === season.year - 1 ? streak + 1 : 1; lastWin = season.year;
        career.lifetime.interhighTitles++; career.lifetime.bestStreak = Math.max(career.lifetime.bestStreak, streak);
      }
    }
    career.seasons.length = Math.min(career.seasons.length, 30);
    career.lifetime.lastTitleYear = lastWin;
    const latestInterhighYear = state.completedMeets.includes('nationals') ? state.year : state.year - 1;
    career.lifetime.currentStreak = lastWin === latestInterhighYear ? streak : 0;
    return career;
  }
  function ensureCareer(state) { if (!state.career) state.career = makeCareer(state); return state.career; }
  function getCareer(state) {
    const career = copy(state.career || makeCareer(state));
    return { ...career, goal: careerGoalProgress(career.season), mode: { ...CAREER_MODES.find(m => m.id === career.season.mode) }, canChangeGoal: state.week === 1 && !career.season.goalRewarded, canChangeMode: state.week === 1 && !career.season.goalRewarded };
  }
  function chooseSeasonGoal(state, goalId) {
    if (!validState(state) || !CAREER_GOALS.some(g => g.id === goalId)) return fail('年度目標が正しくありません。');
    if (!getCareer(state).canChangeGoal) return fail('年度目標を選べるのは4月1週です。');
    ensureCareer(state).season.goalId = goalId;
    return { ok: true, message: '今年の目標を「' + CAREER_GOALS.find(g => g.id === goalId).name + '」にしました。' };
  }
  function setSeasonMode(state, modeId) {
    if (!validState(state) || !CAREER_MODES.some(m => m.id === modeId)) return fail('大会モードが正しくありません。');
    if (!getCareer(state).canChangeMode) return fail('大会モードを選べるのは4月1週です。');
    ensureCareer(state).season.mode = modeId;
    return { ok: true, message: '今年は「' + CAREER_MODES.find(m => m.id === modeId).name + '」で挑みます。' };
  }
  function settleCareerGoal(state) {
    const career = ensureCareer(state), goal = careerGoalProgress(career.season);
    if (!goal.achieved || career.season.goalRewarded) return { reward: 0, message: '' };
    career.season.goalRewarded = true; career.season.goalAchievedWeek = state.week;
    career.lifetime.goalsAchieved = safeAdd(career.lifetime.goalsAchieved, 1);
    // Goal completion grants an additional school facility request, not money.
    return { reward: 0, message: '年度目標「' + goal.name + '」達成！ 今年の設備整備をもう1回申請できます。' };
  }
  function recordCareerMeet(state, meet, results, summary) {
    const career = ensureCareer(state), completed = { ...meet, year: state.year, mode: career.season.mode, results };
    let records = 0;
    for (const result of results) { result.schoolRecord = registerSchoolRecord(career, completed, result); if (result.schoolRecord) records++; }
    countCareerMeet(career.season.stats, completed);
    if (meet.id === 'nationals') {
      if (career.season.stats.interhighWins) {
        career.lifetime.interhighTitles = safeAdd(career.lifetime.interhighTitles, 1);
        career.lifetime.currentStreak = career.lifetime.lastTitleYear === state.year - 1 ? safeAdd(career.lifetime.currentStreak, 1) : 1;
        career.lifetime.lastTitleYear = state.year;
        career.lifetime.bestStreak = Math.max(career.lifetime.bestStreak, career.lifetime.currentStreak);
      } else career.lifetime.currentStreak = 0;
    }
    const settlement = settleCareerGoal(state);
    summary.careerReward = settlement.reward;
    const messages = [];
    if (records) messages.push('学校新記録 ' + records + '種目！');
    if (settlement.message) messages.push(settlement.message);
    summary.careerMessage = messages.join(' ');
    if (summary.careerMessage) addLog(state, summary.careerMessage);
  }
  function finishCareerYear(state, report) {
    const career = ensureCareer(state), graduates = state.athletes.filter(a => a.grade === 3);
    // A legacy save may recover an achieved goal after its final meet. Settle it
    // before archiving, so the displayed achievement never disappears unpaid.
    const settlement = settleCareerGoal(state);
    if (settlement.message) report.events.push(settlement.message);
    career.seasons.unshift(careerSeasonSummary(career.season)); career.seasons.length = Math.min(career.seasons.length, 30);
    career.alumni.unshift(...graduates.map(a => ({ id: a.id, name: a.name, gender: a.gender, event: a.event, trait: a.trait, color: a.color, graduationYear: state.year, stats: { ...a.stats }, bestBySpec: copy(a.bestBySpec) })));
    career.alumni.length = Math.min(career.alumni.length, 60);
    career.lifetime.completedSeasons = safeAdd(career.lifetime.completedSeasons, 1);
    career.lifetime.graduates = safeAdd(career.lifetime.graduates, graduates.length);
    if (!career.season.stats.interhighWins) career.lifetime.currentStreak = 0;
    career.season = freshCareerSeason(state.year + 1, career.season.goalId, career.season.mode);
  }
  function makeAthlete(state, options = {}) {
    const serial = state.nextAthleteId++, gender = options.gender || (serial % 2 ? 'boys' : 'girls'), grade = options.grade ?? 1;
    const pool = INDIVIDUAL_EVENTS.filter(e => !e.gender || e.gender === gender), eventId = options.event || pool[Math.floor(random(state) * pool.length)].id;
    const event = findEvent(eventId), trait = options.trait || TRAITS[Math.floor(random(state) * TRAITS.length)], base = options.base ?? 34 + random(state) * 8 + Math.min(state.reputation, 100) * .08;
    const legacyWeights = LEGACY_EVENT_WEIGHTS[eventId];
    const stats = Object.fromEntries(LEGACY_STAT_KEYS.map(key => [key, round(clamp(base + (legacyWeights[key] || 0) * 62 + random(state) * 7, 20, 88))]));
    stats.acceleration = getStat({ stats }, 'acceleration'); stats.speedEndurance = getStat({ stats }, 'speedEndurance');
    const birthMonth = options.birthMonth || 1 + Math.floor(random(state) * 12);
    const athlete = { id: 'athlete-' + serial, name: options.name || LAST_NAMES[Math.floor(random(state) * LAST_NAMES.length)] + ' ' + FIRST_NAMES[gender][Math.floor(random(state) * FIRST_NAMES[gender].length)], gender, grade, birthMonth, birthYear: START_YEAR + state.year - 1 - 15 - grade + (birthMonth <= 3 ? 1 : 0), trait: trait.name, traitDescription: trait.description, event: eventId, specialty: eventId, stats: options.stats || stats, energy: 100, morale: 80, injury: 0, training: getDefaultTraining(eventId), focus: Object.entries(event.weights).sort((a,b) => b[1] - a[1])[0][0], best: {}, bestBySpec: {}, officialBest: {}, officialRecords: {}, color: COLORS[(serial - 1) % COLORS.length], potential: round(.90 + random(state) * .28, 2), form: 1 };
    return athlete;
  }
  function generateCandidates(state) {
    return ['boys', 'girls'].flatMap(gender => [0, 1, 2, 3, 4, 5].map(index => {
      const athlete = makeAthlete(state, { gender, grade: 0, base: 40 + (index % 3) * 4 + Math.min(state.reputation, 100) * .10 });
      athlete.cost = 0; athlete.note = ['中学の地区大会で活躍。伸びしろに期待。', '中学県大会の経験者。得意種目を伸ばしたい。', '中学地方大会の注目株。新しい部で全国へ。', '部活動の体験参加で光った才能。', '伸ばしたい能力が明確な努力家。', '仲間と全国を目指したい注目株。'][index]; return athlete;
    }));
  }
  function refreshCards(state) {
    const pool = PRACTICE_CARDS.filter(c => c.id !== 'basic');
    const a = pool.splice(Math.floor(random(state) * pool.length), 1)[0], b = pool.splice(Math.floor(random(state) * pool.length), 1)[0];
    state.practiceCards = [PRACTICE_CARDS[0], a, b].map(card => ({ ...card, stats: { ...card.stats } })); state.selectedPracticeCard = 'basic';
  }
  function freshQualification() { return Object.fromEntries(MEETS.map(meet => [meet.id, ['district', 'rookieDistrict'].includes(meet.id) ? true : {}])); }
  function createGame(seed) {
    const state = { version: VERSION, year: 1, week: 1, money: 0, weekRoute: [...DEFAULT_WEEK_ROUTE], facilityPlan: { year: 1, used: 0 }, reputation: 0, spirit: 70, intensity: 'normal', athletes: [], facilities: { track: 1, gym: 1, recovery: 1, club: 1 }, logs: [], history: [], medals: { gold: 0, silver: 0, bronze: 0 }, teamBest: { boys: {}, girls: {} }, schoolName: '青葉高校', rng: seedValue(seed), nextAthleteId: 1, recruitedIds: [], candidates: [], scouted: [], qualification: freshQualification(), completedMeets: [], pendingMeet: null, pendingMeets: [], lastMeet: null, competedThisWeek: [], monthPlanPending: true, practiceCards: [], selectedPracticeCard: 'basic', goal: { districtQualified: false, prefectureQualified: false, nationalsQualified: false, nationalsWon: false, wonYear: null }, totalWeeks: 0 };
    const names = { boys: ['橘 翔太', '宮本 陸', '田辺 悠', '北村 蓮', '藤原 湊', '遠藤 大和'], girls: ['水野 葵', '桜井 凛', '小川 美咲', '高橋 結衣', '森 陽菜', '石川 紬'] };
    for (const gender of ['boys', 'girls']) ['100m', '400m', '1500m', gender === 'boys' ? '110mh' : '100mh', 'longjump', 'highjump'].forEach((event, i) => state.athletes.push(makeAthlete(state, { gender, event, name: names[gender][i], base: 37 + (i % 3) * 2, birthMonth: [5, 8, 1, 10, 3, 7][i] })));
    state.candidates = generateCandidates(state); refreshCards(state);
    state.career = makeCareer(state);
    addLog(state, '新設・青葉高校陸上部、始動！ 1年生の男子6名・女子6名で、5月1週の地区予選を目指す。');
    return state;
  }
  function getSchedule() { return MEETS.map(meet => ({ ...meet })); }
  function getNextMeet(state) {
    const meet = MEETS.find(m=>m.id===state.pendingMeet?.id) || MEETS.find(m => m.week >= state.week && !state.completedMeets.includes(m.id));
    if (!meet) return { ...MEETS[0], weeksUntil: 48 - state.week + 5, qualified: true, nextYear: true, year: state.year + 1 };
    const qualification = state.qualification[meet.id];
    const qualified = meet.kind !== 'school' || qualification === true || Object.keys(qualification || {}).length > 0;
    return { ...meet, weeksUntil: Math.max(0, meet.week - state.week), qualified, open: !qualified, year: state.year };
  }
  const INDOOR_STANDARDS = {
    U18: { boys: { '60m': [10.78, '100m'], '60mh': [14.80, '110mh'], longjump: [6.95, 'longjump'], polevault: [4.40, 'polevault'] }, girls: { '60m': [12.23, '100m'], '60mh': [14.55, '100mh'], longjump: [5.65, 'longjump'] } },
    U20: { boys: { '60m': [10.60, '100m'], '60mh': [14.45, '110mh'], longjump: [7.40, 'longjump'], polevault: [4.90, 'polevault'], triplejump: [14.90, 'triplejump'] }, girls: { '60m': [12.08, '100m'], '60mh': [14.35, '100mh'], longjump: [5.88, 'longjump'], polevault: [3.71, 'polevault'], triplejump: [12.30, 'triplejump'] } }
  };
  const OUTDOOR_STANDARDS = { boys: { '100m': 11.65, '400m': 53, '1500m': 275, '110mh': 17.5, longjump: 6, highjump: 1.75, polevault: 3.6, triplejump: 12.3 }, girls: { '100m': 13.15, '400m': 62, '1500m': 320, '100mh': 17.5, longjump: 4.9, highjump: 1.5, polevault: 2.75, triplejump: 10.4 } };
  function getRecordKey(eventId, hurdleHeight) { return ['110mh', '100mh', '60mh'].includes(eventId) ? eventId + ':' + Number(hurdleHeight).toFixed(3) : eventId; }
  function getMeetEvents(state, requestedMeet) {
    const meet = typeof requestedMeet === 'string' ? MEETS.find(m => m.id === requestedMeet) : requestedMeet || state.pendingMeet || getNextMeet(state);
    if (!meet) return [];
    return ['boys', 'girls'].flatMap(gender => {
      const ids = meet.kind === 'indoor' ? Object.keys(INDOOR_STANDARDS[meet.category][gender]) : EVENTS.filter(e => !e.indoor && (!e.gender || e.gender === gender) && (meet.kind === 'school' || !e.teamSize)).map(e => e.id);
      return ids.map(id => {
        const event = findEvent(id), hurdleHeight = ['110mh','100mh','60mh'].includes(id) ? gender === 'boys' ? meet.kind === 'school' ? 1.067 : .991 : meet.category === 'U18' ? .762 : .838 : undefined;
        const indoor = meet.kind === 'indoor' ? INDOOR_STANDARDS[meet.category][gender][id] : null;
        let standard = indoor ? indoor[0] : meet.kind === 'championship' ? OUTDOOR_STANDARDS[gender][id] : undefined;
        if (meet.kind === 'championship' && meet.category === 'U20') standard = round(standard * (event.lowerBetter ? .975 : 1.04), 2);
        return { ...event, key: gender + ':' + id, gender, name: GENDER_NAMES[gender] + ' ' + event.name, category: meet.category || (meet.rookie ? '新人' : '高校'), hurdleHeight, standard, standardEvent: indoor ? indoor[1] : id, standardSource: indoor ? 'JAAF 2025' : standard != null ? 'game' : null, minAge: meet.kind === 'indoor' && meet.category === 'U20' && (id === 'triplejump' || (gender === 'girls' && id === 'polevault')) ? 16 : meet.minAge, maxAge: meet.maxAge, recordKey: getRecordKey(id, hurdleHeight) };
      });
    });
  }
  function resolveDivision(state, division, meet) { const divisions = getMeetEvents(state, meet); return typeof division === 'string' ? divisions.find(d => d.key === division) : divisions.find(d => d.key === division?.key); }
  function qualifyingRecord(state, athlete, division, meet) {
    const id = division.standardEvent, key = getRecordKey(id, division.hurdleHeight), year = START_YEAR + state.year - 1 + (meet.week >= 37 ? 1 : 0);
    // Indoor qualification follows the exact 2025 event/hurdle specification; outdoor entry standards are game rules.
    const keys = [key];
    if (meet.kind === 'championship' && ['110mh','100mh'].includes(id)) keys.push(getRecordKey(id, athlete.gender === 'boys' ? 1.067 : .838));
    const records = keys.flatMap(k => [athlete.officialBest[k], ...Object.entries(athlete.officialRecords?.[k] || {}).map(([calendarYear,value]) => ({calendarYear:Number(calendarYear),value}))]);
    return records.filter(record => record && record.calendarYear >= year - 1 && record.calendarYear <= year).sort((a,b) => findEvent(id).lowerBetter ? a.value - b.value : b.value - a.value)[0];
  }
  function getEntryStatus(state, athlete, inputDivision, requestedMeet) {
    const meet = typeof requestedMeet === 'string' ? MEETS.find(m => m.id === requestedMeet) : requestedMeet || state.pendingMeet || getNextMeet(state);
    const division = resolveDivision(state, inputDivision, meet);
    const no = reason => ({ eligible: false, official: false, open: false, reason });
    if (!athlete || !state.athletes.some(a => a.id === athlete.id) || !division) return no('選手または種目が見つかりません。');
    if (athlete.gender !== division.gender) return no(GENDER_NAMES[division.gender] + 'の種目です。');
    if (athlete.injury > 0) return no('ケガの療養中です。');
    if (meet.rookie && athlete.grade > 2) return no('新人戦は1・2年生のみ出場できます。');
    if (meet.kind !== 'school') {
      const age = getAge(state, athlete, meet);
      if (age < division.minAge || age > division.maxAge) return no('年末年齢' + age + '歳：参加区分は' + division.minAge + '〜' + division.maxAge + '歳です。');
      if (state.week === meet.week && state.competedThisWeek.includes(athlete.id)) return no('同じ週の選手権にすでに出場しています。');
      const record = qualifyingRecord(state, athlete, division, meet), event = findEvent(division.standardEvent);
      const spec = division.hurdleHeight ? '（高さ' + round(division.hurdleHeight * 100, 1) + 'cm）' : '';
      const needed = event.name + spec + ' ' + formatResult(division.standard, event.id);
      if (!record) return no('資格記録なし：' + needed + 'の公認記録が必要です。');
      if (event.lowerBetter ? record.value > division.standard : record.value < division.standard) return no('標準未達：' + needed + 'が必要（公認' + formatResult(record.value, event.id) + '）。');
      return { eligible: true, official: true, open: false, reason: '年齢・参加標準記録をクリア。', qualifyingRecord: record.value };
    }
    const qualified = state.qualification[meet.id];
    const slot = qualified === true ? true : qualified?.[division.key];
    const official = slot === true || (Array.isArray(slot) && slot.includes(athlete.id));
    return { eligible: true, official, open: !official, reason: official ? '正式出場できます。' : '予選通過なし：オープン記録会として出場（表彰・次大会進出なし）。' };
  }
  function getEligibleAthletes(state, division, meet) { return state.athletes.filter(athlete => getEntryStatus(state, athlete, division, meet).eligible); }
  function getMeetField(state, inputDivision, requestedMeet) {
    const requested = requestedMeet || state.pendingMeet || getNextMeet(state);
    const meet = MEETS.find(m=>m.id===(typeof requested==='string'?requested:requested?.id));
    if(!meet)return null;
    const division = resolveDivision(state,inputDivision,meet);
    if(!division)return null;
    const type = division.teamSize?'relay':division.unit==='m'?'field':'track';
    const sizes = meet.kind==='indoor' ? type==='field'?[8,8]:[32,28] : meet.kind==='championship' ? type==='field'?[24,20]:[48,40] : FIELD_SIZES[meet.level][type];
    const qualifyPlaces = !meet.next?0:meet.level===1?(type==='track'?16:8):6;
    const baseRating = meet.rating;
    const mode = CAREER_MODES.find(m=>m.id===state.career?.season.mode)||CAREER_MODES[0];
    const cutoffRating = baseRating + (meet.level===4?mode.nationalBonus:mode.rivalBonus);
    return {participants:sizes[0],schools:sizes[1],qualifyPlaces,cutoffRating,benchmark:qualifyPlaces?ratingToResult(cutoffRating,division.id,division.gender,division.hurdleHeight):null};
  }
  function readiness(athlete) { return (.86 + clamp(athlete.energy, 0, 100) * .0014) * (.96 + clamp(athlete.morale, 0, 100) * .0005) * (athlete.injury > 0 ? .76 : 1); }
  function ratingToResult(rating, eventId, gender = 'boys', hurdleHeight) {
    const values=RESULT_CURVES[eventId]?.[gender];if(!values)return 0;
    const r=clamp(rating,0,105),upper=RESULT_RATINGS.findIndex(point=>point>=r),index=Math.max(1,upper);
    const fraction=(r-RESULT_RATINGS[index-1])/(RESULT_RATINGS[index]-RESULT_RATINGS[index-1]);
    let value=values[index-1]+(values[index]-values[index-1])*fraction;
    if(eventId==='110mh'&&hurdleHeight!==1.067)value-=.25;
    if(eventId==='100mh'&&hurdleHeight!==.838)value-=.20;
    if(eventId==='60mh'&&gender==='girls'&&hurdleHeight===.762)value-=.12;
    return round(value,eventId==='1500m'?1:2);
  }
  function predictResult(athlete, eventId, division) { const height = division?.hurdleHeight ?? (eventId === '110mh' ? 1.067 : eventId === '100mh' ? .838 : eventId === '60mh' ? athlete.gender === 'boys' ? .991 : .838 : undefined); return ratingToResult(getAthleteRating(athlete, eventId) * readiness(athlete), eventId, athlete.gender, height); }
  function relayAthletes(state, ids) { if (!Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4) return null; const athletes = ids.map(id => state.athletes.find(a => a.id === id)); return athletes.some(a => !a || a.injury > 0) || new Set(athletes.map(a => a.gender)).size !== 1 ? null : athletes; }
  function relayRating(athletes, useReadiness) { return !Array.isArray(athletes) || athletes.length !== 4 || athletes.some(a => !a?.stats) ? null : athletes.reduce((sum, a, i) => sum + Object.entries(RELAY_LEGS[i]).reduce((n,[key,w]) => n + getStat(a, key) * w, 0) * (useReadiness ? readiness(a) : 1), 0) / 4; }
  function getRelayRating(athletes) { const rating = relayRating(athletes, false); return rating == null ? null : round(rating); }
  function predictRelayResult(state, ids) { const athletes = relayAthletes(state, ids); return athletes ? ratingToResult(relayRating(athletes, true), 'relay', athletes[0].gender) : null; }
  function formatResult(value, eventId) { if (!Number.isFinite(value)) return '—'; if (findEvent(eventId)?.unit === 'm') return value.toFixed(2) + 'm'; if (eventId === '1500m') { const tenth = Math.round(value * 10); return Math.floor(tenth / 600) + ':' + ((tenth % 600) / 10).toFixed(1).padStart(4, '0'); } return value.toFixed(2) + '秒'; }
  function setFocus(state, athleteId, focusId) { const athlete = validState(state) && state.athletes.find(a => a.id === athleteId); if (!athlete || !FOCUSES.some(f => f.id === focusId)) return fail('育成方針が正しくありません。'); athlete.focus = focusId; return { ok: true, message: athlete.name + 'の重点育成を' + (STAT_NAMES[focusId] || 'バランス') + 'にしました。' }; }
  function confirmMonthlyPlan(state) { if (!validState(state)) return fail('部のデータを読み込めません。'); state.monthPlanPending = false; const message = getCalendar(state).monthName + 'の育成方針を決定しました。'; addLog(state, message); return { ok: true, message }; }
  function setTraining(state, athleteId, trainingId) { const athlete = validState(state) && state.athletes.find(a => a.id === athleteId); if (!athlete || !TRAININGS.some(t => t.id === trainingId)) return fail('選手または練習メニューが見つかりません。'); athlete.training = trainingId; return { ok: true, message: athlete.name + 'の練習を変更しました。' }; }
  function setIntensity(state, intensity) { if (!validState(state) || !['easy','normal','hard'].includes(intensity)) return fail('練習強度が正しくありません。'); state.intensity = intensity; return { ok: true, message: '練習強度を変更しました。' }; }
  function choosePracticeCard(state, cardId) {
    if (!validState(state)) return fail('部のデータを読み込めません。');
    const card = state.practiceCards.find(c => c.id === cardId); if (!card) return fail('今週はこの練習カードを選べません。');
    const routes = { basic: ['speed','skill','recovery'], technical: ['mobility','skill','skill'], condition: ['recovery','recovery','recovery'], teamwork: ['skill','speed','recovery'], camp: ['load','load','load'], mobility: ['mobility','skill','recovery'] };
    state.selectedPracticeCard = cardId; state.weekRoute = routes[cardId].slice(); return { ok: true, message: '「' + card.name + '」を週間プログラムに反映しました。' };
  }
  function getFacilityPlan(state) {
    const used = state.facilityPlan?.year === state.year ? state.facilityPlan.used : 0, total = 2 + (state.career?.season.goalRewarded ? 1 : 0);
    return { available: Math.max(0, total-used), used, total };
  }
  function getFacilityCost(state, facilityId) { const f = FACILITIES.find(f => f.id === facilityId); return !f || !state.facilities || state.facilities[facilityId] >= 5 ? null : 0; }
  function upgradeFacility(state, facilityId) {
    if (!validState(state)) return fail('部のデータを読み込めません。'); const f = FACILITIES.find(f => f.id === facilityId); if (!f) return fail('設備が見つかりません。');
    if (getFacilityCost(state, facilityId) === null) return fail('この設備は最高レベルです。');
    const plan = getFacilityPlan(state); if (!plan.available) return fail('今年の整備申請は完了しています。年度目標の達成、または新年度を待ちましょう。');
    state.facilityPlan = { year: state.year, used: plan.used + 1 }; state.facilities[facilityId]++; const message = f.name + 'がLv.' + state.facilities[facilityId] + 'になりました。'; addLog(state,message); return { ok:true,message,cost:0 };
  }
  function getCandidates(state) { return getCalendar(state).month === 10 ? state.candidates.filter(a => !state.recruitedIds.includes(a.id)) : []; }
  function scoutAthlete(state, candidateId) {
    if (!validState(state)) return fail('部のデータを読み込めません。');
    if (getCalendar(state).month !== 10) return fail('中学生のスカウトは10月に行えます。');
    const candidate = getCandidates(state).find(a => a.id === candidateId); if (!candidate) return fail('この選手はスカウトできません。');
    if (state.scouted.filter(a => a.gender === candidate.gender).length >= 3) return fail('スカウト内定は男女それぞれ3人までです。');
    state.recruitedIds.push(candidate.id); const athlete = JSON.parse(JSON.stringify(candidate)); state.scouted.push(athlete);
    const message = athlete.name + 'が入部内定！ 翌年4月に1年生として合流します。'; addLog(state,message); return { ok:true,message,athlete };
  }
  const recruitAthlete = scoutAthlete;
  function trainAthlete(state, athlete, card) {
    const before = athlete.energy, training = TRAININGS.find(t => t.id === athlete.training);
    const change = { athleteId: athlete.id, name: athlete.name, training: training.name, trainingId: training.id, focus: athlete.focus, before: { ...athlete.stats }, after: {}, beforeEnergy: before, afterEnergy: before, statGains: {}, energyChange: 0, injury: 0, message: '' };
    if (athlete.injury > 0) { athlete.injury--; athlete.energy = clamp(athlete.energy + 25 + state.facilities.recovery * 3, 0, 100); change.message = athlete.injury ? 'リハビリ中（あと' + athlete.injury + '週）' : 'ケガから復帰！'; }
    else if (training.id === 'rest') { athlete.energy = clamp(athlete.energy + 32 + state.facilities.recovery * 4, 0, 100); athlete.morale = clamp(athlete.morale + 5, 0, 100); change.message = '休養して体力を回復。'; }
    else {
      const intensity = { easy: [.75,.65], normal: [1,1], hard: [1.25,1.40] }[state.intensity], trait = TRAITS.find(t => t.name === athlete.trait);
      const facility = ['sprint','endurance','hurdles','relay'].includes(training.id) ? state.facilities.track : state.facilities.gym;
      const growth = intensity[0] * card.growth * (1 + (facility - 1) * .12) * (1 + (state.facilities.club - 1) * .025) * (trait?.training === 'all' ? 1.08 : trait?.training === training.id ? 1.15 : 1) * athlete.potential * (.65 + athlete.energy * .0035);
      for (const key of STAT_KEYS) {
        const base = (training.stats[key] || 0) + (athlete.focus === 'balanced' ? .20 : athlete.focus === key ? 1.05 : .035) + (card.stats[key] || 0);
        const old = athlete.stats[key], taper = old >= 95 ? .18 : old >= 85 ? .45 : old >= 75 ? .72 : 1;
        athlete.stats[key] = round(clamp(old + base * growth * taper * (.92 + random(state) * .16), 0, 100)); change.statGains[key] = round(athlete.stats[key] - old);
      }
      const fatigue = training.fatigue * intensity[1] * card.fatigue * (athlete.trait === 'タフネス' ? .8 : 1) - 3 - state.facilities.recovery * 1.5;
      athlete.energy = round(clamp(athlete.energy - Math.max(0, fatigue) + (card.recovery || 0), 0, 100)); athlete.morale = round(clamp(athlete.morale + (state.intensity === 'hard' ? -1 : 1) + state.facilities.club * .15, 0, 100));
      if (random(state) < (athlete.energy < 30 ? (30 - athlete.energy) * .005 : 0)) { athlete.injury = 1 + Math.floor(random(state) * 2); change.injury = athlete.injury; change.message = '疲労によるケガ。' + athlete.injury + '週間の療養。'; }
    }
    change.energyChange = round(athlete.energy - before); change.afterEnergy = athlete.energy; change.after = { ...athlete.stats }; return change;
  }
  function rollYear(state, report) {
    finishCareerYear(state, report);
    report.graduated = state.athletes.filter(a => a.grade === 3).map(a => a.name);
    state.athletes = state.athletes.filter(a => a.grade < 3); state.athletes.forEach(a => { a.grade++; a.energy = 100; a.injury = 0; a.morale = Math.max(a.morale, 80); });
    state.year++; state.week = 1; state.qualification = freshQualification(); state.completedMeets = []; state.pendingMeet = null; state.pendingMeets = []; state.competedThisWeek = []; report.newcomers = [];
    for (const gender of ['boys','girls']) {
      const committed = state.scouted.filter(a => a.gender === gender);
      for (let i = 0; i < 6; i++) { const athlete = committed[i] ? JSON.parse(JSON.stringify(committed[i])) : makeAthlete(state,{gender}); athlete.grade = 1; athlete.energy = 100; athlete.morale = 85; athlete.injury = 0; delete athlete.cost; delete athlete.note; state.athletes.push(athlete); report.newcomers.push(athlete); }
    }
    state.scouted = []; state.recruitedIds = []; state.candidates = generateCandidates(state);
    state.facilityPlan = { year: state.year, used: 0 }; state.spirit = clamp(state.spirit + 8, 0, 100);
    if (report.graduated.length) report.events.push(report.graduated.length + '人が卒業。先輩の記録と思いを受け継ごう。');
    report.events.push('新年度！ 男子6名・女子6名の新入生が合流。学校への設備整備申請が2回できます。');
  }
  function advanceWeek(state, options = {}) {
    if (!validState(state)) return fail('部のデータを読み込めません。');
    if (state.pendingMeet) return fail('大会当日です。出場または見送りで大会を終えてください。');
    if (state.monthPlanPending) return fail('月初です。全員の月間育成方針を確認・決定してください。');
    if (state.totalWeeks >= MAX_COUNT || (state.week === 48 && (state.year >= MAX_YEAR || state.nextAthleteId > MAX_COUNT - 24))) return fail('数値を正確に保存できる上限に達しました。セーブを書き出してください。');
    if (!options || typeof options !== 'object' || Array.isArray(options)) return fail('指導方針が正しくありません。');
    if (state.weekRoute !== undefined && !validWeekRoute(state.weekRoute)) return fail('週間プログラムを確認してください。');
    const journey = getWeekJourney(state), decision = options.decision === undefined ? 'balanced' : options.decision, choice = journey.event.choices.find(c => c.id === decision);
    if (!choice) return fail('今週の相談にある指導方針を選んでください。');
    const explicitTarget = options.athleteId !== undefined;
    const coached = state.athletes.find(a => a.id === (explicitTarget ? options.athleteId : journey.event.athleteId) && !a.injury);
    if (explicitTarget && !coached) return fail('個別指導は在籍中でケガのない選手を選んでください。');
    // All validation precedes the first mutation. The date and every athlete
    // are settled exactly once, after the player's coaching choice.
    ensureCareer(state); migrateAbilities(state);
    const card = weekEffects(journey.route);
    if (decision === 'push') { card.growth *= 1.12; card.fatigue *= 1.20; }
    if (decision === 'care') { card.growth *= .88; card.fatigue *= .70; card.recovery += 5; }
    const beforeMonth = getCalendar(state).month, report = { title: '7日間の活動ハイライト', weekLabel: getCalendar(state).label, cardName: journey.route.map(id => WEEK_BLOCKS.find(b => b.id === id).name).join(' → '), route: [...journey.route], decision, decisionText: (coached ? coached.name + 'へ：' : 'チームへ：') + choice.label, coachedAthleteId: coached?.id || null, changes: [], income: 0, expenses: 0, balance: 0, events: [], graduated: [], newcomers: [], lines: [], rankUps: [], highlights: [], monthChanged: false };
    report.changes = state.athletes.map(a => trainAthlete(state,a,card));
    if (coached) report.changes.find(c => c.athleteId === coached.id).coached = true;
    if (coached && !coached.injury && coached.training !== 'rest') {
      const key = coached.focus === 'balanced' ? Object.keys(findEvent(coached.event).weights).sort((a,b) => getStat(coached,a)-getStat(coached,b))[0] : coached.focus, old = coached.stats[key], extra = {balanced:.35,push:.60,care:.25}[decision] * (old >= 95 ? .18 : old >= 85 ? .45 : old >= 75 ? .72 : 1);
      coached.stats[key] = round(clamp(old + extra, 0, 100)); const change = report.changes.find(c => c.athleteId === coached.id); change.statGains[key] = round((change.statGains[key] || 0) + coached.stats[key] - old); change.after[key] = coached.stats[key]; change.coached = true;
    }
    state.totalWeeks++; state.spirit = round(clamp(state.spirit + (decision === 'care' ? 1 : 0) + (state.intensity === 'hard' ? -.5 : .5), 15, 100));
    if (random(state) < .13) { const type = Math.floor(random(state) * 3); if (type < 2) { state.spirit = clamp(state.spirit + 6, 0, 100); report.events.push(type === 0 ? '地域の人たちが練習を応援。チームの士気 +6。' : '仲間同士で励まし合う。チームの士気 +6。'); } else { state.athletes.forEach(a => { a.energy = clamp(a.energy + 7, 0, 100); }); report.events.push('保護者からお弁当の差し入れ。全員のコンディション +7。'); } }
    for (const change of report.changes) {
      const a = state.athletes.find(a => a.id === change.athleteId); change.afterEnergy = a.energy; change.energyChange = round(a.energy-change.beforeEnergy);
      for (const key of STAT_KEYS) if (getAbilityRank(change.after[key]) !== getAbilityRank(change.before[key])) report.rankUps.push({ athleteId: a.id, name: a.name, key, before: change.before[key], after: change.after[key], from: getAbilityRank(change.before[key]), to: getAbilityRank(change.after[key]) });
      const key = STAT_KEYS.reduce((best,k) => (change.statGains[k] || 0) > (change.statGains[best] || 0) ? k : best, STAT_KEYS[0]);
      report.highlights.push({ athleteId: a.id, name: a.name, key, label: STAT_NAMES[key], before: change.before[key], after: change.after[key], gain: change.statGains[key] || 0, rankBefore: getAbilityRank(change.before[key]), rankAfter: getAbilityRank(change.after[key]), energyChange: change.energyChange, coached: !!change.coached });
    }
    report.highlights.sort((a,b) => Number(b.coached)-Number(a.coached) || b.gain-a.gain); report.highlights.length = Math.min(3, report.highlights.length);
    report.before = report.changes.map(c => ({ athleteId:c.athleteId, stats:c.before, energy:c.beforeEnergy })); report.after = report.changes.map(c => ({ athleteId:c.athleteId, stats:c.after, energy:c.afterEnergy }));
    if (state.week === 48) rollYear(state,report); else state.week++;
    state.competedThisWeek = []; refreshCards(state); report.monthChanged = beforeMonth !== getCalendar(state).month; state.monthPlanPending = report.monthChanged;
    if (report.monthChanged) report.events.push(getCalendar(state).monthName + 'の育成方針を決めよう。');
    if (getCalendar(state).month === 10 && getCalendar(state).weekOfMonth === 1) report.events.push('10月の中学生スカウトが解禁！ 内定者は来春に入部。');
    const due = MEETS.filter(m => m.week === state.week && !state.completedMeets.includes(m.id)); state.pendingMeet = due[0] ? { ...due[0] } : null; state.pendingMeets = due.slice(1).map(m => ({...m}));
    if (due.length) report.events.push(due.map(m => m.name).join('・') + 'の開催週です。');
    report.lines = report.changes.map(c => c.name + '：' + (c.message || Object.entries(c.statGains).filter(([,gain]) => gain > 0).map(([key,gain]) => STAT_NAMES[key] + ' +' + gain).join(' / '))).concat(report.events);
    report.message = report.events[0] || '今週の積み重ねが、次の記録につながる。'; report.events.forEach(message => addLog(state,message)); report.changes.filter(c => c.injury).forEach(c => addLog(state,c.name + '：' + c.message)); state.lastReport = report;
    return { ok: true, report, meetDue: state.pendingMeet, message: report.message };
  }
  function validateEntries(state, entries) {
    if (!validState(state)) return fail('部のデータを読み込めません。'); if (!state.pendingMeet) return fail('今日は大会当日ではありません。');
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return fail('出場選手を選んでください。');
    const divisions = getMeetEvents(state), keys = divisions.map(d => d.key);
    if (Object.keys(entries).some(key => !keys.includes(key))) return fail('今大会にない種目・男女区分です。');
    const selected = divisions.filter(d => entries[d.key] != null && entries[d.key] !== '').sort((a,b) => !!a.teamSize - !!b.teamSize).map(d => [d.key, entries[d.key]]);
    if (!selected.length) return fail('1種目以上に選手をエントリーしてください。'); const ids = new Set();
    for (const [key, entry] of selected) {
      const division = divisions.find(d => d.key === key), athletes = division.teamSize ? relayAthletes(state,entry) : [state.athletes.find(a => a.id === entry)];
      if (!athletes || athletes.some(a => !a)) return fail(division.teamSize ? 'リレーには同じ性別の異なる4人を選んでください。' : '選手が見つかりません。');
      for (const athlete of athletes) { const status = getEntryStatus(state,athlete,division,state.pendingMeet); if (!status.eligible) return fail(athlete.name + '：' + status.reason); if (!division.teamSize && ids.has(athlete.id)) return fail('1人1個人種目までです。リレーのみ兼任できます。'); if (!division.teamSize) ids.add(athlete.id); }
    }
    return { ok:true, selected };
  }
  function finishMeet(state, meet, results, summary) {
    recordCareerMeet(state, meet, results, summary);
    state.completedMeets.push(meet.id); state.lastMeet = { id: meet.id, name: meet.name, year: state.year, week: state.week, mode: state.career.season.mode, indoor: meet.kind === 'indoor', kind: meet.kind, ...(meet.category ? { category: meet.category } : {}), official: summary.official, results, summary };
    state.history.unshift(JSON.parse(JSON.stringify(state.lastMeet))); state.history.length = Math.min(state.history.length,60); state.pendingMeet = state.pendingMeets.shift() || null; addLog(state,meet.name + '：' + summary.message);
    return { ok:true,results,summary,message:summary.message,meet:state.lastMeet };
  }
  function makeRivals(state,meet,division,field,official) {
    const available=RIVAL_SCHOOLS.filter(school=>school!==state.schoolName),offset=seedValue(state.year+':'+meet.id)%available.length;
    const schools=Array.from({length:field.schools-1},(_,i)=>available[(i+offset)%available.length]);
    const pivot=field.qualifyPlaces||Math.min(8,Math.floor(field.participants/2));
    const topSpread=meet.level===1?13:meet.level===2?10:meet.level===3?8:5;
    const depth=meet.level===1?35:meet.level===2?23:meet.level===3?16:13;
    const cutoff=official?field.cutoffRating:Math.max(60,field.cutoffRating-15);
    return Array.from({length:field.participants-1},(_,i)=>{
      const place=i+1,school=schools[i%schools.length],slot=Math.floor(i/schools.length);
      const rating=cutoff+(place<=pivot?topSpread*(1-place/pivot):-depth*Math.pow((place-pivot)/(field.participants-1-pivot),.85))+(random(state)-.5)*1.2;
      const value=ratingToResult(rating,division.id,division.gender,division.hurdleHeight),nameSeed=seedValue(state.year+':'+school+':'+division.gender);
      const name=division.teamSize?school:LAST_NAMES[(nameSeed+slot)%LAST_NAMES.length]+' '+FIRST_NAMES[division.gender][(nameSeed>>>8)%FIRST_NAMES[division.gender].length];
      return {athleteId:'rival-'+state.year+'-'+division.key+'-'+i,name,school,value,formatted:formatResult(value,division.id),isPlayer:false};
    });
  }
  function runMeet(state, entries, tactic = 'balanced') {
    if (!validState(state)) return fail('部のデータを読み込めません。'); if (!state.pendingMeet) return fail('今日は大会当日ではありません。'); if (!['balanced','aggressive','steady'].includes(tactic)) return fail('作戦が正しくありません。'); const checked = validateEntries(state,entries); if (!checked.ok) return checked;
    ensureCareer(state);
    const meet = MEETS.find(m=>m.id===state.pendingMeet.id), divisions = getMeetEvents(state,meet), results = [], summary = { title: meet.name + ' 結果', message: '', prize: 0, reputation: 0, gold: 0, silver: 0, bronze: 0, qualified: false, stageId: meet.id, official: false };
    if (meet.next) state.qualification[meet.next] = {};
    for (const [key,entry] of checked.selected) {
      const division = divisions.find(d => d.key === key), eventId = division.id, athletes = division.teamSize ? relayAthletes(state,entry) : [state.athletes.find(a => a.id === entry)], athlete = athletes[0];
      const official = athletes.every(a => getEntryStatus(state,a,division,meet).official); summary.official ||= official;
      const mental = athletes.reduce((n,a) => n + a.stats.mental,0) / athletes.length, spread = Math.max(1.1,6.3 - mental * .045) * (tactic === 'steady' ? .38 : tactic === 'aggressive' ? 1.6 : 1) * (athletes.some(a => a.trait === '鉄の心') ? .7 : 1);
      const rating = division.teamSize ? relayRating(athletes,true) : getAthleteRating(athlete,eventId) * readiness(athlete);
      const value = ratingToResult(clamp(rating + (random(state) * 2 - 1) * spread + (tactic === 'aggressive' ? 1.2 : tactic === 'steady' ? -.5 : 0),5,105),eventId,division.gender,division.hurdleHeight);
      const name = division.teamSize ? state.schoolName + ' ' + GENDER_NAMES[division.gender] + 'リレー' : athlete.name;
      const members = division.teamSize ? athletes.map((a,i) => ({athleteId:a.id,name:a.name,color:a.color,gender:a.gender,leg:i+1})) : null;
      const participants = [{athleteId:athlete.id,name,school:state.schoolName,value,formatted:formatResult(value,eventId),isPlayer:true,...(members ? {members,athleteIds:[...entry]} : {})}];
      const field=getMeetField(state,division,meet);
      participants.push(...makeRivals(state,meet,division,field,official));
      participants.sort((a,b) => division.lowerBetter ? a.value-b.value : b.value-a.value); participants.forEach((p,i) => {p.rank = i && p.value === participants[i-1].value ? participants[i-1].rank : i+1;});
      const rank = participants.find(p => p.isPlayer).rank, book = division.teamSize ? state.teamBest[division.gender] : athlete.best, newBest = better(value,book[eventId],eventId); if (newBest) book[eventId] = value;
      const personalBest = !division.teamSize && better(value,athlete.bestBySpec[division.recordKey],eventId);
      if (!division.teamSize) { if (personalBest) athlete.bestBySpec[division.recordKey]=value; if (official) {
        const calendarYear = getCalendar(state).calendarYear, old = athlete.officialBest[division.recordKey];
        athlete.officialRecords ||= {}; const yearly = athlete.officialRecords[division.recordKey] ||= {};
        if (old && old.calendarYear >= calendarYear - 1 && yearly[old.calendarYear] == null) yearly[old.calendarYear] = old.value;
        if (better(value,yearly[calendarYear],eventId)) yearly[calendarYear] = value;
        Object.keys(yearly).forEach(year => { if (Number(year) < calendarYear - 1) delete yearly[year]; });
        athlete.officialBest[division.recordKey] = Object.entries(yearly).map(([year,v]) => ({value:v,calendarYear:Number(year)})).sort((a,b) => division.lowerBetter ? a.value-b.value : b.value-a.value)[0];
      } }
      const qualificationPlaces=official?field.qualifyPlaces:0,qualificationMark=qualificationPlaces?participants[qualificationPlaces-1].value:null;
      const qualified = official && rank <= qualificationPlaces && !!meet.next, medal = official && rank <= 3 ? ['gold','silver','bronze'][rank-1] : null;
      if (medal) {state.medals[medal] = safeAdd(state.medals[medal], 1);summary[medal]++;} if (qualified) { state.qualification[meet.next][key] = division.teamSize ? true : [athlete.id]; summary.qualified = true; }
      const prize = 0; summary.reputation += official ? (rank === 1 ? 4 : rank <=3 ? 2 : 1) * meet.level : 0;
      for (const member of athletes) {member.energy = round(clamp(member.energy - (tactic==='aggressive'?19:tactic==='steady'?10:14),0,100)); member.morale=clamp(member.morale+(rank<=3?6:rank<=5?1:-2),0,100); if (meet.kind !== 'school' && !state.competedThisWeek.includes(member.id)) state.competedThisWeek.push(member.id);}
      results.push({eventId,divisionKey:key,eventName:division.name,name,athleteId:athlete.id,athleteName:name,gender:division.gender,category:division.category,indoor:meet.kind==='indoor',...(division.hurdleHeight?{hurdleHeight:division.hurdleHeight}:{}),value,formatted:formatResult(value,eventId),rank,participants,fieldSize:participants.length,schoolCount:new Set(participants.map(p=>p.school)).size,qualificationPlaces,qualificationMark,qualified,newBest,personalBest,medal,prize,tactic,official,...(members?{members,athleteIds:[...entry]}:{})});
    }
    if (meet.id==='district'&&summary.qualified) state.goal.districtQualified=true; if (meet.id==='prefecture'&&summary.qualified) state.goal.prefectureQualified=true; if (meet.id==='regional'&&summary.qualified) state.goal.nationalsQualified=true;
    if (meet.id==='nationals'&&summary.gold>0) {state.goal.nationalsWon=true;if(state.goal.wonYear==null)state.goal.wonYear=state.year;}
    summary.prize=0; state.reputation=clamp(state.reputation+summary.reputation,0,999);state.spirit=clamp(state.spirit+(summary.qualified||summary.gold?6:-1),15,100);
    summary.message = meet.id==='nationals'&&summary.gold ? 'インターハイ優勝！ 新しい部の歴史に、全国の金メダルを刻んだ。' : summary.qualified ? '通過した選手・リレーが'+MEETS.find(m=>m.id===meet.next).name+'へ！' : !summary.official ? 'オープン記録会で経験を積んだ。記録は参考記録となり、参加標準には使えません。' : summary.gold ? '金メダル獲得！ 次の舞台へつながる大きな一歩。' : '大会を終えました。記録と適性を振り返り、次の目標へ。';
    return finishMeet(state,meet,results,summary);
  }
  function skipMeet(state) { if (!validState(state)) return fail('部のデータを読み込めません。');if(!state.pendingMeet)return fail('今日は大会当日ではありません。');const meet=state.pendingMeet;if(meet.next)state.qualification[meet.next]={};const summary={title:meet.name+' 出場見送り',message:'今大会の出場を見送りました。',prize:0,reputation:0,gold:0,silver:0,bronze:0,qualified:false,stageId:meet.id,official:false,skipped:true};return finishMeet(state,meet,[],summary); }
  function getSummary(state) { const count=state.athletes.length;return {athleteCount:count,boys:state.athletes.filter(a=>a.gender==='boys').length,girls:state.athletes.filter(a=>a.gender==='girls').length,averageEnergy:count?Math.round(state.athletes.reduce((s,a)=>s+a.energy,0)/count):0,averageRating:count?round(state.athletes.reduce((s,a)=>s+getAthleteRating(a,a.event),0)/count):0,totalMedals:Object.values(state.medals).reduce((s,n)=>s+n,0),level:state.reputation>=150?'全国の強豪':state.reputation>=70?'県の注目校':state.reputation>=20?'地区の新鋭':'新設陸上部',seasonGoal:state.goal.nationalsWon?'インターハイ連覇を目指そう':state.goal.nationalsQualified?'インターハイで金メダル':state.goal.prefectureQualified?'地方大会を突破しよう':state.goal.districtQualified?'県大会を突破しよう':'地区予選を突破しよう',nextMeet:getNextMeet(state)}; }
  function validateSave(input) {
    try {
      const d=typeof input==='string'?JSON.parse(input):input,n=(v,min,max,int=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!int||Number.isInteger(v)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),str=(v,max=100)=>typeof v==='string'&&v.length>0&&v.length<=max;
      // JSONB may reorder object keys; compare exact structure while preserving array order.
      const sameValue=(a,b)=>a===b||(a!==null&&b!==null&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)&&(!Array.isArray(a)||a.length===b.length)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.prototype.hasOwnProperty.call(b,key)&&sameValue(a[key],b[key])));
      if(!obj(d)||d.version!==VERSION||!n(d.year,1,MAX_YEAR,true)||!n(d.week,1,48,true)||!n(d.money,0,MAX_COUNT)||!n(d.reputation,0,999)||!n(d.spirit,0,100)||!n(d.rng,1,4294967295,true)||!n(d.nextAthleteId,1,MAX_COUNT,true)||!n(d.totalWeeks,0,MAX_COUNT,true)||!str(d.schoolName,30)||!['easy','normal','hard'].includes(d.intensity))return false;
      if(!obj(d.facilities)||Object.keys(d.facilities).length!==4||!FACILITIES.every(f=>n(d.facilities[f.id],1,5,true)))return false;
      if(d.weekRoute!==undefined&&!validWeekRoute(d.weekRoute))return false;
      if(d.facilityPlan!==undefined&&(!obj(d.facilityPlan)||!n(d.facilityPlan.year,1,d.year,true)||!n(d.facilityPlan.used,0,3,true)))return false;
      const validId=id=>typeof id==='string'&&/^athlete-[1-9][0-9]*$/.test(id)&&n(Number(id.slice(8)),1,MAX_COUNT,true),record=(v,id)=>!!findEvent(id)&&n(v,.01,findEvent(id).unit==='m'?30:1500),spec=key=>{const parts=key.split(':');return !!findEvent(parts[0])&&(parts.length===1?!['110mh','100mh','60mh'].includes(parts[0]):parts.length===2&&['110mh','100mh','60mh'].includes(parts[0])&&['0.762','0.838','0.991','1.067'].includes(parts[1]));};
      const athleteSpec=(key,a)=>{if(!spec(key))return false;const [id,height]=key.split(':'),e=findEvent(id);if(e.teamSize||(e.gender&&e.gender!==a.gender))return false;if(!height)return true;return (a.gender==='boys'?['0.991','1.067']:['0.762','0.838']).includes(height);};
      const validAbilities=s=>obj(s)&&[LEGACY_STAT_KEYS,STAT_KEYS].some(keys=>Object.keys(s).length===keys.length&&keys.every(k=>n(s[k],0,100)));
      const athlete=(a,junior=false)=>obj(a)&&validId(a.id)&&str(a.name,40)&&['boys','girls'].includes(a.gender)&&n(a.grade,junior?0:1,junior?0:3,true)&&n(a.birthMonth,1,12,true)&&n(a.birthYear,START_YEAR+d.year-22,START_YEAR+d.year-12,true)&&a.birthYear===START_YEAR+d.year-1-15-a.grade+(a.birthMonth<=3?1:0)&&INDIVIDUAL_EVENTS.some(e=>e.id===a.event&&(!e.gender||e.gender===a.gender))&&a.specialty===a.event&&str(a.trait,40)&&TRAITS.some(t=>t.name===a.trait)&&str(a.traitDescription,300)&&/^#[0-9a-fA-F]{6}$/.test(a.color)&&n(a.potential,.5,2)&&n(a.energy,0,100)&&n(a.morale,0,100)&&n(a.injury,0,3,true)&&TRAININGS.some(t=>t.id===a.training)&&FOCUSES.some(f=>f.id===a.focus)&&validAbilities(a.stats)&&obj(a.best)&&Object.entries(a.best).every(([id,v])=>record(v,id)&&!findEvent(id).teamSize&&(!findEvent(id).gender||findEvent(id).gender===a.gender))&&obj(a.bestBySpec)&&Object.entries(a.bestBySpec).every(([key,v])=>athleteSpec(key,a)&&record(v,key.split(':')[0]))&&obj(a.officialBest)&&Object.entries(a.officialBest).every(([key,v])=>athleteSpec(key,a)&&obj(v)&&record(v.value,key.split(':')[0])&&n(v.calendarYear,START_YEAR,getCalendar(d).calendarYear,true))&&(a.officialRecords===undefined||(obj(a.officialRecords)&&Object.entries(a.officialRecords).every(([key,years])=>athleteSpec(key,a)&&obj(years)&&Object.entries(years).every(([year,value])=>n(Number(year),START_YEAR,getCalendar(d).calendarYear,true)&&record(value,key.split(':')[0])))));
      if(!Array.isArray(d.athletes)||d.athletes.length<12||d.athletes.length>36||!d.athletes.every(a=>athlete(a))||new Set(d.athletes.map(a=>a.id)).size!==d.athletes.length)return false;
      if(!Array.isArray(d.candidates)||![6,12].includes(d.candidates.length)||!d.candidates.every(a=>athlete(a,true)&&n(a.cost,0,1e6)&&str(a.note,300))||new Set(d.candidates.map(a=>a.id)).size!==d.candidates.length)return false;
      if(!Array.isArray(d.scouted)||d.scouted.length>6||!d.scouted.every(a=>athlete(a,true)&&d.candidates.some(c=>c.id===a.id))||new Set(d.scouted.map(a=>a.id)).size!==d.scouted.length||!Array.isArray(d.recruitedIds)||d.recruitedIds.length!==d.scouted.length||!d.recruitedIds.every(id=>d.scouted.some(a=>a.id===id))||new Set(d.recruitedIds).size!==d.recruitedIds.length)return false;
      if(d.candidates.some(a=>d.athletes.some(b=>b.id===a.id))||Math.max(...d.athletes.concat(d.candidates).map(a=>Number(a.id.slice(8))))>=d.nextAthleteId)return false;
      for(const gender of ['boys','girls'])if(d.scouted.filter(a=>a.gender===gender).length>3)return false;
      if(!obj(d.teamBest)||!['boys','girls'].every(g=>obj(d.teamBest[g])&&Object.entries(d.teamBest[g]).every(([id,v])=>id==='relay'&&record(v,id))))return false;
      if(!obj(d.qualification)||Object.keys(d.qualification).length!==MEETS.length||!MEETS.every(m=>{const q=d.qualification[m.id];if(['district','rookieDistrict'].includes(m.id))return q===true;if(!obj(q))return false;const keys=getMeetEvents(d,m).map(e=>e.key);return Object.entries(q).every(([key,v])=>keys.includes(key)&&(key.endsWith(':relay')?v===true:Array.isArray(v)&&v.length===1&&v.every(id=>validId(id)&&d.athletes.some(a=>a.id===id&&a.gender===key.split(':')[0]))));}))return false;
      if(!Array.isArray(d.completedMeets)||new Set(d.completedMeets).size!==d.completedMeets.length||!d.completedMeets.every(id=>MEETS.some(m=>m.id===id&&m.week<=d.week)))return false;
      if(MEETS.some(m=>m.week<d.week&&!d.completedMeets.includes(m.id)))return false;
      const due=MEETS.filter(m=>m.week===d.week&&!d.completedMeets.includes(m.id));if(!Array.isArray(d.pendingMeets))return false;const queue=d.pendingMeet?[d.pendingMeet,...d.pendingMeets]:d.pendingMeets;if(queue.length!==due.length||queue.some((m,i)=>!obj(m)||Object.entries(due[i]).some(([key,value])=>!['rating','description'].includes(key)&&m[key]!==value)||!n(m.rating,0,120)||!str(m.description,500)))return false;if(!d.pendingMeet&&d.pendingMeets.length)return false;
      if(!Array.isArray(d.competedThisWeek)||new Set(d.competedThisWeek).size!==d.competedThisWeek.length||!d.competedThisWeek.every(id=>d.athletes.some(a=>a.id===id))||typeof d.monthPlanPending!=='boolean')return false;
      if(!Array.isArray(d.practiceCards)||d.practiceCards.length!==3||new Set(d.practiceCards.map(c=>c.id)).size!==3||!d.practiceCards.every(c=>[...PRACTICE_CARDS,...LEGACY_PRACTICE_CARDS].some(ref=>ref.id===c.id&&sameValue(c,ref)))||!d.practiceCards.some(c=>c.id===d.selectedPracticeCard))return false;
      if(!obj(d.medals)||!['gold','silver','bronze'].every(k=>n(d.medals[k],0,MAX_COUNT,true))||!obj(d.goal)||!['districtQualified','prefectureQualified','nationalsQualified','nationalsWon'].every(k=>typeof d.goal[k]==='boolean')||!(d.goal.wonYear===null||n(d.goal.wonYear,1,d.year,true)))return false;
      if(!Array.isArray(d.logs)||d.logs.length>100||!d.logs.every(l=>obj(l)&&n(l.year,1,d.year,true)&&n(l.week,1,48,true)&&str(l.text,500)))return false;
      const validResult=r=>{
        if(!obj(r)||!findEvent(r.eventId)||!(findEvent(r.eventId).gender==null||findEvent(r.eventId).gender===r.gender)||!['boys','girls'].includes(r.gender)||r.divisionKey!==r.gender+':'+r.eventId||!validId(r.athleteId)||!str(r.athleteName,80)||!record(r.value,r.eventId)||typeof r.qualified!=='boolean'||typeof r.newBest!=='boolean'||typeof r.official!=='boolean'||![null,'gold','silver','bronze'].includes(r.medal)||!str(r.formatted,30)||!n(r.prize,0,1e9)||!Array.isArray(r.participants))return false;
        const count=r.participants.length;
        if(!n(count,8,64,true)||!n(r.rank,1,count,true))return false;
        const lower=findEvent(r.eventId).lowerBetter;
        if(!r.participants.every((p,i)=>obj(p)&&str(p.athleteId,100)&&str(p.name,80)&&str(p.school,40)&&record(p.value,r.eventId)&&n(p.rank,1,count,true)&&typeof p.isPlayer==='boolean'&&(i===0?p.rank===1:(lower?p.value>=r.participants[i-1].value:p.value<=r.participants[i-1].value)&&p.rank===(p.value===r.participants[i-1].value?r.participants[i-1].rank:i+1))))return false;
        if(new Set(r.participants.map(p=>p.athleteId)).size!==count||r.participants.filter(p=>p.isPlayer).length!==1||!r.participants.some(p=>p.isPlayer&&p.athleteId===r.athleteId&&p.value===r.value&&p.rank===r.rank))return false;
        if(r.fieldSize===undefined){
          if(count!==8||['schoolCount','qualificationPlaces','qualificationMark'].some(key=>r[key]!==undefined))return false;
        }else{
          if(r.fieldSize!==count||!n(r.schoolCount,1,count,true)||r.schoolCount!==new Set(r.participants.map(p=>p.school)).size||!n(r.qualificationPlaces,0,count,true))return false;
          if(r.qualificationPlaces===0?r.qualificationMark!==null:r.qualificationMark!==r.participants[r.qualificationPlaces-1].value)return false;
          if(r.qualified!==(r.official&&r.qualificationPlaces>0&&r.rank<=r.qualificationPlaces)||r.medal!==(r.official&&r.rank<=3?['gold','silver','bronze'][r.rank-1]:null))return false;
        }
        return r.eventId!=='relay'||(Array.isArray(r.athleteIds)&&r.athleteIds.length===4&&new Set(r.athleteIds).size===4&&r.athleteIds.every(validId)&&Array.isArray(r.members)&&r.members.length===4&&r.members.every((m,i)=>m.athleteId===r.athleteIds[i]&&m.leg===i+1&&str(m.name,40)&&/^#[0-9a-fA-F]{6}$/.test(m.color)&&m.gender===r.gender));
      };
      const validMeet=m=>obj(m)&&MEETS.some(ref=>ref.id===m.id&&ref.week===m.week&&m.indoor===(ref.kind==='indoor')&&m.kind===ref.kind)&&str(m.name,80)&&n(m.year,1,d.year,true)&&Array.isArray(m.results)&&m.results.length<=20&&new Set(m.results.map(r=>r.divisionKey)).size===m.results.length&&m.results.every(r=>validResult(r)&&getMeetEvents(d,m.id).some(div=>div.key===r.divisionKey&&div.name===r.eventName&&div.category===r.category&&div.hurdleHeight===r.hurdleHeight)&&r.indoor===m.indoor)&&obj(m.summary)&&str(m.summary.title,120)&&str(m.summary.message,500)&&['prize','reputation','gold','silver','bronze'].every(k=>n(m.summary[k],0,1e9))&&typeof m.summary.qualified==='boolean'&&typeof m.summary.official==='boolean';
      if(!Array.isArray(d.history)||d.history.length>60||!d.history.every(validMeet)||(d.lastMeet!==null&&!validMeet(d.lastMeet)))return false;
      const validMode=id=>CAREER_MODES.some(mode=>mode.id===id), validGoal=id=>CAREER_GOALS.some(goal=>goal.id===id);
      if([...d.history,...(d.lastMeet?[d.lastMeet]:[])].some(meet=>(meet.mode!==undefined&&!validMode(meet.mode))||(meet.summary.careerReward!==undefined&&!n(meet.summary.careerReward,0,100000,true))||(meet.summary.careerMessage!==undefined&&(typeof meet.summary.careerMessage!=='string'||meet.summary.careerMessage.length>500))||meet.results.some(r=>(r.schoolRecord!==undefined&&typeof r.schoolRecord!=='boolean')||(r.personalBest!==undefined&&typeof r.personalBest!=='boolean'))))return false;
      if(d.career!==undefined){
        const c=d.career, medals=m=>obj(m)&&Object.keys(m).length===3&&['gold','silver','bronze'].every(k=>n(m[k],0,198,true));
        const divisionKey=key=>typeof key==='string'&&['boys','girls'].some(g=>EVENTS.some(e=>(!e.gender||e.gender===g)&&key===g+':'+e.id));
        const uniqueArray=(values,max,valid)=>Array.isArray(values)&&values.length<=max&&new Set(values).size===values.length&&values.every(valid);
        const stats=s=>obj(s)&&['personalBests','interhighEntries','interhighWins','indoorPodiums'].every(k=>n(s[k],0,198,true))&&n(s.meetCount,0,11,true)&&medals(s.medals)&&s.interhighWins<=s.interhighEntries&&uniqueArray(s.podiumDivisions,24,divisionKey)&&uniqueArray(s.relayPodiums,2,g=>['boys','girls'].includes(g))&&s.relayPodiums.every(g=>s.podiumDivisions.includes(g+':relay'));
        if(!obj(c)||c.version!==1||!n(c.startedYear,1,d.year,true)||typeof c.migrated!=='boolean'||!obj(c.season)||c.season.year!==d.year||!validGoal(c.season.goalId)||!validMode(c.season.mode)||!stats(c.season.stats)||typeof c.season.goalRewarded!=='boolean'||!(c.season.goalRewarded?n(c.season.goalAchievedWeek,1,d.week,true)&&careerGoalProgress(c.season).achieved:c.season.goalAchievedWeek===null))return false;
        const lifetime=c.lifetime;
        if(!obj(lifetime)||!['completedSeasons','goalsAchieved','interhighTitles','currentStreak','bestStreak','graduates'].every(k=>n(lifetime[k],0,MAX_COUNT,true))||lifetime.completedSeasons!==d.year-1||lifetime.goalsAchieved>d.year||lifetime.interhighTitles>d.year||lifetime.currentStreak>lifetime.bestStreak||lifetime.bestStreak>lifetime.interhighTitles||!(lifetime.lastTitleYear===null?lifetime.interhighTitles===0:n(lifetime.lastTitleYear,1,d.year,true)&&lifetime.interhighTitles>0))return false;
        const schoolRecord=r=>{
          if(!obj(r)||!str(r.key,60)||!str(r.recordKey,40)||!findEvent(r.eventId)||!['boys','girls'].includes(r.gender)||r.key!==r.gender+':'+r.recordKey||r.recordKey!==getRecordKey(r.eventId,r.hurdleHeight)||!record(r.value,r.eventId)||!validId(r.athleteId)||!str(r.athleteName,80)||!n(r.year,1,d.year,true)||!n(r.week,1,r.year===d.year?d.week:48,true)||!validMode(r.mode))return false;
          const meet=MEETS.find(m=>m.id===r.meetId);if(!meet||meet.name!==r.meetName||meet.week!==r.week||!getMeetEvents(d,meet).some(div=>div.key===r.gender+':'+r.eventId&&div.recordKey===r.recordKey&&div.hurdleHeight===r.hurdleHeight))return false;
          if(r.eventId==='relay')return uniqueArray(r.athleteIds,4,validId)&&r.athleteIds.length===4&&r.athleteId===r.athleteIds[0]&&Array.isArray(r.members)&&r.members.length===4&&r.members.every((m,i)=>obj(m)&&m.athleteId===r.athleteIds[i]&&str(m.name,40)&&m.gender===r.gender&&m.leg===i+1&&/^#[0-9a-fA-F]{6}$/.test(m.color));
          return r.members===undefined&&r.athleteIds===undefined;
        };
        if(!Array.isArray(c.schoolRecords)||c.schoolRecords.length>40||new Set(c.schoolRecords.map(r=>r.key)).size!==c.schoolRecords.length||!c.schoolRecords.every(schoolRecord))return false;
        const alumnus=a=>obj(a)&&validId(a.id)&&!d.athletes.some(active=>active.id===a.id)&&str(a.name,40)&&['boys','girls'].includes(a.gender)&&INDIVIDUAL_EVENTS.some(e=>e.id===a.event&&(!e.gender||e.gender===a.gender))&&TRAITS.some(t=>t.name===a.trait)&&/^#[0-9a-fA-F]{6}$/.test(a.color)&&n(a.graduationYear,1,d.year-1,true)&&validAbilities(a.stats)&&obj(a.bestBySpec)&&Object.entries(a.bestBySpec).every(([key,value])=>athleteSpec(key,a)&&record(value,key.split(':')[0]));
        if(!Array.isArray(c.alumni)||c.alumni.length>60||new Set(c.alumni.map(a=>a.id)).size!==c.alumni.length||!c.alumni.every(alumnus)||c.alumni.some((a,i)=>i>0&&a.graduationYear>c.alumni[i-1].graduationYear))return false;
        const season=s=>obj(s)&&n(s.year,1,d.year-1,true)&&validMode(s.mode)&&typeof s.partial==='boolean'&&(s.partial?s.goalId===null:validGoal(s.goalId))&&typeof s.achieved==='boolean'&&n(s.reward,0,100000,true)&&(s.achieved?!s.partial&&[0,CAREER_GOALS.find(g=>g.id===s.goalId).reward].includes(s.reward):s.reward===0)&&medals(s.medals)&&n(s.personalBests,0,198,true)&&n(s.meetCount,0,11,true)&&n(s.interhighWins,0,18,true);
        if(!Array.isArray(c.seasons)||c.seasons.length>30||new Set(c.seasons.map(s=>s.year)).size!==c.seasons.length||!c.seasons.every(season)||c.seasons.some((s,i)=>i>0&&s.year>=c.seasons[i-1].year))return false;
      }
      if(d.facilityPlan?.year===d.year&&d.facilityPlan.used>2+(d.career?.season.goalRewarded?1:0))return false;
      if(d.lastReport!=null){
        const r=d.lastReport,change=c=>obj(c)&&validId(c.athleteId)&&str(c.name,40)&&str(c.training,40)&&TRAININGS.some(t=>t.id===c.trainingId)&&FOCUSES.some(f=>f.id===c.focus)&&obj(c.statGains)&&Object.entries(c.statGains).every(([key,gain])=>STAT_KEYS.includes(key)&&n(gain,0,100))&&n(c.energyChange,-100,100)&&n(c.injury,0,3,true)&&typeof c.message==='string'&&c.message.length<=500&&(c.before===undefined||validAbilities(c.before))&&(c.after===undefined||validAbilities(c.after))&&(c.coached===undefined||typeof c.coached==='boolean');
        if(!obj(r)||!str(r.title,100)||!Array.isArray(r.changes)||r.changes.length>36||!r.changes.every(change)||!Array.isArray(r.events)||!r.events.every(s=>typeof s==='string')||!Array.isArray(r.lines)||!r.lines.every(s=>typeof s==='string'))return false;
      }
      if(d.lastReport?.route!==undefined){
        const r=d.lastReport,abilityChange=c=>obj(c)&&validId(c.athleteId)&&str(c.name,40)&&STAT_KEYS.includes(c.key)&&n(c.before,0,100)&&n(c.after,c.before,100);
        if(!validWeekRoute(r.route)||!['balanced','push','care'].includes(r.decision)||!str(r.decisionText,80)||!(r.coachedAthleteId===null||validId(r.coachedAthleteId)))return false;
        if(!Array.isArray(r.rankUps)||r.rankUps.length>324||!r.rankUps.every(c=>abilityChange(c)&&c.from===getAbilityRank(c.before)&&c.to===getAbilityRank(c.after)&&c.from!==c.to))return false;
        if(!Array.isArray(r.highlights)||r.highlights.length>3||!r.highlights.every(c=>abilityChange(c)&&str(c.label,30)&&n(c.gain,0,100)&&c.rankBefore===getAbilityRank(c.before)&&c.rankAfter===getAbilityRank(c.after)&&n(c.energyChange,-100,100)&&typeof c.coached==='boolean'))return false;
        if(!['before','after'].every(key=>Array.isArray(r[key])&&r[key].length<=36&&r[key].every(a=>obj(a)&&validId(a.athleteId)&&validAbilities(a.stats)&&n(a.energy,0,100))))return false;
        if(r.changes.length>36||!r.changes.every(c=>obj(c)&&validId(c.athleteId)&&validAbilities(c.before)&&validAbilities(c.after)&&n(c.beforeEnergy,0,100)&&n(c.afterEnergy,0,100)))return false;
      }
      return true;
    }catch(_){return false;}
  }
  const api={WEEK_BLOCKS,getWeekJourney,setWeekRoute,getStat,getAbilityRank,getFacilityPlan,VERSION,START_YEAR,EVENTS,INDIVIDUAL_EVENTS,RELAY_LEGS,TRAININGS,FOCUSES,PRACTICE_CARDS,FACILITIES,MEETS,STAT_KEYS,STAT_NAMES,GENDER_NAMES,INDOOR_STANDARDS,CAREER_GOALS,CAREER_MODES,createGame,getCalendar,getSchedule,getNextMeet,getMeetEvents,getMeetField,getEntryStatus,getEligibleAthletes,getRecordKey,getAge,advanceWeek,setTraining,setFocus,confirmMonthlyPlan,choosePracticeCard,setIntensity,upgradeFacility,recruitAthlete,scoutAthlete,getCandidates,runMeet,skipMeet,validateEntries,getAthleteRating,getSuitability,getRelayRating,predictResult,predictRelayResult,getDefaultTraining,formatResult,getFacilityCost,getSummary,validateSave,getCareer,chooseSeasonGoal,setSeasonMode};
  for(const name of ['setTraining','setFocus','confirmMonthlyPlan','choosePracticeCard','setIntensity','upgradeFacility','recruitAthlete','scoutAthlete']) { const action=api[name];api[name]=(state,...args)=>{const result=action(state,...args);if(result.ok)ensureCareer(state);return result;}; }
  root.TrackGame=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
