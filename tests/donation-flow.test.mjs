import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [donationPage, adminPage, rules, functionsSource, serviceWorker] = await Promise.all([
    readFile(new URL("../donate/index.html", import.meta.url), "utf8"),
    readFile(new URL("../admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../functions/index.js", import.meta.url), "utf8"),
    readFile(new URL("../admin/service-worker.js", import.meta.url), "utf8")
]);

test("replaces the Google donation form with a native gift form", () => {
    assert.match(donationPage, /id="donation-form"/);
    assert.match(donationPage, /name="name"/);
    assert.match(donationPage, /name="amount"/);
    assert.match(donationPage, /name="frequency" value="monthly"/);
    assert.match(donationPage, /name="paymentMethod" value="credit_card"/);
    assert.doesNotMatch(donationPage, /docs\.google\.com\/forms/);
});

test("supports card, charitable-account, Venmo, and Zelle destinations", () => {
    assert.match(donationPage, /id="credit-card-destination"/);
    assert.match(donationPage, /id="fund-destination"/);
    assert.match(donationPage, /id="unavailable-destination"/);
    assert.match(donationPage, /Sephardic Congregation of Long Branch/);
    assert.match(donationPage, /47-5112423/);
    assert.match(donationPage, /Required memo[\s\S]*Binyan Shalem/);
    assert.match(donationPage, /value="monthly"[\s\S]*?CC only/);
    assert.match(donationPage, /value="venmo" disabled/);
    assert.match(donationPage, /value="zelle" disabled/);
    assert.match(donationPage, /Unavailable for monthly/);
});

test("records an unconfirmed donation intent before showing payment", () => {
    assert.match(donationPage, /addDoc\(collection\(db, DONATIONS_COLLECTION\)/);
    assert.match(donationPage, /status: "unconfirmed"/);
    assert.match(donationPage, /adminViewed: false/);
    assert.match(rules, /match \/donation_intents\/\{donationId\}/);
    assert.match(rules, /frequency != 'monthly'[\s\S]*paymentMethod == 'credit_card'/);
    assert.match(rules, /paymentMethod in \['credit_card', 'donor_advised_fund'\]/);
});

test("adds a donation center and unread marker to the admin PWA", () => {
    assert.match(adminPage, /id="donations-button"/);
    assert.match(adminPage, /id="donation-alert-count"/);
    assert.match(adminPage, /id="donations-workspace"/);
    assert.match(adminPage, /Payment not confirmed/);
    assert.match(adminPage, /subscribeToDonations/);
    assert.match(adminPage, /markAllDonationsReviewed/);
    assert.match(serviceWorker, /\/donation-tools\.mjs/);
});

test("pushes new donation interests to the donation-center deep link", () => {
    assert.match(functionsSource, /exports\.sendNewDonationNotification/);
    assert.match(functionsSource, /document: "donation_intents\/\{donationId\}"/);
    assert.match(functionsSource, /url: "\/admin\/\?view=donations"/);
});

test("keeps the mobile form immediate and authors the payment transition", () => {
    assert.match(donationPage, /@media \(max-width: 700px\)[\s\S]*?\.donation-copy \{\s*display: none;/);
    assert.match(donationPage, /@keyframes donation-destination-in/);
    assert.match(donationPage, /target\.classList\.add\("is-entering"\)/);
    assert.match(donationPage, /prefers-reduced-motion: reduce[\s\S]*?\.donation-destination\.is-entering \{\s*animation: none;/);
    assert.match(donationPage, /scrollbar-color: var\(--harbor\) var\(--mist\)/);
});

test("explains why a local file preview cannot advance", () => {
    assert.match(donationPage, /window\.location\.protocol === "file:"/);
    assert.match(donationPage, /Local file previews cannot connect to the secure donation service/);
    assert.match(donationPage, /Open from the published site/);
});
