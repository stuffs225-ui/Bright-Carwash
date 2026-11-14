/** Navigate to existing manager settings without reloading or losing the session. */
export function openWorkerSettings(workerId?:string) {
 if(typeof window==="undefined")return;
 const target=new URL(window.location.href);
 target.searchParams.set("tab","settings");
 target.searchParams.set("section","workers");
 if(workerId)target.searchParams.set("worker",workerId);
 else target.searchParams.delete("worker");
 window.history.pushState({tab:"settings"},"",target.pathname+target.search+target.hash);
 try{window.localStorage.setItem("bright_carwash_manager_last_tab_v3","settings");}catch{}
 window.dispatchEvent(new PopStateEvent("popstate"));
}
