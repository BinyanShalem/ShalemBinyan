import test from "node:test";
import assert from "node:assert/strict";

import { BAKED_IN_RESOURCES, FIREBASE_CONFIG } from "../content-library.mjs";

test("keeps the baked content catalog complete and uniquely addressable", () => {
    const ids = BAKED_IN_RESOURCES.map((resource) => resource.id);
    const videos = BAKED_IN_RESOURCES.filter((resource) => resource.type === "video");

    assert.equal(BAKED_IN_RESOURCES.length, 30);
    assert.equal(videos.length, 24);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id)));
    assert.ok(videos.every((resource) => resource.primaryUrl));
});

test("keeps player behavior aligned with each video provider", () => {
    const videos = BAKED_IN_RESOURCES.filter((resource) => resource.type === "video");
    const embedded = videos.filter((resource) => resource.embedUrl);
    const external = videos.filter((resource) => !resource.embedUrl);

    assert.equal(embedded.length, 13);
    assert.ok(embedded.every((resource) => resource.source === "youtube"));
    assert.ok(external.every((resource) => resource.imageUrl));
    assert.ok(external.every((resource) => resource.primaryUrl.startsWith("https://")));
});

test("exports the shared Firebase project configuration", () => {
    assert.equal(FIREBASE_CONFIG.projectId, "binyanshalem-28b1a");
});
