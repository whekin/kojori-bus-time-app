/** Recheck if a native timer fires slightly early; never wait for the next poll. */
export function watchDeadline(deadline:number,onExpire:(now:number)=>void,clock=()=>Date.now(),schedule=(callback:()=>void,delay:number)=>{
 const timer=setTimeout(callback,delay);return ()=>clearTimeout(timer);
}) {
 let disposed=false,cancel=()=>{};
 const check=()=>{if(disposed)return;const now=clock();if(now<deadline)cancel=schedule(check,Math.max(1,deadline-now));else onExpire(now);};
 cancel=schedule(check,Math.max(0,deadline-clock()));
 return ()=>{disposed=true;cancel();};
}

/** Deadline ticks may lead the 15s parent clock; discard them after a wall-clock reset. */
export function displayNow(parentNow:number,deadlineNow:number){
 return deadlineNow>=parentNow&&deadlineNow-parentNow<=30000?deadlineNow:parentNow;
}
