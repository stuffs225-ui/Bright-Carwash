import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
function boot(){
  const listeners=new Map<string,(event:any)=>void>();
  const caching=vi.fn();
  const mockResponse={ok:true,clone:()=>mockResponse};
  const fetching=vi.fn(async()=>mockResponse);
  const cache={match:vi.fn(async(_key?:unknown):Promise<unknown>=>null),put:caching};
  const caches={
    open:vi.fn(async()=>cache),
    keys:vi.fn(async()=>[]),
    delete:vi.fn(async()=>true),
  };
  const self={
    location:{origin:"https://carwash.example"},
    addEventListener:(name:string,fn:(event:any)=>void)=>listeners.set(name,fn),
    skipWaiting:()=>{},
    clients:{claim:()=>{}},
  };
  runInNewContext(source,{self,caches,fetch:fetching,URL});
  return {listeners,caching,fetching,cache};
}
function request(url:string,destination="document",headers=new Headers()){
  return {url,method:"GET",destination,headers};
}
describe("Carwash worker service worker private data isolation",()=>{
  it.each([
    "https://carwash.example/api/users",
    "https://carwash.example/api/backup",
    "https://carwash.example/worker",
    "https://carwash.example/",
    "https://carwash.example/_next/data/private.json",
  ])("never intercepts confidential GET: %s",async url=>{
    const {listeners,caching,fetching}=boot();
    const respondWith=vi.fn();
    listeners.get("fetch")?.({request:request(url),respondWith});
    expect(respondWith).not.toHaveBeenCalled();
    expect(caching).not.toHaveBeenCalled();
    expect(fetching).not.toHaveBeenCalled();
  });
  it("uses network-first navigation for / without ever caching private HTML",async()=>{
    const {listeners,caching,fetching}=boot();
    const respondWith=vi.fn();
    listeners.get("fetch")?.({request:{...request("https://carwash.example/"),mode:"navigate"},respondWith});
    expect(respondWith).toHaveBeenCalledTimes(1);
    await respondWith.mock.calls[0][0];
    expect(fetching).toHaveBeenCalledTimes(1);
    expect(caching).not.toHaveBeenCalled();
  });
  it("falls back ONLY to reviewed public offline.html if home network request fails",async()=>{
    const {listeners,cache,fetching,caching}=boot();
    fetching.mockRejectedValueOnce(Error("network disconnected"));
    const offline={status:200,body:"reviewed public offline HTML"};
    cache.match.mockResolvedValueOnce(offline);
    const respondWith=vi.fn();
    listeners.get("fetch")?.({request:{...request("https://carwash.example/"),mode:"navigate"},respondWith});
    expect(await respondWith.mock.calls[0][0]).toBe(offline);
    expect(caching).not.toHaveBeenCalled();
    expect(cache.match).toHaveBeenCalledWith("/offline.html");
  });
  it("does cache a public static hashed JS asset",async()=>{
    const {listeners,caching}=boot();
    const respondWith=vi.fn();
    listeners.get("fetch")?.({request:request("https://carwash.example/_next/static/chunks/abc.js","script"),respondWith});
    expect(respondWith).toHaveBeenCalledTimes(1);
    await respondWith.mock.calls[0][0];
    expect(caching).toHaveBeenCalledTimes(1);
  });
  it("rejects caching credentials, even on static paths",()=>{
    const {listeners}=boot();
    const respondWith=vi.fn();
    listeners.get("fetch")?.({request:request("https://carwash.example/_next/static/test.js","script",new Headers({"Authorization":"Bearer FAKE"})),respondWith});
    expect(respondWith).not.toHaveBeenCalled();
  });
});
