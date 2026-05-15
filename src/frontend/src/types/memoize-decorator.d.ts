declare module 'memoize-decorator' {
	export default function memoize<T>(target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T>): void;
}