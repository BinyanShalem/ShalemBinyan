export const MEETING_PHOTOS_COLLECTION = "admin_meeting_photos";
export const MAX_PHOTO_BATCH = 20;
export const MAX_SOURCE_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 8 * 1024 * 1024;
export const PHOTO_PAGE_SIZE = 24;

const DISPLAY_EDGE = 2400;
const THUMBNAIL_EDGE = 480;
const SUPPORTED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif"
]);
const SUPPORTED_EXTENSIONS = /\.(?:jpe?g|png|webp|heic|heif)$/i;

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

function asDate(value) {
    if (value?.toDate instanceof Function) return value.toDate();
    const parsed = value instanceof Date ? value : new Date(value || 0);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function safePathSegment(value, label) {
    const segment = clean(value);
    if (!segment || segment.length > 180 || segment.includes("/")) {
        throw new TypeError(`${label} is not a valid storage path segment.`);
    }
    return segment;
}

export function meetingPhotoPaths(meetingId, photoId) {
    const meeting = safePathSegment(meetingId, "Meeting ID");
    const photo = safePathSegment(photoId, "Photo ID");
    const base = `admin-meeting-images/${meeting}/${photo}`;
    return {
        storagePath: `${base}/display.jpg`,
        thumbnailPath: `${base}/thumb.jpg`
    };
}

export function normalizeMeetingPhoto(data = {}, id = "") {
    return {
        id: clean(id),
        meetingId: clean(data.meetingId),
        storagePath: clean(data.storagePath),
        thumbnailPath: clean(data.thumbnailPath),
        originalName: clean(data.originalName),
        contentType: data.contentType === "image/jpeg" ? "image/jpeg" : clean(data.contentType),
        size: Number.isFinite(data.size) ? data.size : 0,
        width: Number.isFinite(data.width) ? data.width : 0,
        height: Number.isFinite(data.height) ? data.height : 0,
        createdAt: data.createdAt || null,
        createdBy: clean(data.createdBy),
        previewDisplayBlob: data.previewDisplayBlob || null,
        previewThumbnailBlob: data.previewThumbnailBlob || null
    };
}

export function validateMeetingPhotoBatch(files = []) {
    const selected = Array.from(files);
    const accepted = [];
    const rejected = [];

    selected.forEach((file, index) => {
        const name = clean(file?.name) || `Photo ${index + 1}`;
        if (index >= MAX_PHOTO_BATCH) {
            rejected.push({ file, name, reason: `Choose up to ${MAX_PHOTO_BATCH} photos at one time.` });
            return;
        }
        const type = clean(file?.type).toLocaleLowerCase();
        if (!(SUPPORTED_TYPES.has(type) || (!type && SUPPORTED_EXTENSIONS.test(name)))) {
            rejected.push({ file, name, reason: "Use a JPEG, PNG, WebP, HEIC, or HEIF photo." });
            return;
        }
        if (!Number.isFinite(file?.size) || file.size <= 0) {
            rejected.push({ file, name, reason: "This file is empty or unavailable." });
            return;
        }
        if (file.size > MAX_SOURCE_PHOTO_BYTES) {
            rejected.push({ file, name, reason: "Choose a photo smaller than 20 MB." });
            return;
        }
        accepted.push(file);
    });

    return { accepted, rejected };
}

function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("The browser could not prepare this photo."));
        }, "image/jpeg", quality);
    });
}

async function decodePhoto(file) {
    if (typeof globalThis.createImageBitmap === "function") {
        try {
            const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                dispose: () => bitmap.close?.()
            };
        } catch {
            // Safari can decode some phone formats through an image element even when createImageBitmap cannot.
        }
    }

    if (typeof document === "undefined" || typeof Image === "undefined") {
        throw new Error("Photo preparation is only available in a browser.");
    }
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.decoding = "async";
        image.src = url;
        if (image.decode) await image.decode();
        else await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
        });
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            dispose: () => URL.revokeObjectURL(url)
        };
    } catch (error) {
        URL.revokeObjectURL(url);
        throw Object.assign(error instanceof Error ? error : new Error("Photo could not be opened."), {
            userMessage: "That photo could not be opened. On iPhone, try sharing it as JPEG first."
        });
    }
}

