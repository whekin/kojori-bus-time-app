// Generated from gzaap-backend/src/contracts.ts; run backend scripts/sync-contract.ts.
/** Versioned Gzaap wire contract. Times are absolute Unix milliseconds. */
export const GZAAP_CONTRACT_VERSION = 1 as const;
export type PassedEarlyWireCard = {
 id:string;routeId:string;pattern:string;stopId:string;scheduledAt:number;
 passedFrom:number;passedTo:number;expiresAt:number;timetableSource:'confirmed_dates'|'weekly';
 modelVersion?:string;catalogVersion?:string;decisionAt?:number;evidenceFreshAt?:number;
};
export type PassedEarlyWireResponse = {
 version:1;source:'gzaap_passage';policyVersion:2;state:'ready'|'disabled'|'unavailable';
 serverTime:number;validUntil:number;cards:PassedEarlyWireCard[];
};
export type EtaWirePrediction = {
 source:'gzaap_shadow';arrivalFrom:number;arrivalTo:number;sourceFreshAt:number;
 modelKey:string;catalogKey:string;modelCutoff:number;sampleJourneys:number;validUntil:number;
};
export type EtaWireResponse = {
 version:1;state:'disabled'|'shadow';serverTime:number;validUntil:number;predictions:EtaWirePrediction[];
};
