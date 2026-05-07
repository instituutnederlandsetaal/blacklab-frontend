interface JQueryStatic {
	extendext<A,B>(deep?: boolean, arrayMode?: 'replace'|'concat'|'extend'|'default', target?: A, b?: B): A & B;
	extendext<A,B,C>(deep?: boolean, arrayMode?: 'replace'|'concat'|'extend'|'default', target?: A, b?: B, c?: C): A & B & C;
	extendext<A,B,C,D>(deep?: boolean, arrayMode?: 'replace'|'concat'|'extend'|'default', target?: A, b?: B, c?: C, d?: D): A & B & C & D;
}

interface JQuery<TElement = HTMLElement> {
	tab(operation: 'hide'|'show'|'dispose'): JQuery<TElement>;
}