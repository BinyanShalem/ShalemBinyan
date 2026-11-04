import test from "node:test";
import assert from "node:assert/strict";
import {
    MAX_PHOTO_BATCH,
    MAX_SOURCE_PHOTO_BYTES,
    meetingPhotoPaths,
    normalizeMeetingPhoto,
    validateMeetingPhotoBatch
} from "../admin/meeting-photo-tools.mjs";

function file(name, type = "image/jpeg", size = 1024) {
    return { name, type, size };
}

test("meeting photo paths remain scoped to one meeting and immutable photo ID", () => {
    assert.deepEqual(meetingPhotoPaths("meeting-1", "photo-1"), {
        storagePath: "admin-meeting-images/meeting-1/photo-1/display.jpg",
        thumbnailPath: "admin-meeting-images/meeting-1/photo-1/thumb.jpg"
    });
    assert.throws(() => meetingPhotoPaths("meeting/escape", "photo-1"), /valid storage path segment/);
    assert.throws(() => meetingPhotoPaths("meeting-1", ""), /valid storage path segment/);
});

test("photo batch validation accepts common phone formats and rejects unsafe input", () => {
    const valid = [
        file("photo.jpg"),
        file("photo.png", "image/png"),
        file("photo.webp", "image/webp"),
        file("photo.heic", "image/heic"),
        file("extension-only.HEIF", "")
    ];
    const result = validateMeetingPhotoBatch([
        ...valid,
        file("document.pdf", "application/pdf"),
        file("empty.jpg", "image/jpeg", 0),
        file("huge.jpg", "image/jpeg", MAX_SOURCE_PHOTO_BYTES + 1)
    ]);
    assert.deepEqual(result.accepted, valid);
    assert.equal(result.rejected.length, 3);
    assert.match(result.rejected[0].reason, /JPEG, PNG, WebP, HEIC, or HEIF/);
    assert.match(result.rejected[1].reason, /empty or unavailable/);
    assert.match(result.rejected[2].reason, /smaller than 20 MB/);
});

test("photo selection is unlimited overall but bounded to twenty per upload batch", () => {
    const files = Array.from({ length: MAX_PHOTO_BATCH + 3 }, (_, index) => file(`photo-${index}.jpg`));
    const result = validateMeetingPhotoBatch(files);
    assert.equal(result.accepted.length, MAX_PHOTO_BATCH);
    assert.equal(result.rejected.length, 3);
    assert.ok(result.rejected.every(({ reason }) => reason.includes("up to 20 photos")));
});

test("photo metadata normalization never invents storage paths or identifiers", () => {
    assert.deepEqual(normalizeMeetingPhoto({
        meetingId: " meeting-1 ",
        storagePath: " path/display.jpg ",
        thumbnailPath: " path/thumb.jpg ",
        originalName: " photo.jpg ",
        contentType: "image/jpeg",
        size: 125,
        width: 800,
        height: 600,
        createdBy: " admin-1 "
    }, " photo-1 "), {
        id: "photo-1",
        meetingId: "meeting-1",
        storagePath: "path/display.jpg",
        thumbnailPath: "path/thumb.jpg",
        originalName: "photo.jpg",
        contentType: "image/jpeg",
        size: 125,
        width: 800,
        height: 600,
        createdAt: null,
        createdBy: "admin-1",
        previewDisplayBlob: null,
        previewThumbnailBlob: null
    });
});
