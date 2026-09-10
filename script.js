(function(){
"use strict";

/* ============================================================
   DATA
   ============================================================ */

var STORAGE_KEY = 'rpg_state_v1';

var SETTINGS_LIST = [
  {key:'textureQuality',   label:'Texture Quality',    desc:'Lower to use blurrier, smaller textures that load faster and use less memory.', mult:1.00},
  {key:'shadowQuality',    label:'Shadow Quality',     desc:'Lower to reduce or disable dynamic shadows, one of the heaviest effects on weak GPUs.', mult:0.75},
  {key:'lightingQuality',  label:'Lighting Quality',   desc:'Lower for simpler, flatter lighting instead of dynamic light sources.', mult:0.85},
  {key:'particleQuality',  label:'Particle Quality',   desc:'Lower to reduce smoke, sparks, and other particle effects.', mult:0.80},
  {key:'effectsQuality',   label:'Effects Quality',    desc:'Lower to simplify general visual effects across the game.', mult:0.85},
  {key:'renderDistance',   label:'Render Distance',    desc:'Lower to load less of the map around you at once.', mult:1.10},
  {key:'reflectionQuality',label:'Reflection Quality', desc:'Lower to remove reflective surfaces like water and glass.', mult:0.70},
  {key:'ambientEffects',   label:'Ambient Effects',    desc:'Lower to reduce background atmospheric effects like fog and dust.', mult:0.90},
  {key:'postProcessing',   label:'Post Processing',    desc:'Lower to disable color grading and screen-wide visual filters.', mult:0.75},
  {key:'bloom',            label:'Bloom',              desc:'Lower to reduce the glow around bright light sources.', mult:0.70},
  {key:'blur',             label:'Blur',               desc:'Lower to remove motion blur and depth-of-field blur.', mult:0.65},
  {key:'antiAliasing',     label:'Anti-Aliasing',      desc:'Lower to stop smoothing jagged edges, trading sharpness for speed.', mult:0.80},
  {key:'waterQuality',     label:'Water Quality',      desc:'Lower to simplify water surfaces and remove wave detail.', mult:0.85},
  {key:'terrainDetail',    label:'Terrain Detail',     desc:'Lower to flatten and simplify ground and terrain detail.', mult:0.95},
  {key:'foliageDetail',    label:'Foliage Detail',     desc:'Lower to reduce grass, trees, and other scenery detail.', mult:0.90},
  {key:'characterDetail',  label:'Character Detail',   desc:'Lower to simplify avatar and NPC detail.', mult:1.00},
  {key:'environmentDetail',label:'Environment Detail', desc:'Lower to simplify buildings and world geometry.', mult:1.00},
  {key:'modelDetail',      label:'Model Detail',       desc:'Lower to reduce the polygon detail of objects and tools.', mult:1.00},
  {key:'animationQuality', label:'Animation Quality',  desc:'Lower to simplify character and object animations.', mult:1.05},
  {key:'uiEffects',        label:'UI Effects',         desc:'Lower to remove menu animations and interface flourishes.', mult:1.15}
];

var MODES = ['Normal','Low','Potato','Extreme Potato','Absolute Potato'];
var MODE_TIER = {'Normal':96,'Low':68,'Potato':42,'Extreme Potato':18,'Absolute Potato':3};
var MODE_EMOJI = {'Normal':'🥔','Low':'🥔🥔','Potato':'🥔🥔🥔','Extreme Potato':'🥔🥔🥔🥔','Absolute Potato':'🥔🥔🥔🥔🥔'};
var MODE_DESC = {
  'Normal':'Full visual quality. No performance changes applied.',
  'Low':'A light trim on the heaviest effects. Barely noticeable, small FPS gain.',
  'Potato':'A solid, balanced cut across the board. The recommended starting point for most slow computers.',
  'Extreme Potato':'Aggressive cuts everywhere. Roblox will look plain, but should run much smoother.',
  'Absolute Potato':'Everything reduced as far as it goes. Maximum performance, minimum visuals.'
};

var STAGES = ['Analyzing settings','Reducing effects','Lowering shadows','Reducing particles','Optimizing visual quality','Applying Potato Mode','Complete'];

// Real Roblox text-size options. These only affect GuiObjects the developer
// has tagged "PotatoScalable" in their own Roblox place -- there is no API
// to resize the OS/app-level UI, so this is scoped honestly.
var TEXT_SIZE_OPTIONS = ['Default','Large','Extra Large','Maximum'];
var TEXT_SIZE_SCALE = {'Default':1.0, 'Large':1.15, 'Extra Large':1.3, 'Maximum':1.5};

// What Roblox genuinely lets a script control vs. not -- mirrors
// Configuration.lua on the Roblox side exactly, so this page never
// claims something the Luau component can't actually do.
var AUTO_APPLIED_ITEMS = [
  'Personal graphics quality level (SavedQualityLevel)',
  'Shadows + rendering technology (server-wide)',
  'Post-processing effects (Bloom / SunRays / DoF / Color Correction)',
  'Terrain grass & rock decoration',
  'Streaming render-distance radius',
  'Tagged decorative particle/beam/trail effects',
  'Text size on your tagged custom UI'
];
var MANUAL_ONLY_ITEMS = [
  'Overall app resolution / display scaling',
  'V-Sync / frame rate cap',
  'Fullscreen toggle',
  'Texture quality',
  'OS-level UI text size outside this experience'
];

var OPT_KEY = 'appSettings';

function computePresetSettings(mode){
  var tier = MODE_TIER[mode] !== undefined ? MODE_TIER[mode] : 96;
  var out = {};
  SETTINGS_LIST.forEach(function(s){
    var v = Math.round(tier * s.mult);
    out[s.key] = Math.max(0, Math.min(100, v));
  });
  return out;
}

function defaultProfiles(){
  var defs = [
    {id:'global',   name:'General Roblox (All Games)', mode:'Normal'},
    {id:'brookhaven',name:'Brookhaven 🏡',              mode:'Low'},
    {id:'bloxfruits',name:'Blox Fruits',                mode:'Potato'},
    {id:'mm2',       name:'Murder Mystery 2',           mode:'Normal'},
    {id:'adoptme',   name:'Adopt Me!',                  mode:'Low'},
    {id:'bedwars',   name:'BedWars',                    mode:'Extreme Potato'},
    {id:'arsenal',   name:'Arsenal',                    mode:'Potato'}
  ];
  return defs.map(function(d){
    return {id:d.id, name:d.name, mode:d.mode, settings:computePresetSettings(d.mode)};
  });
}

function defaultState(){
  var profiles = defaultProfiles();
  var active = profiles[0];
  return {
    activeProfileId: active.id,
    activeMode: active.mode,
    settings: Object.assign({}, active.settings),
    profiles: profiles,
    history: [],
    lastExportedAt: null,
    appSettings: {
      theme:'slate',
      accent:'#e8a33d',
      animationIntensity:'normal', // off | reduced | normal | high
      performanceMode:false,
      defaultProfileMode:'Potato',
      notifications:true,
      autoSave:true,
      accessibility:false,
      reducedMotion:false,
      compactInterface:false,
      soundEffects:false,
      robloxTextSize:'Default' // Default | Large | Extra Large | Maximum
    }
  };
}

var state = null;

function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw){ state = defaultState(); saveState(); return; }
    var parsed = JSON.parse(raw);
    var d = defaultState();
    // shallow-merge to survive schema changes / missing keys
    state = {
      activeProfileId: parsed.activeProfileId || d.activeProfileId,
      activeMode: parsed.activeMode || d.activeMode,
      settings: Object.assign({}, d.settings, parsed.settings || {}),
      profiles: (Array.isArray(parsed.profiles) && parsed.profiles.length) ? parsed.profiles : d.profiles,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      lastExportedAt: parsed.lastExportedAt || null,
      appSettings: Object.assign({}, d.appSettings, parsed.appSettings || {})
    };
  }catch(e){
    state = defaultState();
  }
}

