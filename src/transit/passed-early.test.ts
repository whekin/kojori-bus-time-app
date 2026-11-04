// @ts-expect-error Bun provides the test module at runtime.
import {expect,test} from 'bun:test';
import {decodePassedEarly,selectPassedEarly,removePassedSlots,watchPassedEarlyExpiry} from './passed-early';
import type {Boarding,TransitDeparture} from './model';
const b:Boarding={route:{id:'1:R98445',shortName:'316',longName:'',mode:'BUS'},pattern:{patternSuffix:'0:01',headsign:'Tbilisi'},stop:{id:'1:3078',label:'Kojori'}};
const time=Date.parse('2026-11-04T10:00:00+04:00'),now=time-30000;
const row:TransitDeparture={key:'scheduled',boarding:b,epochMs:time,scheduledEpochMs:time,live:false,confirmed:true};
function response(){return {version:1,state:'ready',serverTime:now,validUntil:time+10000,cards:[{id:'card',routeId:b.route.id,pattern:b.pattern.patternSuffix,stopId:b.stop.id,scheduledAt:time,expiresAt:time,passedFrom:time-11*60000,passedTo:time-9*60000,timetableSource:'weekly'}]};}
test('only the matching scheduled slot is removed and the card disappears at official time',()=>{
 const data=decodePassedEarly(response(),b,now,now);
 expect(selectPassedEarly(data,false,[row],time-1)).toHaveLength(1);
 const cards=selectPassedEarly(data,false,[row],now);
 expect(removePassedSlots([row,{...row,key:'next',epochMs:time+600000,scheduledEpochMs:time+600000}],cards).map(r=>r.key)).toEqual(['next']);
 expect(selectPassedEarly(data,false,[row],time)).toEqual([]);
 expect(selectPassedEarly(data,true,[row],now)).toEqual([]);
 expect(selectPassedEarly(data,false,[{...row,scheduledEpochMs:time+60000}],now)).toEqual([]);
});
test('transport age is deducted and malformed or cross-direction claims are rejected',()=>{
 const data=decodePassedEarly(response(),b,now,now+2000);
 expect(data.cards[0].hideAt).toBe(time);
 expect(selectPassedEarly(data,false,[row],data.validUntil)).toEqual([]);
 const invalid=response();invalid.cards[0].pattern='1:01';expect(()=>decodePassedEarly(invalid,b,now,now)).toThrow();
 const late=response();late.cards[0].passedTo=time+1;expect(()=>decodePassedEarly(late,b,now,now)).toThrow();
});
test('an early native timer rechecks the deadline and cancelled timers cannot expire a new card',()=>{
 let clock=98,calls=0;const timers:(()=>void)[]=[],delays:number[]=[];
 const cancel=watchPassedEarlyExpiry(100,()=>{calls++;},()=>clock,(cb,delay)=>{timers.push(cb);delays.push(delay);return ()=>{};});
 timers[0]();expect(calls).toBe(0);expect(delays).toEqual([2,2]);
 clock=100;timers[1]();expect(calls).toBe(1);
 cancel();timers[1]();expect(calls).toBe(1);
});

test('schedule identity survives floating point ETA conversion without hiding an unanchored live row',()=>{
 const data=decodePassedEarly(response(),b,now,now);
 const cards=selectPassedEarly(data,false,[row],now);
 const converted={...row,scheduledEpochMs:time+0.00025};
 const live={...row,key:'unanchored-live',live:true};
 expect(removePassedSlots([converted,live],cards).map(r=>r.key)).toEqual(['unanchored-live']);
});
