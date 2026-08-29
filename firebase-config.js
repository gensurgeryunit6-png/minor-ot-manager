// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhLTBL9j5ynCqLE_-0Bkj-qVY3v3SEz0g",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// ============================================================
// SEZNIK B21 / iPrint-compatible BLE bridge
// ============================================================
(function(){
  'use strict';

  const SERVICE='0000ae30-0000-1000-8000-00805f9b34fb';
  const WRITE='0000ae01-0000-1000-8000-00805f9b34fb';
  const NOTIFY='0000ae02-0000-1000-8000-00805f9b34fb';
  const WIDTH=384;
  const BYTES_PER_ROW=48;
  let device=null, server=null, tx=null, rx=null, connecting=false;
  let lastNotify='';

  function toast(msg,ok){
    let e=document.getElementById('minor-ot-print-toast');
    if(!e){e=document.createElement('div');e.id='minor-ot-print-toast';e.style.cssText='position:fixed;left:12px;right:12px;bottom:18px;z-index:99999;padding:13px 15px;border-radius:14px;color:#fff;font:700 14px system-ui;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.25)';document.body.appendChild(e)}
    e.style.background=ok?'#166534':'#991b1b';e.textContent=msg;clearTimeout(e._t);e._t=setTimeout(()=>e.remove(),5000);
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const hex=a=>Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');

  // CRC-8 table used by the 0x5178 protocol (polynomial 0x07).
  function crc8(data){
    let c=0;
    for(const b of data){
      c^=b;
      for(let i=0;i<8;i++) c=(c&0x80)?((c<<1)^0x07)&255:(c<<1)&255;
    }
    return c;
  }

  function packet(cmd,payload){
    const n=payload.length;
    const out=new Uint8Array(7+n);
    out[0]=0x51;out[1]=0x78;out[2]=cmd;out[3]=0;
    out[4]=n&255;out[5]=(n>>8)&255;
    out.set(payload,6);
    out[6+n]=crc8(payload);
    out[7+n-1+1]=0xff;
    return out;
  }

  // Explicit builder avoids ambiguity around packet length.
  function pkt(cmd,payload){
    const p=Uint8Array.from(payload), out=new Uint8Array(8+p.length-1);
    out[0]=0x51;out[1]=0x78;out[2]=cmd;out[3]=0;
    out[4]=p.length&255;out[5]=(p.length>>8)&255;
    out.set(p,6);out[6+p.length]=crc8(p);out[7+p.length]=0xff;
    return out;
  }

  const state=()=>pkt(0xA3,[0]);
  const info=()=>pkt(0xA8,[0]);
  const quality=()=>pkt(0xA4,[0x32]);
  const energy=()=>pkt(0xAF,[0xFF,0xFF]);
  const applyEnergy=()=>pkt(0xBE,[1]);
  const latticeStart=()=>pkt(0xA6,[0xAA,0x55,0x17,0x38,0x44,0x5F,0x5F,0x5F,0x44,0x38,0x2C]);
  const latticeEnd=()=>pkt(0xA6,[0xAA,0x55,0x17,0,0,0,0,0,0,0,0x17]);
  const feed=n=>pkt(0xBD,[Math.max(0,Math.min(255,n))]);
  const setPaper=()=>pkt(0xA1,[0x30,0]);

  function rowPacket(row){ return pkt(0xA2,row); }

  async function write(data){
    if(!tx) throw new Error('SEZNIK write characteristic is not connected.');
    // D1/iPrint-compatible printers accept packets up to the negotiated MTU.
    // A raster row packet is 56 bytes. Try it as one BLE write first.
    try{
      await tx.writeValueWithoutResponse(data);
    }catch(e){
      if(tx.writeValue) await tx.writeValue(data); else throw e;
    }
    await sleep(22);
  }

  function attachNotify(){
    if(!rx) return;
    try{
      rx.addEventListener('characteristicvaluechanged',e=>{
        lastNotify=hex(new Uint8Array(e.target.value.buffer));
        window.__minorOTPrinterLastNotify=lastNotify;
      });
      rx.startNotifications().catch(()=>{});
    }catch(e){}
  }

  async function connectSelected(d){
    device=d;server=await d.gatt.connect();
    const svc=await server.getPrimaryService(SERVICE);
    tx=await svc.getCharacteristic(WRITE);
    try{rx=await svc.getCharacteristic(NOTIFY);attachNotify()}catch(e){rx=null}
    d.addEventListener('gattserverdisconnected',()=>{tx=null;rx=null;server=null;device=null});
  }

  // Browser canvas -> 384-dot bitmap. Protocol is LSB-first.
  function canvas(p){
    const c=document.createElement('canvas');c.width=WIDTH;
    const ctx0=c.getContext('2d');
    const rows=[];
    const normal='16px Arial,sans-serif', bold='bold 18px Arial,sans-serif';
    const wrap=(s,font)=>{ctx0.font=font;const words=String(s??'').split(/\\s+/);let a=[],line='';for(const w of words){const t=line?line+' '+w:w;if(!line||ctx0.measureText(t).width<=364)line=t;else{a.push(line);line=w}}if(line)a.push(line);return a};
    const add=(s,font=normal,center=false)=>rows.push({s:String(s??''),font,center});
    const flags=[p.fever&&'Fever',p.bleeding&&'Bleeding',p.pain&&'Severe Pain',p.shock&&'Shock'].filter(Boolean).join(', ')||'None';
    add('MINOR OT',bold,true);add('--------------------------------',normal,true);add('TOKEN: '+(p.token||''),bold,true);
    [['Name',p.name],['Age/Sex',(p.age||'')+' / '+(p.sex||'')],['OPD',p.opd],['Diagnosis',p.diagnosis],['Procedure',p.procedure],['Type',p.isSeptic?'SEPTIC':'NON-SEPTIC'],['Room',p.room],['Priority',String(p.priority||'').toUpperCase()],['Red flags',flags]].forEach(([k,v])=>wrap(k+' : '+(v??''),normal).forEach(x=>add(x)));
    add('--------------------------------',normal,true);add('Please retain this token.',normal,true);
    const h=Math.max(80,rows.length*21+20);c.height=h;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,WIDTH,h);ctx.fillStyle='#000';ctx.textBaseline='top';let y=10;
    for(const r of rows){ctx.font=r.font;ctx.textAlign=r.center?'center':'left';ctx.fillText(r.s,r.center?WIDTH/2:10,y);y+=21}return c;
  }

  function raster(c){
    const px=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,WIDTH,c.height).data;
    const out=new Uint8Array(BYTES_PER_ROW*c.height);
    for(let y=0;y<c.height;y++)for(let xb=0;xb<BYTES_PER_ROW;xb++){
      let v=0;
      for(let bit=0;bit<8;bit++){
        const x=xb*8+bit,i=(y*WIDTH+x)*4,lum=.299*px[i]+.587*px[i+1]+.114*px[i+2];
        if(px[i+3]>40&&lum<128)v|=(1<<bit); // LSB first
      }
      out[y*BYTES_PER_ROW+xb]=v;
    }
    return out;
  }

  async function printPatient(p){
    const data=raster(canvas(p));
    lastNotify='';
    // Same command order used by the iPrint-compatible 0x5178 family.
    await write(state());await sleep(80);
    await write(quality());await sleep(60);
    await write(energy());await sleep(60);
    await write(applyEnergy());await sleep(60);
    await write(latticeStart());await sleep(60);
    for(let y=0;y<data.length;y+=BYTES_PER_ROW){await write(rowPacket(data.slice(y,y+BYTES_PER_ROW)))}
    await write(feed(25));
    await sleep(100);
    await write(setPaper());await write(setPaper());await write(setPaper());
    await write(latticeEnd());
    await sleep(700);
    // The printer may send a completion notification. Do not claim success
    // merely because BLE writes succeeded.
    const completed=/5178ae0101000000ff/i.test(lastNotify);
    if(completed)return true;
    return false;
  }

  async function getPatient(token){
    const d=new Date(),date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const snap=firebase.firestore().collection('minorOT').doc(date).collection('patients').where('token','==',token).limit(1).get();
    const s=await snap;if(s.empty)throw new Error('Token '+token+' was not found in today\'s queue.');
    return {id:s.docs[0].id,...s.docs[0].data()};
  }

  async function doPrint(token){
    if(!token)token=prompt('Enter the token to print (e.g. OT-001):');if(!token)return;
    const p=await getPatient(String(token).trim());
    toast('Connecting to SEZNIK B21…',true);
    if(!tx){
      const d=await navigator.bluetooth.requestDevice({filters:[{services:[SERVICE]}],optionalServices:[SERVICE]});
      await connectSelected(d);
    }
    toast('Sending OT ticket to printer…',true);
    const complete=await printPatient(p);
    if(complete) toast('Printer confirmed OT ticket completed.',true);
    else toast('Data sent, but printer gave no completion response. Check the paper.',false);
  }

  function intercept(e){
    const t=e.target&&e.target.closest&&e.target.closest('.minor-ot-direct-print,#minor-ot-floating-print');
    if(!t)return;
    e.preventDefault();e.stopImmediatePropagation();
    const card=t.closest('.patient-card');
    const tok=card&&card.querySelector('.token');
    const token=tok?tok.textContent.trim():null;
    if(connecting)return;connecting=true;
    doPrint(token).catch(err=>{console.error(err);toast('Print failed: '+err.message,false)}).finally(()=>connecting=false);
  }

  document.addEventListener('click',intercept,true);
  window.minorOTDirectPrint=doPrint;
  window.__minorOTB21Protocol='5178/AE30/AE01';
})();
