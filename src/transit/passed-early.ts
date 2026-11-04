import {GZAAP_CONTRACT_VERSION,type PassedEarlyWireResponse} from './gzaap-contract';
import type {Boarding,TransitDeparture} from './model';
const enabledPatterns=(process.env.EXPO_PUBLIC_GZAAP_PASSED_PATTERNS??'').split(',').map(s=>s.trim()).filter(Boolean);
export function passedEarlyBoardingEnabled(boarding:Boarding){return !enabledPatterns.length||enabledPatterns.includes(boarding.route.id+'/'+boarding.pattern.patternSuffix);}
export const passedEarlyEnabled=process.env.EXPO_PUBLIC_GZAAP_PASSED_EARLY==='true';
const base=process.env.EXPO_PUBLIC_GZAAP_API_URL??'https://gzaap-api.whekin.dev';
export type PassedEarlyCard={id:string;departureKey?:string;boarding:Boarding;scheduledAt:number;passedFrom:number;passedTo:number;hideAt:number;timetableSource:'confirmed_dates'|'weekly'};
export type PassedEarlyResponse={state:'ready'|'disabled'|'unavailable';validUntil:number;cards:PassedEarlyCard[]};
export function decodePassedEarly(value:unknown,boarding:Boarding,started:number,received:number):PassedEarlyResponse {
 if(!value||typeof value!=='object')throw new Error('Invalid passed-early response');
 const v=value as Record<string,unknown>;
 const number=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
 if(v.version!==GZAAP_CONTRACT_VERSION||!['ready','disabled','unavailable'].includes(String(v.state))||!number(v.serverTime)||!number(v.validUntil)||v.validUntil>v.serverTime+60000||!Array.isArray(v.cards)||v.cards.length>4)throw new Error('Invalid passed-early response');
 const serverTime=v.serverTime,roundTrip=Math.max(0,received-started);
 const validUntil=received+(v.validUntil-serverTime)-roundTrip;
 const cards=v.cards.map((raw:unknown)=>{
  if(!raw||typeof raw!=='object')throw new Error('Invalid passed-early card');
  const c=raw as Record<string,unknown>;
  if(typeof c.id!=='string'||!c.id||c.id.length>512||c.routeId!==boarding.route.id||c.pattern!==boarding.pattern.patternSuffix||c.stopId!==boarding.stop.id||
    !number(c.scheduledAt)||!number(c.passedFrom)||!number(c.passedTo)||c.expiresAt!==c.scheduledAt||c.passedFrom>c.passedTo||c.passedTo>serverTime||c.passedTo>=c.scheduledAt||c.scheduledAt-c.passedFrom>900000||!['confirmed_dates','weekly'].includes(String(c.timetableSource)))throw new Error('Invalid passed-early card');
  return {id:c.id,boarding,scheduledAt:c.scheduledAt,passedFrom:c.passedFrom,passedTo:c.passedTo,hideAt:received+(c.scheduledAt-serverTime)-roundTrip,timetableSource:c.timetableSource as PassedEarlyCard['timetableSource']};
 });
 return {state:v.state as PassedEarlyWireResponse['state'],validUntil,cards};
}
export async function fetchPassedEarly(boarding:Boarding,signal?:AbortSignal) {
 const started=Date.now(),controller=new AbortController();
 const abort=()=>controller.abort();if(signal?.aborted)abort();signal?.addEventListener('abort',abort);
 const timeout=setTimeout(abort,8000);
 try {
  const query=`routeId=${encodeURIComponent(boarding.route.id)}&pattern=${encodeURIComponent(boarding.pattern.patternSuffix)}&stopId=${encodeURIComponent(boarding.stop.id)}`;
  const response=await fetch(`${base.replace(/\/$/,'')}/v1/passed-early?${query}`,{signal:controller.signal});
  if(!response.ok)throw new Error(`Gzaap passed-early HTTP ${response.status}`);
  return decodePassedEarly(await response.json(),boarding,started,Date.now());
 } finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
function sameSlot(row:TransitDeparture,card:PassedEarlyCard) {
 return row.boarding.route.id===card.boarding.route.id&&row.boarding.pattern.patternSuffix===card.boarding.pattern.patternSuffix&&row.boarding.stop.id===card.boarding.stop.id&&Math.abs(row.scheduledEpochMs-card.scheduledAt)<1;
}
export function selectPassedEarly(response:PassedEarlyResponse|undefined,isError:boolean,scheduled:TransitDeparture[],now:number) {
 if(isError||!response||response.state!=='ready'||now>=response.validUntil)return [];
 // A newer local timetable can invalidate a server snapshot: never hide a different slot.
 return response.cards.flatMap(card=>{
  const slot=scheduled.find(row=>sameSlot(row,card));
  return now<card.hideAt&&slot?[{...card,departureKey:slot.key}]:[];
 });
}
export function removePassedSlots(rows:TransitDeparture[],cards:PassedEarlyCard[]) {
 return rows.filter(row=>!cards.some(card=>card.departureKey===row.key&&row.boarding.route.id===card.boarding.route.id&&row.boarding.pattern.patternSuffix===card.boarding.pattern.patternSuffix&&row.boarding.stop.id===card.boarding.stop.id));
}

/** Recheck if a native timer fires slightly early; never wait for the next poll. */
export function watchPassedEarlyExpiry(deadline:number,onExpire:(now:number)=>void,clock=()=>Date.now(),schedule=(callback:()=>void,delay:number)=>{
 const timer=setTimeout(callback,delay);return ()=>clearTimeout(timer);
}) {
 let disposed=false,cancel=()=>{};
 const check=()=>{if(disposed)return;const now=clock();if(now<deadline)cancel=schedule(check,Math.max(1,deadline-now));else onExpire(now);};
 cancel=schedule(check,Math.max(0,deadline-clock()));
 return ()=>{disposed=true;cancel();};
}
