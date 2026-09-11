import assert from "node:assert/strict";
import test from "node:test";

import {
    buildBanquestUrl,
    DONATION_FREQUENCIES,
    DONATION_METHODS,
    donationFrequencyLabel,
    normalizeDonationIntent,
    paymentMethodLabel,
    validateDonationSelection
} from "../donation-tools.mjs";

test("validates one-time donation choices and preserves cents", () => {
    assert.deepEqual(validateDonationSelection({
        name: "  Sarah Cohen  ",
        amount: "180.50",
        frequency: DONATION_FREQUENCIES.oneTime,
        paymentMethod: DONATION_METHODS.donorAdvisedFund
    }), {
        name: "Sarah Cohen",
        amount: 180.5,
        frequency: "one_time",
        paymentMethod: "donor_advised_fund"
    });
});

test("monthly donations require credit card", () => {
    assert.throws(() => validateDonationSelection({
        name: "Sarah Cohen",
        amount: 180,
        frequency: DONATION_FREQUENCIES.monthly,
        paymentMethod: DONATION_METHODS.donorAdvisedFund
    }), /require a credit card/);
});

test("unavailable payment methods cannot be selected", () => {
    for (const paymentMethod of [DONATION_METHODS.venmo, DONATION_METHODS.zelle]) {
        assert.throws(() => validateDonationSelection({
            name: "Sarah Cohen",
            amount: 180,
            frequency: DONATION_FREQUENCIES.oneTime,
            paymentMethod
        }), /currently unavailable/);
    }
});

test("builds a Banquest URL with the amount and donor name in the description", () => {
    const url = new URL(buildBanquestUrl({
        name: "Sarah & David Cohen",
        amount: 180,
        frequency: DONATION_FREQUENCIES.monthly
    }));
    assert.equal(url.origin + url.pathname, "https://pay.banquest.com/binyanshalem");
    assert.equal(url.searchParams.get("amount"), "180");
    assert.match(url.searchParams.get("description"), /monthly gift.*Sarah & David Cohen/i);
});

test("normalizes stored donation intents for the admin list", () => {
    const donation = normalizeDonationIntent({
        name: "David Cohen",
        amount: 360,
        frequency: "monthly",
        paymentMethod: "credit_card",
        status: "unconfirmed",
        adminViewed: false
    }, "donation-1");
    assert.equal(donation.id, "donation-1");
    assert.equal(paymentMethodLabel(donation.paymentMethod), "Credit card");
    assert.equal(donationFrequencyLabel(donation.frequency), "Monthly gift");
});
