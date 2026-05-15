interface URI {
	// URI js also accepts numbers and undefineds as parameters here, but type definitions for the lib don't.
	search(qry: { [key: string]: string | string[] | number | undefined | boolean; }): URI;
}