package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.io.StringReader;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

import javax.servlet.http.HttpServletResponse;
import javax.xml.transform.TransformerException;

import org.apache.commons.lang3.StringUtils;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.MainServlet;
import nl.inl.corpuswebsite.utils.QueryServiceHandler;
import nl.inl.corpuswebsite.utils.QueryServiceHandler.QueryException;
import nl.inl.corpuswebsite.utils.XslTransformer;

public class ArticleResponse extends BaseResponse {

    /** Default transformer that translates <hl> tags into highlighted spans and outputs all text */
    private static final XslTransformer defaultTransformer;

    /** Matches xml open/void tags &lt;namespace:tagname attribute="value"/&gt; excluding hl tags, as those are inserted by blacklab and can result in false positives */
    private static final Pattern XML_TAG_PATTERN = Pattern.compile("<([\\w]+:)?((?!(hl|blacklabResponse|[xX][mM][lL])\\b)[\\w.]+)(\\s+[\\w\\.]+=\"[\\w\\s,]*\")*\\/?>");

    static {
        try {
            // @formatter:off
            defaultTransformer = new XslTransformer(new StringReader(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
                "<xsl:stylesheet version=\"2.0\" xmlns:xsl=\"http://www.w3.org/1999/XSL/Transform\">" +
                    "<xsl:output encoding=\"utf-8\" method=\"html\" omit-xml-declaration=\"yes\" />" +
                    "<xsl:template match=\"*[local-name(.)='hl']\">" +
                        "<span class=\"hl\">" +
                        "<xsl:apply-templates select=\"node()\"/>" +
                        "</span>" +
                    "</xsl:template>" +
                "</xsl:stylesheet>"));
            // @formatter:on
        } catch (TransformerException e) {
            throw new RuntimeException(e);
        }
    }

    public ArticleResponse() {
        super(true);
    }

    @Override
    protected void completeRequest() throws IOException {
        if (pathParameters.size() != 1) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "Invalid document id format " + StringUtils.join(pathParameters, '/'));
            return;
        }

        String pid = pathParameters.get(0);
        if (pid == null || pid.isEmpty()) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        String formatIdentifier = servlet.getCorpusConfig(corpus).getCorpusDataFormat();
        Optional<XslTransformer> articleStylesheet = servlet.getStylesheet(corpus, formatIdentifier);
        Optional<XslTransformer> metadataStylesheet = servlet.getStylesheet(corpus, "meta");

        QueryServiceHandler articleContentRequest = new QueryServiceHandler(servlet.getWebserviceUrl(corpus) + "docs/" + pid + "/contents");
        QueryServiceHandler articleMetadataRequest = new QueryServiceHandler(servlet.getWebserviceUrl(corpus) + "docs/" + pid);

        // get parameter values
        String query = this.getParameter("query", "");
        String userId = MainServlet.getCorpusOwner(corpus);

        Map<String, String[]> contentRequestParameters = new HashMap<>();
        Map<String, String[]> metadataRequestParameters = new HashMap<>();

        if (query != null && !query.isEmpty()) {
            contentRequestParameters.put("patt", new String[] { query });
        }
        if (userId != null && !userId.isEmpty()) {
            contentRequestParameters.put("userid", new String[] { userId });
            metadataRequestParameters.put("userid", new String[] { userId });
        }

        // show max. 5000 (or as requested/configured) words of content (TODO: paging)
        // paging will also need edits in blacklab,
        // since when you only get a subset of the document without begin and ending, the top of the xml tree will be missing
        // and xslt will not match anything (or match the wrong elements)
        // so blacklab will have to walk the tree and insert those tags in some manner.
        contentRequestParameters.put("wordend", new String[] { Integer.toString(getWordsToShow()) });

        try {
            // NOTE: document not necessarily xml, though it might have some <hl/> tags injected to mark query hits
            String documentContents = articleContentRequest.makeRequest(contentRequestParameters);
            if (documentContents.contains("NOT_AUTHORIZED")) {
                context.put("article_content", "content restricted");
            } else {
                context.put("article_content",
                    articleStylesheet.map(t -> {  // probably xml, or we wouldn't have a stylesheet
                        t.clearParameters();
                        t.addParameter("contextRoot", servlet.getServletContext().getContextPath());
                        servlet.getWebsiteConfig(corpus).getXsltParameters().forEach(t::addParameter);

                        try {
                            return t.transform(documentContents);
                        } catch (TransformerException e) {
                            return null; // proceed to orElseGet
                        }
                    })
                    .orElseGet(() -> {
                        if (!XML_TAG_PATTERN.matcher(documentContents).find()) {
                            // not xml, just replace the inserted hl tags and pass on
                           return "<pre>" + StringUtils.replaceEach(documentContents,
                                                           new String[] {"<hl>", "</hl>"},
                                                           new String[] { "<span class=\"hl\">", "</span>"}) +
                           "</pre>";
                        }

                        // seems to contain at least one xml opening/self-closing tag, process using default xslt
                        try {
                            return defaultTransformer.transform(documentContents);
                        } catch (TransformerException e) {
                            // Document seems to be xml, but probably not valid, we tried...
                            return "Could not prepare document for viewing (it might be malformed xml) - " + e.getMessage();
                        }
                    })
                );
            }

            context.put("article_meta", metadataStylesheet
                .map(t -> {
                    try {
                        return t.transform(articleMetadataRequest.makeRequest(metadataRequestParameters));
                    } catch (TransformerException | IOException | QueryException e) {
                        return null;
                    }
                })
                .orElse("")
            );
        } catch (QueryException e) {
            if (e.getHttpStatusCode() == 404) {
                response.sendError(HttpServletResponse.SC_NOT_FOUND);
                return;
            }

            response.sendError(HttpServletResponse.SC_BAD_REQUEST, e.getMessage());
            return;
        }


        // display template
        displayHtmlTemplate(servlet.getTemplate("article"));
    }

    private int getWordsToShow() {
        int maxWordCount = servlet.getWordsToShow();

        int requestedWordCount = getParameter("wordend", maxWordCount);
        return Math.min(requestedWordCount, maxWordCount);
    }
}
