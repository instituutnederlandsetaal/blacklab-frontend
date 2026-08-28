import { reactive } from 'vue';

/** A class that can retrieve items in a paginated way and exposes them along with an error and loading state. */
export default class PaginatedGetter<T> {
	public count: number = 0;
	public results: T | undefined = undefined;
	public loading = false;
	public error = null as string | null;
	public done = false;

	constructor(
		/** first is 0-indexed, meaning first=20 here means we already have 20 results (index 1...19), and want starting at index 20 */
		private readonly getter: (acc: T | undefined, first: number, count: number) => Promise<T>,
		public totalCount: number,
		public pageSize: number = 20,
	) {
		// make it so we can render this in a vue component reactively, etc.
		return reactive(this) as this;
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
		this.getter(this.results, first, count)
			.then(r => {
				this.results = r;
				this.count += this.pageSize;
			})
			.catch(e => {
				this.error = e.toString();
			})
			.finally(() => {
				this.loading = false;
				this.done = this.count >= this.totalCount;
			});
	}
}
