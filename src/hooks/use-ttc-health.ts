import { useSyncExternalStore } from 'react';

export type TtcHealthStatus = 'healthy' | 'degraded' | 'offline' | 'rate-limited';

interface TtcHealthState {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  consecutiveFailures: number;
  isRateLimited: boolean;
}

interface TtcHealthSnapshot extends TtcHealthState {
  status: TtcHealthStatus;
}

const listeners = new Set<() => void>();

const state: TtcHealthState = {
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  isRateLimited: false,
};

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;
let statusTimer: ReturnType<typeof setTimeout> | null = null;
let currentSnapshot: TtcHealthSnapshot = {
  status: 'healthy',
  lastSuccessAt: null,
  lastFailureAt: null,
  consecutiveFailures: 0,
  isRateLimited: false,
};

function emit() {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function deriveStatus(now: number): TtcHealthStatus {
  if (state.isRateLimited) {
    return 'rate-limited';
  }

  const hasFailure = state.lastFailureAt !== null;
  const hasRecentSuccess = state.lastSuccessAt !== null && now - state.lastSuccessAt < OFFLINE_THRESHOLD_MS;

  let status: TtcHealthStatus = 'healthy';
  if (hasFailure && !hasRecentSuccess) {
    status = 'offline';
  } else if (hasFailure && hasRecentSuccess) {
    status = 'degraded';
  }

  return status;
}

function updateSnapshot(now = Date.now()) {
  const nextSnapshot: TtcHealthSnapshot = {
    status: deriveStatus(now),
    lastSuccessAt: state.lastSuccessAt,
    lastFailureAt: state.lastFailureAt,
    consecutiveFailures: state.consecutiveFailures,
    isRateLimited: state.isRateLimited,
  };

  const changed =
    nextSnapshot.status !== currentSnapshot.status ||
    nextSnapshot.lastSuccessAt !== currentSnapshot.lastSuccessAt ||
    nextSnapshot.lastFailureAt !== currentSnapshot.lastFailureAt ||
    nextSnapshot.consecutiveFailures !== currentSnapshot.consecutiveFailures;

  if (changed) {
    currentSnapshot = nextSnapshot;
    emit();
  }
}

function scheduleStatusTransition() {
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  if (
    state.lastFailureAt === null ||
    state.lastSuccessAt === null ||
    state.lastFailureAt <= state.lastSuccessAt
  ) {
    return;
  }

  const elapsed = Date.now() - state.lastSuccessAt;
  if (elapsed >= OFFLINE_THRESHOLD_MS) return;

  statusTimer = setTimeout(() => {
    updateSnapshot();
    scheduleStatusTransition();
  }, OFFLINE_THRESHOLD_MS - elapsed + 50);
}

function getSnapshot() {
  return currentSnapshot;
}

function getServerSnapshot() {
  return currentSnapshot;
}

export function reportTtcSuccess() {
  state.lastSuccessAt = Date.now();
  state.consecutiveFailures = 0;
  state.isRateLimited = false;
  updateSnapshot(state.lastSuccessAt);
  scheduleStatusTransition();
}

export function reportTtcFailure(isRateLimited = false) {
  state.lastFailureAt = Date.now();
  state.consecutiveFailures += 1;
  state.isRateLimited = isRateLimited;
  updateSnapshot(state.lastFailureAt);
  scheduleStatusTransition();
}

export function useTtcHealth() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
