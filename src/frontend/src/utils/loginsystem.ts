import { User, UserManager, Log } from 'oidc-client-ts';
import LoginButton from '@/components/LoginButton.vue';
import { BLServer } from '@/types/blacklabtypes';
import axios from 'axios';
import { handleError } from '@/api/apiutils';
import { debugLogCat } from './debug';


// Separate from loginsystem.ts to prevent circular dependency between LoginButton and loginsystem.
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
export async function awaitInit(settings: {
	oidc: {
		authority: string,
		client_id: string,
		metadataUrl: string,
	},
	fallbackUsername: () => Promise<string|null|undefined>,
} = {
	oidc: {
		authority: OIDC_AUTHORITY || '',
		client_id: OIDC_CLIENT_ID || '',
		metadataUrl: OIDC_METADATA_URL || '',
	},
	fallbackUsername: () => axios.get(BLS_URL, {
		method: 'GET',
		headers: { 'Accept': 'application/json', }
	})
	.then(r => r.data as BLServer)
	.then(r => r.user.id)
	.catch(handleError)
}): Promise<User|null> {
	const loginButton= new LoginButton();
	loginButton.$mount('#username');

	if (settings.oidc && settings.oidc.authority && settings.oidc.client_id && settings.oidc.metadataUrl) {
		// loading doesn't apply for OIDC flow.
		// Think about it: it would be weird to show loading status when the outcome is you're not logged in yet.
		// And we don't know the outcome yet, so we can't show a loading status.
		// When actually performing an in-flow login, you're not on the page anymore, so you can't show a loading status either.
		const userManager =  new UserManager({
			checkSessionIntervalInSeconds: 10,
			prompt: 'login',
			redirect_uri: new URL(CONTEXT_URL + '/callback', window.location.origin).href,
			// prevent hitting timeouts while debugging. Don't set this ridiculously high, or the system breaks and timeout hits instantly.
			// @ts-ignore
			silentRequestTimeoutInSeconds: process.env.NODE_ENV === 'development' ? 300 : 10,
			...settings.oidc
		});
		let user: User | null | undefined | void = null;

		const url = new URL(window.location.href);
		if (url.searchParams.has('code') || url.searchParams.has('error')) {
			// seems we're in a callback
			try { user = await userManager.signinCallback(); }
			catch { }
			url.searchParams.delete('error');
			url.searchParams.delete('state');
			url.searchParams.delete('session_state');
			url.searchParams.delete('code');
			url.searchParams.delete('scope');
			// place back the url without the callback info
			debugLogCat('history', `Calling replaceState with URL: ${url}`);
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

		loginButton.$on('login', () => userManager?.signinRedirect({redirect_uri: window.location.href}));
		loginButton.$on('logout', () => userManager?.signoutRedirect({post_logout_redirect_uri: window.location.href}));
		loginButton.$props.canLogin = true;
		loginButton.$props.enabled = true;

		if (user) {
			userManager.startSilentRenew();
			loginButton.$props.username = user.profile.preferred_username || user.profile.email || user.profile.sub;
		}
		return user || null; // normalize weird void type to null.
	} else if (settings.fallbackUsername) {
		// username provided by some other mechanism
		// no user object, so we can just return 0 and do this async
		settings
		.fallbackUsername()
		.then(username => {
			loginButton.$props.username = username;
			if (username) loginButton.$props.enabled = true;
		})
		.catch(e => console.error('Failed to get username from fallbackUsernameGetter', e));
		return null;
	}
	return null;
}
