// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBhLTBL9j5ynCqLE_-0Bkj-qVY3v3SEz0g",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// SEZNIK B21 direct Bluetooth printer bridge.
(function(){
'use strict';
const SERVICE='0000ae30-0000-1000-8000-00805f9b34fb';
const WRITE='0000ae01-0000-1000-8000-00805f9b34fb';
const NOTIFY='0000ae02-0000-1000-8000-00805f9b34fb';
let device=null,tx=null;
function msg(text,ok=true){let e=document.getElementById('b21-print-msg');if(!e){e=document.createElement('div');e.id='b21-print-msg';e.style.cssText='position:fixed;left:16px;right:16px;bottom:18px;z-index:999999;padding:14px 16px;border-radius:16px;background:#166534;color:#fff;font:700 15px system-ui;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.3)';document.body.appendChild(e)}e.style.background=ok?'#166534':'#991b1b';e.textContent=text;clearTimeout(e._timer);e._timer=setTimeout(()=>e.remove(),6000)}
function addButton(){if(document.getElementById('b21-direct-print'))return;const b=document.createElement('button');b.id='b21-direct-print';b.type='button';b.textContent='🖨️ Print';b.style.cssText='position:fixed;right:16px;bottom:16px;z-index:999998;border:0;border-radius:30px;padding:16px 24px;background:#2563eb;color:#fff;font:800 17px system-ui;box-shadow:0 6px 22px rgba(0,0,0,.25);touch-action:manipulation';b.addEventListener('click',startPrintFromUserGesture,{capture:false});document.body.appendChild(b)}
async function startPrintFromUserGesture(){try{if(!navigator.bluetooth)throw new Error('Web Bluetooth is not supported. Use Chrome on Android.');msg('Select your SEZNIK B21…');const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[SERVICE,NOTIFY,'000018f0-0000-1000-8000-00805f9b34fb','0000ff00-0000-1000-8000-00805f9b34fb']});device=d;msg('Connecting to '+(d.name||'Bluetooth printer')+'…');const server=await d.gatt.connect();const services=await server.getPrimaryServices();let found=null;for(const s of services){try{const chars=await s.getCharacteristics();const writes=chars.filter(c=>c.properties.write||c.properties.writeWithoutResponse);if(writes.length){found={service:s,chars,writes};break}}catch(e){}}if(!found)throw new Error('Connected, but no writable printer characteristic was found.');tx=found.writes.find(x=>x.uuid.toLowerCase()===WRITE)||found.writes[0];msg('Connected. Writable BLE channel found.');console.log('B21 service:',found.service.uuid,'write:',tx.uuid,'chars:',found.chars.map(x=>({uuid:x.uuid,properties:x.properties})));}catch(e){console.error(e);msg('Bluetooth failed: '+(e.message||e),false)}}
window.addEventListener('DOMContentLoaded',addButton);if(document.readyState!=='loading')addButton();window.b21PrintTest=startPrintFromUserGesture;
})();
