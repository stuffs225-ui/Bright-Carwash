import {describe,it,expect,vi,afterEach} from "vitest";
import {serverUncachedFetch} from "./serverUncachedFetch";
afterEach(()=>vi.unstubAllGlobals());
describe("private Supabase server fetch",()=>{
 it("forces no-store while preserving headers, authorization and method",async()=>{
  const fake=vi.fn(async()=>new Response("ok"));
  vi.stubGlobal("fetch",fake);
  await serverUncachedFetch("https://example.invalid/private",{
   method:"POST",headers:{authorization:"Bearer synthetic-only"},
   cache:"force-cache"
  });
  expect(fake).toHaveBeenCalledOnce();
  expect(fake.mock.calls[0][0]).toBe("https://example.invalid/private");
  expect(fake.mock.calls[0][1]).toEqual(expect.objectContaining({
   method:"POST",headers:{authorization:"Bearer synthetic-only"},cache:"no-store"
  }));
 });
});
