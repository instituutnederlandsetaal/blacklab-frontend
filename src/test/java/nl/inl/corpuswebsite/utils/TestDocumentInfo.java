package nl.inl.corpuswebsite.utils;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import java.util.Optional;

import org.junit.Test;

import nl.inl.corpuswebsite.config.CorpusConfig;

public class TestDocumentInfo {
    private static final String MAIN = "contents__nl_1939";

    private static DocumentInfo document(String content) throws Exception {
        CorpusConfig corpus = new CorpusConfig("test", "<blacklabResponse><mainAnnotatedField>" + MAIN +
                "</mainAnnotatedField><versionInfo><timeModified>2026-10-16 12:00:00</timeModified></versionInfo></blacklabResponse>", "{}");
        return new DocumentInfo("<blacklabResponse><docInfo>" + content + "</docInfo></blacklabResponse>", corpus);
    }

    private static String count(String field, int count, String key) {
        return "<tokenCount><fieldName>" + field + "</fieldName><" + key + ">" + count + "</" + key + "></tokenCount>";
    }

    @Test
    public void readsMainAndTargetLengthsInBothApiVersions() throws Exception {
        for (String key : new String[] { "tokenCount", "tokens" }) {
            DocumentInfo document = document("<tokenCounts>" + count("contents__de_1460", 0, key) +
                    count(MAIN, 18318, key) + count("contents__en_1611", 21448, key) + "</tokenCounts>");
            assertEquals(18318, document.getLength(Optional.empty()));
            assertEquals(21448, document.getLength(Optional.of("contents__en_1611")));
            assertEquals(21448, document.getLength(Optional.of("en_1611")));
            assertEquals(0, document.getLength(Optional.of("de_1460")));
        }
    }

    @Test
    public void appliesLegacyLengthOnlyToTheMainField() throws Exception {
        DocumentInfo document = document("<lengthInTokens>269</lengthInTokens>");
        assertEquals(269, document.getLength(Optional.empty()));
        assertEquals(269, document.getLength(Optional.of(MAIN)));
        assertEquals(269, document.getLength(Optional.of("nl_1939")));
        assertThrows(IllegalArgumentException.class, () -> document.getLength(Optional.of("contents__en_1611")));
    }

    @Test
    public void resolvesExactNamesAndUnambiguousVersionAliases() throws Exception {
        DocumentInfo document = document("<tokenCounts>" + count("contents__enXextra", 10, "tokens") +
                count("contents__en.extra", 20, "tokens") + count("source&amp;text__en", 30, "tokens") +
                count("translation__en", 40, "tokens") + "</tokenCounts>");
        assertEquals(20, document.getLength(Optional.of("contents__en.extra")));
        assertEquals(30, document.getLength(Optional.of("source&text__en")));
        assertThrows(IllegalArgumentException.class, () -> document.getLength(Optional.of("en")));
        assertThrows(IllegalArgumentException.class, () -> document.getLength(Optional.empty()));
    }
}
