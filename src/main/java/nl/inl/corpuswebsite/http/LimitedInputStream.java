package nl.inl.corpuswebsite.http;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;

final class LimitedInputStream extends FilterInputStream {
    private long remaining;

    LimitedInputStream(InputStream in, long length) {
        super(in);
        this.remaining = Math.max(0, length);
    }

    @Override
    public int read() throws IOException {
        if (remaining <= 0) {
            return -1;
        }

        int result = super.read();
        if (result != -1) {
            remaining--;
        }
        return result;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        if (remaining <= 0) {
            return -1;
        }

        int toRead = (int) Math.min(len, remaining);
        int read = super.read(b, off, toRead);
        if (read > 0) {
            remaining -= read;
        }
        return read;
    }

    @Override
    public long skip(long n) throws IOException {
        long toSkip = Math.min(n, remaining);
        long skipped = super.skip(toSkip);
        remaining -= skipped;
        return skipped;
    }
}