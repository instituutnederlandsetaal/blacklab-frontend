
import { createEndpoint } from '@/_new/shared/api/lib/api-utils';

import type { User } from 'oidc-client-ts';

/** How many values to return per attribute when requesting /relations */
const RELATIONS_LIMITVALUES = 1000;

type API = ReturnType<typeof createEndpoint>;

const endpoints = {
	// Communicates with the BlackLab Server instance
	blacklab: null as any as API,

	// Communicates with the frontend's own Java backend (which in turn can communicate with BLS)
	frontend: null as any as API,
};

/** Initialize an endpoint. In a function because urls might be set asynchronously (such as from customjs). */
export function init(which: keyof typeof endpoints, url: string, user: User|null) {
	if (!(which in endpoints)) throw new Error(`Unknown endpoint ${which}`);
	if (endpoints[which]) throw new Error(`Endpoint ${which} already initialized`);
	const headers = {};
	if (user) {
		// Authorization header must be re-created on each request, as the token might have changed
		// So wrap in a getter
		Object.defineProperty(headers, 'Authorization', {
			get() { return `Bearer ${user.access_token}`; },
			enumerable: true,
		});
	}

	endpoints[which] = createEndpoint({
		baseURL: url.replace(/\/*$/, '/'),
		paramsSerializer: params => new URLSearchParams(params).toString(),
		headers,
		params: which === 'blacklab' ? {
			api: '4' // backward compat
		} : undefined,
	});
}







export interface ApiModule {
	blacklab: BlackLabApi;
	frontend: FrontendApi;
}


