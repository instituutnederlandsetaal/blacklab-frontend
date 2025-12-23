import axios, { AxiosRequestConfig } from 'axios';
import { probeLocalStorageSynced } from '@/utils/localstore';

/**
 * Global cache validation queue.
 * Manages ETag-based cache validation across multiple endpoints.
 * Waits for all validations to complete before refreshing if any cache was stale.
 */
class CacheValidationQueue {
	private inflight = new Set<string>();
	private staleDetected = false;

	/** Register a validation as in-flight */
	start(key: string) { this.inflight.add(key); }

	/** Mark a validation as complete, optionally flagging staleness */
	complete(key: string, wasStale: boolean) {
		this.inflight.delete(key);
		if (wasStale) this.staleDetected = true;
		this.checkRefresh();
	}

	/** If all validations done and any were stale, refresh the page */
	private checkRefresh() {
		if (this.inflight.size === 0 && this.staleDetected) {
			this.staleDetected = false;
			window.location.reload();
		}
	}
}

const validationQueue = new CacheValidationQueue();

/**
 * Helper to read/write cache entries from localStorage.
 */
const cacheStore = {
	get: <T>(key: string) => probeLocalStorageSynced<T | null>(key, null),
	
	getEtag: (key: string) => localStorage.getItem(`${key}-etag`),
	
	set: <T>(key: string, data: T, etag?: string) => {
		try {
			localStorage.setItem(key, JSON.stringify(data));
			if (etag) localStorage.setItem(`${key}-etag`, etag);
		} catch { /* ignore quota errors */ }
	},
	
	clear: (key: string) => {
		try {
			localStorage.removeItem(key);
			localStorage.removeItem(`${key}-etag`);
		} catch { /* ignore */ }
	}
};

/**
 * Compute a simple hash-based ETag from response data.
 * Used as fallback when server doesn't provide an ETag header.
 * Uses a fast string hash (djb2) - not cryptographic, just for cache validation.
 */
function djb2Hash(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
	}
	// Convert to unsigned 32-bit and then to hex
	return (hash >>> 0).toString(16);
}

function computeFallbackEtag(data: unknown): string {
	return `"fallback-${djb2Hash(JSON.stringify(data))}"`;
}

/**
 * Check if the user is currently authenticated.
 * When authenticated, we should NOT use localStorage caching to prevent
 * leaking private data to other users or sessions.
 */
function isAuthenticated(): boolean {
	// Check for OIDC token in sessionStorage (used by oidc-client-ts)
	// The key format is oidc.user:<authority>:<client_id>
	for (let i = 0; i < sessionStorage.length; i++) {
		const key = sessionStorage.key(i);
		if (key?.startsWith('oidc.user:')) {
			try {
				const data = JSON.parse(sessionStorage.getItem(key) || '{}');
				if (data.access_token) {
					return true;
				}
			} catch { /* ignore parse errors */ }
		}
	}
	return false;
}

interface CachedRequestOptions {
	baseURL: string;
	url: string;
	withCredentials?: boolean;
	config?: AxiosRequestConfig;
}

/**
 * Make a cached request with ETag validation.
 * 
 * IMPORTANT: localStorage caching is ONLY used for unauthenticated (public) requests.
 * For authenticated requests, we skip localStorage entirely to prevent data leakage.
 * The browser's native HTTP cache (controlled by Cache-Control headers) still applies.
 * 
 * Flow for PUBLIC requests:
 * 1. Read cached value and etag from localStorage
 * 2. Start the HTTP request with If-None-Match header (if etag exists)
 * 3. Immediately return cached value if available
 * 4. When response arrives:
 *    - 304: cache is valid, do nothing
 *    - 200: cache was stale or empty, store new value
 * 5. When all inflight validations complete, refresh if any were stale
 * 
 * Flow for AUTHENTICATED requests:
 * 1. Make HTTP request directly (no localStorage)
 * 2. Browser's HTTP cache handles caching (with Cache-Control: private from server)
 * 
 * @param key - Unique cache key for localStorage
 * @param options - Request configuration
 * @returns Promise resolving to cached or fetched data
 */
export function cachedRequest<T>(key: string, options: CachedRequestOptions): Promise<T> {
	// Don't use localStorage caching for authenticated requests
	// This prevents leaking private data to other users
	const useLocalStorageCache = !isAuthenticated();
	
	const { value: cached, isFromStorage } = useLocalStorageCache 
		? cacheStore.get<T>(key)
		: { value: null, isFromStorage: false };
	const cachedEtag = useLocalStorageCache ? cacheStore.getEtag(key) : null;
	
	// Start validation tracking (only matters for public requests with cache)
	if (useLocalStorageCache) {
		validationQueue.start(key);
	}
	
	// Build request config
	const config: AxiosRequestConfig = {
		...options.config,
		withCredentials: options.withCredentials,
		validateStatus: status => (status >= 200 && status < 300) || status === 304,
		headers: cachedEtag ? { ...options.config?.headers, 'If-None-Match': cachedEtag } : options.config?.headers,
	};
	
	// Fire off the request
	const requestPromise = axios.get<T>(options.baseURL + options.url, config)
		.then(response => {
			if (response.status === 304) {
				// Cache is still valid
				if (useLocalStorageCache) validationQueue.complete(key, false);
				return cached!;
			}
			
			// New data received - cache was stale or missing
			// Use server ETag if provided, otherwise compute from response data
			const serverEtag = response.headers['etag'];
			const newEtag = serverEtag || computeFallbackEtag(response.data);
			
			// Only store in localStorage for public requests
			if (useLocalStorageCache) {
				cacheStore.set(key, response.data, newEtag);
				
				// Check if data actually changed (for servers without ETag support)
				// Compare ETags: if we had a cached etag and it matches the new one, data hasn't changed
				const dataUnchanged = cachedEtag && cachedEtag === newEtag;
				const wasStale = isFromStorage && cached !== null && !dataUnchanged;
				validationQueue.complete(key, wasStale);
			}
			
			return response.data;
		})
		.catch(error => {
			// On error, complete without staleness flag
			if (useLocalStorageCache) validationQueue.complete(key, false);
			
			// If we have cached data, use it as fallback
			if (isFromStorage && cached !== null) return cached;
			throw error;
		});
	
	// If we have cached data, return it immediately
	// The request will validate in the background
	if (isFromStorage && cached !== null) {
		console.log('Using cached data for', key);
		return Promise.resolve(cached);
	}
	
	console.log('No cached data for', key);
	// No cache - must wait for the request
	return requestPromise;
}

/**
 * Create a cached endpoint wrapper.
 * Returns a function that makes cached requests to the specified endpoint.
 * 
 * @example
 * ```ts
 * const getCorpusInfo = cachedEndpoint<CorpusInfo>('corpus-info', {
 *   baseURL: '/api/',
 *   url: 'corpus/info'
 * });
 * 
 * // First call: returns cached data immediately (if any), validates in background
 * const info = await getCorpusInfo();
 * ```
 */
export const cachedEndpoint = <T>(
	keyPrefix: string,
	options: CachedRequestOptions
) => (keySuffix?: string) => cachedRequest<T>(
	keySuffix ? `${keyPrefix}-${keySuffix}` : keyPrefix,
	options
);

/**
 * Manually clear a cache entry.
 */
export const clearCache = (key: string) => cacheStore.clear(key);
