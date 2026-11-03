/* TEC contour map. data.js comes from build_raw.py, geo.js holds the country outlines. */
const D = window.TEC_DATA, GEO = window.TEC_GEO;
const ST = [
  {id:'THLB',city:'กรุงเทพฯ',en:'Bangkok',lat:13.73,lon:100.78,dip:8.11,c:'--s1'},
  {id:'PHMM',city:'มะนิลา',en:'Manila',lat:14.636,lon:121.078,dip:8.79,c:'--s2'},
  {id:'THKC',city:'ชุมพร',en:'Chumphon',lat:10.73,lon:99.37,dip:4.48,c:'--s3',dash:'6 3'},
  {id:'PHDV',city:'ดาเวา',en:'Davao',lat:7.070,lon:125.579,dip:-0.06,c:'--s4',dash:'6 3'},
];
const byId = Object.fromEntries(ST.map(s=>[s.id,s]));
const PAIRS = [['THLB','PHMM'],['THKC','PHDV']];
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun'];
const MONTHS_LONG = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน'];
const TEC_MAX = window.TEC_YMAX || 80; // top of the colour scale and the chart; the (2) page sets 100
const FIELD_CLAMP = TEC_MAX + 10; // spline overshoot outside the stations is cut off here
const NX = 320, NY = 184; // contour grid over 92–132°E, 22°N–1°S
const FADE_FULL = 2, FADE_ZERO = 8; // degrees outside the station hull where the field fades away
const FIELD_OPACITY = .95;
const svgNS = 'http://www.w3.org/2000/svg';
const $ = id => document.getElementById(id);
const S = (tag,attrs={},parent) => { const e=document.createElementNS(svgNS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); if(parent) parent.appendChild(e); return e; };
const H = (tag,cls,text,parent) => { const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; if(parent) parent.appendChild(e); return e; };
const X = lon => (lon-92)*20, Y = lat => (22-lat)*20;
const lonOf = i => 92+(i+.5)*40/NX, latOf = j => 22-(j+.5)*23/NY;
const pad = h => String(h).padStart(2,'0');
const SRC = window.TEC_LABEL || 'TEC'; // the (2) page sets this to name GIM as its source
const NQ = 96; // 15-minute slots per day; the logged values step about an hour apart, so hourly means would blur the lead
const fmtUT = q => pad(Math.floor(q/4))+':'+pad(q%4*15);

const dayMonth = D.days.map(d=>+d.slice(5,7)-1);
const monthStart = MONTHS.map((_,m)=>dayMonth.indexOf(m));
const monthLen = MONTHS.map((_,m)=>dayMonth.filter(x=>x===m).length);

const state = { mode:'month', month:3, day:monthStart[3], q:20, pair:0, step:5, playing:null };

/* ---------- value access (q is the 15-minute slot, 0 to 95) ---------- */
// The logged values step about an hour apart. For display, every curve is smoothed the same way for
// both countries: a 1-hour moving average applied twice (a triangle ±1 h wide). Before that, a gap of
// at most 30 minutes with data on both sides is bridged by a straight line, so the drawn line does not
// break; the map and tables still show no value there. Longer gaps stay gaps.
// The lead and r in Table 2 use the unsmoothed medians (rawMed), and the daily panels stay unsmoothed.
const KERNEL = [.25,1,2,3,3.5,3,2,1,.25].map(w=>w/16);
function bridge(y,wrap){ const z=[...y], n=y.length, at=j=>wrap?y[(j+n)%n]:(j>=0&&j<n?y[j]:null);
  for(let q=0;q<n;q++){ if(y[q]!=null||at(q-1)==null) continue; let e=q; while(e<q+3&&at(e)==null) e++;
    const a=at(q-1),b=at(e),len=e-q; if(len<=2&&b!=null) for(let k=0;k<len;k++) z[(q+k)%n]=a+(b-a)*(k+1)/(len+1); }
  return z; }
function smooth(y,wrap){ const z=bridge(y,wrap); return z.map((v,q)=>{ if(v==null) return null; let s=0,w=0;
  KERNEL.forEach((k,i)=>{ let j=q+i-4; if(wrap) j=(j+NQ)%NQ; const x=z[j]; if(x!=null){s+=k*x;w+=k;} }); return s/w; }); }
