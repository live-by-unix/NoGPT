/**
 * Model-based, client-side inference. The classifier sees text only as local JS
 * input; its weights and the inference runtime are downloaded as static assets.
 * On download/inference failure, NEVER substitute a heuristic percentage.
 *
 * Model: Oxidane/tmr-ai-text-detector (MIT), ONNX export by onnx-community.
 * Runtime: Transformers.js 3.8.1. Attribution and limitations are in README.
 */
import {cleanMarkdown, wordsOf, sentencesOf} from './detector.js';

export const MODEL_ID='onnx-community/tmr-ai-text-detector-ONNX';
export const MIN_WORDS=120;
export const MAX_WINDOWS=8;
export const RUNTIME_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let pending=null;

const ENGLISH=new Set('the and this that with from have were been they their would could should about into between through because however also which what when then these those each another your while there here being people some after before how why where who did does doing than more most only many much such using them its our was are for but not one two three may can will'.split(' '));
const round=x=>Math.round(x*1000)/1000;
export function assessText(input,{markdown=false}={}){
  const plain=markdown?cleanMarkdown(input):String(input??'');
  const words=wordsOf(plain);
  if(words.length<MIN_WORDS)return {ok:false,plain,wordCount:words.length,reason:`At least ${MIN_WORDS} words are needed for model scoring. This text has ${words.length}; no percentage is shown.`};
  const letters=(plain.match(/\p{L}/gu)||[]).length;
  const latin=(plain.match(/[a-z]/gi)||[]).length;
  const stopRate=words.filter(x=>ENGLISH.has(x.toLowerCase())).length/words.length;
  if(!letters||latin/letters<.85||stopRate<.045){return {ok:false,plain,wordCount:words.length,reason:'This model was trained mainly on English. Language/genre coverage is uncertain; no percentage is shown for this input.'};}
  return {ok:true,plain,wordCount:words.length};
}

/** Chunk into sentence-boundary windows to avoid silently truncating long docs.
 * Every chunk is <= ~200 whitespace words, safely below 512 BPE tokens for
 * most standard English prose; the tokenizer additionally hard-truncates.
 * We disclose exact words submitted and sampling coverage to the user.
 */
export function makeWindows(plain,{maxWords=180,maxWindows=MAX_WINDOWS}={}){
  const spans=sentencesOf(plain);
  const windows=[];
  let current='',count=0;
  const flush=()=>{if(count){windows.push({text:current.trim(),words:count});current='';count=0;}};
  for(const sentence of spans){
    const text=sentence.text.trim();
    if(!text)continue;
    const w=wordsOf(text);
    if(w.length>maxWords){
      flush();
      for(let i=0;i<w.length;i+=maxWords){const part=w.slice(i,i+maxWords);windows.push({text:part.join(' '),words:part.length});}
      continue;
    }
    if(count+w.length>maxWords)flush();
    current+=(current?' ':'')+text;count+=w.length;
  }
  flush();
  if(!windows.length)return [];
  if(windows.length<=maxWindows)return windows;
  // Deterministic coverage across the whole document, not only the beginning.
  const selected=new Set();
  for(let i=0;i<maxWindows;i++)selected.add(Math.round(i*(windows.length-1)/(maxWindows-1)));
  return [...selected].sort((a,b)=>a-b).map(i=>({...windows[i],windowIndex:i+1,totalWindows:windows.length}));
}

export function aiProbabilityFromOutputs(outputs){
  const arr=(Array.isArray(outputs)?outputs:[outputs]).flat(Infinity);
  const valid=arr.filter(x=>x&&typeof x.score==='number'&&Number.isFinite(x.score)&&x.score>=0&&x.score<=1);
  if(!valid.length)throw new Error('The model returned no valid classification scores.');
  const ai=valid.find(x=>/^(ai|ai.generated|fake|label_1)$/i.test(String(x.label)));
  const human=valid.find(x=>/^(human|real|label_0)$/i.test(String(x.label)));
  if(ai)return ai.score;
  if(human)return 1-human.score;
  throw new Error('Unknown model label. Expected ai/human; refusing to invent a percentage.');
}

// Weight by the number of words actually evaluated. Model softmax values are
// classifier scores, not probabilities calibrated to all writing populations.
export function combineWindows(scores){
  if(!scores.length)throw new Error('No model windows were evaluated.');
  const total=scores.reduce((a,x)=>a+x.words,0);
  if(!total)throw new Error('No text was evaluated.');
  const mean=scores.reduce((a,x)=>a+x.probability*x.words,0)/total;
  const disagreement=Math.max(...scores.map(x=>x.probability))-Math.min(...scores.map(x=>x.probability));
  return {score:Math.round(mean*100),modelFraction:round(mean),disagreement:round(disagreement),evaluatedWords:total,windows:scores};
}

export async function getClassifier(progress=()=>{}){
  if(!pending){
    pending=(async()=>{
      progress('Downloading on-device AI model (~125 MB) and runtime. Text stays local…');
      const {pipeline,env}=await import(/* @vite-ignore */ RUNTIME_URL);
      env.allowLocalModels=false;
      // CPU WASM single-threaded mode works without SharedArrayBuffer / cross-origin isolation.
      if(env.backends?.onnx?.wasm)env.backends.onnx.wasm.numThreads=1;
      // Models are downloaded from Hugging Face as static files; inference is local.
      return pipeline('text-classification',MODEL_ID,{device:'wasm',dtype:'q8',progress_callback:event=>{
        if(event?.status==='progress'&&event.total){progress(`Downloading model ${Math.round(event.progress||event.loaded/event.total*100)}%…`);}
        else if(event?.status==='initiate')progress('Preparing local inference assets…');
        else if(event?.status==='ready')progress('Model downloaded. Initializing local inference…');
      }});
    })().catch(e=>{pending=null;throw e;});
  }
  return pending;
}

export async function runModel(input,{markdown=false,progress=()=>{},classifier}={}){
  const gate=assessText(input,{markdown});
  if(!gate.ok)return {ok:false,wordCount:gate.wordCount,reason:gate.reason,modelId:MODEL_ID};
  const windows=makeWindows(gate.plain);
  if(!windows.length)return {ok:false,wordCount:gate.wordCount,reason:'No text windows could be created.',modelId:MODEL_ID};
  const pipe=classifier||await getClassifier(progress);
  const scores=[];
  for(let i=0;i<windows.length;i++){
    progress(`Analyzing locally: passage ${i+1} of ${windows.length}…`);
    const items=await pipe(windows[i].text,{top_k:null,truncation:true,max_length:512});
    scores.push({index:i+1,words:windows[i].words,probability:aiProbabilityFromOutputs(items)});
  }
  const combined=combineWindows(scores);
  return {ok:true,modelId:MODEL_ID,wordCount:gate.wordCount, ...combined,coverage:round(combined.evaluatedWords/gate.wordCount),
    evidence:combined.disagreement>.55?'Passages disagree strongly; interpret with caution':combined.coverage<.95?'Sampled passages across document; not all words were scored':'Scored all readable passages',
    method:'TMR RoBERTa-base ONNX q8, run on-device. Score is aggregated model softmax (not calibrated author probability).'};
}
