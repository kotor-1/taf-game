(() => {
  'use strict';

  const W = 500, H = 260;
  const PALETTE = ['#f7cb55', '#69b8c7', '#e7978d', '#a2b966', '#a59bd1', '#e7a55d', '#65949e', '#f2e4bf'];
  const TAU = Math.PI * 2;
  const isFemale = gender => gender === 'girls' || gender === 'female' || gender === '女子';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return x - Math.floor(x); };

  function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function line(ctx, points, color, width = 1) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
    points.forEach((p, i) => i ? ctx.lineTo(Math.round(p[0]) + .5, Math.round(p[1]) + .5) : ctx.moveTo(Math.round(p[0]) + .5, Math.round(p[1]) + .5)); ctx.stroke();
  }
  function poly(ctx, points, color) {
    ctx.beginPath(); ctx.fillStyle = color;
    points.forEach((p, i) => i ? ctx.lineTo(Math.round(p[0]), Math.round(p[1])) : ctx.moveTo(Math.round(p[0]), Math.round(p[1]))); ctx.closePath(); ctx.fill();
  }
  function oval(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, TAU); ctx.fill();
  }
  function stadium(ctx, radius, vertical, color, stroke = false, width = 1) {
    ctx.beginPath(); ctx.moveTo(139, 183 - vertical); ctx.lineTo(361, 183 - vertical);
    ctx.ellipse(361, 183, radius, vertical, 0, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(139, 183 + vertical); ctx.ellipse(139, 183, radius, vertical, 0, Math.PI / 2, Math.PI * 1.5);
    ctx.closePath();
    if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
  }
  function tree(ctx, x, y, size, season, seed = 0) {
    const s = size; oval(ctx, x + 3, y + 2, s * .65, s * .21, '#597b5e35');
    rect(ctx, x - 1, y - s * .72, 3, s * .78, '#8b7350'); rect(ctx, x + 1, y - s * .49, 1, s * .52, '#c29c6f');
    const colors = season === 'spring' ? ['#d68598', '#e9a6ad', '#f7c5c0', '#ffe0cf']
      : season === 'autumn' ? ['#a36942', '#c38a4b', '#dbab57', '#ecd07f']
      : season === 'winter' ? ['#5e7c72', '#809b87', '#b1c0a6', '#e2e6d4']
      : ['#537d54', '#65925b', '#80a561', '#a0bb76'];
    for (let i = 0; i < 14; i++) {
      const a = hash(i + seed) * TAU, r = hash(i * 3 + seed + 4) * s * .48;
      const px = x + Math.cos(a) * r, py = y - s * .9 + Math.sin(a) * r * .77;
      rect(ctx, px - s * .28, py - s * .24, s * .53, s * .43, colors[i % 3]);
    }
    rect(ctx, x - s * .27, y - s * 1.33, s * .57, s * .14, colors[3]);
    rect(ctx, x - s * .42, y - s * 1.08, s * .22, s * .13, colors[3]);
    if (season === 'spring') { rect(ctx, x + s * .22, y - s * .87, 3, 2, '#ffe9d3'); rect(ctx, x - 1, y - s * 1.2, 3, 2, '#ffe9d3'); }
  }
  function person(ctx, x, y, color, frame = 0, direction = 1, scale = 1, darkHair = '#3e5149', skin = '#efc397', selected = false, gender = '') {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
    oval(ctx, 0, 1, 4, 1.4, '#424d5b26');
    if (selected) { oval(ctx, 0, 1, 6, 2, '#ffe7a5'); oval(ctx, 0, 1, 4, 1.2, '#6f827637'); }
    const stride = Math.sin(frame) > 0 ? 1 : -1;
    rect(ctx, -2, -6, 4, 4, color); rect(ctx, -1, -5, 1, 3, '#ffffff55');
    rect(ctx, -2, -2, 4, 2, '#354b57');
    rect(ctx, -2 - stride, 0, 2, 2, skin); rect(ctx, stride, 0, 2, 2, skin);
    rect(ctx, -2 - stride, 2, 3, 1, '#f7eee0'); rect(ctx, stride, 2, 3, 1, '#f7eee0');
    rect(ctx, direction > 0 ? 2 : -4, -6 + stride, 2, 3, skin);
    rect(ctx, direction > 0 ? -4 : 2, -5 - stride, 2, 3, skin);
    rect(ctx, -2, -10, 4, 4, skin); rect(ctx, -2, -11, 4, 2, darkHair);
    if (isFemale(gender)) { rect(ctx, direction > 0 ? -4 : 3, -10, 2, 5, darkHair); rect(ctx, direction > 0 ? -4 : 3, -10, 2, 1, color); }
    rect(ctx, direction > 0 ? -2 : 1, -9, 1, 2, darkHair);
    rect(ctx, direction > 0 ? 1 : -2, -8, 1, 1, '#4a4c48');
    ctx.restore();
  }

  class TrackScene {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.pixel = document.createElement('canvas'); this.pixel.width = W; this.pixel.height = H;
      this.g = this.pixel.getContext('2d');
      this.landscape = document.createElement('canvas'); this.landscape.width = W; this.landscape.height = H;
      this.state = {}; this.mode = 'practice'; this.race = null; this.raceStarted = 0; this.hitAreas = [];
      this.season = 'spring'; this.schoolName = '青葉高校'; this.selectedId = null; this.hovered = null; this.lastFrame = 0; this.alive = true;
      this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
      this.renderBackground();
      this.onResize = () => this.resize();
      this.onPointerMove = (e) => {
        const bounds = canvas.getBoundingClientRect(), x = (e.clientX - bounds.left) / bounds.width * W, y = (e.clientY - bounds.top) / bounds.height * H;
        const hits = this.hitAreas.map(h => ({...h, distance: Math.hypot(h.x - x, (h.y - 5 - y) * 1.25)}));
        hits.sort((a, b) => a.distance - b.distance); this.hovered = hits[0]?.distance < 16 ? hits[0] : null;
        canvas.style.cursor = this.hovered ? 'pointer' : 'default';
      };
      this.onLeave = () => { this.hovered = null; canvas.style.cursor = 'default'; };
      this.onClick = (e) => { this.onPointerMove(e); if (this.hovered?.id !== undefined) { this.selectedId = this.hovered.id; canvas.dispatchEvent(new CustomEvent('athleteselect', { detail: { id: this.hovered.id }, bubbles: true })); } };
      canvas.addEventListener('pointermove', this.onPointerMove); canvas.addEventListener('pointerleave', this.onLeave); canvas.addEventListener('click', this.onClick);
      this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.onResize) : null;
      this.observer?.observe(canvas); window.addEventListener('resize', this.onResize); this.resize();
      this.tick = (time) => {
        if (!this.alive) return;
        if (time - this.lastFrame > (this.reducedMotion ? 160 : 34)) { this.draw(time); this.lastFrame = time; }
        this.frame = requestAnimationFrame(this.tick);
      };
      this.frame = requestAnimationFrame(this.tick);
    }

    resize() {
      const bounds = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round((bounds.width || 1000) * dpr));
      const height = Math.max(1, Math.round((bounds.height || (bounds.width || 1000) * H / W) * dpr));
      if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
      this.ctx.imageSmoothingEnabled = false; this.draw(performance.now());
    }

    setState(state) {
      this.state = state || {};
      const week = Number(this.state.week ?? this.state.currentWeek ?? 1);
      const calendar = globalThis.TrackGame?.getCalendar?.(this.state);
      const seasonValue = calendar?.season || this.state.season;
      const namedSeason = ({ 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' })[seasonValue] || seasonValue;
      const month = calendar?.month || (Math.floor((((week - 1) % 48) + 48) % 48 / 4) + 3) % 12 + 1;
      const calendarSeason = month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
      let season = ['spring', 'summer', 'autumn', 'winter'].includes(namedSeason) ? namedSeason : calendarSeason;
      const schoolName = String(this.state.schoolName || '青葉高校').trim().slice(0, 30) || '青葉高校';
      if (season !== this.season || schoolName !== this.schoolName) { this.season = season; this.schoolName = schoolName; this.renderBackground(); }
      this.draw(performance.now());
    }

    setMode(mode = 'practice', data) {
      this.mode = mode;
      this.race = mode === 'race' && data ? { ...data, runners: TrackScene.selectHighlightRunners(data.runners) } : data || null;
      this.raceStarted = performance.now(); this.draw(this.raceStarted);
    }

    static selectHighlightRunners(runners) {
      if (!Array.isArray(runners)) return [];
      // A highlight is an excerpt around our athlete, not a simulated heat.
      // Keep the overall result intact and use local positions only for animation.
      const playerIndex = Math.max(0, runners.findIndex(runner => runner.isPlayer));
      const start = clamp(playerIndex - 3, 0, Math.max(0, runners.length - 8));
      return runners.slice(start, start + 8).map((runner, index) => ({ ...runner, overallPlace: runner.overallPlace ?? runner.place ?? start + index + 1, place: index + 1 }));
    }

    renderBackground() {
      const c = this.landscape.getContext('2d'), season = this.season;
      const winter = season === 'winter';
      c.imageSmoothingEnabled = false;
      rect(c, 0, 0, W, H, winter ? '#bed5d4' : '#b5d8d6');
      // A small clear sky opens out behind the school grounds.
      rect(c, 0, 34, W, 20, '#cce1d0');
      poly(c, [[0, 43], [29, 31], [53, 40], [95, 20], [125, 39], [160, 26], [192, 45], [232, 32], [264, 45], [293, 29], [326, 42], [359, 22], [397, 39], [434, 26], [474, 40], [500, 32], [500, 74], [0, 74]], '#93b8a9');
      poly(c, [[0, 54], [25, 43], [76, 52], [112, 41], [153, 59], [207, 42], [263, 56], [324, 39], [366, 54], [419, 40], [459, 55], [500, 44], [500, 80], [0, 80]], '#759c87');
      // Pixel clouds, deliberately irregular instead of smooth vector bubbles.
      [[36,17,29],[205,13,33],[414,18,34]].forEach(([x,y,w]) => { rect(c,x,y,w,5,'#f5f0d9');rect(c,x+5,y-4,w-13,5,'#f5f0d9');rect(c,x+w-5,y+2,10,3,'#e7edda');});
      rect(c, 0, 69, W, 191, winter ? '#b8c6a0' : season === 'autumn' ? '#b5be7d' : '#a2ba83');
      rect(c, 0, 83, W, 34, '#c4c99a');
      for (let i=0;i<500;i++) {
        const x=hash(i+3)*W, y=74+hash(i*7+3)*190;
        rect(c,x,y,hash(i+100)> .5 ? 2:1,1,i%3 ? '#91ab732e':'#f5e2a329');
      }
      // Warm sand paths with a little border and a perimeter running fence.
      poly(c, [[0,104],[500,91],[500,111],[0,127]], '#ddd1a6');
      rect(c,0,108,95,2,'#ede1b5');
      line(c, [[2,89],[93,88]], '#718778');
      for(let x=4;x<94;x+=8){rect(c,x,85,1,11,'#8a9583');rect(c,x+1,87,1,9,'#bbc1a3');}
      line(c,[[317,84],[500,80]],'#7a907b'); line(c,[[317,91],[500,87]],'#899c81');
      for(let x=317;x<500;x+=8){rect(c,x,82-(x-317)/45,1,13,'#789079');}
      // School building: layered roof, sunlit facade, window reflections and rooftop water tank.
      poly(c,[[106,95],[290,96],[313,109],[128,111]],'#6c84602a');
      rect(c,102,45,187,57,'#bcc0a3'); rect(c,106,47,180,53,'#f1e8c9');
      rect(c,106,96,180,6,'#c4b796');
      rect(c,282,45,14,57,'#d2cbb0');
      poly(c,[[98,43],[117,32],[283,32],[299,43]],'#688b8b');
      rect(c,98,43,202,5,'#537b7c'); rect(c,101,43,196,2,'#8daba0');
      for(let x=121;x<281;x+=13){line(c,[[x,34],[x-11,42]],'#81a098');}
      rect(c,121,28,19,7,'#72918c');rect(c,124,25,14,4,'#99aaa0');
      rect(c,131,29,6,6,'#c5c4aa');
      rect(c,260,25,14,8,'#afbfac'); rect(c,259,24,17,3,'#e2dfc0'); rect(c,261,33,2,3,'#667f76');rect(c,271,33,2,3,'#667f76');
      for(let row=0;row<3;row++){
        for(let j=0;j<12;j++){
          const x=112+j*14, y=53+row*15;
          rect(c,x,y,9,9,'#718f90');rect(c,x+1,y+1,7,6,'#9dbec0');rect(c,x+1,y+6,7,2,'#5b7f83');rect(c,x+4,y,1,9,'#e8dfbd');rect(c,x-1,y+9,11,2,'#c9c3a5');
          if((row+j)%4===0)rect(c,x+1,y+1,2,4,'#c9ddd1');
        }
        rect(c,106,64+row*15,180,2,'#e0d6b5');
      }
      // A central clock tower and welcoming entrance.
      rect(c,186,43,24,56,'#e9dfbf');rect(c,184,42,28,3,'#658887');rect(c,188,46,20,20,'#d2c9a8');
      oval(c,198,55,7,7,'#718f84');oval(c,198,55,5.5,5.5,'#f5ebcb');line(c,[[198,51],[198,55],[201,57]],'#677769');
      rect(c,190,83,16,16,'#648685');rect(c,192,85,12,13,'#89a6a0');rect(c,197,85,2,14,'#e4dab8');rect(c,188,99,20,3,'#b3ab8b');
      rect(c,185,72,27,8,'#637f6c');c.fillStyle='#f5e6bd';c.font='5px sans-serif';c.textAlign='center';
      let sign = this.schoolName || '青葉高校';
      if(c.measureText(sign).width > 24){while(sign.length > 1 && c.measureText(sign + '…').width > 24)sign=sign.slice(0,-1);sign+='…';}
      c.fillText(sign,198.5,78);
      // Annex / athletics equipment shed.
      rect(c,315,65,47,34,'#d8cdae');rect(c,356,65,8,34,'#bfb394');
      poly(c,[[310,65],[319,55],[359,55],[369,65]],'#778c79');rect(c,311,65,57,3,'#5b7467');
      rect(c,319,73,16,12,'#8aa39c');rect(c,320,74,14,8,'#b6c7b2');rect(c,326,73,2,12,'#e6ddbb');
      rect(c,344,73,12,25,'#8d9a80');rect(c,346,76,8,19,'#b5b699');rect(c,346,87,1,2,'#677960');
      rect(c,316,98,51,3,'#b5aa8b');
      // Schoolyard equipment: shoe lockers, bicycle parking, flags and benches.
      rect(c,67,77,25,19,'#869e87');rect(c,66,74,29,4,'#4d776e');
      for(let r=0;r<3;r++)for(let j=0;j<5;j++){rect(c,69+j*4,80+r*4,3,3,'#c3c8a5');rect(c,70+j*4,81+r*4,1,1,'#7c927b');}
      for(let j=0;j<5;j++){const x=72+j*7;oval(c,x,105,2.5,2.5,'#687e6b');oval(c,x+5,105,2.5,2.5,'#687e6b');line(c,[[x,105],[x+2,100],[x+5,105],[x,105],[x+5,100]],'#b7b9a2');}
      rect(c,383,37,2,59,'#78928a');rect(c,384,38,1,58,'#e9e3c7');rect(c,385,39,20,13,'#f8eed6');oval(c,395,45.5,3.5,3.5,'#d57562');rect(c,381,96,7,3,'#9da789');
      // Trees behind the track frame the ground without covering it.
      [[23,92,29,9],[46,82,24,8],[91,59,17,5],[305,64,16,11],[422,81,29,2],[461,84,31,4],[490,69,24,7]].forEach(([x,y,s,seed])=>tree(c,x,y,s,season,seed));
      for(let j=0;j<9;j++){rect(c,18+j*5,110,3,2,j%3?'#f0d0a4':'#c77570');rect(c,18+j*5,112,1,3,'#708b57');}
      // Running oval; six cream lane lines and shaded inner kerb.
      stadium(c,103,66,'#7c946b');stadium(c,101,64,'#f1dfb2');stadium(c,99,62,'#bb715f');stadium(c,98,60,'#d98970');
      stadium(c,64,36,winter?'#95ab87':season==='autumn'?'#9cac67':'#8aaf71');
      stadium(c,64,36,'#f4dcaf',true,1.8);
      for(let n=1;n<=5;n++){const r=64+n*5.7, v=36+n*4;stadium(c,r,v,'#f3cc9e',true,.7);}
      line(c,[[139,121],[361,121]],'#f8d8ab');
      // Fine track grit stays subtle and never obscures the lane marks.
      for(let i=0;i<85;i++) {const x=140+hash(i+39)*219, y=i%2?125+hash(i+63)*20:221+hash(i+77)*18;rect(c,x,y,1,1,'#a9655540');}
      // Field stripes and soccer training linework lend the oval a convincing scale.
      c.save();
      c.beginPath();c.moveTo(139,147);c.lineTo(361,147);c.ellipse(361,183,64,36,0,-Math.PI/2,Math.PI/2);c.lineTo(139,219);c.ellipse(139,183,64,36,0,Math.PI/2,Math.PI*1.5);c.clip();
      for(let j=0;j<9;j++)rect(c,91+j*38,146,18,75,'#c9d68e16');
      for(let i=0;i<180;i++)rect(c,84+hash(i+91)*333,149+hash(i+62)*68,2,1,'#5a8b5020');
      line(c,[[141,155],[364,155],[390,209],[116,209],[141,155]],'#d2dfaa79');line(c,[[250,155],[250,209]],'#d2dfaa65');
      c.strokeStyle='#d2dfaa70';c.beginPath();c.ellipse(250,182,22,12,0,0,TAU);c.stroke();
      line(c,[[135,170],[157,170],[148,195],[124,195]],'#d2dfaa65');line(c,[[371,170],[345,170],[353,195],[383,195]],'#d2dfaa65');
      c.restore();
      // Long-jump runway and sand pit on the infield.
      poly(c,[[166,192],[246,192],[250,199],[170,199]],'#cba877');line(c,[[168,193],[245,193]],'#e5c796');line(c,[[172,198],[248,198]],'#e5c796');
      poly(c,[[244,190],[277,190],[283,201],[250,201]],'#b39a70');poly(c,[[247,192],[275,192],[279,199],[251,199]],'#e3cca0');
      for(let i=0;i<12;i++)rect(c,251+hash(i+3)*23,193+hash(i+39)*5,1,1,'#baa67d');rect(c,239,192,2,6,'#f4e9c8');
      // High-jump mattress, uprights and bar.
      poly(c,[[310,162],[337,162],[343,170],[316,170]],'#7eaca3');poly(c,[[316,170],[343,170],[343,175],[316,175]],'#507f7e');poly(c,[[310,162],[316,170],[316,175],[310,168]],'#648d87');line(c,[[319,164],[334,164],[339,169]],'#b5cfb5');
      rect(c,307,155,1,18,'#e7e4c5');rect(c,337,155,1,18,'#e7e4c5');rect(c,308,157,29,1,'#da8b65');
      // Hurdles arranged near the back straight.
      for(let i=0;i<5;i++){const x=168+i*26;rect(c,x,136,13,2,'#fbdfb3');rect(c,x,138,1,6,'#6f8780');rect(c,x+12,138,1,6,'#6f8780');rect(c,x,136,4,2,'#698e8c');rect(c,x+8,136,4,2,'#698e8c');}
      // Start / finish line with staggered lane indicators.
      line(c,[[346,220],[346,243]],'#f7e6be',1.5);line(c,[[349,220],[349,242]],'#f7e6be',.5);
      c.font='4px monospace';c.textAlign='left';c.fillStyle='#ffdfb3';for(let i=0;i<6;i++)c.fillText(String(i+1),352,221+i*4);
      // Foreground benches, water bottles and running bags.
      [[64,234],[398,239]].forEach(([x,y])=>{rect(c,x+1,y+4,2,5,'#687b64');rect(c,x+26,y+4,2,5,'#687b64');rect(c,x,y,30,3,'#bc9060');rect(c,x,y+4,30,3,'#d5a870');rect(c,x+1,y+1,28,1,'#e1be88');});
      rect(c,78,230,2,4,'#8daead');rect(c,79,229,1,1,'#ecdfb8');rect(c,84,231,6,4,'#6c8493');rect(c,85,230,4,1,'#e6b778');
      rect(c,399,235,3,4,'#e7d8b2');rect(c,406,236,6,3,'#ce816b');rect(c,417,234,3,5,'#8eb2aa');
      // Cones mark a training zone.
      [[117,224],[129,225],[142,226],[373,220],[385,219]].forEach(([x,y])=>{poly(c,[[x,y-4],[x-2,y+1],[x+3,y+1]],'#de985b');rect(c,x-1,y-1,3,1,'#f6dbad');rect(c,x-3,y+1,7,1,'#ad7956');});
      // Tiny sideline spectators and a coach.
      person(c,365,112,'#faf0cf',0,1,1.05);person(c,379,112,'#728a95',2,-1,1);rect(c,368,106,4,3,'#baa578');
      person(c,48,159,'#ead19c',1,1,.95);person(c,455,185,'#faf0cf',2,-1,1);rect(c,457,178,4,3,'#a17d59');
      // Front corners: shrubs and a cropped fence give the scene depth.
      [[12,154,22,6],[487,163,23,5],[15,244,34,3],[478,253,30,14],[39,266,23,18]].forEach(([x,y,s,seed])=>tree(c,x,y,s,season,seed));
      line(c,[[96,258],[401,258]],'#7e9776');for(let x=97;x<401;x+=12){rect(c,x,254,1,6,'#75906f');rect(c,x+1,254,1,6,'#c2c5a1');}
      for(let i=0;i<50;i++){const x=hash(i+534)*500,y=247+hash(i+313)*13;rect(c,x,y,2,1,season==='spring'?'#eac3a4':'#c3cd91');}
      if(winter){for(let i=0;i<80;i++)rect(c,hash(i+319)*500,83+hash(i+712)*177,3,1,'#e4e5ce55');}
    }

    trackPoint(phase, lane = 2) {
      // Constant-speed stadium path, compressed vertically to match the pixel camera.
      const rx=68+lane*5.5, ry=39+lane*4, straight=222, curve=Math.PI*rx, total=2*straight+2*curve;
      let d=((phase%1)+1)%1*total;
      if(d<straight) return {x:139+d,y:183-ry,dx:1}; d-=straight;
      if(d<curve){const a=-Math.PI/2+d/rx;return{x:361+Math.cos(a)*rx,y:183+Math.sin(a)*ry,dx:-Math.sin(a)};} d-=curve;
      if(d<straight)return{x:361-d,y:183+ry,dx:-1};d-=straight;
      const a=Math.PI/2+d/rx;return{x:139+Math.cos(a)*rx,y:183+Math.sin(a)*ry,dx:-Math.sin(a)};
    }

    drawIndoorHall(c) {
      // The hall's roof, tiered seats and timber floor distinguish winter meets at a glance.
      rect(c,0,0,W,H,'#354d56');rect(c,0,12,W,73,'#66838a');
      for(let x=0;x<500;x+=62){poly(c,[[x,0],[x+31,14],[x+62,0],[x+62,4],[x+31,19],[x,4]],'#a7bbb7');line(c,[[x+31,17],[x+31,53]],'#8fa8a8',2);}
      for(let x=29;x<500;x+=88){rect(c,x,24,45,4,'#c9d4ba');rect(c,x+3,25,39,2,'#fff4cc');}
      rect(c,0,52,W,53,'#354f58');
      for(let row=0;row<4;row++){
        rect(c,0,60+row*11,W,8,row%2?'#75969b':'#86a6a5');
        for(let x=6;x<500;x+=15){rect(c,x,58+row*11,10,6,'#63838b');rect(c,x,58+row*11,10,1,'#adc0b5');}
      }
      for(let i=0;i<60;i++){const x=9+hash(i+847)*482,y=62+Math.floor(hash(i+264)*4)*11;rect(c,x,y,4,4,PALETTE[i%PALETTE.length]);rect(c,x+1,y-3,3,3,'#d9b999');}
      rect(c,0,105,W,13,'#d7d7bc');rect(c,0,105,W,2,'#f0e9cd');
      for(let x=20;x<500;x+=92){rect(c,x,109,63,6,'#4e7174');}
      rect(c,0,118,W,142,'#cbb68d');
      for(let y=122;y<260;y+=10){line(c,[[0,y],[500,y]],'#b6a782');for(let x=(y%20?16:58);x<500;x+=83)line(c,[[x,y-9],[x,y]],'#bfaf88');}
      line(c,[[6,118],[494,118]],'#eef0d2',2);
      rect(c,348,18,139,29,'#2b424b');rect(c,350,20,135,25,'#3d6067');
      c.textAlign='center';c.fillStyle='#f6e7b7';c.font='bold 7px sans-serif';c.fillText('冬の室内陸上',417,31);
      c.font='5px sans-serif';c.fillStyle='#b9d2c5';c.fillText('INDOOR ATHLETICS',417,41);
    }

    drawFieldGround(c) {
      if(this.race?.indoor) return;
      rect(c,0,107,W,H-107,'#9fb780');rect(c,0,108,W,5,'#c4c994');rect(c,0,116,W,8,'#dfd0a6');
      for(let i=0;i<140;i++)rect(c,hash(i+615)*W,126+hash(i+410)*134,2,1,i%3?'#71925c2c':'#d3d39550');
    }

    drawLongJump(c, time, runners, progress) {
      const jumper = runners.find(runner => runner.isPlayer) || runners[0];
      const color = jumper.color || '#dd8b6a';
      const value = Number(jumper.value);
      const distance = Number.isFinite(value) && value > 0 ? value : 5.5;
      const p = this.reducedMotion ? 1 : progress, triple=this.race?.eventId==='triplejump';
      const board = triple?220:292, ground = 205, landing = triple?board+clamp(distance,10,18.5)*14:board+clamp(distance,1.5,9.5)*18;
      const takeoff = triple?.44:.56, touchdown = triple?.84:.78;
      const phase = p < .10 ? '集中' : p < takeoff ? '助走' : triple?(p<.56?'ホップ':p<.68?'ステップ':p<touchdown?'ジャンプ':'着地'):(p<.62?'踏み切り':p<touchdown?'空中姿勢':'着地');

      // A closer camera looks down the runway; the familiar school remains beyond it.
      this.drawFieldGround(c);
      // Far-side rail and the waiting athletes establish the field-event setting.
      line(c, [[16, 133], [484, 133]], '#748c75');
      line(c, [[16, 139], [484, 139]], '#c2c7a2');
      for(let x=17;x<490;x+=13)rect(c,x,130,1,14,'#84977b');
      runners.filter(runner=>runner!==jumper).slice(0,7).forEach((runner,index)=>person(c,321+index*19,148,runner.color||PALETTE[index%PALETTE.length],0,index%2?1:-1,1.3));

      // Broad warm runway, white edges and a clearly visible takeoff board.
      const pitStart=triple?350:312;
      poly(c, [[18, 177], [pitStart-10, 177], [pitStart, 215], [10, 215]], '#b8795d');
      poly(c, [[18, 178], [pitStart-10, 178], [pitStart-2, 212], [11, 212]], this.race?.indoor?'#718fa1':'#d38f71');
      line(c, [[18, 180], [pitStart-11, 180]], '#f1d2a5');
      line(c, [[11, 211], [pitStart-2, 211]], '#f1d2a5');
      for(let i=0;i<50;i++)rect(c,21+hash(i+621)*268,183+hash(i+441)*24,1,1,'#b4745b60');
      rect(c, board-4, 179, 5, 33, '#f7e9c7');rect(c, board+1, 179, 2, 33, '#b66850');
      // Wooden pit surround, raked sand, and a measurement ruler in the foreground.
      poly(c, [[pitStart, 170], [475, 170], [488, 220], [pitStart-2, 220]], '#aa9569');
      poly(c, [[pitStart+4, 173], [471, 173], [483, 216], [pitStart+2, 216]], '#edcf94');
      poly(c, [[pitStart+4, 173], [471, 173], [472, 177], [pitStart+4, 177]], '#c9ae79');
      for(let y=182;y<213;y+=5)line(c,[[pitStart+6,y],[470+(y-182)*.24,y]],'#dac18b');
      for(let i=0;i<90;i++)rect(c,pitStart+8+hash(i+218)*(470-pitStart-8),178+hash(i+113)*33,1,1,'#b79a7050');
      rect(c,board,229,473-board,2,'#f3e6bb');
      c.font='6px monospace';c.textAlign='center';c.fillStyle='#577455';
      for(let m=0;m<=(triple?18:10);m++){const x=board+m*(triple?14:18);rect(c,x,228,1,m%2?5:7,'#758868');if(m%2===0)c.fillText(m+'m',x,242);}
      if(triple){c.fillStyle='#4b6f63';c.font='6px sans-serif';c.fillText('HOP',244,165);c.fillText('STEP',301,165);c.fillText('JUMP',374,165);}
      // Officials, a flag and the little rake beside the pit.
      person(c,477,164,'#f7ebc9',0,-1,1.4);rect(c,466,146,1,15,'#75886c');rect(c,458,146,8,6,'#f6e4bb');
      person(c,316,159,'#f6e7c5',0,1,1.3);rect(c,320,148,7,6,'#ab8b61');rect(c,321,148,5,4,'#e3d3ab');
      line(c,[[462,222],[454,243]],'#8a8562',2);line(c,[[449,242],[460,246]],'#747f5c');
      for(let i=0;i<4;i++)line(c,[[450+i*3,242+i],[449+i*3,245+i]],'#747f5c');

      let x=42,y=ground;
      if(p>=.1 && p<takeoff){const run=(p-.1)/(takeoff-.1);x=42+(board-42)*Math.pow(run,1.12);}
      if(p>=takeoff && p<touchdown){
        if(triple){const stage=p<.56?[takeoff,.56,board,275,27]:p<.68?[.56,.68,275,329,22]:[.68,touchdown,329,landing,44];const fly=(p-stage[0])/(stage[1]-stage[0]);x=stage[2]+(stage[3]-stage[2])*fly;y=ground-Math.sin(fly*Math.PI)*stage[4];}
        else {const fly=(p-takeoff)/(touchdown-takeoff);x=board+(landing-board)*fly;y=ground-Math.sin(fly*Math.PI)*43;}
      }
      if(p>=touchdown){x=landing;y=ground;}
      if(p<takeoff){
        person(c,x,y,color,p<.1?0:time/58,1,2,jumper.hairColor||'#43524b',jumper.skinColor||'#efc397',false,jumper.gender);
        if(p>.16){rect(c,x-11,ground-2,5,1,'#e7c79b');rect(c,x-16,ground-5,3,1,'#e7c79b');}
      }else{
        oval(c,x,ground+2,p<touchdown?7:10,p<touchdown?2:3,'#7c705c30');
        // A proper long-jump pose: torso leaning forward, arms up, both legs extended.
        c.save();c.translate(Math.round(x),Math.round(y));
        const skin=jumper.skinColor||'#efc397',hair=jumper.hairColor||'#43524b';
        rect(c,-5,-17,7,10,color);rect(c,-4,-16,2,6,'#ffffff55');rect(c,-4,-8,8,4,'#3b5359');
        rect(c,-2,-23,7,7,skin);rect(c,-3,-25,8,3,hair);rect(c,-3,-23,2,4,hair);rect(c,3,-20,1,1,'#455049');
        if(p<touchdown){rect(c,-5,-22,2,9,skin);rect(c,-5,-24,5,2,skin);rect(c,3,-15,6,2,skin);rect(c,7,-20,2,6,skin);rect(c,2,-5,9,3,skin);rect(c,8,-3,4,3,skin);rect(c,9,-1,5,2,'#f7eee0');}
        else{rect(c,-6,-14,3,8,skin);rect(c,2,-13,8,2,skin);rect(c,1,-5,7,3,skin);rect(c,6,-3,3,5,skin);rect(c,7,1,5,2,'#f7eee0');}
        c.restore();
      }
      if(p>=touchdown){
        // The sand puff settles, leaving a clear imprint and the measured mark.
        const settling=clamp((p-touchdown)/.12,0,1);
        for(let i=0;i<10;i++){const dir=i%2?1:-1, spread=5+hash(i+5)*17;rect(c,landing+dir*spread*settling,ground-2-Math.sin(settling*Math.PI)*(5+hash(i)*8),2,1,'#d5b377');}
        oval(c,landing+5,ground+4,8,2,'#c2a270');
        line(c,[[landing,218],[landing,229]],'#c07e55');poly(c,[[landing-4,224],[landing+4,224],[landing,229]],'#c07e55');
        const label=distance.toFixed(2)+' m', boxX=clamp(landing-24,320,442);
        rect(c,boxX,151,49,17,'#365746');rect(c,boxX+1,152,47,15,'#466a51');
        c.fillStyle='#fff0cb';c.font='bold 10px monospace';c.textAlign='center';c.fillText(label,boxX+24.5,163);
      }
      // Quiet event card; the actual result appears only once the jumper has landed.
      rect(c,14,14,184,32,'#34584bea');rect(c,15,15,182,30,'#456b54');
      c.textAlign='left';c.fillStyle='#d1dfb4';c.font='6px sans-serif';c.fillText((triple?'三段跳':'走幅跳')+'  /  '+phase,23,26);
      c.fillStyle='#fff0cc';c.font='bold 9px sans-serif';
      let name=String(jumper.name||'陸上部員');while(name.length>1&&c.measureText(name).width>160)name=name.slice(0,-1);
      c.fillText(name,23,39);
      rect(c,15,47,Math.round(182*p),2,'#e9b978');
    }

    drawEventCard(c, title, name, progress, width = 225) {
      rect(c,14,14,width,32,'#34584bea');rect(c,15,15,width-2,30,'#456b54');
      c.textAlign='left';c.fillStyle='#d1dfb4';c.font='6px sans-serif';c.fillText(title,23,26);
      c.fillStyle='#fff0cc';c.font='bold 9px sans-serif';
      let label=String(name||'陸上部員');while(label.length>1&&c.measureText(label).width>width-18)label=label.slice(0,-1);
      c.fillText(label,23,39);rect(c,15,47,Math.round((width-2)*progress),2,'#e9b978');
    }

    drawHurdles(c, time, runners, progress) {
      const player=runners.find(runner=>runner.isPlayer)||runners[0], p=this.reducedMotion?1:progress;
      const eventId=this.race?.eventId||'110mh', indoor=!!this.race?.indoor;
      const isHurdles=eventId.endsWith('mh'), short=eventId==='60m'||eventId==='60mh';
      const female=isFemale(this.race?.gender)||isFemale(player.gender);
      const distance=short?60:eventId==='100mh'||eventId==='100m'?100:110;
      const title=distance+'m'+(isHurdles?'ハードル':'');
      // Eight visible lanes include our athlete even in a larger meet.
      const competitors=runners.slice(0,8);
      if(!competitors.includes(player))competitors[competitors.length-1]=player;
      const spacing=13,start=48,finish=457,count=isHurdles?(short?5:10):0;
      const barHeight=clamp(Math.round((Number(this.race?.hurdleHeight)||(female?.838:.991))*9),7,10);
      const lead=female||eventId==='100mh'?13:13.72, interval=female||eventId==='100mh'?8.5:9.14;
      const obstacles=Array.from({length:count},(_,i)=>start+(lead+i*interval)/distance*(finish-start));
      if(!indoor){rect(c,0,110,W,150,'#a8b984');rect(c,0,117,W,9,'#ddd0a6');}
      rect(c,17,137,466,115,indoor?'#3b6578':'#bf7963');rect(c,18,138,464,112,indoor?'#648b9e':'#d58c70');
      for(let i=0;i<=8;i++)line(c,[[18,141+i*spacing],[482,141+i*spacing]],indoor?'#d7e4d7':'#f0cca0');
      line(c,[[start,141],[start,245]],'#f7e9cb',2);
      line(c,[[finish,141],[finish,245]],'#fff0d1',2);
      rect(c,finish+4,141,3,104,'#f4d5a3');
      c.font='6px monospace';c.textAlign='center';c.fillStyle='#48644f';
      c.fillText('START',start,132);c.fillText(distance+' m',finish,132);
      for(let i=0;i<obstacles.length;i++)c.fillText(String(i+1),obstacles[i],132);
      for(let lane=0;lane<8;lane++){c.fillStyle='#ffe6bd';c.textAlign='left';c.fillText(String(lane+1),24,149+lane*spacing);}
      let playerCleared=0;
      competitors.forEach((athlete,index)=>{
        const y=148+index*spacing, color=athlete.color||PALETTE[index%PALETTE.length], rank=Number(athlete.place)||index+1;
        const x=start+p*(finish+24-start-(rank-1)*3), skin=athlete.skinColor||'#efc397';
        const cleared=obstacles.filter(h=>x>h+4).length;
        if(athlete===player)playerCleared=cleared;
        // Each hurdle has two uprights and the alternating light / dark crossbar.
        for(const h of obstacles){
          rect(c,h-5,y-barHeight+2,1,barHeight,'#617d79');rect(c,h+5,y-barHeight+2,1,barHeight,'#617d79');
          rect(c,h-7,y+1,5,1,'#617d79');rect(c,h+4,y+1,4,1,'#617d79');
          rect(c,h-5,y-barHeight,11,2,'#fff0c6');rect(c,h-5,y-barHeight,3,2,'#6c9492');rect(c,h+2,y-barHeight,3,2,'#6c9492');
        }
        const nearest=obstacles.reduce((best,h)=>Math.abs(x-h)<Math.abs(x-best)?h:best,obstacles[0]??-100);
        const flight=clamp((x-(nearest-10))/20,0,1), airborne=isHurdles&&Math.abs(x-nearest)<10&&p<1;
        const lift=airborne?Math.sin(flight*Math.PI)*(barHeight+5):0;
        oval(c,x,y+3,5,1.5,'#6f55472b');
        if(airborne){
          c.save();c.translate(Math.round(x),Math.round(y-lift));
          // Lead leg reaches straight over the bar; the trailing knee folds to the side.
          rect(c,-3,-8,5,5,color);rect(c,-2,-7,1,4,'#ffffff55');rect(c,-2,-3,5,3,'#354b57');
          rect(c,1,-2,7,2,skin);rect(c,7,-2,3,2,'#fff0d0');rect(c,-6,-1,5,2,skin);rect(c,-7,-1,2,4,skin);rect(c,-8,2,3,1,'#fff0d0');
          rect(c,-2,-13,5,5,skin);rect(c,-3,-14,6,2,athlete.hairColor||'#43524b');rect(c,2,-11,1,1,'#48524b');
          rect(c,2,-7,6,2,skin);rect(c,-6,-9,3,2,skin);rect(c,-6,-9,2,5,skin);c.restore();
        }else person(c,x,y,color,p>=1?0:time/60+index,1,1,athlete.hairColor||'#43524b',skin,false,athlete.gender||this.race?.gender);
        if(athlete.isPlayer){poly(c,[[x-3,y-lift-19],[x+3,y-lift-19],[x,y-lift-15]],'#fff2bc');}
        c.font='5px monospace';c.fillStyle='#ffe6bd';c.textAlign='left';c.fillText(String(index+1),24,y+1);
      });
      this.drawEventCard(c,title+'  /  '+(p>=1?'フィニッシュ':isHurdles?`${playerCleared} / ${count} 台クリア`:p<.12?'スタート':'フィニッシュへ'),player.name,p);
      if(p>=1&&Number.isFinite(Number(player.value))){
        rect(c,389,19,94,24,'#365746');c.fillStyle='#fff0cb';c.font='bold 12px monospace';c.textAlign='center';c.fillText(Number(player.value).toFixed(2)+' 秒',436,35);
      }
    }

    drawHighJump(c, time, runners, progress) {
      const jumper=runners.find(runner=>runner.isPlayer)||runners[0],p=this.reducedMotion?1:progress;
      const pole=this.race?.eventId==='polevault',value=Number(jumper.value),height=Number.isFinite(value)&&value>0?value:pole?3.4:1.7;
      const color=jumper.color||'#dd8b6a',skin=jumper.skinColor||'#efc397',hair=jumper.hairColor||'#43524b';
      const takeoff=pole?.48:.54,touchdown=pole?.84:.80,barY=pole?100:160;
      const phase=p<.10?'集中':p<.40?'助走':p<takeoff?(pole?'ポールを突く':'カーブから踏み切り'):p<touchdown?(pole?p<.66?'引き上げ・倒立':'バーを越える':'背面跳び'):'クリア！';
      this.drawFieldGround(c);
      // Curved approach marks: a clear J-shaped path into the takeoff.
      if(pole){poly(c,[[22,200],[334,200],[334,230],[22,230]],this.race?.indoor?'#718fa1':'#ce9c76');line(c,[[22,202],[329,202]],'#e7d5ab');line(c,[[22,228],[329,228]],'#e7d5ab');rect(c,325,205,9,13,'#3e5756');}
      else {poly(c,[[22,208],[235,208],[290,198],[318,184],[339,195],[314,221],[261,236],[22,239]],this.race?.indoor?'#718fa1':'#ce9c76');line(c,[[27,212],[232,212],[285,203],[318,188]],'#e2bd90');line(c,[[26,234],[258,231],[309,218],[330,198]],'#e2bd90');}
      for(let i=0;i<8;i++){const x=49+i*27;rect(c,x,221,8,1,'#eed3a4');}
      // A deep foam landing bed, seams, and the striped competition bar.
      poly(c,[[329,175],[422,175],[447,212],[351,212]],'#85b1aa');
      poly(c,[[351,212],[447,212],[447,229],[351,229]],'#527e80');
      poly(c,[[329,175],[351,212],[351,229],[329,190]],'#68958d');
      line(c,[[360,177],[384,211]],'#b8d0b7');line(c,[[391,177],[415,211]],'#b8d0b7');
      rect(c,354,216,89,3,'#679593');rect(c,320,barY-13,3,231-barY,'#e8e5cc');rect(c,320,barY-12,1,230-barY,'#809c90');
      rect(c,419,barY-13,3,229-barY,'#e8e5cc');rect(c,419,barY-12,1,228-barY,'#809c90');
      rect(c,313,217,16,3,'#648275');rect(c,412,215,16,3,'#648275');
      rect(c,322,barY,98,3,'#fff0c3');
      for(let x=322;x<420;x+=14)rect(c,x,barY,7,3,'#d57e65');
      for(let y=barY-8;y<213;y+=7){rect(c,320,y,3,1,'#758f85');rect(c,419,y,3,1,'#758f85');}
      person(c,458,189,'#faf0d4',0,-1,1.6);rect(c,446,167,1,18,'#738873');rect(c,437,167,9,6,'#f8edcf');
      runners.filter(r=>r!==jumper).slice(0,6).forEach((athlete,index)=>person(c,113+index*24,151,athlete.color||PALETTE[index%PALETTE.length],0,1,1.3));
      let x=48,y=pole?219:229;
      if(p>=.1&&p<takeoff){
        const q=(p-.1)/(takeoff-.1);
        if(pole){x=48+(315-48)*q;y=219;}
        else if(q<.65){x=48+(247-48)*q/.65;y=229;}
        else {const turn=(q-.65)/.35;x=247+68*Math.sin(turn*Math.PI/2);y=229-27*(1-Math.cos(turn*Math.PI/2));}
      }
      if(p>=takeoff&&p<touchdown){
        const fly=(p-takeoff)/(touchdown-takeoff);x=315+74*fly;y=(pole?219:202)-(pole?25:8)*fly-Math.sin(fly*Math.PI)*(pole?119:49);
      }
      if(p>=touchdown){x=389;y=195;}
      if(p<takeoff){
        if(pole){const lower=clamp((p-.34)/.14,0,1),angle=-.42+lower*.75,hx=x+5,hy=y-12;line(c,[[hx-32*Math.cos(angle),hy-32*Math.sin(angle)],[hx+63*Math.cos(angle),hy+63*Math.sin(angle)]],'#e9dbb5',2);rect(c,hx-3,hy-2,6,2,'#ba8967');}
        person(c,x,y,color,p<.1?0:time/57,1,2,hair,skin,false,jumper.gender);
      }
      else {
        oval(c,x,202,10,2,'#45696125');
        if(pole&&p<touchdown){
          const fly=(p-takeoff)/(touchdown-takeoff);
          if(fly<.62){
            const controlX=329-76*Math.sin(fly/.62*Math.PI),controlY=151;
            const shaft=Array.from({length:13},(_,i)=>{const q=i/12;return[(1-q)*(1-q)*329+2*(1-q)*q*controlX+q*q*(x+3),(1-q)*(1-q)*212+2*(1-q)*q*controlY+q*q*(y-14)];});
            line(c,shaft,'#eedfba',2);line(c,[[329,212],[323,202]],'#ae8463',2);
          }
          else {line(c,[[297,211],[280-(fly-.62)*32,122+(fly-.62)*80]],'#eedfba',2);}
        }
        c.save();c.translate(Math.round(x),Math.round(y));
        if(pole&&p<touchdown){
          const fly=(p-takeoff)/(touchdown-takeoff);c.rotate(-Math.PI*Math.sin(fly*Math.PI));
          person(c,0,0,color,time/180,1,1.9,hair,skin,false,jumper.gender);
          rect(c,1,-19,3,9,skin);rect(c,-3,-20,3,7,skin);
        }else if(p<touchdown){
          // Shoulders lead, back arches over the bar, then both heels lift clear.
          const fly=(p-takeoff)/(touchdown-takeoff);c.rotate((fly-.5)*.8);
          rect(c,-8,-18,9,6,color);rect(c,-1,-16,10,6,color);rect(c,-6,-17,9,2,'#ffffff44');
          rect(c,7,-15,7,7,skin);rect(c,12,-15,3,7,hair);rect(c,8,-9,1,1,'#46524a');
          rect(c,1,-10,3,8,skin);rect(c,2,-3,6,2,skin);rect(c,7,-16,7,2,skin);
          rect(c,-12,-17,5,5,'#354b57');rect(c,-18,-14,7,3,skin);rect(c,-19,-14,3,8,skin);
          rect(c,-23,-8,6,2,'#fff0d0');rect(c,-14,-13,2,8,skin);rect(c,-17,-5,5,2,'#fff0d0');
        }else {
          // Landing on the upper back compresses the mattress slightly.
          rect(c,-13,-4,18,7,color);rect(c,4,-5,7,7,skin);rect(c,9,-5,3,7,hair);
          rect(c,-18,-4,7,6,'#354b57');rect(c,-20,-13,3,10,skin);rect(c,-24,-14,6,3,'#fff0d0');
          rect(c,-15,-11,3,8,skin);rect(c,-18,-12,6,2,'#fff0d0');rect(c,-2,2,9,2,skin);
        }
        c.restore();
      }
      if(p>=touchdown){
        rect(c,355,116,96,28,'#365746');c.fillStyle='#d1dfb4';c.font='6px sans-serif';c.textAlign='center';c.fillText('CLEAR',403,126);
        c.fillStyle='#fff0cb';c.font='bold 12px monospace';c.fillText(height.toFixed(2)+' m',403,139);
        rect(c,439,164,10,7,'#fff3d2');
      }
      this.drawEventCard(c,(pole?'棒高跳':'走高跳')+'  /  '+phase,jumper.name,p);
    }

    drawRelay(c, time, runners, progress) {
      const p=this.reducedMotion?1:progress,player=runners.find(runner=>runner.isPlayer)||runners[0];
      const playerProgress=clamp(p*(1+(runners.length-(Number(player.place)||runners.indexOf(player)+1))*.006),0,1);
      const leg=Math.min(3,Math.floor(playerProgress*4)), members=Array.isArray(player.members)?player.members:[];
      const competitors=runners.slice(0,8);if(!competitors.includes(player))competitors[competitors.length-1]=player;
      const sprites=[];
      competitors.forEach((team,index)=>{
        const lane=index*5/Math.max(1,competitors.length-1),rank=Number(team.place)||index+1,teamProgress=clamp(p*(1+(runners.length-rank)*.006),0,1);
        const teamLeg=Math.min(3,Math.floor(teamProgress*4)),teamMembers=Array.isArray(team.members)?team.members:[];
        const member=teamMembers[teamLeg]||{},color=member.color||team.color||PALETTE[index%PALETTE.length];
        const phase=.505+teamProgress,point=this.trackPoint(phase,lane);
        sprites.push({x:point.x,y:point.y,dx:point.dx,color,team,member,leg:teamLeg,waiting:false,index});
        // The outgoing runners wait just before each of the three exchange zones.
        for(let next=teamLeg+1;next<4;next++){
          const waiting=this.trackPoint(.505+next*.25+.007,lane),nextMember=teamMembers[next]||{};
          sprites.push({...waiting,color:nextMember.color||team.color||PALETTE[index%PALETTE.length],team,member:nextMember,leg:next,waiting:true,index});
        }
        const towardExchange=teamProgress*4-teamLeg;
        if(teamLeg<3&&towardExchange>.87){
          const destination=this.trackPoint(.505+(teamLeg+1)*.25+.007,lane);
          if(team.isPlayer){oval(c,destination.x,destination.y+1,8,3,'#f4d893aa');}
        }
      });
      // Small gold markers identify the three baton zones around the oval.
      for(let station=1;station<4;station++){
        const inside=this.trackPoint(.505+station*.25,0),outside=this.trackPoint(.505+station*.25,5);
        line(c,[[inside.x,inside.y],[outside.x,outside.y]],'#f8df9b',2);
        c.font='bold 7px monospace';c.textAlign='center';c.fillStyle='#fff0ca';
        rect(c,outside.x-5,outside.y-20,10,10,'#456953');c.fillStyle='#fff0ca';c.fillText(String(station+1),outside.x,outside.y-12);
      }
      sprites.sort((a,b)=>a.y-b.y).forEach(sprite=>{
        const {x,y,dx,color,member,team,index}=sprite;
        person(c,x,y,color,sprite.waiting||p>=1?0:time/78+index,dx>0?1:-1,1,member.hairColor||'#43524b',member.skinColor||'#efc397');
        if(!sprite.waiting){
          const side=dx>0?1:-1;rect(c,x+side*4,y-7,2,5,'#f6d16f');rect(c,x+side*4,y-7,2,1,'#fff2bc');
          if(team.isPlayer)poly(c,[[x-3,y-19],[x+3,y-19],[x,y-15]],'#fff2bc');
        }else if(team.isPlayer){c.font='5px monospace';c.textAlign='center';c.fillStyle='#fff0cd';c.fillText(String(sprite.leg+1),x,y-15);}
      });
      // The four-person lineup remains visible throughout, so every baton handoff is legible.
      rect(c,14,13,472,43,'#365b4eea');rect(c,15,14,470,41,'#456b54');
      c.textAlign='left';c.fillStyle='#d2dfb7';c.font='6px sans-serif';c.fillText('4×100mリレー  /  '+(p>=1?'フィニッシュ':`第${leg+1}走`),23,25);
      c.textAlign='right';c.fillStyle='#fff0cc';c.font='bold 8px sans-serif';
      const fractional=playerProgress*4-leg, exchanging=leg<3&&fractional>.78;
      c.fillText(p>=1&&Number.isFinite(Number(player.value))?Number(player.value).toFixed(2)+' 秒':exchanging?'バトンを、次の仲間へ':String(player.name||'チームでつなぐ400m').slice(0,22),476,26);
      for(let i=0;i<4;i++){
        const x=23+i*114,active=leg===i,color=members[i]?.color||player.color||'#e5b45d';
        rect(c,x,33,107,16,active?'#ead4a2':'#365846');rect(c,x+2,35,3,12,color);
        c.font=(active?'bold ':'')+'6px sans-serif';c.fillStyle=active?'#385448':'#d3dfb7';c.textAlign='left';
        let label=`${i+1}  ${members[i]?.name||`第${i+1}走者`}`;
        while(label.length>1&&c.measureText(label).width>94)label=label.slice(0,-1);
        c.fillText(label,x+8,43);rect(c,x,51,107*clamp(playerProgress*4-i,0,1),2,'#f1c477');
      }
      // A close-up makes the actual passing of the baton unmistakable.
      if(exchanging&&!this.reducedMotion){
        rect(c,158,164,184,39,'#365b4ef0');rect(c,159,165,182,37,'#456b54');
        c.font='6px sans-serif';c.fillStyle='#f5e6bd';c.textAlign='center';c.fillText(`第${leg+1}走 → 第${leg+2}走`,250,175);
        const q=clamp((fractional-.78)/.22,0,1),left=225+q*7,right=266-q*7;
        person(c,left,195,members[leg]?.color||player.color||'#e5b45d',time/85,1,1.6);
        person(c,right,195,members[leg+1]?.color||player.color||'#e5b45d',time/85+2,1,1.6);
        line(c,[[left+5,186],[246,184]],'#efc397',2);line(c,[[right-5,185],[253,184]],'#efc397',2);
        rect(c,245+q*5,182,7,2,'#f8d373');
      }
    }

    draw(time) {
      if(!this.ctx || !this.alive) return;
      const c=this.g, t=this.reducedMotion?0:time/1000;
      c.imageSmoothingEnabled=false;c.clearRect(0,0,W,H);c.drawImage(this.landscape,0,0);
      this.hitAreas=[];
      const athletes=Array.isArray(this.state.athletes)?this.state.athletes:Array.isArray(this.state.team)?this.state.team:[];
      const raceMode=this.mode==='race' && this.race?.runners?.length;
      const runners=raceMode?this.race.runners:athletes.length?athletes:Array.from({length:6},(_,i)=>({id:`demo-${i}`,name:'陸上部員',color:PALETTE[i]}));
      const raceProgress=raceMode?clamp((time-this.raceStarted)/(this.race.duration||8000),0,1):0;
      if(raceMode&&this.race.indoor)this.drawIndoorHall(c);
      const eventRenderer=raceMode?({longjump:'drawLongJump',triplejump:'drawLongJump','100m':'drawHurdles','60m':'drawHurdles','60mh':'drawHurdles','100mh':'drawHurdles','110mh':'drawHurdles',highjump:'drawHighJump',polevault:'drawHighJump',relay:'drawRelay'})[this.race.eventId]:null;
      if(eventRenderer){
        this[eventRenderer](c,time,runners,raceProgress);
        this.ctx.imageSmoothingEnabled=false;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.ctx.drawImage(this.pixel,0,0,this.canvas.width,this.canvas.height);
        return;
      }
      const sprites=runners.slice(0,12).map((a,i)=>{
        const lane=raceMode?i*5/Math.max(1,runners.length-1):i%6, energy=Number.isFinite(a.energy)?clamp(a.energy,0,100):100;
        const speed=(.010+((Number(a.stats?.speed ?? a.speed)||50)/100)*.006)*(.55+energy*.0045);
        let phase=i*.126+t*speed;
        if(raceMode){const rank=Number(a.place)||i+1;phase=.505+Math.min(1,raceProgress*(1+(runners.length-rank)*.006));}
        const resting=!raceMode&&(a.training==='rest'||a.injury>0);
        const p=resting?{x:69+(i%5)*8,y:234-Math.floor(i/5)*12,dx:1}:this.trackPoint(phase,lane);
        return{a,i,lane,...p,phase,resting};
      }).sort((a,b)=>a.y-b.y);
      for(const s of sprites){
        const a=s.a, color=a.color||a.kitColor||a.uniformColor||PALETTE[s.i%PALETTE.length];
        const isSelected=this.hovered?.id===a.id||this.selectedId===a.id;
        const stopped=s.resting||(raceMode&&raceProgress>=1);
        person(c,s.x,s.y,color,stopped?0:t*11+s.i*2,s.dx>0?1:-1,1, a.hairColor||'#43524b',a.skinColor||'#efc397',isSelected,a.gender);
        if(!raceMode && a.injury>0){rect(c,s.x-1,s.y-17,2,5,'#bf705e');rect(c,s.x-3,s.y-15,6,1,'#bf705e');}
        if(raceMode && a.isPlayer){poly(c,[[s.x-2,s.y-16],[s.x+2,s.y-16],[s.x,s.y-13]],'#f8e6a5');}
        this.hitAreas.push({x:s.x,y:s.y,id:a.id,name:a.name||'陸上部員'});
      }
      // A couple of students train on the grass. Their placement leaves the oval easy to read.
      person(c,196+Math.sin(t*.5)*2,175,'#faf0d4',t*7,1,.9);person(c,287,202,'#e7a177',t*3,-1,.9);
      // Drifting petals / leaves make a quiet, lively scene, with no rapid flashing.
      if(!this.reducedMotion && this.season!=='summer'){
        for(let i=0;i<13;i++){
          const x=(hash(i+61)*500+t*(3+hash(i+42)*4))%500, y=72+(hash(i+93)*180+t*(1+hash(i+6)))%184;
          const color=this.season==='spring'?'#f9d6c3':this.season==='winter'?'#eceddc':'#e4bc72';
          rect(c,x,y,2,1,color);
        }
      }
      // A subtle wavering windsock on the far field.
      rect(c,407,93,1,22,'#7e9180');poly(c,[[408,92],[419+Math.sin(t*2)*2,94],[419+Math.sin(t*2)*2,98],[408,96]],'#e9a476');rect(c,410,94,3,2,'#f5e2b5');
      if(this.hovered){
        const h=this.hitAreas.find(s=>s.id===this.hovered.id);
        if(h){c.font='6px sans-serif';const label=h.name, width=Math.min(112,c.measureText(label).width+10), x=clamp(h.x-width/2,3,W-width-3), y=h.y-24;
          rect(c,x,y,width,11,'#294b42');rect(c,x+1,y+1,width-2,9,'#355a4b');c.fillStyle='#fff4d8';c.textAlign='center';c.fillText(label,x+width/2,y+7.5);}
      }
      this.ctx.imageSmoothingEnabled=false;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.ctx.drawImage(this.pixel,0,0,this.canvas.width,this.canvas.height);
    }

    destroy() {this.alive=false;cancelAnimationFrame(this.frame);this.observer?.disconnect();window.removeEventListener('resize',this.onResize);this.canvas.removeEventListener('pointermove',this.onPointerMove);this.canvas.removeEventListener('pointerleave',this.onLeave);this.canvas.removeEventListener('click',this.onClick);}

    static drawPortrait(canvas, athlete = {}) {
      const c=canvas.getContext('2d'), size=40, pixel=document.createElement('canvas');pixel.width=size;pixel.height=size;const p=pixel.getContext('2d');
      const key=String(athlete.id||athlete.name||'athlete').split('').reduce((a,b)=>a+b.charCodeAt(0),0), color=athlete.color||athlete.kitColor||PALETTE[key%PALETTE.length];
      rect(p,0,0,40,40,'#e5e9ce');rect(p,0,29,40,11,'#d1d9b8');
      rect(p,6,30,28,12,color);rect(p,10,27,20,7,color);rect(p,14,26,12,8,athlete.skinColor||'#eac092');
      rect(p,12,11,17,15,athlete.skinColor||'#eac092');rect(p,10,16,3,6,athlete.skinColor||'#eac092');rect(p,28,16,3,6,athlete.skinColor||'#eac092');
      const hair=athlete.hairColor||['#3e4e45','#5a493d','#4d4b48'][key%3];
      rect(p,12,6,16,6,hair);rect(p,10,9,20,7,hair);rect(p,11,13,4,6,hair);rect(p,26,13,4,7,hair);
      if(isFemale(athlete.gender)){rect(p,29,10,4,12,hair);rect(p,30,20,4,5,hair);rect(p,28,11,5,2,color);rect(p,11,18,3,5,hair);}
      rect(p,15,13,4,3,hair);rect(p,22,13,3,2,hair);rect(p,16,19,2,2,'#3c4a40');rect(p,24,19,2,2,'#3c4a40');rect(p,19,24,4,1,'#b97f6a');
      rect(p,13,22,3,1,'#d99d7b');rect(p,26,22,2,1,'#d99d7b');rect(p,17,30,7,3,'#f9f0d0');rect(p,13,34,3,6,'#ffffff5e');
      c.imageSmoothingEnabled=false;c.clearRect(0,0,canvas.width,canvas.height);c.drawImage(pixel,0,0,canvas.width,canvas.height);
    }
  }

  globalThis.TrackScene=TrackScene;
})();
