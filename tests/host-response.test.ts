import { describe, expect, it } from 'vitest';

import {
  RESPONSE_BADGE_MIN_SAMPLES,
  responseBadgeKey,
  responseBucket,
} from '../src/lib/host-response';

describe('responseBucket', () => {
  it('maps minutes to the right bucket at each boundary', () => {
    expect(responseBucket(0)).toBe('within_hour');
    expect(responseBucket(60)).toBe('within_hour');
    expect(responseBucket(61)).toBe('within_hours');
    expect(responseBucket(360)).toBe('within_hours');
    expect(responseBucket(361)).toBe('within_day');
    expect(responseBucket(1440)).toBe('within_day');
    expect(responseBucket(1441)).toBe('within_days');
  });
});

describe('responseBadgeKey', () => {
  it('hides the badge under the sample threshold', () => {
    expect(responseBadgeKey(30, RESPONSE_BADGE_MIN_SAMPLES - 1)).toBeNull();
    expect(responseBadgeKey(30, 0)).toBeNull();
  });

  it('shows the bucketed key at or above the threshold', () => {
    expect(responseBadgeKey(30, RESPONSE_BADGE_MIN_SAMPLES)).toBe(
      'response.within_hour',
    );
    expect(responseBadgeKey(500, 10)).toBe('response.within_day');
  });

  it('hides the badge when stats are missing (RPC failed)', () => {
    expect(responseBadgeKey(null, 5)).toBeNull();
    expect(responseBadgeKey(30, null)).toBeNull();
    expect(responseBadgeKey(undefined, undefined)).toBeNull();
  });
});
