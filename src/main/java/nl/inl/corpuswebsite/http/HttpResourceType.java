package nl.inl.corpuswebsite.http;

public enum HttpResourceType {
    API_PRIVATE("private", 120, 300),
    API_PUBLIC("public", 300, 300),
    ASSET("public", 3600, 3600);

    private final String visibility;
    private final int maxAgeSeconds;
    private final int staleWhileRevalidateSeconds;

    HttpResourceType(String visibility, int maxAgeSeconds, int staleWhileRevalidateSeconds) {
        this.visibility = visibility;
        this.maxAgeSeconds = maxAgeSeconds;
        this.staleWhileRevalidateSeconds = staleWhileRevalidateSeconds;
    }

    public String cacheControlValue() {
        return String.format("%s, max-age=%d, stale-while-revalidate=%d",
            visibility,
            maxAgeSeconds,
            staleWhileRevalidateSeconds);
    }
}