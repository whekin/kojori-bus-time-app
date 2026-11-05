import {ETA_LIMITS,ETA_UNAVAILABLE_REASONS,GZAAP_CONTRACT_VERSION,type EtaWirePrediction,type EtaWireResponse} from './gzaap-contract';
import type {Boarding} from './model';
export const etaPreviewEnabled=process.env.EXPO_PUBLIC_GZAAP_ETA_PREVIEW==='true';
const scope=(process.env.EXPO_PUBLIC_GZAAP_ETA_PATTERNS??'').split(',').map(s=>s.trim()).filter(Boolean);
const base=process.env.EXPO_PUBLIC_GZAAP_API_URL??'https://gzaap-api.whekin.dev';
const supported=new Set(['1:R97505/0:01','1:R97505/1:01','1:R98445/0:01','1:R98445/1:01']);
export function etaPreviewBoardingEnabled(boarding:Boarding){
 const key=boarding.route.id+'/'+boarding.pattern.patternSuffix;
 return supported.has(key)&&(!scope.length||scope.includes(key));
}
export type EtaPreviewPrediction=EtaWirePrediction&{boarding:Boarding;fromLocal:number;toLocal:number;receivedPositionLocal:number;hideAt:number};
export type EtaPreviewResponse={state:EtaWireResponse['state'];receivedAt:number;validUntil:number;predictions:EtaPreviewPrediction[]};
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const matches=(value:Record<string,unknown>,boarding:Boarding)=>value.routeId===boarding.route.id&&value.pattern===boarding.pattern.patternSuffix&&value.stopId===boarding.stop.id;
/** Map server deadlines conservatively to the phone clock; never bind an ETA to a timetable row. */
export function decodeEtaPreview(value:unknown,boarding:Boarding,startedAt:number,receivedAt:number,elapsedMs=receivedAt-startedAt):EtaPreviewResponse{
 if(!value||typeof value!=='object'||!finite(elapsedMs)||elapsedMs<0||Math.abs(receivedAt-startedAt-elapsedMs)>5000)throw new Error('Invalid ETA response clock');
 const v=value as Record<string,unknown>,b=v.boarding as Record<string,unknown>|undefined;
 if(v.version!==GZAAP_CONTRACT_VERSION||v.mode!=='preview'||v.coverage!=='partial'||!b||!matches(b,boarding)||
  !['ready','disabled','unavailable','cold_start','unsupported'].includes(String(v.state))||
  !finite(v.serverTime)||!finite(v.validUntil)||v.validUntil<=v.serverTime||v.validUntil>v.serverTime+ETA_LIMITS.maxResponseLifetimeMs||
  !Array.isArray(v.predictions)||v.predictions.length>ETA_LIMITS.maxPredictions)throw new Error('Invalid ETA response');
 const ready=v.state==='ready';
 if(ready?(v.reason!==null||!v.predictions.length):(v.predictions.length>0||typeof v.reason!=='string'||!ETA_UNAVAILABLE_REASONS.includes(v.reason as typeof ETA_UNAVAILABLE_REASONS[number])))throw new Error('Invalid ETA response state');
 const serverTime=v.serverTime,serverValidUntil=v.validUntil,deadline=receivedAt+(v.validUntil-serverTime)-elapsedMs;
 const ids=new Set<string>(),vehicles=new Set<string>();
 const predictions=v.predictions.map((raw:unknown):EtaPreviewPrediction=>{
  if(!raw||typeof raw!=='object')throw new Error('Invalid ETA prediction');
  const p=raw as Record<string,unknown>;
  if(!matches(p,boarding)||p.source!=='gzaap_shadow'||!text(p.id,1024)||!text(p.vehicleId,128)||!text(p.modelKey,160)||!text(p.catalogKey,160)||
   !finite(p.arrivalFrom)||!finite(p.arrivalTo)||!finite(p.sourceFreshAt)||!finite(p.generatedAt)||!finite(p.modelCutoff)||!finite(p.validUntil)||
   p.arrivalFrom<serverTime||p.arrivalFrom>p.arrivalTo||p.arrivalTo<=serverTime||p.arrivalTo>serverTime+ETA_LIMITS.maxHorizonMs||
   p.sourceFreshAt>p.generatedAt||p.modelCutoff>p.generatedAt||p.generatedAt>serverTime||
   serverTime-p.sourceFreshAt>ETA_LIMITS.maxSourceAgeMs||serverTime-p.generatedAt>ETA_LIMITS.maxSnapshotAgeMs||serverTime-p.modelCutoff>ETA_LIMITS.maxModelAgeMs||
   p.validUntil<=serverTime||p.validUntil>serverValidUntil||p.validUntil>p.arrivalTo||
   p.validUntil>p.sourceFreshAt+ETA_LIMITS.maxSourceAgeMs||p.validUntil>p.generatedAt+ETA_LIMITS.maxSnapshotAgeMs||p.validUntil>p.modelCutoff+ETA_LIMITS.maxModelAgeMs||
   !finite(p.sampleJourneys)||!Number.isInteger(p.sampleJourneys)||p.sampleJourneys>100000||!['hour_day','day','route'].includes(String(p.stratum))||
   ids.has(p.id)||vehicles.has(p.vehicleId))throw new Error('Invalid ETA prediction');
  const minimum=p.stratum==='hour_day'?8:p.stratum==='day'?6:5;
  if(p.sampleJourneys<minimum)throw new Error('Insufficient ETA evidence');
  ids.add(p.id);vehicles.add(p.vehicleId);
  return {...p as EtaWirePrediction,boarding,fromLocal:receivedAt+(p.arrivalFrom-serverTime)-elapsedMs,toLocal:receivedAt+(p.arrivalTo-serverTime),
   receivedPositionLocal:receivedAt-(serverTime-p.sourceFreshAt)-elapsedMs,hideAt:Math.min(deadline,receivedAt+(p.validUntil-serverTime)-elapsedMs)};
 });
 return {state:v.state as EtaWireResponse['state'],receivedAt,validUntil:deadline,predictions};
}
type FetchDependencies={enabled:boolean;baseUrl:string;fetch:(url:string,init:RequestInit)=>Promise<Response>;now:()=>number;monotonic:()=>number};
export function createEtaPreviewFetcher(deps:FetchDependencies){
 return async(boarding:Boarding,signal?:AbortSignal):Promise<EtaPreviewResponse>=>{
  const startedAt=deps.now();
  if(!deps.enabled||!etaPreviewBoardingEnabled(boarding))return {state:'disabled',receivedAt:startedAt,validUntil:startedAt,predictions:[]};
  const startedMono=deps.monotonic(),controller=new AbortController();
  const abort=()=>controller.abort();if(signal?.aborted)abort();signal?.addEventListener('abort',abort);
  const timeout=setTimeout(abort,8000);
  try{
   const query=`routeId=${encodeURIComponent(boarding.route.id)}&pattern=${encodeURIComponent(boarding.pattern.patternSuffix)}&stopId=${encodeURIComponent(boarding.stop.id)}`;
   const response=await deps.fetch(`${deps.baseUrl.replace(/\/$/,'')}/v1/eta?${query}`,{signal:controller.signal});
   if(!response.ok)throw new Error(`Gzaap ETA HTTP ${response.status}`);
   const value=await response.json();
   return decodeEtaPreview(value,boarding,startedAt,deps.now(),deps.monotonic()-startedMono);
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
 };
}
export const fetchEtaPreview=createEtaPreviewFetcher({enabled:etaPreviewEnabled,baseUrl:base,fetch:(...args)=>fetch(...args),now:()=>Date.now(),monotonic:()=>performance.now()});
export function selectEtaPreview(data:EtaPreviewResponse|undefined,isError:boolean,now:number){
 if(isError||!data||data.state!=='ready'||now<data.receivedAt||now>=data.validUntil)return [];
 return data.predictions.filter(p=>now<p.hideAt);
}
export function etaMinutes(prediction:EtaPreviewPrediction,now:number){
 return {from:Math.max(0,Math.floor((prediction.fromLocal-now)/60000)),to:Math.max(0,Math.ceil((prediction.toLocal-now)/60000)),
  ageSeconds:Math.max(0,Math.floor((now-prediction.receivedPositionLocal)/1000))};
}