function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ /* storage unavailable, continue in-memory */ }
}

function getActiveProfile(){
  var p = state.profiles.filter(function(p){ return p.id === state.activeProfileId; })[0];
  return p || state.profiles[0];
}

/* ============================================================
   PERFORMANCE ESTIMATION (clearly labelled as estimates)
   ============================================================ */

function avgSettings(settingsObj){
  var total = 0;
  SETTINGS_LIST.forEach(function(s){ total += (settingsObj[s.key] !== undefined ? settingsObj[s.key] : 50); });
  return total / SETTINGS_LIST.length;
}

function estimatePerf(settingsObj){
  var avg = avgSettings(settingsObj);
  var fps = clamp(15 + (100 - avg) * 0.8, 15, 95);
  var gpu = clamp(avg * 0.9 + 5, 5, 100);
  var cpu = clamp(avg * 0.5 + 20, 20, 90);
  var mem = clamp(400 + avg * 6, 400, 1800);
  var score = clamp(100 - avg, 0, 100);
  return {avg:avg, fps:Math.round(fps), gpu:Math.round(gpu), cpu:Math.round(cpu), mem:Math.round(mem), score:Math.round(score)};
}

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function statusForAvg(avg){
  if (avg >= 80) return {label:'Not Optimized', color:'var(--danger)'};
  if (avg >= 50) return {label:'Lightly Optimized', color:'var(--accent)'};
  if (avg >= 25) return {label:'Optimized', color:'var(--accent-2)'};
  return {label:'Fully Optimized', color:'var(--accent-2)'};
}

/* ============================================================
   DOM HELPERS
   ============================================================ */

function el(tag, attrs, children){
  var e = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function(k){
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function(c){ if (c) e.appendChild(c); });
  return e;
}
function txt(s){ return document.createTextNode(s); }
function q(sel){ return document.querySelector(sel); }
function qa(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }

/* ============================================================
   TOASTS
   ============================================================ */

function toast(message){
  if (!state.appSettings.notifications) return;
  var root = q('#toastRoot');
  var t = el('div', {class:'toast'}, [txt(message)]);
  root.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3200);
}

/* ============================================================
   SOUND
   ============================================================ */

var audioCtx = null;
function playTone(freq, dur){
  if (!state.appSettings.soundEffects) return;
  try{
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  }catch(e){ /* audio unsupported, ignore */ }
}
function soundClick(){ playTone(520, 0.08); }
function soundSuccess(){ playTone(660, 0.12); setTimeout(function(){ playTone(880, 0.14); }, 90); }

/* ============================================================
   MODAL
   ============================================================ */

function openModal(opts){
  var back = el('div', {class:'modal-back'});
  var box = el('div', {class:'modal-box'});
  box.appendChild(el('h3', {}, [txt(opts.title)]));
  if (opts.body) box.appendChild(el('p', {}, [txt(opts.body)]));
  var input = null;
  if (opts.input){
    input = el('input', {type:'text', value:opts.input.value || ''});
    box.appendChild(input);
  }
  var actions = el('div', {class:'modal-actions'});
  (opts.buttons || []).forEach(function(b){
    var btn = el('button', {class:'btn btn-sm ' + (b.variant || 'btn-ghost'), onclick:function(){
      if (b.onClick) b.onClick(input ? input.value : null);
      back.remove();
    }}, [txt(b.label)]);
    actions.appendChild(btn);
  });
  box.appendChild(actions);
  back.appendChild(box);
  back.addEventListener('click', function(e){ if (e.target === back) back.remove(); });
  document.addEventListener('keydown', function esc(e){
    if (e.key === 'Escape'){ back.remove(); document.removeEventListener('keydown', esc); }
  });
  q('#modalRoot').appendChild(back);
  if (input){ input.focus(); input.select(); }
}

/* ============================================================
   NAV / ROUTING
   ============================================================ */

var NAV_ITEMS = [
  {id:'dashboard', label:'Dashboard', icon:'▣'},
  {id:'graphics', label:'Graphics', icon:'▤'},
  {id:'potato', label:'Potato Mode', icon:'🥔'},
  {id:'textsize', label:'Text Size', icon:'🔠'},
  {id:'profiles', label:'Profiles', icon:'▥'},
  {id:'performance', label:'Performance', icon:'▲'},
  {id:'optimizer', label:'Optimizer', icon:'⚡'},
  {id:'connection', label:'Roblox Sync', icon:'🔗'},
  {id:'history', label:'History', icon:'◷'},
  {id:'settings', label:'Settings', icon:'⚙'}
];
var currentSection = 'dashboard';

function renderNav(){
  var nav = q('#navList');
  nav.innerHTML = '';
  NAV_ITEMS.forEach(function(item){
    var btn = el('button', {
      class:'nav-item' + (item.id === currentSection ? ' active' : ''),
      onclick:function(){ showSection(item.id); closeMobileSidebar(); }
    }, [el('span', {class:'nav-icon'}, [txt(item.icon)]), txt(item.label)]);
    nav.appendChild(btn);
  });
}

function showSection(id){
  currentSection = id;
  qa('.page').forEach(function(p){ p.classList.remove('active'); });
  var target = q('#sec-' + id);
  if (target) target.classList.add('active');
  renderNav();
  renderSection(id);
  window.scrollTo({top:0, behavior: state.appSettings.reducedMotion ? 'auto' : 'smooth'});
}

function renderSection(id){
  if (id === 'dashboard') renderDashboard();
  else if (id === 'graphics') renderGraphics();
  else if (id === 'potato') renderPotato();
  else if (id === 'textsize') renderTextSize();
  else if (id === 'profiles') renderProfiles();
  else if (id === 'performance') renderPerformance();
  else if (id === 'optimizer') renderOptimizerPage();
  else if (id === 'connection') renderConnection();
  else if (id === 'history') renderHistory();
  else if (id === 'settings') renderSettingsPage();
}

function renderAll(){
  applyAppSettingsToDom();
  renderNav();
  NAV_ITEMS.forEach(function(item){ renderSection(item.id); });
  qa('.page').forEach(function(p){ p.classList.remove('active'); });
  var t = q('#sec-' + currentSection); if (t) t.classList.add('active');
}

