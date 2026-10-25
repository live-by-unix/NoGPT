import {docText} from './doc-reader.js';
// Entirely browser-local file readers. No remote requests, third-party scripts or uploads.
const MAX_INPUT=12*1024*1024;
const MAX_UNCOMPRESSED=18*1024*1024;
const utf8=new TextDecoder('utf-8',{fatal:false});
function u16(d,i){return d.getUint16(i,true)}
function u32(d,i){return d.getUint32(i,true)}
async function docxText(file){
  const bytes=new Uint8Array(await file.arrayBuffer()), view=new DataView(bytes.buffer);
  if(bytes.length<22)throw Error('This DOCX is too small to contain a valid Word document.');
  let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--){if(u32(view,p)===0x06054b50){end=p;break}}
  if(end<0)throw Error('Cannot find ZIP directory. The DOCX may be damaged.');
  const total=u16(view,end+10),dirOffset=u32(view,end+16);
  if(total>20000||dirOffset>=bytes.length)throw Error('Unsupported or damaged DOCX ZIP directory.');
  let pos=dirOffset,found=null;
  for(let i=0;i<total;i++){
    if(pos+46>bytes.length||u32(view,pos)!==0x02014b50)throw Error('Invalid DOCX directory entry.');
    const method=u16(view,pos+10),compressed=u32(view,pos+20),uncompressed=u32(view,pos+24);
    const nameLength=u16(view,pos+28),extra=u16(view,pos+30),comment=u16(view,pos+32);
    const offset=u32(view,pos+42),name=utf8.decode(bytes.slice(pos+46,pos+46+nameLength));
    if(name==='word/document.xml')found={method,compressed,uncompressed,offset};
    pos+=46+nameLength+extra+comment;
  }
  if(!found)throw Error('The DOCX is missing word/document.xml.');
  if(found.uncompressed>MAX_UNCOMPRESSED||found.compressed>MAX_INPUT)throw Error('Document is too large to open safely.');
  const p=found.offset;
  if(p+30>bytes.length||u32(view,p)!==0x04034b50)throw Error('Invalid DOCX local ZIP header.');
  const start=p+30+u16(view,p+26)+u16(view,p+28),stop=start+found.compressed;
  if(stop>bytes.length)throw Error('Truncated DOCX file.');
  let raw=bytes.slice(start,stop);
  if(found.method===8){
    if(typeof DecompressionStream==='undefined')throw Error('Your browser cannot decompress DOCX files. Try a recent Chrome, Firefox or Safari.');
    const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    // declared size is capped above; guard the actual decompressed length too.
    const reader=stream.getReader(),pieces=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_UNCOMPRESSED){await reader.cancel();throw Error('DOCX expanded beyond the safety limit.');}pieces.push(value)}
    raw=new Uint8Array(size);let at=0;for(const piece of pieces){raw.set(piece,at);at+=piece.length}
  }else if(found.method!==0)throw Error('Unsupported DOCX compression method: '+found.method);
  const doc=new DOMParser().parseFromString(utf8.decode(raw),'application/xml');
  if(doc.querySelector('parsererror'))throw Error('Invalid Word XML in this DOCX.');
  const namespace='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const pNodes=doc.getElementsByTagNameNS(namespace,'p');
  const lines=[];
  for(const paragraph of pNodes){
    let line='';
    const walk=node=>{
      for(const child of node.childNodes){
        if(child.nodeType!==1)continue;
        if(child.namespaceURI===namespace){
          if(child.localName==='t'||child.localName==='delText'){if(child.localName==='t')line+=child.textContent;continue}
          if(child.localName==='tab'){line+='\t';continue}
          if(child.localName==='br'||child.localName==='cr'){line+='\n';continue}
        }
        walk(child);
      }
    };
    walk(paragraph);
    lines.push(line);
  }
  return lines.join('\n').replace(/\n{4,}/g,'\n\n\n').trim();
}
function rtfText(raw){
  const input=raw,decoder=new TextDecoder('windows-1252');
  const skippedDestinations=new Set(['fonttbl','colortbl','stylesheet','info','pict','object','header','footer','headerl','headerr','footerl','footerr','generator','listtable','listoverridetable','xmlnstbl','datastore','themedata','colorschememapping','filetbl','revtbl','rsidtbl']);
  let out='',skipFallback=0,groupStack=[],state={hidden:false,uc:1,star:false};
  const append=s=>{if(!state.hidden)out+=s;};
  for(let i=0;i<input.length;){
    const c=input[i];
    if(c==='{'){groupStack.push({...state});state={...state,star:false};i++;continue;}
    if(c==='}'){state=groupStack.pop()||{hidden:false,uc:1,star:false};i++;continue;}
    if(c==='\r'||c==='\n'){i++;continue;}
    if(c!=='\\'){if(skipFallback>0)skipFallback--;else append(c);i++;continue;}
    i++;if(i>=input.length)break;
    const cmd=input[i];
    if(cmd==='\''&&/^[0-9a-fA-F]{2}$/.test(input.slice(i+1,i+3))){
      const byte=parseInt(input.slice(i+1,i+3),16);
      if(skipFallback>0)skipFallback--;else append(decoder.decode(new Uint8Array([byte])));
      i+=3;continue;
    }
    if(cmd==='*'){state.hidden=true;state.star=true;i++;continue;}
    if('\\{}~_-'.includes(cmd)){
      const special={'\\':'\\','{':'{','}':'}','~':'\u00a0','_':'\u2011','-':'\u00ad'}[cmd];
      if(skipFallback>0)skipFallback--;else append(special);
      i++;continue;
    }
    if(!/[a-zA-Z]/.test(cmd)){i++;continue;}
    const start=i;while(i<input.length&&/[a-zA-Z]/.test(input[i]))i++;
    const word=input.slice(start,i);
    let sign=1;if(input[i]==='-'){sign=-1;i++}
    const numStart=i;while(i<input.length&&/[0-9]/.test(input[i]))i++;
    const hasArg=i>numStart, arg=hasArg?sign*Number(input.slice(numStart,i)):null;
    if(input[i]===' ')i++;
    if(skippedDestinations.has(word)){state.hidden=true;continue;}
    if(word==='uc'&&hasArg){state.uc=Math.min(Math.max(arg,0),10);continue;}
    if(word==='u'&&hasArg){let v=arg<0?arg+65536:arg;append(String.fromCharCode(v));skipFallback=state.uc;continue;}
    if(state.hidden)continue;
    if(word==='par'||word==='line')append('\n');
    else if(word==='tab')append('\t');
    else if(word==='emdash')append('—');
    else if(word==='endash')append('–');
    else if(word==='bullet')append('•');
    else if(word==='lquote')append('‘');
    else if(word==='rquote')append('’');
    else if(word==='ldblquote')append('“');
    else if(word==='rdblquote')append('”');
  }
  return out.replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
}
export async function readTextFile(file){
  if(file.size>MAX_INPUT)throw Error('File exceeds the 12 MB input limit.');
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['txt','text','md','markdown','docx','doc','rtf'].includes(ext))throw Error('Unsupported format. Use .txt, .md, .docx, .doc, or .rtf.');
  let text;
  if(ext==='docx') text=await docxText(file);
  else if(ext==='doc') text=docText(await file.arrayBuffer());
  else if(ext==='rtf'){
    const bytes=new Uint8Array(await file.arrayBuffer());
    text=rtfText(new TextDecoder('windows-1252').decode(bytes));
    if(!/^\s*\{\\rtf/.test(new TextDecoder('windows-1252').decode(bytes.slice(0,60))))throw Error('This file does not appear to be valid RTF.');
  }
  else text=await file.text();
  if(!text.trim())throw Error('No readable document text was found.');
  return {name:file.name,text,markdown:['md','markdown'].includes(ext)};
}
export {rtfText};
