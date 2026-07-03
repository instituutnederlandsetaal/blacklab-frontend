package nl.inl.corpuswebsite.response;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.commons.lang3.exception.ExceptionUtils;

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
import nl.inl.corpuswebsite.utils.HttpException;
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
    protected void completeRequest() throws HttpException {
        if (pathParameters.isEmpty()) throw new HttpException(HttpServletResponse.SC_NOT_FOUND, "No endpoint specified");
        String operation = pathParameters.get(0);
        if (operation.equalsIgnoreCase("docs")) docs();
        else if (operation.equalsIgnoreCase("info")) indexMetadata();
        else if (operation.equalsIgnoreCase("config")) siteConfig();
        else if (operation.equalsIgnoreCase("help")) help();
        else if (operation.equalsIgnoreCase("about")) about();
        else throw new HttpException(HttpServletResponse.SC_NOT_FOUND, "Unknown endpoint " + operation);
    }

     public void docs() throws HttpException {
        if (pathParameters.size() < 2) throw new HttpException(HttpServletResponse.SC_NOT_FOUND, "No document specified. Expected ${corpus}/docs/${docId}[/contents]");
        String document = pathParameters.get(1);
        boolean isContents = pathParameters.size() > 2 && pathParameters.get(2).equalsIgnoreCase("contents");
        if (isContents) documentContents(document);
        else documentMetadata(document);
    }

    public void documentContents(String docId) throws HttpException {
        if (this.corpus.isEmpty()) {
            sendResult(Result.error(new HttpException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified")), "text/html; charset=utf-8");
            return;
        }
        servlet.getCorpusConfig(corpus, request, response)
        .mapError(HttpException::wrap)
        .flatMap(corpusConfig -> new ArticleUtil(servlet, request, response).getTransformedDocument(
                servlet.getWebsiteConfig(corpus),
                corpusConfig,
                servlet.getGlobalConfig(),
                docId,
                Result.empty()
            )
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void documentMetadata(String docId) throws HttpException {
        if (this.corpus.isEmpty()) {
            sendResult(Result.error(new HttpException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified")), "text/html; charset=utf-8");
            return;
        }
        servlet.getCorpusConfig(corpus, request, response)
        .mapError(HttpException::wrap)
        .flatMap(corpusConfig -> new ArticleUtil(servlet, request, response).getTransformedMetadata(
                corpusConfig,
                servlet.getWebsiteConfig(corpus),
                servlet.getGlobalConfig(),
                docId
            )
        )
        .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void indexMetadata() throws HttpException {
        if (this.corpus.isEmpty()) throw new HttpException(HttpServletResponse.SC_BAD_REQUEST, "No corpus specified");

        servlet.getCorpusConfig(corpus, request, response)
            .mapError(HttpException::wrap)
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
            .mapError(HttpException::wrap)
            .tapSelf(r -> sendResult(r, "application/json; charset=utf-8"));
    }

    public void help() {
        Result.attempt(() -> servlet.getHelpPage(corpus))
                .mapWithErrorHandling(templateFile -> TemplateUtils.renderTemplateToString(templateFile, model))
                .mapError(HttpException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    public void about() {
        Result.attempt(() -> servlet.getAboutPage(corpus))
                .mapWithErrorHandling(templateFile -> TemplateUtils.renderTemplateToString(templateFile, model))
                .mapError(HttpException::wrap)
                .tapSelf(r -> sendResult(r, "text/html; charset=utf-8"));
    }

    protected void sendResult(Result<String, HttpException> r, String contentType) {
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
            sendApiError(error);
        });
    }

    private void sendApiError(HttpException error) {
        response.setStatus(error.getHttpStatusCode());
        response.setContentType("application/json; charset=utf-8");
        try {
            new ObjectMapper().writeValue(response.getWriter(), blackLabError(error));
        } catch (IOException e) {
            throw new ReturnToClientException(HttpServletResponse.SC_INTERNAL_SERVER_ERROR, e.getMessage());
        }
    }

    private Map<String, Object> blackLabError(HttpException error) {
        Map<String, Object> errorBody = new LinkedHashMap<>();
        errorBody.put("code", errorCode(error.getHttpStatusCode()));
        errorBody.put("message", error.getMessage());
        errorBody.put("stackTrace", ExceptionUtils.getStackTrace(error));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", errorBody);
        return body;
    }

    private String errorCode(int status) {
        return switch (status) {
            case HttpServletResponse.SC_BAD_REQUEST -> "BAD_REQUEST";
            case HttpServletResponse.SC_UNAUTHORIZED -> "UNAUTHORIZED";
            case HttpServletResponse.SC_FORBIDDEN -> "FORBIDDEN";
            case HttpServletResponse.SC_NOT_FOUND -> "NOT_FOUND";
            default -> "INTERNAL_ERROR";
        };
    }
}
