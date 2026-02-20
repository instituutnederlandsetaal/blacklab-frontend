package nl.inl.corpuswebsite.utils;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Utility class for serving static files with proper HTTP caching (ETag) and range request support.
 * 
 * This handles:
 * - ETag generation based on file last modified time and size
 * - If-None-Match header validation for 304 Not Modified responses
 * - Range request support for partial content (206 Partial Content)
 * - Accept-Ranges header to advertise range support
 */
public class StaticFileHandler {

    private static final int BUFFER_SIZE = 8192;
    private static final Pattern RANGE_PATTERN = Pattern.compile("bytes=(\\d*)-(\\d*)");
    private static final int PUBLIC_MAX_AGE_SECONDS = 300;
    private static final int PRIVATE_MAX_AGE_SECONDS = 120;
    private static final int STALE_WHILE_REVALIDATE_API_SECONDS = 300;
    private static final int STALE_WHILE_REVALIDATE_STATIC_SECONDS = 3600;

    /**
     * Result of checking if the client's cached version is still valid.
     */
    public enum CacheCheckResult {
        /** Client has valid cached version, send 304 */
        NOT_MODIFIED,
        /** Client needs new content, proceed with response */
        NEEDS_CONTENT
    }

    /**
     * Represents a byte range for partial content requests.
     */
    public static class ByteRange {
        public final long start;
        public final long end;
        public final long length;

        public ByteRange(long start, long end, long fileLength) {
            this.start = start;
            this.end = Math.min(end, fileLength - 1);
            this.length = this.end - this.start + 1;
        }
    }

    /**
     * Generate an ETag for a file based on its last modified time and size.
     * Format: W/"lastModified-size" (weak ETag, as we don't hash the actual content)
     */
    public static String generateFileETag(File file) {
        long lastModified = file.lastModified();
        long size = file.length();
        return String.format("W/\"%x-%x\"", lastModified, size);
    }

