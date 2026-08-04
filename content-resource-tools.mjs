const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be"
]);

const AMAZON_HOST_PATTERN = /(^|\.)(amazon\.[a-z.]+|a\.co|amzn\.to)$/i;
const ITORAH_HOST_PATTERN = /(^|\.)itorah\.com$/i;
const TORAH_ANYTIME_HOST_PATTERN = /(^|\.)(mytat\.me|torahanytime\.com)$/i;
const DEFAULT_TORAH_ANYTIME_IMAGE = "https://www.torahanytime.com/images/audio-thumb-male.svg";

export const CONTENT_COLLECTION = "content";

export class ContentParseError extends Error {
    constructor(message, code = "invalid-format") {
        super(message);
        this.name = "ContentParseError";
        this.code = code;
    }
}

function cleanLine(value) {
    return String(value || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/^[\s📹☎️🛒🔗]+/u, "")
        .trim();
}

function cleanUrlToken(value) {
    return String(value || "")
        .trim()
        .replace(/^[<(\[]+/, "")
        .replace(/[>),.;\]]+$/, "");
}

function parseHttpUrl(value) {
    try {
        const url = new URL(cleanUrlToken(value));
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return url;
    } catch {
        return null;
    }
}

export function extractUrls(value) {
    const matches = String(value || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
    return matches.map(cleanUrlToken).filter((item) => parseHttpUrl(item));
}

export function extractYouTubeVideoId(value) {
    const url = value instanceof URL ? value : parseHttpUrl(value);
    if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return "";

    const host = url.hostname.toLowerCase();
    let candidate = "";

    if (host === "youtu.be") {
        candidate = url.pathname.split("/").filter(Boolean)[0] || "";
    } else {
        candidate = url.searchParams.get("v") || "";
        if (!candidate) {
            const parts = url.pathname.split("/").filter(Boolean);
            const markerIndex = parts.findIndex((part) => ["shorts", "embed", "live", "v"].includes(part.toLowerCase()));
            candidate = markerIndex >= 0 ? parts[markerIndex + 1] || "" : "";
        }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : "";
}

function titleFromSlug(value) {
    return decodeURIComponent(String(value || ""))
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .trim();
}

function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

function formatPhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    const localDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (localDigits.length !== 10) {
        throw new ContentParseError("The TorahAnytime text needs a complete 10-digit dial-in phone number.", "missing-phone");
    }
    return {
        display: `(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6)}`,
        href: `tel:+1${localDigits}`
    };
}

function safeMetadataImage(value) {
    const url = parseHttpUrl(value);
    return url?.protocol === "https:" ? url.href : "";
}

function resourceBase(resource) {
    return {
        id: resource.id,
        type: resource.type,
        source: resource.source,
        title: resource.title,
        speaker: resource.speaker || "",
        primaryLabel: resource.primaryLabel,
        primaryUrl: resource.primaryUrl,
        imageUrl: resource.imageUrl,
        imageAlt: resource.imageAlt,
        embedUrl: resource.embedUrl || "",
        dialIn: resource.dialIn || "",
        dialInHref: resource.dialInHref || "",
        extension: resource.extension || ""
    };
}

async function fetchJson(url, fetchImpl) {
    const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        referrerPolicy: "no-referrer"
    });
    if (!response.ok) throw new Error(`Metadata request failed with ${response.status}`);
    return response.json();
}

async function buildYouTubeResource(url, fetchImpl) {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
        throw new ContentParseError("That looks like YouTube, but the video ID is missing or invalid.", "invalid-youtube");
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let metadata = {};
    try {
        const metadataUrl = new URL("https://www.youtube.com/oembed");
        metadataUrl.searchParams.set("url", canonicalUrl);
        metadataUrl.searchParams.set("format", "json");
        metadata = await fetchJson(metadataUrl, fetchImpl);
    } catch {
        metadata = {};
    }

    const title = String(metadata.title || "YouTube video").trim();
    const speaker = String(metadata.author_name || "YouTube").trim();

    return resourceBase({
        id: `youtube_${videoId}`,
        type: "video",
        source: "youtube",
        title,
        speaker,
        primaryLabel: "Watch on YouTube",
        primaryUrl: canonicalUrl,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
        imageUrl: safeMetadataImage(metadata.thumbnail_url) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        imageAlt: `${title} by ${speaker}`
    });
}