function scaledSize(width, height, maximumEdge) {
    const scale = Math.min(1, maximumEdge / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}

async function renderJpeg(source, sourceWidth, sourceHeight, maximumEdge, quality) {
    const size = scaledSize(sourceWidth, sourceHeight, maximumEdge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("The browser could not prepare this photo.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(source, 0, 0, size.width, size.height);
    return { blob: await canvasBlob(canvas, quality), ...size };
}

export async function prepareMeetingPhoto(file) {
    const { accepted, rejected } = validateMeetingPhotoBatch([file]);
    if (!accepted.length) {
        throw Object.assign(new Error(rejected[0]?.reason || "Choose a supported photo."), {
            userMessage: rejected[0]?.reason || "Choose a supported photo."
        });
    }

    const decoded = await decodePhoto(file);
    try {
        if (!decoded.width || !decoded.height) throw new Error("The photo has no readable dimensions.");
        let display = await renderJpeg(decoded.source, decoded.width, decoded.height, DISPLAY_EDGE, 0.86);
        if (display.blob.size > MAX_STORED_PHOTO_BYTES) {
            display = await renderJpeg(decoded.source, decoded.width, decoded.height, 1800, 0.76);
        }
        if (display.blob.size > MAX_STORED_PHOTO_BYTES) {
            throw Object.assign(new Error("Prepared photo is too large."), {
                userMessage: "That photo is still too large after optimization. Try a smaller copy."
            });
        }
        const thumbnail = await renderJpeg(decoded.source, decoded.width, decoded.height, THUMBNAIL_EDGE, 0.78);
        return {
            displayBlob: display.blob,
            thumbnailBlob: thumbnail.blob,
            width: display.width,
            height: display.height
        };
    } finally {
        decoded.dispose();
    }
}

export function createMeetingPhotoManager({
    db,
    storage,
    auth,
    localPreview = false,
    firestore,
    storageApi,
    confirm = (message) => window.confirm(message)
}) {
    const previewPhotos = new Map();

    function previewRows(meetingId) {
        return [...previewPhotos.values()]
            .filter((photo) => photo.meetingId === meetingId)
            .sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt));
    }

    function setStatus(element, message, tone = "info") {
        element.textContent = message;
        element.className = `status status-${tone} meeting-photo-status`;
        element.hidden = !message;
    }

    function formatDate(value) {
        const date = asDate(value);
        if (!date.getTime()) return "Uploaded just now";
        return `Uploaded ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })}`;
    }

    function storageErrorIsMissing(error) {
        return error?.code === "storage/object-not-found";
    }

    async function removeStorageObject(path) {
        if (!path || localPreview) return;
        try {
            await storageApi.deleteObject(storageApi.ref(storage, path));
        } catch (error) {
            if (!storageErrorIsMissing(error)) throw error;
        }
    }

    function uploadTaskPromise(task, onProgress) {
        return new Promise((resolve, reject) => {
            task.on("state_changed", (snapshot) => {
                onProgress(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
            }, reject, () => resolve(task.snapshot));
        });
    }

    async function uploadPhoto(meeting, file, updateProgress) {
        const prepared = await prepareMeetingPhoto(file);
        const photoRef = localPreview
            ? { id: `preview-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }
            : firestore.doc(firestore.collection(db, MEETING_PHOTOS_COLLECTION));
        const paths = meetingPhotoPaths(meeting.id, photoRef.id);
        const createdBy = localPreview ? "preview" : auth.currentUser?.uid;
        if (!createdBy) {
            throw Object.assign(new Error("Admin session unavailable"), {
                userMessage: "Your admin session is not ready. Lock and reopen the app, then try again."
            });
        }
        const data = {
            meetingId: meeting.id,
            ...paths,
            originalName: clean(file.name).slice(0, 240) || "Photo",
            contentType: "image/jpeg",
            size: prepared.displayBlob.size,
            width: prepared.width,
            height: prepared.height,
            createdAt: localPreview ? new Date() : firestore.serverTimestamp(),
            createdBy
        };

        if (localPreview) {
            previewPhotos.set(photoRef.id, normalizeMeetingPhoto({
                ...data,
                previewDisplayBlob: prepared.displayBlob,
                previewThumbnailBlob: prepared.thumbnailBlob
            }, photoRef.id));
            updateProgress(1);
            return;
        }

        const metadata = (variant) => ({
            contentType: "image/jpeg",
            cacheControl: "private, max-age=0, no-store",
            customMetadata: { meetingId: meeting.id, photoId: photoRef.id, createdBy, variant }
        });
        let displayUploaded = false;
        let thumbnailUploaded = false;
        try {
            const displayTask = storageApi.uploadBytesResumable(
                storageApi.ref(storage, paths.storagePath),
                prepared.displayBlob,
                metadata("display")
            );
            await uploadTaskPromise(displayTask, (progress) => updateProgress(progress * 0.88));
            displayUploaded = true;
            const thumbnailTask = storageApi.uploadBytesResumable(
                storageApi.ref(storage, paths.thumbnailPath),
                prepared.thumbnailBlob,
                metadata("thumbnail")
            );
            await uploadTaskPromise(thumbnailTask, (progress) => updateProgress(0.88 + progress * 0.1));
            thumbnailUploaded = true;
            await firestore.setDoc(photoRef, data);
            updateProgress(1);
        } catch (error) {
            if (thumbnailUploaded) await removeStorageObject(paths.thumbnailPath).catch(() => {});
            if (displayUploaded) await removeStorageObject(paths.storagePath).catch(() => {});
            throw error;
        }
    }

    async function queryMeetingPhotos(meetingId, lastDocument = null) {
        if (localPreview) return { photos: previewRows(meetingId), lastDocument: null, done: true };
        const clauses = [
            firestore.where("meetingId", "==", meetingId),
            firestore.orderBy("createdAt", "desc")
        ];
        if (lastDocument) clauses.push(firestore.startAfter(lastDocument));
        clauses.push(firestore.limit(PHOTO_PAGE_SIZE));
        const snapshot = await firestore.getDocs(firestore.query(
            firestore.collection(db, MEETING_PHOTOS_COLLECTION),
            ...clauses
        ));
        return {
            photos: snapshot.docs.map((item) => normalizeMeetingPhoto(item.data(), item.id)),
            lastDocument: snapshot.docs.at(-1) || null,
            done: snapshot.size < PHOTO_PAGE_SIZE
        };
    }

    function photoBlob(photo, thumbnail = false) {
        if (localPreview) return Promise.resolve(thumbnail ? photo.previewThumbnailBlob : photo.previewDisplayBlob);
        const path = thumbnail ? photo.thumbnailPath : photo.storagePath;
        const maximum = thumbnail ? 2 * 1024 * 1024 : MAX_STORED_PHOTO_BYTES;
        return storageApi.getBlob(storageApi.ref(storage, path), maximum);
    }

    function loadImage(image, photo, thumbnail = false) {
        photoBlob(photo, thumbnail).then((blob) => {
            if (!blob || !image.isConnected) return;
            const url = URL.createObjectURL(blob);
            const release = () => URL.revokeObjectURL(url);
            image.addEventListener("load", release, { once: true });
            image.addEventListener("error", release, { once: true });
            image.src = url;
        }).catch(() => {
            if (!image.isConnected) return;
            image.closest(".meeting-photo-thumb")?.classList.add("is-unavailable");
            image.alt = "Photo unavailable";
        });
    }

    function openViewer(photo) {
        const dialog = document.createElement("dialog");
        dialog.className = "meeting-photo-viewer";
        dialog.setAttribute("aria-label", "Meeting photo viewer");
        const shell = document.createElement("div");
        shell.className = "meeting-photo-viewer-shell";
        const close = document.createElement("button");
        close.className = "button button-secondary meeting-photo-viewer-close";
        close.type = "button";
        close.textContent = "Close";
        const loading = document.createElement("p");
        loading.className = "meeting-photo-viewer-loading";
        loading.textContent = "Opening private photo…";
        const image = document.createElement("img");
        image.className = "meeting-photo-viewer-image";
        image.alt = photo.originalName || "Meeting photo";
        image.hidden = true;
        shell.append(close, loading, image);
        dialog.appendChild(shell);
        document.body.appendChild(dialog);
        let url = "";
        const dispose = () => {
            if (url) URL.revokeObjectURL(url);
            dialog.remove();
        };
        close.addEventListener("click", () => dialog.close());
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) dialog.close();
        });
        dialog.addEventListener("close", dispose, { once: true });
        dialog.showModal();
        photoBlob(photo).then((blob) => {
            if (!dialog.isConnected || !blob) return;
            url = URL.createObjectURL(blob);
            image.src = url;
            image.hidden = false;
            loading.remove();
        }).catch(() => {
            loading.textContent = "This photo could not be opened. Check the connection and try again.";
            loading.dataset.tone = "error";
        });
    }

    async function deletePhoto(photo) {
        if (localPreview) {
            previewPhotos.delete(photo.id);
            return;
        }
        await removeStorageObject(photo.thumbnailPath);
        await removeStorageObject(photo.storagePath);
        await firestore.deleteDoc(firestore.doc(db, MEETING_PHOTOS_COLLECTION, photo.id));
    }

    function mount(container, meeting, { compact = false } = {}) {
        const state = { photos: [], lastDocument: null, done: false, loading: false, generation: 0 };
        container.replaceChildren();
        container.className = `meeting-photo-panel${compact ? " is-compact" : ""}`;
        container.dataset.meetingId = meeting.id;

        const heading = document.createElement("div");
        heading.className = "meeting-photo-heading";
        const headingCopy = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = "Photos";
        const description = document.createElement("p");
        description.textContent = "Private to the admin. Photos stay with this meeting and are never sent to the AI assistant.";
        headingCopy.append(title, description);
        const uploadLabel = document.createElement("label");
        uploadLabel.className = "button button-secondary meeting-photo-upload";
        uploadLabel.textContent = "Add photos";
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
        input.multiple = true;
        input.className = "sr-only";
        input.setAttribute("aria-label", `Add photos to meeting with ${meeting.names || "this contact"}`);
        uploadLabel.appendChild(input);
        heading.append(headingCopy, uploadLabel);

        const status = document.createElement("p");
        status.className = "status meeting-photo-status";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        status.hidden = true;
        const queue = document.createElement("div");
        queue.className = "meeting-photo-queue";
        const grid = document.createElement("div");
        grid.className = "meeting-photo-grid";
        const empty = document.createElement("p");
        empty.className = "meeting-photo-empty";
        empty.textContent = "No photos are attached to this meeting yet.";
        empty.hidden = true;
        const loadMore = document.createElement("button");
        loadMore.className = "button button-secondary meeting-photo-load-more";
        loadMore.type = "button";
        loadMore.textContent = "Load more photos";
        loadMore.hidden = true;
        container.append(heading, status, queue, grid, empty, loadMore);

        function render() {
            grid.replaceChildren();
            empty.hidden = state.loading || state.photos.length !== 0;
            loadMore.hidden = state.loading || state.done || state.photos.length === 0;
            state.photos.forEach((photo) => {
                const card = document.createElement("article");
                card.className = "meeting-photo-card";
                const preview = document.createElement("button");
                preview.className = "meeting-photo-thumb";
                preview.type = "button";
                preview.setAttribute("aria-label", `Open ${photo.originalName || "meeting photo"}`);
                const image = document.createElement("img");
                image.alt = photo.originalName || "Meeting photo";
                image.loading = "lazy";
                preview.appendChild(image);
                preview.addEventListener("click", () => openViewer(photo));
                const footer = document.createElement("div");
                footer.className = "meeting-photo-card-footer";
                const meta = document.createElement("span");
                meta.textContent = formatDate(photo.createdAt);
                const remove = document.createElement("button");
                remove.className = "meeting-photo-remove";
                remove.type = "button";
                remove.textContent = "Delete";
                remove.setAttribute("aria-label", `Delete ${photo.originalName || "meeting photo"}`);
                remove.addEventListener("click", async () => {
                    if (!confirm("Permanently delete this photo? This cannot be undone.")) return;
                    remove.disabled = true;
                    remove.textContent = "Deleting…";
                    setStatus(status, "");
                    try {
                        await deletePhoto(photo);
                        state.photos = state.photos.filter(({ id }) => id !== photo.id);
                        render();
                        setStatus(status, "Photo deleted.", "success");
                    } catch (error) {
                        console.error("Could not delete meeting photo:", error);
                        remove.disabled = false;
                        remove.textContent = "Delete";
                        setStatus(status, "The photo could not be deleted. Check the connection and try again.", "error");
                    }
                });
                footer.append(meta, remove);
                card.append(preview, footer);
                grid.appendChild(card);
                loadImage(image, photo, true);
            });
        }

        async function load({ reset = false } = {}) {
            if (state.loading) return;
            state.loading = true;
            const generation = ++state.generation;
            if (reset) {
                state.photos = [];
                state.lastDocument = null;
                state.done = false;
            }
            empty.hidden = true;
            loadMore.hidden = true;
            if (!state.photos.length) grid.setAttribute("aria-busy", "true");
            try {
                const page = await queryMeetingPhotos(meeting.id, state.lastDocument);
                if (generation !== state.generation) return;
                const known = new Set(state.photos.map(({ id }) => id));
                state.photos = [...state.photos, ...page.photos.filter(({ id }) => !known.has(id))];
                state.lastDocument = page.lastDocument;
                state.done = page.done;
                state.loading = false;
                render();
            } catch (error) {
                console.error("Could not load meeting photos:", error);
                setStatus(status, "Photos could not be loaded. Check the connection and try again.", "error");
                empty.hidden = true;
            } finally {
                state.loading = false;
                grid.removeAttribute("aria-busy");
                loadMore.hidden = state.done || state.photos.length === 0;
            }
        }

        loadMore.addEventListener("click", () => load());
        input.addEventListener("change", async () => {
            const { accepted, rejected } = validateMeetingPhotoBatch(input.files);
            input.value = "";
            queue.replaceChildren();
            setStatus(status, "");
            if (!accepted.length) {
                setStatus(status, rejected[0]?.reason || "Choose at least one supported photo.", "error");
                return;
            }
            uploadLabel.classList.add("is-disabled");
            input.disabled = true;
            const failures = [...rejected];
            for (const file of accepted) {
                const item = document.createElement("div");
                item.className = "meeting-photo-queue-item";
                const name = document.createElement("span");
                name.textContent = file.name || "Photo";
                const progress = document.createElement("progress");
                progress.max = 1;
                progress.value = 0;
                const progressLabel = document.createElement("span");
                progressLabel.textContent = "Preparing…";
                item.append(name, progress, progressLabel);
                queue.appendChild(item);
                try {
                    await uploadPhoto(meeting, file, (value) => {
                        progress.value = value;
                        progressLabel.textContent = value >= 1 ? "Uploaded" : `${Math.max(1, Math.round(value * 100))}%`;
                    });
                    item.dataset.state = "complete";
                } catch (error) {
                    console.error("Could not upload meeting photo:", error);
                    failures.push({ file, name: file.name || "Photo", reason: error?.userMessage || "Upload failed." });
                    item.dataset.state = "error";
                    progress.remove();
                    progressLabel.textContent = error?.userMessage || "Upload failed";
                }
            }
            uploadLabel.classList.remove("is-disabled");
            input.disabled = false;
            await load({ reset: true });
            const uploaded = accepted.length - failures.filter(({ file }) => accepted.includes(file)).length;
            queue.querySelectorAll('[data-state="complete"]').forEach((item) => item.remove());
            if (failures.length) {
                const first = failures[0];
                setStatus(status, `${uploaded ? `${uploaded} uploaded. ` : ""}${first.name}: ${first.reason}`, "error");
            } else {
                setStatus(status, `${uploaded} ${uploaded === 1 ? "photo" : "photos"} attached to this meeting.`, "success");
            }
        });

        void load({ reset: true });
        return { reload: () => load({ reset: true }) };
    }

    async function deleteMeetingPhotos(meetingId) {
        if (localPreview) {
            previewRows(meetingId).forEach(({ id }) => previewPhotos.delete(id));
            return;
        }
        const snapshot = await firestore.getDocs(firestore.query(
            firestore.collection(db, MEETING_PHOTOS_COLLECTION),
            firestore.where("meetingId", "==", meetingId)
        ));
        for (const item of snapshot.docs) {
            const photo = normalizeMeetingPhoto(item.data(), item.id);
            await removeStorageObject(photo.thumbnailPath);
            await removeStorageObject(photo.storagePath);
            await firestore.deleteDoc(item.ref);
        }
    }

    return { mount, deleteMeetingPhotos };
}
