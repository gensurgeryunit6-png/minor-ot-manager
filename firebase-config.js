// ============================================================
// FIREBASE CONFIGURATION — Minor OT Manager
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
// DIRECT BLUETOOTH PRINTER BRIDGE — SEZNIK / LUCKJINGLE D1
// ============================================================
(function(){
  'use strict';

  // D1 printers are commonly exposed as either AE30/AE01 or FF00/FF02.
  // The Seznik D1 protocol uses a 384-dot (58 mm) raster image, not plain
  // ESC/POS text. Text is therefore rendered to a bitmap in the browser.
  const SERVICE_UUIDS = [
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '000018f0-0000-1000-8000-00805f9b34fb',
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455'
  ];

  const PREFERRED_CHAR_UUIDS = [
    '0000ae01-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '00002af1-0000-1000-8000-00805f9b34fb',
    '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '49535343-1e4d-4bd9-ba61-23c647249616',
    '0000ff03-0000-1000-8000-00805f9b34fb'
  ];

  const PRINT_WIDTH = 384;
  const BYTES_PER_ROW = PRINT_WIDTH / 8;
  const WRITE_CHUNK = 180;

  let connectedDevice = null;
  let writeCharacteristic = null;
  let connecting = false;
  let currentPrinterReport = [];

  function toast(message, ok){
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

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async function findWritableCharacteristic(server){
    const services=[];
    const seen=new Set();

    for(const uuid of SERVICE_UUIDS){
      try{
        const s=await server.getPrimaryService(uuid);
        if(!seen.has(s.uuid.toLowerCase())){
          services.push(s);
          seen.add(s.uuid.toLowerCase());
        }
      }catch(e){}
    }

    try{
      const all=await server.getPrimaryServices();
      for(const s of all){
        if(!seen.has(s.uuid.toLowerCase())){
          services.push(s);
          seen.add(s.uuid.toLowerCase());
        }
      }
    }catch(e){}

    const report=[];
    const writable=[];

    for(const service of services){
      let chars=[];
      try{ chars=await service.getCharacteristics(); }catch(e){ continue; }
      for(const c of chars){
        const p=c.properties||{};
        const props=Object.keys(p).filter(k=>p[k]);
        report.push(service.uuid+' / '+c.uuid+' ['+props.join(',')+']');
        if(p.writeWithoutResponse || p.write) writable.push(c);
      }
    }

    currentPrinterReport=report;
    window.__minorOTPrinterDiagnostics=report;

    if(!writable.length){
      throw new Error('No writable Bluetooth characteristic found. Accessible services: '+(report.join(' | ')||'none'));
    }

    // Prefer the known D1 write characteristic. Otherwise use the first
    // writable characteristic exposed by the printer.
    writeCharacteristic = writable.find(c=>PREFERRED_CHAR_UUIDS.includes(c.uuid.toLowerCase())) || writable[0];
    return report;
  }

  function attachDisconnectHandler(device){
    device.addEventListener('gattserverdisconnected',()=>{
      writeCharacteristic=null;
      connectedDevice=null;
    });
  }

  async function connectDevice(device){
    if(!device || !device.gatt) throw new Error('Selected device does not expose GATT Bluetooth.');
    connectedDevice=device;
    attachDisconnectHandler(device);
    const server=await device.gatt.connect();
    await findWritableCharacteristic(server);
    return device;
  }

  // ============================================================
  // D1 PROTOCOL
  // ============================================================
  // Reverse-engineered Seznik MiniX / LuckJingle D1 protocol:
  //   wake       10 FF 40
  //   initialize 10 FF F1 03
  //   density    10 FF 10 00 <0..7> 00
  //   image      GS v 0 00 30 00 <widthBytes> <height>
  //   end        10 FF F1 45
  // The printer expects a 384-pixel-wide 1-bit raster. A black pixel is
  // encoded as a 1 bit, MSB first.

  function d1EnableCommands(){
    return [
      new Uint8Array([0x10,0xFF,0x40]),
      new Uint8Array([0x10,0xFF,0xF1,0x03])
    ];
  }

  function d1DensityCommand(density){
    return new Uint8Array([0x10,0xFF,0x10,0x00,density & 0x07,0x00]);
  }

  function d1EndCommand(){
    return new Uint8Array([0x10,0xFF,0xF1,0x45]);
  }

  function d1ImageHeader(height){
    return new Uint8Array([
      0x1D,0x76,0x30,0x00,
      BYTES_PER_ROW & 0xFF,
      (BYTES_PER_ROW >> 8) & 0xFF,
      height & 0xFF,
      (height >> 8) & 0xFF
    ]);
  }

  async function writeBytes(bytes){
    if(!writeCharacteristic) throw new Error('Printer is not connected.');
    for(let i=0;i<bytes.length;i+=WRITE_CHUNK){
      const part=bytes.slice(i,i+WRITE_CHUNK);
      if(writeCharacteristic.properties.writeWithoutResponse && writeCharacteristic.writeValueWithoutResponse){
        await writeCharacteristic.writeValueWithoutResponse(part);
      }else if(writeCharacteristic.writeValue){
        await writeCharacteristic.writeValue(part);
      }else{
        throw new Error('Selected Bluetooth characteristic cannot write data.');
      }
      // Small pacing delay prevents many Android BLE stacks from overrunning
      // the printer's receive buffer.
      await sleep(35);
    }
  }

  // ============================================================
  // BROWSER TEXT -> 384px 1-BIT RASTER
  // ============================================================
  function clean(v){
    return String(v ?? '').replace(/[\\u0000-\\u001f]/g,' ').trim();
  }

  function getRedFlags(p){
    return [
      p.fever&&'Fever',
      p.bleeding&&'Bleeding',
      p.pain&&'Severe Pain',
      p.shock&&'Shock'
    ].filter(Boolean).join(', ') || 'None';
  }

  function wrapText(ctx,text,maxWidth){
    const words=String(text||'').split(/\\s+/);
    const lines=[];
    let line='';
    for(const word of words){
      if(!line){
        line=word;
        continue;
      }
      const candidate=line+' '+word;
      if(ctx.measureText(candidate).width<=maxWidth){
        line=candidate;
      }else{
        lines.push(line);
        line=word;
      }
    }
    if(line) lines.push(line);
    return lines.length?lines:[''];
  }

  function drawReceiptCanvas(p){
    const scale=1;
    const canvas=document.createElement('canvas');
    canvas.width=PRINT_WIDTH;

    // First pass estimates height. The second pass uses the exact height.
    const fontNormal='16px Arial, sans-serif';
    const fontBold='bold 18px Arial, sans-serif';
    const smallFont='14px Arial, sans-serif';
    const lineHeight=20;
    const margin=10;
    const maxWidth=PRINT_WIDTH-margin*2;

    canvas.height=800;
    let ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.font=fontNormal;

    const rows=[];
    const add= (text, opts={}) => rows.push({text:String(text??''), ...opts});
    const addWrapped=(label,value,opts={})=>{
      const prefix=label ? label+' : ' : '';
      ctx.font=opts.font||fontNormal;
      const first=prefix+String(value??'');
      const wrapped=wrapText(ctx,first,maxWidth);
      wrapped.forEach((line,i)=>add(line,{font:opts.font||fontNormal,center:!!opts.center,spacing:opts.spacing||0}));
    };

    add('MINOR OT',{font:fontBold,center:true,spacing:4});
    add('--------------------------------',{font:smallFont,center:true});
    add('TOKEN: '+clean(p.token),{font:fontBold,center:true,spacing:5});
    addWrapped('Name',clean(p.name));
    addWrapped('Age/Sex',clean(p.age)+' / '+clean(p.sex));
    addWrapped('OPD',clean(p.opd));
    addWrapped('Diagnosis',clean(p.diagnosis));
    addWrapped('Procedure',clean(p.procedure));
    addWrapped('Type',p.isSeptic?'SEPTIC':'NON-SEPTIC');
    addWrapped('Room',clean(p.room));
    addWrapped('Priority',clean(p.priority).toUpperCase());
    addWrapped('Red flags',getRedFlags(p));
    add('--------------------------------',{font:smallFont,center:true,spacing:4});
    add('Please retain this token.',{font:smallFont,center:true});

    let height=margin;
    for(const row of rows) height+=lineHeight+(row.spacing||0);
    height+=margin+30;

    canvas.height=Math.max(64,height);
    ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#000000';
    ctx.textBaseline='top';

    let y=margin;
    for(const row of rows){
      ctx.font=row.font||fontNormal;
      ctx.textAlign=row.center?'center':'left';
      ctx.fillText(row.text,row.center?PRINT_WIDTH/2:margin,y);
      y+=lineHeight+(row.spacing||0);
    }
    return canvas;
  }

  function canvasToD1Raster(canvas){
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const image=ctx.getImageData(0,0,PRINT_WIDTH,canvas.height).data;
    const height=canvas.height;
    const data=new Uint8Array(BYTES_PER_ROW*height);

    for(let y=0;y<height;y++){
      for(let xByte=0;xByte<BYTES_PER_ROW;xByte++){
        let value=0;
        for(let bit=0;bit<8;bit++){
          const x=xByte*8+bit;
          const i=(y*PRINT_WIDTH+x)*4;
          const r=image[i], g=image[i+1], b=image[i+2], a=image[i+3];
          const luminance=(0.299*r)+(0.587*g)+(0.114*b);
          // Black pixels become 1 bits, MSB first.
          if(a>40 && luminance<128) value|=(1<<(7-bit));
        }
        data[y*BYTES_PER_ROW+xByte]=value;
      }
    }
    return data;
  }

  async function printPatient(p){
    const canvas=drawReceiptCanvas(p);
    const raster=canvasToD1Raster(canvas);
    const header=d1ImageHeader(canvas.height);

    // Wake and initialize exactly as the D1 protocol expects.
    for(const cmd of d1EnableCommands()){
      await writeBytes(cmd);
      await sleep(100);
    }

    // Density 3 gives a useful default darkness on thermal paper.
    await writeBytes(d1DensityCommand(3));
    await sleep(100);

    // Send header followed by the bitmap data. The BLE write function handles
    // safe transport chunking; the printer reconstructs the stream.
    await writeBytes(header);
    await writeBytes(raster);

    // Allow the print buffer to finish before the end-of-job signal.
    await sleep(300);
    await writeBytes(d1EndCommand());
    await sleep(300);
  }

  async function getPatientByToken(token){
    const db=firebase.firestore();
    const d=new Date();
    const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const snap=await db.collection('minorOT').doc(date).collection('patients').where('token','==',token).limit(1).get();
    if(snap.empty) throw new Error('Token '+token+' was not found in today\'s queue.');
    return {id:snap.docs[0].id,...snap.docs[0].data()};
  }

  async function printAfterConnection(token){
    if(!token) token=prompt('Enter the token to print (e.g. OT-001):');
    if(!token) return;
    const p=await getPatientByToken(String(token).trim());
    toast('Printing '+p.token+'…',true);
    await printPatient(p);
    toast('Printed '+p.token+' successfully.',true);
  }

  function showPrintError(e){
    console.error('Direct printer error',e,currentPrinterReport);
    toast('Print error: '+(e&&e.message?e.message:e),false);
    alert('Direct Bluetooth printing could not complete.\n\n'+(e&&e.message?e.message:e)+'\n\nPrinter diagnostics:\n'+(currentPrinterReport.join('\n')||'none')+'\n\nIf the printer connects but still does not print, send me this diagnostic list.');
  }

  // IMPORTANT: requestDevice() must be called directly from the button click
  // so Chrome retains the transient user activation required for Web Bluetooth.
  function handleDirectPrintGesture(token){
    if(!navigator.bluetooth){
      alert('Web Bluetooth is unavailable. Please use Chrome on Android.');
      return;
    }

    if(connectedDevice && connectedDevice.gatt && connectedDevice.gatt.connected && writeCharacteristic){
      printAfterConnection(token).catch(showPrintError);
      return;
    }

    if(connecting) return;
    connecting=true;

    const request=navigator.bluetooth.requestDevice({
      acceptAllDevices:true,
      optionalServices:SERVICE_UUIDS
    });

    request.then(device=>connectDevice(device))
      .then(()=>printAfterConnection(token))
      .catch(showPrintError)
      .finally(()=>{connecting=false;});
  }

  window.minorOTDirectPrint=handleDirectPrintGesture;
  window.minorOTPrinterDiagnostics=()=>currentPrinterReport.slice();

  function addPrintButtons(){
    document.querySelectorAll('.patient-card .action-buttons').forEach(box=>{
      if(box.querySelector('.minor-ot-direct-print')) return;
      const card=box.closest('.patient-card');
      const tokenEl=card&&card.querySelector('.token');
      const token=tokenEl&&tokenEl.textContent.trim();
      if(!token) return;
      const b=document.createElement('button');
      b.type='button';
      b.className='btn btn-blue minor-ot-direct-print';
      b.style.cssText='font-size:10px;padding:4px 8px';
      b.textContent='🖨️';
      b.title='Direct print to SEZNIK';
      b.onclick=function(e){
        e.preventDefault();
        handleDirectPrintGesture(token);
      };
      box.insertBefore(b,box.children[1]||null);
    });
  }

  function addFloatingPrinter(){
    if(document.getElementById('minor-ot-floating-print')) return;
    const b=document.createElement('button');
    b.id='minor-ot-floating-print';
    b.type='button';
    b.textContent='🖨️ Print';
    b.title='Print a Minor OT token directly to the SEZNIK';
    b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9998;border:0;border-radius:999px;padding:12px 16px;background:#2563eb;color:#fff;font:700 13px system-ui;box-shadow:0 5px 18px rgba(0,0,0,.25)';
    b.onclick=function(e){
      e.preventDefault();
      handleDirectPrintGesture();
    };
    document.body.appendChild(b);
  }

  function boot(){
    addFloatingPrinter();
    addPrintButtons();
    const observer=new MutationObserver(()=>addPrintButtons());
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
