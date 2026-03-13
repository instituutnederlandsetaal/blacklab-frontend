package nl.inl.corpuswebsite.http;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;

import jakarta.servlet.http.HttpServletRequest;

public final class HttpRequestConditionUtil {

    public enum EvaluationOutcome {
        CONTINUE,
        NOT_MODIFIED,
        RANGE_NOT_SATISFIABLE
    }

    public record Evaluation(EvaluationOutcome outcome, HttpByteRange range) {
        public static Evaluation continueWith(HttpByteRange range) {
            return new Evaluation(EvaluationOutcome.CONTINUE, range);
        }

        public static Evaluation notModified() {
            return new Evaluation(EvaluationOutcome.NOT_MODIFIED, null);
        }

        public static Evaluation rangeNotSatisfiable() {
            return new Evaluation(EvaluationOutcome.RANGE_NOT_SATISFIABLE, null);
        }
    }

    private HttpRequestConditionUtil() {
    }

    public static Evaluation evaluate(HttpServletRequest request, HttpResource resource) {
        if (isNotModified(request, resource)) {
            return Evaluation.notModified();
        }

        RangeParseResult rangeResult = parseRangeHeader(request.getHeader("Range"), resource.getLength());
        if (rangeResult.status == RangeStatus.NOT_SATISFIABLE) {
            return Evaluation.rangeNotSatisfiable();
        }

        if (rangeResult.status == RangeStatus.VALID
            && !ifRangeAllowsRangeRequest(request.getHeader("If-Range"), resource)) {
            return Evaluation.continueWith(null);
        }

        return Evaluation.continueWith(rangeResult.range);
    }

    private static boolean isNotModified(HttpServletRequest request, HttpResource resource) {
        String currentETag = resource.getETag();
        String ifNoneMatch = request.getHeader("If-None-Match");

        if (ifNoneMatch != null) {
            for (String token : ifNoneMatch.split(",")) {
                String candidate = token.trim();
                if ("*".equals(candidate) || weakETagMatch(candidate, currentETag)) {
                    return true;
                }
            }
            return false;
        }

        long ifModifiedSince;
        try {
            ifModifiedSince = request.getDateHeader("If-Modified-Since");
        } catch (IllegalArgumentException e) {
            return false;
        }

        if (ifModifiedSince < 0) {
            return false;
        }

        long resourceMtimeSeconds = (resource.getLastModified() / 1000L) * 1000L;
        return resourceMtimeSeconds <= ifModifiedSince;
    }

    private static boolean ifRangeAllowsRangeRequest(String ifRange, HttpResource resource) {
        if (ifRange == null || ifRange.isBlank()) {
            return true;
        }

        String trimmed = ifRange.trim();
        if (looksLikeETag(trimmed)) {
            return strongETagMatch(trimmed, resource.getETag());
        }

        return ifRangeDateMatches(trimmed, resource);
    }

    private static boolean ifRangeDateMatches(String ifRange, HttpResource resource) {
        Instant ifRangeDate;
        try {
            ifRangeDate = DateTimeFormatter.RFC_1123_DATE_TIME.parse(ifRange, Instant::from);
        } catch (DateTimeParseException e) {
            return false;
        }

        return resource.getLastModified() <= ifRangeDate.toEpochMilli();
    }

    private static boolean looksLikeETag(String value) {
        return value.startsWith("\"") || value.regionMatches(true, 0, "W/\"", 0, 3);
    }

    private static boolean weakETagMatch(String left, String right) {
        return stripWeakPrefix(left).equals(stripWeakPrefix(right));
    }

    private static boolean strongETagMatch(String left, String right) {
        return !isWeak(left) && !isWeak(right) && left.equals(right);
    }

    private static boolean isWeak(String etag) {
        return etag.toUpperCase(Locale.ROOT).startsWith("W/");
    }

    private static String stripWeakPrefix(String etag) {
        String trimmed = etag.trim();
        return isWeak(trimmed) ? trimmed.substring(2).trim() : trimmed;
    }

    private static RangeParseResult parseRangeHeader(String rangeHeader, long resourceLength) {
        if (rangeHeader == null || rangeHeader.isBlank() || !rangeHeader.startsWith("bytes=")) {
            return RangeParseResult.noRange();
        }
        if (resourceLength <= 0) {
            return RangeParseResult.notSatisfiable();
        }

        String spec = rangeHeader.substring(6).trim();
        if (spec.isEmpty() || spec.contains(",")) {
            return RangeParseResult.noRange();
        }

        int dash = spec.indexOf('-');
        if (dash < 0) {
            return RangeParseResult.noRange();
        }

        String startToken = spec.substring(0, dash).trim();
        String endToken = spec.substring(dash + 1).trim();

        try {
            long start;
            long end;

            if (startToken.isEmpty()) {
                if (endToken.isEmpty()) {
                    return RangeParseResult.noRange();
                }
                long suffixLength = Long.parseLong(endToken);
                if (suffixLength <= 0) {
                    return RangeParseResult.notSatisfiable();
                }
                start = Math.max(0, resourceLength - suffixLength);
                end = resourceLength - 1;
            } else {
                start = Long.parseLong(startToken);
                if (start < 0 || start >= resourceLength) {
                    return RangeParseResult.notSatisfiable();
                }

                if (endToken.isEmpty()) {
                    end = resourceLength - 1;
                } else {
                    end = Long.parseLong(endToken);
                    if (end < start) {
                        return RangeParseResult.notSatisfiable();
                    }
                    end = Math.min(end, resourceLength - 1);
                }
            }

            return RangeParseResult.valid(new HttpByteRange(start, end, resourceLength));
        } catch (NumberFormatException e) {
            return RangeParseResult.noRange();
        }
    }

    private enum RangeStatus {
        NONE,
        VALID,
        NOT_SATISFIABLE
    }

    private record RangeParseResult(RangeStatus status, HttpByteRange range) {
        static RangeParseResult noRange() {
            return new RangeParseResult(RangeStatus.NONE, null);
        }

        static RangeParseResult valid(HttpByteRange range) {
            return new RangeParseResult(RangeStatus.VALID, range);
        }

        static RangeParseResult notSatisfiable() {
            return new RangeParseResult(RangeStatus.NOT_SATISFIABLE, null);
        }
    }
}