function buildTorahAnytimeResource(rawText, url) {
    const urlMatch = url.pathname.match(/\/v?(\d+)/i) || url.pathname.match(/\/lectures\/(\d+)/i);
    const lectureId = urlMatch?.[1] || "";
    if (!lectureId) {
        throw new ContentParseError("That TorahAnytime link is missing its lecture number.", "invalid-torahanytime");
    }

    const lines = String(rawText || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
    const headingIndex = lines.findIndex((line) => /torahanytime\s+links?/i.test(line));
    const linkIndex = lines.findIndex((line) => line.includes(url.href) || /mytat\.me\/v\d+/i.test(line));
    const detailsStart = [headingIndex, linkIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? lines.length;
    const headingLines = lines.slice(0, detailsStart).filter((line) => !/https?:\/\//i.test(line));
    const speaker = headingLines[0] || "";
    const title = headingLines.slice(1).join(" ").trim();

    if (!speaker || !title) {
        throw new ContentParseError("TorahAnytime text needs the speaker on the first line and the title on the next line.", "missing-torahanytime-heading");
    }

    const phoneLine = lines.find((line) => /dial\s*in/i.test(line)) || "";
    const phoneMatch = phoneLine.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    const extensionLine = lines.find((line) => /press\s+\d+/i.test(line)) || "";
    const extension = extensionLine.match(/press\s+(\d{3,})/i)?.[1] || "";

    if (!phoneMatch) {
        throw new ContentParseError("The TorahAnytime text needs a “Dial In” phone number.", "missing-phone");
    }
    if (!extension) {
        throw new ContentParseError("The TorahAnytime text needs a “Press” extension.", "missing-extension");
    }

    const phone = formatPhone(phoneMatch[0]);

    return resourceBase({
        id: `torahanytime_${lectureId}`,
        type: "video",
        source: "torahanytime",
        title,
        speaker,
        primaryLabel: "Watch on TorahAnytime",
        primaryUrl: `https://MyTaT.me/v${lectureId}`,
        imageUrl: DEFAULT_TORAH_ANYTIME_IMAGE,
        imageAlt: `${speaker} presenting ${title}`,
        dialIn: phone.display,
        dialInHref: phone.href,
        extension
    });
}

function cleanAmazonAuthor(value) {
    return String(value || "")
        .replace(/\s*\((?:Author|Editor|Contributor)[^)]*\).*$/i, "")
        .replace(/\s+Format:.*$/i, "")
        .trim();
}

function extractAmazonAsin(value) {
    const url = parseHttpUrl(value);
    if (!url) return "";
    return url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || "";
}

async function buildAmazonResource(url, fetchImpl) {
    const metadataUrl = new URL("https://api.microlink.io/");
    metadataUrl.searchParams.set("url", url.href);
    metadataUrl.searchParams.set("data.productImage.selector", "#landingImage");
    metadataUrl.searchParams.set("data.productImage.attr", "data-old-hires");
    metadataUrl.searchParams.set("data.productTitle.selector", "#productTitle");
    metadataUrl.searchParams.set("data.productTitle.type", "text");

    let payload;
    try {
        payload = await fetchJson(metadataUrl, fetchImpl);
    } catch {
        throw new ContentParseError("The Amazon link is valid, but its product details could not be loaded. Please try again in a minute.", "amazon-metadata");
    }

    if (payload.status !== "success") {
        throw new ContentParseError("The Amazon link is valid, but its product details could not be loaded. Please try again in a minute.", "amazon-metadata");
    }

    const data = payload.data || {};
    const resolvedUrl = parseHttpUrl(data.url)?.href || url.href;
    const asin = extractAmazonAsin(resolvedUrl) || extractAmazonAsin(url.href);
    const title = String(data.productTitle || data.title || "").replace(/\s+/g, " ").trim();
    const speaker = cleanAmazonAuthor(data.author);
    const imageUrl = safeMetadataImage(data.productImage)
        || (asin ? `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg` : "");

    if (!title || !imageUrl) {
        throw new ContentParseError("The Amazon link was recognized, but its title or cover image could not be found.", "amazon-metadata");
    }

    return resourceBase({
        id: `amazon_${asin || fnv1a(resolvedUrl)}`,
        type: "book",
        source: "amazon",
        title,
        speaker,
        primaryLabel: "Shop on Amazon",
        primaryUrl: url.href,
        imageUrl,
        imageAlt: speaker ? `Cover of ${title} by ${speaker}` : `Cover of ${title}`
    });
}

async function buildITorahResource(url, fetchImpl) {
    const parts = url.pathname.split("/").filter(Boolean);
    const mediaIndex = parts.findIndex((part) => ["video", "audio"].includes(part.toLowerCase()));
    const speakerFallback = titleFromSlug(parts[mediaIndex + 1]);
    const titleFallback = titleFromSlug(parts[mediaIndex + 2]);
    const lectureId = parts.slice(mediaIndex + 3).find((part) => /^\d+$/.test(part)) || fnv1a(url.href);

    if (mediaIndex < 0 || !speakerFallback || !titleFallback) {
        throw new ContentParseError("That iTorah link does not match a lecture page.", "invalid-itorah");
    }

    let data = {};
    try {
        const metadataUrl = new URL("https://api.microlink.io/");
        metadataUrl.searchParams.set("url", url.href);
        const payload = await fetchJson(metadataUrl, fetchImpl);
        if (payload.status === "success") data = payload.data || {};
    } catch {
        data = {};
    }

    let title = titleFallback;
    let speaker = speakerFallback;
    const metadataTitle = String(data.title || "").trim();
    const lectureTitleMatch = metadataTitle.match(/^(.*?),\s*lectured by\s*(.+)$/i);
    if (lectureTitleMatch) {
        title = lectureTitleMatch[1].trim();
        speaker = lectureTitleMatch[2].trim();
    }

    const imageUrl = safeMetadataImage(data.image?.url || data.image) || "https://itorah.com/assets/img/social/share16x9.png";

    return resourceBase({
        id: `itorah_${lectureId}`,
        type: "video",
        source: "itorah",
        title,
        speaker,
        primaryLabel: "Watch on iTorah",
        primaryUrl: url.href,
        imageUrl,
        imageAlt: `${speaker} presenting ${title}`
    });
}

export function detectContentSource(rawText) {
    const urls = extractUrls(rawText).map((value) => parseHttpUrl(value)).filter(Boolean);
    if (!urls.length) return { source: "", url: null };

    const torahAnytime = urls.find((url) => TORAH_ANYTIME_HOST_PATTERN.test(url.hostname));
    if (torahAnytime) return { source: "torahanytime", url: torahAnytime };

    const youtube = urls.find((url) => extractYouTubeVideoId(url));
    if (youtube) return { source: "youtube", url: youtube };

    const amazon = urls.find((url) => AMAZON_HOST_PATTERN.test(url.hostname));
    if (amazon) return { source: "amazon", url: amazon };

    const itorah = urls.find((url) => ITORAH_HOST_PATTERN.test(url.hostname));
    if (itorah) return { source: "itorah", url: itorah };

    return { source: "", url: urls[0] };
}

export async function buildResourceFromPaste(rawText, { fetchImpl = globalThis.fetch } = {}) {
    const text = String(rawText || "").trim();
    if (!text) throw new ContentParseError("Paste a supported content link first.", "empty");
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

    const detected = detectContentSource(text);
    if (!detected.source || !detected.url) {
        throw new ContentParseError("This is not a supported link format. Paste a YouTube, TorahAnytime, Amazon, or iTorah link.");
    }

    if (detected.source === "youtube") return buildYouTubeResource(detected.url, fetchImpl);
    if (detected.source === "torahanytime") return buildTorahAnytimeResource(text, detected.url);
    if (detected.source === "amazon") return buildAmazonResource(detected.url, fetchImpl);
    if (detected.source === "itorah") return buildITorahResource(detected.url, fetchImpl);

    throw new ContentParseError("This is not a supported link format.");
}

function normalizedStoredString(value, maxLength = 500) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeStoredResource(data, documentId = "") {
    if (!data || typeof data !== "object") return null;
    const source = normalizedStoredString(data.source, 32).toLowerCase();
    const allowedSources = new Set(["youtube", "torahanytime", "amazon", "itorah"]);
    if (!allowedSources.has(source)) return null;

    const expectedType = source === "amazon" ? "book" : "video";
    const title = normalizedStoredString(data.title, 240);
    const primaryUrl = parseHttpUrl(data.primaryUrl)?.href || "";
    const imageUrl = safeMetadataImage(data.imageUrl);
    if (!title || !primaryUrl || !imageUrl) return null;

    return {
        id: normalizedStoredString(data.id || documentId, 160) || `backend_${fnv1a(primaryUrl)}`,
        type: expectedType,
        source,
        title,
        speaker: normalizedStoredString(data.speaker, 180),
        primaryLabel: normalizedStoredString(data.primaryLabel, 80) || (source === "amazon" ? "Shop on Amazon" : `Watch on ${getProviderName({ source })}`),
        primaryUrl,
        imageUrl,
        imageAlt: normalizedStoredString(data.imageAlt, 300) || title,
        embedUrl: source === "youtube" ? safeMetadataImage(data.embedUrl) : "",
        dialIn: source === "torahanytime" ? normalizedStoredString(data.dialIn, 40) : "",
        dialInHref: source === "torahanytime" && String(data.dialInHref || "").startsWith("tel:") ? String(data.dialInHref) : "",
        extension: source === "torahanytime" ? normalizedStoredString(data.extension, 20) : "",
        sortOrder: Number.isFinite(data.sortOrder) ? data.sortOrder : 0,
        origin: "admin"
    };
}

function canonicalResourceKey(resource) {
    const source = resource.source || (resource.type === "book" ? "amazon" : "torahanytime");
    if (source === "youtube") return `youtube:${extractYouTubeVideoId(resource.primaryUrl || resource.embedUrl)}`;
    if (source === "torahanytime") return `torahanytime:${String(resource.primaryUrl || "").match(/v(\d+)/i)?.[1] || resource.id}`;
    if (source === "itorah") return `itorah:${String(resource.primaryUrl || "").match(/\/(\d+)(?:\/\d+)?\/?$/)?.[1] || resource.id}`;
    return `${source}:${String(resource.primaryUrl || resource.id || "").toLowerCase()}`;
}

export function mergeResourceCollections(bakedResources, storedResources) {
    const merged = [...bakedResources];
    const seen = new Set(bakedResources.flatMap((resource) => [resource.id, canonicalResourceKey(resource)]).filter(Boolean));
    const normalized = storedResources
        .map((item) => normalizeStoredResource(item.data || item, item.id || ""))
        .filter(Boolean)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

    normalized.forEach((resource) => {
        const key = canonicalResourceKey(resource);
        if (seen.has(resource.id) || seen.has(key)) return;
        seen.add(resource.id);
        seen.add(key);
        merged.push(resource);
    });

    return merged;
}

export function getProviderName(resource) {
    const source = resource?.source || (resource?.type === "book" ? "amazon" : "torahanytime");
    if (source === "youtube") return "YouTube";
    if (source === "itorah") return "iTorah";
    if (source === "amazon") return "Amazon";
    return "TorahAnytime";
}

export function getResourceTypeLabel(resource) {
    if (resource.type === "book") return "Book";
    if (resource.source === "youtube") return "YouTube video";
    if (resource.source === "itorah") return "iTorah video";
    return resource.dialIn ? "Video & dial-in" : "TorahAnytime lecture";
}
