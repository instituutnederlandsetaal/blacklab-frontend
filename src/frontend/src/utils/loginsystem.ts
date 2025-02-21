import { User, UserManager, Log } from 'oidc-client-ts';
import axios from 'axios';

export const userManager = (OIDC_AUTHORITY && OIDC_CLIENT_ID && OIDC_METADATA_URL) ? new UserManager({
	checkSessionIntervalInSeconds: 10,
	prompt: 'login',
	redirect_uri: window.location.origin + CONTEXT_URL + '/callback',
	// prevent hitting timeouts while debugging. Don't set this ridiculously high, or the system breaks and timeout hits instantly.
	// @ts-ignore
	silentRequestTimeoutInSeconds: process.env.NODE_ENV === 'development' ? 300 : 10,
	authority: OIDC_AUTHORITY,
	client_id: OIDC_CLIENT_ID,
	metadataUrl: OIDC_METADATA_URL,
}) : null;

//@ts-ignore
if (process.env.NODE_ENV === 'development') Log.setLogger(console);

export const user: Promise<User|null> = new Promise(async (resolve, reject) => {
	if (!userManager) { return resolve(null); }

	const url = new URL(window.location.href);
	let user: User|null|void = null;
	if (url.searchParams.has('code') || url.searchParams.has('error')) {
		// seems we're in a callback
		try { user = await userManager.signinCallback(); }
		catch { }
		// place back the url without the callback info
		url.searchParams.delete('error');
		url.searchParams.delete('state');
		url.searchParams.delete('session_state');
		url.searchParams.delete('code');
		url.searchParams.delete('scope');
		window.history.replaceState({}, '', url);
	} else {
		// check if we're already logged in
		try {
			const status = await userManager.querySessionStatus({
				// otherwise, we get a hang if the server isn't responding.
				// this can happen for example when the Client isn't whitelisted for the current domain
				// in that case the iframe will fail to load and the promise will never resolve.
				silentRequestTimeoutInSeconds: 5,
			});
			if (status?.sub) {
				// we're logged in, get the user object
				try { user = await userManager.signinSilent(); }
				catch { }
			}
		} catch (e) {
			// not logged in.
		}
	}
	resolve(user ?? null);
});
export const userName = user.then(u => {
	if (u) return u.profile.preferred_username || u.profile.email || u.profile.sub;
	else return axios.get(BLS_URL, { headers: { 'Accept': 'application/json' }}) // use axios as API is not initialized at this point.
		.then(r => r.data)
		.then(r => r.user.id ?? null)
		.catch(e => { console.error('Failed to get username from fallbackUsernameGetter', e); return null; });
})

export function login() { userManager?.signinRedirect({redirect_uri: window.location.href}); }
export function logout() { userManager?.signoutRedirect({post_logout_redirect_uri: window.location.href}); }
