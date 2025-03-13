import Vue from 'vue';
import { CancelableRequest } from '@/utils/loadable-streams';

/** A class that can retrieve items in a paginated way and exposes them along with an error and loading state. */
export default class PaginatedGetter<T> {
	public count: number = 0;
	public results: T|undefined = undefined;
	public loading = false;
	public error = null as string | null;
	public done = false;

	private cancelToken = null as null | (() => void);
	private request: Promise<T> | null = null;

	constructor(
		/** first is 0-indexed, meaning first=20 here means we already have 20 results (index 1...19), and want starting at index 20 */
		private readonly getter: (acc: T|undefined, first: number, count: number) => CancelableRequest<T>,
		public totalCount: number,
		public pageSize: number = 20
	) {
		// make it so we can render this in a vue component reactively, etc.
		Vue.observable(this);
	}

	/** Load the next page, if possible. */
	public next() {
		if (this.loading || this.error) {
			return;
		}

		const first = this.count;
		const count = Math.min(this.pageSize, this.totalCount - first);
		if (count <= 0) {
			return;
		}

		this.loading = true;
		const { request, cancel } = this.getter(this.results, first, count);
		this.cancelToken = cancel;
		this.request = request;
		this.request
			.then(r => { if (this.request === request) { this.results = r; this.count += this.pageSize; } })
			.catch(e => { if (this.request === request) this.error = e.toString(); })
			.finally(() => {
				if (this.request === request) {
					this.loading = false;
					this.cancelToken = this.request = null;
				}
				this.done = this.count >= this.totalCount;
			});
	}

	public cancel() {
		if (this.cancelToken) {
			this.cancelToken();
			this.cancelToken = null;
			this.request = null;
			this.loading = false;
		}
	}
}