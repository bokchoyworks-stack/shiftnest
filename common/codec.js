/* ShiftNest 受け渡し（暗号・圧縮・分割QR）。仕様は docs/SPEC.md の 3 章。iOS版 Crypto.swift と同じ形式 */
(function(g){
  const te=new TextEncoder(),td=new TextDecoder();
  const subtle=(g.crypto||{}).subtle;
  const b64u={
    enc(bytes){let s='';const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
    dec(str){str=String(str).trim().replace(/-/g,'+').replace(/_/g,'/');while(str.length%4)str+='=';const bin=atob(str),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
  };
  const cat=(...parts)=>{const n=parts.reduce((a,p)=>a+p.length,0),o=new Uint8Array(n);let k=0;parts.forEach(p=>{o.set(p,k);k+=p.length;});return o;};
  const rand=n=>{const a=new Uint8Array(n);g.crypto.getRandomValues(a);return a;};
  async function streamBytes(bytes,ts){const s=new Blob([bytes]).stream().pipeThrough(ts);return new Uint8Array(await new Response(s).arrayBuffer());}
  const deflate=b=>streamBytes(b,new CompressionStream('deflate-raw'));
  const inflate=b=>streamBytes(b,new DecompressionStream('deflate-raw'));
  const SALT=te.encode('ShiftNest-v1');

  async function aesKey(raw,usage){return subtle.importKey('raw',raw,{name:'AES-GCM'},false,usage||['encrypt','decrypt']);}
  async function hkdf(secret,info){const base=await subtle.importKey('raw',secret,'HKDF',false,['deriveBits']);
    const bits=await subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:SALT,info:te.encode(info)},base,256);return new Uint8Array(bits);}
  async function pbkdf2(pass,salt,iter){const base=await subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},base,256));}
  async function gcmSeal(rawKey,plain){const iv=rand(12),k=await aesKey(rawKey,['encrypt']);const ct=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv},k,plain));return cat(iv,ct);}
  async function gcmOpen(rawKey,box){const iv=box.subarray(0,12),ct=box.subarray(12),k=await aesKey(rawKey,['decrypt']);return new Uint8Array(await subtle.decrypt({name:'AES-GCM',iv},k,ct));}

  /* 3.1 回答：看護師 → 師長の公開鍵 */
  async function sealToPub(pubB64u,obj){
    const pubRaw=b64u.dec(pubB64u);
    const pub=await subtle.importKey('raw',pubRaw,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const eph=await subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
    const secret=new Uint8Array(await subtle.deriveBits({name:'ECDH',public:pub},eph.privateKey,256));
    const key=await hkdf(secret,'answer');
    const ephRaw=new Uint8Array(await subtle.exportKey('raw',eph.publicKey));
    const box=await gcmSeal(key,te.encode(JSON.stringify(obj)));
    return 'SN1.'+b64u.enc(cat(new Uint8Array([1]),ephRaw,box));
  }
  /* テスト・パソコン版用：秘密鍵（JWK）で開く */
  async function openWithPriv(privKey,token){
    const b=b64u.dec(String(token).replace(/^SN1\./,''));if(b[0]!==1)throw new Error('形式が違います');
    const ephRaw=b.subarray(1,66),box=b.subarray(66);
    const eph=await subtle.importKey('raw',ephRaw,{name:'ECDH',namedCurve:'P-256'},false,[]);
    const secret=new Uint8Array(await subtle.deriveBits({name:'ECDH',public:eph},privKey,256));
    return JSON.parse(td.decode(await gcmOpen(await hkdf(secret,'answer'),box)));
  }
  /* 3.3 お願いリンク：看護師の合言葉から鍵 */
  const reqKey=(pin,name)=>pbkdf2(String(pin),te.encode('ShiftNest-req-'+name),100000);
  async function sealReq(rawKey,obj){return b64u.enc(await gcmSeal(rawKey,te.encode(JSON.stringify(obj))));}
  async function openReq(rawKey,str){return JSON.parse(td.decode(await gcmOpen(rawKey,b64u.dec(str))));}

  /* 3.4 パソコン受け渡しファイル */
  const MAGIC=te.encode('SNF1');
  async function fileSeal(code,obj){const salt=rand(16),key=await pbkdf2(String(code),salt,200000);
    const box=await gcmSeal(key,await deflate(te.encode(JSON.stringify(obj))));return cat(MAGIC,salt,box);}
  async function fileOpen(code,bytes){bytes=new Uint8Array(bytes);
    if(td.decode(bytes.subarray(0,4))!=='SNF1')throw new Error('ShiftNestのファイルではありません');
    const salt=bytes.subarray(4,20),key=await pbkdf2(String(code).replace(/\D/g,''),salt,200000);
    let plain;try{plain=await gcmOpen(key,bytes.subarray(20));}catch(e){throw new Error('番号が違います');}
    return JSON.parse(td.decode(await inflate(plain)));}

  /* 3.5 分割QR */
  const CHUNK=1100;
  async function qrChunks(obj){const s=b64u.enc(await deflate(te.encode(JSON.stringify(obj))));const n=Math.max(1,Math.ceil(s.length/CHUNK)),out=[];
    for(let i=0;i<n;i++)out.push('SNQ1|'+(i+1)+'|'+n+'|'+s.slice(i*CHUNK,(i+1)*CHUNK));return out;}
  function qrCollector(){const parts={};let total=0;return {
    add(text){const m=/^SNQ1\|(\d+)\|(\d+)\|(.+)$/.exec(String(text).trim());if(!m)return false;total=+m[2];parts[+m[1]]=m[3];return true;},
    progress(){return {got:Object.keys(parts).length,total};},
    done(){return total>0&&Object.keys(parts).length===total;},
    async result(){let s='';for(let i=1;i<=total;i++)s+=parts[i];return JSON.parse(td.decode(await inflate(b64u.dec(s))));}
  };}
  const jsonB64=obj=>b64u.enc(te.encode(JSON.stringify(obj)));
  const b64Json=str=>JSON.parse(td.decode(b64u.dec(str)));
  function sixDigits(){const a=new Uint32Array(1);g.crypto.getRandomValues(a);return String(100000+(a[0]%900000));}
  g.SNCodec={b64u,deflate,inflate,sealToPub,openWithPriv,reqKey,sealReq,openReq,fileSeal,fileOpen,qrChunks,qrCollector,jsonB64,b64Json,sixDigits};
})(typeof window!=='undefined'?window:globalThis);