function closeMobileSidebar(){
  q('#sidebar').classList.remove('open');
  q('#sidebarBackdrop').classList.remove('show');
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard(){
  var sec = q('#sec-dashboard');
  sec.innerHTML = '';
  var profile = getActiveProfile();
  var perf = estimatePerf(state.settings);
  var normalPerf = estimatePerf(computePresetSettings('Normal'));
  var improvement = Math.max(0, Math.round(((perf.fps - normalPerf.fps) / normalPerf.fps) * 100));
  var status = statusForAvg(perf.avg);

  var hero = el('div', {class:'hero'}, [
    el('div', {}, [
      el('h1', {}, [txt('🥔 Roblox Potato Graphics')]),
      el('p', {}, [txt('Turn your Roblox visuals down to whatever your computer can actually handle. Built for Roblox, and only Roblox.')])
    ]),
    el('button', {class:'btn btn-accent btn-big', onclick:function(){ showSection('optimizer'); soundClick(); }}, [txt('⚡ Optimize Roblox Graphics')])
  ]);
  sec.appendChild(hero);

  var statGrid = el('div', {class:'grid grid-4'});
  statGrid.appendChild(statCard('Current Profile', profile.name, profile.mode));
  statGrid.appendChild(statCard('Optimization Status', status.label, 'Based on current settings', status.color));
  statGrid.appendChild(statCard('Est. Performance Gain', '+' + improvement + '%', 'vs. Normal settings (estimated)'));
  statGrid.appendChild(statCard('Graphics Quality', Math.round(perf.avg) + ' / 100', 'Lower = lighter on your PC'));
  sec.appendChild(statGrid);

  // quick settings
  var quick = el('div', {class:'glass', style:'margin-top:18px;'});
  quick.appendChild(el('h3', {style:'font-size:15px;margin-bottom:4px;'}, [txt('Quick settings')]));
  quick.appendChild(el('p', {style:'font-size:12.5px;color:var(--text-dim);margin:0;'}, [txt('Instantly apply a mode to your active profile (' + profile.name + ').')]));
  var chipRow = el('div', {class:'chip-row'});
  MODES.forEach(function(m){
    var chip = el('button', {
      class:'chip' + (state.activeMode === m ? ' active' : ''),
      onclick:function(){ applyModeInstant(m); }
    }, [txt(m)]);
    chipRow.appendChild(chip);
  });
  quick.appendChild(chipRow);
  sec.appendChild(quick);

  // before/after
  sec.appendChild(el('h2', {style:'font-size:18px;margin:26px 0 4px;'}, [txt('Before vs. Potato Mode')]));
  sec.appendChild(el('p', {style:'font-size:13px;color:var(--text-dim);margin:0 0 14px;'}, [txt('An illustrative comparison of what dropping visual quality looks like — not an actual in-game screenshot.')]));
  sec.appendChild(buildCompareWidget());

  // recent history
  var histCard = el('div', {class:'glass', style:'margin-top:22px;'});
  histCard.appendChild(el('h3', {style:'font-size:15px;margin-bottom:10px;'}, [txt('Recent optimizations')]));
  var recent = state.history.slice(-5).reverse();
  if (!recent.length){
    histCard.appendChild(el('p', {style:'font-size:13px;color:var(--text-faint);'}, [txt('Nothing yet — run the optimizer to see your history here.')]));
  } else {
    recent.forEach(function(h){ histCard.appendChild(historyRow(h)); });
  }
  sec.appendChild(histCard);
}

function statCard(label, value, sub, color){
  return el('div', {class:'glass hero-stat-card'}, [
    el('div', {class:'stat-label'}, [txt(label)]),
    el('div', {class:'stat-value', style: color ? ('color:' + color) : ''}, [txt(value)]),
    el('div', {class:'stat-sub'}, [txt(sub)])
  ]);
}

function historyRow(h){
  var d = new Date(h.timestamp);
  var when = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return el('div', {class:'hist-row'}, [
    el('div', {}, [
      el('div', {class:'hist-main'}, [txt(h.profileName + ' → ' + h.mode)]),
      el('div', {class:'hist-sub'}, [txt(when)])
    ]),
    el('div', {class:'hist-score'}, [txt('Score ' + h.score)])
  ]);
}

/* ---- before/after compare widget ---- */
function buildCompareWidget(){
  var wrap = el('div', {class:'compare-wrap'});
  var before = el('div', {class:'compare-layer scene-before'});
  before.appendChild(el('div', {class:'scene-sun'}));
  var beforeBlocks = [
    {left:'8%', width:'10%', height:'30%', color:'#3d6b3f'},
    {left:'22%', width:'7%', height:'22%', color:'#43784a'},
    {left:'62%', width:'12%', height:'26%', color:'#3d6b3f'},
    {left:'78%', width:'8%', height:'34%', color:'#43784a'}
  ];
  beforeBlocks.forEach(function(b){
    before.appendChild(el('div', {class:'scene-block', style:'left:'+b.left+';width:'+b.width+';height:'+b.height+';background:'+b.color+';filter:drop-shadow(0 6px 10px rgba(0,0,0,.4));'}));
  });
  for (var i=0;i<10;i++){
    before.appendChild(el('div', {class:'scene-particle', style:'left:'+(5+i*9)+'%;top:'+(15+((i*13)%40))+'%;width:5px;height:5px;'}));
  }
  before.appendChild(el('div', {class:'compare-tag', style:'left:12px;'}, [txt('NORMAL')]));

  var after = el('div', {class:'compare-layer scene-after'});
  after.appendChild(el('div', {class:'scene-sun'}));
  beforeBlocks.forEach(function(b){
    after.appendChild(el('div', {class:'scene-block', style:'left:'+b.left+';width:'+b.width+';height:'+b.height+';background:#2b3f28;'}));
  });
  after.appendChild(el('div', {class:'compare-tag', style:'right:12px;'}, [txt('POTATO MODE')]));

  var clipId = 'clip-after';
  after.style.clipPath = 'inset(0 0 0 50%)';

  var line = el('div', {class:'compare-line', style:'left:50%;'});
  var handle = el('div', {class:'compare-handle', style:'left:50%;'}, [txt('⇔')]);
  var range = el('input', {type:'range', min:'0', max:'100', value:'50', class:'compare-divider-input', 'aria-label':'Comparison slider'});

  range.addEventListener('input', function(){
    var v = range.value;
    after.style.clipPath = 'inset(0 0 0 ' + v + '%)';
    line.style.left = v + '%';
    handle.style.left = v + '%';
  });

  wrap.appendChild(before);
  wrap.appendChild(after);
  wrap.appendChild(line);
  wrap.appendChild(handle);
  wrap.appendChild(range);
  return wrap;
}

/* ============================================================
   GRAPHICS SETTINGS PAGE
   ============================================================ */

function renderGraphics(){
  var sec = q('#sec-graphics');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Graphics Settings', 'Fine-tune every visual setting individually, or start from a preset below. Editing any slider switches your profile to Custom.'));

  var presetRow = el('div', {class:'chip-row', style:'margin-bottom:20px;'});
  MODES.forEach(function(m){
    presetRow.appendChild(el('button', {
      class:'chip' + (state.activeMode === m ? ' active' : ''),
      onclick:function(){ applyModeInstant(m); }
    }, [txt(m)]));
  });
  sec.appendChild(presetRow);

  var panel = el('div', {class:'glass'});
  SETTINGS_LIST.forEach(function(s){
    var row = el('div', {class:'setting-row'});
    var val = state.settings[s.key] !== undefined ? state.settings[s.key] : 50;
    var top = el('div', {class:'setting-top'}, [
      el('b', {}, [txt(s.label)]),
      el('span', {class:'setting-val'}, [txt(val + ' / 100')])
    ]);
    row.appendChild(top);
    row.appendChild(el('div', {class:'setting-desc'}, [txt(s.desc)]));
    var input = el('input', {type:'range', min:'0', max:'100', value:String(val)});
    input.addEventListener('input', function(key, topEl){
      return function(){
        state.settings[key] = parseInt(this.value, 10);
        state.activeMode = 'Custom';
        topEl.querySelector('.setting-val').textContent = this.value + ' / 100';
        maybeAutoSave();
        refreshLiveWidgets();
      };
    }(s.key, top));
    row.appendChild(input);
    panel.appendChild(row);
  });
  sec.appendChild(panel);

  var saveRow = el('div', {style:'margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;'});
  saveRow.appendChild(el('button', {class:'btn btn-cyan', onclick:function(){
    saveWorkingSettingsToActiveProfile();
    toast('Saved to ' + getActiveProfile().name);
  }}, [txt('Save to profile')]));
  saveRow.appendChild(el('button', {class:'btn btn-ghost', onclick:function(){
    var normal = computePresetSettings('Normal');
    state.settings = normal; state.activeMode = 'Normal';
    maybeAutoSave(); renderGraphics(); refreshLiveWidgets();
    toast('Reset to Normal');
  }}, [txt('Reset to Normal')]));
  sec.appendChild(saveRow);
}

function maybeAutoSave(){
  if (state.appSettings.autoSave) saveWorkingSettingsToActiveProfile(true);
}

function saveWorkingSettingsToActiveProfile(silent){
  var p = getActiveProfile();
  p.settings = Object.assign({}, state.settings);
  p.mode = state.activeMode;
  saveState();
  if (!silent) refreshLiveWidgets();
}

function refreshLiveWidgets(){
  // cheap re-render of sections that show computed numbers, without losing focus on graphics sliders
  if (currentSection === 'dashboard') renderDashboard();
  if (currentSection === 'performance') renderPerformance();
  if (currentSection === 'potato') renderPotato();
  if (currentSection === 'profiles') renderProfiles();
  if (currentSection === 'connection') renderConnection();
}

/* ============================================================
   POTATO MODE PAGE
   ============================================================ */

function renderPotato(){
  var sec = q('#sec-potato');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Potato Mode', 'Pick an overall aggressiveness level. Each mode configures all 20 graphics settings for you.'));

  var perf = estimatePerf(state.settings);
  var meterCard = el('div', {class:'glass', style:'margin-bottom:20px;'});
  meterCard.appendChild(el('div', {class:'stat-label'}, [txt('Visual quality meter')]));
  var meter = el('div', {class:'meter'});
  var fill = el('div', {style:'width:' + Math.round(perf.avg) + '%;background:linear-gradient(90deg,var(--accent-2),var(--accent));'});
  meter.appendChild(fill);
  meterCard.appendChild(meter);
  meterCard.appendChild(el('div', {class:'stat-sub', style:'margin-top:8px;'}, [txt('Current mode: ' + state.activeMode)]));
  sec.appendChild(meterCard);

  var grid = el('div', {class:'grid grid-3'});
  MODES.forEach(function(m){
    var card = el('button', {
      class:'mode-card' + (state.activeMode === m ? ' selected' : ''),
      onclick:function(){ applyModeInstant(m); }
    }, [
      el('div', {class:'mode-emoji'}, [txt(MODE_EMOJI[m])]),
      el('div', {class:'mode-name'}, [txt(m)]),
      el('div', {class:'mode-desc'}, [txt(MODE_DESC[m])])
    ]);
    grid.appendChild(card);
  });
  sec.appendChild(grid);

  var goRow = el('div', {style:'margin-top:20px;'});
  goRow.appendChild(el('button', {class:'btn btn-accent btn-big', onclick:function(){ showSection('optimizer'); }}, [txt('⚡ Run the optimizer with this mode')]));
  sec.appendChild(goRow);
}

function applyModeInstant(mode){
  state.settings = computePresetSettings(mode);
  state.activeMode = mode;
  maybeAutoSave();
  logHistory(mode);
  soundClick();
  toast('Applied ' + mode + ' to ' + getActiveProfile().name);
  refreshLiveWidgets();
  if (currentSection === 'graphics') renderGraphics();
  if (currentSection === 'potato') renderPotato();
}

/* ============================================================
   TEXT SIZE PAGE
   ============================================================ */

function renderTextSize(){
  var sec = q('#sec-textsize');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Text Size', 'Controls the size of text in your own tagged Roblox UI. Roblox has no API to resize the operating system or app-level UI, so this only affects GuiObjects you tag PotatoScalable in Studio -- it is not a system-wide font size.'));

  var panel = el('div', {class:'glass'});
  var chipRow = el('div', {class:'chip-row'});
  TEXT_SIZE_OPTIONS.forEach(function(opt){
    var chip = el('button', {
      class:'chip' + (state.appSettings.robloxTextSize === opt ? ' active' : ''),
      onclick:function(){
        state.appSettings.robloxTextSize = opt;
        saveState();
        toast('Roblox text size set to ' + opt);
        renderTextSize();
      }
    }, [txt(opt)]);
    chipRow.appendChild(chip);
  });
  panel.appendChild(chipRow);

  var scale = TEXT_SIZE_SCALE[state.appSettings.robloxTextSize];
  var previewRow = el('div', {style:'margin-top:20px;padding-top:16px;border-top:1px solid var(--line);'});
  previewRow.appendChild(el('div', {class:'stat-label'}, [txt('Preview (scale ' + scale.toFixed(2) + '×)')]));
  previewRow.appendChild(el('p', {style:'font-size:' + Math.round(14 * scale) + 'px;margin-top:8px;color:var(--text);'}, [txt('Ready Player One — health, ammo, and menu text at this size.')]));
  panel.appendChild(previewRow);
  sec.appendChild(panel);

  var note = el('div', {class:'glass', style:'margin-top:16px;'});
  note.appendChild(el('p', {style:'font-size:13px;color:var(--text-dim);margin:0;'}, [
    txt('This value is exported with your profile (see Roblox Sync). In-game, the PotatoGraphicsClient script multiplies each tagged label\u2019s original TextSize by this scale, clamped between 8 and 96, whenever a profile is applied.')
  ]));
  sec.appendChild(note);
}

function logHistory(mode){
  var perf = estimatePerf(state.settings);
  state.history.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    profileName: getActiveProfile().name,
    mode: mode,
    score: perf.score
  });
  if (state.history.length > 100) state.history = state.history.slice(-100);
  saveState();
}

