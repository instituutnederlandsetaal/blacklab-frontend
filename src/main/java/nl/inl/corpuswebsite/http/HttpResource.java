package nl.inl.corpuswebsite.http;

import java.io.IOException;
import java.io.InputStream;

public interface HttpResource {
    HttpResourceType getResourceType();

    InputStream openRangeStream(HttpByteRange range) throws IOException;

    InputStream openStream() throws IOException;

    String getETag();

    long getLastModified();

    long getLength();
}