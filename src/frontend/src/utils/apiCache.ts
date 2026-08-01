import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { probeLocalStorageSynced } from '@/utils/localstore';
import { debugLog } from './debug';

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
 * Make a cached request with ETag validation.
 * 
 * localStorage caching must be explicitly enabled for public requests only.
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
 * @param request - Receives cache-specific Axios configuration and performs the request
 * @param useLocalStorageCache - Enable only for explicitly public responses
 * @returns Promise resolving to cached or fetched data
 */
export function cachedRequest<T>(
	key: string,
	request: (config: AxiosRequestConfig) => Promise<AxiosResponse<T>>,
	useLocalStorageCache = false
): Promise<T> {
	if (!useLocalStorageCache) {
		// Remove a public entry that may have been created before this request became authenticated.
		cacheStore.clear(key);
	}
	
	const { value: cached, isFromStorage } = useLocalStorageCache 
		? cacheStore.get<T>(key)
		: { value: null, isFromStorage: false };
	const cachedEtag = useLocalStorageCache ? cacheStore.getEtag(key) : null;
	
	// Start validation tracking (only matters for public requests with cache)
	if (useLocalStorageCache) {
		validationQueue.start(key);
	}
	
	// Build request config
	const cacheConfig: AxiosRequestConfig = {
		validateStatus: status => (status >= 200 && status < 300) || status === 304,
		headers: cachedEtag ? { 'If-None-Match': cachedEtag } : undefined,
	};
	
	// Fire off the request
	const requestPromise = request(cacheConfig)
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
			
			// Never persist a response the server marked private or no-store.
			if (useLocalStorageCache) {
				const cacheControl = (response.headers['cache-control'] || '').toLowerCase();
				if (/\b(no-store|private)\b/.test(cacheControl)) {
					cacheStore.clear(key);
					validationQueue.complete(key, isFromStorage && cached !== null);
					return response.data;
				}

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
			const status = error?.response?.status;
			if (useLocalStorageCache) {
				// Never keep serving a cached value after an authentication failure.
				if (status === 401 || status === 403) cacheStore.clear(key);
				validationQueue.complete(key, false);
			}

			if (status === 401 || status === 403) throw error;
			
			// If we have cached data, use it as fallback
			if (isFromStorage && cached !== null) return cached;
			throw error;
		});
	
	// If we have cached data, return it immediately
	// The request will validate in the background
	if (isFromStorage && cached !== null) {
		debugLog('Using cached data for', key, cached);
		return Promise.resolve(cached);
	}
	
	debugLog('No cached data for', key);
	// No cache - must wait for the request
	return requestPromise;
}
