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


import { UserManager, Log } from 'oidc-client-ts';

//@ts-ignore
if (process.env.NODE_ENV === 'development') Log.setLogger(console);

/**
 * This function is meant to run on the main content pages, before other code.
 *
 * Mounts the LoginButton component on the '.username' element.
 * Initialize the login system, check if user is currently logged in, and start an automatic refresh of access tokens if they are.
 * Returns the user (if any).
 *
 * Alternatively, if a fallbackUsernameGetter is provided, it will use that to get the username. (For interop with other application-specific login systems.)
 */

if (OIDC_AUTHORITY && OIDC_CLIENT_ID && OIDC_METADATA_URL) {
	// loading doesn't apply for OIDC flow.
	// Think about it: it would be weird to show loading status when the outcome is you're not logged in yet.
	// And we don't know the outcome yet, so we can't show a loading status.
	// When actually performing an in-flow login, you're not on the page anymore, so you can't show a loading status either.
	const userManager =  new UserManager({
		checkSessionIntervalInSeconds: 10,
		prompt: 'login',
		redirect_uri: window.location.origin + CONTEXT_URL + '/callback',
		// prevent hitting timeouts while debugging. Don't set this ridiculously high, or the system breaks and timeout hits instantly.
		// @ts-ignore
		silentRequestTimeoutInSeconds: process.env.NODE_ENV === 'development' ? 300 : 10,
		authority: OIDC_AUTHORITY,
		client_id: OIDC_CLIENT_ID,
		metadataUrl: OIDC_METADATA_URL,
	});

	await userManager.signinCallback();
}
