# Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Admin-Only Tournament Mutations**: Only a verified administrator (`request.auth.token.email_verified == true` and either `request.auth.token.email == 'zeeshanjan21khankoko@gmail.com'` or an existing `/admins/{uid}` record) may `create`, `update`, or `delete` documents in `/tournaments/{tournamentId}`, `/tournaments/{tournamentId}/secrets/{secretId}`, or `/announcements/{announcementId}`.
2. **Zero Shadow Fields / Strict Key Allowlisting**: Every document create enforces `keys().hasAll(...) && keys().hasOnly(...)` and every update enforces `diff(existing()).affectedKeys().hasOnly(...)` plus full `isValid[Entity]()` schema checks.
3. **Immutable Ownership & Timestamps**: `created_at` and `created_by_uid` on `/tournaments` and `/announcements` cannot be modified after creation (`incoming().created_at == existing().created_at`, `incoming().created_by_uid == existing().created_by_uid`, `incoming().created_at == request.time` on create, `incoming().updated_at == request.time` on update).
4. **PII Isolation**: User emails are stored only in `/users/{userId}` (restricted to owner and admin), never in `/users_public/{userId}` or `/tournaments/{tournamentId}`. Room ID and password are stored in `/tournaments/{tournamentId}/secrets/room` and readable only by admins or registered players.
5. **Privilege Escalation Guard**: Regular users creating `/users/{userId}` can only assign `role: 'player'` and cannot write `/admins/{userId}`.
6. **Terminal State Protection**: Completed or cancelled tournaments cannot be reopened or mutated by non-admin clients (all tournament writes are strictly admin-only).

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated Tournament Creation**: Anonymous client attempts `create` on `/tournaments/tour_99` -> `PERMISSION_DENIED`.
2. **Player Tournament Creation**: Authenticated non-admin player attempts `create` on `/tournaments/tour_99` -> `PERMISSION_DENIED`.
3. **Unverified Admin Email Spoof**: User with `email: 'zeeshanjan21khankoko@gmail.com'` and `email_verified: false` attempts `create` on `/tournaments/tour_99` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Tournament**: Admin sends extra ghost field `{ isFeaturedHack: true }` -> `PERMISSION_DENIED`.
5. **Oversized Tournament ID Poisoning**: 200-character document ID on `/tournaments/{id}` -> `PERMISSION_DENIED`.
6. **Negative Prize / Fee Value**: Admin attempts `entry_fee: -100` or `prize_pool: -500` -> `PERMISSION_DENIED`.
7. **Self-Role Escalation**: Player attempts to write `{ role: 'admin' }` into `/users/{ownUid}` -> `PERMISSION_DENIED`.
8. **Admin Allowlist Forgery**: Player attempts to create `/admins/{ownUid}` -> `PERMISSION_DENIED`.
9. **Cross-User PII Read**: Player A attempts `get` on `/users/{playerBUid}` -> `PERMISSION_DENIED`.
10. **Blanket User List Scrape**: Player A attempts unfiltered `list` on `/users` -> `PERMISSION_DENIED`.
11. **Room Secret Leak**: Non-registered player attempts `get` on `/tournaments/tour_1/secrets/room` -> `PERMISSION_DENIED`.
12. **Immutable Timestamp Tampering**: Admin attempts to overwrite `created_at` during tournament update -> `PERMISSION_DENIED`.
