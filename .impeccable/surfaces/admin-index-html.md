---
version: 1
slug: "admin-index-html"
primary_target: "admin/index.html"
related_targets: ["content-resource-tools.mjs","firestore.rules"]
---

Mode: Operate

Purpose: Let the site owner review and publish link-only shalom bayit resources, remove admin-created resources, and review intake submissions.

Visual world: Preserve the established compact purple admin identity and Inter typography. Prioritize legible forms, explicit status feedback, and responsive single-column behavior on narrow screens.

Structure: Password gate, admin header, Content Library and Submissions tabs. Content Library contains provider guidance, a paste-and-review form, a source-aware editable review panel, and the Firebase-created resource list.

Content contract: Baked resources remain the frontend baseline. Admin additions store links and remote metadata only and reuse the public resource renderer. Supported inputs are YouTube including Shorts/mobile URLs, the exact TorahAnytime multiline format, the first Amazon product URL, and iTorah lecture URLs. Every publishable presentation field can be edited during review; detected provider, content type, and internal ID remain locked. Photos remain baked-only.

Constraint: The owner explicitly requested that the previous client-side password route remain temporarily. It starts an anonymous Firebase session after the password check; this is a known interim security limitation and must not be mistaken for a strong authorization boundary.
