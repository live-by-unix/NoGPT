// NoGPT: heuristic AI-likelihood estimate from interpretable writing-pattern signals.
// The displayed percentage is NOT a calibrated probability or authorship proof.
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
// Version 2 favors multiple independent signs over one generic writing trait.
// No text-only heuristic is a validated source-of-authorship estimate.
const FORMULAE=[
  ['it is important to note',2],['it is worth noting',2],['in conclusion',1],
  ['in summary',1],['in today\'s fast-paced',3],['in today’s fast-paced',3],
  ['in today\'s rapidly',3],['in today’s rapidly',3],['delve into',1],
  ['plays a crucial role',2],['a crucial role in',2],['a pivotal role in',2],
  ['this article explores',2],['this essay explores',2],['let us explore',2],
  ['let\'s explore',2],['a testament to',1],['in the realm of',2],
  ['in the ever-evolving',2],['it is essential to',1],['the importance of',0.5],
  ['ultimately',0.5],['furthermore',0.5],['moreover',0.5],['additionally',0.5],
  ['seamlessly',0.5],['comprehensive',0.4],['robust',0.4],['landscape',0.4],
  ['multifaceted',0.4],['foster',0.3],['harness the power',1.5],
  ['unlock the potential',2],['a wide range of',0.5],['as we navigate',1.5]
];
const BUZZ=new Set('tapestry pivotal crucial testament underscore underscores transformative leveraging transformative landscape beacon navigate foster fostering seamless seamlessly multifaceted innovative unparalleled impactful empower empowering increasingly myriad vital indispensable'.split(' '));
function ngramRepeats(tokens,size){
  if(tokens.length<size*2)return 0;
  const counts=new Map();
  for(let i=0;i<=tokens.length-size;i++){
    const gram=tokens.slice(i,i+size).join(' ');
    if(new Set(tokens.slice(i,i+size)).size===1)continue;
    counts.set(gram,(counts.get(gram)||0)+1);
  }
  let repeated=0;for(const count of counts.values())repeated+=Math.max(0,count-1);
  return repeated/(tokens.length-size+1);
}
function phraseHits(text){
  const out=[];
  for(const [phrase,weight] of FORMULAE){
    const pattern=new RegExp('(?<![\\p{L}\\p{N}])'+phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','gu');
    const count=[...text.matchAll(pattern)].length;
    if(count)out.push({phrase,weight,count});
  }
  return out;
}
export function analyzeText(input,{markdown=false}={}){
  const original=String(input||'');
  const plain=markdown?cleanMarkdown(original):original;
  const wordList=wordsOf(plain);
  const tokens=wordList.map(w=>w.toLocaleLowerCase());
  const sentences=sentencesOf(plain);
  const lens=sentences.map(s=>wordsOf(s.text).length);
  const n=tokens.length, m=sentences.length;
  const variance=avg(lens)?sd(lens)/avg(lens):0;
  const diversity=ttr(tokens);
  const repeatedTrigrams=ngramRepeats(tokens,3);
  const repeatedLong=ngramRepeats(tokens,5);
  const lower=plain.toLocaleLowerCase();
  const patterns=phraseHits(lower);
  const formulaWeight=patterns.reduce((sum,p)=>sum+p.weight*p.count,0);
  const uniqueFormula=patterns.length;
  const transitionHits=patterns.reduce((sum,p)=>sum+p.count,0);
  const paras=plain.split(/\n\s*\n/).filter(x=>x.trim());
  const contentWords=tokens.filter(t=>t.length>=4&&!STOP.has(t));
  const buzzHits=contentWords.filter(t=>BUZZ.has(t)).length;
  const starts=new Map();
  for(const sent of sentences){
    const w=wordsOf(sent.text).map(t=>t.toLowerCase());
    if(w.length<4)continue;
    const start=w.slice(0,2).join(' ');
    starts.set(start,(starts.get(start)||0)+1);
  }
  const duplicateStarts=[...starts.values()].reduce((sum,k)=>sum+Math.max(0,k-1),0)/Math.max(m,1);
  const openings=[...starts.values()].filter(k=>k>=3).length;
  // Format alone is not authorship evidence: uniformity only matters alongside other strong signals.
  const cadenceValue=m>=8&&avg(lens)>=9?clamp((.46-variance)/.30):0;
  const weakLexical=n>=160?clamp((.65-diversity)/.24):0;
  const concrete=(wordList.filter(w=>/\d/.test(w)).length + (plain.match(/[“”"«»]/g)||[]).length/2)/Math.max(n,1)*100;
  const firstPerson=wordList.filter(w=>/^(i|me|mine|my|we|us|our|i'm|i've)$/i.test(w)).length/Math.max(n,1)*100;
  const informal=(plain.match(/\b(?:gonna|wanna|lol|btw|idk|kinda|sorta|ain't)\b|[!?]{2,}/gi)||[]).length/Math.max(n,1)*100;
  const components=[
    {key:'formulaic',label:'Stock AI-associated phrasing',value:clamp((formulaWeight/Math.max(n,100)*100-.22)/2.0),weight:27,description:'Distinctive stock phrases; some occur in human writing too'},
    {key:'longrepeats',label:'Repeated long phrases',value:clamp((repeatedLong-.002)/.040),weight:23,description:'Repeated sequences of five words across the document'},
    {key:'structure',label:'Repeated openings',value:clamp((duplicateStarts-.13)/.30)*clamp(m/10),weight:17,description:'Multiple sentences beginning with the same two words'},
    {key:'buzzwords',label:'Generic promotional language',value:clamp((buzzHits/Math.max(n,1)*100-.22)/1.7),weight:12,description:'Stock abstract language without inherent authorship meaning'},
    {key:'lexical',label:'Vocabulary recycling',value:weakLexical,weight:9,description:'Lower word diversity in 50-word windows; genre dependent'},
    {key:'cadence',label:'Unusually even cadence',value:cadenceValue,weight:7,description:'Similar sentence lengths over at least eight sentences'},
    {key:'trigrams',label:'Short phrase recycling',value:clamp((repeatedTrigrams-.012)/.075),weight:5,description:'Repeated three-word phrases; weak indicator by itself'}
  ];
  const meaningful=components.filter(c=>c.value>=.4).length;
  const raw=components.reduce((sum,c)=>sum+c.value*c.weight,0);
  // Avoid letting a single innocuous characteristic dominate the score.
  const adjusted=meaningful<=1?Math.min(raw,25):meaningful===2?Math.min(raw,54):raw;
  const balance=clamp(concrete/7,0,.17)+clamp(firstPerson/11,0,.08)+clamp(informal/4,0,.08);
  const dampened=adjusted*(1-balance);
  // Convert observed writing-pattern strength to a probability-*like* estimate.
  // The sigmoid is an explicit assumption, NOT fitted/calibrated on labeled AI
  // and human text. Short documents shrink toward 50% (inconclusive evidence).
  // Hence "estimated probability" means an uncalibrated style-based estimate,
  // NOT the objectively measured chance that an AI wrote these words.
  const patternScore=Math.round(clamp(dampened,0,100));
  const unshrunk=100/(1+Math.exp(-(dampened-40)/11));
  const sampleStrength=clamp((n-30)/270);
  const score=Math.round(50+(unshrunk-50)*sampleStrength);
  const warning=n<70?'Very low evidence — near 50% means inconclusive':n<150?'Low evidence — short sample, estimate pulled toward 50%':n<220?'Limited evidence — interpret percentage cautiously':n<400?'Moderate text length — estimate uncalibrated':'Longer sample — estimate remains uncalibrated';
  const latinCount=(plain.match(/[A-Za-z]/g)||[]).length;
  const alphaCount=(plain.match(/\p{L}/gu)||[]).length;
  const nonEnglish=alphaCount>0&&latinCount/alphaCount<.7;
  const evidence=warning+(nonEnglish?' · non-Latin-language scoring unvalidated':'');
  const sentenceEvidence=sentences.map(sent=>{
    const t=sent.text.toLocaleLowerCase(),w=wordsOf(t),length=w.length;
    const localFormula=phraseHits(t).reduce((sum,p)=>sum+p.weight*p.count,0);
    const localBuzz=w.filter(x=>BUZZ.has(x)).length;
    const start=w.slice(0,2).join(' ');
    const opening=starts.get(start)||0;
    const repeated=length>=5&&lower.indexOf(w.slice(0,5).join(' '))!==lower.lastIndexOf(w.slice(0,5).join(' '));
    const signal=clamp((localFormula*19)+(localBuzz*12)+(opening>=3?18:0)+(repeated?25:0),0,100);
    return {...sent,signal:Math.round(signal)};
  });
  const frequencies=new Map();tokens.forEach(t=>{if(t.length>2&&!STOP.has(t)&&!/\d/.test(t))frequencies.set(t,(frequencies.get(t)||0)+1);});
  const keywords=[...frequencies.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,12).map(([word,count])=>({word,count}));
  return {score,aiProbabilityEstimate:score,calibrated:false,patternScore,sampleStrength:Math.round(sampleStrength*100),evidence,wordCount:n,charCount:plain.length,charactersNoSpaces:plain.replace(/\s/g,'').length,sentenceCount:m,paragraphCount:paras.length,readingMinutes:n/225,speakingMinutes:n/145,averageSentence:Math.round(avg(lens)*10)/10,sentenceVariation:Math.round(variance*100),diversity:Math.round(diversity*100),repeatedTrigrams:Math.round(repeatedTrigrams*100),repeatedLongPhrases:Math.round(repeatedLong*100),transitions:transitionHits,distinctFormulae:uniqueFormula,components,keywords,sentences:sentenceEvidence,plain,generatedAt:new Date().toISOString(),method:'NoGPT v3 style-based AI probability estimate: logistic mapping plus short-sample shrinkage. NOT empirically calibrated or validated.'};
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