const rawMed = (id,m) => Array.from({length:NQ},(_,q)=>D.med15[id][q][m]);
// The (2) page's monthly curves are already smooth trend fits, so it sets TEC_MONTH_SMOOTH = false.
const SMOOTH_MED = Object.fromEntries(ST.map(s=>[s.id,MONTHS.map((_,m)=>window.TEC_MONTH_SMOOTH===false?rawMed(s.id,m):smooth(rawMed(s.id,m),true))]));
// Optional GIM reference (the (2) page): monthly median GIM per slot, drawn dotted in Figure 2.
const GIM_REF = D.gimMed15 ? Object.fromEntries(ST.map(s=>[s.id,MONTHS.map((_,m)=>smooth(Array.from({length:NQ},(_,q)=>D.gimMed15[s.id][q][m]),true))])) : null;
const medCurve = (id,m) => SMOOTH_MED[id][m];
const dayCache = {};
const dayCurve = (id,i) => dayCache[id+i] ??= smooth(D.daily15[id][i],false);
const curve = id => state.mode==='month' ? medCurve(id,state.month) : dayCurve(id,state.day);
const logged = (id,q) => state.mode==='month' ? D.med15[id][q][state.month] : D.daily15[id][state.day][q];
const val = (id,q) => logged(id,q)==null ? null : curve(id)[q];
const monthVals = (id,m,q) => { const o=[]; for(let i=monthStart[m];i<monthStart[m]+monthLen[m];i++){const v=D.daily15[id][i][q]; if(v!=null)o.push(v);} return o; };
const quant = (a,q) => { const s=[...a].sort((x,y)=>x-y), p=(s.length-1)*q, l=Math.floor(p); return l+1<s.length ? s[l]+(s[l+1]-s[l])*(p-l) : s[l]; };
function pearson(a,b){ const p=a.map((v,i)=>[v,b[i]]).filter(q=>q[0]!=null&&q[1]!=null); const n=p.length; if(n<3)return null;
  const mx=p.reduce((s,q)=>s+q[0],0)/n,my=p.reduce((s,q)=>s+q[1],0)/n; let xy=0,xx=0,yy=0;
  for(const [x,y] of p){xy+=(x-mx)*(y-my);xx+=(x-mx)**2;yy+=(y-my)**2;} return xy/Math.sqrt(xx*yy); }
// hours by which curve b (Philippines) leads curve a (Thailand), searched in 15-minute steps over ±6 h
function bestLag(a,b){ let best=0,br=-2; for(let l=-24;l<=24;l++){ const r=pearson(a,a.map((_,q)=>b[((q-l)%NQ+NQ)%NQ])); if(r!=null&&r>br){br=r;best=l;} } return best/4; }

/* ---------- colour: jet, as in published TEC maps ---------- */
const clamp01 = v => Math.max(0,Math.min(1,v));
const jet = t => [clamp01(1.5-Math.abs(4*t-3)),clamp01(1.5-Math.abs(4*t-2)),clamp01(1.5-Math.abs(4*t-1))].map(c=>Math.round(c*255));
const tecRgb = v => jet(clamp01(v/TEC_MAX));
let BANDS=[];
function buildBands(){
  BANDS=Array.from({length:Math.floor(FIELD_CLAMP/state.step)+1},(_,b)=>tecRgb((b+.5)*state.step));
  const stops=[]; for(let v=0;v<TEC_MAX;v+=state.step){ const c=tecRgb(v+state.step/2),a=v/TEC_MAX*100,b=Math.min(100,(v+state.step)/TEC_MAX*100); stops.push(`rgb(${c}) ${a}% ${b}%`); }
  $('rampBar').style.background=`linear-gradient(90deg,${stops.join(',')})`;
}

/* ---------- thin-plate spline ---------- */
const tpsU = r2 => r2>0 ? .5*r2*Math.log(r2) : 0;
function invert(L){
  const N=L.length, A=L.map((row,i)=>[...row,...Array.from({length:N},(_,k)=>+(i===k))]);
  for(let c=0;c<N;c++){
    let p=c; for(let r=c+1;r<N;r++) if(Math.abs(A[r][c])>Math.abs(A[p][c])) p=r;
    [A[c],A[p]]=[A[p],A[c]];
    const d=A[c][c]; for(let k=0;k<2*N;k++) A[c][k]/=d;
    for(let r=0;r<N;r++) if(r!==c){ const f=A[r][c]; if(f) for(let k=0;k<2*N;k++) A[r][k]-=f*A[c][k]; }
  }
  return A.map(r=>r.slice(N));
}
function convexHull(pts){
  const p=[...pts].sort((a,b)=>a[0]-b[0]||a[1]-b[1]), cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const half=q=>{const h=[];for(const c of q){while(h.length>1&&cross(h[h.length-2],h[h.length-1],c)<=0)h.pop();h.push(c);}h.pop();return h;};
  return [...half(p),...half([...p].reverse())];
}
function distToHull(x,y,h){
  let inside=true,best=Infinity;
  for(let i=0;i<h.length;i++){ const a=h[i],b=h[(i+1)%h.length],dx=b[0]-a[0],dy=b[1]-a[1];
    if(dx*(y-a[1])-dy*(x-a[0])<0) inside=false;
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));
    best=Math.min(best,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)); }
  return inside?0:best;
}
// Spline weights depend only on which stations report, so each subset is solved once and reused every frame.
const models=new Map();
function model(ids){
  const key=ids.join();
  if(models.has(key)) return models.get(key);
  const n=ids.length, N=n+3, pts=ids.map(id=>[byId[id].lon/10,byId[id].lat/10]);
  const L=Array.from({length:N},()=>Array(N).fill(0));
  pts.forEach((p,i)=>{ pts.forEach((q,j)=>{L[i][j]=tpsU((p[0]-q[0])**2+(p[1]-q[1])**2);});
    [1,p[0],p[1]].forEach((v,k)=>{L[i][n+k]=v;L[n+k][i]=v;}); });
  const inv=invert(L), w=new Float32Array(NX*NY*n), mask=new Uint8ClampedArray(NX*NY), inside=new Uint8Array(NX*NY);
  const hull=convexHull(ids.map(id=>[byId[id].lon,byId[id].lat]));
  const cv=document.createElement('canvas'); cv.width=NX; cv.height=NY;
  const mc=cv.getContext('2d'), img=mc.createImageData(NX,NY);
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){
    const c=j*NX+i, lon=lonOf(i), lat=latOf(j), x=lon/10, y=lat/10, phi=[...pts.map(p=>tpsU((x-p[0])**2+(y-p[1])**2)),1,x,y];
    for(let k=0;k<n;k++){ let s=0; for(let a=0;a<N;a++) s+=phi[a]*inv[a][k]; w[c*n+k]=s; }
    const d=distToHull(lon,lat,hull), t=Math.max(0,Math.min(1,(FADE_ZERO-d)/(FADE_ZERO-FADE_FULL)));
    mask[c]=t*t*(3-2*t)*255; inside[c]=d===0?1:0; img.data[c*4+3]=mask[c];
  }
  mc.putImageData(img,0,0);
  const m={n,w,mask,inside,hull,maskCv:cv};
  models.set(key,m); return m;
}

