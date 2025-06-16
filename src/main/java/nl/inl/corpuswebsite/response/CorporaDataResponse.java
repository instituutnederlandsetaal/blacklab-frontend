package nl.inl.corpuswebsite.response;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Optional;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import nl.inl.corpuswebsite.BaseResponse;
import nl.inl.corpuswebsite.MainServlet;

public class CorporaDataResponse extends BaseResponse {

    public CorporaDataResponse() {
        super("data", false); // allow getting static files without corpus, this normally never happens, but we clear the corpus for /default/ static files
    }

    @Override
    public void init(HttpServletRequest request, HttpServletResponse response, MainServlet servlet, Optional<String> corpus, List<String> pathParameters)
        throws ServletException {

        // Don't call super(), we don't always have a corpus to work with, and even if we do, it's not guaranteed to be valid
        // (since we will retrieve the default fallback files in that case, and the BaseResponse is supposed to use a valid corpus)

        this.request = request;
        this.response = response;
        this.servlet = servlet;
        this.corpus = corpus;
        this.pathParameters = pathParameters;
    }

    @Override
    protected void completeRequest() throws IOException {
        try {
            // NOTE: the corpus-specific directory can be used to store both internal and external files.
            // Internal files should be located in the root directory for the corpus interface-data directory
            // while external files (those available through the browser) should be located in the 'static' subdirectory.
            // This is why we begin with the 'static' directory
            Path path = Paths.get("./static");
            for (String s : pathParameters) {
                path = path.resolve(s);
            }

            String pathString = path.toString();
            Optional<File> file = servlet.getProjectFile(corpus, pathString);

            if (!file.isPresent() || !file.get().isFile()) {
                response.setStatus(404);
                return;
            }

            String mime = servlet.getServletContext().getMimeType(pathString);
            response.setHeader("Cache-Control", "public, max-age=604800" /* 7 days */);
            response.setHeader("Content-Length", Long.toString(file.get().length()));
            response.setContentType(mime);
            Files.copy(file.get().toPath(), response.getOutputStream());
        } catch (InvalidPathException e1) { // runtimeException from Path.resolve; when weird paths are being requested
            response.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
    }
}
