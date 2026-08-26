import axios from 'axios';
import type { User } from 'oidc-client-ts';
import { Log, UserManager } from 'oidc-client-ts';
import type { App } from 'vue';

import type { BLServer } from '@/types/blacklabtypes';

import useInjectable from '@/shared/utils/useInjectable';

export type OidcLoginSystemConfig = {
	mode: 'oidc';
	authority: string;
	clientId: string;
	metadataUrl: string;
	contextUrl: string;
};

type BlackLabLoginSystemConfig = {
	mode: 'blacklab';
	blacklabBaseUrl: string;
};

export type LoginSystemConfig = OidcLoginSystemConfig | BlackLabLoginSystemConfig;

type LoginSystem = {
	userManager: UserManager | null;
	user: User | null;
	username: string | null;
	/** The BlackLab implementation version, if we've contacted the server during user negotiation */
	blacklabVersion: string | null;
	login(): void;
	logout(): void;
};

const [_loginSystemInjectionKey, provideLoginSystem, useLoginSystem] = useInjectable<LoginSystem>('loginSystem');

function createUserManager(config: OidcLoginSystemConfig): UserManager {
	return new UserManager({
		checkSessionIntervalInSeconds: 10,
		prompt: 'login',
		redirect_uri: window.location.origin + config.contextUrl + '/callback',
		// prevent hitting timeouts while debugging. Don't set this ridiculously high, or the system breaks and timeout hits instantly.
		silentRequestTimeoutInSeconds: import.meta.env.MODE === 'development' ? 300 : 10,
		authority: config.authority,
		client_id: config.clientId,
		metadataUrl: config.metadataUrl,
	});
}

async function completeOidcLogin(userManager: UserManager): Promise<User | null> {
	const url = new URL(window.location.href);
	let user: User | null | void = null;

	if (url.searchParams.has('code') || url.searchParams.has('error')) {
		// seems we're in a callback
		try {
			user = await userManager.signinCallback();
		} catch {}
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
				try {
					user = await userManager.signinSilent();
				} catch {}
			}
		} catch {
			// not logged in.
		}
	}

	return user ?? null;
}

async function getBlackLabLoginData(blacklabBaseUrl: string): Promise<{ username: string | null; blacklabVersion: string | null }> {
	try {
		const response = await axios.get<BLServer>(blacklabBaseUrl, { headers: { Accept: 'application/json' } });
		return {
			username: response.data.user.id ?? null,
			blacklabVersion: response.data.blacklabVersion ?? null,
		};
	} catch (e) {
		console.error('Failed to get username from BlackLab', e);
		return { username: null, blacklabVersion: null };
	}
}

export async function createLoginSystem(config: LoginSystemConfig) {
	if (import.meta.env.MODE === 'development') Log.setLogger(console);

	const userManager = config.mode === 'oidc' ? createUserManager(config) : null;
	const user = userManager ? await completeOidcLogin(userManager) : null;
	const blacklabLoginData = config.mode === 'blacklab' ? await getBlackLabLoginData(config.blacklabBaseUrl) : { username: null, blacklabVersion: null };
	const username = userManager ? user?.profile.preferred_username || user?.profile.email || user?.profile.sub || null : blacklabLoginData.username;

	const context: LoginSystem = {
		userManager,
		user,
		username,
		blacklabVersion: blacklabLoginData.blacklabVersion,
		login() {
			void userManager?.signinRedirect({ redirect_uri: window.location.href });
		},
		logout() {
			void userManager?.signoutRedirect({ post_logout_redirect_uri: window.location.href });
		},
	};

	return {
		...context,
		install(app: App) {
			provideLoginSystem(app, context);
		},
	};
}

export { useLoginSystem };
