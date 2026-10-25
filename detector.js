// NoGPT: interpretable, non-probabilistic writing-pattern analysis.
// Scores are intentionally NOT estimates of authorship probability.
const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const STOP = new Set('a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its just me more my no not of on or our ours out over she so some such than that the their them there these they this those through to too under up us very was we were what when where which while who will with would you your yours also then each other one two three'.split(' '));
const TRANSITIONS = ['furthermore','moreover','additionally','in conclusion','in summary','overall','however','nevertheless','consequently','therefore','thus','it is important to note','it is worth noting','on the other hand','in addition','as a result','in today’s','in today\'s','in the realm of','in the world of','delve into','plays a crucial role','a wide range of','it is essential to','in order to','ultimately','notably','firstly','secondly','lastly'];
const clamp = (v,min=0,max=1)=>Math.min(max,Math.max(min,v));
const avg = a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const sd = a=>a.length?Math.sqrt(avg(a.map(v=>(v-avg(a))**2))):0;
export function wordsOf(text){return String(text||'').match(WORD_RE)||[];}
export function sentencesOf(text){
  text=String(text||'');
  if (!text.trim()) return [];
  const s=[];
  if (typeof Intl!=='undefined' && Intl.Segmenter){
    for(const seg of new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text)) {
      if(wordsOf(seg.segment).length) s.push({text:seg.segment,start:seg.index,end:seg.index+seg.segment.length});
    }
  } else {
    const re=/[^.!?。！？\n]+(?:[.!?。！？]+|(?=\n|$))/g;
    for(const m of text.matchAll(re)){if(wordsOf(m[0]).length) s.push({text:m[0],start:m.index,end:m.index+m[0].length});}
  }
  return s.length?s:[{text,start:0,end:text.length}];
}
export function cleanMarkdown(text){
  return String(text||'')
    .replace(/```[\s\S]*?```/g,' ')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/gm,'')
    .replace(/[*_~]{1,3}/g,'')
    .replace(/<[^>]*>/g,' ')
    .replace(/^\s*[-=]{3,}\s*$/gm,' ');
}
function ttr(tokens){
  if (!tokens.length) return 0;
  const chunks=[];
  for(let i=0;i<tokens.length;i+=50){const c=tokens.slice(i,i+50);if(c.length>=15)chunks.push(new Set(c).size/c.length);}
  return chunks.length?avg(chunks):new Set(tokens).size/tokens.length;
}
function repetition(tokens){
  if(tokens.length<6) return 0;
  const counts=new Map();
  for(let i=0;i<tokens.length-2;i++){const gram=tokens.slice(i,i+3).join(' ');counts.set(gram,(counts.get(gram)||0)+1);}
  let repeats=0;for(const n of counts.values())repeats+=Math.max(0,n-1);
  return repeats/(tokens.length-2);
}
export function analyzeText(input,{markdown=false}={}){
  const original=String(input||'');
  const plain=markdown?cleanMarkdown(original):original;
  const tokens=wordsOf(plain).map(w=>w.toLocaleLowerCase());
  const sentences=sentencesOf(plain);
  const lens=sentences.map(s=>wordsOf(s.text).length);
  const n=tokens.length, variance=avg(lens)?sd(lens)/avg(lens):0;
  const diversity=ttr(tokens);
  const repeated=repetition(tokens);
  const lower=plain.toLocaleLowerCase();
  const transitionHits=TRANSITIONS.reduce((s,p)=>s+(lower.match(new RegExp('\\b'+p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','g'))||[]).length,0);
  const transitionRate=transitionHits/Math.max(n,1)*100;
  const starts=new Map();
  for(const sent of sentences){const start=wordsOf(sent.text).slice(0,3).map(w=>w.toLowerCase()).join(' ');if(start)starts.set(start,(starts.get(start)||0)+1);}
  const duplicateStarts=Math.max(0,[...starts.values()].reduce((a,b)=>a+Math.max(0,b-1),0))/Math.max(sentences.length,1);
  const longProse=lens.filter(x=>x>=10).length/Math.max(lens.length,1);
  const uniformity=clamp((0.84-variance)/0.67);
  const repeatSignal=clamp((repeated-.035)/.19);
  const transitionSignal=clamp((transitionRate-.30)/2.0);
  const lexicalSignal=clamp((.83-diversity)/.33);
  const startSignal=clamp((duplicateStarts-.06)/.4);
  const polishedSignal=clamp((longProse-.48)/.44)*uniformity;
  // Mechanistic, hand-chosen weights; not fitted on or validated against a corpus.
  const components=[
    {key:'uniformity',label:'Sentence uniformity',value:uniformity,weight:26,description:'Similar sentence lengths across the passage'},
    {key:'repetition',label:'Repeated phrasing',value:repeatSignal,weight:22,description:'Repeated three-word sequences'},
    {key:'transitions',label:'Formulaic transitions',value:transitionSignal,weight:18,description:'Common connective and stock phrases'},
    {key:'diversity',label:'Vocabulary predictability',value:lexicalSignal,weight:15,description:'Repeated vocabulary across small windows'},
    {key:'openings',label:'Repeated sentence openings',value:startSignal,weight:11,description:'Sentences beginning with the same three words'},
    {key:'cadence',label:'Consistent long-form cadence',value:polishedSignal,weight:8,description:'Long sentences with limited rhythm changes'}
  ];
  const score=Math.round(clamp(components.reduce((a,c)=>a+c.value*c.weight,0)/100)*100);
  const evidence=n>=300?'Better sample':n>=150?'Moderate sample':n>=70?'Limited sample':'Very limited sample';
  const sentenceEvidence=sentences.map(s=>{
    const w=wordsOf(s.text), text=s.text.toLocaleLowerCase(), sl=w.length;
    const phrases=TRANSITIONS.filter(p=>text.includes(p)).length;
    let repeats=0;for(let i=0;i<w.length-2;i++){
      const g=w.slice(i,i+3).map(t=>t.toLowerCase()).join(' ');
      if(tokens.indexOf(g.split(' ')[0])>=0 && lower.indexOf(g)!==lower.lastIndexOf(g)) repeats++;
    }
    const uniformMatch=clamp(1-Math.abs(sl-avg(lens))/Math.max(avg(lens),6));
    const val=clamp(.42*uniformMatch*uniformity + .30*clamp(phrases/2) + .28*clamp(repeats/3));
    return {...s,signal:Math.round(val*100)};
  });
  const frequencies=new Map();tokens.forEach(t=>{if(t.length>2&&!STOP.has(t)&&!/^\d+$/.test(t))frequencies.set(t,(frequencies.get(t)||0)+1);});
  const keywords=[...frequencies.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12).map(([word,count])=>({word,count}));
  const paragraphs=plain.split(/\n\s*\n/).filter(v=>v.trim()).length;
  return {score,evidence,wordCount:n,charCount:plain.length,charactersNoSpaces:plain.replace(/\s/g,'').length,sentenceCount:sentences.length,paragraphCount:paragraphs,readingMinutes:n/225,speakingMinutes:n/145,averageSentence:Math.round(avg(lens)*10)/10,sentenceVariation:Math.round(variance*100),diversity:Math.round(diversity*100),repeatedTrigrams:Math.round(repeated*100),transitions:transitionHits,components,keywords,sentences:sentenceEvidence,plain,generatedAt:new Date().toISOString(),method:'NoGPT v1 heuristic writing-pattern score (NOT an AI authorship probability)'};
}
export function extractiveSummary(text,maxSentences=3){
  const list=sentencesOf(text).filter(s=>wordsOf(s.text).length>=5);
  if(list.length<=maxSentences)return list.map(s=>s.text.trim()).join(' ');
  const tokens=wordsOf(text).map(w=>w.toLowerCase()).filter(w=>w.length>2&&!STOP.has(w));
  const frequency=new Map();for(const w of tokens)frequency.set(w,(frequency.get(w)||0)+1);
  const ranks=list.map((s,i)=>({i,weight:wordsOf(s.text).reduce((a,w)=>a+(frequency.get(w.toLowerCase())||0),0)/Math.sqrt(Math.max(wordsOf(s.text).length,1))*(1+(i===0?.08:0))}));
  const selected=ranks.sort((a,b)=>b.weight-a.weight).slice(0,maxSentences).sort((a,b)=>a.i-b.i);
  return selected.map(v=>list[v.i].text.trim()).join(' ');
}
