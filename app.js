import {analyzeText,extractiveSummary,wordsOf} from './detector.js';
import {readTextFile} from './readers.js';
import {runModel, MODEL_ID, MIN_WORDS} from './model.js';

const $=id=>document.getElementById(id);
const state={docs:[],active:'paste',tab:'highlights',counter:0,busy:false};
const scoreText=r=>r?.score==null?'Inconclusive':r.score+'%';
function setBusy(v){state.busy=v;$('analyze').disabled=v;$('browse').disabled=v;$('clear').disabled=v;}
async function scoreDocument(doc,progress){
  const signals=analyzeText(doc.text,{markdown:doc.markdown});
  const ml=await runModel(doc.text,{markdown:doc.markdown,progress});
  return {...signals,score:ml.ok?ml.score:null,aiProbabilityEstimate:ml.ok?ml.score:null,calibrated:false,model:ml,modelId:MODEL_ID,patternScore:signals.patternScore,method:ml.ok?ml.method:'No model score — '+ml.reason,evidence:ml.ok?ml.evidence:ml.reason};
}
const makeDoc=(id,name,text='',markdown=false)=>({id,name,text,markdown,result:null,error:null});
state.docs.push(makeDoc('paste','Pasted text'));
const activeDoc=()=>state.docs.find(d=>d.id===state.active)||state.docs[0];
function status(text,type=''){const el=$('status');el.textContent=text;el.className='status '+type;}
function formatTime(min){return min<1?Math.max(1,Math.round(min*60))+' sec':(Math.ceil(min))+' min';}
function wordCount(){const t=$('editor').value;$('editor-count').textContent=wordsOf(t).length.toLocaleString()+' words · '+t.length.toLocaleString()+' characters';}
function el(tag,className,text){const item=document.createElement(tag);if(className)item.className=className;if(text!==undefined)item.textContent=String(text);return item;}
function addButton(parent,label,onClick,cls=''){const button=el('button',cls,label);button.type='button';button.addEventListener('click',onClick);parent.append(button);return button;}
function setTab(tab){state.tab=tab;document.querySelectorAll('.result-tab').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));});for(const t of ['highlights','signals','summary'])$(t).classList.toggle('hidden',t!==tab);}
function setActive(id){
  const doc=state.docs.find(d=>d.id===id);if(!doc)return;
  state.active=id;$('editor').value=doc.text;wordCount();drawFiles();drawReport();
  status(doc.result?'Loaded previous local analysis':'Ready to analyze');
}
function drawFiles(){
  const parent=$('filelist');parent.replaceChildren();
  const batch=$('batch-list');batch.replaceChildren();
  for(const doc of state.docs.filter(d=>d.id!=='paste')){
    const item=el('div','fileitem'+(doc.id===state.active?' active':''));
    addButton(item,'▤ '+doc.name,()=>setActive(doc.id));
    const tag=el('small','',doc.error?'Error':doc.result?scoreText(doc.result):'Ready');
    item.append(tag);
    addButton(item,'×',()=>removeDoc(doc.id),'remove-file').setAttribute('aria-label','Remove '+doc.name);
    parent.append(item);
    const row=el('div','fileitem');
    addButton(row,doc.name,()=>{setActive(doc.id);$('analyzer').scrollIntoView({behavior:'smooth'});});
    row.append(el('small','',doc.error?'Error':doc.result?scoreText(doc.result):'Not analyzed'));
    batch.append(row);
  }
  $('export-csv').classList.toggle('hidden',!state.docs.some(d=>d.id!=='paste'&&d.result));
  if(!batch.childElementCount)batch.append(el('p','status','No uploaded documents in this session.'));
}
function removeDoc(id){
  state.docs=state.docs.filter(d=>d.id!==id);
  if(state.active===id)setActive('paste');else drawFiles();
  status('Document removed from this tab','success');
}
function drawReport(){
  const d=activeDoc(),r=d.result;
  $('result').classList.toggle('hidden',!r);
  $('empty').classList.toggle('hidden',Boolean(r));
  if(!r){resetInsights();return;}
  $('result-name').textContent=d.name;
  $('score').textContent=r.score==null?'—':r.score+'%';
  $('arc').style.strokeDashoffset=String(314.16*(1-(r.score??0)/100));
  $('ring-label').setAttribute('aria-label',r.score==null?'No model estimate for this text':'On-device classifier AI score '+r.score+' percent');
  $('evidence').textContent=r.evidence+' · '+r.wordCount+' words';
  $('model-details').textContent=r.model?.ok ? 'Trained TMR model · '+r.model.windows.length+' evaluated passages · '+Math.round(r.model.coverage*100)+'% word coverage · between-passage spread '+Math.round(r.model.disagreement*100)+' percentage points. Outputs are uncalibrated model scores, not confirmed authorship probabilities.' : r.model?.reason||'Model score not available.';
  $('words').textContent=r.wordCount.toLocaleString();
  $('sentences').textContent=r.sentenceCount.toLocaleString();
  $('reading').textContent=formatTime(r.readingMinutes);
  const out=$('highlight-text');out.replaceChildren();
  let last=0;
  for(const s of r.sentences){
    if(s.start>last)out.append(document.createTextNode(r.plain.slice(last,s.start)));
    const part=r.plain.slice(s.start,s.end);
    if(s.signal>=44){const mark=el('mark','',part);mark.title='Local pattern signal '+s.signal+'/100 — not a claim of AI authorship';out.append(mark)}
    else out.append(document.createTextNode(part));
    last=s.end;
  }
  if(last<r.plain.length)out.append(document.createTextNode(r.plain.slice(last)));
  const metrics=$('metrics');metrics.replaceChildren();
  if(r.model?.ok){for(const w of r.model.windows){const row=el('div','metric');const top=el('div','metric-row');top.append(el('span','metric-label','Local model passage '+w.index+' · '+w.words+' words'),el('span','metric-score',Math.round(w.probability*100)+'%'));const meter=el('div','meter'),fill=el('div','meter-fill');fill.style.width=Math.round(w.probability*100)+'%';meter.append(fill);row.append(top,meter);metrics.append(row);}}
  metrics.append(el('p','metric-note','The writing-style signals below are descriptive only; they do not affect the model score.'));
  r.components.forEach(c=>{
    const row=el('div','metric');const top=el('div','metric-row');
    top.append(el('span','metric-label',c.label),el('span','metric-score',Math.round(c.value*100)+'/100'));
    const meter=el('div','meter'),fill=el('div','meter-fill');fill.style.width=Math.round(c.value*100)+'%';meter.append(fill);
    row.append(top,meter,el('div','metric-note',c.description));metrics.append(row);
  });
  $('summary-text').textContent=extractiveSummary(r.plain,3)||'Not enough sentences for a meaningful extractive summary.';
  $('average-length').textContent=r.averageSentence;
  $('variation').textContent=r.sentenceVariation+'%';
  $('reading-level').textContent=formatTime(r.speakingMinutes);
  const keywords=$('keywords');keywords.replaceChildren();
  if(!r.keywords.length)keywords.append(el('span','status','Not enough content words.'));
  for(const kw of r.keywords)keywords.append(el('span','keyword',kw.word+' · '+kw.count));
  setTab(state.tab);
}
function resetInsights(){
  $('average-length').textContent='—';$('variation').textContent='—';$('reading-level').textContent='—';
  $('keywords').replaceChildren(el('span','status','Analyze text to see keywords.'));
}
async function scan(){
  if(state.busy)return;
  const d=activeDoc();d.text=$('editor').value;
  if(!d.text.trim()){status('Enter or open some text first.','error');$('editor').focus();return;}
  if(wordsOf(d.text).length<8){status('Add at least 8 words for writing statistics. Model scoring requires '+MIN_WORDS+' English words.','error');return;}
  if(d.text.length>750000){status('Text must be 750,000 characters or fewer.','error');return;}
  const sourceText=d.text;setBusy(true);
  try{const result=await scoreDocument(d,m=>status(m));if(d.text!==sourceText){status('Text changed during analysis — run again.');return;}d.result=result;drawReport();drawFiles();status(d.result.score==null?'No model percentage: '+d.result.evidence:'Local model inference complete','success');}
  catch(error){d.result=null;drawReport();drawFiles();status('Model could not run: '+error.message+' — no guessed score was substituted.','error');}
  finally{setBusy(false);}
}
async function importFiles(files){
  if(state.busy)return;
  const list=Array.from(files||[]);if(!list.length)return;
  if(list.length>30){status('Select 30 or fewer files at a time.','error');return;}
  setBusy(true);
  let completed=0,failed=0,first=null;
  for(const file of list){
    status('Reading '+file.name+' on this device…');
    try{
      const read=await readTextFile(file);
      const d=makeDoc('file-'+(++state.counter),read.name,read.text,read.markdown);
      if(wordsOf(d.text).length>=8)d.result=await scoreDocument(d,m=>status(file.name+': '+m));
      else d.error='Fewer than 8 words';
      state.docs.push(d);if(first===null)first=d.id;completed++;
    }catch(error){failed++;const d=makeDoc('file-'+(++state.counter),file.name);d.error=error.message;state.docs.push(d);}
  }
  if(first)setActive(first);
  drawFiles();setBusy(false);$('files').value='';
  status(completed+' file'+(completed===1?'':'s')+' imported'+(failed?', '+failed+' failed (see list)':''),failed?'error':'success');
}
function clearAll(){
  state.docs=[makeDoc('paste','Pasted text')];state.active='paste';state.tab='highlights';$('editor').value='';$('files').value='';wordCount();drawReport();drawFiles();status('Everything in this tab was cleared.','success');$('editor').focus();
}
function reportString(d){
  const r=d.result;
  return 'NoGPT — private on-device AI-model report\nDocument: '+d.name+'\nModel score: '+(r.score==null?'Inconclusive / unavailable':r.score+'% AI (UNCALIBRATED)')+'\nModel: '+r.modelId+'\nModel evidence: '+r.evidence+'\nPassages tested: '+(r.model?.windows?.length||0)+'\nWords covered: '+(r.model?.evaluatedWords||0)+' of '+r.wordCount+'\nWords: '+r.wordCount+'\nSentences: '+r.sentenceCount+'\nReading time: '+formatTime(r.readingMinutes)+'\n\nDescriptive style signals (not used by classifier):\n'+r.components.map(c=>'- '+c.label+': '+Math.round(c.value*100)+'/100 — '+c.description).join('\n')+'\n\nSelected sentences (extractive summary):\n'+extractiveSummary(r.plain,3)+'\n\nCaution: Classifier softmax scores are not validated authorship probabilities; false positives and false negatives remain possible. Not evidence of who wrote a document.\n';
}
function saveFile(filename,content,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function exportCurrent(ext){
  const d=activeDoc();if(!d.result){status('Analyze text before exporting.','error');return;}
  const base=d.name.replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]/gi,'_').slice(0,60)||'nogpt';
  if(ext==='txt')saveFile(base+'-nogpt-report.txt',reportString(d),'text/plain;charset=utf-8');
  else saveFile(base+'-nogpt-report.json',JSON.stringify({document:d.name,scoreType:'On-device TMR RoBERTa classifier score (not a calibrated probability)',calibrated:false,analysis:d.result},null,2),'application/json;charset=utf-8');
  status('Report downloaded to your device','success');
}
function csvEscape(s){return '"'+String(s??'').replace(/"/g,'""')+'"'}
function exportBatch(){
  const rows=state.docs.filter(d=>d.id!=='paste'&&d.result);
  if(!rows.length){status('No analyzed files to export','error');return;}
  const cells=[['Document','Model AI score (%) - uncalibrated','Evaluated words','Total words','Passages','Evidence','Method']];
  for(const d of rows)cells.push([d.name,d.result.score??'',d.result.model?.evaluatedWords??0,d.result.wordCount,d.result.model?.windows?.length??0,d.result.evidence,d.result.method]);
  saveFile('nogpt-batch.csv',cells.map(row=>row.map(csvEscape).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  status('Batch CSV downloaded','success');
}
$('editor').addEventListener('input',()=>{
  const d=activeDoc();d.text=$('editor').value;d.result=null;d.error=null;wordCount();drawReport();drawFiles();status('Text changed — run analysis to update');
});
$('analyze').addEventListener('click',scan);$('clear').addEventListener('click',clearAll);
$('browse').addEventListener('click',()=> $('files').click());
$('files').addEventListener('change',e=>importFiles(e.target.files));
const zone=$('dropzone');
zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over')});
zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('over');importFiles(e.dataTransfer.files)});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{if(!zone.contains(e.target)){e.preventDefault();importFiles(e.dataTransfer.files)}});
document.querySelectorAll('.result-tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelectorAll('[data-scroll]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.scroll).scrollIntoView({behavior:'smooth',block:'start'})));
$('privacy-btn').addEventListener('click',()=> $('method').scrollIntoView({behavior:'smooth'}));
$('save-txt').addEventListener('click',()=>exportCurrent('txt'));
$('save-json').addEventListener('click',()=>exportCurrent('json'));
$('export-csv').addEventListener('click',exportBatch);
$('copy').addEventListener('click',async()=>{
  const d=activeDoc();if(!d.result)return;
  try{await navigator.clipboard.writeText(reportString(d));status('Report copied to clipboard','success')}
  catch(_){status('Clipboard permission denied — download text instead','error')}
});
$('print').addEventListener('click',()=>{if(activeDoc().result)window.print()});
wordCount();drawFiles();

// Theme is not stored: initial appearance follows the OS, and the user's choice lasts in this tab only.
const themeToggle=$('theme-toggle');
const themeMedia=window.matchMedia('(prefers-color-scheme: dark)');
let manualTheme=false;
function applyTheme(mode){
  document.documentElement.dataset.theme=mode;
  themeToggle.textContent=mode==='dark'?'☀ Light mode':'☾ Dark mode';
  themeToggle.setAttribute('aria-label',mode==='dark'?'Switch to light mode':'Switch to dark mode');
  themeToggle.setAttribute('aria-pressed',String(mode==='dark'));
  document.querySelector('meta[name="theme-color"]').setAttribute('content',mode==='dark'?'#090f1e':'#f6f8fc');
}
applyTheme(themeMedia.matches?'dark':'light');
themeToggle.addEventListener('click',()=>{manualTheme=true;applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')});
themeMedia.addEventListener?.('change',e=>{if(!manualTheme)applyTheme(e.matches?'dark':'light')});
