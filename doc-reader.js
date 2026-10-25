// Local extraction of Microsoft Word 97–2003 OLE2 / CFB .doc files.
// Never uploads or executes document content; unsupported/protected files fail closed.
const decoder1252 = new TextDecoder('windows-1252');
const MAX_DOC_TEXT=2_000_000;
function fail(message){throw new Error('Cannot read legacy DOC: '+message)}
function safe(view,offset,length=4){if(offset<0||offset+length>view.byteLength)fail('file is truncated or corrupt')}
function u16(view,offset){safe(view,offset,2);return view.getUint16(offset,true)}
function u32(view,offset){safe(view,offset);return view.getUint32(offset,true)}
function streamBytes(bytes,indices,sectorSize,limit){
  const blocks=[], seen=new Set();let next=indices.start,total=0;
  const maxBlocks=Math.ceil(limit/sectorSize)+1;
  while(next!==0xfffffffe && next!==0xffffffff){
    if(!Number.isInteger(next)||next>=indices.map.length||seen.has(next)||blocks.length>=maxBlocks)fail('invalid or cyclic compound file chain');
    seen.add(next);const start=512+(next*sectorSize);if(start+sectorSize>bytes.length)fail('sector beyond end of file');
    const block=bytes.subarray(start,start+sectorSize);blocks.push(block);total+=sectorSize;next=indices.map[next];
  }
  const out=new Uint8Array(Math.min(total,limit));let p=0;
  for(const b of blocks){const n=Math.min(b.length,out.length-p);out.set(b.subarray(0,n),p);p+=n;if(p>=out.length)break;}
  return out;
}
function readOLE(bytes){
  if(bytes.length<512)fail('not a compound Word document');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const magic=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
  if(!magic.every((c,i)=>bytes[i]===c))fail('not a binary Word .doc (it may be RTF or DOCX with the wrong extension)');
  if(u16(v,0x1c)!==0xfffe)fail('unsupported byte order');
  const major=u16(v,0x1a),sectorSize=2**u16(v,0x1e),miniSize=2**u16(v,0x20);
  if(![512,4096].includes(sectorSize)||miniSize!==64||![3,4].includes(major))fail('unsupported compound file version');
  const maximum=Math.ceil((bytes.length-512)/sectorSize);
  const nFAT=u32(v,0x2c),dirStart=u32(v,0x30),miniCut=u32(v,0x38),miniFATStart=u32(v,0x3c),nMiniFAT=u32(v,0x40);
  const difatStart=u32(v,0x44),nDIFAT=u32(v,0x48);
  if(nFAT>maximum||nDIFAT>maximum||nMiniFAT>maximum)fail('implausible sector counts');
  const difat=[];for(let i=0;i<109;i++){const id=u32(v,0x4c+4*i);if(id!==0xffffffff)difat.push(id)}
  const readSector=(id)=>{if(id>=maximum)fail('invalid sector index');const start=512+id*sectorSize;return new DataView(bytes.buffer,bytes.byteOffset+start,sectorSize)};
  let chain=difatStart;const seenD=new Set();
  for(let i=0;i<nDIFAT;i++){
    if(chain>=maximum||seenD.has(chain))fail('invalid DIFAT chain');seenD.add(chain);
    const dv=readSector(chain);for(let k=0;k<sectorSize/4-1;k++){const id=u32(dv,k*4);if(id!==0xffffffff)difat.push(id)}
    chain=u32(dv,sectorSize-4);
  }
  if(difat.length<nFAT)fail('incomplete FAT');
  const fat=[];
  for(const id of difat.slice(0,nFAT)){const dv=readSector(id);for(let i=0;i<sectorSize/4;i++)fat.push(u32(dv,i*4));}
  const indices={map:fat,start:dirStart};
  const dirs=streamBytes(bytes,indices,sectorSize,Math.min(bytes.length,sectorSize*maximum));
  const records=new Map();let root=null;
  for(let p=0;p+128<=dirs.length;p+=128){
    const d=new DataView(dirs.buffer,dirs.byteOffset+p,128);
    const nameSize=u16(d,64),type=dirs[p+66];
    if(nameSize<2||nameSize>64||nameSize%2!==0||!(type===2||type===5))continue;
    const name=new TextDecoder('utf-16le').decode(dirs.slice(p,p+nameSize-2));
    const szLo=u32(d,120),szHi=u32(d,124);
    const record={name,type,start:u32(d,116),size:szLo,high:szHi};
    if(type===5)root=record;
    if(type===2)records.set(name,record);
  }
  if(!root)fail('missing compound file root');
  let miniFAT=[];
  if(nMiniFAT){
    const smallBytes=streamBytes(bytes,{map:fat,start:miniFATStart},sectorSize,nMiniFAT*sectorSize);
    const mv=new DataView(smallBytes.buffer,smallBytes.byteOffset,smallBytes.byteLength);
    for(let i=0;i+4<=smallBytes.length;i+=4)miniFAT.push(u32(mv,i));
  }
  let miniStream=null;
  const get=(name)=>{
    const entry=records.get(name);if(!entry)return null;
    if(entry.high!==0||entry.size>MAX_DOC_TEXT*6)fail(name+' stream too large');
    if(entry.size===0)return new Uint8Array();
    if(entry.size<miniCut){
      if(!miniStream){if(root.high!==0||root.size>bytes.length*4)fail('root stream size invalid');miniStream=streamBytes(bytes,{map:fat,start:root.start},sectorSize,root.size)}
      const out=new Uint8Array(entry.size);const visited=new Set();let index=entry.start,p=0;
      while(p<entry.size){
        if(index>=miniFAT.length||visited.has(index))fail('invalid mini FAT chain');visited.add(index);
        const start=index*miniSize,length=Math.min(miniSize,entry.size-p);if(start+length>miniStream.length)fail('mini stream truncated');
        out.set(miniStream.slice(start,start+length),p);p+=length;index=miniFAT[index];
      }
      return out;
    }
    return streamBytes(bytes,{map:fat,start:entry.start},sectorSize,entry.size);
  };
  return {get};
}
function normalizeText(s){
  return s.replace(/\x00/g,'')
    .replace(/[\x01-\x06\x08\x0e-\x12\x16-\x1f]/g,'')
    .replace(/[\x07]/g,'\t').replace(/[\x0b\x0c\x0d]/g,'\n')
    .replace(/\n[\t ]*\n[\t ]*\n+/g,'\n\n').trim();
}
function parseDoc(bytes){
  const ole=readOLE(bytes),doc=ole.get('WordDocument');
  if(!doc)fail('missing WordDocument stream');
  const v=new DataView(doc.buffer,doc.byteOffset,doc.byteLength);
  if(u16(v,0)!==0xa5ec)fail('invalid Word FIB signature');
  const flags=u16(v,0x0a);
  if(flags & 0x0100)fail('encrypted Word files are not supported');
  const table=ole.get((flags&0x0200)?'1Table':'0Table');
  if(!table)fail('missing Word table stream');
  // Parse variable-length FIB, avoiding hard-coded offsets when later FIBs add fields.
  let offset=32;
  const csw=u16(v,offset);offset+=2+2*csw;
  const cslw=u16(v,offset);offset+=2+4*cslw;
  const count=u16(v,offset);offset+=2;
  if(count<=33)fail('missing Word piece-table pointer');
  const fcClx=u32(v,offset+33*8),lcbClx=u32(v,offset+33*8+4);
  const tv=new DataView(table.buffer,table.byteOffset,table.byteLength);
  if(!lcbClx||fcClx+lcbClx>table.length)fail('invalid Word piece table');
  let pos=fcClx,end=fcClx+lcbClx,plc=null;
  while(pos<end){
    const tag=table[pos++];
    if(tag===1){const length=u16(tv,pos);pos+=2+length;}
    else if(tag===2){const len=u32(tv,pos);pos+=4;if(pos+len>end)fail('truncated piece table');plc={start:pos,size:len};break;}
    else fail('unrecognized Word piece-table record');
  }
  if(!plc||(plc.size-4)%12!==0)fail('invalid Word piece descriptors');
  const pieces=(plc.size-4)/12;
  if(pieces>100000)fail('too many text pieces');
  const desc=plc.start+4*(pieces+1);
  const parts=[];let chars=0;
  for(let i=0;i<pieces;i++){
    const cp0=u32(tv,plc.start+4*i),cp1=u32(tv,plc.start+4*(i+1));
    let length=cp1-cp0;if(length<0||length>MAX_DOC_TEXT||chars+length>MAX_DOC_TEXT)fail('invalid character range');
    const fcRaw=u32(tv,desc+8*i+2);
    const compressed=Boolean(fcRaw&0x40000000);
    const fc=(fcRaw&0x3fffffff)/(compressed?2:1),bytesNeeded=length*(compressed?1:2);
    if(!Number.isInteger(fc)||fc+bytesNeeded>doc.length)fail('piece points outside Word document');
    const data=doc.subarray(fc,fc+bytesNeeded);
    parts.push(compressed?decoder1252.decode(data):new TextDecoder('utf-16le').decode(data));
    chars+=length;
  }
  return normalizeText(parts.join(''));
}
export function docText(bytes){
  const arr=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  return parseDoc(arr);
}
