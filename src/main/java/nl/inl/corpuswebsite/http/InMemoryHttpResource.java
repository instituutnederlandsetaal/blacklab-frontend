package nl.inl.corpuswebsite.http;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

public class InMemoryHttpResource implements HttpResource {
    private final byte[] data;
    private final HttpResourceType resourceType;
    private final String etag;
    private final long lastModified;

    private InMemoryHttpResource(byte[] data, HttpResourceType resourceType, long lastModified) {
        this.data = Arrays.copyOf(data, data.length);
        this.resourceType = resourceType;
        this.lastModified = lastModified;
        this.etag = generateStrongETag(this.data);
    }

    public static InMemoryHttpResource fromBytes(byte[] data, HttpResourceType resourceType, long lastModified) {
        return new InMemoryHttpResource(data, resourceType, lastModified);
    }

    public static InMemoryHttpResource fromString(String content, HttpResourceType resourceType, long lastModified) {
        return fromBytes(content.getBytes(StandardCharsets.UTF_8), resourceType, lastModified);
    }

    @Override
    public HttpResourceType getResourceType() {
        return resourceType;
    }

    @Override
    public InputStream openRangeStream(HttpByteRange range) {
        return new ByteArrayInputStream(data, (int) range.start(), (int) range.length());
    }

    @Override
    public InputStream openStream() {
        return new ByteArrayInputStream(data);
    }

    @Override
    public String getETag() {
        return etag;
    }

    @Override
    public long getLastModified() {
        return lastModified;
    }

    @Override
    public long getLength() {
        return data.length;
    }

    private static String generateStrongETag(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(bytes);
            StringBuilder sb = new StringBuilder("\"");
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            sb.append("\"");
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return String.format("\"%x\"", Arrays.hashCode(bytes));
        }
    }
}