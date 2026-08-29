// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhLTBL9j5ynCqLE_-0Bkj-qVY3v3SEz0g",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// SEZNIK B21 direct Bluetooth diagnostic/test printer bridge.
(function(){
'use strict';
const OPTIONAL=['0000ae30-0000-1000-8000-00805f9b34fb','0000ff00-0000-1000-8000-00805f9b34fb','000018f0-0000-1000-8000-00805f9b34fb'];
let device=null,tx=null;
function msg(text,ok=true){let e=document.getElementById('b21-print-msg');if(!e){e=document.createElement('div');e.id='b21-print-msg';e.style.cssText='position:fixed;left:16px;right:16px;bottom:18px;z-index:999999;padding:14px 16px;border-radius:16px;background:#166534;color:#fff;font:700 15px system-ui;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.3)';document.body.appendChild(e)}e.style.background=ok?'#166534':'#991b1b';e.textContent=text;clearTimeout(e._timer);e._timer=setTimeout(()=>e.remove(),8000)}
function addButton(){if(document.getElementById('b21-direct-print'))return;const b=document.createElement('button');b.id='b21-direct-print';b.type='button';b.textContent='🖨️ Print';b.style.cssText='position:fixed;right:16px;bottom:16px;z-index:999998;border:0;border-radius:30px;padding:16px 24px;background:#2563eb;color:#fff;font:800 17px system-ui;box-shadow:0 6px 22px rgba(0,0,0,.25);touch-action:manipulation';b.addEventListener('click',startPrintFromUserGesture);document.body.appendChild(b)}
async function startPrintFromUserGesture(){try{
 if(!navigator.bluetooth)throw new Error('Web Bluetooth is not supported. Use Chrome on Android.');
 msg('Select your SEZNIK B21…');
 const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:OPTIONAL});
 device=d; msg('Connecting to '+(d.name||'Bluetooth printer')+'…');
 const server=await d.gatt.connect();
 const services=await server.getPrimaryServices();
 let candidates=[];
 for(const s of services){try{const chars=await s.getCharacteristics();chars.filter(c=>c.properties.write||c.properties.writeWithoutResponse).forEach(c=>candidates.push({s,c}));}catch(e){}}
 if(!candidates.length)throw new Error('Connected, but no writable BLE characteristic was found.');
 const preferred=candidates.find(x=>/ae01|ff02|ff02/i.test(x.c.uuid))||candidates[0];
 tx=preferred.c;
 console.log('B21 writable candidates:',candidates.map(x=>({service:x.s.uuid,characteristic:x.c.uuid,properties:x.c.properties})));
 msg('Connected. Sending printer test…');
 // Generic ESC/POS smoke test. This is deliberately tiny: it tells us whether
 // the discovered writable BLE channel actually drives the print engine.
 const data=new TextEncoder().encode('\x1B\x40\nMINOR OT\nBLUETOOTH TEST\n\n\n');
 const chunk=20;
 for(let i=0;i<data.length;i+=chunk){
   const part=data.slice(i,i+chunk);
   if(tx.properties.writeWithoutResponse) await tx.writeValueWithoutResponse(part);
   else await tx.writeValue(part);
   await new Promise(r=>setTimeout(r,40));
 }
 msg('Test data sent on '+tx.uuid+'. Check the printer.');
 }catch(e){console.error(e);msg('Bluetooth/print test failed: '+(e.message||e),false)}}
window.addEventListener('DOMContentLoaded',addButton);if(document.readyState!=='loading')addButton();window.b21PrintTest=startPrintFromUserGesture;
})();
