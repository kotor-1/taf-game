/* 青葉高校 陸上部 — deterministic school-club simulation, April–March. */
(function (root) {
  'use strict';
  const VERSION = 2;
  const START_YEAR = 2026;
  const STAT_KEYS = ['speed', 'stamina', 'power', 'technique', 'agility', 'flexibility', 'mental'];
  const STAT_NAMES = { speed: 'スピード', stamina: '持久力', power: 'パワー', technique: '技術', agility: '敏捷性', flexibility: '柔軟性', mental: '精神力' };
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
  const RELAY_LEGS = [
    { speed: .35, power: .20, technique: .25, agility: .15, mental: .05 },
    { speed: .65, power: .20, technique: .05, agility: .05, mental: .05 },
    { speed: .35, power: .15, technique: .25, agility: .20, mental: .05 },
    { speed: .50, power: .15, technique: .10, agility: .05, mental: .20 }
  ];
  const FOCUSES = STAT_KEYS.map(id => ({ id, name: STAT_NAMES[id], description: STAT_NAMES[id] + 'を重点的に伸ばす。' })).concat({ id: 'balanced', name: 'バランス', description: '7つの能力を少しずつ伸ばす。' });
  const TRAININGS = [
    { id: 'sprint', name: '短距離', description: 'スピード・パワー・敏捷性。', stats: { speed: .55, power: .25, agility: .20 }, fatigue: 12 },
    { id: 'endurance', name: '持久走', description: '持久力・精神力。', stats: { stamina: .65, mental: .25, speed: .10 }, fatigue: 13 },
    { id: 'power', name: '筋力', description: 'パワー・柔軟性。', stats: { power: .65, flexibility: .20, speed: .15 }, fatigue: 12 },
    { id: 'technique', name: '技術', description: '技術・敏捷性。', stats: { technique: .60, agility: .25, mental: .15 }, fatigue: 10 },
    { id: 'hurdles', name: 'ハードル', description: '技術・敏捷性・柔軟性。', stats: { technique: .35, agility: .30, flexibility: .25, speed: .10 }, fatigue: 12 },
    { id: 'jump', name: '跳躍', description: 'パワー・技術・柔軟性。', stats: { power: .35, technique: .35, flexibility: .30 }, fatigue: 11 },
    { id: 'relay', name: 'リレー', description: 'スピード・技術・精神力。', stats: { speed: .40, technique: .40, mental: .20 }, fatigue: 10 },
    { id: 'balanced', name: '総合', description: '全能力を均等に育てる。', stats: Object.fromEntries(STAT_KEYS.map(key => [key, .15])), fatigue: 11 },
    { id: 'rest', name: '休養', description: '今週は重点育成を休み、体力と意欲を回復。', stats: { mental: .10 }, fatigue: -34 }
  ];
  const PRACTICE_CARDS = [
    { id: 'basic', name: '基礎を積み重ねる', description: '成長と疲労が標準。地道な反復練習。', growth: 1, fatigue: 1, cost: 0, stats: {} },
    { id: 'technical', name: 'フォーム研究', description: '技術 +0.35、敏捷性 +0.15。疲労は控えめ。', growth: .95, fatigue: .85, cost: 0, stats: { technique: .35, agility: .15 } },
    { id: 'condition', name: '積極的休養', description: '成長は60%。全員の体力を12回復。', growth: .60, fatigue: .30, recovery: 12, cost: 0, stats: { flexibility: .30 } },
    { id: 'teamwork', name: 'バトンをつなぐ', description: '技術・精神力 +0.25、部の士気 +4。', growth: .95, fatigue: .85, spirit: 4, cost: 0, stats: { technique: .25, mental: .25 } },
    { id: 'camp', name: '集中強化練習', description: '成長130%、疲労125%。部費8,000円。', growth: 1.30, fatigue: 1.25, cost: 8000, stats: { power: .20 } },
    { id: 'mobility', name: '動きづくり', description: '敏捷性・柔軟性 +0.35。疲労80%。', growth: .95, fatigue: .80, cost: 0, stats: { agility: .35, flexibility: .35 } }
  ];
  const FACILITIES = [
    { id: 'track', name: 'トラック', description: '短距離・持久走・ハードル・リレーの練習効果が12%ずつ上昇。', baseCost: 65000 },
    { id: 'gym', name: 'トレーニング室', description: '筋力・技術・跳躍の練習効果が12%ずつ上昇。', baseCost: 55000 },
    { id: 'recovery', name: 'ケア設備', description: '毎週の疲労を軽減し、休養の回復量を増やす。', baseCost: 45000 },
    { id: 'club', name: '部室', description: '週間収入と練習意欲、全員の成長を後押し。', baseCost: 75000 }
  ];
  const MEETS = [
    { id: 'district', name: 'インターハイ 地区予選', week: 5, dateLabel: '5月1週', kind: 'school', level: 1, rating: 55, prize: 14000, next: 'prefecture', description: '男女・種目別に3位以内の選手が県大会へ。' },
    { id: 'prefecture', name: 'インターハイ 県大会', week: 7, dateLabel: '5月3週', kind: 'school', level: 2, rating: 65, prize: 22000, next: 'regional', description: '地区予選を通過した選手が競う。3位以内で地方大会へ。' },
    { id: 'regional', name: 'インターハイ 地方大会', week: 11, dateLabel: '6月3週・中旬', kind: 'school', level: 3, rating: 75, prize: 35000, next: 'nationals', description: '県大会を通過した選手が競う。3位以内でインターハイへ。' },
    { id: 'nationals', name: 'インターハイ', week: 16, dateLabel: '7月4週・月末', kind: 'school', level: 4, rating: 86, prize: 60000, description: '高校陸上の頂点。ここでの優勝が部の大きな目標。' },
    { id: 'rookieDistrict', name: '新人戦 地区予選', week: 21, dateLabel: '9月1週・上旬', kind: 'school', rookie: true, level: 1, rating: 55, prize: 14000, next: 'rookiePrefecture', description: '1・2年生の大会。男女・種目別3位以内で県大会へ。' },
    { id: 'rookiePrefecture', name: '新人戦 県大会', week: 23, dateLabel: '9月3週', kind: 'school', rookie: true, level: 2, rating: 66, prize: 22000, next: 'rookieRegional', description: '1・2年生の県大会。3位以内で地方大会へ。' },
    { id: 'rookieRegional', name: '新人戦 地方大会', week: 25, dateLabel: '10月1週', kind: 'school', rookie: true, level: 3, rating: 77, prize: 35000, description: '来年のインターハイにつながる秋の大舞台。' },
    { id: 'u18nationals', name: 'U18日本選手権', week: 27, dateLabel: '10月3週', kind: 'championship', category: 'U18', minAge: 16, maxAge: 17, level: 4, rating: 87, prize: 50000, description: '暦年で16・17歳。ゲーム独自の参加標準記録が必要。男女ハードルはU18規格。' },
    { id: 'u20nationals', name: 'U20日本選手権', week: 27, dateLabel: '10月3週', kind: 'championship', category: 'U20', minAge: 16, maxAge: 19, level: 4, rating: 91, prize: 60000, description: '暦年で16〜19歳。ゲーム独自の参加標準記録が必要。同週のU18との重複出場不可。' },
    { id: 'indoorU18', name: 'U18室内日本選手権', week: 41, dateLabel: '2月1週', kind: 'indoor', category: 'U18', minAge: 16, maxAge: 17, level: 4, rating: 88, prize: 50000, description: '2025年大阪室内の種目・年齢区分・標準記録を参照した再現大会。' },
    { id: 'indoorU20', name: 'U20室内日本選手権', week: 41, dateLabel: '2月1週', kind: 'indoor', category: 'U20', minAge: 18, maxAge: 19, level: 4, rating: 93, prize: 60000, description: '2025年大阪室内を参照。女子棒高跳・男女三段跳はU18選手も出場可能。' }
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
  const RIVAL_SCHOOLS = ['北陵高校', '桜丘高校', '西原高校', '朝日学院', '東雲高校', '白河学園', '城南高校'];
  const GENDER_NAMES = { boys: '男子', girls: '女子' };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const round = (v, places = 1) => Number(v.toFixed(places));
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
  function getAthleteRating(athlete, eventId) { const event = findEvent(eventId); return !event || !athlete?.stats ? 0 : round(Object.entries(event.weights).reduce((sum, [key, weight]) => sum + (Number(athlete.stats[key]) || 0) * weight, 0)); }
  function getSuitability(athlete) { return INDIVIDUAL_EVENTS.filter(e => !e.gender || e.gender === athlete.gender).map(event => { const rating = getAthleteRating(athlete, event.id); return { eventId: event.id, name: event.name, rating, rank: rating >= 90 ? 'S' : rating >= 80 ? 'A' : rating >= 70 ? 'B' : rating >= 60 ? 'C' : rating >= 50 ? 'D' : rating >= 40 ? 'E' : 'F', description: event.description }; }).sort((a, b) => b.rating - a.rating); }
  function makeAthlete(state, options = {}) {
    const serial = state.nextAthleteId++, gender = options.gender || (serial % 2 ? 'boys' : 'girls'), grade = options.grade ?? 1;
    const pool = INDIVIDUAL_EVENTS.filter(e => !e.gender || e.gender === gender), eventId = options.event || pool[Math.floor(random(state) * pool.length)].id;
    const event = findEvent(eventId), trait = options.trait || TRAITS[Math.floor(random(state) * TRAITS.length)], base = options.base ?? 34 + random(state) * 8 + Math.min(state.reputation, 100) * .08;
    const stats = Object.fromEntries(STAT_KEYS.map(key => [key, round(clamp(base + (event.weights[key] || 0) * 62 + random(state) * 7, 20, 88))]));
    const birthMonth = options.birthMonth || 1 + Math.floor(random(state) * 12);
    const athlete = { id: 'athlete-' + serial, name: options.name || LAST_NAMES[Math.floor(random(state) * LAST_NAMES.length)] + ' ' + FIRST_NAMES[gender][Math.floor(random(state) * FIRST_NAMES[gender].length)], gender, grade, birthMonth, birthYear: START_YEAR + state.year - 1 - 15 - grade + (birthMonth <= 3 ? 1 : 0), trait: trait.name, traitDescription: trait.description, event: eventId, specialty: eventId, stats: options.stats || stats, energy: 100, morale: 80, injury: 0, training: getDefaultTraining(eventId), focus: Object.entries(event.weights).sort((a,b) => b[1] - a[1])[0][0], best: {}, bestBySpec: {}, officialBest: {}, officialRecords: {}, color: COLORS[(serial - 1) % COLORS.length], potential: round(.90 + random(state) * .28, 2), form: 1 };
    return athlete;
  }
  function generateCandidates(state) {
    return ['boys', 'girls'].flatMap(gender => [0, 1, 2].map(index => {
      const athlete = makeAthlete(state, { gender, grade: 0, base: 40 + index * 4 + Math.min(state.reputation, 100) * .10 });
      athlete.cost = 24000 + index * 14000; athlete.note = ['中学の地区大会で活躍。伸びしろに期待。', '中学県大会の経験者。得意種目を伸ばしたい。', '中学地方大会の注目株。新しい部で全国へ。'][index]; return athlete;
    }));
  }
  function refreshCards(state) {
    const pool = PRACTICE_CARDS.filter(c => c.id !== 'basic');
    const a = pool.splice(Math.floor(random(state) * pool.length), 1)[0], b = pool.splice(Math.floor(random(state) * pool.length), 1)[0];
    state.practiceCards = [PRACTICE_CARDS[0], a, b].map(card => ({ ...card, stats: { ...card.stats } })); state.selectedPracticeCard = 'basic';
  }
  function freshQualification() { return Object.fromEntries(MEETS.map(meet => [meet.id, ['district', 'rookieDistrict'].includes(meet.id) ? true : {}])); }
  function createGame(seed) {
    const state = { version: VERSION, year: 1, week: 1, money: 180000, reputation: 0, spirit: 70, intensity: 'normal', athletes: [], facilities: { track: 1, gym: 1, recovery: 1, club: 1 }, logs: [], history: [], medals: { gold: 0, silver: 0, bronze: 0 }, teamBest: { boys: {}, girls: {} }, schoolName: '青葉高校', rng: seedValue(seed), nextAthleteId: 1, recruitedIds: [], candidates: [], scouted: [], qualification: freshQualification(), completedMeets: [], pendingMeet: null, pendingMeets: [], lastMeet: null, competedThisWeek: [], monthPlanPending: true, practiceCards: [], selectedPracticeCard: 'basic', goal: { districtQualified: false, prefectureQualified: false, nationalsQualified: false, nationalsWon: false, wonYear: null }, totalWeeks: 0 };
    const names = { boys: ['橘 翔太', '宮本 陸', '田辺 悠', '北村 蓮', '藤原 湊', '遠藤 大和'], girls: ['水野 葵', '桜井 凛', '小川 美咲', '高橋 結衣', '森 陽菜', '石川 紬'] };
    for (const gender of ['boys', 'girls']) ['100m', '400m', '1500m', gender === 'boys' ? '110mh' : '100mh', 'longjump', 'highjump'].forEach((event, i) => state.athletes.push(makeAthlete(state, { gender, event, name: names[gender][i], base: 37 + (i % 3) * 2, birthMonth: [5, 8, 1, 10, 3, 7][i] })));
    state.candidates = generateCandidates(state); refreshCards(state);
    addLog(state, '新設・青葉高校陸上部、始動！ 1年生の男子6名・女子6名で、5月1週の地区予選を目指す。');
    return state;
  }
  function getSchedule() { return MEETS.map(meet => ({ ...meet })); }
  function getNextMeet(state) {
    const meet = state.pendingMeet || MEETS.find(m => m.week >= state.week && !state.completedMeets.includes(m.id));
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
  function readiness(athlete) { return (.86 + clamp(athlete.energy, 0, 100) * .0014) * (.96 + clamp(athlete.morale, 0, 100) * .0005) * (athlete.injury > 0 ? .76 : 1); }
  function ratingToResult(rating, eventId, gender = 'boys', hurdleHeight) {
    const girl = gender === 'girls';
    const formulas = { '100m': () => (girl ? 17.8 : 16.2) - rating * .062, '400m': () => (girl ? 87 : 77) - rating * .32, '1500m': () => (girl ? 445 : 395) - rating * (girl ? 1.55 : 1.5), longjump: () => (girl ? 1.9 : 2.5) + rating * (girl ? .045 : .053), '110mh': () => 23.6 - rating * .102 + (hurdleHeight === 1.067 ? .25 : 0), '100mh': () => 23.9 - rating * .101 + (hurdleHeight === .838 ? .20 : 0), highjump: () => (girl ? .65 : .85) + rating * (girl ? .013 : .014), polevault: () => (girl ? .65 : .80) + rating * (girl ? .037 : .047), triplejump: () => (girl ? 5.8 : 7.0) + rating * (girl ? .072 : .092), relay: () => (girl ? 73 : 64) - rating * .245, '60m': () => (girl ? 11.10 : 10) - rating * .032, '60mh': () => (girl ? 12.90 : 12.3) - rating * .047 };
    return formulas[eventId] ? round(formulas[eventId](), eventId === '1500m' ? 1 : 2) : 0;
  }
  function predictResult(athlete, eventId, division) { const height = division?.hurdleHeight ?? (eventId === '110mh' ? 1.067 : eventId === '100mh' ? .838 : eventId === '60mh' ? athlete.gender === 'boys' ? .991 : .838 : undefined); return ratingToResult(getAthleteRating(athlete, eventId) * readiness(athlete), eventId, athlete.gender, height); }
  function relayAthletes(state, ids) { if (!Array.isArray(ids) || ids.length !== 4 || new Set(ids).size !== 4) return null; const athletes = ids.map(id => state.athletes.find(a => a.id === id)); return athletes.some(a => !a || a.injury > 0) || new Set(athletes.map(a => a.gender)).size !== 1 ? null : athletes; }
  function relayRating(athletes, useReadiness) { return !Array.isArray(athletes) || athletes.length !== 4 || athletes.some(a => !a?.stats) ? null : athletes.reduce((sum, a, i) => sum + Object.entries(RELAY_LEGS[i]).reduce((n,[key,w]) => n + a.stats[key] * w, 0) * (useReadiness ? readiness(a) : 1), 0) / 4; }
  function getRelayRating(athletes) { const rating = relayRating(athletes, false); return rating == null ? null : round(rating); }
  function predictRelayResult(state, ids) { const athletes = relayAthletes(state, ids); return athletes ? ratingToResult(relayRating(athletes, true), 'relay', athletes[0].gender) : null; }
  function formatResult(value, eventId) { if (!Number.isFinite(value)) return '—'; if (findEvent(eventId)?.unit === 'm') return value.toFixed(2) + 'm'; if (eventId === '1500m') { const tenth = Math.round(value * 10); return Math.floor(tenth / 600) + ':' + ((tenth % 600) / 10).toFixed(1).padStart(4, '0'); } return value.toFixed(2) + '秒'; }
  function setFocus(state, athleteId, focusId) { const athlete = validState(state) && state.athletes.find(a => a.id === athleteId); if (!athlete || !FOCUSES.some(f => f.id === focusId)) return fail('育成方針が正しくありません。'); athlete.focus = focusId; return { ok: true, message: athlete.name + 'の重点育成を' + (STAT_NAMES[focusId] || 'バランス') + 'にしました。' }; }
  function confirmMonthlyPlan(state) { if (!validState(state)) return fail('部のデータを読み込めません。'); state.monthPlanPending = false; const message = getCalendar(state).monthName + 'の育成方針を決定しました。'; addLog(state, message); return { ok: true, message }; }
  function setTraining(state, athleteId, trainingId) { const athlete = validState(state) && state.athletes.find(a => a.id === athleteId); if (!athlete || !TRAININGS.some(t => t.id === trainingId)) return fail('選手または練習メニューが見つかりません。'); athlete.training = trainingId; return { ok: true, message: athlete.name + 'の練習を変更しました。' }; }
  function setIntensity(state, intensity) { if (!validState(state) || !['easy','normal','hard'].includes(intensity)) return fail('練習強度が正しくありません。'); state.intensity = intensity; return { ok: true, message: '練習強度を変更しました。' }; }
  function choosePracticeCard(state, cardId) { if (!validState(state)) return fail('部のデータを読み込めません。'); const card = state.practiceCards.find(c => c.id === cardId); if (!card) return fail('今週はこの練習カードを選べません。'); if (state.money < card.cost) return fail('部費が足りません。'); state.selectedPracticeCard = cardId; return { ok: true, message: '今週は「' + card.name + '」。' }; }
  function getFacilityCost(state, facilityId) { const f = FACILITIES.find(f => f.id === facilityId); if (!f || !state.facilities) return null; const level = state.facilities[facilityId]; return level >= 5 ? null : Math.round(f.baseCost * 1.6 ** (level - 1) / 1000) * 1000; }
  function upgradeFacility(state, facilityId) { if (!validState(state)) return fail('部のデータを読み込めません。'); const f = FACILITIES.find(f => f.id === facilityId); if (!f) return fail('設備が見つかりません。'); const cost = getFacilityCost(state, facilityId); if (cost == null) return fail('この設備は最高レベルです。'); if (state.money < cost) return fail('部費が足りません。'); state.money -= cost; state.facilities[facilityId]++; const message = f.name + 'がLv.' + state.facilities[facilityId] + 'になりました。'; addLog(state,message); return { ok:true,message,cost }; }
  function getCandidates(state) { return getCalendar(state).month === 10 ? state.candidates.filter(a => !state.recruitedIds.includes(a.id)) : []; }
  function scoutAthlete(state, candidateId) {
    if (!validState(state)) return fail('部のデータを読み込めません。');
    if (getCalendar(state).month !== 10) return fail('中学生のスカウトは10月に行えます。');
    const candidate = getCandidates(state).find(a => a.id === candidateId); if (!candidate) return fail('この選手はスカウトできません。');
    if (state.scouted.filter(a => a.gender === candidate.gender).length >= 3) return fail('スカウト内定は男女それぞれ3人までです。');
    if (state.money < candidate.cost) return fail('スカウトの部費が足りません。');
    state.money -= candidate.cost; state.recruitedIds.push(candidate.id); const athlete = JSON.parse(JSON.stringify(candidate)); state.scouted.push(athlete);
    const message = athlete.name + 'が入部内定！ 翌年4月に1年生として合流します。'; addLog(state,message); return { ok:true,message,athlete };
  }
  const recruitAthlete = scoutAthlete;
  function trainAthlete(state, athlete, card) {
    const before = athlete.energy, training = TRAININGS.find(t => t.id === athlete.training);
    const change = { athleteId: athlete.id, name: athlete.name, training: training.name, trainingId: training.id, focus: athlete.focus, statGains: {}, energyChange: 0, injury: 0, message: '' };
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
    change.energyChange = round(athlete.energy - before); return change;
  }
  function rollYear(state, report) {
    report.graduated = state.athletes.filter(a => a.grade === 3).map(a => a.name);
    state.athletes = state.athletes.filter(a => a.grade < 3); state.athletes.forEach(a => { a.grade++; a.energy = 100; a.injury = 0; a.morale = Math.max(a.morale, 80); });
    state.year++; state.week = 1; state.qualification = freshQualification(); state.completedMeets = []; state.pendingMeet = null; state.pendingMeets = []; state.competedThisWeek = []; report.newcomers = [];
    for (const gender of ['boys','girls']) {
      const committed = state.scouted.filter(a => a.gender === gender);
      for (let i = 0; i < 6; i++) { const athlete = committed[i] ? JSON.parse(JSON.stringify(committed[i])) : makeAthlete(state,{gender}); athlete.grade = 1; athlete.energy = 100; athlete.morale = 85; athlete.injury = 0; delete athlete.cost; delete athlete.note; state.athletes.push(athlete); report.newcomers.push(athlete); }
    }
    state.scouted = []; state.recruitedIds = []; state.candidates = generateCandidates(state);
    const grant = 110000 + state.reputation * 200; state.money += grant; report.income += grant; report.balance += grant; state.spirit = clamp(state.spirit + 8, 0, 100);
    if (report.graduated.length) report.events.push(report.graduated.length + '人が卒業。先輩の記録と思いを受け継ごう。');
    report.events.push('新年度！ 男子6名・女子6名の新入生が合流。活動補助金' + grant.toLocaleString('ja-JP') + '円。');
  }
  function advanceWeek(state) {
    if (!validState(state)) return fail('部のデータを読み込めません。');
    if (state.pendingMeet) return fail('大会当日です。出場または見送りで大会を終えてください。');
    if (state.monthPlanPending) return fail('月初です。全員の月間育成方針を確認・決定してください。');
    const card = state.practiceCards.find(c => c.id === state.selectedPracticeCard); if (!card || state.money < card.cost) return fail('選んだ練習カードの部費が足りません。');
    const beforeMonth = getCalendar(state).month, report = { title: '今週の練習報告', weekLabel: getCalendar(state).label, cardName: card.name, changes: [], income: 0, expenses: card.cost, balance: 0, events: [], graduated: [], newcomers: [], lines: [], monthChanged: false };
    report.changes = state.athletes.map(a => trainAthlete(state,a,card));
    report.income = Math.round(12500 + state.reputation * 55 + state.facilities.club * 2000); report.expenses += 2400 + state.athletes.length * 290 + Object.values(state.facilities).reduce((s,l) => s + l, 0) * 450;
    report.balance = report.income - report.expenses; state.money = Math.max(0,state.money + report.balance); state.totalWeeks++; state.spirit = round(clamp(state.spirit + (card.spirit || 0) + (state.intensity === 'hard' ? -.5 : .5), 15, 100));
    if (random(state) < .13) { const type = Math.floor(random(state) * 3); if (type === 0) { state.money += 12000; report.income += 12000; report.balance += 12000; report.events.push('地域の応援で活動支援！ 部費 +12,000円。'); } else if (type === 1) { state.spirit = clamp(state.spirit + 6, 0, 100); report.events.push('仲間同士で励まし合う。チームの士気 +6。'); } else { state.athletes.forEach(a => { a.energy = clamp(a.energy + 7, 0, 100); }); report.events.push('保護者からお弁当の差し入れ。全員の体力 +7。'); } }
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
    state.completedMeets.push(meet.id); state.lastMeet = { id: meet.id, name: meet.name, year: state.year, week: state.week, indoor: meet.kind === 'indoor', kind: meet.kind, ...(meet.category ? { category: meet.category } : {}), official: summary.official, results, summary };
    state.history.unshift(JSON.parse(JSON.stringify(state.lastMeet))); state.history.length = Math.min(state.history.length,60); state.pendingMeet = state.pendingMeets.shift() || null; addLog(state,meet.name + '：' + summary.message);
    return { ok:true,results,summary,message:summary.message,meet:state.lastMeet };
  }
  function runMeet(state, entries, tactic = 'balanced') {
    if (!validState(state)) return fail('部のデータを読み込めません。'); if (!state.pendingMeet) return fail('今日は大会当日ではありません。'); if (!['balanced','aggressive','steady'].includes(tactic)) return fail('作戦が正しくありません。'); const checked = validateEntries(state,entries); if (!checked.ok) return checked;
    const meet = state.pendingMeet, divisions = getMeetEvents(state,meet), results = [], summary = { title: meet.name + ' 結果', message: '', prize: 0, reputation: 0, gold: 0, silver: 0, bronze: 0, qualified: false, stageId: meet.id, official: false };
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
      for (let i=0;i<7;i++) { const r = (official ? meet.rating : Math.max(48,meet.rating-13)) + (i-3)*2 + (random(state)-.5)*5, v = ratingToResult(r,eventId,division.gender,division.hurdleHeight); participants.push({athleteId:'rival-'+i,name:RIVAL_SCHOOLS[i],school:RIVAL_SCHOOLS[i],value:v,formatted:formatResult(v,eventId),isPlayer:false}); }
      participants.sort((a,b) => division.lowerBetter ? a.value-b.value : b.value-a.value); participants.forEach((p,i) => {p.rank = i && p.value === participants[i-1].value ? participants[i-1].rank : i+1;});
      const rank = participants.find(p => p.isPlayer).rank, book = division.teamSize ? state.teamBest[division.gender] : athlete.best, newBest = better(value,book[eventId],eventId); if (newBest) book[eventId] = value;
      if (!division.teamSize) { if (better(value,athlete.bestBySpec[division.recordKey],eventId)) athlete.bestBySpec[division.recordKey]=value; if (official) {
        const calendarYear = getCalendar(state).calendarYear, old = athlete.officialBest[division.recordKey];
        athlete.officialRecords ||= {}; const yearly = athlete.officialRecords[division.recordKey] ||= {};
        if (old && old.calendarYear >= calendarYear - 1 && yearly[old.calendarYear] == null) yearly[old.calendarYear] = old.value;
        if (better(value,yearly[calendarYear],eventId)) yearly[calendarYear] = value;
        Object.keys(yearly).forEach(year => { if (Number(year) < calendarYear - 1) delete yearly[year]; });
        athlete.officialBest[division.recordKey] = Object.entries(yearly).map(([year,v]) => ({value:v,calendarYear:Number(year)})).sort((a,b) => division.lowerBetter ? a.value-b.value : b.value-a.value)[0];
      } }
      const qualified = official && rank <= 3 && !!meet.next, medal = official && rank <= 3 ? ['gold','silver','bronze'][rank-1] : null;
      if (medal) {state.medals[medal]++;summary[medal]++;} if (qualified) { state.qualification[meet.next][key] = division.teamSize ? true : [athlete.id]; summary.qualified = true; }
      const prize = Math.round((rank === 1 ? meet.prize : rank === 2 ? meet.prize*.65 : rank===3 ? meet.prize*.4 : 2500) * (official ? 1 : .25)); summary.prize += prize; summary.reputation += official ? (rank === 1 ? 4 : rank <=3 ? 2 : 1) * meet.level : 0;
      for (const member of athletes) {member.energy = round(clamp(member.energy - (tactic==='aggressive'?19:tactic==='steady'?10:14),0,100)); member.morale=clamp(member.morale+(rank<=3?6:rank<=5?1:-2),0,100); if (meet.kind !== 'school' && !state.competedThisWeek.includes(member.id)) state.competedThisWeek.push(member.id);}
      results.push({eventId,divisionKey:key,eventName:division.name,name,athleteId:athlete.id,athleteName:name,gender:division.gender,category:division.category,indoor:meet.kind==='indoor',...(division.hurdleHeight?{hurdleHeight:division.hurdleHeight}:{}),value,formatted:formatResult(value,eventId),rank,participants,qualified,newBest,medal,prize,tactic,official,...(members?{members,athleteIds:[...entry]}:{})});
    }
    if (meet.id==='district'&&summary.qualified) state.goal.districtQualified=true; if (meet.id==='prefecture'&&summary.qualified) state.goal.prefectureQualified=true; if (meet.id==='regional'&&summary.qualified) state.goal.nationalsQualified=true;
    if (meet.id==='nationals'&&summary.gold>0) {state.goal.nationalsWon=true;if(state.goal.wonYear==null)state.goal.wonYear=state.year;}
    state.money+=summary.prize; state.reputation=clamp(state.reputation+summary.reputation,0,999);state.spirit=clamp(state.spirit+(summary.qualified||summary.gold?6:-1),15,100);
    summary.message = meet.id==='nationals'&&summary.gold ? 'インターハイ優勝！ 新しい部の歴史に、全国の金メダルを刻んだ。' : summary.qualified ? '通過した選手・リレーが'+MEETS.find(m=>m.id===meet.next).name+'へ！' : !summary.official ? 'オープン記録会で経験を積んだ。記録は参考記録となり、参加標準には使えません。' : summary.gold ? '金メダル獲得！ 次の舞台へつながる大きな一歩。' : '大会を終えました。記録と適性を振り返り、次の目標へ。';
    return finishMeet(state,meet,results,summary);
  }
  function skipMeet(state) { if (!validState(state)) return fail('部のデータを読み込めません。');if(!state.pendingMeet)return fail('今日は大会当日ではありません。');const meet=state.pendingMeet;if(meet.next)state.qualification[meet.next]={};const summary={title:meet.name+' 出場見送り',message:'今大会の出場を見送りました。',prize:0,reputation:0,gold:0,silver:0,bronze:0,qualified:false,stageId:meet.id,official:false,skipped:true};return finishMeet(state,meet,[],summary); }
  function getSummary(state) { const count=state.athletes.length;return {athleteCount:count,boys:state.athletes.filter(a=>a.gender==='boys').length,girls:state.athletes.filter(a=>a.gender==='girls').length,averageEnergy:count?Math.round(state.athletes.reduce((s,a)=>s+a.energy,0)/count):0,averageRating:count?round(state.athletes.reduce((s,a)=>s+getAthleteRating(a,a.event),0)/count):0,totalMedals:Object.values(state.medals).reduce((s,n)=>s+n,0),level:state.reputation>=150?'全国の強豪':state.reputation>=70?'県の注目校':state.reputation>=20?'地区の新鋭':'新設陸上部',seasonGoal:state.goal.nationalsWon?'インターハイ連覇を目指そう':state.goal.nationalsQualified?'インターハイで金メダル':state.goal.prefectureQualified?'地方大会を突破しよう':state.goal.districtQualified?'県大会を突破しよう':'地区予選を突破しよう',nextMeet:getNextMeet(state)}; }
  function validateSave(input) {
    try {
      const d=typeof input==='string'?JSON.parse(input):input,n=(v,min,max,int=false)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max&&(!int||Number.isInteger(v)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),str=(v,max=100)=>typeof v==='string'&&v.length>0&&v.length<=max;
      if(!obj(d)||d.version!==VERSION||!n(d.year,1,10000,true)||!n(d.week,1,48,true)||!n(d.money,0,1e12)||!n(d.reputation,0,999)||!n(d.spirit,0,100)||!n(d.rng,1,4294967295,true)||!n(d.nextAthleteId,1,1e9,true)||!n(d.totalWeeks,0,1e9,true)||!str(d.schoolName,30)||!['easy','normal','hard'].includes(d.intensity))return false;
      if(!obj(d.facilities)||Object.keys(d.facilities).length!==4||!FACILITIES.every(f=>n(d.facilities[f.id],1,5,true)))return false;
      const validId=id=>typeof id==='string'&&/^athlete-[1-9][0-9]*$/.test(id)&&id.length<40,record=(v,id)=>!!findEvent(id)&&n(v,.01,findEvent(id).unit==='m'?30:1500),spec=key=>{const parts=key.split(':');return !!findEvent(parts[0])&&(parts.length===1?!['110mh','100mh','60mh'].includes(parts[0]):parts.length===2&&['110mh','100mh','60mh'].includes(parts[0])&&['0.762','0.838','0.991','1.067'].includes(parts[1]));};
      const athleteSpec=(key,a)=>{if(!spec(key))return false;const [id,height]=key.split(':'),e=findEvent(id);if(e.teamSize||(e.gender&&e.gender!==a.gender))return false;if(!height)return true;return (a.gender==='boys'?['0.991','1.067']:['0.762','0.838']).includes(height);};
      const athlete=(a,junior=false)=>obj(a)&&validId(a.id)&&str(a.name,40)&&['boys','girls'].includes(a.gender)&&n(a.grade,junior?0:1,junior?0:3,true)&&n(a.birthMonth,1,12,true)&&n(a.birthYear,START_YEAR+d.year-22,START_YEAR+d.year-12,true)&&a.birthYear===START_YEAR+d.year-1-15-a.grade+(a.birthMonth<=3?1:0)&&INDIVIDUAL_EVENTS.some(e=>e.id===a.event&&(!e.gender||e.gender===a.gender))&&a.specialty===a.event&&str(a.trait,40)&&TRAITS.some(t=>t.name===a.trait)&&str(a.traitDescription,300)&&/^#[0-9a-fA-F]{6}$/.test(a.color)&&n(a.potential,.5,2)&&n(a.energy,0,100)&&n(a.morale,0,100)&&n(a.injury,0,3,true)&&TRAININGS.some(t=>t.id===a.training)&&FOCUSES.some(f=>f.id===a.focus)&&obj(a.stats)&&Object.keys(a.stats).length===7&&STAT_KEYS.every(k=>n(a.stats[k],0,100))&&obj(a.best)&&Object.entries(a.best).every(([id,v])=>record(v,id)&&!findEvent(id).teamSize&&(!findEvent(id).gender||findEvent(id).gender===a.gender))&&obj(a.bestBySpec)&&Object.entries(a.bestBySpec).every(([key,v])=>athleteSpec(key,a)&&record(v,key.split(':')[0]))&&obj(a.officialBest)&&Object.entries(a.officialBest).every(([key,v])=>athleteSpec(key,a)&&obj(v)&&record(v.value,key.split(':')[0])&&n(v.calendarYear,START_YEAR,getCalendar(d).calendarYear,true))&&(a.officialRecords===undefined||(obj(a.officialRecords)&&Object.entries(a.officialRecords).every(([key,years])=>athleteSpec(key,a)&&obj(years)&&Object.entries(years).every(([year,value])=>n(Number(year),START_YEAR,getCalendar(d).calendarYear,true)&&record(value,key.split(':')[0])))));
      if(!Array.isArray(d.athletes)||d.athletes.length<12||d.athletes.length>36||!d.athletes.every(a=>athlete(a))||new Set(d.athletes.map(a=>a.id)).size!==d.athletes.length)return false;
      if(!Array.isArray(d.candidates)||d.candidates.length!==6||!d.candidates.every(a=>athlete(a,true)&&n(a.cost,0,1e6)&&str(a.note,300))||new Set(d.candidates.map(a=>a.id)).size!==6)return false;
      if(!Array.isArray(d.scouted)||d.scouted.length>6||!d.scouted.every(a=>athlete(a,true)&&d.candidates.some(c=>c.id===a.id))||new Set(d.scouted.map(a=>a.id)).size!==d.scouted.length||!Array.isArray(d.recruitedIds)||d.recruitedIds.length!==d.scouted.length||!d.recruitedIds.every(id=>d.scouted.some(a=>a.id===id))||new Set(d.recruitedIds).size!==d.recruitedIds.length)return false;
      if(d.candidates.some(a=>d.athletes.some(b=>b.id===a.id))||Math.max(...d.athletes.concat(d.candidates).map(a=>Number(a.id.slice(8))))>=d.nextAthleteId)return false;
      for(const gender of ['boys','girls'])if(d.scouted.filter(a=>a.gender===gender).length>3)return false;
      if(!obj(d.teamBest)||!['boys','girls'].every(g=>obj(d.teamBest[g])&&Object.entries(d.teamBest[g]).every(([id,v])=>id==='relay'&&record(v,id))))return false;
      if(!obj(d.qualification)||Object.keys(d.qualification).length!==MEETS.length||!MEETS.every(m=>{const q=d.qualification[m.id];if(['district','rookieDistrict'].includes(m.id))return q===true;if(!obj(q))return false;const keys=getMeetEvents(d,m).map(e=>e.key);return Object.entries(q).every(([key,v])=>keys.includes(key)&&(key.endsWith(':relay')?v===true:Array.isArray(v)&&v.length===1&&v.every(id=>validId(id)&&d.athletes.some(a=>a.id===id&&a.gender===key.split(':')[0]))));}))return false;
      if(!Array.isArray(d.completedMeets)||new Set(d.completedMeets).size!==d.completedMeets.length||!d.completedMeets.every(id=>MEETS.some(m=>m.id===id&&m.week<=d.week)))return false;
      if(MEETS.some(m=>m.week<d.week&&!d.completedMeets.includes(m.id)))return false;
      const due=MEETS.filter(m=>m.week===d.week&&!d.completedMeets.includes(m.id));if(!Array.isArray(d.pendingMeets))return false;const queue=d.pendingMeet?[d.pendingMeet,...d.pendingMeets]:d.pendingMeets;if(queue.length!==due.length||queue.some((m,i)=>!obj(m)||Object.entries(due[i]).some(([key,value])=>m[key]!==value)))return false;if(!d.pendingMeet&&d.pendingMeets.length)return false;
      if(!Array.isArray(d.competedThisWeek)||new Set(d.competedThisWeek).size!==d.competedThisWeek.length||!d.competedThisWeek.every(id=>d.athletes.some(a=>a.id===id))||typeof d.monthPlanPending!=='boolean')return false;
      if(!Array.isArray(d.practiceCards)||d.practiceCards.length!==3||new Set(d.practiceCards.map(c=>c.id)).size!==3||!d.practiceCards.every(c=>{const ref=PRACTICE_CARDS.find(p=>p.id===c.id);return ref&&JSON.stringify(c)===JSON.stringify(ref);})||!d.practiceCards.some(c=>c.id===d.selectedPracticeCard))return false;
      if(!obj(d.medals)||!['gold','silver','bronze'].every(k=>n(d.medals[k],0,1e9,true))||!obj(d.goal)||!['districtQualified','prefectureQualified','nationalsQualified','nationalsWon'].every(k=>typeof d.goal[k]==='boolean')||!(d.goal.wonYear===null||n(d.goal.wonYear,1,d.year,true)))return false;
      if(!Array.isArray(d.logs)||d.logs.length>100||!d.logs.every(l=>obj(l)&&n(l.year,1,d.year,true)&&n(l.week,1,48,true)&&str(l.text,500)))return false;
      const validResult=r=>obj(r)&&findEvent(r.eventId)&&(!findEvent(r.eventId).gender||findEvent(r.eventId).gender===r.gender)&&['boys','girls'].includes(r.gender)&&r.divisionKey===r.gender+':'+r.eventId&&validId(r.athleteId)&&str(r.athleteName,80)&&record(r.value,r.eventId)&&n(r.rank,1,8,true)&&typeof r.qualified==='boolean'&&typeof r.newBest==='boolean'&&typeof r.official==='boolean'&&[null,'gold','silver','bronze'].includes(r.medal)&&str(r.formatted,30)&&n(r.prize,0,1e9)&&Array.isArray(r.participants)&&r.participants.length===8&&r.participants.every(p=>obj(p)&&str(p.name,80)&&str(p.school,40)&&record(p.value,r.eventId)&&n(p.rank,1,8,true)&&typeof p.isPlayer==='boolean')&&r.participants.filter(p=>p.isPlayer).length===1&&r.participants.some(p=>p.isPlayer&&p.athleteId===r.athleteId&&p.value===r.value&&p.rank===r.rank)&&(r.eventId!=='relay'||(Array.isArray(r.athleteIds)&&r.athleteIds.length===4&&new Set(r.athleteIds).size===4&&r.athleteIds.every(validId)&&Array.isArray(r.members)&&r.members.length===4&&r.members.every((m,i)=>m.athleteId===r.athleteIds[i]&&m.leg===i+1&&str(m.name,40)&&/^#[0-9a-fA-F]{6}$/.test(m.color)&&m.gender===r.gender)));
      const validMeet=m=>obj(m)&&MEETS.some(ref=>ref.id===m.id&&ref.week===m.week&&m.indoor===(ref.kind==='indoor')&&m.kind===ref.kind)&&str(m.name,80)&&n(m.year,1,d.year,true)&&Array.isArray(m.results)&&m.results.length<=20&&new Set(m.results.map(r=>r.divisionKey)).size===m.results.length&&m.results.every(r=>validResult(r)&&getMeetEvents(d,m.id).some(div=>div.key===r.divisionKey&&div.name===r.eventName&&div.category===r.category&&div.hurdleHeight===r.hurdleHeight)&&r.indoor===m.indoor)&&obj(m.summary)&&str(m.summary.title,120)&&str(m.summary.message,500)&&['prize','reputation','gold','silver','bronze'].every(k=>n(m.summary[k],0,1e9))&&typeof m.summary.qualified==='boolean'&&typeof m.summary.official==='boolean';
      if(!Array.isArray(d.history)||d.history.length>60||!d.history.every(validMeet)||(d.lastMeet!==null&&!validMeet(d.lastMeet)))return false;
      if(d.lastReport!=null&&(!obj(d.lastReport)||!str(d.lastReport.title,100)||!Array.isArray(d.lastReport.changes)||!Array.isArray(d.lastReport.events)||!d.lastReport.events.every(s=>typeof s==='string')||!Array.isArray(d.lastReport.lines)||!d.lastReport.lines.every(s=>typeof s==='string')))return false;
      return true;
    }catch(_){return false;}
  }
  const api={VERSION,START_YEAR,EVENTS,INDIVIDUAL_EVENTS,RELAY_LEGS,TRAININGS,FOCUSES,PRACTICE_CARDS,FACILITIES,MEETS,STAT_KEYS,STAT_NAMES,GENDER_NAMES,INDOOR_STANDARDS,createGame,getCalendar,getSchedule,getNextMeet,getMeetEvents,getEntryStatus,getEligibleAthletes,getRecordKey,getAge,advanceWeek,setTraining,setFocus,confirmMonthlyPlan,choosePracticeCard,setIntensity,upgradeFacility,recruitAthlete,scoutAthlete,getCandidates,runMeet,skipMeet,validateEntries,getAthleteRating,getSuitability,getRelayRating,predictResult,predictRelayResult,getDefaultTraining,formatResult,getFacilityCost,getSummary,validateSave};
  root.TrackGame=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
