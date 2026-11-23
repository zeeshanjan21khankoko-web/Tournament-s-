/**
 * Dirty Dozen Security Rules Verification Payloads (Phase 0)
 * Documents and verifies that unauthorized tournament/admin/PII writes are blocked.
 */
export const DIRTY_DOZEN_TEST_CASES = [
  {
    name: 'Unauthenticated client creates tournament',
    path: '/tournaments/tour_99',
    operation: 'create',
    auth: null,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Non-admin player creates tournament',
    path: '/tournaments/tour_99',
    operation: 'create',
    auth: { uid: 'player_1', email: 'player@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Unverified admin email spoof attempts tournament create',
    path: '/tournaments/tour_99',
    operation: 'create',
    auth: { uid: 'spoof_1', email: 'zeeshanjan21khankoko@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Shadow field injection on tournament create',
    path: '/tournaments/tour_99',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'zeeshanjan21khankoko@gmail.com', email_verified: true },
    payloadExtra: { shadowField: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Oversized document ID poisoning (>128 chars)',
    path: `/tournaments/${'a'.repeat(180)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Negative entry_fee or prize_pool',
    path: '/tournaments/tour_99',
    operation: 'create',
    payloadOverride: { entry_fee: -50 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Self-role escalation in /users/{uid}',
    path: '/users/player_1',
    operation: 'create',
    auth: { uid: 'player_1', email: 'player@example.com', email_verified: true },
    payloadOverride: { role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Non-bootstrapped admin writes /admins/{uid}',
    path: '/admins/player_1',
    operation: 'create',
    auth: { uid: 'player_1', email: 'player@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Cross-user PII read on /users/{otherUid}',
    path: '/users/player_2',
    operation: 'get',
    auth: { uid: 'player_1', email: 'player@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Unfiltered list scrape on /users',
    path: '/users',
    operation: 'list',
    auth: { uid: 'player_1', email: 'player@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Unregistered player reads room secret',
    path: '/tournaments/tour_1/secrets/room',
    operation: 'get',
    auth: { uid: 'player_1', email: 'player@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Immutable created_at overwritten on tournament update',
    path: '/tournaments/tour_1',
    operation: 'update',
    auth: { uid: 'admin_1', email: 'zeeshanjan21khankoko@gmail.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
] as const;
