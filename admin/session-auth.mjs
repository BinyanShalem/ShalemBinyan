function sessionError(code) {
    return Object.assign(new Error("Admin session unavailable"), { code });
}

export function isTransientAdminSessionError(error) {
    return [
        "auth/network-request-failed", "auth/timeout", "auth/internal-error",
        "auth/too-many-requests", "functions/unavailable", "functions/deadline-exceeded"
    ].includes(error?.code);
}

// The remembered flag controls the opening screen. Only a valid, server-issued
// Firebase admin claim can authorize the workspace.
export function createAdminSessionAuth({ auth, persistence, setPersistence, signInAnonymously, adminLogin }) {
    let initialization;
    let anonymousSignIn;

    async function ready() {
        if (!initialization) {
            initialization = (async () => {
                await auth.authStateReady();
                await setPersistence(auth, persistence);
            })().catch((error) => {
                initialization = undefined;
                throw error;
            });
        }
        await initialization;
    }

    function requireSameUser(user) {
        if (!user || auth.currentUser?.uid !== user.uid) {
            throw sessionError("auth/session-changed");
        }
    }

    async function hasAdminClaim(user, forceRefresh = true) {
        requireSameUser(user);
        const token = await user.getIdTokenResult(forceRefresh);
        requireSameUser(user);
        return token.claims?.admin === true;
    }

    async function restore({ remembered = false } = {}) {
        if (!remembered) return false;
        await ready();
        const user = auth.currentUser;
        if (!user) return false;
        if (await hasAdminClaim(user, false)) return true;
        // Existing devices may have been authorized since their cached token
        // was issued. Refresh those devices without changing their identity.
        return hasAdminClaim(user);
    }

    async function unlock(password) {
        await ready();
        if (!auth.currentUser) {
            if (!anonymousSignIn) {
                anonymousSignIn = Promise.resolve().then(() => signInAnonymously(auth))
                    .finally(() => { anonymousSignIn = undefined; });
            }
            await anonymousSignIn;
        }
        const user = auth.currentUser;
        requireSameUser(user);
        const result = await adminLogin({ password });
        requireSameUser(user);
        if (result?.authenticated !== true || !await hasAdminClaim(user)) {
            throw sessionError("auth/admin-required");
        }
        return user;
    }

    return { restore, unlock };
}
