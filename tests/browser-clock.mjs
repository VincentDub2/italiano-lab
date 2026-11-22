import { readFileSync } from 'node:fs';

// Only preloaded by the isolated test harness. A missing clock file uses wall time.
const path = process.env.ITALIANO_TEST_CLOCK;
if (path) {
 const NativeDate = Date;
 const now = () => {
  try {
   const timestamp=NativeDate.parse(readFileSync(path,'utf8'));
   if (Number.isFinite(timestamp)) return timestamp;
  } catch {}
  return NativeDate.now();
 };
 globalThis.Date = new Proxy(NativeDate,{
  construct(target,args,newTarget) { return Reflect.construct(target,args.length ? args : [now()],newTarget); },
  get(target,property,receiver) { return property==='now' ? now : Reflect.get(target,property,receiver); },
 });
}
