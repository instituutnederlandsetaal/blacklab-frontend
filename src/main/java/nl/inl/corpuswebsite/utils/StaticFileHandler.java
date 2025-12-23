package nl.inl.corpuswebsite.utils;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

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
     * Set standard caching headers on the response.
     * 
     * @param response The HTTP response
     * @param etag The ETag value
     * @param isPublic If true, use "public" cache directive (allows shared caches).
     *                 If false, use "private" (only browser cache, not proxies/CDNs).
     */
    public static void setCacheHeaders(HttpServletResponse response, String etag, boolean isPublic) {
        response.setHeader("ETag", etag);
        response.setHeader("Accept-Ranges", "bytes");
        // public: can be cached by shared caches (proxies, CDNs)
        // private: only the browser's private cache (for authenticated responses)
        String cacheControl = isPublic 
            ? "public, max-age=604800"  // 7 days for public
            : "private, max-age=300";   // 5 minutes for private (authenticated)
        response.setHeader("Cache-Control", cacheControl);
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
        response.setHeader("ETag", etag);
        response.setHeader("Accept-Ranges", "bytes");
        // public: shared caches can store; private: only browser cache (for authenticated)
        response.setHeader("Cache-Control", isPublic ? "public, max-age=604800" : "private, max-age=300");
        response.setDateHeader("Last-Modified", file.lastModified());

        if (range == null) {
            // Full content response
            response.setStatus(HttpServletResponse.SC_OK);
            response.setHeader("Content-Length", String.valueOf(fileLength));
            
            try (RandomAccessFile raf = new RandomAccessFile(file, "r");
                 OutputStream out = response.getOutputStream()) {
                byte[] buffer = new byte[BUFFER_SIZE];
                long remaining = fileLength;
                while (remaining > 0) {
                    int toRead = (int) Math.min(buffer.length, remaining);
                    int read = raf.read(buffer, 0, toRead);
                    if (read == -1) break;
                    out.write(buffer, 0, read);
                    remaining -= read;
                }
            }
        } else {
            // Partial content response
            response.setStatus(HttpServletResponse.SC_PARTIAL_CONTENT);
            response.setHeader("Content-Length", String.valueOf(range.length));
            response.setHeader("Content-Range", 
                String.format("bytes %d-%d/%d", range.start, range.end, fileLength));

            try (RandomAccessFile raf = new RandomAccessFile(file, "r");
                 OutputStream out = response.getOutputStream()) {
                raf.seek(range.start);
                byte[] buffer = new byte[BUFFER_SIZE];
                long remaining = range.length;
                while (remaining > 0) {
                    int toRead = (int) Math.min(buffer.length, remaining);
                    int read = raf.read(buffer, 0, toRead);
                    if (read == -1) break;
                    out.write(buffer, 0, read);
                    remaining -= read;
                }
            }
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
        response.setHeader("ETag", etag);
        // public: shared caches can store; private: only browser cache (for authenticated)
        response.setHeader("Cache-Control", isPublic ? "public, max-age=300" : "private, no-cache");
        response.getWriter().write(content);
        response.flushBuffer();
        return true;
    }
}
