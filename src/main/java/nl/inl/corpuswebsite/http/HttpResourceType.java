package nl.inl.corpuswebsite.http;

public enum HttpResourceType {
    API_PRIVATE("private, no-cache"),
    API_PUBLIC("public, max-age=300, stale-while-revalidate=300"),
    ASSET("public, max-age=3600, stale-while-revalidate=3600");

    private final String cacheControlValue;

    HttpResourceType(String cacheControlValue) {
        this.cacheControlValue = cacheControlValue;
    }

    public String cacheControlValue() {
        return cacheControlValue;
    }
}