/* ============================================================
   PROFILES PAGE
   ============================================================ */

function renderProfiles(){
  var sec = q('#sec-profiles');
  sec.innerHTML = '';
  sec.appendChild(pageHead('My Profiles', 'Keep a different graphics setup for each game. Activate one to make it the profile the rest of the app edits.'));

  var addRow = el('div', {style:'margin-bottom:16px;'});
  addRow.appendChild(el('button', {class:'btn btn-accent', onclick:createProfileFlow}, [txt('+ Create profile')]));
  sec.appendChild(addRow);

  var grid = el('div', {class:'grid grid-3'});
  state.profiles.forEach(function(p){
    var isActive = p.id === state.activeProfileId;
    var card = el('div', {class:'profile-card' + (isActive ? ' active' : '')});
    card.appendChild(el('div', {class:'profile-top'}, [
      el('div', {}, [
        el('div', {class:'profile-name'}, [txt(p.name)]),
        el('div', {class:'profile-mode'}, [txt(p.mode + ' · ' + Math.round(avgSettings(p.settings)) + '/100')])
      ]),
      isActive ? el('span', {class:'badge'}, [el('span', {class:'badge-dot', style:'background:var(--accent-2);'}), txt('Active')]) : null
    ]));
    var actions = el('div', {class:'profile-actions'});
    if (!isActive){
      actions.appendChild(el('button', {class:'icon-btn', onclick:function(){ activateProfile(p.id); }}, [txt('Activate')]));
    }
    actions.appendChild(el('button', {class:'icon-btn', onclick:function(){ renameProfileFlow(p.id); }}, [txt('Rename')]));
    actions.appendChild(el('button', {class:'icon-btn', onclick:function(){ duplicateProfile(p.id); }}, [txt('Duplicate')]));
    actions.appendChild(el('button', {class:'icon-btn', onclick:function(){ resetProfileFlow(p.id); }}, [txt('Reset')]));
    actions.appendChild(el('button', {class:'icon-btn', onclick:function(){ deleteProfileFlow(p.id); }, style:'color:var(--danger);'}, [txt('Delete')]));
    card.appendChild(actions);
    grid.appendChild(card);
  });
  sec.appendChild(grid);
}

