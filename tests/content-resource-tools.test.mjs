import test from "node:test";
import assert from "node:assert/strict";

import {
    applyResourceEdits,
    buildResourceFromPaste,
    ContentParseError,
    detectContentSource,
    extractYouTubeVideoId,
    getResourceTypeLabel,
    isNewAdminResource,
    mergeResourceCollections,
    normalizeStoredResource
} from "../content-resource-tools.mjs";

function jsonResponse(data, ok = true) {
    return {
        ok,
        status: ok ? 200 : 500,
        async json() {
            return data;
        }
    };
}

test("normalizes mobile YouTube links and keeps embedded playback", async () => {
    const pasted = "https://m.youtube.com/watch?v=xYJON0S7WWo&pp=ygUMU2hhbG9tIGJheWl0&ra=m";
    const resource = await buildResourceFromPaste(pasted, {
        fetchImpl: async (url) => {
            assert.equal(new URL(url).hostname, "www.youtube.com");
            return jsonResponse({
                title: "Shalom Bayit Reality Check",
                author_name: "TorahAnytime",
                thumbnail_url: "https://i.ytimg.com/vi/xYJON0S7WWo/hqdefault.jpg"
            });
        }
    });

    assert.equal(resource.id, "youtube_xYJON0S7WWo");
    assert.equal(resource.primaryUrl, "https://www.youtube.com/watch?v=xYJON0S7WWo");
    assert.equal(resource.embedUrl, "https://www.youtube-nocookie.com/embed/xYJON0S7WWo?rel=0");
    assert.equal(getResourceTypeLabel(resource), "YouTube video");
});

test("recognizes YouTube Shorts links", async () => {
    assert.equal(extractYouTubeVideoId("https://youtube.com/shorts/xYJON0S7WWo?feature=share"), "xYJON0S7WWo");
    assert.equal(detectContentSource("https://youtube.com/shorts/xYJON0S7WWo?feature=share").source, "youtube");
});

test("parses the exact TorahAnytime multiline format", async () => {
    const pasted = `R' Eli Mansour
Tips for Marriage

TorahAnytime Links
📹 https://MyTaT.me/v421705

☎️ Dial In (605)-605-2220
Press 9421705`;
    const resource = await buildResourceFromPaste(pasted, {
        fetchImpl: async () => {
            throw new Error("TorahAnytime parsing should not need metadata fetches");
        }
    });

    assert.equal(resource.id, "torahanytime_421705");
    assert.equal(resource.speaker, "R' Eli Mansour");
    assert.equal(resource.title, "Tips for Marriage");
    assert.equal(resource.dialIn, "(605) 605-2220");
    assert.equal(resource.dialInHref, "tel:+16056052220");
    assert.equal(resource.extension, "9421705");
    assert.equal(getResourceTypeLabel(resource), "Video & dial-in");
});

test("uses only the first Amazon product link and ignores the Alexa link", async () => {
    const pasted = `Shop on Amazon
https://a.co/d/0ib3kC2P
Product questions? Ask Alexa, your shopping assistant: https://a.co/d/0hnJttAk`;

    const resource = await buildResourceFromPaste(pasted, {
        fetchImpl: async (requestUrl) => {
            const metadataUrl = new URL(requestUrl);
            assert.equal(metadataUrl.searchParams.get("url"), "https://a.co/d/0ib3kC2P");
            return jsonResponse({
                status: "success",
                data: {
                    url: "https://www.amazon.com/Secrets-Soul-Shidduchim-Shalom-Bayis/dp/168025684X",
                    productTitle: "  Secrets of the Soul, Volume 2: Shidduchim and Shalom Bayis  ",
                    productImage: "https://m.media-amazon.com/images/I/714dul4rA-L._SL1500_.jpg",
                    author: "Rav Shlomo Hoffman (Author) Format: Hardcover"
                }
            });
        }
    });

    assert.equal(resource.id, "amazon_168025684X");
    assert.equal(resource.primaryUrl, "https://a.co/d/0ib3kC2P");
    assert.equal(resource.speaker, "Rav Shlomo Hoffman");
    assert.equal(resource.type, "book");
});

test("builds iTorah lectures as linked video resources without dial-in fields", async () => {
    const pasted = "https://itorah.com/lecture/video/rabbi-eli-mansour/marriage-and-money/6436/1";
    const resource = await buildResourceFromPaste(pasted, {
        fetchImpl: async () => jsonResponse({
            status: "success",
            data: {
                title: "Marriage And Money, lectured by Rabbi Eli Mansour",
                image: { url: "https://itorah.com/assets/img/social/EliMansour.png" }
            }
        })
    });

    assert.equal(resource.id, "itorah_6436");
    assert.equal(resource.title, "Marriage And Money");
    assert.equal(resource.speaker, "Rabbi Eli Mansour");
    assert.equal(resource.dialIn, "");
    assert.equal(resource.primaryLabel, "Watch on iTorah");
    assert.equal(getResourceTypeLabel(resource), "iTorah video");
});

