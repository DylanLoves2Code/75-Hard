/**
 * @file Export-tab actions: data download, JSON import, photo ZIP
 * export/import, and full challenge reset.
 *
 * Photos are deliberately kept OUT of the main state JSON (PRD §8.2)
 * to keep that file small. We instead provide a separate ZIP encoder
 * — STORE-only (no DEFLATE), so it stays dependency-free. Each entry
 * in the ZIP is one `photo_day_<N>.jpg` and the file size penalty is
 * fine because the photos are already JPEG-compressed.
 */
import { TOTAL, STORAGE_KEY, photoKey } from './constants.js';
import { getState, saveState, migrate } from './state.js';
import { showToast } from './toast.js';
import { stopCountdown } from './countdown.js';
import { stopQuoteRotation } from './quotes.js';
import { resetAnimatedDay } from './confetti.js';
import { getSettings } from './settings.js';
import { emit } from './bus.js';

/** Trigger a JSON download of the current saved state. @returns {void} */
export function exportData(){
  const s=getState();if(!s){alert('No data to export.');return;}
  const blob=new Blob([JSON.stringify(s,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='75hard-backup.json';
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast('Data exported');
}

/** Show the "are you sure?" reset overlay. @returns {void} */
export function confirmReset(){document.getElementById('confirm-overlay').classList.add('open');}
/** Hide the reset-confirm overlay without performing a reset. @returns {void} */
export function cancelReset(){document.getElementById('confirm-overlay').classList.remove('open');}

/**
 * Erase saved state + all photos and return to the setup screen.
 * @returns {void}
 */
export function executeReset(){
  localStorage.removeItem(STORAGE_KEY);
  // The `forgetPhotosOnReset` setting (default true) preserves the
  // legacy behavior. When unchecked, the user keeps their photo blobs
  // — useful if they want to re-import state later or browse history.
  if(getSettings().forgetPhotosOnReset){
    for(let d=1;d<=TOTAL;d++)localStorage.removeItem(photoKey(d));
  }
  document.getElementById('confirm-overlay').classList.remove('open');
  document.getElementById('app').style.display='none';
  document.getElementById('setup-screen').classList.add('active');
  stopCountdown();
  stopQuoteRotation();
  resetAnimatedDay();
}

// ---------------------------------------------------------------------------
// JSON IMPORT
// ---------------------------------------------------------------------------

/** Holds the parsed-and-migrated state staged between file pick and confirm. */
let pendingImport = null;

/**
 * Click handler for the IMPORT DATA button — proxies to the hidden
 * <input type="file"> so the visible button stays themed.
 * @returns {void}
 */
export function pickImportFile(){
  const input=document.getElementById('import-file-input');
  if(input){input.value='';input.click();}
}

/**
 * Handle a chosen JSON file: read, parse, validate, migrate, and
 * show the diff modal.
 * @param {Event} ev  `change` event from the file input.
 * @returns {void}
 */
export function handleImportFile(ev){
  const file=ev.target.files&&ev.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    let parsed;
    try{parsed=JSON.parse(reader.result);}
    catch(_){showToast('Import failed: invalid JSON');return;}
    if(!parsed||typeof parsed!=='object'||typeof parsed.startDate!=='string'){
      showToast('Import failed: not a valid backup');
      return;
    }
    const{state}=migrate(parsed);
    pendingImport=state;
    openImportConfirm(state);
  };
  reader.onerror=()=>showToast('Import failed: could not read file');
  reader.readAsText(file);
}

/**
 * Diff summary for the import confirm modal.
 * @param {?import('./state.js').State} s
 * @returns {{days:number,photoRefs:number,books:number,drinks:number}}
 */
function summarizeState(s){
  if(!s)return{days:0,photoRefs:0,books:0,drinks:0};
  let days=0,photoRefs=0;
  if(s.days){
    for(const k in s.days){
      const dd=s.days[k];
      // Mirror isDayComplete's six-boolean check without depending on
      // state defaults (imported state may be partial).
      if(dd&&dd.calorie&&dd.w1&&dd.w2&&dd.read&&dd.water&&dd.photo)days++;
      if(dd&&dd.photo)photoRefs++;
    }
  }
  const books=s.books?Object.keys(s.books).length:0;
  const drinks=s.drinks?Object.keys(s.drinks).length:0;
  return{days,photoRefs,books,drinks};
}

/** Count progress photos currently in localStorage. @returns {number} */
function countDevicePhotos(){
  let n=0;
  for(let d=1;d<=TOTAL;d++){if(localStorage.getItem(photoKey(d)))n++;}
  return n;
}

/**
 * Open the import-confirm overlay and populate the diff body.
 * @param {import('./state.js').State} incoming
 * @returns {void}
 */
function openImportConfirm(incoming){
  const cur=getState();
  const inc=summarizeState(incoming);
  const curSum=summarizeState(cur);
  const devicePhotos=countDevicePhotos();

  const body=document.getElementById('import-confirm-body');
  const line=(label,sum)=>
    `<div><strong>${label}:</strong> ${sum.days} days complete, `+
    `${sum.photoRefs} photos referenced, ${sum.books} books, ${sum.drinks} drinks weeks.</div>`;
  let html='';
  if(cur)html+=line('Current',curSum);
  html+=line('Imported',inc);
  html+=`<div style="margin-top:0.75rem;">${devicePhotos} photos currently in device storage. `+
    `${inc.photoRefs} photos referenced by imported state — restore them via IMPORT PHOTOS (ZIP) if needed.</div>`;
  html+=`<div style="margin-top:0.75rem;">Importing replaces your current data. This cannot be undone.</div>`;
  body.innerHTML=html;
  document.getElementById('import-overlay').classList.add('open');
}

/** Cancel the staged import without applying it. @returns {void} */
export function cancelImport(){
  pendingImport=null;
  document.getElementById('import-overlay').classList.remove('open');
}

/**
 * Apply the staged import: write to storage, emit `state:changed`,
 * show a toast. No-op (other than closing the modal) if nothing is
 * staged.
 * @returns {void}
 */
export function executeImport(){
  if(!pendingImport){
    document.getElementById('import-overlay').classList.remove('open');
    return;
  }
  saveState(pendingImport);
  const applied=pendingImport;
  pendingImport=null;
  document.getElementById('import-overlay').classList.remove('open');
  emit('state:changed',applied);
  showToast('Imported.');
}

// ---------------------------------------------------------------------------
// ZIP encoder (STORE only — no DEFLATE)
// ---------------------------------------------------------------------------
//
// PKZIP file format reference: APPNOTE.TXT §4.3. We emit:
//   - one Local File Header + raw data per entry
//   - one Central Directory File Header per entry
//   - one End-of-Central-Directory record
//
// STORE means compression method = 0, so compressed-size == uncompressed
// size and the bytes are written verbatim. Photos are already JPEG so
// recompressing wouldn't gain anything.

/** CRC32 lookup table (IEEE polynomial, reversed = 0xEDB88320). */
const CRC32_TABLE=(()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();

/**
 * Compute CRC32 of a byte sequence (IEEE 802.3 polynomial). Result
 * is an unsigned 32-bit integer as a number.
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function crc32(bytes){
  let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++)c=CRC32_TABLE[(c^bytes[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}

/**
 * Decode the base64 payload of a `data:image/jpeg;base64,...` URL into
 * a Uint8Array of raw JPEG bytes.
 * @param {string} dataUrl
 * @returns {Uint8Array}
 */
function dataUrlToBytes(dataUrl){
  const comma=dataUrl.indexOf(',');
  const b64=comma>=0?dataUrl.slice(comma+1):dataUrl;
  const bin=atob(b64);
  const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}

/**
 * Encode a Uint8Array as a base64 `data:image/jpeg` URL — inverse of
 * {@link dataUrlToBytes}.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToJpegDataUrl(bytes){
  let bin='';
  // chunked to avoid blowing the apply() arg limit on large photos
  const CHUNK=0x8000;
  for(let i=0;i<bytes.length;i+=CHUNK){
    bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CHUNK));
  }
  return 'data:image/jpeg;base64,'+btoa(bin);
}

/**
 * Build a STORE-only ZIP archive from `entries`.
 * @param {Array<{name:string,data:Uint8Array}>} entries
 * @returns {Uint8Array}
 */
function buildZip(entries){
  const enc=new TextEncoder();
  const records=[];
  const central=[];
  let offset=0;
  // DOS time/date: we use a fixed timestamp (1980-01-01 00:00) — the
  // ZIP spec requires *some* value but most extractors don't surface it
  // for a backup archive. Keeping it constant makes the output
  // bit-identical for the same inputs which is nice for diffing.
  const DOS_TIME=0;
  const DOS_DATE=0x21; // (1<<5)|1 = month=1, day=1
  for(const e of entries){
    const nameBytes=enc.encode(e.name);
    const data=e.data;
    const crc=crc32(data);
    const size=data.length;

    // Local File Header (30 bytes + name)
    const lfh=new Uint8Array(30+nameBytes.length);
    const lv=new DataView(lfh.buffer);
    lv.setUint32(0,0x04034b50,true);     // signature
    lv.setUint16(4,20,true);             // version needed
    lv.setUint16(6,0,true);              // gp bit flag
    lv.setUint16(8,0,true);              // method = STORE
    lv.setUint16(10,DOS_TIME,true);      // mod time
    lv.setUint16(12,DOS_DATE,true);      // mod date
    lv.setUint32(14,crc,true);
    lv.setUint32(18,size,true);          // compressed size
    lv.setUint32(22,size,true);          // uncompressed size
    lv.setUint16(26,nameBytes.length,true);
    lv.setUint16(28,0,true);             // extra field length
    lfh.set(nameBytes,30);

    records.push(lfh,data);

    // Central Directory File Header (46 bytes + name)
    const cdh=new Uint8Array(46+nameBytes.length);
    const cv=new DataView(cdh.buffer);
    cv.setUint32(0,0x02014b50,true);     // signature
    cv.setUint16(4,20,true);             // version made by
    cv.setUint16(6,20,true);             // version needed
    cv.setUint16(8,0,true);              // gp bit flag
    cv.setUint16(10,0,true);             // method = STORE
    cv.setUint16(12,DOS_TIME,true);
    cv.setUint16(14,DOS_DATE,true);
    cv.setUint32(16,crc,true);
    cv.setUint32(20,size,true);
    cv.setUint32(24,size,true);
    cv.setUint16(28,nameBytes.length,true);
    cv.setUint16(30,0,true);             // extra
    cv.setUint16(32,0,true);             // comment
    cv.setUint16(34,0,true);             // disk #
    cv.setUint16(36,0,true);             // internal attrs
    cv.setUint32(38,0,true);             // external attrs
    cv.setUint32(42,offset,true);        // local header offset
    cdh.set(nameBytes,46);
    central.push(cdh);

    offset+=lfh.length+data.length;
  }

  let cdSize=0;
  for(const c of central)cdSize+=c.length;
  const cdOffset=offset;

  // End of Central Directory (22 bytes, no comment)
  const eocd=new Uint8Array(22);
  const ev=new DataView(eocd.buffer);
  ev.setUint32(0,0x06054b50,true);
  ev.setUint16(4,0,true);                // disk #
  ev.setUint16(6,0,true);                // disk where CD starts
  ev.setUint16(8,entries.length,true);   // entries on this disk
  ev.setUint16(10,entries.length,true);  // total entries
  ev.setUint32(12,cdSize,true);
  ev.setUint32(16,cdOffset,true);
  ev.setUint16(20,0,true);               // comment length

  // Concatenate everything into one Uint8Array.
  let total=offset+cdSize+eocd.length;
  const out=new Uint8Array(total);
  let p=0;
  for(const r of records){out.set(r,p);p+=r.length;}
  for(const c of central){out.set(c,p);p+=c.length;}
  out.set(eocd,p);
  return out;
}

/**
 * Parse a STORE-only ZIP produced by {@link buildZip}. Walks Local
 * File Headers sequentially; ignores the central directory.
 *
 * Only STORE (method = 0) entries are decoded. Entries with any other
 * compression method are skipped with a console warning — pure JS
 * DEFLATE is out of scope for this project.
 *
 * @param {Uint8Array} bytes
 * @returns {Array<{name:string,data:Uint8Array}>}
 */
function parseZip(bytes){
  const dec=new TextDecoder();
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const out=[];
  let p=0;
  while(p+30<=bytes.length){
    const sig=v.getUint32(p,true);
    if(sig!==0x04034b50)break;
    const method=v.getUint16(p+8,true);
    const compSize=v.getUint32(p+18,true);
    const nameLen=v.getUint16(p+26,true);
    const extraLen=v.getUint16(p+28,true);
    const nameStart=p+30;
    const dataStart=nameStart+nameLen+extraLen;
    const name=dec.decode(bytes.subarray(nameStart,nameStart+nameLen));
    if(method===0){
      out.push({name,data:bytes.subarray(dataStart,dataStart+compSize)});
    }else{
      console.warn('[zip] skipping non-STORE entry:',name,'method=',method);
    }
    p=dataStart+compSize;
  }
  return out;
}

// ---------------------------------------------------------------------------
// PHOTO ZIP EXPORT / IMPORT
// ---------------------------------------------------------------------------

/**
 * Bundle every stored progress photo into `75hard-photos.zip` and
 * trigger a download. Photos missing from localStorage are skipped.
 * @returns {void}
 */
export function exportPhotosZip(){
  const entries=[];
  for(let d=1;d<=TOTAL;d++){
    const url=localStorage.getItem(photoKey(d));
    if(!url)continue;
    try{
      entries.push({name:`photo_day_${d}.jpg`,data:dataUrlToBytes(url)});
    }catch(err){
      console.warn('[zip] could not decode photo for day',d,err);
    }
  }
  if(!entries.length){showToast('No photos to export');return;}
  const zip=buildZip(entries);
  const blob=new Blob([zip],{type:'application/zip'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='75hard-photos.zip';
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
  showToast(`Exported ${entries.length} photo${entries.length===1?'':'s'}`);
}

/** Open the hidden ZIP file picker. @returns {void} */
export function pickPhotoZipFile(){
  const input=document.getElementById('import-zip-input');
  if(input){input.value='';input.click();}
}

/**
 * Handle a chosen photo ZIP: parse entries, restore each
 * `photo_day_<N>.jpg` into localStorage.
 * @param {Event} ev  `change` event from the file input.
 * @returns {void}
 */
export function handlePhotoZipFile(ev){
  const file=ev.target.files&&ev.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    let entries;
    try{
      const bytes=new Uint8Array(reader.result);
      entries=parseZip(bytes);
    }catch(err){
      console.warn('[zip] parse error',err);
      showToast('Photo import failed: could not read ZIP');
      return;
    }
    let restored=0,skipped=0;
    for(const e of entries){
      // Accept `photo_day_<N>.jpg` (with or without a folder prefix).
      const m=/(?:^|\/)photo_day_(\d+)\.jpe?g$/i.exec(e.name);
      if(!m){skipped++;continue;}
      const day=parseInt(m[1],10);
      if(!(day>=1&&day<=TOTAL)){skipped++;continue;}
      try{
        localStorage.setItem(photoKey(day),bytesToJpegDataUrl(e.data));
        restored++;
      }catch(err){
        console.warn('[zip] restore failed for day',day,err);
        skipped++;
      }
    }
    if(restored){
      const s=getState();
      if(s)emit('state:changed',s);
      showToast(`Restored ${restored} photo${restored===1?'':'s'}`+
        (skipped?` (${skipped} skipped)`:''));
    }else{
      showToast('No photos restored from ZIP');
    }
  };
  reader.onerror=()=>showToast('Photo import failed: could not read file');
  reader.readAsArrayBuffer(file);
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------
//
// These helpers are intentionally not part of the public UI surface;
// they're exported so the Node test suite can exercise the ZIP
// encoder/decoder without a browser. Keep names underscore-prefixed.

export const _internal = {
  crc32, dataUrlToBytes, bytesToJpegDataUrl, buildZip, parseZip,
  summarizeState,
};
