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
/** Preview policy. sourceFreshAt is TTC response receipt, not a GPS-fix time. */
export const ETA_LIMITS = {
 maxSourceAgeMs:180000, maxModelAgeMs:25200000, maxSnapshotAgeMs:45000,
 maxResponseLifetimeMs:30000, maxHorizonMs:1800000, maxPredictions:4,
} as const;
export type EtaBoarding = {routeId:string;pattern:string;stopId:string};
export const ETA_UNAVAILABLE_REASONS=['feature_disabled','pattern_disabled','unsupported_stop',
 'catalog_unavailable','collector_stale','processor_stale','model_unavailable',
 'model_stale','no_fresh_predictions'] as const;
export type EtaUnavailableReason=typeof ETA_UNAVAILABLE_REASONS[number];
export type EtaWirePrediction = EtaBoarding & {
 id:string;vehicleId:string;source:'gzaap_shadow';arrivalFrom:number;arrivalTo:number;
 sourceFreshAt:number;generatedAt:number;modelKey:string;catalogKey:string;
 modelCutoff:number;sampleJourneys:number;stratum:'hour_day'|'day'|'route';validUntil:number;
};
export type EtaWireResponse = {
 version:1;mode:'preview';coverage:'partial';boarding:EtaBoarding;
 state:'disabled'|'unavailable'|'cold_start'|'unsupported'|'ready';
 reason:EtaUnavailableReason|null;serverTime:number;validUntil:number;
 predictions:EtaWirePrediction[];
};
