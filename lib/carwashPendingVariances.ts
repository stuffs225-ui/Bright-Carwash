/** Reported network takings minus terminal batch before a settlement exists. */
export function pendingNetworkDifference(actualCard:unknown,terminalTotal:unknown):number {
 const card=Number(actualCard),terminal=Number(terminalTotal);
 if(!Number.isFinite(card)||!Number.isFinite(terminal))return 0;
 return Math.round((card-terminal)*100)/100;
}
