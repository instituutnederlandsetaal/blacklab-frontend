package nl.inl.corpuswebsite.response;

import java.io.IOException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;

import jakarta.servlet.http.HttpServletResponse;
import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.config.CorpusConfig;
import nl.inl.corpuswebsite.config.WebsiteConfig;
import nl.inl.corpuswebsite.http.HttpResourceResponder;
import nl.inl.corpuswebsite.http.HttpResourceType;
import nl.inl.corpuswebsite.http.InMemoryHttpResource;
import nl.inl.corpuswebsite.utils.ArticleUtil;
import nl.inl.corpuswebsite.utils.QueryException;
import nl.inl.corpuswebsite.utils.Result;
import nl.inl.corpuswebsite.utils.ReturnToClientException;
import nl.inl.corpuswebsite.velocity.TemplateUtils;

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
        super("api", false);
    }

    @Override
    protected void completeRequest() throws QueryException {
        if (pathParameters.isEmpty()) throw new QueryException(HttpServletResponse.SC_NOT_FOUND, "No endpoint specified");
        String operation = pathParameters.get(0);
        if (operation.equalsIgnoreCase("docs")) docs();
        else if (operation.equalsIgnoreCase("info")) indexMetadata();
        else if (operation.equalsIgnoreCase("config")) siteConfig();
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
        if (this.corpus.isEmpty()) throw new QueryException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");
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
        if (this.corpus.isEmpty()) throw new QueryException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");
        new ArticleUtil(servlet, request, response).getTransformedMetadata(
            servlet.getCorpusConfig(corpus, request, response).mapError(QueryException::wrap).getOrThrow(),
            servlet.getWebsiteConfig(corpus),
            servlet.getGlobalConfig(),
            docId
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void indexMetadata() {
        if (this.corpus.isEmpty()) throw new QueryException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");

        servlet.getCorpusConfig(corpus, request, response)
            .mapError(QueryException::wrap)
            .map(CorpusConfig::getJsonUnescaped)
            .tapSelf(r -> sendResult(r, "application/json; charset=utf-8"));
    }

    public void siteConfig() {
        Result.success(servlet.getWebsiteConfig(corpus))
            .map(WebsiteConfig.WebsiteConfigJson::new)
            .mapWithErrorHandling(config -> {
                ObjectMapper mapper = new ObjectMapper();
                mapper.enable(SerializationFeature.INDENT_OUTPUT);
                return mapper.writeValueAsString(config);
            })
            .mapError(QueryException::wrap)
            .tapSelf(r -> sendResult(r, "application/json; charset=utf-8"));
    }

    public void help() {
        Result.attempt(() -> servlet.getHelpPage(corpus))
                .mapWithErrorHandling(templateFile -> TemplateUtils.renderTemplateToString(templateFile, model))
                .mapError(QueryException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void about() {
        Result.attempt(() -> servlet.getAboutPage(corpus))
                .mapWithErrorHandling(templateFile -> TemplateUtils.renderTemplateToString(templateFile, model))
                .mapError(QueryException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    protected void sendResult(Result<String, QueryException> r, String contentType) {
        r.tap(contents -> {
            boolean isPublic = servlet.useCache(request);
            HttpResourceType resourceType = isPublic ? HttpResourceType.API_PUBLIC : HttpResourceType.API_PRIVATE;
            InMemoryHttpResource resource = InMemoryHttpResource.fromString(contents, resourceType, System.currentTimeMillis());
            try {
                HttpResourceResponder.serve(request, response, resource, contentType);
            } catch (IOException e) {
                throw new ReturnToClientException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
            }
        }).tapError(error -> {
            throw ReturnToClientException.wrap(error);
        });
    }
}
