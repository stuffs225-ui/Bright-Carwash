/** Dedicated backend fetch: never let Next's request cache retain customer records,
 * storage artifacts, or service-role API responses. */
export function serverUncachedFetch(input:RequestInfo | URL, init?:RequestInit):Promise<Response>{
 return fetch(input,{...init,cache:"no-store"});
}
