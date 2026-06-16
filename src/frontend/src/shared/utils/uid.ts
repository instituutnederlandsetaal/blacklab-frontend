let next = 0;

/** Generate the next uid */
export default function useUid() {
	return (next++).toString();
}
