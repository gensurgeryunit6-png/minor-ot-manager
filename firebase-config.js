// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhLTBL9j5ynCqLE_-0Bkj-qVY3v3SEz0g",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// SEZNIK B21 direct Bluetooth printer bridge
(function(){
'use strict';
const AE30='0000ae30-0000-1000-8000-00805f9b34fb';
const AE01='0000ae01-0000-1000-8000-00805f9b34fb';
const AE02='0000ae02-0000-1000-8000-00805f9b34fb';
const OPTIONAL=[AE30,AE02,'0000ae3a-0000-1000-8000-00805f9b34fb','0000ae3b-0000-1000-8000-00805f9b34fb','0000ff00-0000-1000-8000-00805f9b34fb','0000ff02-0000-1000-8000-00805f9b34fb'];
let tx=null,device=null,printed=false;
function ui(t,ok=true){let e=document.getElementById('b21-print-msg');if(!e){e=document.createElement('div');e.id='b21-print-msg';e.style.cssText='position:fixed;left:16px;right:16px;bottom:18px;z-index:999999;padding:15px;border-radius:16px;color:#fff;font:800 15px system-ui;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.3)';document.body.appendChild(e)}e.style.background=ok?'#166534':'#991b1b';e.textContent=t;clearTimeout(e._t);e._t=setTimeout(()=>e.remove(),10000)}
function addButton(){if(document.getElementById('b21-direct-print'))return;const b=document.createElement('button');b.id='b21-direct-print';b.type='button';b.textContent='🖨️ Print';b.style.cssText='position:fixed;right:16px;bottom:16px;z-index:999998;border:0;border-radius:30px;padding:16px 24px;background:#2563eb;color:#fff;font:800 17px system-ui;box-shadow:0 6px 22px rgba(0,0,0,.25);touch-action:manipulation';b.onclick=printFromGesture;document.body.appendChild(b)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function crc8(a){let c=0;for(const b of a){c^=b;for(let i=0;i<8;i++)c=(c&128)?((c<<1)^7)&255:(c<<1)&255}return c}
function pkt(cmd,payload=[]){const p=Uint8Array.from(payload),o=new Uint8Array(8+p.length);o[0]=0x51;o[1]=0x78;o[2]=cmd;o[3]=0;o[4]=p.length&255;o[5]=(p.length>>8)&255;o.set(p,6);o[6+p.length]=crc8(p);o[7+p.length]=0xff;return o}
async function writeBytes(a){if(!tx)throw Error('No writable BLE characteristic');for(let i=0;i<a.length;i+=120){const part=a.slice(i,i+120);if(tx.properties.writeWithoutResponse&&tx.writeValueWithoutResponse)await tx.writeValueWithoutResponse(part);else await tx.writeValue(part);await sleep(35)}}
function tinyBitmap(){const W=384,H=160,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);g.fillStyle='#000';g.textAlign='center';g.textBaseline='middle';g.font='bold 34px Arial';g.fillText('MINOR OT',W/2,35);g.font='bold 26px Arial';g.fillText('BLUETOOTH TEST',W/2,85);g.font='22px Arial';g.fillText('OT-TEST',W/2,125);const im=g.getImageData(0,0,W,H).data,rowPackets=[];for(let y=0;y<H;y++){const row=new Uint8Array(48);for(let x=0;x<W;x++){const i=(y*W+x)*4;if(im[i]<128)row[x>>3]|=(1<<(x&7))}rowPackets.push(pkt(0xa2,Array.from(row)))}return rowPackets}
async function send5178(){
 // Reset/state, quality, energy, apply, start-print
 await writeBytes(pkt(0xa3,[0])); await sleep(80);
 await writeBytes(pkt(0xa4,[0x33])); await sleep(80);
 await writeBytes(pkt(0xaf,[0x10,0x00])); await sleep(80);
 await writeBytes(pkt(0xbe,[0x00])); await sleep(80);
 await writeBytes(new Uint8Array([0x51,0x78,0xa6,0x00,0x0b,0x00,0xaa,0x55,0x17,0x38,0x44,0x5f,0x5f,0x5f,0x44,0x38,0x2c,0xa1,0xff]));
 await sleep(100);ui('Sending actual thermal bitmap…');
 for(const p of tinyBitmap()) await writeBytes(p);
 await writeBytes(new Uint8Array([0x51,0x78,0xa6,0x00,0x0b,0x00,0xaa,0x55,0x17,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x17,0x11,0xff]));
 await sleep(200); await writeBytes(pkt(0xa1,[0x30,0x00])); await sleep(700);
}
async function connect(){
 ui('Select SEZNIK B21…');
 device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:OPTIONAL});
 ui('Connecting to '+(device.name||'printer')+'…');
 const server=await device.gatt.connect();
 const services=await server.getPrimaryServices();
 let list=[];
 for(const s of services){try{const cs=await s.getCharacteristics();for(const c of cs)if(c.properties.write||c.properties.writeWithoutResponse)list.push({s,c})}catch(e){}}
 if(!list.length)throw Error('Connected but no writable BLE characteristic was found.');
 const exact=list.find(x=>x.c.uuid.toLowerCase()===AE01);
 if(!exact)throw Error('B21 connected, but AE01 write characteristic was not exposed. Writable: '+list.map(x=>x.c.uuid).join(', '));
 tx=exact.c;
 ui('Connected to B21. Sending test…');
}
async function printFromGesture(){try{if(!navigator.bluetooth)throw Error('Web Bluetooth unavailable. Use Chrome on Android.');if(!tx)await connect();await send5178();printed=true;ui('Test print command sent. Check the B21 paper now.',true)}catch(e){console.error(e);ui('Print test failed: '+(e.message||e),false)}}
window.addEventListener('DOMContentLoaded',addButton);if(document.readyState!=='loading')addButton();window.b21PrintTest=printFromGesture;
})();
