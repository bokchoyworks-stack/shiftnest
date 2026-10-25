/* 日本の祝日（内閣府の規則を計算で再現。2000〜2099年） */
(function(g){
  function nthMonday(y,m,n){const first=new Date(y,m,1).getDay();const d=1+((8-first)%7)+(n-1)*7;return d;}
  function equinox(y,base){return Math.floor(base+0.242194*(y-1980)-Math.floor((y-1980)/4));}
  function baseHolidays(y){
    const h={};const add=(m,d,n)=>{h[(m+1)+'-'+d]=n;};
    add(0,1,'元日');add(0,nthMonday(y,0,2),'成人の日');add(1,11,'建国記念の日');
    if(y>=2020)add(1,23,'天皇誕生日');
    add(2,equinox(y,20.8431),'春分の日');add(3,29,'昭和の日');add(4,3,'憲法記念日');add(4,4,'みどりの日');add(4,5,'こどもの日');
    add(6,nthMonday(y,6,3),'海の日');add(7,11,'山の日');add(8,nthMonday(y,8,3),'敬老の日');
    add(8,equinox(y,23.2488),'秋分の日');add(9,nthMonday(y,9,2),'スポーツの日');add(10,3,'文化の日');add(10,23,'勤労感謝の日');
    return h;
  }
  const cache={};
  function holidaysOf(y){
    if(cache[y])return cache[y];
    const h=baseHolidays(y),out={};
    Object.keys(h).forEach(k=>{out[k]=h[k];});
    // 振替休日
    Object.keys(h).forEach(k=>{const [m,d]=k.split('-').map(Number);const dt=new Date(y,m-1,d);
      if(dt.getDay()===0){const x=new Date(dt);do{x.setDate(x.getDate()+1);}while(out[(x.getMonth()+1)+'-'+x.getDate()]&&x.getFullYear()===y);out[(x.getMonth()+1)+'-'+x.getDate()]=out[(x.getMonth()+1)+'-'+x.getDate()]||'振替休日';}});
    // 国民の休日（祝日に挟まれた平日）
    for(let m=0;m<12;m++){const n=new Date(y,m+1,0).getDate();for(let d=2;d<n;d++){const k=(m+1)+'-'+d;if(out[k])continue;const dt=new Date(y,m,d);if(dt.getDay()===0)continue;
      const prev=new Date(y,m,d-1),next=new Date(y,m,d+1);if(h[(prev.getMonth()+1)+'-'+prev.getDate()]&&h[(next.getMonth()+1)+'-'+next.getDate()])out[k]='国民の休日';}}
    cache[y]=out;return out;
  }
  function holidayName(y,m,d){return holidaysOf(y)[(m+1)+'-'+d]||'';}
  /* 月の日付一覧：m は 0 始まり。opt={sat,sun,pub}＝その日を「休日の人数」にするか（省略時はすべて休日） */
  function monthDays(y,m,yearEnd,opt){
    const o=Object.assign({sat:true,sun:true,pub:true},opt||{});
    const n=new Date(y,m+1,0).getDate(),out=[];
    for(let i=1;i<=n;i++){const dow=new Date(y,m,i).getDay();let name=holidayName(y,m,i);const pubHol=!!name;
      const ye=yearEnd&&((m===11&&i>=29)||(m===0&&i<=3));if(!name&&ye)name='年末年始';
      out.push({day:i,dow,name,hol:(dow===6&&o.sat)||(dow===0&&o.sun)||(pubHol&&o.pub)||ye});}
    return out;
  }
  g.SNHolidays={holidaysOf,holidayName,monthDays};
  g.monthDays=monthDays;
})(typeof window!=='undefined'?window:globalThis);
