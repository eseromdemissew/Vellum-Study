# One-platform build: Vellum + roles, parental oversight, admin, community, library

## Database
- [ ] Migration: user_roles (admin/parent/student) + has_role()
- [ ] profiles: first_name, father_name, student_id (unique), role mirror
- [ ] parent_child_links (pending/accepted/declined/revoked)
- [ ] notifications (link requests, inactivity, moderation)
- [ ] reading_sessions (book, minutes, quiz attempts)
- [ ] community_posts + post_likes + post_comments (student & parent feeds)
- [ ] moderation_actions audit log
- [ ] ai_api_keys (masked, status, failover)

## Server functions
- [ ] roles: set role at signup, has_role checks
- [ ] linking: request by student ID, accept/decline, revoke, parent dashboard data
- [ ] admin: user table (search/filter/sort), suspend/delete, activity drill-down
- [ ] community: post/like/comment, profanity filter, report, moderate
- [ ] library: Open Library search proxy (has_fulltext, ia filter, pdf/epub fallback)
- [ ] reading: start/stop session, continue-reading, 48h inactivity check
- [ ] ai keys: add/list(masked)/disable, auto-failover in study functions

## UI
- [ ] Signup: role picker (Admin/Parent/Student), first name, father's name
- [ ] Settings page: student ID, link status, revoke
- [ ] Student: "connect a parent" banner when unlinked
- [ ] Parent dashboard: link child, per-child activity (notebooks, reading, quiz scores)
- [ ] Admin console: users table, moderation, AI keys, aggregate stats
- [ ] Community: student feed + parent feed, post/like/comment/report
- [ ] Library: search + subjects, book grid, reader, download, reading timer
- [ ] Student home: continue reading

## QA
- [ ] Full flow test per section; no placeholders, dead buttons, or demo data
