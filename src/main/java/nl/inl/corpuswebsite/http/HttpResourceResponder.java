package nl.inl.corpuswebsite.http;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public final class HttpResourceResponder {
    private static final int BUFFER_SIZE = 8192;

    private HttpResourceResponder() {
    }

    public static void serve(HttpServletRequest request,
                             HttpServletResponse response,
                             HttpResource resource,
                             String contentType) throws IOException {
        HttpRequestConditionUtil.Evaluation evaluation = HttpRequestConditionUtil.evaluate(request, resource);

        applyCachingHeaders(response, resource);
        response.setHeader("Accept-Ranges", "bytes");
        if (contentType != null) {
            response.setContentType(contentType);
        }

        if (evaluation.outcome() == HttpRequestConditionUtil.EvaluationOutcome.NOT_MODIFIED) {
            response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
            return;
        }

        if (evaluation.outcome() == HttpRequestConditionUtil.EvaluationOutcome.RANGE_NOT_SATISFIABLE) {
            response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
            response.setHeader("Content-Range", "bytes */" + resource.getLength());
            return;
        }

        HttpByteRange range = evaluation.range();
        long responseLength = range != null ? range.length() : resource.getLength();

        if (range != null) {
            response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            response.setHeader("Content-Range", String.format("bytes %d-%d/%d", range.start(), range.end(), range.totalLength()));
        } else {
            response.setStatus(HttpServletResponse.SC_OK);
        }

        response.setContentLengthLong(responseLength);

        if ("HEAD".equalsIgnoreCase(request.getMethod())) {
            return;
        }

        try (InputStream in = range != null ? resource.openRangeStream(range) : resource.openStream();
             OutputStream out = response.getOutputStream()) {
            copy(in, out);
        }
    }

    private static void applyCachingHeaders(HttpServletResponse response, HttpResource resource) {
        response.setHeader("ETag", resource.getETag());
        response.setDateHeader("Last-Modified", resource.getLastModified());
        response.setHeader("Cache-Control", resource.getResourceType().cacheControlValue());
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[BUFFER_SIZE];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
    }
}