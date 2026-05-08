let next = 0;

/** Generate the next UID */
export default function useUid() {
	return (next++).toString();
}
