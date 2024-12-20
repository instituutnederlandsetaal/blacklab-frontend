package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;

import javax.servlet.http.HttpServletResponse;

import org.apache.commons.io.IOUtils;
import org.apache.commons.lang.StringUtils;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.MainServlet;
import nl.inl.corpuswebsite.utils.ArticleUtil;
import nl.inl.corpuswebsite.utils.CorpusConfig;
import nl.inl.corpuswebsite.utils.QueryException;
import nl.inl.corpuswebsite.utils.Result;

/**
 * We need a rudimentary API for some of the content that needs to processed serverside.
 * At the moment that's these 3 items:
 * - document metadata      /${corpus}/api/docs/${id}           - show the metadata for the document, transformed with the 'meta.xsl' stylesheet for the corpus.
 * - document contents      /${corpus}/api/docs/${id}/contents  - show the document's content, transformed with the appropriate 'article.xsl' stylesheet for the corpus.
 * - index metadata         /${corpus}/api/info                 - Return a json of the indexmetadata from BlackLab, but with annotation values listed.
 * <br>
 *  We needed an API because there's a chicken-and-egg situation when rendering a page for which a user would need to log in.
 *  To show the search page, we require the corpus metadata from BL, but to get it, we need user credentials, but to get those, the user needs a page to log in.
 *  So that doesn't work. Instead, split up page loading into two stages
 *  - initial setup, which renders a login button, etc.
 *  - population/hydration, which downloads the relevant info from this API, which now becomes possible, because the user has had the change to log in.
 */
public class ApiResponse extends BaseResponse {
    public ApiResponse() {
        super("api", true);
    }

    // TODO this could probably be cleaned up a little.
    @Override
    protected void completeRequest() throws QueryException {
        if (pathParameters.isEmpty()) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No endpoint specified");
        String operation = pathParameters.get(0);

        if (operation.equalsIgnoreCase("docs")) docs();
        else if (operation.equalsIgnoreCase("info")) indexMetadata();
        else if (operation.equalsIgnoreCase("help")) help();
        else if (operation.equalsIgnoreCase("about")) about();
        else throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint " + operation);
    }

    public void docs() throws QueryException {
        if (pathParameters.size() < 2) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No document specified. Expected ${corpus}/docs/${docId}[/contents]");
        String document = pathParameters.get(1);
        boolean isContents = pathParameters.size() > 2 && pathParameters.get(2).equalsIgnoreCase("contents");
        if (isContents) documentContents(document);
        else documentMetadata(document);
    }

    public void documentContents(String docId) throws QueryException {
        new ArticleUtil(servlet, request, response).getTransformedDocument(
            servlet.getWebsiteConfig(corpus),
            servlet.getCorpusConfig(corpus, request, response).mapError(QueryException::wrap).getOrThrow(),
            servlet.getGlobalConfig(),
            docId,
            Result.empty()
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void documentMetadata(String docId) throws QueryException {
        new ArticleUtil(servlet, request, response).getTransformedMetadata(
            servlet.getCorpusConfig(corpus, request, response).mapError(QueryException::wrap).getOrThrow(),
            servlet.getWebsiteConfig(corpus),
            servlet.getGlobalConfig(),
            docId
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void indexMetadata() {
        servlet.getCorpusConfig(corpus, request, response)
            .mapError(QueryException::wrap)
            .map(CorpusConfig::getJsonUnescaped)
            .tapSelf(r -> sendResult(r, "application/json; charset=utf-8"));
    }

    public void help() {
        Result.attempt(() -> servlet.getHelpPage(corpus))
                .mapWithErrorHandling(servlet::parseAsTemplate)
                .mapWithErrorHandling(template -> {
                    StringWriter writer = new StringWriter();
                    template.merge(model, writer);
                    return writer.toString();
                })
                .mapError(QueryException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void about() {
        Result.attempt(() -> servlet.getAboutPage(corpus))
                .mapWithErrorHandling(servlet::parseAsTemplate)
                .mapWithErrorHandling(template -> {
                    StringWriter writer = new StringWriter();
                    template.merge(model, writer);
                    return writer.toString();
                })
                .mapError(QueryException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    protected void sendResult(Result<String, QueryException> r, String contentType) {
        r.ifPresentOrElse(contents -> {
            try {
                response.setHeader("Content-Type", contentType);
                response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                response.getWriter().write(contents);
                response.flushBuffer();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }, error -> {
            try {
                response.setStatus(error.getHttpStatusCode());
                response.getWriter().print(error.getMessage());
                response.flushBuffer();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        });
    }






}
