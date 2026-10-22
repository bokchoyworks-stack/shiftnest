/* ShiftNest 勤務表エンジン（iOS版 Engine.swift と同じ計算）。holidays.js を先に読み込むこと */
/* ===== 勤務表エンジン（純粋関数） ===== */
const OFF=0,DAY=1,EVE=2,NIG=3,YAK=4,AKE=5;
const LABEL=['休','日','準','深','夜','明','有','—'];
const LONG=['休み','日勤','準夜','深夜','夜勤','明け','有給','不在'];
const WD='日月火水木金土';
function allowedTable(mode){
  const a=Array.from({length:8},()=>Array(8).fill(true));
  if(mode==='3'){a[EVE][DAY]=false;a[NIG][DAY]=false;a[EVE][NIG]=false;}
  else{
    a[DAY][YAK]=false;
    for(let s=0;s<6;s++){if(s!==AKE)a[YAK][s]=false;if(s!==OFF)a[AKE][s]=false;if(s!==YAK)a[s][AKE]=false;}
  }
  for(let s=0;s<8;s++){a[s][6]=a[s][7]=a[s][OFF];}
  for(let s=0;s<8;s++){a[6][s]=a[7][s]=a[OFF][s];}
  return a;
}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const W={hard:10000,ng:6000,x:1000,overN:600,short:400,consec:60,nrun:35,p2:25,p1:6,fairN:5,fairW:3,soft:40,star:800};
function buildModel(cfg){
  const {mode,days,staff,prefs,ng,prev,req,rules}=cfg;
  const S=staff.length,D=days.length;
  const allowed=allowedTable(mode);
  const nightCodes=mode==='3'?[EVE,NIG]:[YAK];
  const isNight=new Uint8Array(6);nightCodes.forEach(c=>isNight[c]=1);
  const need=[];let err=null;
  for(let d=0;d<D;d++){
    const r=days[d].hol?req.holiday:req.weekday,o=new Int16Array(8);
    for(let n=0;n<S;n++){const f=cfg.fixed[n][d];if(f)o[f]++;}
    if(mode==='3'){o[DAY]=r.D;o[EVE]=r.E;o[NIG]=r.N;}
    else{o[DAY]=r.D;o[YAK]=r.Y;o[AKE]=d===0?prev.reduce((a,p)=>a+(p[1]===YAK?1:0),0):need[d-1][YAK];}
    let sum=0;for(let c=1;c<8;c++)sum+=o[c];
    o[OFF]=S-sum;
    if(o[OFF]<0&&!err)err=days[d].day+'日は勤務できる人が足りません（必要'+(sum-o[6]-o[7])+'人・勤務できる人'+(S-o[6]-o[7])+'人）';
    need.push(o);
  }
  const gi=Int8Array.from(staff.map(s=>s.gi)),G=cfg.groups.length,nightOK=staff.map(s=>!!s.night),target=staff.map(s=>s.off);
  const mask=a=>{const b=new Uint8Array(G);(a||[]).forEach(i=>{if(i<G)b[i]=1;});return b;};
  const combo=(cfg.combo||[]).filter(r=>r.g&&r.g.length&&(r.type!=='with'||(r.p&&r.p.length))).map(r=>({...r,gm:mask(r.g),pm:mask(r.p)}));
  const maxN=mode==='3'?rules.maxNights3:rules.maxNights2;
  let nightSlots=0,holWork=0,demand=0;
  for(let d=0;d<D;d++){for(const c of nightCodes)nightSlots+=need[d][c];const w=S-need[d][OFF]-need[d][6]-need[d][7];demand+=w;if(days[d].hol)holWork+=w;}
  const nightOnly=staff.map(st=>st.kind==='night'||st.kind==='eve'||st.kind==='nig');
  const fixed=cfg.fixed,fixCnt=fixed.map(f=>f.reduce((a,v)=>a+(v?1:0),0));
  const workCap=target.map((t,i)=>Math.max(0,D-t-fixCnt[i])),capSum=workCap.reduce((a,b)=>a+b,0)||1;
  const maxNs=staff.map((st,i)=>nightOnly[i]?(mode==='3'?Math.min(18,workCap[i]):Math.min(9,Math.floor(workCap[i]/2))):maxN);
  let noNights=0;nightOnly.forEach((o,i)=>{if(o)noNights+=maxNs[i];});
  const nReg=nightOK.filter((ok,i)=>ok&&!nightOnly[i]).length||1;
  const nNight=nReg;
  const expN=nightOK.map((ok,i)=>!ok?0:nightOnly[i]?maxNs[i]:Math.max(0,nightSlots-noNights)/nReg);
  const nightBits=nightCodes.reduce((a,c)=>a|(1<<c),0);
  const dv=staff.map(st=>st.dv||0),canL=dv.map(v=>v===0||v===1?1:0),canE=dv.map(v=>v===0||v===2?1:0);
  const lateNeed=days.map(dd=>(dd.hol?req.holiday:req.weekday).L||0),earlyNeed=days.map(dd=>(dd.hol?req.holiday:req.weekday).F||0);
  const ban=cfg.ban||staff.map(st=>new Uint8Array(D).fill(st.night?0:nightBits));
  const expW=workCap.map(c=>holWork*c/capSum);
  const NG=Array.from({length:S},()=>new Uint8Array(S));
  for(const [a,b] of ng){NG[a][b]=1;NG[b][a]=1;}
  return {mode,days,S,D,allowed,nightCodes,isNight,need,gi,G,combo,groups:cfg.groups,fixed,ban,nightBits,nightOnly,maxNs,dv,canL,canE,lateNeed,earlyNeed,nightOK,target,maxN,expN,expW,NG,prefs,prev,rules,err,demand,supply:capSum,nightSlots,nNight,nightHours:mode==='3'?8:16};
}
function rowPen(m,X,n){
  const row=X[n],P=m.prefs[n],A=m.allowed,D=m.D,pv=m.prev[n];
  let p=0,prevS=pv[1],off=0,nights=0,wk=0;
  let run=pv[1]!==OFF?(pv[0]!==OFF?2:1):0;
  let nr=m.isNight[pv[1]]?(pv[0]===pv[1]?2:1):0;
  const mc=m.rules.maxConsec;
  for(let d=0;d<D;d++){
    const s=row[d];
    if(!A[prevS][s])p+=W.hard;
    if(s===OFF){off++;run=0;nr=0;}
    else if(s>=6){run=0;nr=0;}
    else{
      run++;if(run>mc)p+=W.consec*(run-mc);
      const q=P[d];if(q===3)p+=W.x;else if(q===4)p+=W.star;else if(q===2)p+=W.p2;else if(q===1)p+=W.p1;
      if(m.days[d].hol)wk++;
      if(m.ban[n][d]&(1<<s))p+=W.hard;
      if(m.isNight[s]){nights++;nr=(s===prevS)?nr+1:1;if(nr>1)p+=W.nrun*(nr-1);}else nr=0;
    }
    prevS=s;
  }
  const sh=m.target[n]-off;if(sh>0)p+=W.short*sh;
  if(nights>m.maxNs[n])p+=W.overN*(nights-m.maxNs[n]);
  if(m.nightOK[n]){const e=nights-m.expN[n];p+=W.fairN*e*e;}
  const e2=wk-m.expW[n];p+=W.fairW*e2*e2;
  return p;
}
function gl(ids,groups){return (ids||[]).map(i=>groups[i]?groups[i].code:'?').join('・');}
function ruleText(r,groups){
  if(r.type==='min')return '夜勤に '+gl(r.g,groups)+' を最低'+r.n+'人';
  if(r.type==='notOnly')return gl(r.g,groups)+' だけの夜勤はつくらない';
  return gl(r.g,groups)+' の夜勤には '+gl(r.p,groups)+' も一緒';
}
const _mem=[],_cnt=new Int16Array(32);
function comboEval(m,cnt,total,stat){
  let p=0;
  for(const r of m.combo){
    let s=0,sp=0,both=0;
    for(let g=0;g<m.G;g++){if(r.gm[g]){s+=cnt[g];if(r.pm[g])both+=cnt[g];}if(r.pm[g])sp+=cnt[g];}
    let bad=0,app=1;
    if(r.type==='min'){if(s<r.n)bad=r.n-s;}
    else if(r.type==='notOnly'){if(s===total)bad=1;}
    else{if(s===0)app=0;else if(sp-(s===1&&both===1?1:0)<1)bad=1;}
    p+=(r.must?W.hard:W.soft)*bad;
    if(stat){let st=stat.get(r);if(!st){st={ok:0,app:0};stat.set(r,st);}if(app){st.app++;if(!bad)st.ok++;}st.lastBad=!!bad;}
  }
  return p;
}
function colPen(m,X,d){
  let p=0;const S=m.S,G=m.G,cnt=_cnt;
  for(const c of m.nightCodes){
    _mem.length=0;for(let g=0;g<G;g++)cnt[g]=0;
    for(let n=0;n<S;n++)if(X[n][d]===c){_mem.push(n);cnt[m.gi[n]]++;}
    if(_mem.length)p+=comboEval(m,cnt,_mem.length,null);
    for(let i=0;i<_mem.length;i++)for(let j=i+1;j<_mem.length;j++)if(m.NG[_mem[i]][_mem[j]])p+=W.ng;
  }
  const L=m.lateNeed[d],E=m.earlyNeed[d];
  if(L||E){let cl=0,ce=0,cb=0;for(let n=0;n<S;n++)if(X[n][d]===DAY&&m.dv[n]!==3){const a=m.canL[n],b=m.canE[n];if(a)cl++;if(b)ce++;if(a&&b)cb++;}
    const sh=Math.max(0,L-cl)+Math.max(0,E-ce)+Math.max(0,(L+E)-(cl+ce-cb));if(sh)p+=W.hard*sh;}
  return p;
}
const VLABEL=['日','早','遅','短'];
function assignVariants(m,X){
  const V=X.map(r=>new Int8Array(r.length)),lc=new Int16Array(m.S),ec=new Int16Array(m.S),miss=[];
  for(let d=0;d<m.D;d++){
    const Wk=[];for(let n=0;n<m.S;n++)if(X[n][d]===DAY){if(m.dv[n]===3)V[n][d]=3;else Wk.push(n);}
    let L=m.lateNeed[d],E=m.earlyNeed[d];
    const lateC=Wk.filter(n=>m.canL[n]).sort((a,b)=>(lc[a]-lc[b])||(m.canE[a]-m.canE[b]));
    let eAvail=Wk.filter(n=>m.canE[n]).length;
    for(const n of lateC){if(L<=0)break;if(m.canE[n]&&eAvail-1<E)continue;V[n][d]=2;lc[n]++;L--;if(m.canE[n])eAvail--;}
    for(const n of lateC){if(L<=0)break;if(V[n][d])continue;V[n][d]=2;lc[n]++;L--;}
    Wk.filter(n=>m.canE[n]&&!V[n][d]).sort((a,b)=>ec[a]-ec[b]).forEach(n=>{if(E>0){V[n][d]=1;ec[n]++;E--;}});
    if(L>0||E>0)miss.push({type:'時間帯',d,msg:(d+1)+'日の'+(L>0?'遅出':'早出')+'に入れる人が足りません'});
  }
  return {V,miss,lc,ec};
}
function initial(m,rnd){
  const {S,D}=m,X=Array.from({length:S},()=>new Int8Array(D));
  const nights=new Int16Array(S),works=new Int16Array(S);
  for(let d=0;d<D;d++){
    const prevOf=n=>d>0?X[n][d-1]:m.prev[n][1];
    const free=new Uint8Array(S).fill(1),cnt=Array.from(m.need[d]);
    for(let n=0;n<S;n++){const f=m.fixed[n][d];if(f){X[n][d]=f;free[n]=0;}}
    if(m.mode==='2'){
      for(let n=0;n<S;n++){if(!free[n])continue;const p=prevOf(n);
        if(p===YAK){X[n][d]=AKE;free[n]=0;cnt[AKE]--;works[n]++;}
        else if(p===AKE){X[n][d]=OFF;free[n]=0;}}
    }
    const order=m.mode==='3'?[NIG,EVE]:[YAK];
    for(const c of order){
      const k=cnt[c];if(k<=0)continue;
      const ok=n=>free[n]&&!(m.ban[n][d]&(1<<c))&&m.prefs[n][d]!==3&&m.allowed[prevOf(n)][c]&&nights[n]<m.maxNs[n]&&(m.mode==='3'||d+1>=D||(m.prefs[n][d+1]!==3&&!m.fixed[n][d+1]));
      const cands=[];for(let n=0;n<S;n++)if(ok(n))cands.push(n);
      const sc={};for(const n of cands)sc[n]=(nights[n]-m.expN[n]*(d+1)/D)*10+(m.prefs[n][d]===4?60:m.prefs[n][d]===2?30:m.prefs[n][d]===1?6:0)+(prevOf(n)===c?8:0)+rnd()*4;
      cands.sort((a,b)=>sc[a]-sc[b]);
      const picked=[];
      for(const r of m.combo){if(r.type!=='min'||!r.must)continue;let need=r.n-picked.filter(n=>r.gm[m.gi[n]]).length;while(need>0&&picked.length<k){const i=cands.findIndex(n=>r.gm[m.gi[n]]&&!picked.some(q=>m.NG[q][n]));if(i<0)break;picked.push(cands[i]);cands.splice(i,1);need--;}}
      for(const n of cands){if(picked.length>=k)break;if(picked.some(q=>m.NG[q][n]))continue;picked.push(n);}
      for(let n=0;n<S&&picked.length<k;n++)if(free[n]&&!(m.ban[n][d]&(1<<c))&&!picked.includes(n))picked.push(n);
      for(let n=0;n<S&&picked.length<k;n++)if(free[n]&&!picked.includes(n))picked.push(n);
      for(const n of picked.slice(0,k)){X[n][d]=c;free[n]=0;nights[n]++;works[n]++;}
    }
    {
      const k=cnt[DAY],rem=D-d;
      const cands=[];for(let n=0;n<S;n++)if(free[n]&&!(m.ban[n][d]&2)&&m.prefs[n][d]!==3&&m.allowed[prevOf(n)][DAY])cands.push(n);
      const sc={};for(const n of cands)sc[n]=-((D-m.target[n])-works[n])/rem*10+(m.prefs[n][d]===4?9:m.prefs[n][d]===2?4:m.prefs[n][d]===1?1:0)+rnd()*.5;
      cands.sort((a,b)=>sc[a]-sc[b]);
      const picked=cands.slice(0,k);
      for(let n=0;n<S&&picked.length<k;n++)if(free[n]&&!(m.ban[n][d]&2)&&!picked.includes(n))picked.push(n);
      for(let n=0;n<S&&picked.length<k;n++)if(free[n]&&!picked.includes(n))picked.push(n);
      for(const n of picked){X[n][d]=DAY;free[n]=0;works[n]++;}
    }
  }
  return X;
}
function* solve(m,opt){
  const iters=(opt&&opt.iters)||700000,rnd=mulberry32((opt&&opt.seed)||1);
  const X=initial(m,rnd),S=m.S,D=m.D;
  const row=new Float64Array(S),col=new Float64Array(D);
  for(let n=0;n<S;n++)row[n]=rowPen(m,X,n);
  for(let d=0;d<D;d++)col[d]=colPen(m,X,d);
  let total=0;for(const v of row)total+=v;for(const v of col)total+=v;
  let best=Infinity,bestX=null;
  const T0=400,T1=.2,lr=Math.log(T1/T0),maxK=m.mode==='2'?3:2,nc=[0,0,0];
  for(let it=0;it<iters;it++){
    if(it%20000===0)yield it/iters;
    const T=T0*Math.exp(lr*it/iters);
    const k=1+Math.floor(rnd()*maxK),d0=Math.floor(rnd()*(D-k+1));
    const i=Math.floor(rnd()*S);let j=Math.floor(rnd()*(S-1));if(j>=i)j++;
    const Xi=X[i],Xj=X[j];
    let same=true,fx=false;for(let t=0;t<k;t++){if(Xi[d0+t]!==Xj[d0+t])same=false;if(m.fixed[i][d0+t]||m.fixed[j][d0+t])fx=true;}
    if(same||fx)continue;
    let old=row[i]+row[j];for(let t=0;t<k;t++)old+=col[d0+t];
    for(let t=0;t<k;t++){const a=Xi[d0+t];Xi[d0+t]=Xj[d0+t];Xj[d0+t]=a;}
    const ri=rowPen(m,X,i),rj=rowPen(m,X,j);let nw=ri+rj;
    for(let t=0;t<k;t++){nc[t]=colPen(m,X,d0+t);nw+=nc[t];}
    const delta=nw-old;
    if(delta<=0||rnd()<Math.exp(-delta/T)){
      row[i]=ri;row[j]=rj;for(let t=0;t<k;t++)col[d0+t]=nc[t];total+=delta;
      if(it>iters*.4&&total<best-1e-9){best=total;bestX=X.map(r=>r.slice());}
    }else{for(let t=0;t<k;t++){const a=Xi[d0+t];Xi[d0+t]=Xj[d0+t];Xj[d0+t]=a;}}
  }
  if(!bestX||total<best){best=total;bestX=X.map(r=>r.slice());}
  return {X:bestX,total:best};
}
function verify(m,X){
  const {S,D}=m,hard=[],xv=[],short=[],overN=[],ngv=[],stat=new Map();
  const nights=new Int16Array(S),offs=new Int16Array(S),wk=new Int16Array(S),maxRun=new Int16Array(S);
  const pref={x:[0,0],p2:[0,0],p1:[0,0],star:[0,0]};
  for(let d=0;d<D;d++){
    const cnt=new Int16Array(8);for(let n=0;n<S;n++)cnt[X[n][d]]++;
    for(let c=0;c<8;c++)if(cnt[c]!==m.need[d][c])hard.push({type:'人数',d,msg:(d+1)+'日の'+LONG[c]+'が'+cnt[c]+'人（必要'+m.need[d][c]+'人）'});
    for(const c of m.nightCodes){
      const mem=[];for(let n=0;n<S;n++)if(X[n][d]===c)mem.push(n);
      if(!mem.length)continue;
      const cnt=new Int16Array(m.G);mem.forEach(n=>cnt[m.gi[n]]++);
      comboEval(m,cnt,mem.length,stat);
      for(const r of m.combo)if(r.must&&stat.get(r).lastBad)hard.push({type:'組み合わせ',d,msg:(d+1)+'日の'+LONG[c]+'：「'+ruleText(r,m.groups)+'」を守れていません'});
      for(let i=0;i<mem.length;i++)for(let j=i+1;j<mem.length;j++)if(m.NG[mem[i]][mem[j]])ngv.push({d,a:mem[i],b:mem[j]});
    }
  }
  for(let n=0;n<S;n++){
    let prevS=m.prev[n][1],run=0,nr=0;
    for(let d=0;d<D;d++){
      const s=X[n][d],q=m.prefs[n][d];
      if(!m.allowed[prevS][s])hard.push({type:'並び',n,d,msg:(d+1)+'日：'+LONG[prevS]+'→'+LONG[s]+' は禁止'});
      if(s>0&&s<6&&(m.ban[n][d]&(1<<s)))hard.push({type:'勤務タイプ',n,d,msg:(d+1)+'日：'+LONG[s]+'に入れない人が'+LONG[s]});
      if(m.isNight[s])nights[n]++;
      if(s===OFF){offs[n]++;run=0;}else if(s>=6){run=0;}else{run++;if(run>maxRun[n])maxRun[n]=run;if(m.days[d].hol)wk[n]++;}
      if(s<6){
      if(q===3){pref.x[1]++;if(s===OFF)pref.x[0]++;else xv.push({n,d});}
      if(q===2){pref.p2[1]++;if(s===OFF)pref.p2[0]++;}
      if(q===1){pref.p1[1]++;if(s===OFF)pref.p1[0]++;}
      if(q===4){pref.star[1]++;if(s===OFF)pref.star[0]++;}}
      prevS=s;
    }
    if(offs[n]<m.target[n])short.push({n,lack:m.target[n]-offs[n]});
    if(nights[n]>m.maxNs[n])overN.push({n,over:nights[n]-m.maxNs[n]});
  }
  let nr2=0;
  for(let n=0;n<S;n++){let c=0,prevS=m.prev[n][1];for(let d=0;d<D;d++){const s=X[n][d];if(m.isNight[s]){c=(s===prevS)?c+1:1;if(c>nr2)nr2=c;}else c=0;prevS=s;}}
  let nightHoursTotal=0;for(let n=0;n<S;n++)if(!m.nightOnly[n])nightHoursTotal+=nights[n]*m.nightHours;
  const avgNightH=nightHoursTotal/m.nNight;
  return {hard,xv,short,overN,nights,offs,wk,maxRun,pref,maxNightRun:nr2,avgNightH,comboStat:stat,ngv};
}
function analyzeX(m,xv){
  const days=[...new Set(xv.map(v=>v.d))].sort((a,b)=>a-b);
  const mr=m.combo.find(r=>r.type==='min'&&r.must);
  return days.map(d=>{
    const nShifts=(m.nightCodes.filter(c=>m.need[d][c]>0).length+(m.mode==='2'&&d>0?1:0))*(mr?mr.n:1);
    const canNight=n=>(m.ban[n][d]&m.nightBits)!==m.nightBits&&!m.fixed[n][d]&&(m.mode==='3'||d+1>=m.D||(m.prefs[n][d+1]!==3&&!m.fixed[n][d+1]));
    let cause=null,pool=[];
    if(mr){
      let have=0;for(let n=0;n<m.S;n++)if(mr.gm[m.gi[n]]&&canNight(n)&&m.prefs[n][d]!==3)have++;
      if(have<nShifts){cause={kind:'grp',label:gl(mr.g,m.groups),need:nShifts,have};
        for(let n=0;n<m.S;n++)if(mr.gm[m.gi[n]]&&(m.ban[n][d]&m.nightBits)!==m.nightBits&&!m.fixed[n][d]&&m.prefs[n][d]===3)pool.push(n);}
    }
    if(!cause){cause={kind:'num'};for(let n=0;n<m.S;n++)if(!m.fixed[n][d]&&m.prefs[n][d]===3)pool.push(n);}
    const xCount=n=>m.prefs[n].reduce((a,q)=>a+(q===3?1:0),0);
    const block=n=>(d>0&&m.prefs[n][d-1]===3?1:0)+(d+1<m.D&&m.prefs[n][d+1]===3?1:0);
    const solverPick=new Set(xv.filter(v=>v.d===d).map(v=>v.n));
    pool.sort((a,b)=>(solverPick.has(b)-solverPick.has(a))||(block(a)-block(b))||(xCount(a)-xCount(b)));
    return {d,cause,cands:pool.slice(0,3),total:pool.length,missing:Math.max(cause.kind==='grp'?cause.need-cause.have:0,xv.filter(v=>v.d===d).length)};
  });
}
