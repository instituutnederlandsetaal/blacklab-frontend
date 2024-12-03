package nl.inl.corpuswebsite.response;

import java.io.IOException;

import javax.servlet.http.HttpServletResponse;

import org.apache.commons.lang3.StringUtils;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.utils.ArticleUtil;
import nl.inl.corpuswebsite.utils.CorpusConfig;
import nl.inl.corpuswebsite.utils.GlobalConfig;
import nl.inl.corpuswebsite.utils.PaginationInfo;
import nl.inl.corpuswebsite.utils.QueryException;
import nl.inl.corpuswebsite.utils.Result;
import nl.inl.corpuswebsite.utils.ReturnToClientException;
import nl.inl.corpuswebsite.utils.WebsiteConfig;

public class ArticleResponse extends BaseResponse {

	private static class ArticleContentRestrictedException extends Exception {}

    public ArticleResponse() {
        super("article", true);
    }

    private String getDocPid() {
        if (pathParameters.size() != 1) {
            throw new ReturnToClientException(
                    HttpServletResponse.SC_BAD_REQUEST,
                    "Invalid document id format " + StringUtils.join(pathParameters, '/') + " - should just be a single string, with any contained slashes encoded."
            );
        }

        String pid = pathParameters.get(0);
        if (pid == null || pid.isEmpty()) {
            throw new ReturnToClientException(HttpServletResponse.SC_NOT_FOUND);
        }
        return pid;
    }

    @Override
    protected void completeRequest() throws IOException, QueryException {
        // parameters for the requesting of metadata and content from blacklab
        final String pid = getDocPid();

        CorpusConfig corpus = servlet.getCorpusConfig(this.corpus, this.request, this.response).mapError(IOException::new).getOrThrow();
        WebsiteConfig corpusConfig = servlet.getWebsiteConfig(this.corpus);
        GlobalConfig config = servlet.getGlobalConfig();

        ArticleUtil articleUtil = new ArticleUtil(servlet, request, response);
        Result<String, QueryException> metadata = articleUtil.getDocumentMetadata(corpusConfig, config, pid);
        PaginationInfo pagination = ArticleUtil.getPaginationInfo(corpusConfig, request, metadata);
        Result<String, QueryException> transformedMetadata = articleUtil.transformMetadata(corpus, corpusConfig, config, metadata);
        Result<String, Exception> transformedContent = articleUtil.getTransformedDocument(corpusConfig, corpus, config, pid, metadata)
            .mapError(QueryException.class, e -> {
                // This one should get a nice error message
                if (e.getHttpStatusCode() == 401) return new ArticleContentRestrictedException();
                // return the original error otherwise
                return e;
            });

        model.put("article_meta", transformedMetadata.getResult().orElse(""));
        model.put("article_meta_error", transformedMetadata.getError().orElse(null));
        model.put("article_content_restricted", transformedContent.getError().filter(e -> e instanceof ArticleContentRestrictedException).isPresent());
        model.put("article_content", transformedContent.getResult().orElse("An error occurred while retrieving the document contents"));
        model.put("article_content_error", transformedContent.getError().orElse(null));
        model.put("docId", pid);
        model.put("docLength", pagination.documentLength);
        model.put("pageSize", pagination.pageSize);
        model.put("pageStart", pagination.clientPageStart);
        model.put("pageEnd", pagination.clientPageEnd);
        request.getParameter("field");

        // override corpus display set in base response
        // Only do this if the corpus defines a displayName and search.xml does not
        if (corpusConfig.displayNameIsFallback()) {
            corpus.getDisplayName().ifPresent(displayName -> {
                model.put("displayName", displayName);
                model.put("displayNameIsFallback", false);
            });
        }

        displayHtmlTemplate(servlet.getTemplate("article"));
    }
}