test("applies manual review edits while preserving internal resource identity", () => {
    const resource = applyResourceEdits({
        id: "torahanytime_421705",
        type: "video",
        source: "torahanytime"
    }, {
        title: "  A Better Marriage  ",
        speaker: "R' Eli Mansour",
        primaryLabel: "Open lecture",
        primaryUrl: "https://MyTaT.me/v421705",
        imageUrl: "https://www.torahanytime.com/images/audio-thumb-male.svg",
        imageAlt: "Rabbi Eli Mansour teaching",
        dialIn: "605-605-2220",
        extension: "9421705"
    });

    assert.equal(resource.id, "torahanytime_421705");
    assert.equal(resource.source, "torahanytime");
    assert.equal(resource.type, "video");
    assert.equal(resource.title, "A Better Marriage");
    assert.equal(resource.primaryLabel, "Open lecture");
    assert.equal(resource.dialIn, "605-605-2220");
    assert.equal(resource.dialInHref, "tel:+16056052220");
    assert.equal(resource.extension, "9421705");
});

test("normalizes a manually edited YouTube playback URL", () => {
    const resource = applyResourceEdits({
        id: "youtube_xYJON0S7WWo",
        type: "video",
        source: "youtube"
    }, {
        title: "Edited title",
        speaker: "Edited speaker",
        primaryLabel: "Watch now",
        primaryUrl: "https://youtu.be/xYJON0S7WWo",
        imageUrl: "https://i.ytimg.com/vi/xYJON0S7WWo/hqdefault.jpg",
        imageAlt: "Edited thumbnail description",
        embedUrl: "https://www.youtube.com/watch?v=xYJON0S7WWo"
    });

    assert.equal(resource.embedUrl, "https://www.youtube-nocookie.com/embed/xYJON0S7WWo?rel=0");
    assert.equal(resource.primaryUrl, "https://youtu.be/xYJON0S7WWo");
});

test("rejects unsupported links with a useful validation error", async () => {
    await assert.rejects(
        buildResourceFromPaste("https://example.com/not-supported", { fetchImpl: async () => jsonResponse({}) }),
        (error) => error instanceof ContentParseError && error.code === "invalid-format"
    );
});

test("merges backend resources after baked resources and removes duplicates", () => {
    const baked = [{
        id: "existing-youtube",
        type: "video",
        source: "youtube",
        title: "Existing",
        primaryUrl: "https://www.youtube.com/watch?v=xYJON0S7WWo"
    }];
    const stored = [
        {
            id: "duplicate",
            source: "youtube",
            type: "video",
            title: "Duplicate",
            primaryUrl: "https://youtu.be/xYJON0S7WWo",
            primaryLabel: "Watch on YouTube",
            imageUrl: "https://i.ytimg.com/vi/xYJON0S7WWo/hqdefault.jpg",
            imageAlt: "Duplicate",
            embedUrl: "https://www.youtube-nocookie.com/embed/xYJON0S7WWo?rel=0",
            sortOrder: 2
        },
        {
            id: "itorah_6436",
            source: "itorah",
            type: "video",
            title: "Marriage And Money",
            primaryUrl: "https://itorah.com/lecture/video/rabbi-eli-mansour/marriage-and-money/6436/1",
            primaryLabel: "Watch on iTorah",
            imageUrl: "https://itorah.com/assets/img/social/EliMansour.png",
            imageAlt: "Marriage And Money",
            sortOrder: 1
        }
    ];

    const merged = mergeResourceCollections(baked, stored);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, "existing-youtube");
    assert.equal(merged[1].id, "itorah_6436");
});

test("marks only admin resources created within the last seven days as new", () => {
    const now = Date.UTC(2026, 7, 8, 12);
    const resource = normalizeStoredResource({
        source: "youtube",
        type: "video",
        title: "A new marriage resource",
        primaryUrl: "https://www.youtube.com/watch?v=xYJON0S7WWo",
        primaryLabel: "Watch on YouTube",
        imageUrl: "https://i.ytimg.com/vi/xYJON0S7WWo/hqdefault.jpg",
        imageAlt: "A new marriage resource",
        createdAt: { toMillis: () => now - (6 * 24 * 60 * 60 * 1000) }
    }, "new-resource");

    assert.equal(resource.createdAtMs, now - (6 * 24 * 60 * 60 * 1000));
    assert.equal(isNewAdminResource(resource, now), true);
    assert.equal(isNewAdminResource({ ...resource, createdAtMs: now - (7 * 24 * 60 * 60 * 1000) }, now), true);
    assert.equal(isNewAdminResource({ ...resource, createdAtMs: now - (7 * 24 * 60 * 60 * 1000) - 1 }, now), false);
    assert.equal(isNewAdminResource({ ...resource, createdAtMs: now + 1 }, now), false);
    assert.equal(isNewAdminResource({ ...resource, origin: "baked" }, now), false);
});