/* ---------- contour lines (marching squares) ---------- */
const CASES=[[],[3,2],[2,1],[3,1],[0,1],[3,0,2,1],[0,2],[3,0],[3,0],[0,2],[3,2,0,1],[0,1],[3,1],[2,1],[3,2],[]];
function march(f,nx,ny,step,emit){
  const pt=[0,0,0,0,0,0,0,0];
  for(let j=0;j<ny-1;j++) for(let i=0;i<nx-1;i++){
    const a=f[j*nx+i],b=f[j*nx+i+1],d=f[(j+1)*nx+i],c=f[(j+1)*nx+i+1];
    const lo=Math.min(a,b,c,d),hi=Math.max(a,b,c,d);
    for(let k=Math.ceil(lo/step);k*step<=hi;k++){
      const L=k*step, segs=CASES[(a>=L?8:0)|(b>=L?4:0)|(c>=L?2:0)|(d>=L?1:0)];
      if(!segs.length) continue;
      pt[0]=i+(L-a)/(b-a); pt[1]=j;              // top edge
      pt[2]=i+1;           pt[3]=j+(L-b)/(c-b);  // right edge
      pt[4]=i+(L-d)/(c-d); pt[5]=j+1;            // bottom edge
      pt[6]=i;             pt[7]=j+(L-a)/(d-a);  // left edge
      for(let s=0;s<segs.length;s+=2) emit(L,pt[segs[s]*2],pt[segs[s]*2+1],pt[segs[s+1]*2],pt[segs[s+1]*2+1]);
    }
  }
}

/* ---------- sun ---------- */
const doy = iso => Math.round((Date.parse(iso+'T00:00:00Z')-Date.UTC(2026,0,0))/864e5);
const curDate = () => state.mode==='month' ? D.days[monthStart[state.month]+14] : D.days[state.day];
const decl = n => -23.44*Math.cos(2*Math.PI*(n+10)/365);
const rad = Math.PI/180;
function sunElevation(lat,lon,d){ const ha=(state.q/4-12)*15+lon;
  return Math.asin(Math.sin(lat*rad)*Math.sin(d*rad)+Math.cos(lat*rad)*Math.cos(d*rad)*Math.cos(ha*rad))/rad; }

/* ---------- map layers ---------- */
const coast=$('mapCoast'),top_=$('mapTop'),fieldCv=$('field'),isoCv=$('iso'),wrap=$('mapWrap');
fieldCv.width=NX; fieldCv.height=NY;
GEO.forEach(g=>S('path',{d:g.d,class:'coast'},coast));
[100,110,120,130].forEach(lon=>{H('span',null,`${lon}°E`,$('mapX')).style.left=(X(lon)/8)+'%';});
[0,5,10,15,20].forEach(lat=>{H('span',null,lat?`${lat}°N`:'0°',$('mapY')).style.top=(Y(lat)/4.6)+'%';});
const hullEl=S('polygon',{class:'hull'},top_);
const stEls={};
ST.forEach(s=>{ const g=S('g',{},top_); g.dataset.x=X(s.lon); g.dataset.y=Y(s.lat);
  const dot=S('polygon',{points:'0,-6.5 5.5,3.5 -5.5,3.5',class:'st-dot'},g), above=s.id==='THLB'||s.id==='PHMM', label=S('text',{y:above?-11:19,class:'st-lab'},g);
  stEls[s.id]={g,dot,label}; });