function activateProfile(id){
  var p = state.profiles.filter(function(p){ return p.id === id; })[0];
  if (!p) return;
  state.activeProfileId = id;
  state.settings = Object.assign({}, p.settings);
  state.activeMode = p.mode;
  saveState();
  toast('Activated ' + p.name);
  renderAll();
}

function createProfileFlow(){
  openModal({
    title:'Create profile',
    body:'Name your new Roblox game profile.',
    input:{value:''},
    buttons:[
      {label:'Cancel', variant:'btn-ghost'},
      {label:'Create', variant:'btn-accent', onClick:function(name){
        name = (name || '').trim() || 'New Profile';
        var mode = state.appSettings.defaultProfileMode;
        var id = 'p_' + Date.now();
        var p = {id:id, name:name, mode:mode, settings:computePresetSettings(mode)};
        state.profiles.push(p);
        state.activeProfileId = id;
        state.settings = Object.assign({}, p.settings);
        state.activeMode = mode;
        saveState();
        toast('Created ' + name);
        renderAll();
      }}
    ]
  });
}

function renameProfileFlow(id){
  var p = state.profiles.filter(function(p){ return p.id === id; })[0];
  if (!p) return;
  openModal({
    title:'Rename profile',
    input:{value:p.name},
    buttons:[
      {label:'Cancel', variant:'btn-ghost'},
      {label:'Save', variant:'btn-accent', onClick:function(name){
        name = (name || '').trim();
        if (name){ p.name = name; saveState(); toast('Renamed to ' + name); renderAll(); }
      }}
    ]
  });
}

function duplicateProfile(id){
  var p = state.profiles.filter(function(p){ return p.id === id; })[0];
  if (!p) return;
  var copy = {id:'p_' + Date.now(), name:p.name + ' copy', mode:p.mode, settings:Object.assign({}, p.settings)};
  state.profiles.push(copy);
  saveState();
  toast('Duplicated ' + p.name);
  renderProfiles();
}

function resetProfileFlow(id){
  var p = state.profiles.filter(function(p){ return p.id === id; })[0];
  if (!p) return;
  openModal({
    title:'Reset profile?',
    body:'"' + p.name + '" will be set back to Normal graphics settings.',
    buttons:[
      {label:'Cancel', variant:'btn-ghost'},
      {label:'Reset', variant:'btn-danger', onClick:function(){
        p.mode = 'Normal';
        p.settings = computePresetSettings('Normal');
        if (p.id === state.activeProfileId){ state.settings = Object.assign({}, p.settings); state.activeMode = 'Normal'; }
        saveState();
        toast('Reset ' + p.name);
        renderAll();
      }}
    ]
  });
}

function deleteProfileFlow(id){
  var p = state.profiles.filter(function(p){ return p.id === id; })[0];
  if (!p) return;
  if (state.profiles.length <= 1){ toast("Can't delete your last profile"); return; }
  openModal({
    title:'Delete profile?',
    body:'"' + p.name + '" and its saved settings will be permanently deleted.',
    buttons:[
      {label:'Cancel', variant:'btn-ghost'},
      {label:'Delete', variant:'btn-danger', onClick:function(){
        state.profiles = state.profiles.filter(function(pr){ return pr.id !== id; });
        if (state.activeProfileId === id){
          var fallback = state.profiles[0];
          state.activeProfileId = fallback.id;
          state.settings = Object.assign({}, fallback.settings);
          state.activeMode = fallback.mode;
        }
        saveState();
        toast('Deleted profile');
        renderAll();
      }}
    ]
  });
}

/* ============================================================
   PERFORMANCE PAGE
   ============================================================ */

function renderPerformance(){
  var sec = q('#sec-performance');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Performance', 'These numbers are estimates based on your current settings — not a live read of your computer or Roblox itself.'));

  var perf = estimatePerf(state.settings);
  var grid = el('div', {class:'grid grid-4'});
  grid.appendChild(meterCard('Estimated FPS', perf.fps + '', 'frames / sec', perf.fps, 95, 'var(--accent-2)'));
  grid.appendChild(meterCard('GPU Load', perf.gpu + '%', 'estimated', perf.gpu, 100, 'var(--accent)'));
  grid.appendChild(meterCard('CPU Load', perf.cpu + '%', 'estimated', perf.cpu, 100, 'var(--accent)'));
  grid.appendChild(meterCard('Memory Usage', perf.mem + ' MB', 'estimated', (perf.mem/1800)*100, 100, 'var(--accent-2)'));
  sec.appendChild(grid);

  var scoreCard = el('div', {class:'glass', style:'margin-top:16px;'});
  scoreCard.appendChild(el('div', {class:'stat-label'}, [txt('Optimization score (estimated)')]));
  scoreCard.appendChild(el('div', {class:'stat-value'}, [txt(perf.score + ' / 100')]));
  var meter = el('div', {class:'meter'});
  meter.appendChild(el('div', {style:'width:' + perf.score + '%;background:var(--accent-2);'}));
  scoreCard.appendChild(meter);
  sec.appendChild(scoreCard);

  var graphCard = el('div', {class:'glass', style:'margin-top:16px;'});
  graphCard.appendChild(el('div', {class:'stat-label'}, [txt('Score over recent optimizations (estimated)')]));
  graphCard.appendChild(buildSparkline());
  sec.appendChild(graphCard);
}

