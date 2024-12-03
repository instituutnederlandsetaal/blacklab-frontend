package nl.inl.corpuswebsite.utils;

import java.util.Optional;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;

/**
 * Since pagination can be disabled, edited by the user through the url, and BlackLab has some peculiarities with values touching document boundaries,
 * We correct the values.
 * Try to keep pageStart static (as long as it is within the document), and slide pageEnd around if it's invalid (negative range, too large).
 *
 * Apply the following rules:
 * - the client only sees numbers within [0, documentLength], these are always set, even when pagination is disabled.
 * - BlackLab sees numbers [1, documentLength - 1], or an omitted value if the value would touch a boundary or pagination is otherwise disabled.
 */
public class PaginationInfo {
    private static final Logger logger = Logger.getLogger(PaginationInfo.class.getName());

    private static final Pattern CAPTURE_DOCLENGTH_PATTERN = Pattern.compile("<lengthInTokens>\\s*(\\d+)\\s*</lengthInTokens>");

    public final int pageSize;
    public final int documentLength;

    public final int clientPageStart;
    public final int clientPageEnd;
    public final Optional<Integer> blacklabPageStart;
    public final Optional<Integer> blacklabPageEnd;

    /**
     *
     * @param pageSize if omitted, pagination is disabled, otherwise a non-zero positive integer is expected
     * @param documentMetadata for retrieving the length
     * @param requestedPageStart the requested start of the page by the client
     * @param requestedPageEnd the requested end of the page by the client
     * @param hitStart if no (or invalid) requestedPageStart and requestedPageEnd, center around this value based on the page size.
     * @param field the field the content of which we're paginating through, or null/empty if main annotated field
     */
    public PaginationInfo(
            Optional<Integer> pageSize,
            Result<String, ? extends Exception> documentMetadata,
            Optional<Integer> requestedPageStart,
            Optional<Integer> requestedPageEnd,
            Optional<Integer> hitStart,
            String field
    ) {

        // Get doc length for the annotated field
        this.documentLength = documentMetadata
                .map(metadata -> PaginationInfo.getDocumentLength(metadata, field))
                .getResult().orElse(Integer.MAX_VALUE);

        this.pageSize = pageSize.orElse(Integer.MAX_VALUE);
        if (pageSize.isEmpty()) {
            // Pagination is disabled.
            this.clientPageEnd = this.documentLength;
            this.clientPageStart = 0;
            this.blacklabPageEnd = Optional.empty();
            this.blacklabPageStart = Optional.empty();
            return;
        }

        // Pagination is enabled.

        // if the user wants a specific hit, generate the correct page, and ignore the requested page start and end.
        if (hitStart.isPresent()) {
            requestedPageStart = Optional.of((hitStart.get() / this.pageSize) * this.pageSize);
            requestedPageEnd = requestedPageStart.map(s -> s + this.pageSize);
            logger.fine("Hitstart was set, modified requestedPageStart: " + requestedPageStart + " requestedPageEnd: " + requestedPageEnd);
        }

        // If nothing supplied at all, default to the first page
        int start = requestedPageStart.orElse(0);
        int end = requestedPageEnd.orElse(Integer.MAX_VALUE);

        // Clamp to doc length etc.
        if (start < 0 || start > documentLength) { start = 0; }
        if (end < start) { end = start + this.pageSize; }
        end = Math.min(end, documentLength); // clamp to doc length
        end = Math.min(end, start + this.pageSize); // clamp to max page length

        // Now they're bounded to [0, documentLength] This is what we send to the frontend
        this.clientPageStart = start;
        this.clientPageEnd = end;

        // But if any of the parameters touches a document border, we don't want to send that to BlackLab
        // as it would chop off leading/trailing document contents if we do, instead we don't want to send anything
        this.blacklabPageStart = start != 0 ? Optional.of(start) : Optional.empty();
        this.blacklabPageEnd = end != documentLength ? Optional.of(end) : Optional.empty();
    }

    private static int getDocumentLength(String documentMetadata, String field) {
        Pattern p;
        boolean isParallel = !StringUtils.isEmpty(field);
        if (isParallel) {
            // Get document length for a specific field (parallel corpora)
            // (note that field may either be full field name like contents__nl or just a version like nl)
            p = Pattern.compile("<fieldName>(?:\\w+__)?" + field + "</fieldName>\\s*<tokenCount>\\s*(\\d+)\\s*</tokenCount>");
        } else {
            // Get document length for main annotated field
            p = CAPTURE_DOCLENGTH_PATTERN;
        }
        Matcher m = p.matcher(documentMetadata);
        if (m.find())
            return Integer.parseInt(m.group(1));
        else
            throw new RuntimeException("Cannot decode document size" + (isParallel ? " for field " + field : "") + ". Unsupported BlackLab version?");
    }
}