package nl.inl.corpuswebsite.utils;

import static org.junit.Assert.assertEquals;

import java.util.Optional;

import org.junit.Test;

public class TestPaginationInfo {
    private static PaginationInfo page(int length, Integer size, Integer start, Integer end, Integer hit) {
        return size == null ? new PaginationInfo() : new PaginationInfo(size, length, Optional.ofNullable(start),
                Optional.ofNullable(end), Optional.ofNullable(hit));
    }

    private static void assertBounds(PaginationInfo page, Integer start, Integer end) {
        assertEquals(Optional.ofNullable(start), page.blacklabPageStart);
        assertEquals(Optional.ofNullable(end), page.blacklabPageEnd);
    }

    @Test
    public void omitsDocumentEdgesToPreserveSurroundingMarkup() {
        assertBounds(page(269, 100, 0, 100, null), null, 100);
        assertBounds(page(269, 100, 100, 200, null), 100, 200);
        assertBounds(page(269, 100, 200, 300, null), 200, null);
        assertBounds(page(269, 1000, null, null, null), null, null);
    }

    @Test
    public void repairsInvalidRangesAndKeepsValidCustomStarts() {
        assertBounds(page(269, 100, -10, -5, null), null, 100);
        assertBounds(page(269, 100, 70, 20, null), 70, 170);
        assertBounds(page(269, 100, 70, 70, null), 70, 170);
        assertBounds(page(269, 100, 70, 120, null), 70, 120);
        assertBounds(page(269, 100, 269, null, null), 200, null);
        assertBounds(page(200, 100, 200, 300, null), 100, null);
    }

    @Test
    public void relocatesOnlyValidHitsOutsideTheHalfOpenPage() {
        assertBounds(page(269, 100, 0, 100, 99), null, 100);
        assertBounds(page(269, 100, 0, 100, 100), 100, 200);
        assertBounds(page(269, 100, 70, 120, 99), 70, 120);
        assertBounds(page(269, 100, null, null, 268), 200, null);
        assertBounds(page(269, 100, null, null, 269), null, 100);
        assertBounds(page(269, 100, null, null, -1), null, 100);
    }

    @Test
    public void retrievesWholeDocumentsWhenPaginationIsDisabledOrTheDocumentIsEmpty() {
        for (Integer size : new Integer[] { null, 0, -100 })
            assertBounds(page(269, size, 100, 200, 250), null, null);
        assertBounds(page(0, 100, 100, 200, 0), null, null);
    }

    @Test
    public void handlesLargeOffsetsWithoutOverflow() {
        assertBounds(page(Integer.MAX_VALUE, 100, Integer.MAX_VALUE - 10, null, null), Integer.MAX_VALUE - 10, null);
        assertBounds(page(Integer.MAX_VALUE, Integer.MAX_VALUE, 100, null, null), 100, null);
    }
}