    /**
     * Generate an ETag for string content by hashing it.
     * Uses MD5 for speed (this is not for security, just cache validation).
     */
    public static String generateContentETag(String content) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] hash = md.digest(content.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder("\"");
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            sb.append("\"");
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // MD5 is always available, but fallback just in case
            return String.format("\"%x\"", content.hashCode());
        }
    }

    /**
     * Check if the client's cached version is still valid.
     * Compares the If-None-Match header with the current ETag.
     * 
     * @param request The HTTP request
     * @param currentETag The current ETag for the resource
     * @return CacheCheckResult indicating if 304 should be sent
     */
    public static CacheCheckResult checkCache(HttpServletRequest request, String currentETag) {
        String ifNoneMatch = request.getHeader("If-None-Match");
        if (ifNoneMatch != null) {
            // Handle multiple ETags in If-None-Match (comma-separated)
            for (String tag : ifNoneMatch.split(",")) {
                String trimmed = tag.trim();
                // Check for "*" which matches any ETag
                if ("*".equals(trimmed) || trimmed.equals(currentETag)) {
                    return CacheCheckResult.NOT_MODIFIED;
                }
                // Also check without weak validator prefix for comparison
                if (currentETag.startsWith("W/") && trimmed.equals(currentETag.substring(2))) {
                    return CacheCheckResult.NOT_MODIFIED;
                }
                if (trimmed.startsWith("W/") && currentETag.equals(trimmed.substring(2))) {
                    return CacheCheckResult.NOT_MODIFIED;
                }
            }
        }
        return CacheCheckResult.NEEDS_CONTENT;
    }

    /**
     * Parse the Range header from a request.
     * Only supports single ranges (not multipart).
     * 
     * @param request The HTTP request
     * @param fileLength The total file length
     * @return The parsed ByteRange, or null if no valid range header
     */
    public static ByteRange parseRangeHeader(HttpServletRequest request, long fileLength) {
        String rangeHeader = request.getHeader("Range");
        if (rangeHeader == null || !rangeHeader.startsWith("bytes=")) {
            return null;
        }

        // We only support single ranges for simplicity
        String rangeSpec = rangeHeader.substring(6);
        if (rangeSpec.contains(",")) {
            // Multiple ranges - not supported, return null to serve full file
            return null;
        }

        Matcher matcher = RANGE_PATTERN.matcher("bytes=" + rangeSpec.trim());
        if (!matcher.matches()) {
            return null;
        }

        String startStr = matcher.group(1);
        String endStr = matcher.group(2);

        long start, end;

        if (startStr.isEmpty()) {
            // Suffix range: bytes=-500 means last 500 bytes
            if (endStr.isEmpty()) {
                return null;
            }
            long suffixLength = Long.parseLong(endStr);
            start = Math.max(0, fileLength - suffixLength);
            end = fileLength - 1;
        } else {
            start = Long.parseLong(startStr);
            if (endStr.isEmpty()) {
                // Open-ended range: bytes=500-
                end = fileLength - 1;
            } else {
                end = Long.parseLong(endStr);
            }
        }

        // Validate range
        if (start < 0 || start >= fileLength || start > end) {
            return null;
        }

        return new ByteRange(start, end, fileLength);
    }

    /**
     * Set ETag and Cache-Control headers on the response.
     */
    private static void setETagAndCacheControl(HttpServletResponse response, String etag, boolean isPublic, int staleWhileRevalidateSeconds) {
        int maxAge = isPublic ? PUBLIC_MAX_AGE_SECONDS : PRIVATE_MAX_AGE_SECONDS;
        String visibility = isPublic ? "public" : "private";
        response.setHeader("ETag", etag);
        response.setHeader("Cache-Control", String.format("%s, max-age=%d, stale-while-revalidate=%d",
            visibility, maxAge, staleWhileRevalidateSeconds));
    }

    /**
     * Copy a byte range from a RandomAccessFile to an OutputStream.
     */
    private static void copyBytes(RandomAccessFile raf, OutputStream out, long offset, long length) throws IOException {
        raf.seek(offset);
        byte[] buffer = new byte[BUFFER_SIZE];
        long remaining = length;
        while (remaining > 0) {
            int toRead = (int) Math.min(buffer.length, remaining);
            int read = raf.read(buffer, 0, toRead);
            if (read == -1) break;
            out.write(buffer, 0, read);
            remaining -= read;
        }
    }

    /**
     * Send a 304 Not Modified response.
     */
    public static void sendNotModified(HttpServletResponse response, String etag) {
        response.setStatus(HttpServletResponse.SC_NOT_MODIFIED);
        response.setHeader("ETag", etag);
        // Don't send body for 304
    }

    /**
     * Send a 416 Range Not Satisfiable response.
     */
    public static void sendRangeNotSatisfiable(HttpServletResponse response, long fileLength) {
        response.setStatus(HttpServletResponse.SC_REQUESTED_RANGE_NOT_SATISFIABLE);
        response.setHeader("Content-Range", "bytes */" + fileLength);
    }

    /**
     * Serve a file with ETag and range support (public caching).
     * Convenience method that defaults to public caching.
     */
    public static void serveFile(HttpServletRequest request, HttpServletResponse response, 
                                  File file, String contentType) throws IOException {
        serveFile(request, response, file, contentType, true);
    }

    /**
     * Serve a file with ETag and range support.
     * Handles all the HTTP caching and partial content logic.
     * 
     * @param request The HTTP request
     * @param response The HTTP response
     * @param file The file to serve
     * @param contentType The MIME type for the file
     * @param isPublic If true, response can be cached by shared caches (proxies/CDNs).
     *                 If false, only the browser's private cache can store the response.
     * @throws IOException if an I/O error occurs
     */
    public static void serveFile(HttpServletRequest request, HttpServletResponse response, 
                                  File file, String contentType, boolean isPublic) throws IOException {
        if (!file.exists() || !file.isFile()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }

        long fileLength = file.length();
        String etag = generateFileETag(file);

        // Check if client's cached version is still valid
        if (checkCache(request, etag) == CacheCheckResult.NOT_MODIFIED) {
            sendNotModified(response, etag);
            return;
        }

        // Set content type
        if (contentType != null) {
            response.setContentType(contentType);
        }

        // Parse range header
        ByteRange range = parseRangeHeader(request, fileLength);

        // Set common headers
        setETagAndCacheControl(response, etag, isPublic, STALE_WHILE_REVALIDATE_STATIC_SECONDS);
        response.setHeader("Accept-Ranges", "bytes");
        response.setDateHeader("Last-Modified", file.lastModified());

        // Set range-dependent headers
        long serveOffset, serveLength;
        if (range != null) {
            response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            response.setHeader("Content-Range", String.format("bytes %d-%d/%d", range.start, range.end, fileLength));
            serveOffset = range.start;
            serveLength = range.length;
        } else {
            response.setStatus(HttpServletResponse.SC_OK);
            serveOffset = 0;
            serveLength = fileLength;
        }
        response.setHeader("Content-Length", String.valueOf(serveLength));

        try (RandomAccessFile raf = new RandomAccessFile(file, "r");
             OutputStream out = response.getOutputStream()) {
            copyBytes(raf, out, serveOffset, serveLength);
        }
    }

    /**
     * Serve string content with ETag support (public caching).
     * Convenience method that defaults to public caching.
     */
    public static boolean serveContent(HttpServletRequest request, HttpServletResponse response,
                                       String content, String contentType) throws IOException {
        return serveContent(request, response, content, contentType, true);
    }

    /**
     * Serve string content with ETag support.
     * Used for API responses like corpus info JSON.
     * 
     * @param request The HTTP request
     * @param response The HTTP response
     * @param content The string content to serve
     * @param contentType The content type header value
     * @param isPublic If true, response can be cached by shared caches (proxies/CDNs).
     *                 If false, only the browser's private cache can store the response.
     * @return true if content was sent, false if 304 was returned
     * @throws IOException if an I/O error occurs
     */
    public static boolean serveContent(HttpServletRequest request, HttpServletResponse response,
                                       String content, String contentType, boolean isPublic) throws IOException {
        String etag = generateContentETag(content);

        // Check if client's cached version is still valid
        if (checkCache(request, etag) == CacheCheckResult.NOT_MODIFIED) {
            sendNotModified(response, etag);
            return false;
        }

        response.setStatus(HttpServletResponse.SC_OK);
        response.setHeader("Content-Type", contentType);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        setETagAndCacheControl(response, etag, isPublic, STALE_WHILE_REVALIDATE_API_SECONDS);
        response.getWriter().write(content);
        response.flushBuffer();
        return true;
    }
}
