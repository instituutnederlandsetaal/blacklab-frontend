import URI from 'urijs';

/**
 * Decode the current url into a valid page state configuration.
 * Keep everything private except the getters
 */
export default abstract class UrlStateParser<T> {
	/**
	 * Path segments of the url this was constructed with, but omitting the root path of the application (usually /corpus-frontend/).
	 * typically something like [INDEX_ID, 'search', 'docs'|'hits']
	 */
	protected paths: string[];
	/** Query parameters parsed into an object, repeated fields are turned into an array, though all values are kept as-is as strings */
	protected params: {[key: string]: string|string[]|null};

	constructor(uri = new URI()) {
		const fullPath = uri.segmentCoded();
		const basePath = new URI(CONTEXT_URL).segmentCoded();
		this.paths = fullPath.slice(basePath.length);
		this.params = uri.search(true) || {};
	}

	public abstract get(): Promise<T>;

	/**
	 * Get the parameter by the name of paramname from our query parameters.
	 * If the parameter is missing or is NaN, the fallback will be returned,
	 * otherwise, the parameter is passed to the validate function (if present), and the result is returned.
	 */
	protected getNumber(paramname: string, fallback: number|null = null, validate?: (value: number)=>number|null): number|null {
		const {[paramname]: prop} = this.params;
		if (typeof prop !== 'string') {
			return fallback;
		}
		const val = Number.parseInt(prop, 10);
		if (isNaN(val)) {
			return fallback;
		}
		return validate ? validate(val) : val;
	}
	/**
	 * Get the parameter by the name of paramname from our query parameters.
	 * If the parameter is missing, the fallback will be returned,
	 * otherwise, the parameter is passed to the validate function (if present), and the result is returned.
	 * NOTE: empty strings are preserved and need to removed using the validation function if needed.
	 */
	protected getString(paramname: string, fallback: string|null = null, mapValue?: (value: string)=>string|null): string|null {
		const {[paramname]: prop} = this.params;
		if (typeof prop !== 'string') {
			return fallback;
		}
		return mapValue ? mapValue(prop) : prop;
	}
	/** If the property is missing altogether or can't be parsed, fallback is returned, otherwise the value is parsed */
	protected getBoolean(paramname: string, fallback: boolean|null = null, validate?: (value: boolean)=>boolean): boolean|null {
		const {[paramname]: prop} = this.params;
		if (typeof prop !== 'string') {
			return fallback;
		}

		// Present but no value (&prop) === null --> true
		// Present with value --> parse
		if (prop === null) {
			return true;
		} else if (['true', 'yes', 'on', 'enable', 'enabled'].includes(prop.toLowerCase())) {
			return true;
		} else if (['', 'false', 'no', 'off', 'disable', 'disabled'].includes(prop.toLowerCase())) {
			return false;
		} else {
			return fallback;
		}
	}
}
