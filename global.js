/* Global GIM panels. gim.js comes from build_gim.py, land.js holds the coastlines. */
const G = window.TEC_GIM, LAND = window.TEC_LAND;
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun'];
const STATIONS = [['THLB',13.73,100.78],['PHMM',14.636,121.078],['THKC',10.73,99.37],['PHDV',7.070,125.579]];
const LAT_TOP = 87.5, LAT_SPAN = 175, NLAT = G.nlat, NLON = G.nlon;
const FW = 360, FH = 175; // field resolution before it is scaled up to the panel
const YTICKS = [[60,'60°N'],[30,'30°N'],[0,'0°'],[-30,'30°S'],[-60,'60°S']];
const XTICKS = [[-120,'120°W'],[-60,'60°W'],[0,'0°'],[60,'60°E'],[120,'120°E']];
const $ = id => document.getElementById(id);
const H = (tag,cls,text,parent) => { const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; if(parent) parent.appendChild(e); return e; };
const bytes = s => Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const pad = h => String(h).padStart(2,'0');
const TEC = bytes(G.tec), MAE = bytes(G.mae);
const state = { metric:'mae', hour:8, playing:null };

/* jet, as in the reference figure */
const clamp01 = v => Math.max(0,Math.min(1,v));
const jet = t => [clamp01(1.5-Math.abs(4*t-3)),clamp01(1.5-Math.abs(4*t-2)),clamp01(1.5-Math.abs(4*t-1))].map(c=>Math.round(c*255));
const LUT = Array.from({length:256},(_,i)=>jet(i/255));
const top_ = () => state.metric==='mae' ? G.maeTop : G.tecTop;

const cellAt = (m,i,j) => state.metric==='mae' ? MAE[m*NLAT*NLON+i*NLON+j]*G.maeStep : TEC[(m*24+state.hour)*NLAT*NLON+i*NLON+j]*G.tecStep;
function sample(m,lat,lon){
  const fi=Math.max(0,Math.min(NLAT-1.001,(LAT_TOP-lat)/2.5)), fj=Math.max(0,Math.min(NLON-1.001,(lon+180)/5));
  const i=Math.floor(fi), j=Math.floor(fj), a=fi-i, b=fj-j;
  return cellAt(m,i,j)*(1-a)*(1-b)+cellAt(m,i,j+1)*(1-a)*b+cellAt(m,i+1,j)*a*(1-b)+cellAt(m,i+1,j+1)*a*b;
}

/* ---------- panels ---------- */
const coast = new Path2D();
// a ring that crosses the antimeridian jumps across the map, so lift the pen there instead of drawing a line
LAND.forEach(r=>{ let prev=null; r.forEach(([lon,lat])=>{ const x=lon+180,y=LAT_TOP-lat;
  if(prev==null||Math.abs(lon-prev)>180) coast.moveTo(x,y); else coast.lineTo(x,y); prev=lon; }); });
