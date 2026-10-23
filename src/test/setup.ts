import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { configureApi, resetApiConfig } from '@/api/client';
import { preloadAllPages } from '@/app/lazyPages';
import { resetAuthServer } from '@/api/authApi';
import { resetMockServer } from '@/api/mockDb';
import { resetQuestionServer } from '@/api/questionsApi';
import { resetReviewServer } from '@/api/reviewsApi';
import { installMatchMedia, resetMatchMedia } from './matchMedia';

/** Every test runs on this date, so "new arrival" and other date rules give the same answer. */
export const TEST_NOW = new Date('2026-10-07T19:00:00Z');

installMatchMedia();

// jsdom does not implement scrolling; the router's ScrollRestoration calls it.
window.scrollTo = () => {};

// Pages that load on demand in the app are loaded up front here, so a test can
// render any route and query it straight away. lazyPage.test.tsx covers the loading itself.
beforeAll(() => preloadAllPages());

beforeEach(() => {
  // Only the clock is faked; timers stay real so user events and waitFor work as usual.
  vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW });
  // The pretend API answers instantly and never fails unless a test asks it to.
  configureApi({ latency: { min: 0, max: 0 }, failureRate: 0 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetApiConfig();
  // Orders taken in one test must not use up stock in the next.
  resetMockServer();
  resetAuthServer();
  resetReviewServer();
  resetQuestionServer();
  localStorage.clear();
  sessionStorage.clear();
  resetMatchMedia();
});
