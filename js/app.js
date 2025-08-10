import { processStroke } from './draw-capture.js';
import { compareStroke, FLEX, STRICT } from './validate.js';
import { playWord, replay } from './audio.js';
import { initState, updateState, sortQueue } from './srs.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

let words = [];
let chars = {};
let current = null;
let mode = 'guided'; // or 'recall'
let strictness = 'flex';
let verdictSpan;
let canvas, ctx, drawing=false, rawPoints=[];

// Simple store (localStorage) for SRS if Dexie absent
const Store = (function(){
  const key = 'hanzi-vanilla';
  function load(){ try{ return JSON.parse(localStorage.getItem(key)||'{}') }catch(e){ return {} } }
  function save(data){ localStorage.setItem(key, JSON.stringify(data)); }
  let data = load();
  return {
    getSRS(card_id){ return data.srs?.[card_id] || null },
    setSRS(card_id, state){ data.srs = data.srs || {}; data.srs[card_id]=state; save(data); },
    export(){ return new Blob([JSON.stringify(data)], {type:'application/json'}) },
    async import(file){ const txt = await file.text(); data = JSON.parse(txt||'{}'); save(data); }
  };
})();

async function loadData() {
  const base = getBase();
  words = await (await fetch(base + 'data/words-50.json')).json();
  chars = await (await fetch(base + 'data/strokes/characters.json')).json();
  current = words[0];
  renderWordList();
  setCurrent(current.id);
}

function getBase(){
  const p = new URL(location.href);
  const parts = p.pathname.split('/').filter(Boolean);
  // if hosted under /user/repo/, keep path to repo
  return parts.length>0 ? p.pathname.replace(/[^\/]+$/, '') : '/';
}

function setCurrent(id){
  current = words.find(w=>w.id===id) || words[0];
  $('#hanzi').textContent = current.simplified;
  $('#pinyin').textContent = current.pinyin;
  $('#gloss').textContent = current.english_gloss;
  verdictSpan.textContent = '';
  // set ref stroke for first character if present
  const ch = current.simplified[0];
  const m = chars[ch];
  window.refStroke = (m && m[0]) ? m[0] : [];
  clearCanvas();
}

function renderWordList(){
  const ul = $('#word-list'); ul.innerHTML='';
  for (const w of words){
    const li = document.createElement('li');
    li.textContent = `${w.simplified} (${w.pinyin})`;
    li.addEventListener('click', ()=> setCurrent(w.id));
    ul.appendChild(li);
  }
}

function speakNormal(){ playWord(current.simplified, current.audio_ref ? {src: current.audio_ref} : null, false); }
function speakSlow(){ playWord(current.simplified, current.audio_ref ? {src: current.audio_ref} : null, true); }

function getTol(){ return strictness==='strict' ? STRICT : FLEX; }

function initCanvas(){
  canvas = $('#board'); ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
}

function resize(){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function clearCanvas(){ rawPoints = []; render(); }

function render(){
  if (!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if (mode === 'guided' && window.refStroke && window.refStroke.length){
    ctx.strokeStyle = '#c7d2fe';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(window.refStroke[0][0]*canvas.clientWidth, window.refStroke[0][1]*canvas.clientHeight);
    for (let i=1;i<window.refStroke.length;i++){
      ctx.lineTo(window.refStroke[i][0]*canvas.clientWidth, window.refStroke[i][1]*canvas.clientHeight);
    }
    ctx.stroke();
  }
  if (rawPoints.length > 1){
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(rawPoints[0][0], rawPoints[0][1]);
    for (let i=1;i<rawPoints.length;i++){ ctx.lineTo(rawPoints[i][0], rawPoints[i][1]); }
    ctx.stroke();
  }
}

function toLocal(e){
  const rect = canvas.getBoundingClientRect();
  return [e.clientX-rect.left, e.clientY-rect.top];
}

function onDown(e){ canvas.setPointerCapture(e.pointerId); drawing=true; rawPoints=[toLocal(e)]; render(); }
function onMove(e){ if(!drawing) return; rawPoints.push(toLocal(e)); render(); }
function onUp(e){
  if(!drawing) return;
  drawing=false;
  const processed = processStroke(rawPoints.map(p=>[p[0]/canvas.clientWidth, p[1]/canvas.clientHeight]));
  const tol = getTol();
  let cmp = {verdict:'ok', score:1};
  if (window.refStroke && window.refStroke.length){
    cmp = compareStroke(processed, window.refStroke, tol);
  }
  if (cmp.verdict==='ok') ctx.strokeStyle='#22c55e';
  else if (cmp.verdict==='close') ctx.strokeStyle='#f59e0b';
  else ctx.strokeStyle='#ef4444';
  ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(rawPoints[0][0], rawPoints[0][1]);
  for(let i=1;i<rawPoints.length;i++){ ctx.lineTo(rawPoints[i][0], rawPoints[i][1]); } ctx.stroke();
  verdictSpan.textContent = `${cmp.verdict} (${Math.round(cmp.score*100)}%)`;
  if (navigator.vibrate) navigator.vibrate(cmp.verdict==='ok'?10:cmp.verdict==='close'?20:40);
  rawPoints=[];
}

function bindUI(){
  verdictSpan = $('#verdict');
  $('#btn-guided').addEventListener('click', ()=>{ mode='guided'; clearCanvas(); });
  $('#btn-recall').addEventListener('click', ()=>{ mode='recall'; clearCanvas(); });
  $('#btn-strictness').addEventListener('click', ()=>{
    strictness = (strictness==='flex') ? 'strict' : 'flex';
    $('#btn-strictness').textContent = `Strictness: ${strictness}`;
  });
  $('#btn-play').addEventListener('click', speakNormal);
  $('#btn-slow').addEventListener('click', speakSlow);
  $('#btn-replay').addEventListener('click', ()=> replay());

  // SRS buttons
  for (const id of ['again','hard','good','easy']){
    $('#srs-'+id).addEventListener('click', ()=>{
      const s = Store.getSRS(current.id) || initState(current.id);
      const updated = updateState(s, id, 0);
      Store.setSRS(current.id, updated);
      alert(`Saved: ${id}. Next due in ~${updated.interval} day(s).`);
    });
  }

  // Export/Import
  $('#btn-export').addEventListener('click', async ()=>{
    const blob = Store.export();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'hanzi-backup.json'; a.click();
    URL.revokeObjectURL(url);
  });
  $('#file-import').addEventListener('change', async (e)=>{
    const file = e.target.files[0]; if (!file) return;
    await Store.import(file);
    alert('Imported progress.');
  });
}

function registerSW(){
  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }
}

window.addEventListener('DOMContentLoaded', async ()=>{
  bindUI(); initCanvas(); registerSW(); await loadData();
});
