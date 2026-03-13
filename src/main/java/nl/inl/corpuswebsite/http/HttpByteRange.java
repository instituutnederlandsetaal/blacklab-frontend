package nl.inl.corpuswebsite.http;

public record HttpByteRange(long start, long end, long totalLength) {
    public long length() {
        return end - start + 1;
    }
}