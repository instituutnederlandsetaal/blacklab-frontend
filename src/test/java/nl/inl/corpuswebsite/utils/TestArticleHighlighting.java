package nl.inl.corpuswebsite.utils;

import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;

import java.io.File;
import java.io.StringReader;
import java.io.StringWriter;

import javax.xml.transform.TransformerFactory;
import javax.xml.transform.stream.StreamResult;
import javax.xml.transform.stream.StreamSource;

import org.junit.Test;

public class TestArticleHighlighting {
    @Test
    public void detectsXmlFragmentsWithAttributedWords() {
        assertTrue(ArticleUtil.containsSourceXml("<blacklabResponse><hl start=\"20\" end=\"33\"><w xml:id=\"en_1611_KJV.1Chr.2.w.21\">sonnes</w></hl></blacklabResponse>"));
        assertTrue(ArticleUtil.containsSourceXml("<ns:w xml:id='word.21'>sonnes</ns:w>"));
        assertFalse(ArticleUtil.containsSourceXml("<?xml version=\"1.0\"?><blacklabResponse>Plain <hl index=\"0\" start=\"20\" end=\"21\">text</hl></blacklabResponse>"));
    }

    @Test
    public void rendersPlainTextHighlightsFromBothBlackLabVersions() {
        assertEquals("<pre>Plain <span class=\"hl\">text</span></pre>", ArticleUtil.renderPlainText("Plain <hl>text</hl>"));
        assertEquals("<pre>Plain <span class=\"hl\" index=\"0\" start=\"20\" end=\"21\">text</span></pre>",
                ArticleUtil.renderPlainText("Plain <hl index=\"0\" start=\"20\" end=\"21\">text</hl>"));
    }

    @Test
    public void preservesHitCoordinatesInAllBuiltInArticleStylesheets() throws Exception {
        TransformerFactory factory = TransformerFactory.newInstance("net.sf.saxon.TransformerFactoryImpl", getClass().getClassLoader());
        for (String stylesheet : new String[] { "article.xsl", "article_tei.xsl", "article_folia.xsl" }) {
            var transformer = factory.newTransformer(new StreamSource(new File("src/main/resources/interface-default/" + stylesheet)));
            StringWriter output = new StringWriter();
            transformer.transform(new StreamSource(new StringReader("<doc><hl start=\"12\" end=\"16\" index=\"0\">Highlighted text</hl></doc>")), new StreamResult(output));
            assertTrue(stylesheet, output.toString().contains("data-hit-start=\"12\""));
            assertTrue(stylesheet, output.toString().contains("data-hit-end=\"16\""));
            assertTrue(stylesheet, output.toString().contains("Highlighted text"));
        }
    }
}