const F=new Float32Array(NX*NY);
let current=null; // spline model for the frame on screen, null when too few stations report

function drawField(){
  const h=state.q, ids=ST.map(s=>s.id).filter(id=>val(id,h)!=null), ctx=fieldCv.getContext('2d');
  $('mapMsg').hidden=ids.length>=3;
  if(ids.length<3){ current=null; ctx.clearRect(0,0,NX,NY); hullEl.setAttribute('points',''); return; }
  const m=current=model(ids), n=m.n, vals=ids.map(id=>val(id,h)), img=ctx.createImageData(NX,NY), d=img.data;
  for(let c=0;c<NX*NY;c++){
    let v=0; for(let k=0;k<n;k++) v+=m.w[c*n+k]*vals[k];
    v=Math.max(0,Math.min(FIELD_CLAMP,v)); F[c]=v;
    const col=BANDS[Math.floor(v/state.step)];
    d[c*4]=col[0]; d[c*4+1]=col[1]; d[c*4+2]=col[2]; d[c*4+3]=m.mask[c]*FIELD_OPACITY;
  }
  ctx.putImageData(img,0,0);
  hullEl.setAttribute('points',m.hull.map(p=>`${X(p[0])},${Y(p[1])}`).join(' '));
}

function drawIso(){
  const w=wrap.clientWidth,h=wrap.clientHeight,dpr=devicePixelRatio||1;
  if(!w) return;
  isoCv.width=Math.round(w*dpr); isoCv.height=Math.round(h*dpr);
  const ctx=isoCv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
  const sx=w/NX,sy=h/NY,px=g=>(g+.5)*sx,py=g=>(g+.5)*sy;
  if(current){
    const segs=new Map();
    march(F,NX,NY,state.step,(L,x1,y1,x2,y2)=>{ if(L<=0||L>=FIELD_CLAMP)return; let a=segs.get(L); if(!a)segs.set(L,a=[]); a.push(x1,y1,x2,y2); });
    ctx.strokeStyle='#000';
    for(const [L,a] of segs){
      ctx.lineWidth=L%10===0?1.1:.6;
      ctx.beginPath(); for(let t=0;t<a.length;t+=4){ctx.moveTo(px(a[t]),py(a[t+1]));ctx.lineTo(px(a[t+2]),py(a[t+3]));} ctx.stroke();
    }
    ctx.globalCompositeOperation='destination-in'; ctx.drawImage(current.maskCv,0,0,w,h); ctx.globalCompositeOperation='source-over';
    drawLabels(ctx,segs,w,h,px,py);
  }
  drawTerminator(ctx,w,h);
}

function drawLabels(ctx,segs,w,h,px,py){
  const levels=[...segs.keys()].sort((a,b)=>a-b), show=levels.length<=8?levels:levels.filter(l=>l%10===0);
  const marks=ST.map(s=>[X(s.lon)/800*w,Y(s.lat)/460*h]), taken=[];
  const cx=current.hull.reduce((s,p)=>s+X(p[0]),0)/current.hull.length/800*w, cy=current.hull.reduce((s,p)=>s+Y(p[1]),0)/current.hull.length/460*h;
  ctx.font='11px Arial,Helvetica,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
  for(const L of show){
    const a=segs.get(L); let best=null,score=Infinity;
    for(let t=0;t<a.length;t+=32){
      const mx=(a[t]+a[t+2])/2,my=(a[t+1]+a[t+3])/2,x=px(mx),y=py(my);
      if(x<22||x>w-22||y<14||y>h-14) continue;
      if(current.mask[Math.round(my)*NX+Math.round(mx)]<230) continue;
      if(marks.some(p=>Math.abs(p[0]-x)<64&&Math.abs(p[1]-y)<36)) continue; // keep clear of station labels
      if(taken.some(p=>Math.hypot(p[0]-x,p[1]-y)<42)) continue;
      const q=Math.hypot(x-cx,y-cy); if(q<score){score=q;best={x,y,t};}
    }
    if(!best) continue;
    taken.push([best.x,best.y]);
    let ang=Math.atan2(py(a[best.t+3])-py(a[best.t+1]),px(a[best.t+2])-px(a[best.t]));
    if(ang>Math.PI/2)ang-=Math.PI; if(ang<-Math.PI/2)ang+=Math.PI;
    ctx.save(); ctx.translate(best.x,best.y); ctx.rotate(ang);
    ctx.strokeStyle='#fff'; ctx.lineWidth=3; ctx.strokeText(L,0,0); ctx.fillStyle='#000'; ctx.fillText(L,0,0); ctx.restore();
  }
}

