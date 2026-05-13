/**
 * This is the main javascript bundle for the OIDC callback page.
 * OIDC works by first redirecting the user to a login page, and then after login, that page redirecting back to a callback page.
 * The callback page will have an extra parameter in the url, which contains the tokens.
 *
 * If we're restoring a session, this happens in an iframe.
 * The iframe will then send the tokens to the parent frame (the main page).
 * After which the parent frame has the user info, and the iframe can be removed.
 *
 * If we're logging in, the callback page will redirect to the main page, with the tokens in the url.
 */

import { Log, UserManager } from 'oidc-client-ts';

if (import.meta.env.MODE === 'development') Log.setLogger(console);

if (OIDC_AUTHORITY && OIDC_CLIENT_ID && OIDC_METADATA_URL) {
	// loading doesn't apply for OIDC flow.
	// Think about it: it would be weird to show loading status when the outcome is you're not logged in yet.
	// And we don't know the outcome yet, so we can't show a loading status.
	// When actually performing an in-flow login, you're not on the page anymore, so you can't show a loading status either.
	const userManager = new UserManager({
		checkSessionIntervalInSeconds: 10,
		prompt: 'login',
		redirect_uri: window.location.origin + CONTEXT_URL + '/callback',
		// prevent hitting timeouts while debugging. Don't set this ridiculously high, or the system breaks and timeout hits instantly.
		silentRequestTimeoutInSeconds: import.meta.env.MODE === 'development' ? 300 : 10,
		authority: OIDC_AUTHORITY,
		client_id: OIDC_CLIENT_ID,
		metadataUrl: OIDC_METADATA_URL,
	});

	await userManager.signinCallback();
}