const panels = MONTHS_EN.map((name,m)=>{
  const cell=H('div','gl-cell',null,$('glGrid'));
  const yax=H('div','gl-y',null,cell); YTICKS.forEach(([lat,t])=>{ H('span',null,t,yax).style.top=((LAT_TOP-lat)/LAT_SPAN*100)+'%'; });
  const box=H('div','gl-map',null,cell), cv=H('canvas',null,null,box); H('span','gl-tag',`${name} 2026`,box);
  cv.setAttribute('role','img'); cv.setAttribute('aria-label',`Global map, ${name} 2026`);
  const xax=H('div','gl-x',null,cell); XTICKS.forEach(([lon,t])=>{ H('span',null,t,xax).style.left=((lon+180)/360*100)+'%'; });
  const off=document.createElement('canvas'); off.width=FW; off.height=FH;
  cv.addEventListener('pointermove',ev=>{ const b=cv.getBoundingClientRect(),lat=LAT_TOP-(ev.clientY-b.top)/b.height*LAT_SPAN,lon=-180+(ev.clientX-b.left)/b.width*360;
    showTip(ev,`${name}, ${Math.abs(lat).toFixed(1)}°${lat<0?'S':'N'}, ${Math.abs(lon).toFixed(1)}°${lon<0?'W':'E'}`,sample(m,lat,lon)); });
  cv.addEventListener('pointerleave',()=>{$('tip').hidden=true;});
  return {m,cv,off};
});
function paintField(p){
  const ctx=p.off.getContext('2d'), img=ctx.createImageData(FW,FH), d=img.data, s=255/top_();
  for(let y=0;y<FH;y++){ const lat=LAT_TOP-(y+.5)/FH*LAT_SPAN;
    for(let x=0;x<FW;x++){ const c=LUT[Math.min(255,sample(p.m,lat,-180+(x+.5)/FW*360)*s|0)],o=(y*FW+x)*4; d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=255; } }
  ctx.putImageData(img,0,0);
}
function compose(p){
  const w=p.cv.clientWidth,h=p.cv.clientHeight,dpr=devicePixelRatio||1; if(!w) return;
  p.cv.width=Math.round(w*dpr); p.cv.height=Math.round(h*dpr);
  const ctx=p.cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingQuality='high'; ctx.drawImage(p.off,0,0,w,h);
  const kx=w/360,ky=h/LAT_SPAN;
  ctx.save(); ctx.scale(kx,ky); ctx.strokeStyle='#000'; ctx.lineWidth=1/kx; ctx.stroke(coast); ctx.restore();
  STATIONS.forEach(([,lat,lon])=>{ ctx.beginPath(); ctx.arc((lon+180)*kx,(LAT_TOP-lat)*ky,2,0,7); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#000'; ctx.lineWidth=.8; ctx.stroke(); });
}
function drawBar(){
  $('barTitle').textContent=state.metric==='mae'?'MAE (TECU)':'TEC (TECU)';
  $('barFill').style.background=`linear-gradient(90deg,${Array.from({length:11},(_,i)=>`rgb(${jet(i/10)})`).join(',')})`;
  const t=$('barTicks'); t.textContent=''; for(let i=0;i<=4;i++) H('span',null,String(top_()*i/4),t);
  $('cap1').textContent=state.metric==='mae'
    ? 'MAE ของ TEC เทียบกับ median รายเดือน เฉลี่ยทุกชั่วโมง จุดขาวคือสถานีทั้ง 4 แห่ง'
    : `median รายเดือนของ TEC เวลา ${pad(state.hour)}:00 UT จุดขาวคือสถานีทั้ง 4 แห่ง`;
}
function render(){
  $('timeRow').hidden=state.metric!=='tec';
  $('clock').textContent=`${pad(state.hour)}:00 UT`;
  drawBar(); panels.forEach(p=>{paintField(p);compose(p);});
}
function showTip(ev,title,v){ const tip=$('tip'); tip.textContent=''; H('h4',null,title,tip); const w=H('div',null,null,tip); H('span',null,state.metric==='mae'?'MAE':'TEC',w); H('b',null,`${v.toFixed(1)} TECU`,w);
  tip.hidden=false; const b=tip.getBoundingClientRect(); tip.style.left=Math.min(ev.clientX+14,innerWidth-b.width-8)+'px'; tip.style.top=Math.min(ev.clientY+14,innerHeight-b.height-8)+'px'; }

/* ---------- controls ---------- */
$('metric').addEventListener('change',e=>{stopPlay();state.metric=e.target.value;render();});
$('hour').addEventListener('input',e=>{stopPlay();state.hour=+e.target.value;render();});
function stopPlay(){ if(state.playing){clearInterval(state.playing);state.playing=null;} const b=$('play');b.textContent='เล่น';b.setAttribute('aria-pressed','false'); }
$('play').addEventListener('click',()=>{ if(state.playing){stopPlay();return;} const b=$('play');b.textContent='หยุด';b.setAttribute('aria-pressed','true');
  state.playing=setInterval(()=>{state.hour=(state.hour+1)%24;$('hour').value=state.hour;render();},900); });

/* ---------- iTEC vs GIM tables ---------- */
const fmt = (v,d=1) => v==null?'-':(v<0?'−':'')+Math.abs(v).toFixed(d);
(function tables(){
  const t=$('checkTbl'),hr=H('tr',null,null,H('thead',null,null,t)); H('th',null,'สถานี',hr).scope='col';
  [...MONTHS,'รวม','bias','r'].forEach(x=>{H('th',null,x,hr).scope='col';});
  const b=H('tbody',null,null,t);
  STATIONS.forEach(([id])=>{ const s=G.check.stations[id],tr=H('tr',null,null,b); H('td',null,id,tr);
    s.months.forEach(c=>H('td',null,fmt(c&&c.mae),tr)); H('td',null,fmt(s.all.mae),tr); H('td',null,fmt(s.all.bias),tr); H('td',null,fmt(s.all.r,2),tr); });
  const p=$('pairTbl'),ph=H('tr',null,null,H('thead',null,null,p)); ['คู่สถานี','iTEC','GIM','iTEC หลังตัดรอบรายวัน','GIM หลังตัดรอบรายวัน'].forEach(x=>{H('th',null,x,ph).scope='col';});
  const pb=H('tbody',null,null,p);
  G.check.pairs.forEach(q=>{ const tr=H('tr',null,null,pb); H('td',null,`${q.a} และ ${q.b}`,tr);
    [q.itec,q.gim,q.itecAnom,q.gimAnom].forEach(c=>H('td',null,fmt(c&&c.r,2),tr)); });
})();
new ResizeObserver(()=>panels.forEach(compose)).observe($('glGrid'));
render();