function drawTerminator(ctx,w,h){
  const d=decl(doy(curDate())),nx=81,ny=47,e=new Float32Array(nx*ny);
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) e[j*nx+i]=sunElevation(22-j*23/(ny-1),92+i*40/(nx-1),d);
  const pts=[]; march(e,nx,ny,1000,(L,x1,y1)=>pts.push([x1*w/(nx-1),y1*h/(ny-1)]));
  if(pts.length<2) return;
  // the terminator runs north to south over this region, so sorting by y gives one line that can carry a dash
  pts.sort((a,b)=>a[1]-b[1]);
  const line=()=>{ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  ctx.strokeStyle='#fff'; ctx.lineWidth=3; line();
  ctx.setLineDash([7,4]); ctx.strokeStyle='#000'; ctx.lineWidth=1.3; line(); ctx.setLineDash([]);
}

function drawStations(){
  ST.forEach(s=>{ const v=val(s.id,state.q),{dot,label}=stEls[s.id];
    dot.classList.toggle('none',v==null);
    label.textContent = v==null ? `${s.id} no data` : `${s.id} ${v.toFixed(1)}`; });
}
new ResizeObserver(([e])=>{ const k=Math.max(1,Math.min(1.6,800/e.contentRect.width));
  Object.values(stEls).forEach(o=>o.g.setAttribute('transform',`translate(${o.g.dataset.x},${o.g.dataset.y}) scale(${k})`));
  drawIso(); }).observe(wrap);
wrap.addEventListener('pointermove',ev=>{
  if(!current){hideTip();return;}
  const b=wrap.getBoundingClientRect(),i=Math.max(0,Math.min(NX-1,Math.floor((ev.clientX-b.left)/b.width*NX))),j=Math.max(0,Math.min(NY-1,Math.floor((ev.clientY-b.top)/b.height*NY))),c=j*NX+i;
  if(current.mask[c]<8){hideTip();return;}
  const lat=latOf(j);
  showTip(ev,`${Math.abs(lat).toFixed(1)}°${lat<0?'S':'N'}, ${lonOf(i).toFixed(1)}°E`,[{name:'TEC (estimate)',v:F[c]}]);
});
wrap.addEventListener('pointerleave',()=>hideTip());

const fmtSigned = v => (v>=0?'+':'−')+Math.abs(v).toFixed(1);
const fmtLT = (h,lon) => { const t=(h+lon/15+24)%24,m=Math.floor(t*60+1e-6); return pad(Math.floor(m/60))+':'+pad(m%60); };
const fmtDate = iso => `${+iso.slice(8)} ${MONTHS[+iso.slice(5,7)-1]} 2026`;

/* ---------- tables ---------- */
const rows={};
ST.forEach(s=>{ const tr=H('tr',null,null,$('readout')); H('td',null,s.id,tr); H('td','l',s.city,tr); H('td',null,s.lat.toFixed(2),tr); H('td',null,s.lon.toFixed(2),tr); H('td',null,(s.dip<0?'−':'')+Math.abs(s.dip).toFixed(2),tr);
  rows[s.id]={lt:H('td',null,null,tr),v:H('td',null,null,tr),n:H('td',null,null,tr)}; });
const pairNodes=PAIRS.map(([a,b])=>{ const tr=H('tr',null,null,$('pairs')); H('td',null,`${a} และ ${b}`,tr);
  return {d:H('td',null,null,tr),r:H('td',null,null,tr),lag:H('td','l',null,tr)}; });
function drawTables(){
  const h=state.q;
  $('nHead').textContent = state.mode==='month' ? 'จำนวนวัน' : (window.TEC_MONTH_HEAD||'Median เดือน');
  ST.forEach(s=>{ const r=rows[s.id],v=val(s.id,h); r.lt.textContent=fmtLT(h/4,s.lon); r.v.textContent=v==null?'ไม่มีข้อมูล':v.toFixed(1);
    if(state.mode==='month') r.n.textContent=`${monthVals(s.id,state.month,h).length}/${monthLen[state.month]}`;
    else { const m=D.med15[s.id][h][state.month]==null?null:medCurve(s.id,state.month)[h]; r.n.textContent=m==null?'-':m.toFixed(1); } });
  PAIRS.forEach(([a,b],i)=>{ const x=val(a,h),y=val(b,h),n=pairNodes[i]; n.d.textContent=x!=null&&y!=null?fmtSigned(x-y):'ไม่มีข้อมูล';
    const ca=rawMed(a,state.month),cb=rawMed(b,state.month),r=pearson(ca,cb); n.r.textContent=r==null?'-':r.toFixed(2);
    const l=bestLag(ca,cb); n.lag.textContent=l===0?'ไม่เหลื่อม':`ฟิลิปปินส์${l>0?'นำ':'ตาม'} ${Math.abs(l)} ชม.`; });
}

