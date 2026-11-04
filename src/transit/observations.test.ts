// @ts-expect-error Bun provides the test module at runtime.
import { expect, test } from 'bun:test';
import { createObservationSender } from './observations';
const position = {vehicleId:'bus',lat:41.7,lon:44.7,heading:0,nextStopId:'1:3932'};
test('disabled and unsupported observations never send requests', async () => {
 let calls=0;
 const fetcher=(async()=>{calls++;return new Response(null,{status:202});}) as typeof fetch;
 await createObservationSender({enabled:false,baseUrl:'https://example.test',fetch:fetcher,now:()=>100000})('1:R97505','0:01',[position],100000);
 await createObservationSender({enabled:true,baseUrl:'https://example.test',fetch:fetcher,now:()=>100000})('other','0:01',[position],100000);
 expect(calls).toBe(0);
});
test('throttles existing samples without adding any TTC requests or user coordinates', async () => {
 let now=100000;const requests: RequestInit[]=[];
 const sender=createObservationSender({enabled:true,baseUrl:'https://example.test',now:()=>now,fetch:(async(url,init)=>{
  expect(String(url)).toBe('https://example.test/v1/observations/positions');requests.push(init!);return new Response(null,{status:202});
 }) as typeof fetch});
 await sender('1:R97505','0:01',[position],now);await sender('1:R97505','0:01',[position],now);
 expect(requests.length).toBe(1);
 expect(JSON.parse(String(requests[0].body))).toEqual({version:1,routeId:'1:R97505',pattern:'0:01',ageMs:0,positions:[position]});
 now+=30000;await sender('1:R97505','0:01',[position],now);expect(requests.length).toBe(2);
});
test('429 pauses all directions and respects Retry-After', async () => {
 let now=100000,calls=0;
 const sender=createObservationSender({enabled:true,baseUrl:'https://example.test',now:()=>now,fetch:(async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'120'}});}) as typeof fetch});
 await sender('1:R97505','0:01',[position],now);now+=60000;
 await sender('1:R98445','1:01',[position],now);expect(calls).toBe(1);
 now+=60000;await sender('1:R98445','1:01',[position],now);expect(calls).toBe(2);
});
test('upload network errors resolve safely and do not retry immediately', async () => {
 let calls=0;
 const sender=createObservationSender({enabled:true,baseUrl:'https://example.test',now:()=>100000,fetch:(async()=>{calls++;throw new Error('offline');}) as typeof fetch});
 await sender('1:R97505','0:01',[position],100000);await sender('1:R98445','0:01',[position],100000);expect(calls).toBe(1);
});
