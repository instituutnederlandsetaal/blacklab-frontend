package nl.inl.corpuswebsite.utils;

import java.util.Optional;

/** Validates half-open token ranges and omits boundaries that would cut off document markup. */
public class PaginationInfo {
    public final Optional<Integer> blacklabPageStart;
    public final Optional<Integer> blacklabPageEnd;

    /** Request the complete document, preserving its enclosing markup. */
    public PaginationInfo() {
        blacklabPageStart = Optional.empty();
        blacklabPageEnd = Optional.empty();
    }

    public PaginationInfo(
            int pageSize,
            int documentLength,
            Optional<Integer> requestedPageStart,
            Optional<Integer> requestedPageEnd,
            Optional<Integer> hitStart
    ) {
        if (documentLength < 0) throw new IllegalArgumentException("Negative document size");
        if (pageSize <= 0 || documentLength == 0) {
            this.blacklabPageStart = Optional.empty();
            this.blacklabPageEnd = Optional.empty();
            return;
        }

        int start = Math.max(0, requestedPageStart.orElse(0));
        if (start >= documentLength)
            start = ((documentLength - 1) / pageSize) * pageSize;
        long maximumEnd = Math.min((long) documentLength, (long) start + pageSize);
        int end = requestedPageEnd.orElse((int) maximumEnd);
        if (end <= start) end = (int) maximumEnd;
        end = (int) Math.min(end, maximumEnd);

        if (hitStart.isPresent() && hitStart.get() >= 0 && hitStart.get() < documentLength &&
                (hitStart.get() < start || hitStart.get() >= end)) {
            start = (hitStart.get() / pageSize) * pageSize;
            end = (int) Math.min((long) documentLength, (long) start + pageSize);
        }

        this.blacklabPageStart = start == 0 ? Optional.empty() : Optional.of(start);
        this.blacklabPageEnd = end == documentLength ? Optional.empty() : Optional.of(end);
    }
}
