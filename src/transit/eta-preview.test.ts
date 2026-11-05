// @ts-expect-error Bun provides the test module at runtime.
import {expect,test} from 'bun:test';
import {decodeEtaPreview,selectEtaPreview,etaMinutes,createEtaPreviewFetcher,etaPreviewEnabled,etaPreviewBoardingEnabled} from './eta-preview';
import {displayNow} from './deadline';
import type {Boarding} from './model';
const b:Boarding={route:{id:'1:R98445',shortName:'316',longName:'',mode:'BUS'},pattern:{patternSuffix:'0:01',headsign:'Tbilisi'},stop:{id:'1:3078',label:'Kojori'}};
const now=Date.parse('2026-11-05T10:00:00Z');
function wire(){return {version:1,mode:'preview',coverage:'partial',boarding:{routeId:b.route.id,pattern:b.pattern.patternSuffix,stopId:b.stop.id},state:'ready',reason:null,serverTime:now,validUntil:now+20000,predictions:[{id:'eta1',routeId:b.route.id,pattern:b.pattern.patternSuffix,stopId:b.stop.id,vehicleId:'bus1',source:'gzaap_shadow',arrivalFrom:now+120000,arrivalTo:now+240000,sourceFreshAt:now-30000,generatedAt:now-10000,modelKey:'model1',catalogKey:'catalog1',modelCutoff:now-3600000,sampleJourneys:6,stratum:'route',validUntil:now+20000}]};}
test('ETA preview defaults off and arbitrary routes cannot activate it',()=>{
 expect(etaPreviewEnabled).toBe(false);expect(etaPreviewBoardingEnabled(b)).toBe(true);
 expect(etaPreviewBoardingEnabled({...b,route:{...b.route,id:'other'}})).toBe(false);
});
test('server clock offset and network time preserve absolute intervals and conservative local expiry',()=>{
 const local=now+5*3600000,data=decodeEtaPreview(wire(),b,local,local+2000,2000),p=data.predictions[0];
 expect(p.arrivalFrom).toBe(now+120000);expect(p.fromLocal).toBe(local+120000);expect(p.toLocal).toBe(local+242000);
 expect(p.hideAt).toBe(local+20000);expect(p.receivedPositionLocal).toBe(local-30000);
 expect(selectEtaPreview(data,false,local+19999)).toHaveLength(1);expect(selectEtaPreview(data,false,local+20000)).toEqual([]);
 expect(etaMinutes(p,local+2000)).toEqual({from:1,to:4,ageSeconds:32});
});
test('errors, expiry, no data and backward clock jumps leave the preview empty for TTC fallback',()=>{
 const data=decodeEtaPreview(wire(),b,now,now);
 expect(selectEtaPreview(data,true,now)).toEqual([]);expect(selectEtaPreview(undefined,false,now)).toEqual([]);
 expect(selectEtaPreview(data,false,now-1)).toEqual([]);
 for(const state of ['disabled','unavailable','cold_start','unsupported']){
  const v={...wire(),state,reason:'no_fresh_predictions',predictions:[]};
  expect(selectEtaPreview(decodeEtaPreview(v,b,now,now),false,now)).toEqual([]);
 }
 expect(()=>decodeEtaPreview(wire(),b,now,now-10000,100)).toThrow();
});
test('wrong boardings, stale evidence and invalid intervals reject the whole response',()=>{
 const mutations:((v:ReturnType<typeof wire>)=>void)[]=[v=>{v.boarding.stopId='1:2994';},v=>{v.predictions[0].pattern='1:01';},v=>{v.predictions[0].stopId='1:2994';},v=>{v.predictions[0].arrivalFrom=now+300000;},v=>{v.predictions[0].sourceFreshAt=now-180001;},v=>{v.predictions[0].generatedAt=now-45001;},v=>{v.predictions[0].modelCutoff=now+1;},v=>{v.predictions[0].sampleJourneys=4;},v=>{v.predictions[0].validUntil=now+30001;},v=>{v.predictions.push({...v.predictions[0]});}];
 for(const mutate of mutations){const value=wire();mutate(value);expect(()=>decodeEtaPreview(value,b,now,now)).toThrow();}
});
test('a delayed response cannot display an already expired estimate',()=>{
 const data=decodeEtaPreview(wire(),b,now,now+21000,21000);expect(selectEtaPreview(data,false,now+21000)).toEqual([]);
});
test('disabled or unsupported fetches make no network request',async()=>{
 let calls=0;const deps={enabled:false,baseUrl:'https://test.invalid',now:()=>now,monotonic:()=>0,fetch:async()=>{calls++;return new Response('{}');}};
 expect((await createEtaPreviewFetcher(deps)(b)).state).toBe('disabled');
 await createEtaPreviewFetcher({...deps,enabled:true})({...b,route:{...b.route,id:'other'}});expect(calls).toBe(0);
});
test('HTTP failure does not retry and cancellation propagates to the request',async()=>{
 let calls=0;const deps={enabled:true,baseUrl:'https://test.invalid',now:()=>now,monotonic:()=>0,fetch:async()=>{calls++;return new Response('{}',{status:503});}};
 await expect(createEtaPreviewFetcher(deps)(b)).rejects.toThrow('HTTP 503');expect(calls).toBe(1);
 const controller=new AbortController();controller.abort();let aborted=false;
 await expect(createEtaPreviewFetcher({...deps,fetch:async(_url,init)=>{aborted=Boolean(init.signal?.aborted);throw new Error('aborted');}})(b,controller.signal)).rejects.toThrow('aborted');expect(aborted).toBe(true);
});
test('fetch uses only the scoped public ETA URL, with no authentication credentials',async()=>{
 let target='',auth:string|null=null;
 const fetcher=createEtaPreviewFetcher({enabled:true,baseUrl:'https://test.invalid/',now:()=>now,monotonic:()=>0,fetch:async(url,init)=>{target=url;auth=new Headers(init.headers).get('Authorization');return Response.json(wire());}});
 expect((await fetcher(b)).predictions).toHaveLength(1);expect(target).toContain('/v1/eta?routeId=1%3AR98445&pattern=0%3A01&stopId=1%3A3078');expect(auth).toBeNull();
});

test('new estimates recover after the device clock moves behind an older deadline tick',()=>{
 const current=displayNow(now,now+3600000),data=decodeEtaPreview(wire(),b,now,now);
 expect(selectEtaPreview(data,false,current)).toHaveLength(1);
 expect(displayNow(now,now+10000)).toBe(now+10000);
});
