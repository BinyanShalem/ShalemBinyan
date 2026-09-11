export const DONATIONS_COLLECTION = "donation_intents";

export const DONATION_FREQUENCIES = Object.freeze({
    oneTime: "one_time",
    monthly: "monthly"
});

export const DONATION_METHODS = Object.freeze({
    creditCard: "credit_card",
    donorAdvisedFund: "donor_advised_fund",
    venmo: "venmo",
    zelle: "zelle"
});

const METHOD_LABELS = Object.freeze({
    [DONATION_METHODS.creditCard]: "Credit card",
    [DONATION_METHODS.donorAdvisedFund]: "Charitable account or donor-advised fund",
    [DONATION_METHODS.venmo]: "Venmo",
    [DONATION_METHODS.zelle]: "Zelle"
});

const FREQUENCY_LABELS = Object.freeze({
    [DONATION_FREQUENCIES.oneTime]: "One-time gift",
    [DONATION_FREQUENCIES.monthly]: "Monthly gift"
});

function clean(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function paymentMethodLabel(method) {
    return METHOD_LABELS[method] || "Payment method unavailable";
}

export function donationFrequencyLabel(frequency) {
    return FREQUENCY_LABELS[frequency] || "One-time gift";
}

export function validateDonationSelection({ name, amount, frequency, paymentMethod } = {}) {
    const cleanName = clean(name, 160);
    const numericAmount = Number(amount);
    const cleanFrequency = Object.values(DONATION_FREQUENCIES).includes(frequency)
        ? frequency
        : "";
    const cleanPaymentMethod = Object.values(DONATION_METHODS).includes(paymentMethod)
        ? paymentMethod
        : "";

    if (!cleanName) throw new TypeError("Enter your full name.");
    if (!Number.isFinite(numericAmount) || numericAmount < 1 || numericAmount > 1000000) {
        throw new TypeError("Enter a donation amount between $1 and $1,000,000.");
    }
    if (!cleanFrequency) throw new TypeError("Choose one-time or monthly giving.");
    if (!cleanPaymentMethod) throw new TypeError("Choose a payment method.");
    if ([DONATION_METHODS.venmo, DONATION_METHODS.zelle].includes(cleanPaymentMethod)) {
        throw new TypeError("This payment method is currently unavailable.");
    }
    if (cleanFrequency === DONATION_FREQUENCIES.monthly && cleanPaymentMethod !== DONATION_METHODS.creditCard) {
        throw new TypeError("Monthly gifts currently require a credit card.");
    }

    return {
        name: cleanName,
        amount: Math.round(numericAmount * 100) / 100,
        frequency: cleanFrequency,
        paymentMethod: cleanPaymentMethod
    };
}

export function buildBanquestUrl({ name, amount, frequency } = {}) {
    const selection = validateDonationSelection({
        name,
        amount,
        frequency,
        paymentMethod: DONATION_METHODS.creditCard
    });
    const url = new URL("https://pay.banquest.com/binyanshalem");
    url.searchParams.set("amount", String(selection.amount));
    url.searchParams.set(
        "description",
        `Binyan Shalem ${donationFrequencyLabel(selection.frequency).toLowerCase()} — ${selection.name}`
    );
    return url.href;
}

export function normalizeDonationIntent(data = {}, id = "") {
    const amount = Number(data.amount);
    return {
        id: clean(id, 180),
        name: clean(data.name, 160) || "Name unavailable",
        amount: Number.isFinite(amount) ? amount : 0,
        frequency: Object.values(DONATION_FREQUENCIES).includes(data.frequency)
            ? data.frequency
            : DONATION_FREQUENCIES.oneTime,
        paymentMethod: Object.values(DONATION_METHODS).includes(data.paymentMethod)
            ? data.paymentMethod
            : DONATION_METHODS.creditCard,
        status: data.status === "unconfirmed" ? data.status : "unconfirmed",
        adminViewed: data.adminViewed === true,
        createdAt: data.createdAt || null
    };
}

export function donationTimestamp(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (Number.isFinite(value.seconds)) return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    return 0;
}
