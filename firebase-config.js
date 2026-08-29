// ============================================================
// FIREBASE CONFIGURATION — Minor OT Manager
// ============================================================
// Replace the values below with the config from:
// Firebase Console → Project Settings → General → Your apps → SDK setup and configuration
//
// This file is loaded as a plain <script> before the app, so it
// only needs to define a single global: `firebaseConfig`.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBhLTBL9j5ynCqLE_-0Bkj-qVY3v3SEz0g",
  authDomain: "minor-ot-manager.firebaseapp.com",
  projectId: "minor-ot-manager",
  storageBucket: "minor-ot-manager.firebasestorage.app",
  messagingSenderId: "240851011199",
  appId: "1:240851011199:web:3c3cf35c56751849eb214a"
};

// ============================================================
// DIRECT BLUETOOTH PRINTER BRIDGE
// ============================================================
(function(){
  'use strict';

  const SERVICE_UUIDS = [
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '000018f0-0000-1000-8000-00805f9b34fb',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff01-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb'
  ];

  const CHAR_UUIDS = [
    '0000ff02-0000-1000-8000-00805f9b34fb',
    '0000ff01-0000-1000-8000-00805f9b34fb',
    '0000ae01-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '00002af1-0000-1000-8000-00805f9b34fb',
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '49535343-1e4d-4bd9-ba61-23c647249616'
  ];

  let connectedDevice=null;
  let writeCharacteristic=null;

  function toast(message,ok){
    let el=document.getElementById('minor-ot-print-toast');
    if(!el){
      el=document.createElement('div');
      el.id='minor-ot-print-toast';
      el.style.cssText='position:fixed;left:12px;right:12px;bottom:18px;z-index:99999;padding:12px 14px;border-radius:12px;background:#111827;color:#fff;font:600 13px system-ui;box-shadow:0 8px 30px rgba(0,0,0,.25);text-align:center';
      document.body.appendChild(el);
    }
    el.style.background=ok?'#166534':'#991b1b';
    el.textContent=message;
    clearTimeout(el._timer);
    el._timer=setTimeout(()=>el.remove(),4500);
  }

  async function findWritableCharacteristic(server){
    const services=[];
    for(const uuid of SERVICE_UUIDS){
      try{ services.push(await server.getPrimaryService(uuid)); }catch(e){}
    }
    try{
      const all=await server.getPrimaryServices();
      for(const s of all){
        if(!services.some(x=>x.uuid.toLowerCase()===s.uuid.toLowerCase())) services.push(s);
      }
    }catch(e){}

    const report=[];
    for(const service of services){
      let chars=[];
      try{ chars=await service.getCharacteristics(); }catch(e){continue;}
      for(const c of chars){
        const p=c.properties||{};
        report.push(service.uuid+' / '+c.uuid+' ['+Object.keys(p).filter(k=>p[k]).join(',')+']');
        if(p.writeWithoutResponse||p.write){
          if(!writeCharacteristic||CHAR_UUIDS.includes(c.uuid.toLowerCase())) writeCharacteristic=c;
        }
      }
    }
    if(!writeCharacteristic) throw new Error('No writable Bluetooth characteristic found. Accessible services: '+(report.join(' | ')||'none'));
    return report;
  }

  async function connectPrinter(){
    if(!navigator.bluetooth) throw new Error('Web Bluetooth is unavailable. Open this site in Chrome on Android.');
    if(connectedDevice&&connectedDevice.gatt&&connectedDevice.gatt.connected&&writeCharacteristic) return connectedDevice;
    writeCharacteristic=null;
    toast('Select your Seznik B21 in the Bluetooth window…',true);
    connectedDevice=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:SERVICE_UUIDS});
    const server=await connectedDevice.gatt.connect();
    const report=await findWritableCharacteristic(server);
    connectedDevice.addEventListener('gattserverdisconnected',()=>{writeCharacteristic=null;});
    window.__minorOTPrinterDiagnostics=report;
    return connectedDevice;
  }

  function escposText(p){
    const clean=v=>String(v??'').replace(/[\u0000-\u001f]/g,' ').trim();
    const flags=[p.fever&&'Fever',p.bleeding&&'Bleeding',p.pain&&'Severe Pain',p.shock&&'Shock'].filter(Boolean).join(', ')||'None';
    return new TextEncoder().encode([
      '\x1b@','\x1b\x61\x01','\x1b\x45\x01MINOR OT\x1b\x45\x00',
      '------------------------------','\x1b\x45\x01TOKEN: '+clean(p.token)+'\x1b\x45\x00',
      'Name : '+clean(p.name),'Age/Sex : '+clean(p.age)+' / '+clean(p.sex),
      'OPD : '+clean(p.opd),'Diagnosis : '+clean(p.diagnosis),'Procedure : '+clean(p.procedure),
      'Type : '+(p.isSeptic?'SEPTIC':'NON-SEPTIC'),'Room : '+clean(p.room),
      'Priority : '+clean(p.priority).toUpperCase(),'Red flags : '+flags,
      '------------------------------','Please retain this token.','\n\n'
    ].join('\n'));
  }

  async function writeBytes(bytes){
    if(!writeCharacteristic) throw new Error('Printer is not connected.');
    const max=180;
    for(let i=0;i<bytes.length;i+=max){
      const part=bytes.slice(i,i+max);
      if(writeCharacteristic.properties.writeWithoutResponse&&writeCharacteristic.writeValueWithoutResponse) await writeCharacteristic.writeValueWithoutResponse(part);
      else await writeCharacteristic.writeValue(part);
      await new Promise(r=>setTimeout(r,25));
    }
  }

  async function getPatientByToken(token){
    let app;
    try{app=firebase.app('minorOTPrinter');}catch(e){app=firebase.initializeApp(firebaseConfig,'minorOTPrinter');}
    const db=firebase.firestore(app);
    const d=new Date();
    const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const snap=await db.collection('minorOT').doc(date).collection('patients').where('token','==',token).limit(1).get();
    if(snap.empty) throw new Error('Token '+token+' was not found in today\'s queue.');
    return {id:snap.docs[0].id,...snap.docs[0].data()};
  }

  async function printPatient(p){
    try{
      toast('Connecting to Seznik B21…',true);
      await connectPrinter();
      toast('Printing '+p.token+'…',true);
      await writeBytes(escposText(p));
      toast('Printed '+p.token+' successfully.',true);
    }catch(e){
      console.error('Direct printer error',e,window.__minorOTPrinterDiagnostics||[]);
      toast('Direct print failed: '+e.message,false);
      alert('Direct Bluetooth printing could not complete.\n\n'+e.message+'\n\nIf the B21 connects but does not print, the printer may use a proprietary iPrint protocol rather than ESC/POS.');
    }
  }

  async function printToken(token){
    try{
      if(!token) token=prompt('Enter the token to print (e.g. OT-001):');
      if(!token) return;
      const p=await getPatientByToken(String(token).trim());
      await printPatient(p);
    }catch(e){toast('Print error: '+e.message,false);}
  }

  window.minorOTDirectPrint=printToken;
  window.minorOTPrintPatient=printPatient;
  window.minorOTPrinterDiagnostics=()=>window.__minorOTPrinterDiagnostics||[];

  function addPrintButtons(){
    document.querySelectorAll('.patient-card .action-buttons').forEach(box=>{
      if(box.querySelector('.minor-ot-direct-print')) return;
      const card=box.closest('.patient-card');
      const tokenEl=card&&card.querySelector('.token');
      const token=tokenEl&&tokenEl.textContent.trim();
      if(!token) return;
      const b=document.createElement('button');
      b.type='button'; b.className='btn btn-blue minor-ot-direct-print';
      b.style.cssText='font-size:10px;padding:4px 8px'; b.textContent='🖨️';
      b.title='Direct print to Seznik B21';
      b.addEventListener('click',()=>printToken(token));
      box.insertBefore(b,box.children[1]||null);
    });
  }

  function addFloatingPrinter(){
    if(document.getElementById('minor-ot-floating-print')) return;
    const b=document.createElement('button');
    b.id='minor-ot-floating-print'; b.type='button'; b.textContent='🖨️ Print';
    b.title='Print a Minor OT token directly to the Seznik B21';
    b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9998;border:0;border-radius:999px;padding:12px 16px;background:#2563eb;color:#fff;font:700 13px system-ui;box-shadow:0 5px 18px rgba(0,0,0,.25)';
    b.addEventListener('click',()=>printToken());
    document.body.appendChild(b);
  }

  function boot(){
    addFloatingPrinter(); addPrintButtons();
    const observer=new MutationObserver(()=>addPrintButtons());
    observer.observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
