package nl.inl.corpuswebsite.http;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;

public class FileHttpResource implements HttpResource {
    private final File file;
    private final HttpResourceType resourceType;
    private final String etag;
    private final long lastModified;
    private final long length;

    private FileHttpResource(File file, HttpResourceType resourceType) {
        this.file = file;
        this.resourceType = resourceType;
        this.lastModified = file.lastModified();
        this.length = file.length();
        this.etag = generateWeakETag(file);
    }

    public static FileHttpResource fromFile(File file, HttpResourceType resourceType) {
        if (file == null || !file.exists() || !file.isFile()) {
            throw new IllegalArgumentException("Can only create file resource from an existing file");
        }
        return new FileHttpResource(file, resourceType);
    }

    @Override
    public HttpResourceType getResourceType() {
        return resourceType;
    }

    @Override
    public InputStream openRangeStream(HttpByteRange range) throws IOException {
        FileInputStream in = new FileInputStream(file);
        in.skipNBytes(range.start());
        return new LimitedInputStream(in, range.length());
    }

    @Override
    public InputStream openStream() throws IOException {
        return new FileInputStream(file);
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
        return length;
    }

    private static String generateWeakETag(File file) {
        return String.format("W/\"%x-%x\"", file.lastModified(), file.length());
    }
}