/* ---------- chart ---------- */
const chart=$('chart');
const M={l:50,r:12,t:8,b:44}, CH=340;
let cw=800;
const sx=q=>M.l+q/(NQ-1)*(cw-M.l-M.r), sy=v=>M.t+(1-v/TEC_MAX)*(CH-M.t-M.b);
const shown=()=>state.pair===2?ST.map(s=>s.id):PAIRS[state.pair];
function pathOf(y){ let d='',pen=false,solo=[]; y.forEach((v,h)=>{ if(v==null){pen=false;return;} d+=(pen?'L':'M')+sx(h).toFixed(1)+','+sy(v).toFixed(1); const prev=y[h-1],next=y[h+1]; if(prev==null&&next==null)solo.push(h); pen=true; }); return {d,solo}; }
function drawChart(){
  cw=chart.clientWidth||800; chart.setAttribute('viewBox',`0 0 ${cw} ${CH}`); chart.textContent='';
  const ids=shown(), x0=M.l, x1=cw-M.r, y0=sy(0), y1=sy(TEC_MAX);
  for(let v=20;v<TEC_MAX;v+=20) S('line',{x1:x0,x2:x1,y1:sy(v),y2:sy(v),stroke:'#ddd','stroke-width':1},chart);
  const band = state.mode==='month'&&ids.length===2&&!window.TEC_NO_BAND; // the (2) page hides it: its lines are trend fits, the band is from logged days
  if(band) ids.forEach(id=>{ const vs=Array.from({length:NQ},(_,h)=>monthVals(id,state.month,h)),
      band=p=>smooth(vs.map(a=>a.length?quant(a,p):null),true), q3=band(.75), q1=band(.25), up=[],lo=[];
    for(let h=0;h<NQ;h++) if(q3[h]!=null){up.push(`${sx(h).toFixed(1)},${sy(q3[h]).toFixed(1)}`);lo.unshift(`${sx(h).toFixed(1)},${sy(q1[h]).toFixed(1)}`);}
    if(up.length>1) S('polygon',{points:up.concat(lo).join(' '),fill:`var(${byId[id].c})`,opacity:.22},chart); });
  S('line',{x1:sx(state.q),x2:sx(state.q),y1:y1,y2:y0,stroke:'#888','stroke-width':1},chart);
  ids.forEach(id=>{ const s=byId[id],col=`var(${s.c})`;
    if(state.mode==='day') S('path',{d:pathOf(medCurve(id,state.month)).d,fill:'none',stroke:col,'stroke-width':1,'stroke-dasharray':'1 3'},chart);
    if(GIM_REF&&state.mode==='month') S('path',{d:pathOf(GIM_REF[id][state.month]).d,fill:'none',stroke:col,'stroke-width':1.2,'stroke-dasharray':'2 3'},chart);
    const {d,solo}=pathOf(curve(id)), line=S('path',{d,fill:'none',stroke:col,'stroke-width':2,'stroke-linejoin':'round'},chart);
    if(s.dash) line.setAttribute('stroke-dasharray',s.dash);
    solo.forEach(h=>S('circle',{cx:sx(h),cy:sy(val(id,h)),r:2.5,fill:col},chart));
    const v=val(id,state.q); if(v!=null) S('circle',{cx:sx(state.q),cy:sy(v),r:3.5,fill:col},chart); });
  S('rect',{x:x0,y:y1,width:x1-x0,height:y0-y1,fill:'none',stroke:'#000','stroke-width':1},chart);
  for(let v=0;v<=TEC_MAX;v+=20){ S('line',{x1:x0-5,x2:x0,y1:sy(v),y2:sy(v),stroke:'#000'},chart); S('text',{x:x0-8,y:sy(v)+4,'text-anchor':'end',class:'tk'},chart).textContent=v; }
  const ticks=cw<520?6:3;
  for(let h=0;h<24;h+=ticks){ S('line',{x1:sx(h*4),x2:sx(h*4),y1:y0,y2:y0+5,stroke:'#000'},chart); S('text',{x:sx(h*4),y:y0+19,'text-anchor':'middle',class:'tk'},chart).textContent=h; }
  S('text',{x:(x0+x1)/2,y:CH-5,'text-anchor':'middle',class:'ax'},chart).textContent='Time (UT)';
  S('text',{transform:`translate(13,${(y0+y1)/2}) rotate(-90)`,'text-anchor':'middle',class:'ax'},chart).textContent='TEC (TECU)';
  // legend box, as in the group's own TEC plots
  const items=ids.map(id=>({label:`${id}, ${byId[id].en}${state.mode==='month'?(window.TEC_STATION_SUFFIX||''):''}`,col:`var(${byId[id].c})`,dash:byId[id].dash}));
  if(GIM_REF&&state.mode==='month') ids.forEach(id=>items.push({label:`GIM (UQRG) at ${id}`,col:`var(${byId[id].c})`,dash:'2 3',thin:true}));
  if(band) items.push({label:'Daily IQR',band:true});
  if(state.mode==='day') items.push({label:window.TEC_MONTH_LABEL||'Monthly median',col:'#000',dash:'1 3'});
  const bw=Math.max(148,46+6.4*Math.max(...items.map(it=>it.label.length))),bh=items.length*18+8,bx=x1-bw-8,by=y1+8;
  S('rect',{x:bx,y:by,width:bw,height:bh,fill:'#fff',stroke:'#000','stroke-width':.7},chart);
  items.forEach((it,i)=>{ const ty=by+16+i*18;
    if(it.band) S('rect',{x:bx+8,y:ty-9,width:24,height:9,fill:'#000',opacity:.22},chart);
    else { const l=S('line',{x1:bx+8,x2:bx+32,y1:ty-4,y2:ty-4,stroke:it.col,'stroke-width':it.thin?1.2:2},chart); if(it.dash) l.setAttribute('stroke-dasharray',it.dash); }
    S('text',{x:bx+38,y:ty,class:'tk'},chart).textContent=it.label; });
  const hover=S('line',{x1:0,x2:0,y1:y1,y2:y0,stroke:'#000','stroke-width':.7,visibility:'hidden'},chart);
  const hit=S('rect',{x:x0-12,y:0,width:x1-x0+24,height:y0,fill:'transparent'},chart); hit.style.cursor='crosshair';
  const pick=ev=>{const b=chart.getBoundingClientRect(); return Math.max(0,Math.min(NQ-1,Math.round((ev.clientX-b.left-M.l)/(cw-M.l-M.r)*(NQ-1))));};
  hit.addEventListener('pointermove',ev=>{ const h=pick(ev); hover.setAttribute('x1',sx(h)); hover.setAttribute('x2',sx(h)); hover.setAttribute('visibility','visible');
    showTip(ev,`${fmtUT(h)} UT`,ids.map(id=>({name:id,v:val(id,h)}))); });
  hit.addEventListener('pointerleave',()=>{hover.setAttribute('visibility','hidden');hideTip();});
  hit.addEventListener('click',ev=>{stopPlay();state.q=pick(ev);$('hour').value=state.q;render();});
}