function meterCard(label, value, sub, pct, max, color){
  var card = el('div', {class:'glass perf-card'});
  card.appendChild(el('div', {class:'stat-label'}, [txt(label)]));
  card.appendChild(el('div', {class:'stat-value'}, [txt(value)]));
  card.appendChild(el('div', {class:'stat-sub'}, [txt(sub)]));
  var m = el('div', {class:'meter'});
  m.appendChild(el('div', {style:'width:' + clamp((pct/max)*100,0,100) + '%;background:' + color + ';'}));
  card.appendChild(m);
  return card;
}

function buildSparkline(){
  var points = state.history.slice(-10).map(function(h){ return h.score; });
  if (!points.length){
    return el('p', {style:'font-size:13px;color:var(--text-faint);margin-top:8px;'}, [txt('No optimizations logged yet.')]);
  }
  var w = 400, h = 60, pad = 6;
  var stepX = points.length > 1 ? (w - pad*2) / (points.length - 1) : 0;
  var coords = points.map(function(v, i){
    var x = pad + i * stepX;
    var y = h - pad - (v/100) * (h - pad*2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var svgHtml = '<svg class="perf-graph" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<polyline points="' + coords + '" fill="none" stroke="#35d0c4" stroke-width="2" />' +
    '</svg>';
  var wrap = el('div', {html:svgHtml});
  return wrap;
}

/* ============================================================
   OPTIMIZER PAGE + OVERLAY
   ============================================================ */

var pendingOptimizeMode = null;
var optimizerTimer = null;

function renderOptimizerPage(){
  var sec = q('#sec-optimizer');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Optimizer', 'Choose a mode and run the guided optimization. This configures the 20 graphics settings for your active profile (' + getActiveProfile().name + ') and gives you a checklist to apply in Roblox.'));

  var panel = el('div', {class:'glass'});
  panel.appendChild(el('div', {class:'stat-label'}, [txt('Target mode')]));
  var select = el('select', {class:'pill', style:'margin:10px 0 20px;width:100%;max-width:260px;'});
  MODES.forEach(function(m){
    var opt = el('option', {value:m}, [txt(m)]);
    if (m === state.activeMode) opt.setAttribute('selected','selected');
    select.appendChild(opt);
  });
  if (state.activeMode === 'Custom'){
    var customOpt = el('option', {value:'Custom', selected:'selected'}, [txt('Custom (keep current sliders)')]);
    select.insertBefore(customOpt, select.firstChild);
  }
  panel.appendChild(select);

  panel.appendChild(el('button', {class:'btn btn-accent btn-big', onclick:function(){
    pendingOptimizeMode = select.value;
    runOptimizer(pendingOptimizeMode);
  }}, [txt('⚡ OPTIMIZE NOW')]));

  sec.appendChild(panel);

  var note = el('div', {class:'glass', style:'margin-top:16px;'});
  note.appendChild(el('p', {style:'font-size:13px;color:var(--text-dim);margin:0;'}, [
    txt('This can\'t reach into the Roblox client and change it for you — no website can do that safely. What it does do: work out exactly which settings to change, save the profile, and give you a real checklist of what the Roblox component will and won\'t be able to apply. To get it into your actual game, use the in-game menu, or head to Roblox Sync below.')
  ]));
  note.appendChild(el('button', {class:'btn btn-ghost btn-sm', style:'margin-top:12px;', onclick:function(){ showSection('connection'); }}, [txt('Open Roblox Sync \u2192')]));
  sec.appendChild(note);
}

function runOptimizer(mode){
  var overlay = q('#optimizerOverlay');
  var fill = q('#overlayFill');
  var stageListEl = q('#stageList');
  var resultEl = q('#overlayResult');
  var doneBtn = q('#overlayDone');
  var skipBtn = q('#overlaySkip');

  resultEl.style.display = 'none';
  doneBtn.style.display = 'none';
  skipBtn.style.display = '';
  fill.style.width = '0%';
  stageListEl.innerHTML = '';

  var rows = STAGES.map(function(s){
    var row = el('div', {class:'stage-row'}, [el('span', {class:'stage-dot'}, [txt('')]), txt(s)]);
    stageListEl.appendChild(row);
    return row;
  });

  overlay.classList.add('show');

  var beforePerf = estimatePerf(state.settings);
  var finalSettings = mode === 'Custom' ? Object.assign({}, state.settings) : computePresetSettings(mode);
  var idx = 0;
  var finished = false;

  function step(){
    if (idx > 0) { rows[idx-1].classList.remove('active'); rows[idx-1].classList.add('done'); rows[idx-1].querySelector('.stage-dot').textContent = '✓'; }
    if (idx >= rows.length){ finish(); return; }
    rows[idx].classList.add('active');
    fill.style.width = Math.round(((idx+1)/rows.length) * 100) + '%';
    idx++;
    optimizerTimer = setTimeout(step, state.appSettings.reducedMotion ? 40 : 420);
  }

  function finish(){
    if (finished) return;
    finished = true;
    clearTimeout(optimizerTimer);
    state.settings = finalSettings;
    state.activeMode = mode === 'Custom' ? 'Custom' : mode;
    maybeAutoSave();
    logHistory(state.activeMode);
    soundSuccess();

    var afterPerf = estimatePerf(state.settings);
    var delta = afterPerf.fps - beforePerf.fps;

    var checklistHtml = AUTO_APPLIED_ITEMS.map(function(item){
      return '<div style="font-size:12.5px;color:var(--text-dim);margin-top:4px;">' +
        '<span style="color:var(--accent-2);">\u2713</span> ' + item + ' <span style="color:var(--text-faint);">-- automatically applied by the Roblox component</span></div>';
    }).join('') + MANUAL_ONLY_ITEMS.map(function(item){
      return '<div style="font-size:12.5px;color:var(--text-dim);margin-top:4px;">' +
        '<span style="color:var(--accent);">\u26a0</span> ' + item + ' <span style="color:var(--text-faint);">-- manual Roblox setting, cannot be scripted</span></div>';
    }).join('');

    resultEl.style.display = '';
    resultEl.innerHTML =
      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line);">' +
      '<b style="font-family:Sora;font-size:15px;color:var(--accent-2);">Profile configured</b>' +
      '<p style="font-size:13px;color:var(--text-dim);margin:8px 0 0;">Mode: <b style="color:var(--text);">' + state.activeMode + '</b> -- saved to ' + getActiveProfile().name + '</p>' +
      '<p style="font-size:13px;color:var(--text-dim);margin:4px 0 0;">Estimated FPS (planner model): ' + beforePerf.fps + ' \u2192 ' + afterPerf.fps + ' (' + (delta >= 0 ? '+' : '') + delta + ')</p>' +
      '<p style="font-size:12.5px;color:var(--text-faint);margin:10px 0 2px;">This runs on this website only, in this browser. To actually apply it in Roblox, use the in-game menu, or push it via <b style="color:var(--text-dim);">Roblox Sync</b>.</p>' +
      checklistHtml +
      '</div>';
    doneBtn.style.display = '';
    skipBtn.style.display = 'none';
    refreshLiveWidgets();
    if (currentSection === 'optimizer') renderOptimizerPage();
  }

  q('#overlaySkip').onclick = function(){ idx = rows.length; finish(); };
  q('#overlayDone').onclick = function(){ overlay.classList.remove('show'); };

  step();
}

/* ============================================================
   ROBLOX SYNC / CONNECTION PAGE
   ============================================================ */

function buildRobloxConfigPayload(){
  return {
    profile: state.activeMode === 'Custom' ? getActiveProfile().mode : state.activeMode,
    textSize: state.appSettings.robloxTextSize,
    exportedAt: new Date().toISOString()
  };
}

function renderConnection(){
  var sec = q('#sec-connection');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Roblox Sync', 'How this website actually talks to Roblox -- and the one thing it honestly can\'t do.'));

  var explain = el('div', {class:'glass glow'});
  explain.appendChild(el('h3', {style:'font-size:15px;margin-bottom:8px;'}, [txt('Why there\u2019s no "Connected" light here')]));
  explain.appendChild(el('p', {style:'font-size:13px;color:var(--text-dim);margin:0 0 8px;'}, [
    txt('A website cannot reach into a running Roblox game, and a static site like this one has no backend for a Roblox server to report back to. So this page will never claim a live "Connected" status -- that would be fake. The real, live status (Connected / Syncing / Applied / Disconnected / Error) is shown inside the Roblox experience itself, driven by actual HttpService calls the server makes.')
  ]));
  explain.appendChild(el('p', {style:'font-size:13px;color:var(--text-dim);margin:0;'}, [
    txt('What this page does for real: builds the config file your Roblox server can poll, so you can change the active profile without republishing your game.')
  ]));
  sec.appendChild(explain);

  var exportCard = el('div', {class:'glass', style:'margin-top:16px;'});
  exportCard.appendChild(el('div', {class:'stat-label'}, [txt('Config to publish (e.g. as a GitHub Gist raw file)')]));
  var payload = buildRobloxConfigPayload();
  var jsonStr = JSON.stringify(payload, null, 2);
  var pre = el('pre', {style:'background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px;font-size:12.5px;overflow-x:auto;margin-top:10px;color:var(--accent-2);'}, [txt(jsonStr)]);
  exportCard.appendChild(pre);

  var btnRow = el('div', {style:'display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;'});
  btnRow.appendChild(el('button', {class:'btn btn-cyan', onclick:function(){
    navigator.clipboard && navigator.clipboard.writeText(jsonStr);
    state.lastExportedAt = new Date().toISOString();
    saveState();
    toast('Copied config.json to clipboard');
    renderConnection();
  }}, [txt('Copy JSON')]));
  btnRow.appendChild(el('button', {class:'btn btn-ghost', onclick:function(){
    var blob = new Blob([jsonStr], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = el('a', {href:url, download:'config.json'});
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    state.lastExportedAt = new Date().toISOString();
    saveState();
    toast('Downloaded config.json');
    renderConnection();
  }}, [txt('Download config.json')]));
  exportCard.appendChild(btnRow);
  sec.appendChild(exportCard);

  var stepsCard = el('div', {class:'glass', style:'margin-top:16px;'});
  stepsCard.appendChild(el('div', {class:'stat-label'}, [txt('Wiring it up (one-time, ~5 minutes)')]));
  var steps = [
    'Create a GitHub Gist with a file named config.json, paste the JSON above in.',
    'Copy that file\'s "Raw" URL.',
    'In PotatoGraphicsServer.server.lua, set SYNC_URL to that raw URL.',
    'Turn on Allow HTTP Requests in Studio\u2019s Experience Settings \u2192 Security.',
    'Publish. The server polls the URL every 30s and applies whichever profile is in it -- for real.'
  ];
  var list = el('ol', {style:'margin:10px 0 0;padding-left:20px;font-size:13px;color:var(--text-dim);line-height:1.7;'});
  steps.forEach(function(s){ list.appendChild(el('li', {}, [txt(s)])); });
  stepsCard.appendChild(list);
  sec.appendChild(stepsCard);

  var lastCard = el('div', {class:'glass', style:'margin-top:16px;'});
  lastCard.appendChild(el('div', {class:'stat-label'}, [txt('This browser\u2019s last export')]));
  lastCard.appendChild(el('div', {class:'stat-value', style:'font-size:16px;'}, [txt(state.lastExportedAt ? new Date(state.lastExportedAt).toLocaleString() : 'Never exported yet')]));
  lastCard.appendChild(el('div', {class:'stat-sub'}, [txt('This is the only "status" the website can honestly track -- whether YOU generated a config file, and when.')]));
  sec.appendChild(lastCard);
}

/* ============================================================
   HISTORY PAGE
   ============================================================ */

function renderHistory(){
  var sec = q('#sec-history');
  sec.innerHTML = '';
  sec.appendChild(pageHead('History', 'Every optimization you\'ve run, most recent first.'));

  var clearRow = el('div', {style:'margin-bottom:14px;'});
  clearRow.appendChild(el('button', {class:'btn btn-ghost btn-sm', onclick:function(){
    if (!state.history.length){ toast('History is already empty'); return; }
    openModal({
      title:'Clear history?',
      body:'This removes your optimization log. It won\'t change your current settings.',
      buttons:[
        {label:'Cancel', variant:'btn-ghost'},
        {label:'Clear', variant:'btn-danger', onClick:function(){ state.history = []; saveState(); toast('History cleared'); renderHistory(); }}
      ]
    });
  }}, [txt('Clear history')]));
  sec.appendChild(clearRow);

  var panel = el('div', {class:'glass'});
  var items = state.history.slice().reverse();
  if (!items.length){
    panel.appendChild(el('p', {style:'font-size:13px;color:var(--text-faint);'}, [txt('No optimizations logged yet. Run one from the Optimizer page.')]));
  } else {
    items.forEach(function(h){ panel.appendChild(historyRow(h)); });
  }
  sec.appendChild(panel);
}

/* ============================================================
   SETTINGS PAGE
   ============================================================ */

var ACCENTS = ['#e8a33d','#35d0c4','#a678ff','#6bcf6b','#ff5470'];
var THEMES = [{id:'slate', label:'Slate'}, {id:'void', label:'Void'}, {id:'ember', label:'Ember'}];

function renderSettingsPage(){
  var sec = q('#sec-settings');
  sec.innerHTML = '';
  sec.appendChild(pageHead('Settings', 'Controls for the app itself — these don\'t change anything inside Roblox.'));

  var panel = el('div', {class:'glass'});
  var A = state.appSettings;

  panel.appendChild(optRow('Theme', 'Pick a dark palette.', themeSwatches()));
  panel.appendChild(optRow('Accent color', 'The highlight color used across the app.', accentSwatches()));
  panel.appendChild(optRow('Animation intensity', 'How much motion the interface uses.', selectRow(['off','reduced','normal','high'], A.animationIntensity, function(v){
    A.animationIntensity = v; applyAppSettingsToDom(); saveState();
  })));
  panel.appendChild(optRow('Performance mode', 'Turns off blur and glow effects in this app for smoother scrolling on slow devices.', toggleRow(A.performanceMode, function(v){ A.performanceMode = v; applyAppSettingsToDom(); saveState(); })));
  panel.appendChild(optRow('Default profile mode', 'The mode new profiles start with.', selectRow(MODES, A.defaultProfileMode, function(v){ A.defaultProfileMode = v; saveState(); })));
  panel.appendChild(optRow('Notifications', 'Show confirmation toasts for actions.', toggleRow(A.notifications, function(v){ A.notifications = v; saveState(); })));
  panel.appendChild(optRow('Auto-save', 'Save slider changes to the active profile immediately.', toggleRow(A.autoSave, function(v){ A.autoSave = v; saveState(); })));
  panel.appendChild(optRow('Accessibility: larger text', 'Increases base text size across the app.', toggleRow(A.accessibility, function(v){ A.accessibility = v; applyAppSettingsToDom(); saveState(); })));
  panel.appendChild(optRow('Reduced motion', 'Minimizes animations and transitions.', toggleRow(A.reducedMotion, function(v){ A.reducedMotion = v; applyAppSettingsToDom(); saveState(); })));
  panel.appendChild(optRow('Compact interface', 'Tightens spacing to fit more on screen.', toggleRow(A.compactInterface, function(v){ A.compactInterface = v; applyAppSettingsToDom(); saveState(); })));
  panel.appendChild(optRow('Sound effects', 'Short sounds on key actions.', toggleRow(A.soundEffects, function(v){ A.soundEffects = v; saveState(); if(v) soundClick(); })));

  sec.appendChild(panel);

  var dangerPanel = el('div', {class:'glass', style:'margin-top:16px;'});
  dangerPanel.appendChild(el('h3', {style:'font-size:15px;margin-bottom:6px;'}, [txt('Reset everything')]));
  dangerPanel.appendChild(el('p', {style:'font-size:12.5px;color:var(--text-dim);margin-bottom:14px;'}, [txt('Deletes all profiles, history, and preferences, and starts fresh.')]));
  dangerPanel.appendChild(el('button', {class:'btn btn-danger', onclick:function(){
    openModal({
      title:'Reset all data?',
      body:'This clears every profile, all history, and every setting. This can\'t be undone.',
      buttons:[
        {label:'Cancel', variant:'btn-ghost'},
        {label:'Reset everything', variant:'btn-danger', onClick:function(){
          state = defaultState();
          saveState();
          toast('Everything reset');
          showSection('dashboard');
          renderAll();
        }}
      ]
    });
  }}, [txt('Reset settings')]));
  sec.appendChild(dangerPanel);
}

function optRow(label, desc, control){
  return el('div', {class:'opt-row'}, [
    el('div', {class:'opt-label'}, [el('b',{},[txt(label)]), el('span',{},[txt(desc)])]),
    control
  ]);
}

function toggleRow(value, onChange){
  var label = el('label', {class:'switch'});
  var input = el('input', {type:'checkbox'});
  input.checked = !!value;
  input.addEventListener('change', function(){ onChange(input.checked); });
  label.appendChild(input);
  label.appendChild(el('span', {class:'switch-track'}));
  label.appendChild(el('span', {class:'switch-thumb'}));
  return label;
}

function selectRow(options, value, onChange){
  var select = el('select', {class:'pill'});
  options.forEach(function(o){
    var opt = el('option', {value:o}, [txt(o.charAt(0).toUpperCase() + o.slice(1))]);
    if (o === value) opt.setAttribute('selected','selected');
    select.appendChild(opt);
  });
  select.addEventListener('change', function(){ onChange(select.value); });
  return select;
}

function accentSwatches(){
  var wrap = el('div', {class:'accent-swatches'});
  ACCENTS.forEach(function(c){
    var sw = el('div', {class:'swatch' + (state.appSettings.accent === c ? ' selected' : ''), style:'background:' + c + ';', onclick:function(){
      state.appSettings.accent = c;
      applyAppSettingsToDom();
      saveState();
      renderSettingsPage();
    }});
    wrap.appendChild(sw);
  });
  return wrap;
}

function themeSwatches(){
  var wrap = el('div', {class:'theme-swatches'});
  THEMES.forEach(function(t){
    var sw = el('div', {class:'theme-swatch' + (state.appSettings.theme === t.id ? ' selected' : ''), onclick:function(){
      state.appSettings.theme = t.id;
      applyAppSettingsToDom();
      saveState();
      renderSettingsPage();
    }}, [txt(t.label)]);
    wrap.appendChild(sw);
  });
  return wrap;
}

/* ============================================================
   APPLY APP SETTINGS TO DOM
   ============================================================ */

function applyAppSettingsToDom(){
  var A = state.appSettings;
  document.documentElement.setAttribute('data-theme', A.theme);
  document.documentElement.style.setProperty('--accent', A.accent);
  document.body.classList.toggle('compact', !!A.compactInterface);
  document.body.classList.toggle('a11y-large', !!A.accessibility);
  document.body.classList.toggle('perf-mode', !!A.performanceMode);
  document.documentElement.classList.toggle('reduced-motion', !!A.reducedMotion);
  var scaleMap = {off:0.001, reduced:0.5, normal:1, high:1.6};
  document.documentElement.style.setProperty('--anim-scale', A.reducedMotion ? 0.001 : (scaleMap[A.animationIntensity] !== undefined ? scaleMap[A.animationIntensity] : 1));
}

/* ============================================================
   PAGE HEAD HELPER
   ============================================================ */

function pageHead(title, desc){
  return el('div', {class:'page-head'}, [
    el('h1', {}, [txt(title)]),
    el('p', {}, [txt(desc)])
  ]);
}

/* ============================================================
   ABOUT MODAL
   ============================================================ */

function openAboutModal(){
  var back = el('div', {class:'modal-back'});
  var box = el('div', {class:'modal-box', style:'width:440px;'});
  box.appendChild(el('h3', {}, [txt('How this works')]));
  var body = el('div', {class:'about-body'});
  body.appendChild(el('p', {}, [txt('Roblox Potato Graphics has two real parts. This website plans and exports profiles. A separate, actual Roblox Studio component (Luau scripts you install in your place) applies the settings Roblox genuinely lets an experience control — nothing here reaches into a running game from the browser, because no website can do that safely.')]));
  body.appendChild(el('p', {}, [txt('In Roblox, players get an instant in-game menu (no network needed) to set their own graphics quality and UI text size. Optionally, the server can poll a JSON file you host so you can retune the shared world settings (shadows, effects, terrain detail) without republishing.')]));
  body.appendChild(el('p', {}, [txt('On this website, "Estimated" numbers (FPS/GPU/CPU/memory on the Performance page) are a planning model based on your sliders — never a live hardware reading. The Roblox component\'s in-game HUD shows a real, self-measured FPS instead.')]));
  box.appendChild(body);
  var actions = el('div', {class:'modal-actions', style:'margin-top:16px;'});
  actions.appendChild(el('button', {class:'btn btn-accent btn-sm', onclick:function(){ back.remove(); }}, [txt('Got it')]));
  box.appendChild(actions);
  back.appendChild(box);
  back.addEventListener('click', function(e){ if (e.target === back) back.remove(); });
  q('#modalRoot').appendChild(back);
}

/* ============================================================
   INIT
   ============================================================ */

function initEvents(){
  q('#hamburgerBtn').addEventListener('click', function(){
    q('#sidebar').classList.add('open');
    q('#sidebarBackdrop').classList.add('show');
  });
  q('#sidebarBackdrop').addEventListener('click', closeMobileSidebar);
  q('#aboutBtn').addEventListener('click', openAboutModal);
}

function init(){
  loadState();
  applyAppSettingsToDom();
  initEvents();
  showSection('dashboard');
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);

})();
