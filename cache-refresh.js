(() => {
    "use strict";

    const script = document.currentScript;
    const pageVersion = script
        ? new URL(script.src, document.baseURI).searchParams.get("v")
        : "";

    if (!pageVersion) {
        return;
    }

    let lastCheck = 0;

    const checkForUpdate = async (force = false) => {
        const now = Date.now();

        if (!force && now - lastCheck < 60000) {
            return;
        }

        lastCheck = now;

        try {
            const versionUrl = new URL("/site-version.json", window.location.origin);
            versionUrl.searchParams.set("_", String(now));

            const response = await fetch(versionUrl, {
                cache: "no-store",
                credentials: "same-origin"
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json();
            const latestVersion = String(data.version || "");

            if (!latestVersion || latestVersion === pageVersion) {
                return;
            }

            const freshUrl = new URL(window.location.href);

            if (freshUrl.searchParams.get("_site_version") === latestVersion) {
                return;
            }

            freshUrl.searchParams.set("_site_version", latestVersion);
            window.location.replace(freshUrl.href);
        } catch {
            // A failed update check should never block the site itself.
        }
    };

    void checkForUpdate(true);

    window.addEventListener("pageshow", () => {
        void checkForUpdate();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            void checkForUpdate();
        }
    });
})();