/* ---------- tooltip ---------- */
const tip=$('tip');
function showTip(ev,title,items){ tip.textContent=''; H('h4',null,title,tip);
  items.forEach(r=>{const w=H('div',null,null,tip); H('span',null,r.name,w); H('b',null,r.v==null?'no data':r.v.toFixed(1),w);});
  tip.hidden=false; const b=tip.getBoundingClientRect(),x=ev.clientX+14,y=ev.clientY+14;
  tip.style.left=Math.min(x,innerWidth-b.width-8)+'px'; tip.style.top=Math.min(y,innerHeight-b.height-8)+'px'; }
function hideTip(){tip.hidden=true;}

/* ---------- daily panels + coverage ---------- */
const hm={}, NDAYS=D.days.length;
ST.forEach(s=>{ const box=H('div','hm',null,$('hmGrid')); H('h3',null,`${s.id}, ${s.en}`,box);
  const box2=H('div','hm-box',null,box), y=H('div','hm-y',null,box2); ['0','12','23'].forEach(v=>H('span',null,v,y));
  const cv=H('canvas',null,null,box2); cv.width=NDAYS; cv.height=NQ; cv.setAttribute('role','img'); cv.setAttribute('aria-label',`TEC รายวันของ ${s.id} ความครบถ้วนอยู่ในตารางที่ 3`);
  const mark=H('div','hm-mark',null,box2);
  const xr=H('div','hm-x',null,box); MONTHS_EN.forEach((m,i)=>{H('span',null,m,xr).style.left=(monthStart[i]/NDAYS*100)+'%';});
  const at=ev=>{const b=cv.getBoundingClientRect(); return {i:Math.max(0,Math.min(NDAYS-1,Math.floor((ev.clientX-b.left)/b.width*NDAYS))),h:Math.max(0,Math.min(NQ-1,Math.floor((ev.clientY-b.top)/b.height*NQ)))};};
  cv.addEventListener('pointermove',ev=>{const {i,h}=at(ev); showTip(ev,`${D.days[i]}, ${fmtUT(h)} UT`,[{name:s.id,v:D.daily15[s.id][i][h]}]);});
  cv.addEventListener('pointerleave',hideTip);
  cv.addEventListener('click',ev=>{const {i,h}=at(ev); stopPlay(); state.mode='day'; state.day=i; state.month=dayMonth[i]; state.q=h; syncControls(); render();});
  hm[s.id]={cv,mark}; });
