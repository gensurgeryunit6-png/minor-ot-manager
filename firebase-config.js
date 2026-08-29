// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhLTBL9j5ynCqLE_-0Bkj-qVY3v3SEz0g",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// Direct SEZNIK B21 / 0x5178 BLE printing.
(function(){
'use strict';
const AE30='0000ae30-0000-1000-8000-00805f9b34fb';
const AE01='0000ae01-0000-1000-8000-00805f9b34fb';
const AE02='0000ae02-0000-1000-8000-00805f9b34fb';
const OPTIONAL=[AE30,AE02,'0000ae3a-0000-1000-8000-00805f9b34fb','0000ae3b-0000-1000-8000-00805f9b34fb','0000ff00-0000-1000-8000-00805f9b34fb','0000ff02-0000-1000-8000-00805f9b34fb'];
let device=null,tx=null,busy=false;
function msg(text,ok=true){let e=document.getElementById('b21-print-msg');if(!e){e=document.createElement('div');e.id='b21-print-msg';e.style.cssText='position:fixed;left:16px;right:16px;bottom:18px;z-index:999999;padding:14px 16px;border-radius:16px;background:#166534;color:#fff;font:700 15px system-ui;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.3)';document.body.appendChild(e)}e.style.background=ok?'#166534':'#991b1b';e.textContent=text;clearTimeout(e._timer);e._timer=setTimeout(()=>e.remove(),9000)}
function crc8(data){let crc=0;for(const v of data){crc^=v;for(let i=0;i<8;i++)crc=(crc&0x80)?((crc<<1)^0x07)&255:(crc<<1)&255}return crc}
function packet(cmd,payload=[]){const p=Array.from(payload);return new Uint8Array([0x51,0x78,cmd,0x00,p.length&255,(p.length>>8)&255,...p,crc8(p),0xff])}
async function write(data){if(!tx)throw new Error('Printer write channel is not connected');const n=120;for(let i=0;i<data.length;i+=n){const c=data.slice(i,i+n);if(tx.properties.writeWithoutResponse&&tx.writeValueWithoutResponse)await tx.writeValueWithoutResponse(c);else await tx.writeValue(c);await new Promise(r=>setTimeout(r,35))}}
async function connect(){
 if(tx&&device&&device.gatt&&device.gatt.connected)return;
 if(!navigator.bluetooth)throw new Error('Web Bluetooth is not supported. Use Chrome on Android.');
 msg('Select SEZNIK B21…');
 const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:OPTIONAL});
 device=d;
 const server=await d.gatt.connect();
 const services=await server.getPrimaryServices();
 let candidates=[];
 for(const s of services){try{const chars=await s.getCharacteristics();chars.filter(c=>c.properties.write||c.properties.writeWithoutResponse).forEach(c=>candidates.push({s,c}))}catch(e){}}
 const preferred=candidates.find(x=>x.c.uuid.toLowerCase()===AE01);
 if(!preferred)throw new Error('B21 connected, but AE01 writable channel was not found.');
 tx=preferred.c;
 msg('B21 connected. Ready to print.');
}
function makeRows(lines){
 const width=384,lh=32,pad=12,height=Math.max(96,pad+lines.length*lh+pad),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
 lines.forEach((line,i)=>{ctx.font=i===0?'bold 30px Arial':(i===1?'bold 24px Arial':'20px Arial');ctx.fillText(String(line).slice(0,30),width/2,pad+16+i*lh)});
 const im=ctx.getImageData(0,0,width,height).data,rows=[];for(let y=0;y<height;y++){const row=new Uint8Array(48);for(let x=0;x<width;x++)if(im[(y*width+x)*4]<160)row[x>>3]|=(1<<(x&7));rows.push(row)}return rows;
}
function textLinesFromCard(card){
 const raw=(card.innerText||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
 let token=raw.find(s=>/^(OT|D)-\d{3}$/.test(s))||'';
 let name='';
 const ti=raw.indexOf(token);if(ti>=0&&raw[ti+1])name=raw[ti+1].split(/\s{2,}/)[0];
 const lines=[];
 lines.push('MINOR OT');
 if(token)lines.push(token);
 if(name)lines.push(name);
 const wanted=['Age','Sex','OPD','Diagnosis','Procedure','Room','Priority'];
 for(const key of wanted){const hit=raw.find(s=>s.toLowerCase().startsWith(key.toLowerCase()+':'));if(hit)lines.push(hit.replace(/^([^:]+):\s*/,'$1: '))}
 if(!lines.some(x=>/Age/i.test(x))){const compact=raw.find(s=>/\d+\s*\/[MF]/i.test(s));if(compact)lines.push(compact)}
 if(lines.length<4){raw.slice(0,8).forEach(s=>{if(!lines.includes(s)&&s.length<32)lines.push(s)})}
 return lines.slice(0,12);
}
async function printLines(lines){
 if(busy)return;busy=true;
 try{
  await connect();
  msg('Sending patient ticket…');
  await write(new Uint8Array([0x51,0x78,0xa8,0x00,0x01,0x00,0x00,0x00,0xff,0x51,0x78,0xa3,0x00,0x01,0x00,0x00,0x00,0xff]));
  await write(packet(0xbb,[0x01]));await write(packet(0xa4,[0x33]));await write(packet(0xaf,[0x10,0x00]));await write(packet(0xbe,[0x00]));
  await write(new Uint8Array([0x51,0x78,0xa6,0x00,0x0b,0x00,0xaa,0x55,0x17,0x38,0x44,0x5f,0x5f,0x5f,0x44,0x38,0x2c,0xa1,0xff]));
  const rows=makeRows(lines);for(const row of rows)await write(packet(0xa2,Array.from(row)));
  await write(new Uint8Array([0x51,0x78,0xa6,0x00,0x0b,0x00,0xaa,0x55,0x17,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x17,0x11,0xff]));
  await write(packet(0xa1,[0x30,0x00]));
  msg('Ticket sent to SEZNIK B21.');
 }catch(e){console.error(e);msg('Print failed: '+(e.message||e),false)}finally{busy=false}
}
function addPatientButtons(){
 document.querySelectorAll('.queue-item,.patient-card').forEach(card=>{
  if(card.dataset.b21Print==='1')return;
  if(!/(?:^|\s)(?:OT|D)-\d{3}(?:\s|$)/m.test(card.innerText||''))return;
  card.dataset.b21Print='1';
  const b=document.createElement('button');b.type='button';b.textContent='🖨️';b.title='Print this OT ticket directly';b.style.cssText='margin-left:4px;border:0;border-radius:8px;padding:7px 10px;background:#2563eb;color:#fff;font-size:18px;font-weight:800;cursor:pointer;touch-action:manipulation';
  b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();printLines(textLinesFromCard(card))});
  const target=card.querySelector('.action-buttons')||card;
  target.appendChild(b);
 });
}
function addFloating(){if(document.getElementById('b21-direct-print'))return;const b=document.createElement('button');b.id='b21-direct-print';b.type='button';b.textContent='🖨️ Printer';b.style.cssText='position:fixed;right:16px;bottom:16px;z-index:999998;border:0;border-radius:30px;padding:14px 20px;background:#2563eb;color:#fff;font:800 16px system-ui;box-shadow:0 6px 22px rgba(0,0,0,.25);touch-action:manipulation';b.addEventListener('click',()=>printLines(['MINOR OT','B21 READY','DIRECT PRINT TEST']));document.body.appendChild(b)}
function init(){addFloating();addPatientButtons();new MutationObserver(()=>addPatientButtons()).observe(document.body,{childList:true,subtree:true})}
window.addEventListener('DOMContentLoaded',init);if(document.readyState!=='loading')init();window.b21PrintLines=printLines;
})();
