import test from "node:test";
import assert from "node:assert/strict";

import {
    directoryEntryMatches,
    normalizeDirectoryEntry,
    normalizeDirectoryUrl,
    sortDirectoryEntries
} from "../admin/directory-tools.mjs";

test("normalizes directory entries and safely upgrades website links", () => {
    const entry = normalizeDirectoryEntry({
        name: "  Dr. Miriam Stein  ",
        type: "Therapist",
        phone: " (555) 010-2020 ",
        url: "example.org/profile"
    }, "entry-1");

    assert.equal(entry.name, "Dr. Miriam Stein");
    assert.equal(entry.phone, "(555) 010-2020");
    assert.equal(entry.url, "https://example.org/profile");
    assert.equal(normalizeDirectoryUrl("javascript:alert(1)"), "");
});

test("filters the directory across contact details and notes", () => {
    const entry = normalizeDirectoryEntry({
        name: "Dr. Miriam Stein",
        type: "Therapist",
        notes: "Specializes in communication"
    }, "entry-1");

    assert.equal(directoryEntryMatches(entry, { search: "communication" }), true);
    assert.equal(directoryEntryMatches(entry, { type: "Resource" }), false);
});

test("sorts directory entries alphabetically", () => {
    const sorted = sortDirectoryEntries([
        { id: "3", name: "Person 10", type: "Person" },
        { id: "2", name: "zev", type: "Person" },
        { id: "1", name: "Ari", type: "Therapist" },
        { id: "4", name: "Person 2", type: "Resource" }
    ]);

    assert.deepEqual(sorted.map(({ name }) => name), ["Ari", "Person 2", "Person 10", "zev"]);
});
