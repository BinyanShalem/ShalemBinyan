export const DIRECTORY_COLLECTION = "admin_directory";
export const DIRECTORY_TYPES = ["Therapist", "Person", "Resource"];

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

export function normalizeDirectoryUrl(value) {
    const raw = clean(value);
    if (!raw) return "";
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    try {
        const url = new URL(candidate);
        if (!['http:', 'https:'].includes(url.protocol)) return "";
        url.protocol = "https:";
        return url.href;
    } catch {
        return "";
    }
}

export function normalizeDirectoryEntry(data = {}, id = "") {
    return {
        id,
        name: clean(data.name),
        type: DIRECTORY_TYPES.includes(data.type) ? data.type : "Person",
        phone: clean(data.phone),
        email: clean(data.email),
        url: normalizeDirectoryUrl(data.url),
        notes: clean(data.notes),
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
    };
}

export function directoryEntryMatches(entry, { search = "", type = "All" } = {}) {
    const normalized = normalizeDirectoryEntry(entry, entry.id);
    if (type !== "All" && normalized.type !== type) return false;
    const query = clean(search).toLocaleLowerCase();
    if (!query) return true;
    return [normalized.name, normalized.type, normalized.phone, normalized.email, normalized.url, normalized.notes]
        .some((value) => value.toLocaleLowerCase().includes(query));
}

export function sortDirectoryEntries(entries = []) {
    return entries
        .map((entry) => normalizeDirectoryEntry(entry, entry.id))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