function paintHeatmaps(){
  ST.forEach(s=>{ const ctx=hm[s.id].cv.getContext('2d'),img=ctx.createImageData(NDAYS,NQ);
    for(let i=0;i<NDAYS;i++)for(let h=0;h<NQ;h++){const v=D.daily15[s.id][i][h],c=v==null?[255,255,255]:tecRgb(v),o=(h*NDAYS+i)*4;img.data.set([c[0],c[1],c[2],255],o);}
    ctx.putImageData(img,0,0); });
}
function drawMarks(){ ST.forEach(s=>{ const m=hm[s.id].mark,box=hm[s.id].cv.parentElement,px=(box.clientWidth-22)/NDAYS;
  m.style.left=(22+(state.mode==='month'?monthStart[state.month]:state.day)*px)+'px'; m.style.width=((state.mode==='month'?monthLen[state.month]:1)*px)+'px';
  m.style.top=(state.q/NQ*92)+'px'; m.style.height=Math.max(2,92/NQ)+'px'; }); }
(function coverage(){ const t=$('coverage'),h=H('thead',null,null,t),hr=H('tr',null,null,h); H('th',null,'สถานี',hr).scope='col'; MONTHS.forEach(m=>{H('th',null,m,hr).scope='col';}); H('th',null,'รวม',hr).scope='col';
  const b=H('tbody',null,null,t); ST.forEach(s=>{const tr=H('tr',null,null,b);H('td',null,s.id,tr); MONTHS.forEach((_,m)=>{const a=D.daily[s.id].slice(monthStart[m],monthStart[m]+monthLen[m]).flat(),p=100*a.filter(v=>v!=null).length/a.length;H('td',p<50?'low':null,p.toFixed(0),tr);});
    const a=D.daily[s.id].flat();H('td',null,(100*a.filter(v=>v!=null).length/a.length).toFixed(0),tr);}); })();

/* ---------- controls ---------- */
const pick = (id,set) => $(id).addEventListener('change',e=>{stopPlay();set(e.target.value);syncControls();render();});
pick('mode',v=>{state.mode=v;});
pick('month',v=>{state.month=+v;state.day=monthStart[+v];});
pick('step',v=>{state.step=+v;buildBands();});
pick('pair',v=>{state.pair=+v;});
function fillDays(){ const sel=$('day'); sel.textContent=''; for(let i=monthStart[state.month];i<monthStart[state.month]+monthLen[state.month];i++){const o=H('option',null,fmtDate(D.days[i]),sel);o.value=i;} sel.value=state.day; }
function syncControls(){ $('mode').value=state.mode; $('month').value=state.month; $('step').value=state.step; $('pair').value=state.pair; $('dayField').hidden=state.mode!=='day'; fillDays(); $('hour').value=state.q; }
$('day').addEventListener('change',e=>{stopPlay();state.day=+e.target.value;render();});
$('hour').addEventListener('input',e=>{stopPlay();state.q=+e.target.value;render();});
function stopPlay(){ if(state.playing){clearInterval(state.playing);state.playing=null;} const b=$('play');b.textContent='เล่น';b.setAttribute('aria-pressed','false'); }
$('play').addEventListener('click',()=>{ if(state.playing){stopPlay();return;} const b=$('play');b.textContent='หยุด';b.setAttribute('aria-pressed','true');
  state.playing=setInterval(()=>{ state.q=(state.q+1)%NQ;
    if(state.q===0&&state.mode==='day'){ state.day=(state.day+1)%NDAYS; state.month=dayMonth[state.day]; syncControls(); }
    $('hour').value=state.q; render(); },250); });

function drawCaptions(){
  const t=`${fmtUT(state.q)} UT`, when=state.mode==='month'?`median เดือน${MONTHS_LONG[state.month]} 2026`:`วันที่ ${fmtDate(D.days[state.day])}`;
  const half=monthLen[state.month]/2, few=state.mode==='month'?ST.map(s=>[s.id,monthVals(s.id,state.month,state.q).length]).filter(([,n])=>n<half):[];
  $('cap1').textContent=`แผนที่ contour ของ ${SRC} เวลา ${t} ${when} ระยะเส้น ${state.step} TECU สามเหลี่ยมคือสถานี เส้นประยาวคือเส้นแบ่งกลางวันกับกลางคืน เส้นจุดคือขอบเขตที่ล้อมรอบด้วยสถานี พื้นที่จางอยู่นอกแนวสถานีและไม่ควรอ่านค่า`
    +(few.length?` ค่า median ของ ${few.map(([id,n])=>`${id} มาจากข้อมูลเพียง ${n} วัน`).join(' และ ')}`:'');
  $('cap2').textContent=`${SRC} ตามเวลา ${when} ${window.TEC_CAP2_NOTE||'ทำให้เรียบด้วย moving average 1 ชั่วโมงสองรอบ (หมายเหตุ 1)'} เส้นตั้งคือเวลาที่เลือก คลิกในกราฟเพื่อเปลี่ยนเวลา`;
}
function render(){
  $('clock').textContent=`${fmtUT(state.q)} UT`;
  drawField(); drawIso(); drawStations(); drawTables(); drawChart(); drawMarks(); drawCaptions();
}
new ResizeObserver(()=>{drawChart();drawMarks();}).observe($('hmGrid'));
syncControls(); buildBands(); paintHeatmaps(); render();
