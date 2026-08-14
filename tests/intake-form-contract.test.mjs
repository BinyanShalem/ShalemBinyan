import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homePage, adminPage, firestoreRules] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8")
]);

test("offers distinct husband, wife, both, and someone-else submitter choices", () => {
    for (const formType of ["husband", "wife", "both", "someone-else"]) {
        assert.match(homePage, new RegExp(`data-form-type="${formType}"`));
    }
    assert.match(homePage, /data-form-type="both" aria-pressed="true"/);
});

test("reveals and requires the relationship only for someone else", () => {
    assert.match(homePage, /id="submitter-disclosure" hidden/);
    assert.match(homePage, /name="submitter_relationship"[^>]*disabled/);
    assert.match(homePage, /We only get involved when the couple is on board\./);
    assert.match(homePage, /submitterRelationship\.disabled = !someoneElse/);
    assert.match(homePage, /submitterRelationship\.required = someoneElse/);
});

test("keeps the frontend, admin, and Firestore submission contract aligned", () => {
    assert.match(homePage, /submitter_relationship: formType === "someone-else"/);
    assert.match(adminPage, /submitter_relationship: "Relationship to couple"/);
    assert.match(adminPage, /formType: "Submitted by"/);
    assert.match(firestoreRules, /'husband', 'wife', 'both', 'someone-else'/);
    assert.match(firestoreRules, /request\.resource\.data\.submitter_relationship\.size\(\) > 0/);
});
